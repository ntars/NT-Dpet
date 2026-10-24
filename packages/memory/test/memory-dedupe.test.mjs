// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 事实去重（M0.4.3）的单元测试。
 *
 * 覆盖两条主线：
 *   1. 纯函数 `planFactWrite` 的裁决——谁生效、谁让位、什么情况下不合并；
 *   2. 服务层的落库效果——库里到底留了几行、`recall()` 能取到哪条。
 * 只改内存存储，不依赖 SQLite 与网络。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { factKey, planFactWrite } from '../dist/dedupe.js'
import { createMemoryStore } from '../dist/store.js'
import { createMemoryService } from '../dist/service.js'

let seq = 0

/** 造一条事实；`id` 自增，保证「先入为主」的 createdAt 断言可控。 */
function fact(over = {}) {
  seq += 1
  return {
    id: `f${seq}`,
    sessionKey: 's1',
    subjectId: 'u1',
    predicate: '喜欢',
    object: '喝冰美式',
    confidence: 0.8,
    importance: 0.5,
    sourceRawId: null,
    createdAt: 1_000 + seq,
    supersededBy: null,
    manuallyEdited: false,
    deletedAt: null,
    ...over,
  }
}

describe('去重键', () => {
  it('忽略首尾与连续空白', () => {
    assert.equal(
      factKey({ subjectId: 'u1', predicate: ' 喜欢 ', object: '喝  冰美式' }),
      factKey({ subjectId: 'u1', predicate: '喜欢', object: '喝 冰美式' }),
    )
  })

  it('英文大小写归一', () => {
    assert.equal(
      factKey({ subjectId: 'u1', predicate: '养', object: 'Corgi' }),
      factKey({ subjectId: 'u1', predicate: '养', object: 'corgi' }),
    )
  })

  it('主语不同则键不同', () => {
    assert.notEqual(
      factKey({ subjectId: 'u1', predicate: '喜欢', object: '猫' }),
      factKey({ subjectId: 'u2', predicate: '喜欢', object: '猫' }),
    )
  })

  it('主语为空与有主语不混为一谈', () => {
    assert.notEqual(
      factKey({ subjectId: null, predicate: '明天', object: '体检' }),
      factKey({ subjectId: 'u1', predicate: '明天', object: '体检' }),
    )
  })

  it('谓词与宾语不会被空格拼串混淆', () => {
    assert.notEqual(
      factKey({ subjectId: 'u1', predicate: '喜欢 咖啡', object: '豆' }),
      factKey({ subjectId: 'u1', predicate: '喜欢', object: '咖啡 豆' }),
    )
  })
})

describe('裁决：无冲突', () => {
  it('库里没有同键事实时直接入库', () => {
    const c = fact({ importance: 0.1 })
    const plan = planFactWrite([], c)
    assert.equal(plan.fact, c)
    assert.equal(plan.winnerId, c.id)
    assert.deepEqual(plan.supersede, [])
  })

  it('宾语不同不合并', () => {
    const old = fact({ object: '喝冰美式', importance: 0.9 })
    const c = fact({ object: '喝热拿铁', importance: 0.1 })
    const plan = planFactWrite([old], c)
    assert.equal(plan.fact.id, c.id)
    assert.equal(plan.fact.supersededBy, null)
    assert.deepEqual(plan.supersede, [])
  })

  it('谓词不同不合并', () => {
    const old = fact({ predicate: '喜欢', importance: 0.9 })
    const c = fact({ predicate: '讨厌', importance: 0.1 })
    const plan = planFactWrite([old], c)
    assert.equal(plan.fact.supersededBy, null)
    assert.deepEqual(plan.supersede, [])
  })

  it('主语不同不合并（同一个群里两个人）', () => {
    const old = fact({ subjectId: 'u1', importance: 0.9 })
    const c = fact({ subjectId: 'u2', importance: 0.1 })
    const plan = planFactWrite([old], c)
    assert.equal(plan.fact.supersededBy, null)
    assert.deepEqual(plan.supersede, [])
  })

  it('已失效、已软删的旧事实不参与比对', () => {
    const gone = fact({ supersededBy: 'fX', importance: 0.99 })
    const deleted = fact({ deletedAt: 1, importance: 0.99 })
    const c = fact({ importance: 0.01 })
    const plan = planFactWrite([gone, deleted], c)
    assert.equal(plan.fact.supersededBy, null, '新事实应正常生效，不该被失效行压住')
    assert.deepEqual(plan.supersede, [])
  })
})

describe('裁决：重要度', () => {
  it('新事实更重要 → 新胜，旧的让位', () => {
    const old = fact({ importance: 0.3 })
    const c = fact({ importance: 0.8 })
    const plan = planFactWrite([old], c)
    assert.equal(plan.fact.id, c.id)
    assert.equal(plan.fact.supersededBy, null)
    assert.equal(plan.winnerId, c.id)
    assert.deepEqual(plan.supersede.map((f) => f.id), [old.id])
  })

  it('新事实更不重要 → 旧的留着，新事实入库即失效', () => {
    const old = fact({ importance: 0.8 })
    const c = fact({ importance: 0.3 })
    const plan = planFactWrite([old], c)
    assert.equal(plan.fact.supersededBy, old.id)
    assert.equal(plan.winnerId, old.id)
    assert.deepEqual(plan.supersede, [], '旧的没被取代，不该被动')
  })

  it('重要度相同时旧者胜，避免每次提炼都换 id', () => {
    const old = fact({ importance: 0.5 })
    const c = fact({ importance: 0.5 })
    const plan = planFactWrite([old], c)
    assert.equal(plan.fact.supersededBy, old.id)
    assert.equal(plan.winnerId, old.id)
  })

  it('历史重复（同键多条）只留一条，其余一并挂到胜者名下', () => {
    const a = fact({ importance: 0.4 })
    const b = fact({ importance: 0.7 })
    const c = fact({ importance: 0.6 })
    const plan = planFactWrite([a, b], c)
    assert.equal(plan.winnerId, b.id)
    assert.equal(plan.fact.supersededBy, b.id)
    assert.deepEqual(plan.supersede.map((f) => f.id), [a.id])
  })
})

describe('裁决：用户手改不被覆盖', () => {
  it('旧事实是手改的，新事实再重要也顶不掉它', () => {
    const old = fact({ importance: 0.2, manuallyEdited: true })
    const c = fact({ importance: 0.95 })
    const plan = planFactWrite([old], c)
    assert.equal(plan.winnerId, old.id)
    assert.equal(plan.fact.supersededBy, old.id)
    assert.deepEqual(plan.supersede, [])
  })

  it('新事实是手改的，即使重要度低也照样覆盖', () => {
    const old = fact({ importance: 0.95 })
    const c = fact({ importance: 0.1, manuallyEdited: true })
    const plan = planFactWrite([old], c)
    assert.equal(plan.fact.supersededBy, null)
    assert.equal(plan.winnerId, c.id)
    assert.deepEqual(plan.supersede.map((f) => f.id), [old.id])
  })

  it('新事实是手改的，旧事实也是手改的 → 认新（用户又改了一次）', () => {
    const old = fact({ importance: 0.9, manuallyEdited: true })
    const c = fact({ importance: 0.1, manuallyEdited: true })
    const plan = planFactWrite([old], c)
    assert.equal(plan.winnerId, c.id)
  })
})

describe('服务层落库', () => {
  it('同键重复只留一条生效，库里两行都能查到', async () => {
    const store = createMemoryStore()
    const { service } = createMemoryService(store)
    const base = {
      sessionKey: 's1', subjectId: 'u1', predicate: '喜欢', object: '喝冰美式',
      confidence: 0.8, sourceRawId: null, supersededBy: null,
      manuallyEdited: false, deletedAt: null,
    }
    await service.addFact({ ...base, importance: 0.4, at: Date.now() - 1000 })
    await service.addFact({ ...base, importance: 0.9 })

    const all = await store.listFacts('s1')
    assert.equal(all.length, 2, '两行都该在库里，做得到溯源')
    const active = all.filter((f) => f.supersededBy === null)
    assert.equal(active.length, 1, '只能有一条生效')
    assert.equal(active[0].importance, 0.9)

    const got = await service.recall('s1', '冰美式')
    assert.equal(got.length, 1, '检索不该把失效行翻出来')
    assert.equal(got[0].fact.importance, 0.9)
  })

  it('新事实更弱时不改动旧行', async () => {
    const store = createMemoryStore()
    const { service } = createMemoryService(store)
    const base = {
      sessionKey: 's1', subjectId: 'u1', predicate: '住在', object: '杭州',
      confidence: 0.9, sourceRawId: null, supersededBy: null,
      manuallyEdited: false, deletedAt: null,
    }
    const strong = await service.addFact({ ...base, importance: 0.9 })
    const weak = await service.addFact({ ...base, importance: 0.2 })

    assert.equal(weak.supersededBy, strong.id, '弱的那条应向强的那条低头')
    const all = await store.listFacts('s1')
    const rows = all.filter((f) => f.id === strong.id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].supersededBy, null)
    assert.equal(rows[0].importance, 0.9)
  })

  it('手改事实写入后，后续同键提炼不覆盖它', async () => {
    const store = createMemoryStore()
    const { service } = createMemoryService(store)
    const manual = await service.addFact({
      sessionKey: 's1', subjectId: 'u1', predicate: '喜欢', object: '喝手冲',
      confidence: 1, importance: 0.1, sourceRawId: null, supersededBy: null,
      manuallyEdited: true, deletedAt: null,
    })

    service.setExtractor(async (pending) => pending.map((r) => ({
      sessionKey: r.sessionKey, subjectId: 'u1', predicate: '喜欢', object: '喝手冲',
      confidence: 0.7, importance: 0.99, sourceRawId: r.id, supersededBy: null,
      manuallyEdited: false, deletedAt: null,
    })))
    await service.appendTurn({ sessionKey: 's1', speakerId: 'u1', userText: '我还是喜欢手冲', assistantText: '记着呢' })
    await service.extractNow()

    const all = await store.listFacts('s1')
    const active = all.filter((f) => f.supersededBy === null)
    assert.equal(active.length, 1)
    assert.equal(active[0].id, manual.id, '生效的必须还是用户手改的那条')
    assert.equal(active[0].manuallyEdited, true)

    const got = await service.recall('s1', '手冲')
    assert.equal(got.length, 1)
    assert.equal(got[0].fact.manuallyEdited, true)
  })

  it('连续两轮提炼同一件事，库里只累加一条生效事实', async () => {
    const store = createMemoryStore()
    const { service } = createMemoryService(store)
    service.setExtractor(async (pending) => pending.map((r) => ({
      sessionKey: r.sessionKey, subjectId: 'u1', predicate: '在做', object: 'NT-Dpet',
      confidence: 0.8, importance: 0.6, sourceRawId: r.id, supersededBy: null,
      manuallyEdited: false, deletedAt: null,
    })))

    await service.appendTurn({ sessionKey: 's1', speakerId: 'u1', userText: '我在做 NT-Dpet', assistantText: '知道啦' })
    await service.extractNow()
    await service.appendTurn({ sessionKey: 's1', speakerId: 'u1', userText: 'NT-Dpet 还在做', assistantText: '嗯嗯' })
    await service.extractNow()

    const all = await store.listFacts('s1')
    const active = all.filter((f) => f.supersededBy === null)
    assert.equal(active.length, 1, '两轮提炼同一件事，生效的只能一条')
    assert.equal(all.length, 4, '两轮各两条原文，四条事实都入库留档')
  })
})
