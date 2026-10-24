// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 记忆存储端口 + 内存实现。
 *
 * 为什么要端口：SQLite 的绑定（better-sqlite3 / node:sqlite）还没最终定，
 * 现在把读写抽成接口，将来换实现只改一个文件，上层不动。
 *
 * 内存实现是**可用的**，不是占位：进程内读写正确、语义完整，
 * 只是重启即丢。S0 阶段够用；接 SQLite 后再谈持久化。
 */

import type { MemoryFact, MemoryRaw } from './types.js'

export interface MemoryStore {
  appendRaw(entry: MemoryRaw): Promise<void>
  appendFact(fact: MemoryFact): Promise<void>
  /**
   * 整条覆盖写入一条已存在的事实。
   *
   * 只为一件事存在：去重时给让位的那条打上 `supersededBy`（M0.4.3）。
   * 不提供「改某个字段」的细粒度接口——事实一旦写进去就是一条历史记录，
   * 能改的只有「它还作不作数」和「被谁取代」。少开口子，少出事。
   */
  updateFact(fact: MemoryFact): Promise<void>
  /** 取某会话最近的原文，按时间倒序 */
  listRaw(sessionKey: string, limit: number): Promise<MemoryRaw[]>
  /** 取某会话全部事实（含已失效的，由上层裁决） */
  listFacts(sessionKey: string): Promise<MemoryFact[]>
  /** 标记这些原文已提炼 */
  markExtracted(ids: string[]): Promise<void>
  /** 软删除事实 */
  softDeleteFact(id: string, at: number): Promise<void>
  /** 取尚未提炼的原文，按时间正序 */
  listUnextracted(limit: number): Promise<MemoryRaw[]>
  /**
   * 取某个会话里尚未提炼的原文，按时间正序。
   *
   * 为什么要单开一个方法而不是「取全局再过滤」：全局取有 20 条上限，
   * 别的会话积压一多，本会话的原文就永远挤不进这一批，
   * 表现成「某个群聊的记忆一直不更新，另一个群聊一切正常」。
   */
  listUnextractedBySession(sessionKey: string, limit: number): Promise<MemoryRaw[]>
}

export function createMemoryStore(): MemoryStore {
  const raws = new Map<string, MemoryRaw>()
  const facts = new Map<string, MemoryFact>()

  return {
    async appendRaw(entry) {
      raws.set(entry.id, { ...entry })
    },
    async appendFact(fact) {
      facts.set(fact.id, { ...fact })
    },
    async updateFact(fact) {
      // 内存实现里「覆盖」就是再 set 一次；先查一下，避免把不存在的 id 凭空造出来
      if (facts.has(fact.id)) facts.set(fact.id, { ...fact })
    },
    async listRaw(sessionKey, limit) {
      return [...raws.values()]
        .filter((r) => r.sessionKey === sessionKey)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
    },
    async listFacts(sessionKey) {
      return [...facts.values()].filter((f) => f.sessionKey === sessionKey)
    },
    async markExtracted(ids) {
      for (const id of ids) {
        const cur = raws.get(id)
        if (cur) raws.set(id, { ...cur, extracted: true })
      }
    },
    async softDeleteFact(id, at) {
      const cur = facts.get(id)
      if (cur) facts.set(id, { ...cur, deletedAt: at })
    },
    async listUnextracted(limit) {
      return [...raws.values()]
        .filter((r) => !r.extracted)
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, limit)
    },
    async listUnextractedBySession(sessionKey, limit) {
      return [...raws.values()]
        .filter((r) => !r.extracted && r.sessionKey === sessionKey)
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, limit)
    },
  }
}
