// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 人格变量：把配置变成可替换的占位值（决策 87）。
 *
 * 文本里统一用 `{{name}}`、`{{callUser}}` 这类占位；
 * 同时兼容 `$name`、`$callUser` 写法，方便手写模板。
 */

import type { CatLevel, PersonaConfig, Relation } from './types.js'

/** 关系 → 默认称呼（决策 87）。用户改过就用用户的。 */
export const DEFAULT_ADDRESS: Record<Relation, string> = {
  sister: '哥哥',
  partner: '宝宝',
  friend: '',      // 朋友直呼名字，由 UI 用昵称填
  assistant: '主人',
  parent: '爸爸',
}

/** 猫娘浓度的语气指令（决策 70）：三档差别写在这，不散落到各变体里。 */
export const CAT_LEVEL_HINT: Record<CatLevel, string> = {
  light: '语气清淡：几乎不用语气词，句子完整，情绪点到为止。',
  normal: '语气自然：句尾偶尔一个「呀」「呢」，撒娇只在真正亲近时出现。',
  heavy: '语气黏一点：常用「喵」「呀」收尾，会主动讨摸头，但不许刷屏式叠字。',
}

/** 把配置展开成变量表。 */
export function buildVars(config: PersonaConfig): Record<string, string> {
  const relation = config.relation
  const address = config.addressUser?.trim()
    || DEFAULT_ADDRESS[relation]
    || config.name
  return {
    name: config.name,
    callUser: address,
    relation,
    catLevel: config.catLevel,
    catHint: CAT_LEVEL_HINT[config.catLevel],
  }
}

/**
 * 替换占位符。支持 `{{key}}` 与 `$key` 两种写法。
 * 认不出的占位**原样保留**——静默清空会让文本读起来像缺字，反而更难查。
 */
export function substitute(text: string, vars: Record<string, string>): string {
  return text
    .replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (m, k: string) => vars[k] ?? m)
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, k: string) => vars[k] ?? m)
}
