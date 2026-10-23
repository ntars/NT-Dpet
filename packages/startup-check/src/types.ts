// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * @nt-dpet/startup-check 的类型定义。
 *
 * 这里刻意只描述「采集之后的普通对象」，不出现 cordis 的 Entry、Fiber 等活对象。
 * 理由有两条：
 *   1. 宿主处于开发者预览并自述会破坏兼容，把活对象挡在这一层外，宿主改结构时
 *      只需修 snapshot.ts 一个文件，判定逻辑与单测不受牵连。
 *   2. 判定逻辑能脱离宿主单独测——不用起 cordis 实例，四种场景都能直接构造。
 */

/** 配置树里一个条目的可观测状态。 */
export interface EntrySnapshot {
  /** 条目 id，例如 `nt-dpet:core:emotion`。取不到时是空串。 */
  id: string
  /** 插件包名，例如 `@nt-dpet/emotion`。分组节点没有包名，为 null。 */
  name: string | null
  /**
   * 是否被配置显式禁用（条目的 `disabled` 键）。
   *
   * 注意与「隐私开关」区分：隐私项关的是条目**配置里**的 `enabled`，
   * 条目本身仍然正常挂载并运行。两个词只差一个字母，含义完全不同。
   */
  disabled: boolean
  /** 是否正在运行。判定标准是 fiber 状态为激活，不是「条目存在」。 */
  active: boolean
  /** 启动失败时记下「失败」二字，否则 null。宿主没暴露具体错误文本。 */
  error: string | null
  /**
   * 条目配置里的 `enabled` 值。三项：true、false、undefined（配置里没写这个键）。
   *
   * 没有写成 boolean 是因为「没写」和「写了 true」在自检里含义不同：
   * 前者说明配置层没覆盖到，后者说明有人明确打开了，都得报出来。
   */
  enabled: boolean | undefined
}

/** 一次采集得到的配置树快照。 */
export interface ConfigSnapshot {
  /** 这份快照来自哪个 profile 名。拿不到时为 null。 */
  profileName: string | null
  /** 是否成功读到配置树。读不到时 entries 为空数组。 */
  readable: boolean
  /** 读不到配置树时的原因，读到了则为 null。 */
  reason: string | null
  /**
   * 配置树里的全部叶子条目，**包含被禁用的**。
   *
   * 不预先过滤掉禁用条目，是因为隐私项若被人禁用，恰恰是最该报的异常；
   * 先过滤再判定，就会把它变成「条目缺失」，报错方向就偏了。
   */
  entries: EntrySnapshot[]
}

/** 自检项 id。与 API 输出、界面文案一一对应，不要随意改名。 */
export type CheckId = 'entry-count' | 'privacy-switches' | 'key-packages'

/**
 * 自检项失败的严重程度。
 *
 * - `fatal`：产品底线被破，必须拒绝启动（隐私硬关属此列）。
 * - `warn`：能力降级，照常启动但要让人看见缺了什么。
 *
 * 分这一层不是装饰：M0.3.2 要求隐私项异常时界面走「已拒绝启动」样式，
 * 其余异常只出横幅。没有这个字段，前端只能靠 id 名字硬编码判断。
 */
export type CheckSeverity = 'fatal' | 'warn'

/** 单项自检结果。 */
export interface CheckResult {
  id: CheckId
  ok: boolean
  /** 给人看的说明。通过时写清统计口径，失败时写清原因与涉及的条目。 */
  detail: string
  severity: CheckSeverity
}

/** 一次自检的完整结果。 */
export interface StartupCheckResult {
  /** 全部通过才是 true。 */
  ok: boolean
  checks: CheckResult[]
}

/** 对外暴露的服务。 */
export interface StartupCheckService {
  /** 重跑一次自检。 */
  run(): StartupCheckResult
  /** 最近一次自检结果；尚未跑完时为 null。 */
  last(): StartupCheckResult | null
}

/** 本包提供的服务名。 */
export const STARTUP_CHECK_SERVICE_KEY = 'nt-dpet:startup-check'

/**
 * 必须在激活列表里的关键包。
 *
 * 依据 docs/ARCHITECTURE.md §4：这四个缺席时产品不再成立——
 * 没有 emotion 就没有情绪、没有 memory 就没有记忆、没有 dialogue 就不回话、
 * 没有 persona 就没有人格。缺任何一个都要明示降级，不能装作没事。
 */
export const KEY_PACKAGES = [
  '@nt-dpet/emotion',
  '@nt-dpet/memory',
  '@nt-dpet/dialogue',
  '@nt-dpet/persona',
] as const

/**
 * 必须为 `enabled: false` 的两个隐私条目。
 *
 * 依据 docs/TECH-RESEARCH.md §5.4 与 ARCHITECTURE §16.1：
 * 实测 `DSH_TELEMETRY_DISABLED=1` 关不掉会话日志上传，只有对这两个条目设
 * `enabled: false` 才生效（实测 0/3 携带）。这是产品底线，不是可选偏好。
 */
export const PRIVACY_ENTRIES = [
  'session-log-deepseek',
  'plugin-package-inventory-deepseek',
] as const
