// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * @nt-dpet/persona — 人格配置、关系称呼联动、L1 锚点拼装
 *
 * 设计依据：docs/ARCHITECTURE.md §8（人格系统）、§8.1（称呼默认值随关系走）
 * 决策依据：决策 28-33、69-72、87
 *
 * 当前范围：配置与变量替换、猫娘浓度注入、变体拼装都可用；
 * 五份 L1 文本已撰写（personas/xiaojingyu/variants/）。
 */

import type { Context } from '@deepseek-ai/cordis'
import { PERSONA_SERVICE_KEY, createPersonaService } from './service.js'

export { PERSONA_SERVICE_KEY } from './service.js'
export type { ComposedAnchor, ComposedEntry, PersonaService } from './service.js'
export type { CatLevel, L1Entry, L1Variant, PersonaConfig, Relation } from './types.js'
export { CAT_LEVEL_HINT, DEFAULT_ADDRESS, buildVars, substitute } from './vars.js'

export const name = 'nt-dpet-persona'

export const provide = PERSONA_SERVICE_KEY

export function apply(ctx: Context): () => void {
  const handle = createPersonaService()
  ctx.provide(PERSONA_SERVICE_KEY, handle.service)
  return handle.dispose
}
