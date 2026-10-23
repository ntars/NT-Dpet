/**
 * 更新目标：一次往对话里新增的内容。
 *
 * dialogue 是「轻量对话通道」：单轮输入 → 单轮流式输出，
 * 不走 agent loop、不建 Session、不发工具调用。
 */

import type { ChatMessage, Update } from './protocol.js'

export interface DialogueTurn {
  /** 提示词（persona + worldbook 拼装产物），一条 system 消息 */
  system: string
  /** 历史（谁 compact、怎么压缩，是 memory 的事，dialogue 只管发） */
  history: ChatMessage[]
  /** 这一句用户输入 */
  input: string
}

/** 一次对话请求的可选参数，全部有默认值。 */
export interface DialogueOptions {
  /** llm 路由名，对应 patch 里的 providers.<key>。默认 'magpie' */
  provider?: string
  /** 模型 id，如 group/ntars */
  model: string
  /** 输出上限 token。到达即截断，reasoning token 也计入 */
  maxTokens: number
  /** 只保留正文。reasoning 块在回调前就被过滤，不给调用方看到 */
  reasoning: 'off' | 'low' | 'high'
  /** 中断信号。用户关掉聊天窗时应该能立刻停下 */
  signal?: AbortSignal
}

export interface DialogueResult {
  /** 拼好的正文（reasoning 已滤除） */
  text: string
  /** 停止原因：正常结束 / 被调用方中断 / 出错 / 输出超限 */
  stopReason: 'stop' | 'aborted' | 'error' | 'length'
  /** token 用量，报错时可能没有 */
  usage?: { inputTokens: number; outputTokens: number }
}

export interface DialogueService {
  /** 一次对话。流式推进，onUpdate 每有新内容就调一次。 */
  chat(
    turn: DialogueTurn,
    options: DialogueOptions,
    onUpdate: (u: Update) => void,
  ): Promise<DialogueResult>
}
