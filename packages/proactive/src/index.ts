/**
 * @nt-dpet/proactive — 主动消息三重闸门
 *
 * 状态：骨架，尚未实现
 * 设计依据：docs/ARCHITECTURE.md §10.8（三重闸门定义）
 *           docs/ARCHITECTURE.md §10.5（被动唤醒，与本包互不占额度）
 * 决策依据：docs/DECISIONS.md 决策 74（唤醒随机开口 10%，可调）
 *           docs/DECISIONS.md S3（拒绝权 / 双日记 / 沉默衰减，**待主人确认**）
 *
 * 三道闸门顺序固定：时机 → 话由 → 分寸。前一道不过，后面不计。
 */

import type { Context } from '@deepseek-ai/cordis'

export const name = 'nt-dpet-proactive'

export function apply(ctx: Context): void {
  // TODO: 实现见 docs/ARCHITECTURE.md §10.8
  void ctx
}
