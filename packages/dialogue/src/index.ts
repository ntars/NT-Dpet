/**
 * @nt-dpet/dialogue — 轻量对话通道（不走 agent loop、不建 Session、提示词组装）
 *
 * 设计依据：docs/ARCHITECTURE.md §2.2（决策 13）
 *           docs/TECH-RESEARCH.md §5.10（实测流形状与 inject 硬约束）
 * 决策依据：决策 13（日常对话不走 agent loop）
 *
 * 隐私约束（最重要的一条）：本包**绝不**创建 DSH Session、**绝不**写
 * `dsh_session_log`。实测已确认不建 Session 也能正常拿到模型回复
 * （§5.10），所以这条约束不需要用功能换。
 */

import type { Context } from '@deepseek-ai/cordis'
import { DIALOGUE_SERVICE_KEY, createDialogueService } from './service.js'

export { DIALOGUE_SERVICE_KEY, DEFAULT_PROVIDER } from './service.js'
export type { DialogueOptions, DialogueResult, DialogueService, DialogueTurn } from './types.js'
export type { ChatMessage, ContentBlock, Update } from './protocol.js'

export const name = 'nt-dpet-dialogue'

/** 本包提供的服务名，供 UI / router 等 inject 使用。 */
export const provide = DIALOGUE_SERVICE_KEY

/**
 * 依赖 llm 服务（`dsh-llm` + 至少一个 provider 适配器）。
 * 不写 inject 的话，读 `ctx.llm` 会抛 `cannot get property "llm" without inject`，
 * 且整个插件不激活——实测踩过，见 `TECH-RESEARCH.md` §5.10.2。
 */
export const inject = ['llm']

export function apply(ctx: Context): () => void {
  const service = createDialogueService(ctx)
  ctx.provide(DIALOGUE_SERVICE_KEY, service)
  // 本包没有自有资源需要清理，返回空 disposer 保持接口统一
  return () => {}
}
