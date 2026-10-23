// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 三层裁决检索（决策 73、77）：语义 0.4 / 时间 0.4 / 重要度 0.2。
 *
 * 语义这一路目前是**关键词退化**：向量路要等 sqlite-vec 落地，
 * 但接口按「打分函数」设计，将来换成向量相似度只替换 semanticScore 一处。
 *
 * 中文不分词：按二元组（bigram）切。中文里「喜欢」和「不喜欢」的差别
 * 靠 bigram 是可以区分到一定程度的，比单字好；真正准确要靠向量，那是二期。
 */

import { DECAY_HALF_LIFE, EXPIRE_MULTIPLIER, RECALL_WEIGHTS } from './types.js'
import type { DecayTier, MemoryFact } from './types.js'

/** 把文本切成检索用的二元组，过滤标点与空白。 */
export function bigrams(text: string): string[] {
  const clean = text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
  if (clean.length <= 1) return clean ? [clean] : []
  const out: string[] = []
  for (let i = 0; i < clean.length - 1; i++) out.push(clean.slice(i, i + 2))
  return out
}

/** 语义分：查询与事实文本的 bigram 重合率，0..1。 */
export function semanticScore(query: string, fact: MemoryFact): number {
  const q = bigrams(query)
  if (q.length === 0) return 0
  const target = bigrams(`${fact.predicate} ${fact.object}`)
  if (target.length === 0) return 0
  const targetSet = new Set(target)
  let hit = 0
  for (const g of new Set(q)) if (targetSet.has(g)) hit++
  return hit / new Set(q).size
}

/** 时间分：按半衰期指数衰减，0..1。不衰减档恒为 1。 */
export function recencyScore(ageMs: number, tier: DecayTier): number {
  const halfLife = DECAY_HALF_LIFE[tier]
  if (!Number.isFinite(halfLife)) return 1
  if (ageMs <= 0) return 1
  return Math.exp((-Math.LN2 * ageMs) / halfLife)
}

export interface RecallOptions {
  query: string
  now: number
  tier: DecayTier
  /** 取前几条，默认 8 */
  topK?: number
}

export interface RecalledFact {
  fact: MemoryFact
  score: number
}

/**
 * 三层裁决：先剔除失效/删除/过期的，再按加权分排序。
 *
 * 「过期」的判据：年龄超过半衰期的 4 倍（权重已衰减到约 6%）。
 * 不衰减档永远不过期。
 */
export function recall(facts: MemoryFact[], options: RecallOptions): RecalledFact[] {
  const { query, now, tier, topK = 8 } = options
  const halfLife = DECAY_HALF_LIFE[tier]
  const expireAfter = Number.isFinite(halfLife) ? halfLife * EXPIRE_MULTIPLIER : Number.POSITIVE_INFINITY

  const scored: RecalledFact[] = []
  for (const fact of facts) {
    if (fact.deletedAt !== null) continue
    if (fact.supersededBy !== null) continue
    const age = now - fact.createdAt
    if (age > expireAfter) continue

    const score =
      RECALL_WEIGHTS.semantic * semanticScore(query, fact) +
      RECALL_WEIGHTS.recency * recencyScore(age, tier) +
      RECALL_WEIGHTS.importance * clamp01(fact.importance)
    scored.push({ fact, score })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    // 同分时新的优先，避免顺序不稳定
    return b.fact.createdAt - a.fact.createdAt
  })
  return scored.slice(0, topK)
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.min(1, Math.max(0, v))
}
