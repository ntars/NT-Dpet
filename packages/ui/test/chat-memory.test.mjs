// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * M0.4.2 的界面侧验收：一轮对话结束后有没有把原文交给记忆层。
 *
 * 直接调导出的 `createChatRunner`，不起 HTTP 服务——这里要验的是「接线」，
 * 不是分帧。HTTP 那一层由 `api.test.mjs` 负责。
 *
 * 用假 ctx / 假 dialogue / 假 memory，只断言**调用契约**：
 *   1. 正常结束 → appendTurn 收到用户原话与她的回复
 *   2. 生成失败 → 不写（半条对话会污染提炼）
 *   3. 中断 → 照写（用户已经看到的字是真的）
 *   4. 记忆服务缺席或写入抛错 → 这一轮照常返回，不把异常带出去
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createChatRunner } from '../dist/index.js'

/** 假 ctx：只实现 `get`，本模块也只用到这一个。 */
function fakeCtx(services) {
  return {
    get(name) {
      return services[name]
    },
  }
}

/** 假对话服务：吐出固定正文，并按用例返回不同的结束原因。 */
function fakeDialogue({ text = '记住啦', stopReason = 'stop', onChat } = {}) {
  return {
    async chat(_turn, _options, onUpdate) {
      onChat?.()
      if (text) onUpdate({ kind: 'text-delta', delta: text })
      onUpdate({ kind: 'done' })
      return { text, stopReason }
    },
  }
}

/** 假记忆服务：把收到的一轮原样记下来。 */
function fakeMemory({ fail = false } = {}) {
  const turns = []
  return {
    turns,
    async recent() {
      return []
    },
    async appendTurn(input) {
      if (fail) throw new Error('模拟写库失败')
      turns.push(input)
    },
  }
}

function sink() {
  const chunks = []
  return {
    chunks,
    signal: new AbortController().signal,
    delta(text) {
      chunks.push(text)
    },
  }
}

const input = { sessionKey: 'c2c:local', text: '我明天要体检' }

describe('对话结束后写记忆（M0.4.2）', () => {
  it('正常一轮把用户原话与她的回复都交出去', async () => {
    const memory = fakeMemory()
    const runner = createChatRunner(fakeCtx({
      'nt-dpet:dialogue': fakeDialogue(),
      'nt-dpet:memory': memory,
    }))

    const out = sink()
    const result = await runner(input, out)
    assert.equal(result.stopReason, 'stop')
    assert.equal(out.chunks.join(''), '记住啦')

    // 写入是 fire-and-forget，给它一个微任务的时间
    await new Promise((r) => setImmediate(r))
    assert.equal(memory.turns.length, 1)
    assert.deepEqual(memory.turns[0], {
      sessionKey: 'c2c:local',
      speakerId: null,
      userText: '我明天要体检',
      assistantText: '记住啦',
    })
  })

  it('生成失败时整轮不写', async () => {
    const memory = fakeMemory()
    const runner = createChatRunner(fakeCtx({
      'nt-dpet:dialogue': fakeDialogue({ text: '', stopReason: 'error' }),
      'nt-dpet:memory': memory,
    }))

    const result = await runner(input, sink())
    assert.equal(result.stopReason, 'error')

    await new Promise((r) => setImmediate(r))
    assert.equal(memory.turns.length, 0, '正文为空又没有有效回复时不该留下半条对话')
  })

  it('被中断时照写', async () => {
    const memory = fakeMemory()
    const runner = createChatRunner(fakeCtx({
      'nt-dpet:dialogue': fakeDialogue({ text: '记住', stopReason: 'aborted' }),
      'nt-dpet:memory': memory,
    }))

    await runner(input, sink())
    await new Promise((r) => setImmediate(r))
    assert.equal(memory.turns.length, 1, '用户已经看到的字是真的，不该丢')
  })

  it('记忆服务缺席不影响这一轮', async () => {
    const runner = createChatRunner(fakeCtx({
      'nt-dpet:dialogue': fakeDialogue(),
    }))

    const result = await runner(input, sink())
    assert.equal(result.stopReason, 'stop')
  })

  it('记忆写入抛错不影响这一轮', async () => {
    const runner = createChatRunner(fakeCtx({
      'nt-dpet:dialogue': fakeDialogue(),
      'nt-dpet:memory': fakeMemory({ fail: true }),
    }))

    const result = await runner(input, sink())
    await new Promise((r) => setImmediate(r))
    assert.equal(result.stopReason, 'stop')
  })
})
