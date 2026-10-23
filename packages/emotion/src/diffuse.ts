// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 弥散：心情会迁怒到别人头上（决策 20）。
 *
 *   对 B 的态度偏移 = (mood - baseline) × 弥散系数 × (1 - 关系距离系数)
 *   关系距离系数 = familiarity × 0.5
 *
 * 反直觉但正确：陌生人反而更容易被殃及。因为不熟的人，
 * 她没理由为他区分「这不是你的错」。越熟，越能就事论事。
 */

/** 弥散系数初始值（决策 20 定 0.4，实测调）。 */
export const DEFAULT_DIFFUSE_COEFFICIENT = 0.4

/** 熟悉度 → 关系距离的换算系数。familiarity 0 时距离 0（最容易被殃及），1 时距离 0.5。 */
export const FAMILIARITY_TO_DISTANCE = 0.5

/** 把数值夹在 0..1，情感四维全是这个范围。 */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/**
 * 算对某个人的态度偏移量。
 *
 * 心情在基线之上 → 偏移为正（爱屋及乌）；在基线之下 → 偏移为负（迁怒）。
 * 熟悉度越高，偏移越小。
 */
export function diffuseOffset(
  mood: number,
  moodBaseline: number,
  coefficient: number,
  familiarity: number,
): number {
  const safeMood = clamp01(mood)
  const safeBaseline = clamp01(moodBaseline)
  const safeFamiliarity = clamp01(familiarity)
  const distance = safeFamiliarity * FAMILIARITY_TO_DISTANCE
  return (safeMood - safeBaseline) * coefficient * (1 - distance)
}
