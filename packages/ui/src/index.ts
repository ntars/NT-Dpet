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
import { API_PREFIX, createApiHandler, injectToken, NotReadyError } from './api/handler.js'
import type { ChatInput, ChatRunner, ChatSink } from './api/handler.js'
import { resolveToken } from './api/token.js'
import type { MemoryEntry, WebServerService } from './api/types.js'

export { API_PREFIX, createApiHandler, injectToken, NotReadyError } from './api/handler.js'
export type { ChatInput, ChatOutcome, ChatRunner, ChatSink } from './api/handler.js'
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

/** 对话服务的 Context 键名，与 packages/dialogue/src/service.ts 保持一致。 */
const DIALOGUE_SERVICE_KEY = 'nt-dpet:dialogue'

/**
 * 对话参数。
 *
 * 写死在这里而不是走配置，是因为配置层（bundles 与 ui 的 patch）现在只承载
 * 隐私开关和视图设置，还没有「模型选择」这一项——那要等设置界面做到模型页
 * （M0.7 之后）。取值依据是 docs/TECH-RESEARCH.md §5.10.1 实测走通的那条路由。
 *
 * maxTokens 取 1024：这个数是「一段聊天回复」的量级，长了她会一口气说完，
 * 反而不像对话。真需要长文时再改。
 */
const CHAT_PROVIDER = 'magpie'
const CHAT_MODEL = 'group/ntars'
const CHAT_MAX_TOKENS = 1024

/**
 * 对话服务里本包用到的那一部分。
 *
 * 与 EmotionServiceLike 同一个理由：只写结构、不 import `@nt-dpet/dialogue`
 * 的类型，避免界面编译挂在对话包的内部结构上。
 */
interface DialogueServiceLike {
  chat(
    turn: { system: string; history: unknown[]; input: string },
    options: {
      provider?: string
      model: string
      maxTokens: number
      reasoning: 'off' | 'low' | 'high'
      signal?: AbortSignal
    },
    onUpdate: (update: { kind: string; delta?: string }) => void,
  ): Promise<{ text: string; stopReason: 'stop' | 'aborted' | 'error' | 'length' }>
}

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

/**
 * 造一个「跑一轮对话」的回调。
 *
 * 三层职责分得很清：这里只负责把「HTTP 请求 → dialogue 的一轮参数」翻译过去，
 * 提示词组装是 persona / worldbook 的事（M0.7），记忆注入是 M0.5 的事。
 * 现在 system 传空、history 传空，是**阶段性的**，不是设计成这样：
 * 也就是说这一版每次都是单轮对话，她记不住上一句。
 *
 * 每次调用现取服务，理由同 createMoodReader：dialogue 依赖 llm 服务，
 * 谁先激活没有保证，启动时缓存会让接口永久 503。
 *
 * 服务缺席时抛 NotReadyError 而不是返回空：接口层要靠这个类型决定回 503
 * （服务没起来）还是 500（真出错），混在一起就没法区分「还没配好模型」
 * 与「模型报错了」——这两种情况主人该做的事完全不同。
 */
function createChatRunner(ctx: Context): ChatRunner {
  return async (input: ChatInput, sink: ChatSink) => {
    const dialogue = ctx.get(DIALOGUE_SERVICE_KEY) as DialogueServiceLike | undefined
    if (!dialogue || typeof dialogue.chat !== 'function') {
      throw new NotReadyError('对话服务未就绪')
    }

    const result = await dialogue.chat(
      { system: '', history: [], input: input.text },
      {
        provider: CHAT_PROVIDER,
        model: CHAT_MODEL,
        maxTokens: CHAT_MAX_TOKENS,
        reasoning: 'off',
        signal: sink.signal,
      },
      (update) => {
        // 只转正文。usage / done 这些不该混进界面文字里，
        // 一次性全塞给前端会让「打字机」出现数字和标记
        if (update.kind === 'text-delta' && typeof update.delta === 'string') {
          sink.delta(update.delta)
        }
      },
    )

    return { stopReason: result.stopReason }
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
    chat: createChatRunner(ctx),
  })

  const disposers = [
    webServer.register({ kind: 'prefix', path: API_PREFIX, handler }),
    webServer.tapIndex((html) => injectToken(html, token)),
  ]

  return () => {
    for (const dispose of disposers) dispose()
  }
}
