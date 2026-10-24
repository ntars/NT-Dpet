// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 事实去重（M0.4.3，决策 24「用户手改优先」）。
 *
 * 为什么要去重：同一件事每轮对话都可能被提炼一次。不去重的话，
 * 「喜欢 喝冰美式」会在库里躺十条一模一样的行，检索时十条一起挤进
 * topK，把真正的新信息顶出去——记忆越用越糊。
 *
 * 裁决不是「删旧的」，而是**留一条生效、其余标失效**：
 * `supersededBy` 指向胜者，行本身还在库里，追溯「她什么时候改的口」
 * 才有据可查。物理删除留给上层，本模块不删任何东西。
 *
 * 这个文件是纯函数，不碰存储、不认识 ctx，方便单测穷举。
 */

import type { MemoryFact } from './types.js'

/** 参与比对的三个字段。`subjectId` 为 null 表示「不指向具体某个人」。 */
export interface FactKeyInput {
  subjectId: string | null
  predicate: string
  object: string
}

/**
 * 归一化文本。
 *
 * 模型输出经常带尾巴空格、连续空格，英文还会一会儿大写一会儿小写。
 * 不归一化就会「喜欢 喝咖啡」和「喜欢 喝咖啡 」各记一条，
 * 看着像两条、其实是同一条。
 */
function norm(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** `subjectId` 为 null 时的占位符：用一个正常 id 里不会出现的控制字符。 */
const NO_SUBJECT = '\u0001'

/**
 * 去重键：主语 + 谓词 + 宾语。
 *
 * 为什么任务里只写了 `predicate+object`，这里还带上 `subjectId`：
 * 会话键 `group:x` 之下会有多个说话人（ARCHITECTURE §5.1），
 * 「A 喜欢 猫」和「B 喜欢 猫」在同一个群里是完全不同的两件事。
 * 只看谓词和宾语会把两个人的事实并成一条，检索出来就变成
 * 「B 喜欢 猫」顶着 A 的出处——这比重复更糟。
 * 私聊场景里 `subjectId` 恒定，带上它等于没加，行为与任务原文一致。
 */
export function factKey(f: FactKeyInput): string {
  // 用 \u0000 分隔，防止「谓词以空格结尾 + 宾语以空格开头」这类拼串歧义
  return [f.subjectId ?? NO_SUBJECT, norm(f.predicate), norm(f.object)].join('\u0000')
}

/** 一条事实是否还生效（未被取代、未被软删除）。 */
export function isActive(f: MemoryFact): boolean {
  return f.deletedAt === null && f.supersededBy === null
}

/**
 * 从同键的若干条有效事实里选「擂主」。
 *
 * 顺序：手改优先 → 重要度高优先 → 先入为主（`createdAt` 早者）。
 * 最后这条不是随手写的：提炼是周期性的，两条同分事实若让新的一条赢，
 * 每次提炼都会换一次 id，`supersededBy` 链越滚越长，而信息量没变。
 * 同分就认旧的，库才稳定。
 */
function pickHolder(actives: MemoryFact[]): MemoryFact {
  return actives.reduce((best, cur) => {
    if (cur.manuallyEdited !== best.manuallyEdited) return cur.manuallyEdited ? cur : best
    if (cur.importance !== best.importance) return cur.importance > best.importance ? cur : best
    return cur.createdAt < best.createdAt ? cur : best
  })
}

/** 写入裁决结果。 */
export interface FactWritePlan {
  /** 实际要入库的那一行；它的 `supersededBy` 非空表示「入库即失效」 */
  fact: MemoryFact
  /** 最终生效的那条事实 id（可能就是库里已有的旧事实） */
  winnerId: string
  /** 需要被标记失效的既有事实（历史重复 + 本次让位者），调用方逐条写回 */
  supersede: MemoryFact[]
}

/**
 * 决定一条新事实该怎么写。
 *
 * @param existing 同一会话的全部事实（`store.listFacts` 的返回）
 * @param candidate 待写入的新事实，`id` 必须已经分配好
 */
export function planFactWrite(existing: MemoryFact[], candidate: MemoryFact): FactWritePlan {
  const key = factKey(candidate)
  const actives = existing.filter((f) => isActive(f) && factKey(f) === key)

  // 没撞上：直接写，谁也不用让位
  if (actives.length === 0) {
    return { fact: candidate, winnerId: candidate.id, supersede: [] }
  }

  const holder = pickHolder(actives)
  /** 同键的历史重复（本次新事实之外的多余行），一并挂到胜者名下。 */
  const duplicates = actives.filter((f) => f.id !== holder.id)

  let candidateWins: boolean
  if (candidate.manuallyEdited !== holder.manuallyEdited) {
    // 用户手改过的那条是最终裁决，模型说得再重也不覆盖（决策 24）
    candidateWins = candidate.manuallyEdited
  } else if (candidate.manuallyEdited) {
    // 两条都是手改的：说明用户前后改了两次同一件事，认后一次。
    // 这里不能退回去比重要度——手改是人的判断，不该让分数把它顶回来。
    candidateWins = true
  } else if (candidate.importance !== holder.importance) {
    candidateWins = candidate.importance > holder.importance
  } else {
    candidateWins = false
  }

  if (candidateWins) {
    return {
      fact: candidate,
      winnerId: candidate.id,
      supersede: [holder, ...duplicates],
    }
  }

  // 新事实输了：仍然入库，但生下来就是失效行。
  // 不直接丢掉的理由——模型这次这么认为，这条判断本身是证据，
  // 将来查「为什么她记成了这样」要靠它。
  return {
    fact: { ...candidate, supersededBy: holder.id },
    winnerId: holder.id,
    supersede: duplicates,
  }
}
