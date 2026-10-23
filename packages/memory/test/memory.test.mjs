// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * @nt-dpet/memory 的单元测试。
 *
 * 覆盖：双层写入、三层裁决打分、衰减与过期、失效与删除、异步提炼。
 * 用内存存储，不依赖 SQLite 与网络。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { bigrams, recall, recencyScore, semanticScore } from '../dist/recall.js'
import { createMemoryStore } from '../dist/store.js'
import { createMemoryService } from '../dist/service.js'

const DAY = 24 * 60 * 60 * 1000

function fact(over = {}) {
  return {
    id: `f_${Math.random().toString(36).slice(2, 8)}`,
    sessionKey: 's1',
    subjectId: 'u1',
    predicate: '喜欢',
    object: '喝咖啡',
    confidence: 0.8,
    importance: 0.5,
    sourceRawId: null,
    createdAt: Date.now(),
    supersededBy: null,
    manuallyEdited: false,
    deletedAt: null,
    ...over,
  }
}

describe('中文切分', () => {
  it('按二元组切分并去掉标点', () => {
    assert.deepEqual(bigrams('喜欢，咖啡。'), ['喜欢', '欢咖', '咖啡'])
  })

  it('单字也能处理', () => {
    assert.deepEqual(bigrams('猫'), ['猫'])
  })

  it('空串与纯标点返回空数组', () => {
    assert.deepEqual(bigrams(''), [])
    assert.deepEqual(bigrams('，。！'), [])
  })
})

describe('语义分（关键词退化）', () => {
  it('完全命中为 1', () => {
    assert.equal(semanticScore('喜欢咖啡', fact({ predicate: '喜欢', object: '咖啡' })), 1)
  })

  it('完全不相关为 0', () => {
    assert.equal(semanticScore('天气', fact({ predicate: '喜欢', object: '咖啡' })), 0)
  })
})

describe('时间分', () => {
  it('刚创建为 1', () => {
    assert.equal(recencyScore(0, 'standard'), 1)
  })

  it('过一个半衰期衰减到一半', () => {
    const s = recencyScore(7 * DAY, 'standard')
    assert.ok(Math.abs(s - 0.5) < 1e-9, `期望 0.5，实际 ${s}`)
  })

  it('不衰减档恒为 1', () => {
    assert.equal(recencyScore(9999 * DAY, 'never'), 1)
  })
})

describe('三层裁决', () => {
  const now = Date.now()

  it('剔除已删除与已被取代的', () => {
    const facts = [
      fact({ deletedAt: now }),
      fact({ supersededBy: 'newer' }),
      fact({ predicate: '喜欢', object: '茶' }),
    ]
    const got = recall(facts, { query: '喜欢', now, tier: 'standard' })
    assert.equal(got.length, 1)
    assert.equal(got[0].fact.object, '茶')
  })

  it('超过四个半衰期视为过期', () => {
    const facts = [fact({ createdAt: now - 29 * DAY })] // standard = 7 天
    const got = recall(facts, { query: '喜欢', now, tier: 'standard' })
    assert.equal(got.length, 0)
  })

  it('不衰减档下老记忆仍在', () => {
    const facts = [fact({ createdAt: now - 999 * DAY })]
    const got = recall(facts, { query: '喜欢', now, tier: 'never' })
    assert.equal(got.length, 1)
  })

  it('命中查询的排在前面', () => {
    const facts = [
      fact({ predicate: '讨厌', object: '下雨', importance: 1, createdAt: now }),
      fact({ predicate: '喜欢', object: '咖啡', importance: 0.1, createdAt: now - 1000 }),
    ]
    const got = recall(facts, { query: '喜欢咖啡', now, tier: 'standard' })
    assert.equal(got[0].fact.object, '咖啡')
  })

  it('topK 生效', () => {
    const facts = Array.from({ length: 12 }, (_, i) => fact({ object: `事${i}` }))
    const got = recall(facts, { query: '事', now, tier: 'standard', topK: 5 })
    assert.equal(got.length, 5)
  })
})

describe('记忆服务', () => {
  it('一轮对话写入两条原文', async () => {
    const { service } = createMemoryService(createMemoryStore())
    await service.appendTurn({ sessionKey: 's1', speakerId: 'u1', userText: '我回来了', assistantText: '欢迎回来' })
    const raws = await service.recent('s1')
    assert.equal(raws.length, 2)
    assert.deepEqual(raws.map((r) => r.role).sort(), ['assistant', 'user'])
  })

  it('检索走三层裁决，能命中刚写的事实', async () => {
    const { service } = createMemoryService(createMemoryStore())
    await service.addFact({ sessionKey: 's1', subjectId: 'u1', predicate: '喜欢', object: '手冲咖啡',
      confidence: 0.9, importance: 0.7, sourceRawId: null, supersededBy: null,
      manuallyEdited: false, deletedAt: null })
    const got = await service.recall('s1', '咖啡')
    assert.equal(got.length, 1)
    assert.equal(got[0].fact.object, '手冲咖啡')
  })

  it('会话之间互不串味', async () => {
    const { service } = createMemoryService(createMemoryStore())
    await service.addFact({ sessionKey: 's1', subjectId: 'u1', predicate: '喜欢', object: '咖啡',
      confidence: 1, importance: 1, sourceRawId: null, supersededBy: null, manuallyEdited: false, deletedAt: null })
    const got = await service.recall('s2', '咖啡')
    assert.equal(got.length, 0)
  })

  it('没有提炼器时不会自动编造事实', async () => {
    const { service } = createMemoryService(createMemoryStore())
    await service.appendTurn({ sessionKey: 's1', speakerId: 'u1', userText: '你好', assistantText: '在的' })
    const n = await service.extractNow()
    assert.equal(n, 0)
    assert.equal((await service.recall('s1', '你好')).length, 0)
  })

  it('注入提炼器后能产出事实并标记已提炼', async () => {
    const store = createMemoryStore()
    const { service } = createMemoryService(store)
    service.setExtractor(async (pending) => pending.map((r) => ({
      sessionKey: r.sessionKey, subjectId: r.speakerId, predicate: '说过', object: r.content.slice(0, 8),
      confidence: 0.6, importance: 0.4, sourceRawId: r.id, supersededBy: null,
      manuallyEdited: false, deletedAt: null,
    })))
    await service.appendTurn({ sessionKey: 's1', speakerId: 'u1', userText: '我喜欢手冲咖啡', assistantText: '记住啦' })
    const n = await service.extractNow()
    assert.equal(n, 2)
    assert.equal((await store.listUnextracted(10)).length, 0, '原文应被标记为已提炼')
  })

  it('dispose 后不再触发提炼', async () => {
    const { service, dispose } = createMemoryService(createMemoryStore())
    let called = 0
    service.setExtractor(async () => { called++; return [] })
    dispose()
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(called, 0)
  })
})
