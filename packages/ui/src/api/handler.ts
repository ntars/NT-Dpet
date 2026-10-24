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
  MemoryEntry,
  MoodReading,
  StartupStatus,
  WebRequest,
  WebResponse,
} from './types.js'

/** 路由前缀。验收要求与 §5.11 一致，不要改。 */
export const API_PREFIX = '/api/ntdpet'

/** 令牌请求头。查询串 `?token=` 作为退路，供不便设头的场景使用。 */
const TOKEN_HEADER = 'x-ntdpet-token'

/**
 * 已规划、尚未接入的子路径。M0.2 / M0.3 落地后从这张表移走。
 *
 * 注意 `/memory` 这行要留到记忆的其余子路径（事实列表、编辑、删除）也接上为止：
 * 只有 `/memory/recent` 一条被单独处理，同前缀的其他路径仍是占位，
 * 提前把它删掉会让这些请求变成 404「无此接口」——那意味着「写错了地址」，
 * 跟「还没做」是两回事，排查时容易白跑一趟。
 */
const PENDING_PATHS = ['/memory']

/**
 * 记忆列表的默认条数。
 *
 * 8 这个数取自 ROADMAP M0.2.3；右栏卡片一口气放 8 条不用滚动，
 * 再多就得先在卡片里滚一遍才知道有几条，反而不如点「全部」。
 */
const DEFAULT_MEMORY_LIMIT = 8

/**
 * 上限 50。
 *
 * 这个接口没有分页——真要翻更早的记忆得专门做检索页。放着不设上限，
 * 一个手写的 `?limit=100000` 就能让服务端把整库读出来塞进内存，
 * 而这条路由跟宿主同端口，卡住的是整个页面。
 */
const MAX_MEMORY_LIMIT = 50

/**
 * 本机阶段的默认会话键。
 *
 * 会话键的真实构造规则见 ARCHITECTURE §5.1：`c2c:<platform_uid>` /
 * `group:<platform_gid>`。但现在还没接通道（M2 才做），没有平台账号可依据。
 * 与其临时编一套编号，不如明确用一个带 `local` 字样的键：等通道接上以后，
 * 一眼就能看出这是 M0 阶段的过渡值，不会跟真实会话撞在一起。
 */
export const DEFAULT_SESSION_KEY = 'c2c:local'

/**
 * 会话键格式。
 *
 * 校验放在进存储层之前不是洁癖：SQLite 那边用的是参数绑定，注入不了，
 * 但一个带换行或超长字符的键会被原样写进库，之后按会话查总是查不到，
 * 表现成「明明聊过却没有记忆」，查起来要翻三层。格式不对就直接拒。
 */
const SESSION_KEY_PATTERN = /^(c2c|group):[\w-]{1,64}$/

/**
 * 单条消息的字数上限。
 *
 * 4000 是「一个人一口气打出来」的量级，再长就该走文件而不是聊天框。
 * 不设这条的上限，一次粘贴几万字会把整段塞进模型上下文，token 花掉了才发现；
 * 而这笔钱是主人付的，界面不该替他决定。
 */
const MAX_CHAT_CHARS = 4000

/**
 * 请求正文字节上限。
 *
 * 汉字在 UTF-8 里占三字节，4000 字约 12K；留到 64K 是为了容纳 JSON 转义与将来的
 * 附加字段，同时保证「有人手写一个巨型请求」时不会把整段读进内存。
 * 这条路由与宿主同端口，吃住内存就是吃住整个页面。
 */
const MAX_BODY_BYTES = 64 * 1024

const encoder = new TextEncoder()

/**
 * 对话服务的「此刻不可用」。
 *
 * 单独一个错误类而不是返回 undefined：`/chat` 是流式接口，一旦开始写事件流，
 * 状态码就已经发出去了（200），没法再改成 503。所以「不可用」必须在写第一块之前
 * 就抛出来，让 handler 还能走正常的 JSON 错误响应。用一个能被 `instanceof`
 * 认出来的类型，是唯一能在跨层时区分「没起来」与「生成失败」的办法。
 */
export class NotReadyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotReadyError'
  }
}

/** `/chat` 的入参：一个会话标识 + 一句用户输入。 */
export interface ChatInput {
  /** 已校验过的会话键，形如 `c2c:local` */
  sessionKey: string
  /** 用户这一句的原话 */
  text: string
}

/**
 * 边生成边交出的通道。
 *
 * `signal` 由 handler 持有：对端一断开就 abort，实现层要把它透传给模型请求。
 * 之所以不让实现层自己监听连接，是因为实现层与 HTTP 无关——换一个通道
 * （比如将来的本地 IPC）时这段不用重写。
 */
export interface ChatSink {
  signal: AbortSignal
  /** 追加一段正文。可以调很多次，也可能一次都不调（回复为空）。 */
  delta(text: string): void
}

/** 一次对话的结局。`stopReason` 与 dialogue 包的取值保持一致。 */
export interface ChatOutcome {
  stopReason: 'stop' | 'aborted' | 'error' | 'length'
}

/**
 * 跑一轮对话。
 *
 * 做成回调的理由与 readMood / readRecent 一样：接口层只管 HTTP 分帧，
 * 不去知道模型怎么调、提示词怎么拼。这些属于 dialogue 与 persona 的职责，
 * 混进接口层以后，换模型或改提示词都要动 HTTP 代码。
 */
export type ChatRunner = (input: ChatInput, sink: ChatSink) => Promise<ChatOutcome>

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
  /**
   * 读某个会话最近的原文记忆。
   *
   * 与 readMood 同一个思路：接口层不知道记忆存在哪，只认这个回调。
   * 返回值有三态，别混：数组 = 有结果（空数组就是「真的没有记忆」）、
   * `undefined` = 服务没起来、抛异常 = 服务坏了（由外层兜成 500）。
   * 把「没起来」和「没有记忆」分开很要紧——前者该提示稍后再试，
   * 后者该老老实实显示「暂无记忆」，混在一起就永远分不清是坏了还是空的。
   */
  readRecent?:
    | ((sessionKey: string, limit: number) => Promise<MemoryEntry[] | undefined> | MemoryEntry[] | undefined)
    | undefined
  /**
   * 跑一轮对话。
   *
   * 没注入就是 503——对话要用模型，模型没配好时界面该明确说「不可用」，
   * 而不是发出去一句然后永远等不到回复。
   */
  chat?: ChatRunner | undefined
  /**
   * 取自检结果。
   *
   * 三态与 readRecent 同一个约定：对象 = 有结果、`undefined` = 自检还没跑完
   * 或服务没挂上。**这里不给「重跑一次」的入口**：自检要等配置树 settle 之后
   * 才有意义，请求此刻触发一次，会把还在启动的条目全算成未激活，报出一堆
   * 只存在几秒的假异常。宁可回 503 让界面稍后再来，也不要给一份错的结论。
   */
  readStatus?: (() => StartupStatus | undefined) | undefined
}

export type ApiHandler = (req: WebRequest, res: WebResponse) => void | Promise<void>

/**
 * 造一个可挂到 `webServer.register()` 的 handler。
 *
 * 返回值可能是个 Promise：记忆接口要等存储层读完才有结果。除了这一段，
 * 其余分支都在第一个 `await` 之前就把响应写完了，所以同步调用方（测试里
 * 直接 `handler(req, res)` 再断言）看到的行为跟以前一样。
 */
export function createApiHandler(options: ApiHandlerOptions): ApiHandler {
  const now = options.now ?? Date.now
  const startedAt = now()

  return async function handle(req: WebRequest, res: WebResponse): Promise<void> {
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

      if (path === '/status') {
        if (method !== 'GET' && method !== 'HEAD') {
          sendError(res, 405, 'METHOD_NOT_ALLOWED', '该接口只接受 GET')
          return
        }

        const status = options.readStatus?.()
        // 自检要等配置树 settle，请求早到时它还没跑完。回 503 而不是给一个
        // 「全部通过」的空壳：后者会让界面以为一切正常，把真异常盖掉。
        if (!status) {
          sendError(res, 503, 'NOT_READY', '启动自检尚未就绪')
          return
        }

        sendJson(res, 200, { ok: true, data: status })
        return
      }

      if (path === '/memory/recent') {
        if (method !== 'GET' && method !== 'HEAD') {
          sendError(res, 405, 'METHOD_NOT_ALLOWED', '该接口只接受 GET')
          return
        }

        const url = parseUrl(req.url, options.origin)
        const sessionKey = resolveSessionKey(url)
        if (sessionKey === null) {
          sendError(res, 400, 'BAD_REQUEST', '会话键格式不正确')
          return
        }

        const limit = resolveLimit(url)
        if (limit === null) {
          sendError(res, 400, 'BAD_REQUEST', 'limit 必须是正整数')
          return
        }

        const readRecent = options.readRecent
        if (!readRecent) {
          sendError(res, 503, 'NOT_READY', '记忆服务未就绪')
          return
        }

        // 这里是全函数唯一会等的地方。等的是本地存储，不是网络，
        // 毫秒级；真卡住说明存储层出了问题，界面那边有 8 秒超时兜着。
        const items = await readRecent(sessionKey, limit)
        if (!items) {
          sendError(res, 503, 'NOT_READY', '记忆服务未就绪')
          return
        }

        // limit 回传实际生效值：请求 limit=999 会被压到 50，
        // 不告诉调用方的话，界面会以为自己拿到了 999 条。
        sendJson(res, 200, { ok: true, data: { session: sessionKey, limit, items } })
        return
      }

      if (path === '/chat') {
        if (method !== 'POST') {
          sendError(res, 405, 'METHOD_NOT_ALLOWED', '该接口只接受 POST')
          return
        }

        const chat = options.chat
        if (!chat) {
          sendError(res, 503, 'NOT_READY', '对话服务未就绪')
          return
        }

        const raw = await readBody(req)
        if (raw === null) {
          sendError(res, 400, 'BAD_REQUEST', '请求正文过大或读取失败')
          return
        }

        const parsed = parseChatBody(raw)
        if (!parsed.ok) {
          sendError(res, 400, 'BAD_REQUEST', parsed.message)
          return
        }

        /**
         * 对端断开时顺手停掉上游。
         *
         * 浏览器关掉以后模型那头并不知道，不停就会一路算到 finish——主人付的是
         * token 钱，界面都已经没了还在生成，是纯浪费。
         */
        const controller = new AbortController()
        res.on?.('close', () => controller.abort())

        // 事件流一旦开始写，状态码就定了，所以「服务没起来」必须在第一块之前抛出
        let headSent = false
        const sink: ChatSink = {
          signal: controller.signal,
          delta(text) {
            if (!headSent) {
              sendStreamHead(res)
              headSent = true
            }
            writeEvent(res, { type: 'delta', text })
          },
        }

        try {
          const outcome = await chat({ sessionKey: parsed.sessionKey, text: parsed.text }, sink)
          // 一个字都没有（模型返回空）也算正常结束：照样发头与终态，
          // 否则前端会一直等一个永远不会到来的事件
          if (!headSent) {
            sendStreamHead(res)
            headSent = true
          }
          writeEvent(res, { type: 'done', stopReason: outcome.stopReason })
        } catch (err) {
          if (!headSent) {
            // 还没吐过一个字，状态码还能挑：服务没起来与真出错要分开
            if (err instanceof NotReadyError) {
              sendError(res, 503, 'NOT_READY', err.message)
            } else {
              sendError(res, 500, 'INTERNAL', '内部错误')
            }
            return
          }
          // 已经在流里了，200 已经发出去，失败只能变成一条事件交给前端
          writeEvent(res, { type: 'error', message: '生成失败' })
        }

        res.end()
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

/**
 * 从请求里取子路径，形如 `/health`；取不到就返回 `/`。
 */
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

/** 解析查询串。地址坏掉时返回 null，由调用方按「没传参数」处理。 */
function parseUrl(rawUrl: string | undefined, origin: string): URL | null {
  try {
    return new URL(rawUrl ?? '/', origin)
  } catch {
    return null
  }
}

/**
 * 取会话键。
 *
 * 三种结果：字符串 = 可用；`DEFAULT_SESSION_KEY` = 没指定，用本机默认；
 * `null` = 传了但不合格式，调用方应回 400，不要悄悄换成默认值。
 */
function resolveSessionKey(url: URL | null): string | null {
  return normalizeSessionKey(url?.searchParams.get('session') ?? null)
}

/** 取条数。没传或传空用默认值；不是正整数返回 null（→ 400）；超过上限压到上限。 */
function resolveLimit(url: URL | null): number | null {
  const raw = url?.searchParams.get('limit')
  if (raw === null || raw === undefined || raw.trim() === '') return DEFAULT_MEMORY_LIMIT
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) return null
  return Math.min(value, MAX_MEMORY_LIMIT)
}

/**
 * 会话键归一化。查询串与请求正文共用这一份判定。
 *
 * 传进来的可能是任意类型（正文是外部给的 JSON），所以先拦类型再判格式：
 * 一个数字或对象直接当错值拒掉，不要 `String()` 一下硬转——那样 `123` 会
 * 变成一个看着合法、其实从没被写过的会话键。
 */
function normalizeSessionKey(raw: unknown): string | null {
  if (raw === null || raw === undefined) return DEFAULT_SESSION_KEY
  if (typeof raw !== 'string') return null
  if (raw.trim() === '') return DEFAULT_SESSION_KEY
  return SESSION_KEY_PATTERN.test(raw) ? raw : null
}

/**
 * 读请求正文。
 *
 * 宿主没有提供解析正文的接口（§5.11.1 只给了 register / tapIndex / getOrigin），
 * 而 Node 的 IncomingMessage 本身是异步可迭代的，按块拼起来最省事。
 *
 * 返回 null 有两种含义——超限或读失败，都只能拒掉：超限还继续读，一个手写的
 * 巨型请求就能把整段拉进内存，这条路由跟宿主同端口，卡住的是整个页面。
 */
async function readBody(req: WebRequest): Promise<string | null> {
  const iterate = req[Symbol.asyncIterator]
  // 没有正文来源（命令行直调、单测假请求）时按空正文处理，交给后续校验去拒
  if (typeof iterate !== 'function') return ''

  const decoder = new TextDecoder('utf-8')
  let bytes = 0
  let text = ''

  try {
    for await (const chunk of req as AsyncIterable<Uint8Array | string>) {
      if (typeof chunk === 'string') {
        bytes += encoder.encode(chunk).length
        text += chunk
      } else {
        bytes += chunk.byteLength
        text += decoder.decode(chunk, { stream: true })
      }
      if (bytes > MAX_BODY_BYTES) return null
    }
    return text + decoder.decode()
  } catch {
    return null
  }
}

/** 解析并校验 `/chat` 的正文。失败时带上给用户看的原因。 */
function parseChatBody(raw: string): { ok: true; sessionKey: string; text: string } | { ok: false; message: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, message: '请求正文不是合法 JSON' }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: '请求正文必须是对象' }
  }

  const record = parsed as Record<string, unknown>
  const text = typeof record.text === 'string' ? record.text.trim() : ''
  if (text === '') return { ok: false, message: '消息内容不能为空' }
  if (text.length > MAX_CHAT_CHARS) return { ok: false, message: `消息不能超过 ${MAX_CHAT_CHARS} 字` }

  const sessionKey = normalizeSessionKey(record.session)
  if (sessionKey === null) return { ok: false, message: '会话键格式不正确' }

  return { ok: true, sessionKey, text }
}

/**
 * 事件流的响应头。
 *
 * `flushHeaders()` 不能省：不主动发出去，浏览器要等攒够一段缓冲才开始渲染，
 * 表现成「点了发送，先卡两秒，然后一大段文字突然出现」——流式就白做了。
 */
function sendStreamHead(res: WebResponse): void {
  res.statusCode = 200
  res.setHeader('content-type', 'text/event-stream; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  // 本机直连没有反代，写上是为了将来真有代理时不至于被缓冲憋住整段回复
  res.setHeader('x-accel-buffering', 'no')
  res.flushHeaders?.()
}

/**
 * 写一条事件。
 *
 * 写失败一律吞掉：对端已经关窗时，`write` 会抛（或返回 false 后触发 error 事件），
 * 那不是故障，是这次请求本来就该结束了。抛到外层只会变成一条没人能看到的 500。
 */
function writeEvent(res: WebResponse, payload: unknown): void {
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
  } catch {
    /* 对端已断开 */
  }
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
