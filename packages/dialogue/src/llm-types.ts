/**
 * 对 `ctx.llm` 的最小结构化声明。
 *
 * 为什么不直接依赖 `@deepseek-ai/dsh-llm` 的类型：
 *   npm 上该包 latest 为 `0.0.1-rc.1`，而宿主实跑 `0.2.1-rc.2`（见 App 内
 *   `desktop-runtime.json`）。装旧版的类型会给出**假的类型安全感**——
 *   字段名对不上时编译器不会响。所以这里只声明本包真正用到的那一小块，
 *   形状以 `TECH-RESEARCH.md` §5.10.1 的实测分片为准。
 *
 * 将来若 `dsh-llm` 发布与宿主同版本的稳定类型包，可替换为官方类型。
 */

import type { ContentBlock, ChatRole } from './protocol.js'

/** 发给 llm 的一条消息。 */
export interface LlmMessage {
  role: ChatRole
  content: ContentBlock[]
}

/** 一次流式请求的参数，只列本包会传的字段。 */
export interface LlmStreamOptions {
  provider: string
  model: string
  maxTokens?: number
  signal?: AbortSignal
  messages: LlmMessage[]
}

/** 流分片：字段名来自实测，不是猜的。 */
export interface LlmChunk {
  type: string
  blockType?: string
  text?: string
  reason?: { kind?: string }
  failure?: { code?: string }
  usage?: { inputTokens: number; outputTokens: number }
}

/** 本包依赖的 llm 服务接口。 */
export interface LlmServiceLike {
  stream(options: LlmStreamOptions): AsyncIterable<LlmChunk>
  listProviders?(): string[]
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** `@deepseek-ai/dsh-llm` 提供的模型调用服务。使用前必须声明 `inject: ['llm']`。 */
    llm: LlmServiceLike
  }
}
