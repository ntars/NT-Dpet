// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 情绪状态容器：内存中维护当前值，惰性回归，带存储端口。
 *
 * 惰性回归的意思是——不靠定时器把时间往前推，而是**每次读取时**按
 * 「距上次更新过了多久」现算。好处有两个：崩溃后重启不需要补偿计算；
 * 进程挂掉时丢失的也只是一段时间的衰减，不会算出离谱的值。
 *
 * 存储端口（EmotionStore）默认给内存实现。等 storage 包做好后，
 * 由它把自己的 SQLite 实现 setStore() 进来，这里不需要改。
 */

import { DEFAULT_HALF_LIFE_TIER, regress, resolveHalfLife } from './decay.js'
import { DEFAULT_GLOBAL, DEFAULT_RELATION } from './types.js'
import type { EmotionSnapshot, GlobalMood, Relation } from './types.js'

/** 存储端口。load 在启动时调一次，save 由落盘策略触发。 */
export interface EmotionStore {
  load(): Promise<EmotionSnapshot | null>
  save(snapshot: EmotionSnapshot): Promise<void>
}

/** 关系四维的阈值。跨过任一档就值得立刻落盘（§7.6：关系跨阈值时立即落盘）。 */
export const RELATION_THRESHOLDS = [0.25, 0.5, 0.75] as const

/** 批量落盘间隔（§7.6：每 60 秒）。 */
export const PERSIST_INTERVAL_MS = 60 * 1000

/** 内存存储：进程重启即丢。用于 storage 包还没就位的阶段。 */
export function createMemoryStore(): EmotionStore {
  let cached: EmotionSnapshot | null = null
  return {
    async load() {
      return cached
    },
    async save(snapshot) {
      cached = structuredClone(snapshot)
    },
  }
}

/** 判断某个维度的前后值之间是否跨过了某个阈值。 */
function crossedThreshold(before: number, after: number): boolean {
  return RELATION_THRESHOLDS.some(
    (t) => (before < t && after >= t) || (before >= t && after < t),
  )
}

export class EmotionState {
  private snapshot: EmotionSnapshot
  private store: EmotionStore
  private dirty = false

  constructor(store?: EmotionStore) {
    this.store = store ?? createMemoryStore()
    this.snapshot = {
      global: { ...DEFAULT_GLOBAL },
      halfLifeTier: DEFAULT_HALF_LIFE_TIER,
      personaId: '',
      relations: {},
      updatedAt: Date.now(),
    }
  }

  /** 换存储实现。会先把当前内存状态写进新存储。 */
  async setStore(store: EmotionStore): Promise<void> {
    this.store = store
    await this.flush()
  }

  /** 启动时调用：把持久化的状态读回来。没有存档就用初始值。 */
  async restore(): Promise<void> {
    const loaded = await this.store.load()
    if (!loaded) return
    // 只挑认识的字段，缺的补默认值——旧版本存档字段可能不全
    this.snapshot = {
      global: { ...DEFAULT_GLOBAL, ...loaded.global },
      halfLifeTier: loaded.halfLifeTier || DEFAULT_HALF_LIFE_TIER,
      personaId: loaded.personaId ?? '',
      relations: loaded.relations ?? {},
      updatedAt: loaded.updatedAt || Date.now(),
    }
  }

  /** 内部：把快照推进到 now 时刻的回归值，保证后续计算基于最新状态。 */
  private advanceTo(now: number): void {
    const elapsed = now - this.snapshot.updatedAt
    if (elapsed <= 0) return
    const halfLife = resolveHalfLife(this.snapshot.halfLifeTier)
    this.snapshot.global.mood = regress(
      this.snapshot.global.mood,
      this.snapshot.global.moodBaseline,
      elapsed,
      halfLife,
    )
    this.snapshot.global.energy = regress(
      this.snapshot.global.energy,
      this.snapshot.global.energyBaseline,
      elapsed,
      halfLife,
    )
    this.snapshot.updatedAt = now
  }

  /** 读全局两维（已含回归）。 */
  readGlobal(now = Date.now()): GlobalMood {
    this.advanceTo(now)
    return { ...this.snapshot.global }
  }

  /**
   * 写全局两维。传入的字段直接覆盖，未传的保持当前值。
   * 返回是否跨过了关系阈值（本方法只写全局，恒为 false，保留是为接口对称）。
   */
  writeGlobal(patch: Partial<GlobalMood>, now = Date.now()): boolean {
    this.advanceTo(now)
    const next = { ...this.snapshot.global, ...patch }
    this.snapshot.global = {
      mood: clamp(next.mood),
      energy: clamp(next.energy),
      moodBaseline: clamp(next.moodBaseline),
      energyBaseline: clamp(next.energyBaseline),
    }
    this.snapshot.updatedAt = now
    this.dirty = true
    return false
  }

  /** 读某个人的关系四维。没有记录则给初始值（决策 72），但不落盘。 */
  readRelation(participantId: string, now = Date.now()): Relation {
    this.advanceTo(now)
    return this.snapshot.relations[participantId] ?? { ...DEFAULT_RELATION }
  }

  /**
   * 写某个人的关系四维。
   * 返回 true 表示跨过了阈值，调用方应当立即落盘。
   */
  writeRelation(participantId: string, patch: Partial<Relation>, now = Date.now()): boolean {
    this.advanceTo(now)
    const before = this.snapshot.relations[participantId] ?? DEFAULT_RELATION
    const merged = { ...before, ...patch }
    const after: Relation = {
      affection: clamp(merged.affection),
      trust: clamp(merged.trust),
      intimacy: clamp(merged.intimacy),
      familiarity: clamp(merged.familiarity),
    }
    this.snapshot.relations[participantId] = after
    this.snapshot.updatedAt = now
    this.dirty = true
    // 四维任一跨档就算「关系进入了新阶段」，值得立刻落盘
    return (
      crossedThreshold(before.affection, after.affection) ||
      crossedThreshold(before.trust, after.trust) ||
      crossedThreshold(before.intimacy, after.intimacy) ||
      crossedThreshold(before.familiarity, after.familiarity)
    )
  }

  /** 换半衰期档位。 */
  setHalfLifeTier(tier: string, now = Date.now()): void {
    this.advanceTo(now)
    // resolveHalfLife 会兜底非法值，这里直接存档即可
    this.snapshot.halfLifeTier = tier
    this.snapshot.updatedAt = now
    this.dirty = true
  }

  /** 当前档位的毫秒数。 */
  get halfLifeMs(): number {
    return resolveHalfLife(this.snapshot.halfLifeTier)
  }

  /** 记录这份情绪由哪个人格产生（决策 69：仅用于排查，不用于重置判断）。 */
  setPersonaId(personaId: string, now = Date.now()): void {
    this.snapshot.personaId = personaId
    this.snapshot.updatedAt = now
    this.dirty = true
  }

  /** 一键重置回初始值。 */
  reset(now = Date.now()): void {
    this.snapshot = {
      global: { ...DEFAULT_GLOBAL },
      halfLifeTier: DEFAULT_HALF_LIFE_TIER,
      personaId: this.snapshot.personaId,
      relations: {},
      updatedAt: now,
    }
    this.dirty = true
  }

  /** 取快照，供落盘或界面展示。 */
  getSnapshot(): EmotionSnapshot {
    return structuredClone(this.snapshot)
  }

  /** 有未落盘的改动吗。 */
  get isDirty(): boolean {
    return this.dirty
  }

  /** 立刻写存储。失败不抛出——落盘失败不该让调用方崩，但会留下 dirty 标记。 */
  async flush(): Promise<void> {
    if (!this.dirty) return
    await this.store.save(this.getSnapshot())
    this.dirty = false
  }
}

/** 夹在 0..1。情感四维全是这个范围，超界一律按边界处理。 */
function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}
