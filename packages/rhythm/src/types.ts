// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 节奏层的取值类型与默认参数。
 *
 * 这个包只做「怎么把话说出去」：怎么切条、每条隔多久、几点该慢一点。
 * 不判断该不该说（那是 proactive）、也不决定说什么（那是 dialogue）。
 */

export interface RhythmOptions {
  /** 单轮最多几条，来自通道能力（官方 QQ 群聊 4 条） */
  maxMessages: number
  /** 每条的软上限字数，超过就在逗号处再切 */
  maxCharsPerMessage?: number
  /** 打字速度：字/秒，默认 6（接近正常人手机输入） */
  charsPerSecond?: number
  /** 判定「深夜」用的时间戳，默认当前时间 */
  now?: number
}

/** 一条待发送的消息与它之前的等待时长。 */
export interface DeliveryStep {
  text: string
  /** 相对上一条发出后要等多久（毫秒） */
  delayMs: number
}

/** 强分隔：一句话说完了。 */
const STRONG = /([。！？!?；;]+)/

/** 软停顿：话没完，但在喘气。 */
const SOFT = /(…+|—{2,}|\.{3,}|，|,|\n)/

/** 深夜区间：23:00–06:00（本地时间）。 */
export const LATE_NIGHT_START_HOUR = 23
export const LATE_NIGHT_END_HOUR = 6

/** 深夜的时间倍率。夜里打字慢，也更容易多想一会儿。 */
export const LATE_NIGHT_SLOWDOWN = 1.6

/** 默认参数。 */
export const DEFAULT_RHYTHM = {
  charsPerSecond: 6,
  maxCharsPerMessage: 40,
  minDelayMs: 300,
  maxDelayMs: 6000,
} as const
