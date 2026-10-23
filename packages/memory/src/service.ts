// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 记忆服务。
 *
 * 边界很清楚：**memory 只负责存与取，不判断"该不该记"**。
 * 记什么、注入多少，由 dialogue / persona / worldbook 决定。
 */

import { recall } from './recall.js'
import type { RecalledFact } from './recall.js'
import { createMemoryStore } from './store.js'
import type { MemoryStore } from './store.js'
import { DEFAULT_DECAY_TIER, EXTRACT_DELAY_MS } from './types.js'
import type { DecayTier, MemoryFact, MemoryRaw } from './types.js'

export const MEMORY_SERVICE_KEY = 'nt-dpet:memory'

/** 提炼器：给定一批原文，产出一批事实。由上层注入（需要 llm）。 */
export type FactExtractor = (raw: MemoryRaw[]) => Promise<Omit<MemoryFact, 'id' | 'createdAt'>[]>

export interface MemoryService {
  /** 写一轮对话（用户一句 + 她一句），同步落原文层 */
  appendTurn(input: {
    sessionKey: string
    speakerId: string | null
    userText: string
    assistantText: string
    at?: number
  }): Promise<void>
  /** 直接写一条事实（提炼器或用户手动编辑都走这里） */
  addFact(fact: Omit<MemoryFact, 'id' | 'createdAt'> & { at?: number }): Promise<MemoryFact>
  /** 三层裁决检索 */
  recall(sessionKey: string, query: string, topK?: number): Promise<RecalledFact[]>
  /** 最近原文，供上下文拼装 */
  recent(sessionKey: string, limit?: number): Promise<MemoryRaw[]>
  /** 注入提炼器；不注入则原文只累积不提炼 */
  setExtractor(extractor: FactExtractor | null): void
  /** 手动触发一次提炼（调试用） */
  extractNow(): Promise<number>
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

export function createMemoryService(store: MemoryStore = createMemoryStore()): MemoryServiceHandle {
  let tier: DecayTier = DEFAULT_DECAY_TIER
  let extractor: FactExtractor | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  async function runExtract(): Promise<number> {
    if (!extractor) return 0
    const pending = await store.listUnextracted(20)
    if (pending.length === 0) return 0
    const at = Date.now()
    const drafts = await extractor(pending)
    for (const d of drafts) {
      await store.appendFact({ ...d, id: nextId('fact', at), createdAt: at })
    }
    await store.markExtracted(pending.map((r) => r.id))
    return drafts.length
  }

  function scheduleExtract(): void {
    if (disposed || !extractor) return
    if (timer) clearTimeout(timer)
    // 异步提炼是硬要求：先回用户，再消化（决策 22）
    timer = setTimeout(() => {
      timer = null
      void runExtract()
    }, EXTRACT_DELAY_MS)
    timer.unref?.()
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
      scheduleExtract()
    },

    async addFact(input) {
      const at = input.at ?? Date.now()
      const fact: MemoryFact = {
        id: nextId('fact', at),
        sessionKey: input.sessionKey,
        subjectId: input.subjectId,
        predicate: input.predicate,
        object: input.object,
        confidence: input.confidence,
        importance: input.importance,
        sourceRawId: input.sourceRawId,
        createdAt: at,
        supersededBy: input.supersededBy,
        manuallyEdited: input.manuallyEdited,
        deletedAt: input.deletedAt,
      }
      await store.appendFact(fact)
      return fact
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
      if (fn) scheduleExtract()
    },

    async extractNow() {
      return runExtract()
    },

    setDecayTier(next) {
      tier = next
    },

    dispose() {
      disposed = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },
  }

  return { service, dispose: service.dispose }
}
