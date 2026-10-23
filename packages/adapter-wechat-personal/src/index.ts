// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * @nt-dpet/adapter-wechat-personal — 个人微信通道
 *
 * 状态：骨架，尚未实现。**默认 disabled: true，启用需用户二次确认。**
 * 设计依据：docs/ARCHITECTURE.md §10.9、docs/TECH-RESEARCH.md §5.7.1
 *
 * 技术前提（分平台，不能共用一套代码）：
 *   - Windows：UIAutomation（wxauto 同思路）
 *   - macOS：AppleScript + Accessibility API
 *   两者都是「替你点鼠标」，不是官方接口，微信界面一改就碎。
 *
 * 三条硬约束（不可由配置绕过）：
 *   1. 只发不收——不读取任何历史消息，避免触碰全部聊天记录
 *   2. 申请「辅助功能」权限前必须明示：拿到的是整机 UI 控制权
 *   3. 默认关闭，开启时全屏风险确认，文案写明可能永久封号
 */

import type { Context } from '@deepseek-ai/cordis'

export const name = 'nt-dpet-adapter-wechat-personal'

export function apply(ctx: Context): () => void {
  // TODO: 实现见 docs/ARCHITECTURE.md 对应章节
  void ctx
  return () => {}
}
