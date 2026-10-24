// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 记忆提炼器：把一批原文交给模型，换成一句话事实。
 *
 * 设计依据：docs/ARCHITECTURE.md §6、决策 22（双层记忆 + 异步提炼）
 *
 * 三条边界：
 *   1. **只提炼，不判断该不该记**。记多少、什么时候注入，是 dialogue 的事。
 *   2. **失败即丢弃**。模型吐的 JSON 不合法就整批作废、记日志、等下一轮，
 *      绝不猜、不做半截修补——写坏的记忆比没有记忆更糟。
 *   3. **一次调用一份输入**。单次最多 20 条、总字数最多 3000，超了就截断，
 *      不拆成多次调用（拆开会让同一件事被两个视角重复提炼，反而更难去重）。
 *
 * 关于 `llm` 的类型：本包只用到 `stream()` 和 `text-delta` 分片这一小块，
 * 所以自己声明最小形状，不去依赖 `@deepseek-ai/dsh-llm` 的包（npm 上的
 * 版本与宿主实跑版本对不上，装错版本等于假类型安全感，见 dialogue/src/llm-types.ts）。
 * 也不做 `declare module` 全局增强，免得和 dialogue 的同名增强撞车。
 */

import type { MemoryFact, MemoryRaw } from './types.js'

/** 单次提炼最多送多少条原文。 */
export const EXTRACT_MAX_RAW = 20

/** 单次提炼的原文总字数上限。 */
export const EXTRACT_MAX_CHARS = 3000

/** 默认 llm 路由名，与 dialogue 的默认值保持一致。 */
export const EXTRACT_DEFAULT_PROVIDER = 'magpie'

/** 提炼产出的字段，除去由存储层分配的 id 与时间。 */
export type FactDraft = Omit<MemoryFact, 'id' | 'createdAt'>

/** 流分片里本包关心的字段；其余字段一律忽略。 */
export interface ExtractorChunk {
  type: string
  text?: string
  failure?: { code?: string }
  reason?: { kind?: string }
}

/** 一条发给模型的消息。 */
export interface ExtractorMessage {
  role: 'system' | 'user' | 'assistant'
  content: Array<{ type: 'text'; text: string }>
}

/** 一次流式请求的参数。 */
export interface ExtractorStreamOptions {
  provider: string
  model: string
  maxTokens?: number
  signal?: AbortSignal
  messages: ExtractorMessage[]
}

/** 本包依赖的 llm 服务最小形状。 */
export interface ExtractorLlm {
  stream(options: ExtractorStreamOptions): AsyncIterable<ExtractorChunk>
}

export interface ExtractorOptions {
  provider?: string
  model?: string
  maxTokens?: number
  signal?: AbortSignal
  /** 覆盖单次条数上限，主要给测试用。 */
  maxRaw?: number
  /** 覆盖单次字数上限，主要给测试用。 */
  maxChars?: number
  /** 日志出口；默认走 process.emitWarning，便于在不依赖上下文的场景使用。 */
  log?: (message: string) => void
  /**
   * 某个会话提炼失败时回调。
   *
   * 存在的理由：提炼器自己吞掉错误（对外不抛，免得把调度器带崩），
   * 但「吞了」不等于「可以当成成功」。存储层拿这个消息才知道哪些会话
   * 这批没提炼成，从而不把它们标成已提炼——否则一次模型抖动，
   * 那段原文就永远不再被提炼，等于静默丢记忆。
   */
  onSessionFail?: (sessionKey: string, reason: string) => void
}

function defaultLog(message: string): void {
  process.emitWarning(message, 'NtDpetMemoryExtractor')
}

/**
 * 按「条数 → 字数」两级截断。
 *
 * 顺序不能反：先把条数收到 20 条，再按字数裁，否则一堆短句会把额度占满，
 * 反而是长句被整条丢掉。字数裁到某条不够时截断该条内容而不是丢弃它——
 * 半句话也能提炼出谓词，整条丢了就什么都没了。
 */
export function truncateRaw(
  raws: MemoryRaw[],
  maxRaw = EXTRACT_MAX_RAW,
  maxChars = EXTRACT_MAX_CHARS,
): MemoryRaw[] {
  const kept: MemoryRaw[] = []
  let budget = Math.max(0, maxChars)

  for (const raw of raws.slice(0, Math.max(0, maxRaw))) {
    const text = raw.content ?? ''
    if (budget <= 0) break
    if (text.length <= budget) {
      kept.push(raw)
      budget -= text.length
      continue
    }
    // 只剩零头：截断这一条，然后收工
    kept.push({ ...raw, content: text.slice(0, budget) })
    budget = 0
    break
  }

  return kept
}

/** 把一批原文渲染成提示词里的对话段。 */
function renderTranscript(raws: MemoryRaw[]): string {
  return raws
    .map((raw, index) => {
      const who = raw.role === 'assistant' ? '她' : `用户(${raw.speakerId ?? '未知'})`
      return `[${index + 1}] ${who}：${raw.content}`
    })
    .join('\n')
}

/** 提炼提示词。字段名与任务约定严格一致，不多加一个字段。 */
const SYSTEM_PROMPT = [
  '你是记忆提炼器。从下面的对话原文里提炼出「长期有效、以后还用得上」的事实。',
  '只输出一个 JSON 数组，不要解释、不要 Markdown 代码块、不要注释。',
  '数组每个元素的字段：',
  '- predicate：谓词，表示关系或动作，如「喜欢」「住在」「在做」',
  '- object：宾语，具体内容，越具体越好',
  '- confidence：0 到 1 的小数，你对这条事实有多确定',
  '- importance：0 到 1 的小数，这条事实有多重要',
  '- subjectId：事实主语的参与者 id；不指向具体某个人时填 null',
  '规则：',
  '1. 只记以后还用得上的：喜好、身份、关系、习惯、计划、待办、约定、身体状况、明确说过的事实。',
  '2. 用户提到「明天 / 下周 / 等下」要做的事、要去的地方、要见的人，一律要记。这类时效信息恰恰最该被记住，不要因为「只在这几天有效」就丢掉。',
  '3. 不记寒暄、客套、一时的情绪（如「今天有点累」「心情不好」）、只在这一句话里成立的内容。',
  '4. 一条只表达一件事，能拆就拆。',
  '5. 没有可提炼的内容就输出 []。',
].join('\n')

/**
 * 构造一份完整的提示词。
 *
 * 只给 user 一条消息（系统提示 + 原文放在同一条里）：提炼是一次性任务，
 * 不需要多轮，也不必占用 system 槽位——宿主不同 provider 对 system 的
 * 处理并不完全一致，少一个变量少一处坑。
 */
export function buildExtractMessages(raws: MemoryRaw[]): ExtractorMessage[] {
  const transcript = renderTranscript(raws)
  return [
    {
      role: 'user',
      content: [{ type: 'text', text: `${SYSTEM_PROMPT}\n\n对话原文：\n${transcript}` }],
    },
  ]
}

/** 解析失败时抛这个，调用方据此区分「模型没说话」与「模型说错了」。 */
export class ExtractParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExtractParseError'
  }
}

/**
 * 从模型正文里抠出 JSON 数组。
 *
 * 依次尝试：原文直解 → 去掉 ``` 围栏 → 取第一个 `[` 到最后一个 `]`。
 * 这三步能覆盖实测里绝大多数模型走样：包了围栏、前面加一句「好的」、
 * 后面补一句「以上」。都不行才算失败。
 */
function extractJsonText(text: string): string {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/)
  if (fence?.[1]) return fence[1].trim()
  // 没闭合的围栏：砍掉开头那行 ```
  const openFence = trimmed.match(/```(?:json|JSON)?\s*\n?([\s\S]*)$/)
  if (openFence?.[1]) return openFence[1].trim()
  return trimmed
}

/**
 * 把模型给的分数收进 0..1；给不出合法数字就用中性值。
 *
 * 只认真正的数字和能解析的数字字符串。`null`、`undefined`、空串、布尔都要
 * 当成「没给」——`Number(null)` 是 0，直接转会把漏填字段误判成「一点都不重要」，
 * 那条事实在检索加权里就永远排不上去。
 */
function clampScore(value: unknown, fallback: number): number {
  let num: number
  if (typeof value === 'number') {
    num = value
  } else if (typeof value === 'string' && value.trim() !== '') {
    num = Number(value)
  } else {
    return fallback
  }
  if (!Number.isFinite(num)) return fallback
  if (num < 0) return 0
  if (num > 1) return 1
  return num
}

/** 从一段文字里读出 `{ predicate, object, ... }[]`，读不出就抛。 */
export function parseFacts(text: string, sessionKey: string): FactDraft[] {
  const candidates: string[] = []
  const trimmed = text.trim()
  if (trimmed) {
    candidates.push(trimmed)
    const unfenced = extractJsonText(trimmed)
    if (unfenced && unfenced !== trimmed) candidates.push(unfenced)
    const firstBracket = unfenced.indexOf('[')
    const lastBracket = unfenced.lastIndexOf(']')
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      const sliced = unfenced.slice(firstBracket, lastBracket + 1)
      if (!candidates.includes(sliced)) candidates.push(sliced)
    }
  }

  let parsed: unknown
  let lastError = '模型没有输出内容'
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate)
      lastError = ''
      break
    } catch (err) {
      lastError = (err as Error).message
    }
  }

  if (lastError) throw new ExtractParseError(`JSON 解析失败：${lastError}`)
  if (!Array.isArray(parsed)) throw new ExtractParseError('顶层不是数组')
  if (parsed.length === 0) return []

  const drafts: FactDraft[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const predicate = typeof row['predicate'] === 'string' ? row['predicate'].trim() : ''
    const object = typeof row['object'] === 'string' ? row['object'].trim() : ''
    // 谓词或宾语为空的事实没有检索价值，直接丢
    if (!predicate || !object) continue
    const subjectId =
      typeof row['subjectId'] === 'string' && row['subjectId'].trim()
        ? row['subjectId'].trim()
        : null

    drafts.push({
      sessionKey,
      subjectId,
      predicate,
      object,
      confidence: clampScore(row['confidence'], 0.6),
      importance: clampScore(row['importance'], 0.5),
      // 模型不要求输出原文引用，故不回填来源；留 null 好过瞎猜一条
      sourceRawId: null,
      supersededBy: null,
      manuallyEdited: false,
      deletedAt: null,
    })
  }

  return drafts
}

/** 按会话分组，保持首次出现的顺序。 */
function groupBySession(raws: MemoryRaw[]): MemoryRaw[][] {
  const groups = new Map<string, MemoryRaw[]>()
  for (const raw of raws) {
    const list = groups.get(raw.sessionKey)
    if (list) list.push(raw)
    else groups.set(raw.sessionKey, [raw])
  }
  return [...groups.values()]
}

/**
 * 造一个跑真实模型的提炼器。
 *
 * 为什么不塞进 `apply()` 里自动接上：M0.4.1 只负责「有提炼器可用」，
 * 挂到 dialogue 的对话链上是 M0.4.2 的事。这样 memory 包在没有任何
 * llm 的环境里照样能起、能存、能检索。
 */
export function createLlmExtractor(
  llm: ExtractorLlm,
  options: ExtractorOptions = {},
): (raws: MemoryRaw[]) => Promise<FactDraft[]> {
  const log = options.log ?? defaultLog
  const provider = options.provider ?? EXTRACT_DEFAULT_PROVIDER
  const model = options.model ?? ''
  const maxRaw = options.maxRaw ?? EXTRACT_MAX_RAW
  const maxChars = options.maxChars ?? EXTRACT_MAX_CHARS
  const onSessionFail = options.onSessionFail

  return async function extract(raws) {
    const batch = truncateRaw(raws, maxRaw, maxChars)
    if (batch.length === 0) return []

    const drafts: FactDraft[] = []
    // 一批里可能混着多个会话（store 是按未提炼全局取的），必须分开问，
    // 否则事实会被挂到错误的会话上，检索时就串台了。
    for (const group of groupBySession(batch)) {
      const sessionKey = group[0]?.sessionKey ?? ''
      const input = truncateRaw(group, maxRaw, maxChars)
      if (input.length === 0) continue

      let text = ''
      try {
        const stream = llm.stream({
          provider,
          model,
          maxTokens: options.maxTokens,
          signal: options.signal,
          messages: buildExtractMessages(input),
        })
        for await (const chunk of stream) {
          if (chunk.type === 'text-delta' && chunk.text) text += chunk.text
        }
      } catch (err) {
        log(`提炼调用失败，本次丢弃（会话 ${sessionKey}）：${(err as Error).message}`)
        onSessionFail?.(sessionKey, `调用失败：${(err as Error).message}`)
        continue
      }

      try {
        const parsed = parseFacts(text, sessionKey)
        if (parsed.length === 0) {
          log(`提炼结果为空（会话 ${sessionKey}），${input.length} 条原文无可用事实`)
        }
        drafts.push(...parsed)
      } catch (err) {
        // 解析失败整批作废：宁可这一轮什么都不记，也不写半条错的
        log(`提炼结果无法解析，本次丢弃（会话 ${sessionKey}）：${(err as Error).message}`)
        onSessionFail?.(sessionKey, `解析失败：${(err as Error).message}`)
      }
    }

    return drafts
  }
}

/**
 * 从 cordis 上下文里安全地取 llm 服务。
 *
 * 用 `ctx.get()` 而不是 `ctx.llm`：后者在未声明 `inject: ['llm']` 时直接抛
 * `cannot get property "llm" without inject`，而 memory 包不该因为宿主没挂
 * 模型就整套起不来。取不到就返回 null，调用方退回「只存不提炼」。
 */
export function resolveLlm(ctx: { get(name: string, strict?: boolean): unknown }): ExtractorLlm | null {
  try {
    const llm = ctx.get('llm', false)
    if (llm && typeof (llm as ExtractorLlm).stream === 'function') return llm as ExtractorLlm
  } catch {
    // 服务还没注册时会抛，按「暂时没有」处理
  }
  return null
}
