/**
 * 对话服务实现。
 *
 * 里面认识的分片形状是**实测出来的**（`TECH-RESEARCH.md` §5.10.1），不是照文档猜的：
 *
 *   block-start(reasoning) → reasoning-delta… → block-start(text)
 *     → text-delta… → block-end(reasoning) → block-end(text)
 *     → usage → finish{ reason: { kind: "stop" } }
 *
 * 注意正文字段叫 `text`，不是 `delta`——第一版探针按 `delta` 取，
 * 拿到的永远是空字符串。这个坑记在 §5.10.1。
 *
 * 铁律（决策 13 + 隐私约束）：
 *   - 不建 Session、不写 memory。记忆是 memory 包的事，本包只管对话本身
 *   - 不走 agent loop。就是一次「发出去、收回来」的轻量通道
 */

import type { Context } from '@deepseek-ai/cordis'
import { toStreamMessages } from './protocol.js'
import type { Update } from './protocol.js'
import type { LlmChunk } from './llm-types.js'
import type { DialogueOptions, DialogueResult, DialogueService, DialogueTurn } from './types.js'

export const DIALOGUE_SERVICE_KEY = 'nt-dpet:dialogue'

/** 默认 llm 路由名，对应 patch 里 providers.<key>。 */
export const DEFAULT_PROVIDER = 'magpie'


/** 把 llm 的终止原因映射成我们协议里的四种。 */
function mapStopReason(
  chunk: LlmChunk | null,
  sawFailure: boolean,
): DialogueResult['stopReason'] {
  if (sawFailure) return 'error'
  const kind = chunk?.reason?.kind
  if (kind === 'aborted') return 'aborted'
  if (kind === 'max-token' || kind === 'length') return 'length'
  return 'stop'
}

class DialogueServiceImpl implements DialogueService {
  /** cordis 上下文：只用来取 llm 服务，不用于任何 Session 操作。 */
  readonly #ctx: Context

  constructor(ctx: Context) {
    this.#ctx = ctx
  }

  async chat(
    turn: DialogueTurn,
    options: DialogueOptions,
    onUpdate: (u: Update) => void,
  ): Promise<DialogueResult> {
    const messages = toStreamMessages(turn)

    let text = ''
    let usage: DialogueResult['usage']
    let finishChunk: LlmChunk | null = null
    let sawFailure = false

    try {
      const stream = this.#ctx.llm.stream({
        provider: options.provider ?? DEFAULT_PROVIDER,
        model: options.model,
        maxTokens: options.maxTokens,
        signal: options.signal,
        messages,
      })

      for await (const raw of stream) {
        const chunk = raw as LlmChunk
        switch (chunk.type) {
          case 'text-delta': {
            const delta = chunk.text ?? ''
            if (delta) {
              text += delta
              onUpdate({ kind: 'text-delta', delta })
            }
            break
          }
          case 'usage': {
            if (chunk.usage) {
              usage = chunk.usage
              onUpdate({ kind: 'usage', usage: chunk.usage })
            }
            break
          }
          case 'finish': {
            finishChunk = chunk
            if (chunk.failure) sawFailure = true
            break
          }
          default:
            // reasoning-delta / block-start / block-end：不向调用方透出。
            // 未知类型也不抛错——上游加新分片不该弄崩对话。
            break
        }
      }
    } catch (err) {
      // 用户关窗导致的中断不是故障，要和真正的失败区分开
      const isAbort = (err as { name?: string } | null)?.name === 'AbortError'
      onUpdate({ kind: 'done' })
      return { text, stopReason: isAbort ? 'aborted' : 'error', usage }
    }

    onUpdate({ kind: 'done' })
    return { text, stopReason: mapStopReason(finishChunk, sawFailure), usage }
  }
}

export function createDialogueService(ctx: Context): DialogueService {
  return new DialogueServiceImpl(ctx)
}

export type { ChatMessage, ContentBlock, Update } from './protocol.js'
export type { DialogueOptions, DialogueResult, DialogueService, DialogueTurn } from './types.js'
