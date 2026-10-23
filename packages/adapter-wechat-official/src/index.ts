// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * @nt-dpet/adapter-wechat-official — 微信公众号通道
 *
 * 状态：骨架，尚未实现
 * 设计依据：docs/ARCHITECTURE.md §10.1（双轨策略）、§10.2（官方通道硬限制）
 *
 * 合规路径，与个人号完全不同：
 *   - 走微信公众平台官方接口（服务号 / 订阅号 / 客服消息 / 模板消息）
 *   - 使用公众号自身的 AppID，不触碰用户个人账号
 *   - 被动回复有 48 小时窗口（客服消息），超出需模板消息或用户重新触发
 *
 * 限制（写死在设计里，不在代码里临时判断）：
 *   - 订阅号无客服接口，只能被动回复
 *   - 服务号需认证（年审），认证后才能用客服消息与模板消息
 *   - 群发有次数限制（订阅号 1 次/天，服务号 4 次/月）
 */

import type { Context } from '@deepseek-ai/cordis'

export const name = 'nt-dpet-adapter-wechat-official'

export function apply(ctx: Context): () => void {
  // TODO: 实现见 docs/ARCHITECTURE.md 对应章节
  void ctx
  return () => {}
}
