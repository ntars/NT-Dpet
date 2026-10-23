// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * @nt-dpet/startup-check — 启动自检
 *
 * 设计依据：docs/ARCHITECTURE.md §4（三条启动判据）、§16.1（隐私硬关）
 * 依据数据：docs/TECH-RESEARCH.md §5.4（隐私开关实测）、§5.2（profile 机制）
 *
 * 目录：
 *   types.ts     类型、服务名、关键包与隐私条目清单
 *   checks.ts    判定逻辑（纯函数，可脱离宿主单测）
 *   snapshot.ts  从宿主采集配置树快照
 *   index.ts     插件入口
 *
 * 本包只负责**判定与报告**，不负责拒绝启动。拒绝启动是渲染层的事（M0.3.2）：
 * 判定与执行分开，才能在不改动自检逻辑的前提下调整「哪一档该拦、哪一档只警告」。
 */

import type { Context } from '@deepseek-ai/cordis'

import { evaluateStartup } from './checks.js'
import { collectSnapshot } from './snapshot.js'
import {
  STARTUP_CHECK_SERVICE_KEY,
  type StartupCheckResult,
  type StartupCheckService,
} from './types.js'

export * from './types.js'
export { evaluateStartup, failingChecks } from './checks.js'
export { collectSnapshot, snapshotFromLoader } from './snapshot.js'

export const name = 'nt-dpet-startup-check'

/** 本包提供的服务名，供其他包 inject 用。 */
export const provide = STARTUP_CHECK_SERVICE_KEY

/**
 * 依赖宿主的 `profileContext`（2026-10-24 于 0.2.1-rc.2 核实确实存在，
 * 由 dsh 启动时 `hostCtx.provide("profileContext", ...)` 注册）。
 *
 * 它是必选项而非可选项的理由：这个服务的核心字段是 profile 的 `dir` 与
 * `startedBundles`，正是「这份配置树属于哪个 profile」的凭据。拿不到它，
 * 自检出来的条目数就无从归属，报出来的异常也没法定位到实例——
 * 与其捂着给一个不完整的结论，不如让宿主干脆不激活本插件。
 */
export const inject = ['profileContext']

/** loader 里本模块用得到的部分。 */
interface LoaderLike {
  await?(): Promise<void>
}

export function apply(ctx: Context): () => void {
  let latest: StartupCheckResult | null = null

  const service: StartupCheckService = {
    run(): StartupCheckResult {
      latest = evaluateStartup(collectSnapshot(ctx))
      return latest
    },
    last(): StartupCheckResult | null {
      return latest
    },
  }

  ctx.provide(STARTUP_CHECK_SERVICE_KEY, service)

  /**
   * 等到配置树 settle 再跑第一次。
   *
   * 刚 apply 时其他插件还在陆续启动，此刻统计「激活数」必然把还在路上的条目
   * 全算成未激活——那不是自检，是自扰。`loader.await()` 等到没有待办的
   * import 与生命周期任务为止，这时得到的快照才有意义。
   *
   * 失败也照跑：等不到 settle 本身就是一种要报的状况，不能因此让自检缺席。
   */
  const loader = ctx.get('loader') as LoaderLike | undefined
  const ready = loader?.await?.()
  if (ready === undefined) {
    service.run()
  } else {
    void ready.then(
      () => void service.run(),
      () => void service.run(),
    )
  }

  return () => {
    latest = null
  }
}
