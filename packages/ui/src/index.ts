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
import type { MemoryEntry, WebServerService } from './api/types.js'

export { API_PREFIX, createApiHandler, injectToken } from './api/handler.js'
export { createToken, resetTokenCache, resolveToken } from './api/token.js'
export type { ApiEnvelope, ApiError, ApiErrorCode, MemoryEntry, MoodReading, WebRequest, WebResponse, WebServerService } from './api/types.js'

export const name = 'nt-dpet-ui'

/**
 * 依赖宿主的 `webServer` 服务（§5.11 实测存在）。
 *
 * 写成必选 inject 的后果要清楚：宿主不提供该服务时，这个插件不会被激活。
 * 这比「激活了但注册不上路由」更好——后者会留下一个看似正常、实则没有接口的
 * 页面，排查时最费时间。
 */
export const inject = ['webServer']

/**
 * 情绪服务里本包真正用到的那一部分。
 *
 * 只描述这两个字段，不 import `@nt-dpet/emotion` 的类型：一旦 import，
 * ui 就多一条编译期依赖，emotion 改一次内部结构就牵连界面编译。
 * 结构对得上就能用，对不上会在运行时表现为「这个接口没数据」，不会静默出错。
 */
interface EmotionServiceLike {
  readGlobal(): { mood: number; energy: number }
}

/** 情绪服务的 Context 键名，与 packages/emotion/src/service.ts 保持一致。 */
const EMOTION_SERVICE_KEY = 'nt-dpet:emotion'

/** 记忆服务的 Context 键名，与 packages/memory/src/service.ts 保持一致。 */
const MEMORY_SERVICE_KEY = 'nt-dpet:memory'

/**
 * 记忆服务里本包用到的那一部分。
 *
 * 同样只写结构不 import 类型，理由与 EmotionServiceLike 一致：不让界面编译
 * 依赖记忆包的内部结构。`recent()` 的语义是「最近若干条原文」，
 * 与 ARCHITECTURE §6 的原文层对应。
 */
interface MemoryServiceLike {
  recent(sessionKey: string, limit?: number): Promise<{
    id: string
    role: 'user' | 'assistant'
    content: string
    createdAt: number
  }[]>
}

/**
 * 造一个「读最近记忆」的回调。
 *
 * 每次调用现取服务，理由同 createMoodReader：记忆包晚激活时不能永久拿不到。
 *
 * `content` 改名 `text` 对外输出，是刻意做的一层隔离：接口的字段名属于对外
 * 契约，存储层的字段名属于内部实现。将来存储层要把原文拆成多段存储，
 * 这层映射改一处就够，界面不用跟着动。
 */
function createMemoryReader(
  ctx: Context,
): (sessionKey: string, limit: number) => Promise<MemoryEntry[] | undefined> {
  return async (sessionKey, limit) => {
    const memory = ctx.get(MEMORY_SERVICE_KEY) as MemoryServiceLike | undefined
    // 服务没挂上，或者挂的是个没 recent 的旧版本：都算「没就绪」
    if (!memory || typeof memory.recent !== 'function') return undefined

    const raws = await memory.recent(sessionKey, limit)
    return raws.map((raw) => ({
      id: raw.id,
      role: raw.role,
      text: raw.content,
      at: raw.createdAt,
    }))
  }
}

/**
 * 造一个「读当前情绪」的回调。
 *
 * 关键在「每次调用都现取服务」：emotion 与 ui 谁先激活没有保证。启动时取一次
 * 并缓存的话，若 emotion 晚到，这个回调会永久拿到 undefined——表现成接口一直
 * 503，重启又好了，是那种最难查的时序 bug。
 */
function createMoodReader(ctx: Context): () => { mood: number; energy: number } | undefined {
  return () => {
    const emotion = ctx.get(EMOTION_SERVICE_KEY) as EmotionServiceLike | undefined
    if (!emotion) return undefined

    const { mood, energy } = emotion.readGlobal()
    return { mood, energy }
  }
}

export function apply(ctx: Context): () => void {
  // 上游包不带类型声明，Context 上没有 webServer 字段，这里做一次局部收窄
  const webServer = (ctx as Context & { webServer?: WebServerService }).webServer
  if (!webServer) return () => {}

  const token = resolveToken()
  const handler = createApiHandler({
    token,
    origin: webServer.getOrigin(),
    readMood: createMoodReader(ctx),
    readRecent: createMemoryReader(ctx),
  })

  const disposers = [
    webServer.register({ kind: 'prefix', path: API_PREFIX, handler }),
    webServer.tapIndex((html) => injectToken(html, token)),
  ]

  return () => {
    for (const dispose of disposers) dispose()
  }
}
