// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 记忆服务。
 *
 * 边界很清楚：**memory 只负责存与取，不判断"该不该记"**。
 * 记什么、注入多少，由 dialogue / persona / worldbook 决定。
 */

import { planFactWrite } from './dedupe.js'
import { recall } from './recall.js'
import type { RecalledFact } from './recall.js'
import { createMemoryStore } from './store.js'
import type { MemoryStore } from './store.js'
import { DEFAULT_DECAY_TIER, EXTRACT_DELAY_MS } from './types.js'
import type { DecayTier, MemoryFact, MemoryRaw } from './types.js'

export const MEMORY_SERVICE_KEY = 'nt-dpet:memory'

/** 单次提炼最多消化多少条原文。与 M0.4.1 的提炼器上限一致。 */
const EXTRACT_BATCH = 20

/**
 * 「全局一轮」在定时器表里的键。
 *
 * 会话键的格式是 `c2c:x` / `group:x`（ARCHITECTURE §5.1），不可能是空串，
 * 所以空串可以安全地当哨兵，不必额外用一个 Symbol 去判断。
 */
const ALL_SESSIONS = ''

/**
 * 提炼器：给定一批原文，产出一批事实。由上层注入（需要 llm）。
 *
 * 约定：提炼器**自己吞掉模型错误**（对外不抛）。真抛了服务也会兜住，
 * 但那样服务只能整轮放弃、不知道是哪个会话坏了，失败会话的原文就分不出来。
 */
export type FactExtractor = (raw: MemoryRaw[]) => Promise<Omit<MemoryFact, 'id' | 'createdAt'>[]>

/** 服务的可选参数。 */
export interface MemoryServiceOptions {
  /**
   * 异步提炼延迟，默认 5 秒（决策 22：先回用户，再消化）。
   *
   * 留出这个口子只为一件事：单测要真的等一次调度，5 秒×N 个用例太慢。
   * 生产代码不要传它。
   */
  extractDelayMs?: number
}

export interface MemoryService {
  /** 写一轮对话（用户一句 + 她一句），同步落原文层 */
  appendTurn(input: {
    sessionKey: string
    speakerId: string | null
    userText: string
    assistantText: string
    at?: number
  }): Promise<void>
  /**
   * 直接写一条事实（提炼器或用户手动编辑都走这里）。
   *
   * 写入经过去重裁决：同会话同「主语+谓词+宾语」已有生效事实时，
   * 只留重要度高的一条生效，其余标 `supersededBy`；用户手改过的永不被覆盖。
   * 返回值是**实际入库的那一行**，它可能生下来就是失效行
   * （本次判断输给了库里已有的旧事实，`supersededBy` 指向胜者）。
   */
  addFact(fact: Omit<MemoryFact, 'id' | 'createdAt'> & { at?: number }): Promise<MemoryFact>
  /** 三层裁决检索 */
  recall(sessionKey: string, query: string, topK?: number): Promise<RecalledFact[]>
  /** 最近原文，供上下文拼装 */
  recent(sessionKey: string, limit?: number): Promise<MemoryRaw[]>
  /** 注入提炼器；不注入则原文只累积不提炼 */
  setExtractor(extractor: FactExtractor | null): void
  /** 手动触发一次提炼（调试用） */
  extractNow(): Promise<number>
  /**
   * 由提炼器上报「这个会话这批没提炼成」。
   *
   * 存在的理由：提炼器自己不抛错（会把调度器带崩），但「吞了」不等于
   * 「可以当成功」。这条消息让服务知道该会话的原文**不能**标记为已提炼，
   * 否则一次模型抖动，那段原文就再也不会被取到，等于静默丢记忆。
   *
   * 不重试、不回溯：下轮调度自然会再取到这批原文（失败即没标记）。
   */
  reportExtractFailure(sessionKey: string, reason: string): void
  /** 切换衰减档位 */
  setDecayTier(tier: DecayTier): void
  dispose(): void
}

let seq = 0
function nextId(prefix: string, at: number): string {
  seq += 1
  return `${prefix}_${at.toString(36)}_${seq.toString(36)}`
}

export interface MemoryServiceHandle {
  service: MemoryService
  dispose(): void
}

export function createMemoryService(
  store: MemoryStore = createMemoryStore(),
  options: MemoryServiceOptions = {},
): MemoryServiceHandle {
  const delayMs = options.extractDelayMs ?? EXTRACT_DELAY_MS
  let tier: DecayTier = DEFAULT_DECAY_TIER
  let extractor: FactExtractor | null = null
  let disposed = false

  /** 每个会话一个定时器：同会话连发多轮只跑一次，跨会话互不顶掉。 */
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  /** 提炼是串行的：模型调用并发上去只会把上游打满，还让失败归因变糊。 */
  let running = false
  /** 跑提炼途中又来了新轮次：记一笔，等这一轮收尾后再排一次。 */
  let pendingAgain = false
  /** 本轮提炼中失败的会话 → 原因。每轮开始清空。 */
  let failed = new Map<string, string>()

  function warn(message: string): void {
    process.emitWarning(message, 'NtDpetMemory')
  }

  /**
   * 唯一的事实写入口：所有事实（提炼出来的、用户手改的）都从这里进库。
   *
   * 写入前先跟库里同键的有效事实比一场（M0.4.3）：
   *   - 没撞上 → 直接写
   *   - 撞上了 → 留重要度高的那条生效，其余打 `supersededBy`；
   *     用户手改过的那条不受重要度影响，永远不被覆盖（决策 24）
   * 返回真正入库的那一行：它可能生下来就带 `supersededBy`（本次判断输给了旧事实）。
   */
  async function writeFact(
    input: Omit<MemoryFact, 'id' | 'createdAt'>,
    at: number,
  ): Promise<MemoryFact> {
    const candidate: MemoryFact = { ...input, id: nextId('fact', at), createdAt: at }
    const existing = await store.listFacts(candidate.sessionKey)
    const plan = planFactWrite(existing, candidate)

    for (const old of plan.supersede) {
      await store.updateFact({ ...old, supersededBy: plan.winnerId })
    }
    await store.appendFact(plan.fact)
    return plan.fact
  }

  /**
   * 提炼一批原文。
   *
   * `sessionKey` 为 null 表示「全局取一批」（手动触发、或首次挂载时清积压）。
   */
  async function runOne(sessionKey: string | null): Promise<number> {
    if (!extractor) return 0

    const pending = sessionKey === null
      ? await store.listUnextracted(EXTRACT_BATCH)
      : await store.listUnextractedBySession(sessionKey, EXTRACT_BATCH)
    if (pending.length === 0) return 0

    failed = new Map()
    let drafts: Omit<MemoryFact, 'id' | 'createdAt'>[]
    try {
      drafts = await extractor(pending)
    } catch (err) {
      // 提炼器本该自己吞错。真漏出来也不能让定时器炸出去——
      // 那就成了一条记忆没提炼上，整个进程收到未捕获异常。
      warn(`提炼器抛出异常，本轮放弃：${(err as Error).message}`)
      return 0
    }

    const at = Date.now()
    let superseded = 0
    for (const d of drafts) {
      const written = await writeFact(d, at)
      if (written.supersededBy !== null) superseded += 1
    }
    if (superseded > 0) {
      warn(`本轮 ${superseded} 条事实与库中已有记录重复，已标记取代`)
    }

    // 只标记成功的那些：失败会话的原文留着，下轮调度还会取到它。
    // 反过来（无条件全标）意味着一次模型抖动就把那段原文永久判死。
    const succeeded = pending.filter((r) => !failed.has(r.sessionKey))
    if (succeeded.length > 0) {
      await store.markExtracted(succeeded.map((r) => r.id))
    }
    if (failed.size > 0) {
      warn(`${failed.size} 个会话本轮未提炼成功，原文保留待下轮`)
    }

    return drafts.length
  }

  async function runExtract(sessionKey?: string): Promise<number> {
    if (!extractor) return 0
    if (running) {
      // 已经在跑：不并发进第二个模型调用，改为收尾后补一轮
      pendingAgain = true
      return 0
    }

    running = true
    try {
      return await runOne(sessionKey ?? null)
    } catch (err) {
      // 存储层出错（磁盘满、库损坏）同样不能炸出去
      warn(`提炼流程异常：${(err as Error).message}`)
      return 0
    } finally {
      running = false
      if (pendingAgain && !disposed) {
        pendingAgain = false
        scheduleExtract()
      }
    }
  }

  function scheduleExtract(sessionKey?: string): void {
    if (disposed || !extractor) return
    const key = sessionKey ?? ALL_SESSIONS
    const current = timers.get(key)
    if (current) clearTimeout(current)
    // 异步提炼是硬要求：先回用户，再消化（决策 22）
    const timer = setTimeout(() => {
      timers.delete(key)
      void runExtract(sessionKey)
    }, delayMs)
    timer.unref?.()
    timers.set(key, timer)
  }

  const service: MemoryService = {
    async appendTurn({ sessionKey, speakerId, userText, assistantText, at = Date.now() }) {
      if (userText) {
        await store.appendRaw({
          id: nextId('raw', at), sessionKey, speakerId,
          role: 'user', content: userText, createdAt: at, extracted: false,
        })
      }
      if (assistantText) {
        await store.appendRaw({
          id: nextId('raw', at + 1), sessionKey, speakerId: null,
          role: 'assistant', content: assistantText, createdAt: at + 1, extracted: false,
        })
      }
      scheduleExtract(sessionKey)
    },

    async addFact(input) {
      const { at: givenAt, ...fields } = input
      // 手改走同一条去重通道：`manuallyEdited` 为真的新事实在裁决里直接胜出，
      // 不会被「模型上次给的分数更高」顶回去（决策 24）。
      return writeFact(fields, givenAt ?? Date.now())
    },

    async recall(sessionKey, query, topK = 8) {
      const facts = await store.listFacts(sessionKey)
      return recall(facts, { query, now: Date.now(), tier, topK })
    },

    async recent(sessionKey, limit = 20) {
      return store.listRaw(sessionKey, limit)
    },

    setExtractor(fn) {
      extractor = fn
      // 挂上提炼器时补一次全局轮：进程刚起来时原文层可能已有积压，
      // 不补就要等到下一次有人说话才消化。
      if (fn) scheduleExtract()
    },

    async extractNow() {
      return runExtract()
    },

    reportExtractFailure(sessionKey, reason) {
      failed.set(sessionKey, reason)
    },

    setDecayTier(next) {
      tier = next
    },

    dispose() {
      disposed = true
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    },
  }

  return { service, dispose: service.dispose }
}
