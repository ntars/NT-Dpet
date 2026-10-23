// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * @nt-dpet/emotion — 五维情感状态机、衰减与弥散
 *
 * 设计依据：docs/ARCHITECTURE.md §7（情感系统）、§4.2（四条硬约束）
 * 决策依据：决策 18（五维与归属）、19（回归曲线）、20（弥散）、
 *           21（可见可调）、69（换人格全保留）、72（初始值）
 *
 * 目录：
 *   types.ts    类型与默认值
 *   decay.ts    指数回归（纯函数）
 *   diffuse.ts  弥散（纯函数）
 *   state.ts    状态容器：惰性回归 + 存储端口 + 落盘判定
 *   service.ts  对外服务接口
 */

import type { Context } from '@deepseek-ai/cordis'
import { EMOTION_SERVICE_KEY, createEmotionService } from './service.js'

export const name = 'nt-dpet-emotion'

/** 本包提供的服务名，供其他包 inject 用。 */
export const provide = EMOTION_SERVICE_KEY

export function apply(ctx: Context): () => void {
  const handle = createEmotionService()
  ctx.provide(EMOTION_SERVICE_KEY, handle.service)

  // 启动时读一次持久化状态。当前存储端口默认是内存实现（重启即丢），
  // 等 storage 包就位后会换成 SQLite；读失败不阻塞启动，没有存档就按初始值跑。
  void handle.service.flush()

  return handle.dispose
}
