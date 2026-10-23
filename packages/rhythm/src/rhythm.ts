// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 分条、停顿、深夜变慢——全部是纯函数，可单测、不依赖宿主。
 *
 * 分条的两条判据（见 ARCHITECTURE §3.4）：
 *   1. 强分隔（。！？；）——这句说完了，切
 *   2. 软停顿（……、——、逗号）——话没完但在喘气，**太长的句子**才在软停顿处切
 *
 * 设计取向：宁可少切，不要切碎。一句「嗯……算了吧，你先忙。」
 * 如果切成四条，读起来像口吃；切成两条（「嗯……算了吧，」/「你先忙。」）才像人。
 */

import { DEFAULT_RHYTHM, LATE_NIGHT_END_HOUR, LATE_NIGHT_SLOWDOWN, LATE_NIGHT_START_HOUR } from './types.js'
import type { DeliveryStep, RhythmOptions } from './types.js'

const STRONG = /([。！？!?；;]+)/
const SOFT = /([…]+|—{2,}|\.{3,}|[，,])/

/** 是否深夜（本地时间 23:00–06:00）。 */
export function isLateNight(now: number = Date.now()): boolean {
  const h = new Date(now).getHours()
  return h >= LATE_NIGHT_START_HOUR || h < LATE_NIGHT_END_HOUR
}

/** 去掉首尾空白；单个分隔符不留空条。 */
function tidy(s: string): string {
  return s.replace(/^[\s，,]+/, '').replace(/[\s]+$/, '').trim()
}

/**
 * 先按强分隔切成句子，再对过长句子按软停顿二次切分。
 * 软停顿只有当句子超过 maxCharsPerMessage 时才参与切分。
 */
export function splitSentences(text: string, maxCharsPerMessage: number = DEFAULT_RHYTHM.maxCharsPerMessage): string[] {
  const raw = text.trim()
  if (!raw) return []

  const pieces: string[] = []
  // 强分隔切句，保留分隔符
  const parts = raw.split(STRONG)
  for (let i = 0; i < parts.length; i += 2) {
    const body = (parts[i] ?? '') + (parts[i + 1] ?? '')
    const sentence = tidy(body)
    if (!sentence) continue

    if (sentence.length <= maxCharsPerMessage) {
      pieces.push(sentence)
      continue
    }

    // 过长：在软停顿处切，尽量让每段不超过上限
    const chunks = sentence.split(SOFT)
    let buf = ''
    for (let j = 0; j < chunks.length; j += 2) {
      const piece = (chunks[j] ?? '') + (chunks[j + 1] ?? '')
      if (!piece) continue
      if (buf && (buf + piece).length > maxCharsPerMessage) {
        const done = tidy(buf)
        if (done) pieces.push(done)
        buf = piece
      } else {
        buf += piece
      }
    }
    const tail = tidy(buf)
    if (tail) pieces.push(tail)
  }
  return pieces
}

/**
 * 把分句合并成不超过 maxMessages 条。
 * 合并从尾部开始——前面已经发出去的短句更像自然语气，压缩尾部损失最小。
 */
export function mergeToLimit(pieces: string[], maxMessages: number): string[] {
  if (maxMessages <= 0) return []
  if (pieces.length <= maxMessages) return pieces

  const keep = pieces.slice(0, maxMessages - 1)
  const rest = pieces.slice(maxMessages - 1).join('')
  return [...keep, rest]
}

/** 估算一条消息的打字时长；深夜更慢。 */
export function estimateTypingMs(
  text: string,
  opts: Pick<RhythmOptions, 'charsPerSecond' | 'now'> = {},
): number {
  const charsPerSecond = opts.charsPerSecond ?? DEFAULT_RHYTHM.charsPerSecond
  const now = opts.now ?? Date.now()
  const cps = charsPerSecond > 0 ? charsPerSecond : DEFAULT_RHYTHM.charsPerSecond

  // 标点代表额外的停顿，不只是占一个字符
  let extra = 0
  extra += (text.match(/[。！？!?]/g)?.length ?? 0) * 300
  extra += (text.match(/[…]+|—{2,}/g)?.length ?? 0) * 500
  extra += (text.match(/[，,；;]/g)?.length ?? 0) * 150

  const base = (text.length / cps) * 1000 + extra
  const slowed = isLateNight(now) ? base * LATE_NIGHT_SLOWDOWN : base
  return clampDelay(slowed)
}

function clampDelay(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_RHYTHM.minDelayMs
  return Math.min(DEFAULT_RHYTHM.maxDelayMs, Math.max(DEFAULT_RHYTHM.minDelayMs, Math.round(ms)))
}

/**
 * 一次投递计划：切条 + 每条之前的等待。
 * 第一条的 delayMs 是「开始打字到发出」的时间，调用方可以据此做打字中提示。
 */
export function planDelivery(text: string, opts: RhythmOptions): DeliveryStep[] {
  const pieces = splitSentences(text, opts.maxCharsPerMessage)
  if (pieces.length === 0) return []
  const merged = mergeToLimit(pieces, opts.maxMessages)
  return merged.map((t) => ({
    text: t,
    delayMs: estimateTypingMs(t, { charsPerSecond: opts.charsPerSecond, now: opts.now }),
  }))
}
