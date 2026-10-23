// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 记忆的数据结构与默认参数。
 *
 * 双层（决策 22）：
 *   - 原文层：对她说的话 + 她的回复，逐条原样，每轮同步写
 *   - 事实层：提炼后的一句话事实，每轮结束后异步写
 *
 * 存储**不加密**（决策 89，主人 2026-10-23 定）：原文层直接落库，
 * 换取完整的检索能力；安全边界靠目录权限（`user/` 0700）而不是加密。
 * 这条取舍写在 ARCHITECTURE §6.7，不要擅自改成加密。
 */

/** 一条原文记忆。 */
export interface MemoryRaw {
  id: string
  /** 会话键：私聊为对方 id，群聊为群 id */
  sessionKey: string
  /** 说话者；她自己发言时为 null */
  speakerId: string | null
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  /** 是否已被提炼成事实 */
  extracted: boolean
}

/** 一条事实记忆。 */
export interface MemoryFact {
  id: string
  sessionKey: string
  /** 主语（参与者 id）；不指向具体人时为 null */
  subjectId: string | null
  /** 谓词，如「喜欢」「住在」「在做」 */
  predicate: string
  /** 宾语 */
  object: string
  /** 置信度 0..1 */
  confidence: number
  /** 重要度 0..1，参与检索加权 */
  importance: number
  /** 来源原文 id */
  sourceRawId: string | null
  createdAt: number
  /** 被哪条新事实取代；非空即失效 */
  supersededBy: string | null
  /** 用户手动改过，提炼任务不得覆盖（决策 24） */
  manuallyEdited: boolean
  /** 软删除时间 */
  deletedAt: number | null
}

/** 衰减档位（决策 23）。 */
export type DecayTier = 'never' | 'slow' | 'standard' | 'fast'

/** 各档半衰期（毫秒）。never 为 Infinity。 */
export const DECAY_HALF_LIFE: Record<DecayTier, number> = {
  never: Number.POSITIVE_INFINITY,
  slow: 30 * 24 * 60 * 60 * 1000,
  standard: 7 * 24 * 60 * 60 * 1000,
  fast: 2 * 24 * 60 * 60 * 1000,
}

/** 默认档位：标准（7 天）。 */
export const DEFAULT_DECAY_TIER: DecayTier = 'standard'

/** 检索权重（决策 73）：语义 / 时间 / 重要度。 */
export const RECALL_WEIGHTS = { semantic: 0.4, recency: 0.4, importance: 0.2 } as const

/** 超过半衰期多少倍即视为已淘汰。4 倍 ≈ 衰减到 6%。 */
export const EXPIRE_MULTIPLIER = 4

/** 异步提炼的延迟：每轮结束后 5 秒（决策 22）。 */
export const EXTRACT_DELAY_MS = 5 * 1000
