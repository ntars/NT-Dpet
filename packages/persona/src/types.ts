// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/** 关系定位五选一（决策 32、87）。 */
export type Relation = 'sister' | 'partner' | 'friend' | 'assistant' | 'parent'

/** 猫娘浓度三档（决策 70）。 */
export type CatLevel = 'light' | 'normal' | 'heavy'

export interface PersonaConfig {
  /** 她的名字 */
  name: string
  /** 关系定位 */
  relation: Relation
  /**
   * 她怎么叫用户。为空表示「跟随关系默认值」；
   * 一旦用户手动改过，就固定下来，不再随关系联动（决策 87）。
   */
  addressUser?: string
  /** 猫娘浓度 */
  catLevel: CatLevel
}

/** L1 变体文件的结构（对应 personas/xiaojingyu/variants/*.json）。 */
export interface L1Entry {
  id: string
  priority: number
  always: boolean
  content: string | null
  todo?: string
}

export interface L1Variant {
  layer: 'L1'
  name: string
  budget: number
  relationship: Relation
  notes?: string
  entries: L1Entry[]
}
