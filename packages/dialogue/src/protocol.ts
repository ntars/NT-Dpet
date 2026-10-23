/**
 * 对话协议的值类型。durable：可以被存进 memory_raw，跨进程重建。
 *
 * content 用块数组而非字符串，是为了将来接图文混排时不改结构；
 * 现阶段只有 text 一种块。
 */

export interface TextBlock {
  type: 'text'
  text: string
}

export type ContentBlock = TextBlock

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: ContentBlock[]
}

/** 增量更新，回调给 UI 用来打字机效果。 */
export type Update =
  | { kind: 'text-delta'; delta: string }
  | { kind: 'usage'; usage: { inputTokens: number; outputTokens: number } }
  | { kind: 'done' }

/** 把一条历史压成 cordis llm.stream 需要的形状。 */
export function toStreamMessages(turn: {
  system: string
  history: ChatMessage[]
  input: string
}): Array<{ role: ChatRole; content: ContentBlock[] }> {
  const messages: Array<{ role: ChatRole; content: ContentBlock[] }> = []
  if (turn.system) {
    messages.push({ role: 'system', content: [{ type: 'text', text: turn.system }] })
  }
  messages.push(...turn.history)
  messages.push({ role: 'user', content: [{ type: 'text', text: turn.input }] })
  return messages
}
