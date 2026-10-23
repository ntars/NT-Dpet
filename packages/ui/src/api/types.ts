// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 接口层的最小类型契约。
 *
 * 为什么不直接 import 上游类型：`@deepseek-ai/dsh-host-webserver` 在 App 内
 * 不带 `.d.ts`（见 docs/TECH-RESEARCH.md §5.11.2），npm 包虽然带，但会把宿主
 * 版本钉死在编译期。这里只描述真正用到的成员，宿主小版本升级不会连带编译失败。
 */

/** 响应外层：成功带 data，失败带 error，两者互斥。 */
export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError }

export interface ApiError {
  code: ApiErrorCode
  message: string
}

/**
 * 错误码。
 *
 * 前三个是任务要求（UNAUTHORIZED / NOT_READY / INTERNAL）；
 * NOT_FOUND 与 METHOD_NOT_ALLOWED 是 HTTP 语义必需，否则「路径写错」会被
 * 误报成「功能没做好」，排查时容易走偏。
 *
 * BAD_REQUEST 专给「参数格式不对」用。不做静默兜底是有原因的：记忆按会话键
 * 分区，会话键写错却悄悄退回默认值，界面就会展示另一段会话的记忆——看起来
 * 一切正常，内容却是错的，这种错误没人能发现。
 */
export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'NOT_READY'
  | 'INTERNAL'

/**
 * `GET /api/ntdpet/mood` 的响应正文：实例全局的两维。
 *
 * 只给数值，不给「有点累但见到你心情好了些」这类句子。原因不是省事——
 * 情绪服务只产出数字，把它翻译成人话是界面的事（见 web/js/mood.js）。
 * 若在这里写死文案，换一种说法就得改后端再发版，而且后端会开始「编」状态。
 */
export interface MoodReading {
  /** 此刻心情，0..1 */
  mood: number
  /** 此刻精力，0..1 */
  energy: number
}

/** 一条原文记忆，对应 `GET /api/ntdpet/memory/recent` 返回的条目。 */
export interface MemoryEntry {
  /** 原文 id，用于界面去重与将来「点开看上下文」 */
  id: string
  /** `user` 是主人说的，`assistant` 是她说的 */
  role: 'user' | 'assistant'
  /** 原话，不截断：卡片里显示几行由 CSS 决定，数据层不做有损处理 */
  text: string
  /** 写入时间（epoch 毫秒）。界面自己翻译成「3 天前」，与情绪读数同一个约定 */
  at: number
}

/** 宿主注册路由的入参，只保留本项目用到的两个字段。 */export interface WebServerRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: WebRequest, res: WebResponse) => void | Promise<void>
}

/**
 * 请求对象：与 Node 的 IncomingMessage 兼容的最小子集。
 *
 * 只读正文的接口（`/chat`）需要拿到消息体。Node 的 IncomingMessage 本身是
 * 异步可迭代的，所以这里不声明 `on`、`data` 那套事件写法，让调用方直接
 * `for await` 拼正文——事件写法要自己处理 `end` 与 `error` 的先后，多一处出错点。
 * 类型上仍可省略：命令行直调或单测里的假请求没有正文，按空串处理。
 */
export interface WebRequest {
  method?: string | undefined
  url?: string | undefined
  headers: Record<string, string | string[] | undefined>
  [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | string>
}

/**
 * 响应对象：与 Node 的 ServerResponse 兼容的最小子集。
 *
 * `write` 是流式对话要用的（`/chat` 逐块吐出增量）；`flushHeaders` 与 `on` 都是
 * 可选的：前者让响应头立刻发出，避免第一块正文被浏览器攒着不渲染；
 * 后者用来感知对端断开——用户关掉窗口时要顺着这条信号把上游模型请求也停掉，
 * 否则模型会一直算到结束，白烧额度。
 */
export interface WebResponse {
  statusCode: number
  setHeader(name: string, value: string): unknown
  write(chunk: string): unknown
  end(chunk?: string): unknown
  flushHeaders?(): unknown
  on?(event: 'close', listener: () => void): unknown
}

/** 宿主提供的 `webServer` 服务，签名见 §5.11.1 与 §5.11.7。 */
export interface WebServerService {
  register(route: WebServerRoute): () => void
  tapIndex(transform: (html: string) => string): () => void
  getOrigin(): string
}
