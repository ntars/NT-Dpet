// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * @nt-dpet/memory 提炼器单元测试。
 *
 * 验收口径（M0.4.1）：正常 JSON、带 ``` 包裹、非法 JSON、空数组、超长截断。
 * 全部走假 llm，不联网、不依赖真实模型。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  EXTRACT_MAX_CHARS,
  EXTRACT_MAX_RAW,
  ExtractParseError,
  buildExtractMessages,
  createLlmExtractor,
  parseFacts,
  resolveLlm,
  truncateRaw,
} from '../dist/extractor.js'

/** 造一条原文。 */
function raw(over = {}) {
  return {
    id: `r_${Math.random().toString(36).slice(2, 8)}`,
    sessionKey: 's1',
    speakerId: 'u1',
    role: 'user',
    content: '我喜欢喝咖啡',
    createdAt: Date.now(),
    extracted: false,
    ...over,
  }
}

/** 造一个假 llm：按顺序吐出给定的正文分片。 */
function fakeLlm(chunks, opts = {}) {
  const calls = []
  return {
    calls,
    stream(options) {
      calls.push(options)
      return {
        async *[Symbol.asyncIterator]() {
          if (opts.throwAt) throw new Error(opts.throwAt)
          for (const text of chunks) {
            yield { type: 'text-delta', text }
          }
        },
      }
    },
  }
}

describe('提炼结果解析', () => {
  it('正常 JSON：字段映射完整，结构性字段由本地补齐', () => {
    const text = JSON.stringify([
      { predicate: '喜欢', object: '喝美式', confidence: 0.9, importance: 0.7, subjectId: 'u1' },
    ])
    const drafts = parseFacts(text, 'sess_a')
    assert.equal(drafts.length, 1)
    const fact = drafts[0]
    assert.equal(fact.predicate, '喜欢')
    assert.equal(fact.object, '喝美式')
    assert.equal(fact.confidence, 0.9)
    assert.equal(fact.importance, 0.7)
    assert.equal(fact.subjectId, 'u1')
    assert.equal(fact.sessionKey, 'sess_a')
    assert.equal(fact.sourceRawId, null)
    assert.equal(fact.supersededBy, null)
    assert.equal(fact.manuallyEdited, false)
    assert.equal(fact.deletedAt, null)
  })

  it('带 ``` 包裹：剥掉围栏照样能读', () => {
    const text = [
      '```json',
      JSON.stringify([{ predicate: '住在', object: '杭州', confidence: 1, importance: 0.8, subjectId: null }]),
      '```',
    ].join('\n')
    const drafts = parseFacts(text, 's1')
    assert.equal(drafts.length, 1)
    assert.equal(drafts[0].object, '杭州')
    assert.equal(drafts[0].subjectId, null)
  })

  it('围栏没闭合、前后带解释文字，也能捞出数组', () => {
    const text = '好的，提炼如下：\n```json\n[{"predicate":"在做","object":"NT-Dpet","confidence":0.8,"importance":0.9,"subjectId":"u1"}]\n'
    const drafts = parseFacts(text, 's1')
    assert.equal(drafts.length, 1)
    assert.equal(drafts[0].object, 'NT-Dpet')
  })

  it('非法 JSON：抛 ExtractParseError', () => {
    assert.throws(() => parseFacts('我觉得他喜欢咖啡', 's1'), ExtractParseError)
    assert.throws(() => parseFacts('{"predicate":"喜欢"}', 's1'), ExtractParseError)
    assert.throws(() => parseFacts('', 's1'), ExtractParseError)
  })

  it('空数组：返回空列表而不是报错', () => {
    assert.deepEqual(parseFacts('[]', 's1'), [])
    assert.deepEqual(parseFacts('```json\n[]\n```', 's1'), [])
  })

  it('越界分数被收进 0..1，非数字回落到中性值', () => {
    const text = JSON.stringify([
      { predicate: '喜欢', object: 'a', confidence: 3.2, importance: -1, subjectId: null },
      { predicate: '喜欢', object: 'b', confidence: '很高', importance: null, subjectId: null },
    ])
    const [first, second] = parseFacts(text, 's1')
    assert.equal(first.confidence, 1)
    assert.equal(first.importance, 0)
    assert.equal(second.confidence, 0.6)
    assert.equal(second.importance, 0.5)
  })

  it('谓词或宾语为空的事实被丢弃（另一条正常保留）', () => {
    const text = JSON.stringify([
      { predicate: '', object: '空的谓词', confidence: 1, importance: 1, subjectId: null },
      { predicate: '喜欢', object: '   ', confidence: 1, importance: 1, subjectId: null },
      { predicate: '喜欢', object: '留下', confidence: 1, importance: 1, subjectId: null },
    ])
    const drafts = parseFacts(text, 's1')
    assert.equal(drafts.length, 1)
    assert.equal(drafts[0].object, '留下')
  })
})

describe('超长截断', () => {
  it('条数超过 20 条只留前 20 条', () => {
    const raws = Array.from({ length: 30 }, (_, i) => raw({ content: `第${i}条` }))
    const kept = truncateRaw(raws)
    assert.equal(kept.length, EXTRACT_MAX_RAW)
    assert.equal(kept[0].content, '第0条')
    assert.equal(kept.at(-1).content, '第19条')
  })

  it('总字数超过 3000 时截断当前条并停止，不多带一条', () => {
    const raws = Array.from({ length: 5 }, () => raw({ content: 'x'.repeat(1000) }))
    const kept = truncateRaw(raws, EXTRACT_MAX_RAW, EXTRACT_MAX_CHARS)
    assert.equal(kept.length, 3)
    assert.equal(kept[0].content.length + kept[1].content.length + kept[2].content.length, 3000)
  })

  it('单条就超长：截到上限，剩 1 条而不是 0 条', () => {
    const kept = truncateRaw([raw({ content: 'y'.repeat(5000) })])
    assert.equal(kept.length, 1)
    assert.equal(kept[0].content.length, EXTRACT_MAX_CHARS)
  })

  it('截断产生的是副本，不改原对象', () => {
    const origin = raw({ content: 'z'.repeat(5000) })
    truncateRaw([origin])
    assert.equal(origin.content.length, 5000)
  })

  it('提示词里带上原文条数与说话者，且要求严格 JSON', () => {
    const messages = buildExtractMessages([
      raw({ content: '我明天要体检' }),
      raw({ role: 'assistant', speakerId: null, content: '记下了' }),
    ])
    assert.equal(messages.length, 1)
    const text = messages[0].content[0].text
    assert.match(text, /\[1\] 用户\(u1\)：我明天要体检/)
    assert.match(text, /\[2\] 她：记下了/)
    assert.match(text, /JSON/)
  })
})

describe('提炼器整体行为', () => {
  it('正常链路：流式分片拼成正文后交给解析，产出事实', async () => {
    const payload = JSON.stringify([
      { predicate: '喜欢', object: '喝咖啡', confidence: 0.9, importance: 0.6, subjectId: 'u1' },
    ])
    // 故意把 JSON 切成几块，模拟真实流式
    const llm = fakeLlm([payload.slice(0, 20), payload.slice(20)])
    const extract = createLlmExtractor(llm, { model: 'test-model', log: () => {} })
    const drafts = await extract([raw()])
    assert.equal(drafts.length, 1)
    assert.equal(drafts[0].object, '喝咖啡')
    assert.equal(drafts[0].sessionKey, 's1')
    assert.equal(llm.calls[0].provider, 'magpie')
    assert.equal(llm.calls[0].model, 'test-model')
  })

  it('非法 JSON：丢弃本次结果、记日志、不抛异常', async () => {
    const logs = []
    const llm = fakeLlm(['这可不是 JSON'])
    const extract = createLlmExtractor(llm, { model: 'm', log: (m) => logs.push(m) })
    const drafts = await extract([raw()])
    assert.deepEqual(drafts, [])
    assert.equal(logs.length, 1)
    assert.match(logs[0], /无法解析/)
  })

  it('模型调用本身报错：同样只记日志，不把异常抛给调度器', async () => {
    const logs = []
    const llm = fakeLlm([], { throwAt: '连接被重置' })
    const extract = createLlmExtractor(llm, { model: 'm', log: (m) => logs.push(m) })
    const drafts = await extract([raw()])
    assert.deepEqual(drafts, [])
    assert.match(logs[0], /调用失败/)
  })

  it('空输入不发起调用', async () => {
    const llm = fakeLlm([])
    const extract = createLlmExtractor(llm, { model: 'm', log: () => {} })
    assert.deepEqual(await extract([]), [])
    assert.equal(llm.calls.length, 0)
  })

  it('跨会话的原文分开问，事实不会串台', async () => {
    const llm = fakeLlm([
      JSON.stringify([{ predicate: '喜欢', object: '咖啡', confidence: 1, importance: 1, subjectId: null }]),
    ])
    const extract = createLlmExtractor(llm, { model: 'm', log: () => {} })
    const drafts = await extract([raw({ sessionKey: 'a' }), raw({ sessionKey: 'b' })])
    assert.equal(llm.calls.length, 2)
    assert.deepEqual(drafts.map((d) => d.sessionKey).sort(), ['a', 'b'])
  })
})

describe('取 llm 服务', () => {
  it('默认模式取到能用的服务', () => {
    const llm = fakeLlm([])
    assert.equal(resolveLlm({ get: () => llm }), llm)
  })

  it('服务不存在或形状不对时返回 null，不抛', () => {
    assert.equal(resolveLlm({ get: () => undefined }), null)
    assert.equal(resolveLlm({ get: () => ({}) }), null)
    assert.equal(
      resolveLlm({
        get: () => {
          throw new Error('cannot get property "llm" without inject')
        },
      }),
      null,
    )
  })
})
