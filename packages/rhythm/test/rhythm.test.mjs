// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { estimateTypingMs, isLateNight, mergeToLimit, planDelivery, splitSentences } from '../dist/rhythm.js'

describe('分句', () => {
  it('按强分隔切句，保留标点', () => {
    assert.deepEqual(splitSentences('我回来了。你在吗？'), ['我回来了。', '你在吗？'])
  })

  it('空文本返回空数组', () => {
    assert.deepEqual(splitSentences('   '), [])
  })

  it('短句里的省略号不切碎', () => {
    assert.deepEqual(splitSentences('嗯……算了吧，你先忙。'), ['嗯……算了吧，你先忙。'])
  })

  it('过长句子才在软停顿处二次切分', () => {
    const long = '我今天下午一直在想要不要跟你说这件事，后来觉得还是说了比较好，因为不说的话你会觉得我在躲你。'
    const parts = splitSentences(long, 20)
    assert.ok(parts.length > 1, '应切成多条')
    assert.ok(parts.every((p) => p.length <= 32), '每条都应较短：' + JSON.stringify(parts))
  })

  it('感叹号与问号都算强分隔', () => {
    assert.deepEqual(splitSentences('真的！你怎么知道？'), ['真的！', '你怎么知道？'])
  })
})

describe('合并上限', () => {
  it('不超上限时原样返回', () => {
    assert.deepEqual(mergeToLimit(['a', 'b'], 4), ['a', 'b'])
  })

  it('超出时尾部合并，保留前面的短句', () => {
    const got = mergeToLimit(['一。', '二。', '三。', '四。', '五。'], 3)
    assert.equal(got.length, 3)
    assert.equal(got[0], '一。')
    assert.equal(got[2], '三。四。五。')
  })

  it('上限为 0 返回空', () => {
    assert.deepEqual(mergeToLimit(['a'], 0), [])
  })
})

describe('打字时长', () => {
  const day = new Date(); day.setHours(15, 0, 0, 0)
  const dayTs = day.getTime()

  it('随字数增加', () => {
    const a = estimateTypingMs('你好', { charsPerSecond: 6, now: dayTs })
    const b = estimateTypingMs('你好呀今天过得怎么样', { charsPerSecond: 6, now: dayTs })
    assert.ok(b > a)
  })

  it('标点带来额外停顿', () => {
    const plain = estimateTypingMs('好好好', { charsPerSecond: 6, now: dayTs })
    const punct = estimateTypingMs('好，好，好。', { charsPerSecond: 6, now: dayTs })
    assert.ok(punct > plain)
  })

  it('有下限与上限', () => {
    assert.ok(estimateTypingMs('嗯', { charsPerSecond: 6, now: dayTs }) >= 300)
    assert.ok(estimateTypingMs('字'.repeat(500), { charsPerSecond: 6, now: dayTs }) <= 6000)
  })

  it('深夜比白天慢', () => {
    const night = new Date(dayTs); night.setHours(2, 0, 0, 0)
    const d = estimateTypingMs('今天好累啊', { charsPerSecond: 6, now: dayTs })
    const n = estimateTypingMs('今天好累啊', { charsPerSecond: 6, now: night.getTime() })
    assert.ok(n > d, '深夜 ' + n + ' 应大于白天 ' + d)
  })
})

describe('深夜判定', () => {
  it('23 点与 2 点算深夜，12 点不算', () => {
    const mk = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.getTime() }
    assert.equal(isLateNight(mk(23)), true)
    assert.equal(isLateNight(mk(2)), true)
    assert.equal(isLateNight(mk(12)), false)
    assert.equal(isLateNight(mk(6)), false)
  })
})

describe('投递计划', () => {
  it('每条都带延迟，且条数受上限约束', () => {
    const plan = planDelivery('一。二。三。四。五。', { maxMessages: 3 })
    assert.equal(plan.length, 3)
    assert.ok(plan.every((s) => s.delayMs >= 300 && s.delayMs <= 6000))
  })

  it('空文本不给计划', () => {
    assert.deepEqual(planDelivery('', { maxMessages: 4 }), [])
  })
})
