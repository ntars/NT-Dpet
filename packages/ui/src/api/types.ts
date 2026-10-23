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
 */
export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'NOT_READY'
  | 'INTERNAL'

/** 宿主注册路由的入参，只保留本项目用到的两个字段。 */
export interface WebServerRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: WebRequest, res: WebResponse) => void | Promise<void>
}

/** 请求对象：与 Node 的 IncomingMessage 兼容的最小子集。 */
export interface WebRequest {
  method?: string | undefined
  url?: string | undefined
  headers: Record<string, string | string[] | undefined>
}

/** 响应对象：与 Node 的 ServerResponse 兼容的最小子集。 */
export interface WebResponse {
  statusCode: number
  setHeader(name: string, value: string): unknown
  end(chunk?: string): unknown
}

/** 宿主提供的 `webServer` 服务，签名见 §5.11.1 与 §5.11.7。 */
export interface WebServerService {
  register(route: WebServerRoute): () => void
  tapIndex(transform: (html: string) => string): () => void
  getOrigin(): string
}
