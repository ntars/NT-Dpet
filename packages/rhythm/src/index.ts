// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * @nt-dpet/rhythm — 分条、停顿、深夜变慢
 *
 * 设计依据：docs/ARCHITECTURE.md §3.4（分条与节奏）、§10.3（分条上限）
 * 决策依据：决策 39（分条上限，官方 QQ 群聊 4 条）、75（表达闸门中的频次）
 *
 * 纯计算，无副作用、无依赖。所有函数都可直接单测。
 */

import type { Context } from '@deepseek-ai/cordis'

export const name = 'nt-dpet-rhythm'

export {
  estimateTypingMs,
  isLateNight,
  mergeToLimit,
  planDelivery,
  splitSentences,
} from './rhythm.js'
export type { DeliveryStep, RhythmOptions } from './types.js'
export { DEFAULT_RHYTHM, LATE_NIGHT_SLOWDOWN } from './types.js'

export function apply(ctx: Context): () => void {
  // 纯函数包，不提供服务、不持有资源。挂载即用，卸载无事可做。
  void ctx
  return () => {}
}
