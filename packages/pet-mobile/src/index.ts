// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * @nt-dpet/pet-mobile — 移动端桌宠（安卓 / 苹果 / 鸿蒙）
 *
 * 状态：**占位，尚未实现**。本包存在的意义是把位置和边界先钉住，
 * 不是提供任何能力。默认 `disabled: true`，不要在实现前启用。
 *
 * 设计依据：docs/ARCHITECTURE.md §11.4（移动端桌宠占位说明）
 *
 * 三端的技术前提（均未验证，属规划）：
 *   - 安卓：可自绘悬浮窗（SYSTEM_ALERT_WINDOW），能做出常驻桌面的立绘
 *   - 苹果：系统**不允许**第三方全局悬浮窗；可行路径是「灵动岛 / 实时活动 /
 *     主屏小组件 + 应用内形象」，本质是"卡片上的她"，不是"桌面上的她"
 *   - 鸿蒙：HarmonyOS NEXT 的服务卡片与万能卡片思路接近苹果，需单独适配
 *
 * 结论：三端的产品形态不一致，不能共用一套渲染实现。
 * 因此本包将来应拆为三个子入口，而不是一个包塞三套逻辑。
 */

import type { Context } from '@deepseek-ai/cordis'

export const name = 'nt-dpet-pet-mobile'

export function apply(ctx: Context): () => void {
  // 有意留空。实现时应先补 ARCHITECTURE §11.4.2 的平台能力对照表。
  void ctx
  return () => {}
}
