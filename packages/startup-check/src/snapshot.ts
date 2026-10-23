// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 从运行中的宿主采集一份配置树快照。
 *
 * 这是本包**唯一**接触宿主内部结构的文件。宿主是开发者预览、自述会破坏兼容，
 * 所以读取方式全部按「结构对得上就用」处理：只声明自己需要的几个字段，
 * 不 import 宿主的 Entry 类型。宿主改了内部结构，坏的只会是这个文件，
 * 判定逻辑和单测都不受影响。
 *
 * 字段依据（2026-10-24 于本机 0.2.1-rc.2 核对）：
 *   - `profileContext` 由 dsh 在 `hostCtx.provide("profileContext", ...)` 注册，
 *     字段含 name / dir / startedBundles / home 等。
 *   - 配置树由 `ctx.loader.entries()` 迭代，叶子条目带 `options`、`fiber`、
 *     `subgroup`；`entry.id` 与 `entry.disabled` 都是 getter。
 *   - fiber.state：0 未就绪、2 激活、3 失败、4 未挂载。
 */

import type { Context } from '@deepseek-ai/cordis'

import type { ConfigSnapshot, EntrySnapshot } from './types.js'

/** 宿主 fiber 状态码里「已激活」的那一个。 */
const FIBER_ACTIVE = 2

/** 宿主 fiber 状态码里「启动失败」的那一个。 */
const FIBER_ERROR = 3

/** loader 的最小可用形状。 */
export interface LoaderLike {
  entries(): Iterable<EntryLike>
}

/** 配置树条目的最小可用形状。所有字段都按「可能取不到」处理。 */
export interface EntryLike {
  options?: {
    id?: unknown
    name?: unknown
    group?: unknown
    config?: unknown
  }
  fiber?: { state?: unknown }
  subgroup?: unknown
}

/** profileContext 里本包用得到的部分。 */
interface ProfileLike {
  name?: unknown
}

/** 安全读一个 getter：宿主内部 getter 依赖父节点，取不到时会抛。 */
function safeRead<T>(read: () => T, fallback: T): T {
  try {
    return read()
  } catch {
    return fallback
  }
}

/** 从条目配置里读 `enabled`；只有明确的布尔值才算读到。 */
function readEnabled(config: unknown): boolean | undefined {
  if (typeof config !== 'object' || config === null) return undefined
  const value = (config as { enabled?: unknown }).enabled
  return typeof value === 'boolean' ? value : undefined
}

/** 把一个宿主条目转成快照项；分组节点返回 null。 */
function toSnapshot(entry: EntryLike): EntrySnapshot | null {
  const options = entry.options ?? {}

  // 分组只是容器，自己不会 apply，也没有包名——统计进去必然对不上数。
  // 宿主两种写法都见过：options.group 标记，或运行期挂出 subgroup。
  const isGroup = Boolean(options.group) || entry.subgroup !== undefined
  if (isGroup) return null

  const rawName = options.name
  const name = typeof rawName === 'string' && rawName.length > 0 ? rawName : null
  // id 优先读条目自身的 getter（它会拼上父级前缀，是全局唯一的那种），
  // 取不到再退回配置里的原始 id。真实宿主两者都有，但只在旁路构造的对象
  // （比如单测里手写的假条目）上才只有后者，缺了回退就会把 id 读成空串。
  const id = safeRead(() => {
    const value = (entry as { id?: unknown }).id
    return typeof value === 'string' && value.length > 0 ? value : ''
  }, '')
  const rawId = options.id
  const fallbackId = typeof rawId === 'string' && rawId.length > 0 ? rawId : ''
  const resolvedId = id.length > 0 ? id : fallbackId
  const disabled = safeRead(() => Boolean((entry as { disabled?: unknown }).disabled), false)

  const state = entry.fiber?.state
  const active = state === FIBER_ACTIVE
  const error = state === FIBER_ERROR ? '失败' : null

  // 没有 id 也没有包名的条目在报告里无法定位，仍保留但用占位符标明，
  // 免得「条目数对不上」却列不出一条具体是谁。
  return {
    id: resolvedId.length > 0 ? resolvedId : (name === null ? '(未命名条目)' : name),
    name,
    disabled,
    active,
    error,
    enabled: readEnabled(options.config),
  }
}

/**
 * 从 loader 采一份快照。
 *
 * 单独抽出来是为了可测：单测直接塞一个假 loader 进来，就能验证分组排除、
 * 禁用标记、getter 抛错这些只在真实宿主里才会碰到的边角，
 * 不必为了测一次转换去启动一整个 cordis 实例。
 */
export function snapshotFromLoader(
  loader: LoaderLike | undefined,
  profileName: string | null,
): ConfigSnapshot {
  if (loader === undefined || typeof loader.entries !== 'function') {
    return {
      profileName,
      readable: false,
      reason: 'loader 服务不可用',
      entries: [],
    }
  }

  const entries: EntrySnapshot[] = []
  try {
    for (const entry of loader.entries()) {
      const snapshot = toSnapshot(entry)
      if (snapshot !== null) entries.push(snapshot)
    }
  } catch (error) {
    return {
      profileName,
      readable: false,
      reason: `遍历配置树时出错：${error instanceof Error ? error.message : String(error)}`,
      entries: [],
    }
  }

  return {
    profileName,
    readable: true,
    reason: null,
    entries,
  }
}

/**
 * 从运行中的上下文采集快照。
 *
 * 拿不到服务时不抛异常，而是返回 `readable: false` 加原因——自检本身绝不能
 * 成为启动失败的原因，它只负责如实说出现在是什么状况。
 */
export function collectSnapshot(ctx: Context): ConfigSnapshot {
  const profile = ctx.get('profileContext') as ProfileLike | undefined
  const profileName =
    profile !== undefined && typeof profile.name === 'string' ? profile.name : null
  return snapshotFromLoader(ctx.get('loader') as LoaderLike | undefined, profileName)
}
