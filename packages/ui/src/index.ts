// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * @nt-dpet/ui — Web UI（三栏布局，Apple HIG）+ 接口层
 *
 * 设计依据：docs/ARCHITECTURE.md §14
 * 决策依据：docs/DECISIONS.md 决策 62-65
 * 接口依据：docs/TECH-RESEARCH.md §5.11（方案 A：复用宿主端口注册路由）
 *
 * 本包现在承担两件事，边界要分清：
 *   1. 接口层（src/api）：`/api/ntdpet` 下的 HTTP 入口与自鉴权
 *   2. 静态页面（web/）：三栏布局，由宿主的 index 托管
 *
 * 为什么接口放在 UI 包里而不是单独建包：接口的唯一消费者就是这套页面，
 * 生命周期完全重合；单独建包只会多一层依赖和一个空的 provide 名字。
 * 等 M0.2 接完 mood / memory / chat 后，若别处也要用，再拆不迟。
 */

import type { Context } from '@deepseek-ai/cordis'
import { API_PREFIX, createApiHandler, injectToken } from './api/handler.js'
import { resolveToken } from './api/token.js'
import type { WebServerService } from './api/types.js'

export { API_PREFIX, createApiHandler, injectToken } from './api/handler.js'
export { createToken, resetTokenCache, resolveToken } from './api/token.js'
export type { ApiEnvelope, ApiError, ApiErrorCode, WebRequest, WebResponse, WebServerService } from './api/types.js'

export const name = 'nt-dpet-ui'

/**
 * 依赖宿主的 `webServer` 服务（§5.11 实测存在）。
 *
 * 写成必选 inject 的后果要清楚：宿主不提供该服务时，这个插件不会被激活。
 * 这比「激活了但注册不上路由」更好——后者会留下一个看似正常、实则没有接口的
 * 页面，排查时最费时间。
 */
export const inject = ['webServer']

export function apply(ctx: Context): () => void {
  // 上游包不带类型声明，Context 上没有 webServer 字段，这里做一次局部收窄
  const webServer = (ctx as Context & { webServer?: WebServerService }).webServer
  if (!webServer) return () => {}

  const token = resolveToken()
  const handler = createApiHandler({ token, origin: webServer.getOrigin() })

  const disposers = [
    webServer.register({ kind: 'prefix', path: API_PREFIX, handler }),
    webServer.tapIndex((html) => injectToken(html, token)),
  ]

  return () => {
    for (const dispose of disposers) dispose()
  }
}
