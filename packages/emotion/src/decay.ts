/**
 * 指数回归：让情绪随时间回到基线（决策 19）。
 *
 *   v(t) = baseline + (v₀ - baseline) × exp(-λ·t)
 *   λ = ln(2) / 半衰期
 *
 * 为什么用指数而不是线性：人的情绪「刚开始淡得快，越久越淡」，
 * 指数曲线符合这个直觉；线性会在某个时刻突然归零，很假。
 */

/** 半衰期四档预设，单位毫秒。 */
export const HALF_LIFE_PRESETS = {
  /** 快速：一小时就淡下去 */
  fast: 60 * 60 * 1000,
  /** 标准：四小时，默认 */
  standard: 4 * 60 * 60 * 1000,
  /** 缓慢：半天才淡 */
  slow: 12 * 60 * 60 * 1000,
  /** 不回归：记一辈子 */
  never: Number.POSITIVE_INFINITY,
} as const

export type HalfLifeTier = keyof typeof HALF_LIFE_PRESETS

/** 默认档位（决策 19：默认标准）。 */
export const DEFAULT_HALF_LIFE_TIER: HalfLifeTier = 'standard'

/** 把档位名换成毫秒数；不认识的名字按标准档处理，不抛错。 */
export function resolveHalfLife(tier: string | undefined): number {
  if (tier && tier in HALF_LIFE_PRESETS) {
    return HALF_LIFE_PRESETS[tier as HalfLifeTier]
  }
  return HALF_LIFE_PRESETS[DEFAULT_HALF_LIFE_TIER]
}

/**
 * 衰减系数 λ = ln(2) / 半衰期。
 *
 * 半衰期为 ∞（不回归）或非法值时返回 0，表示「完全不衰减」。
 */
export function decayLambda(halfLifeMs: number): number {
  if (!Number.isFinite(halfLifeMs) || halfLifeMs <= 0) return 0
  return Math.LN2 / halfLifeMs
}

/** 把 x 夹在 a 与 b 之间（不关心谁大谁小）。 */
function clampBetween(x: number, a: number, b: number): number {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return Math.min(hi, Math.max(lo, x))
}

/**
 * 计算经过 elapsedMs 之后，value 回归到什么位置。
 *
 * 边界全部走保护路径，不抛异常：
 *   - value / baseline 非有限数 → 原样返回 value
 *   - elapsedMs <= 0 或非有限 → 原样返回 value（没过去，就没回归）
 *   - 半衰期 ∞ 或 <= 0 → 原样返回 value（不回归）
 */
export function regress(
  value: number,
  baseline: number,
  elapsedMs: number,
  halfLifeMs: number,
): number {
  if (!Number.isFinite(value) || !Number.isFinite(baseline)) return value
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return value
  const lambda = decayLambda(halfLifeMs)
  if (lambda === 0) return value
  const drifted = baseline + (value - baseline) * Math.exp(-lambda * elapsedMs)
  // 指数回归理论上落在 baseline 与 value 之间；夹一次只为抵御浮点误差
  return clampBetween(drifted, value, baseline)
}
