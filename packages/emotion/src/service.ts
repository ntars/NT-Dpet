// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 对外暴露的情绪服务。
 *
 * 其他包（对话、表达、主动性）要读情绪时，inject 这个服务，
 * 不要直接碰 EmotionState——那样会把内部的不变量暴露出去。
 */

import { DEFAULT_DIFFUSE_COEFFICIENT, diffuseOffset } from './diffuse.js'
import { EmotionState, PERSIST_INTERVAL_MS, type EmotionStore } from './state.js'
import type { EmotionSnapshot, GlobalMood, Relation } from './types.js'

export interface EmotionService {
  /** 读全局两维，已含时间回归 */
  readGlobal(): GlobalMood
  /** 写全局两维（界面滑块、事件驱动都走这里） */
  setGlobal(patch: Partial<GlobalMood>): void
  /** 读某人的关系四维，没有记录则给初始值 */
  getRelation(participantId: string): Relation
  /** 写某人的关系四维，跨阈值会自动触发落盘 */
  setRelation(participantId: string, patch: Partial<Relation>): void
  /**
   * 心情对某个人的弥散偏移（决策 20）。
   * 正数＝爱屋及乌，负数＝迁怒。熟悉度越高偏移越小。
   */
  diffuseTo(participantId: string): number
  /** 换半衰期档位 */
  setHalfLifeTier(tier: string): void
  /** 记录产生当前情绪的人格，仅用于排查（决策 69） */
  setPersonaId(personaId: string): void
  /** 一键重置 */
  reset(): void
  /** 取快照，供界面展示或还原点使用 */
  snapshot(): EmotionSnapshot
  /** 立刻落盘 */
  flush(): Promise<void>
  /** 停掉定时落盘。调用后本服务不可再用。 */
  dispose(): void
}

/** 服务在 Context 上的键名。全项目唯一，命名规范 nt-dpet:core:<名>。 */
export const EMOTION_SERVICE_KEY = 'nt-dpet:emotion'

export interface EmotionServiceHandle {
  service: EmotionService
  /** 插件卸载时调用，清理定时器 */
  dispose(): void
}

export function createEmotionService(store?: EmotionStore): EmotionServiceHandle {
  const state = new EmotionState(store)
  let disposed = false

  // 落盘策略（§7.6）：内存当前值 → 每 60 秒批量落盘 → 退出时强制落盘
  // 用 unref 是为了不让这个定时器拦住 Node 进程自然退出
  const timer = setInterval(() => {
    void state.flush()
  }, PERSIST_INTERVAL_MS)
  timer.unref?.()

  const service: EmotionService = {
    readGlobal() {
      return state.readGlobal()
    },

    setGlobal(patch) {
      state.writeGlobal(patch)
    },

    getRelation(participantId) {
      return state.readRelation(participantId)
    },

    setRelation(participantId, patch) {
      // 跨阈值时 writeRelation 返回 true，此时立即落盘而不是等下一个 60 秒周期
      const crossed = state.writeRelation(participantId, patch)
      if (crossed) void state.flush()
    },

    diffuseTo(participantId) {
      const { mood, moodBaseline } = state.readGlobal()
      const { familiarity } = state.readRelation(participantId)
      return diffuseOffset(mood, moodBaseline, DEFAULT_DIFFUSE_COEFFICIENT, familiarity)
    },

    setHalfLifeTier(tier) {
      state.setHalfLifeTier(tier)
    },

    setPersonaId(personaId) {
      state.setPersonaId(personaId)
    },

    reset() {
      state.reset()
    },

    snapshot() {
      return state.getSnapshot()
    },

    async flush() {
      await state.flush()
    },

    dispose() {
      if (disposed) return
      disposed = true
      clearInterval(timer)
      // 退出前强制落盘（§7.6）。不 await——卸载流程不该被 IO 卡住，
      // 内存存储是同步的，SQLite 实现应保证进程退出前写完。
      void state.flush()
    },
  }

  return { service, dispose: service.dispose }
}
