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
  /** 把多个变体合并成可注入的锚点（决策 91：内核 + 关系微调） */
  compose(...variants: L1Variant[]): ComposedAnchor & { missing: string[] }
  /** 单个变体的快捷方式，等价于 compose(variant) */
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
    compose(...variants) {
      const vars = buildVars(config)
      const missing: string[] = []
      const byId = new Map<string, ComposedEntry>()

      // 后传入的变体覆盖同 id 的条目（变体优先级高于内核）
      for (const variant of variants) {
        for (const entry of variant.entries) {
          if (!entry.content) {
            missing.push(entry.id)
            continue
          }
          byId.set(entry.id, { id: entry.id, text: substitute(entry.content, vars) })
        }
      }

      // 按条目自身优先级排序：内核的身份/性格排在关系微调之前
      const priorityOf = new Map<string, number>()
      for (const variant of variants) for (const e of variant.entries) priorityOf.set(e.id, e.priority)
      const entries = [...byId.values()].sort(
        (a, b) => (priorityOf.get(b.id) ?? 0) - (priorityOf.get(a.id) ?? 0),
      )

      // 猫娘浓度单独一段：它是语气调参，不写进任何一份变体，避免五份重复维护
      entries.push({ id: 'cat_level', text: CAT_LEVEL_HINT[config.catLevel] })

      const text = entries.map((e) => e.text).join('\n')
      return { text, entries, length: text.length, missing }
    },

    composeAnchor(variant) {
      return service.compose(variant)
    },
  }

  return { service, dispose() {} }
}
