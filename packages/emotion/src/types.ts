// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 五维情感的类型定义。
 *
 * 归属分两类（决策 18）：
 *   - 实例全局：mood（心情）、energy（精力）——她此刻整体的状态
 *   - 按人：affection（好感）、trust（信任）、intimacy（亲密）、familiarity（熟悉度）
 *     这四维挂在具体某个人身上，换人不换值
 *
 * 换人格时全部保留（决策 69）——人格是皮肤，不是另一个角色。
 */

/** 实例全局的那两维，带基线（回归的目标值）。 */
export interface GlobalMood {
  /** 此刻心情，0..1 */
  mood: number
  /** 此刻精力，0..1 */
  energy: number
  /** 心情的基线，回归的目标 */
  moodBaseline: number
  /** 精力的基线，恢复的目标 */
  energyBaseline: number
}

/** 按人的那四维。 */
export interface Relation {
  /** 好感 */
  affection: number
  /** 信任，慢涨快跌 */
  trust: number
  /** 亲密 */
  intimacy: number
  /** 熟悉度，决定注入多少画像，也决定弥散时受多少牵连 */
  familiarity: number
}

/** 一次完整的情绪快照，用于落盘与恢复。 */
export interface EmotionSnapshot {
  global: GlobalMood
  /** 半衰期档位，见 decay.ts */
  halfLifeTier: string
  /** 记录产生这份情绪的人格，仅用于排查（决策 69） */
  personaId: string
  /** 各参与者的关系，键为 participant id */
  relations: Record<string, Relation>
  /** 上次发生变化的毫秒时间戳，回归计算的时间原点 */
  updatedAt: number
}

/** 关系四维的初始值（决策 72）：略有好感，但不亲近。 */
export const DEFAULT_RELATION: Readonly<Relation> = Object.freeze({
  affection: 0.1,
  trust: 0.1,
  intimacy: 0,
  familiarity: 0,
})

/** 全局两维的初始值（决策 72）。 */
export const DEFAULT_GLOBAL: Readonly<GlobalMood> = Object.freeze({
  mood: 0.5,
  energy: 0.7,
  moodBaseline: 0.5,
  energyBaseline: 0.7,
})
