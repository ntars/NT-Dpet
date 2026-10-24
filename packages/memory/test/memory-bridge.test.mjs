// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * M0.4.2 的验收测试：提炼器挂到服务之后的行为。
 *
 * 与 `memory.test.mjs` 的分工：那边测「存与取」本身，这里只测**调度**——
 * 什么时机触发、同一会话怎么合并、失败之后原文还在不在、会不会并发打模型。
 *
 * 全部用假 llm，不连网：真模型跑不出「第一次一定失败」这种确定性场景。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createLlmExtractor } from '../dist/extractor.js'
import { createMemoryService } from '../dist/service.js'
import { createMemoryStore } from '../dist/store.js'

/** 调度延迟压到 20 毫秒：5 秒×N 个用例，光等就能把测试拖成分钟级。 */
const DELAY = 20

/**
 * 假 llm。
 *
 * `handler(第几次调用)` 返回要吐的正文，或直接抛错——用抛错来模拟模型网关挂掉。
 * 返回值里带 `calls` / `maxConcurrent`，用来验证「合并」与「不并发」。
 */
function fakeLlm(handler) {
  const self = {
    calls: 0,
    concurrent: 0,
    maxConcurrent: 0,
    async *stream() {
      self.calls += 1
      self.concurrent += 1
      self.maxConcurrent = Math.max(self.maxConcurrent, self.concurrent)
      try {
        const text = await handler(self.calls)
        yield { type: 'text-delta', text }
        yield { type: 'finish', reason: { kind: 'stop' } }
      } finally {
        self.concurrent -= 1
      }
    },
  }
  return self
}

/** 固定的一条事实，字段名与提炼器要求的 JSON 一致。 */
const ONE_FACT = JSON.stringify([
  { predicate: '明天要做', object: '体检', confidence: 0.9, importance: 0.8 },
])

/** 轮询等待某个条件成立，超时即失败。 */
async function waitFor(predicate, timeout = 2000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await predicate()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('等待超时：条件始终没有成立')
}

/** 装配一套「服务 + 提炼器」，onSessionFail 按生产代码的方式接回去。 */
function setup(llm, store = createMemoryStore()) {
  const { service } = createMemoryService(store, { extractDelayMs: DELAY })
  service.setExtractor(
    createLlmExtractor(llm, {
      log: () => {},
      onSessionFail: (key, reason) => service.reportExtractFailure(key, reason),
    }),
  )
  return { service, store }
}

describe('提炼器挂到服务（M0.4.2）', () => {
  it('连续 5 轮对话后能自动提炼出事实，recall 命中', async () => {
    const llm = fakeLlm(() => ONE_FACT)
    const { service } = setup(llm)

    for (let i = 0; i < 5; i += 1) {
      await service.appendTurn({
        sessionKey: 'c2c:u1',
        speakerId: 'u1',
        userText: `第 ${i + 1} 轮：我明天要体检`,
        assistantText: '记住啦',
      })
    }

    await waitFor(async () => (await service.recall('c2c:u1', '体检')).length > 0)

    const got = await service.recall('c2c:u1', '体检')
    assert.ok(got.length >= 1, '五轮之后至少要能召回到一条事实')
    assert.equal(got[0].fact.object, '体检')
    assert.equal(got[0].fact.sessionKey, 'c2c:u1')
  })

  it('同一会话连发多轮只问一次模型（合并调度）', async () => {
    const llm = fakeLlm(() => ONE_FACT)
    const { service } = setup(llm)

    for (let i = 0; i < 5; i += 1) {
      await service.appendTurn({
        sessionKey: 'c2c:u1',
        speakerId: 'u1',
        userText: `第 ${i + 1} 轮`,
        assistantText: '嗯',
      })
    }

    await waitFor(async () => llm.calls > 0)
    // 再等一会儿，确认没有第二次调用挤进来
    await new Promise((r) => setTimeout(r, DELAY * 3))
    assert.equal(llm.calls, 1, '5 轮应合并成一次提炼，而不是每轮各问一次')
  })

  it('提炼失败不抛异常，且原文保留待下轮', async () => {
    let calls = 0
    const llm = fakeLlm(() => {
      calls += 1
      if (calls === 1) throw new Error('模拟网关 502')
      return ONE_FACT
    })
    const store = createMemoryStore()
    // 这条用例要精确控制时机，所以用默认 5 秒延迟：
    // 测试在 5 秒内结束，定时器不会来插一脚，只有 extractNow 会真跑。
    const { service } = createMemoryService(store)
    service.setExtractor(
      createLlmExtractor(llm, {
        log: () => {},
        onSessionFail: (key, reason) => service.reportExtractFailure(key, reason),
      }),
    )

    await service.appendTurn({
      sessionKey: 'c2c:u1',
      speakerId: 'u1',
      userText: '我明天要体检',
      assistantText: '记住啦',
    })

    const first = await service.extractNow()
    assert.equal(first, 0, '失败时不该产出事实')
    assert.equal(
      (await store.listUnextractedBySession('c2c:u1', 20)).length,
      2,
      '失败的会话不能被标记已提炼，否则记忆静默丢失',
    )
    assert.equal((await service.recall('c2c:u1', '体检')).length, 0)

    // 「不重试」指的是不立刻重试；下一轮调度应当自然再取到它们
    const second = await service.extractNow()
    assert.equal(second, 1)
    assert.equal((await store.listUnextractedBySession('c2c:u1', 20)).length, 0)
    assert.equal((await service.recall('c2c:u1', '体检')).length, 1)

    service.dispose()
  })

  it('跨会话各自提炼，事实不串台', async () => {
    const llm = fakeLlm(() => ONE_FACT)
    const { service } = setup(llm)

    await service.appendTurn({
      sessionKey: 'c2c:u1', speakerId: 'u1', userText: '我明天要体检', assistantText: '记住啦',
    })
    await service.appendTurn({
      sessionKey: 'group:g1', speakerId: 'u2', userText: '我明天要体检', assistantText: '记住啦',
    })

    await waitFor(async () => (await service.recall('c2c:u1', '体检')).length > 0
      && (await service.recall('group:g1', '体检')).length > 0)

    const a = await service.recall('c2c:u1', '体检')
    const b = await service.recall('group:g1', '体检')
    assert.ok(a.every((r) => r.fact.sessionKey === 'c2c:u1'))
    assert.ok(b.every((r) => r.fact.sessionKey === 'group:g1'))
  })

  it('两个会话同时到点也不并发打模型', async () => {
    const llm = fakeLlm(async () => {
      await new Promise((r) => setTimeout(r, 30))
      return ONE_FACT
    })
    const { service } = setup(llm)

    await service.appendTurn({
      sessionKey: 'c2c:u1', speakerId: 'u1', userText: '我明天要体检', assistantText: '记住啦',
    })
    await service.appendTurn({
      sessionKey: 'group:g1', speakerId: 'u2', userText: '我明天要体检', assistantText: '记住啦',
    })

    await waitFor(async () => (await service.recall('c2c:u1', '体检')).length > 0
      && (await service.recall('group:g1', '体检')).length > 0)

    assert.equal(llm.maxConcurrent, 1, '提炼必须串行，并发只会把上游打满')
  })

  it('提炼器整个抛错时也不炸出去（服务层兜底）', async () => {
    const { service } = createMemoryService(createMemoryStore(), { extractDelayMs: DELAY })
    service.setExtractor(async () => {
      throw new Error('提炼器内部崩了')
    })

    await service.appendTurn({
      sessionKey: 'c2c:u1', speakerId: 'u1', userText: '你好', assistantText: '在的',
    })

    // 定时器里抛出的异常不会被 await 到，只能等它跑完再断言进程还活着
    await new Promise((r) => setTimeout(r, DELAY * 4))
    const n = await service.extractNow()
    assert.equal(n, 0, '兜底之后应当返回 0，而不是把异常抛给调用方')
  })

  it('dispose 后不再提炼', async () => {
    const llm = fakeLlm(() => ONE_FACT)
    const { service } = setup(llm)

    await service.appendTurn({
      sessionKey: 'c2c:u1', speakerId: 'u1', userText: '我明天要体检', assistantText: '记住啦',
    })
    service.dispose()

    await new Promise((r) => setTimeout(r, DELAY * 4))
    assert.equal(llm.calls, 0, 'dispose 之后不该再有模型调用')
  })
})
