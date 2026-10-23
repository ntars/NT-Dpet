// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * @nt-dpet/dialogue 的单元测试。
 *
 * 用假的 ctx 提供 llm 服务，验证「分片 → 结果」的映射逻辑，
 * 不依赖网络、不依赖 DSH 宿主。真实网关的端到端验证另见 §7.3。
 *
 * 跑法：npx pnpm@9 --filter '@nt-dpet/dialogue' run test
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createDialogueService } from '../dist/service.js'
import { toStreamMessages } from '../dist/protocol.js'

/** 造一个假的 ctx：只实现本包真正用到的 ctx.llm.stream。 */
function fakeCtx(chunks, onCall) {
  return {
    llm: {
      stream(options) {
        onCall?.(options)
        return (async function* () {
          for (const c of chunks) yield c
        })()
      },
    },
  }
}

/** 抛错的流：用来验证中断与失败的区分。 */
function throwingCtx(err) {
  return {
    llm: {
      stream() {
        return (async function* () {
          throw err
        })()
      },
    },
  }
}

const TURN = { system: '你是小鲸鱼', history: [], input: '在吗' }
const OPTS = { model: 'group/ntars', maxTokens: 100, reasoning: 'high' }

function collect() {
  const updates = []
  return { updates, onUpdate: (u) => updates.push(u) }
}

describe('正常流', () => {
  it('拼接 text-delta，并返回 usage 与 stop', async () => {
    const service = createDialogueService(fakeCtx([
      { type: 'block-start', blockType: 'text' },
      { type: 'text-delta', text: '在' },
      { type: 'text-delta', text: '的喵' },
      { type: 'block-end' },
      { type: 'usage', usage: { inputTokens: 12, outputTokens: 3 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ]))
    const { updates, onUpdate } = collect()
    const result = await service.chat(TURN, OPTS, onUpdate)
    assert.equal(result.text, '在的喵')
    assert.equal(result.stopReason, 'stop')
    assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 3 })
  })

  it('reasoning 分片不透给调用方', async () => {
    const service = createDialogueService(fakeCtx([
      { type: 'block-start', blockType: 'reasoning' },
      { type: 'reasoning-delta', text: '用户可能在试探' },
      { type: 'block-start', blockType: 'text' },
      { type: 'text-delta', text: '在的' },
      { type: 'finish', reason: { kind: 'stop' } },
    ]))
    const { updates, onUpdate } = collect()
    const result = await service.chat(TURN, OPTS, onUpdate)
    assert.equal(result.text, '在的')
    const textUpdates = updates.filter((u) => u.kind === 'text-delta')
    assert.equal(textUpdates.length, 1)
    assert.ok(!JSON.stringify(updates).includes('试探'), 'reasoning 内容不得出现在回调里')
  })

  it('结束时回调一次 done', async () => {
    const service = createDialogueService(fakeCtx([{ type: 'finish', reason: { kind: 'stop' } }]))
    const { updates, onUpdate } = collect()
    await service.chat(TURN, OPTS, onUpdate)
    assert.equal(updates.filter((u) => u.kind === 'done').length, 1)
  })

  it('未知分片类型不抛错', async () => {
    const service = createDialogueService(fakeCtx([
      { type: 'some-future-chunk', payload: 1 },
      { type: 'text-delta', text: '好' },
      { type: 'finish', reason: { kind: 'stop' } },
    ]))
    const { updates, onUpdate } = collect()
    const result = await service.chat(TURN, OPTS, onUpdate)
    assert.equal(result.text, '好')
  })
})

describe('终止原因映射', () => {
  it('finish 带 failure → error', async () => {
    const service = createDialogueService(fakeCtx([
      { type: 'text-delta', text: '半句' },
      { type: 'finish', reason: { kind: 'stop' }, failure: { code: 'RATE_LIMIT' } },
    ]))
    const result = await service.chat(TURN, OPTS, () => {})
    assert.equal(result.stopReason, 'error')
    assert.equal(result.text, '半句', '已产生的文本应保留')
  })

  it('reason = aborted → aborted', async () => {
    const service = createDialogueService(fakeCtx([{ type: 'finish', reason: { kind: 'aborted' } }]))
    const result = await service.chat(TURN, OPTS, () => {})
    assert.equal(result.stopReason, 'aborted')
  })

  it('reason = max-token → length', async () => {
    const service = createDialogueService(fakeCtx([{ type: 'finish', reason: { kind: 'max-token' } }]))
    const result = await service.chat(TURN, OPTS, () => {})
    assert.equal(result.stopReason, 'length')
  })
})

describe('异常与中断', () => {
  it('AbortError → aborted，而不是 error', async () => {
    const err = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const service = createDialogueService(throwingCtx(err))
    const result = await service.chat(TURN, OPTS, () => {})
    assert.equal(result.stopReason, 'aborted')
  })

  it('普通错误 → error，且仍回调 done', async () => {
    const service = createDialogueService(throwingCtx(new Error('网络炸了')))
    const { updates, onUpdate } = collect()
    const result = await service.chat(TURN, OPTS, onUpdate)
    assert.equal(result.stopReason, 'error')
    assert.equal(updates.filter((u) => u.kind === 'done').length, 1)
  })
})

describe('请求组装', () => {
  it('默认 provider 为 magpie，可显式覆盖', async () => {
    let seen
    const service = createDialogueService(fakeCtx([{ type: 'finish', reason: { kind: 'stop' } }], (o) => { seen = o }))
    await service.chat(TURN, OPTS, () => {})
    assert.equal(seen.provider, 'magpie')

    await service.chat(TURN, { ...OPTS, provider: 'other' }, () => {})
    assert.equal(seen.provider, 'other')
  })

  it('system 为空时不发 system 消息', () => {
    const msgs = toStreamMessages({ system: '', history: [], input: '你好' })
    assert.equal(msgs.length, 1)
    assert.equal(msgs[0].role, 'user')
  })

  it('历史顺序为 system → history → 本轮输入', () => {
    const msgs = toStreamMessages({
      system: '设定',
      history: [
        { role: 'user', content: [{ type: 'text', text: '第一句' }] },
        { role: 'assistant', content: [{ type: 'text', text: '回应' }] },
      ],
      input: '第二句',
    })
    assert.deepEqual(msgs.map((m) => m.role), ['system', 'user', 'assistant', 'user'])
    assert.equal(msgs[3].content[0].text, '第二句')
  })
})
