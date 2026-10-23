// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * `/api/ntdpet` 下所有请求的唯一入口。
 *
 * 为什么只注册一条 prefix 路由而不是每个接口一条 exact：鉴权逻辑只能有一份。
 * 散成多条路由时，新增接口忘了加校验就会出现一个裸接口，而这种遗漏在测试里
 * 不容易看出来。集中分发后，新增子路由只是往 `dispatch` 里加一个分支，
 * 鉴权在进入分发之前已经完成（§5.11.4 第 6 条）。
 *
 * 敏感信息处理：不读取、不记录请求正文；错误响应只给固定文案，不回显入参，
 * 避免令牌或用户原文被写进日志或被跨站脚本读到。
 */

import { timingSafeEqual } from 'node:crypto'
import type {
  ApiEnvelope,
  ApiErrorCode,
  MoodReading,
  WebRequest,
  WebResponse,
} from './types.js'

/** 路由前缀。验收要求与 §5.11 一致，不要改。 */
export const API_PREFIX = '/api/ntdpet'

/** 令牌请求头。查询串 `?token=` 作为退路，供不便设头的场景使用。 */
const TOKEN_HEADER = 'x-ntdpet-token'

/** 已规划、尚未接入的子路径。M0.2 / M0.3 落地后从这张表移走。 */
const PENDING_PATHS = ['/memory', '/chat', '/status']

const encoder = new TextEncoder()

export interface ApiHandlerOptions {
  /** 本次进程的接口令牌，由 `resolveToken()` 给出。 */
  token: string
  /** 宿主的监听根地址，例如 `http://127.0.0.1:3189`，用于 Origin 同源校验。 */
  origin: string
  /** 注入时钟，便于测试。 */
  now?: () => number
  /**
   * 读当前全局情绪。
   *
   * 做成回调而不是直接依赖 emotion 包：接口层不该知道情绪状态存在哪，
   * 也不该为了一个 GET 把 ui 的 inject 列表绑死在 emotion 上——那样 emotion
   * 没加载时整个插件都不激活，页面和接口会一起消失，比「这个接口没数据」糟得多。
   *
   * 返回 `undefined` 表示情绪服务此刻不可用，按 503 处理而不是给默认值：
   * 给默认值等于凭空造一个「0.5 的心情」，界面无从分辨真假。
   */
  readMood?: (() => MoodReading | undefined) | undefined
}

export type ApiHandler = (req: WebRequest, res: WebResponse) => void

/**
 * 造一个可挂到 `webServer.register()` 的 handler。
 *
 * 返回的函数是同步的：所有分支都立刻写响应，不存在「挂住不返回」的路径。
 */
export function createApiHandler(options: ApiHandlerOptions): ApiHandler {
  const now = options.now ?? Date.now
  const startedAt = now()

  return function handle(req: WebRequest, res: WebResponse): void {
    try {
      // 鉴权先于一切：连路径都不解析，避免未授权请求触发额外计算
      if (!isAuthorized(req, options)) {
        sendError(res, 401, 'UNAUTHORIZED', '令牌无效或缺失')
        return
      }

      const path = subPath(req.url, options.origin)
      const method = (req.method ?? 'GET').toUpperCase()

      if (path === '/health') {
        if (method !== 'GET' && method !== 'HEAD') {
          sendError(res, 405, 'METHOD_NOT_ALLOWED', '该接口只接受 GET')
          return
        }
        sendJson(res, 200, {
          ok: true,
          data: {
            service: 'nt-dpet',
            path: API_PREFIX + '/health',
            at: now(),
            uptimeMs: now() - startedAt,
          },
        })
        return
      }

      if (path === '/mood') {
        if (method !== 'GET' && method !== 'HEAD') {
          sendError(res, 405, 'METHOD_NOT_ALLOWED', '该接口只接受 GET')
          return
        }

        // 服务在但读不出值，与「服务根本没起来」都归 503：
        // 对界面而言结论一样——暂时没有真实数据，先按演示数据处理。
        const reading = options.readMood?.()
        if (!reading) {
          sendError(res, 503, 'NOT_READY', '情绪服务未就绪')
          return
        }

        sendJson(res, 200, { ok: true, data: reading })
        return
      }

      if (isPending(path)) {
        sendError(res, 503, 'NOT_READY', '该接口尚未接入')
        return
      }

      sendError(res, 404, 'NOT_FOUND', '无此接口')
    } catch {
      // 兜底：任何未预期异常都转成 500，但不能把异常内容回给调用方
      sendError(res, 500, 'INTERNAL', '内部错误')
    }
  }
}

/**
 * 把令牌注入页面。
 *
 * 只有同源加载的 index.html 能读到它——跨源页面拿不到别人的 DOM，
 * 所以这不算把令牌公开（§5.11.4 第 2 条）。
 */
export function injectToken(html: string, token: string): string {
  const snippet = '<script>window.__NTDPET_TOKEN__=' + JSON.stringify(token) + '</script>'
  const headEnd = html.lastIndexOf('</head>')
  if (headEnd === -1) return snippet + html
  return html.slice(0, headEnd) + snippet + html.slice(headEnd)
}

// ── 内部实现 ────────────────────────────────────────────────

/** 从请求里取子路径，形如 `/health`；取不到就返回 `/`。 */
function subPath(rawUrl: string | undefined, origin: string): string {
  let pathname: string
  try {
    pathname = new URL(rawUrl ?? '/', origin).pathname
  } catch {
    return '/'
  }
  if (!pathname.startsWith(API_PREFIX)) return '/'
  const rest = pathname.slice(API_PREFIX.length).replace(/\/+$/, '')
  return rest === '' ? '/' : rest
}

function isPending(path: string): boolean {
  return PENDING_PATHS.some((item) => path === item || path.startsWith(item + '/'))
}

/**
 * 两个条件同时满足才放行：来源同源、令牌匹配。
 *
 * Origin 头的取舍：浏览器跨站请求一定带 Origin，同源 GET 通常不带，命令行工具
 * （curl）也不带。所以规则是「带了就必须对，不带则只看令牌」——对面若真想伪造，
 * 不带你也没法分辨，而令牌才是真正的凭据。
 */
function isAuthorized(req: WebRequest, options: ApiHandlerOptions): boolean {
  const origin = headerValue(req.headers['origin'])
  if (origin !== undefined && !isSameOrigin(origin, options.origin)) return false

  const provided = headerValue(req.headers[TOKEN_HEADER]) ?? queryToken(req.url, options.origin)
  if (provided === undefined) return false
  return safeEqual(provided, options.token)
}

function isSameOrigin(origin: string, expected: string): boolean {
  try {
    const actual = new URL(origin)
    const target = new URL(expected)
    return actual.protocol === target.protocol
      && actual.hostname === target.hostname
      && actual.port === target.port
  } catch {
    return false
  }
}

function queryToken(rawUrl: string | undefined, origin: string): string | undefined {
  try {
    return new URL(rawUrl ?? '/', origin).searchParams.get('token') ?? undefined
  } catch {
    return undefined
  }
}

/** 定长比较：避免按字符提前返回泄露令牌前缀。 */
function safeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/** 取单值请求头。数组（重复头）一律视为无效，不做猜测。 */
function headerValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function sendJson(res: WebResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  // 三个响应头都是安全基线：不缓存、不嗅探
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(text)
}

function sendError(res: WebResponse, status: number, code: ApiErrorCode, message: string): void {
  const body: ApiEnvelope<never> = { ok: false, error: { code, message } }
  sendJson(res, status, body)
}
