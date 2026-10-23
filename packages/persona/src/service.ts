// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 人格服务：持有配置、按变体拼出 L1 锚点。
 *
 * 边界：本包**不打模型、不写记忆**，只负责「把她说成谁」。
 */

import { buildVars, CAT_LEVEL_HINT, DEFAULT_ADDRESS, substitute } from './vars.js'
import type { CatLevel, L1Variant, PersonaConfig, Relation } from './types.js'

export const PERSONA_SERVICE_KEY = 'nt-dpet:persona'

export interface ComposedEntry {
  id: string
  text: string
}

export interface ComposedAnchor {
  /** 拼好的整段锚点，按 priority 降序 */
  text: string
  entries: ComposedEntry[]
  /** 字符数，供预算校验（350 token 约等于 300 汉字量级） */
  length: number
}

export interface PersonaService {
  getConfig(): PersonaConfig
  /** 改名字 */
  setName(name: string): void
  /** 改关系。未手动指定称呼时，称呼跟着关系变（决策 87） */
  setRelation(relation: Relation): void
  /** 手动指定称呼；传空字符串恢复「跟随关系」 */
  setAddressUser(address: string): void
  setCatLevel(level: CatLevel): void
  /** 当前生效的称呼（含关系默认值兜底） */
  currentAddress(): string
  /** 把一个 L1 变体拼成可注入的锚点；content 为空的条目会被跳过并计入 missing */
  composeAnchor(variant: L1Variant): ComposedAnchor & { missing: string[] }
}

export interface PersonaServiceHandle {
  service: PersonaService
  dispose(): void
}

export function createPersonaService(initial?: Partial<PersonaConfig>): PersonaServiceHandle {
  let config: PersonaConfig = {
    name: initial?.name ?? '小鲸鱼',
    relation: initial?.relation ?? 'sister',
    addressUser: initial?.addressUser,
    catLevel: initial?.catLevel ?? 'normal',
  }

  const service: PersonaService = {
    getConfig() {
      return { ...config }
    },
    setName(name) {
      config = { ...config, name }
    },
    setRelation(relation) {
      // 称呼不在这里写死：addressUser 为空时由 buildVars 落到新关系的默认值
      config = { ...config, relation }
    },
    setAddressUser(address) {
      config = { ...config, addressUser: address.trim() || undefined }
    },
    setCatLevel(level) {
      config = { ...config, catLevel: level }
    },
    currentAddress() {
      const explicit = config.addressUser?.trim()
      if (explicit) return explicit
      return DEFAULT_ADDRESS[config.relation] || config.name
    },
    composeAnchor(variant) {
      const vars = buildVars(config)
      const missing: string[] = []
      const entries: ComposedEntry[] = []

      for (const entry of [...variant.entries].sort((a, b) => b.priority - a.priority)) {
        if (!entry.content) {
          missing.push(entry.id)
          continue
        }
        entries.push({ id: entry.id, text: substitute(entry.content, vars) })
      }

      // 猫娘浓度单独一段：它是语气调参，不写进任何一份变体，避免五份重复维护
      entries.push({ id: 'cat_level', text: CAT_LEVEL_HINT[config.catLevel] })

      const text = entries.map((e) => e.text).join('\n')
      return { text, entries, length: text.length, missing }
    },
  }

  return { service, dispose() {} }
}
