/**
 * @nt-dpet/ui 接口层单元测试。
 *
 * 为什么值得单独测：鉴权一旦漏掉，这个接口就是本机任何网页都能驱动她的后门，
 * 而这类缺陷在界面冒烟里完全看不出来（页面自己带 token，永远正常）。
 *
 * 不启真服务器：handler 是纯函数式的 (req, res) → void，用假的 req/res 就能
 * 覆盖全部分支，跑一次不到 100ms。真实端口连通性由 M0.1.2 的 curl 验收负责。
 *
 * 跑法：先 build，再 node --test test/api.test.mjs
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { API_PREFIX, createApiHandler, injectToken, NotReadyError } from '../dist/api/handler.js'
import { resolveToken, resetTokenCache } from '../dist/api/token.js'

const HERE = dirname(fileURLToPath(import.meta.url))

const TOKEN = 'a'.repeat(64)
const ORIGIN = 'http://127.0.0.1:3189'

/**
 * 假响应：只记录状态码、响应头与正文，够断言用。
 *
 * `write` 与 `end` 都往同一个 body 里拼：事件流是一块块写出来的，
 * 断言时要看到完整的拼接结果；普通 JSON 响应只走 end，行为与以前一样。
 */
function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    closed: false,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    flushHeaders() {
      this.flushed = true
    },
    write(chunk) {
      this.body += chunk ?? ''
    },
    end(chunk) {
      this.body += chunk ?? ''
    },
    on(event, listener) {
      if (event === 'close') this.onClose = listener
    },
  }
}

/**
 * 假请求：默认带正确令牌，按需覆盖。
 *
 * 传了 body 才会挂上异步迭代器——没有正文的请求本来就不该有，
 * 顺带把「没有正文来源时按空串处理」这条兜底路径测到。
 */
function fakeReq(options = {}) {
  const { method = 'GET', url = API_PREFIX + '/health', headers = {}, body, rawChunks } = options
  const req = {
    method,
    url,
    headers: { 'x-ntdpet-token': TOKEN, ...headers },
  }

  const chunks = rawChunks ?? (body === undefined ? null : [body])
  if (chunks) {
    req[Symbol.asyncIterator] = async function* push() {
      for (const chunk of chunks) {
        yield typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk
      }
    }
  }

  return req
}

/**
 * 发一次请求。
 *
 * @param {object} options 请求侧参数
 * @param {object} [extra] 追加的 handler 选项，用于注入 readMood 之类
 */
function call(options, extra = {}) {
  const handler = createApiHandler({
    token: TOKEN,
    origin: ORIGIN,
    now: () => 1_700_000_000_000,
    ...extra,
  })
  const req = fakeReq(options)
  const res = fakeRes()
  handler(req, res)
  return { res, json: res.body ? JSON.parse(res.body) : null }
}

/** 正文是 JSON 就解析，不是（比如事件流）就给 null。 */
function parseJSON(body) {
  if (!body) return null
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

/**
 * 同 call，但等 handler 的异步分支写完响应。
 *
 * 记忆接口要等存储层读完才写响应，不等就会断言到一个 `statusCode: 0` 的
 * 空响应——那不是功能坏了，是测试没等。
 *
 * `json` 在正文不是 JSON 时给 null：对话接口回的是事件流，那种响应本来就
 * 该由 parseEvents 去拆，硬解析只会抛一个与功能无关的语法错误。
 */
async function callAsync(options, extra = {}) {
  const handler = createApiHandler({
    token: TOKEN,
    origin: ORIGIN,
    now: () => 1_700_000_000_000,
    ...extra,
  })
  const req = fakeReq(options)
  const res = fakeRes()
  await handler(req, res)
  return { res, json: parseJSON(res.body) }
}

describe('健康检查', () => {
  it('带正确令牌时返回 200 与统一的成功结构', () => {
    const { res, json } = call({})
    assert.equal(res.statusCode, 200)
    assert.equal(json.ok, true)
    assert.equal(json.data.service, 'nt-dpet')
    assert.equal(json.data.path, '/api/ntdpet/health')
    assert.equal(typeof json.data.at, 'number')
  })

  it('响应带 no-store 与 nosniff，避免被缓存或嗅探', () => {
    const { res } = call({})
    assert.equal(res.headers['cache-control'], 'no-store')
    assert.equal(res.headers['x-content-type-options'], 'nosniff')
    assert.match(res.headers['content-type'], /application\/json/)
  })

  it('查询串传令牌同样放行', () => {
    const { res, json } = call({ url: API_PREFIX + '/health?token=' + TOKEN })
    assert.equal(res.statusCode, 200)
    assert.equal(json.ok, true)
  })
})

describe('鉴权', () => {
  it('完全不带令牌返回 401', () => {
    const { res, json } = call({ headers: { 'x-ntdpet-token': undefined } })
    assert.equal(res.statusCode, 401)
    assert.equal(json.ok, false)
    assert.equal(json.error.code, 'UNAUTHORIZED')
  })

  it('长度相同的错令牌返回 401', () => {
    const { res, json } = call({ headers: { 'x-ntdpet-token': 'b'.repeat(64) } })
    assert.equal(res.statusCode, 401)
    assert.equal(json.error.code, 'UNAUTHORIZED')
  })

  it('长度不同的错令牌返回 401，不因定长比较抛异常', () => {
    const { res } = call({ headers: { 'x-ntdpet-token': 'short' } })
    assert.equal(res.statusCode, 401)
  })

  it('跨源 Origin 即使令牌正确也拒绝', () => {
    const { res, json } = call({ headers: { origin: 'http://evil.example.com' } })
    assert.equal(res.statusCode, 401)
    assert.equal(json.error.code, 'UNAUTHORIZED')
  })

  it('同源 Origin 放行', () => {
    const { res } = call({ headers: { origin: ORIGIN } })
    assert.equal(res.statusCode, 200)
  })
})

describe('子路径分发', () => {
  it('已规划但未接入的接口返回 503 NOT_READY', () => {
    // /mood 由 M0.2.2 接入、/memory/recent 由 M0.2.3 接入、/chat 由 M0.2.4 接入、
    // /status 由 M0.3.2 接入，都有各自的分支与用例；这里只留同前缀下仍未接入的路径，
    // 顺带守住「只有被单独处理的子路径才离开占位」这条边界。
    for (const path of ['/memory/facts']) {
      const { res, json } = call({ url: API_PREFIX + path })
      assert.equal(res.statusCode, 503, path)
      assert.equal(json.error.code, 'NOT_READY', path)
    }
  })

  it('/memory 这条前缀仍留在占位表里', () => {
    // 只有 /memory/recent 被单独处理。提前删掉 /memory 会让「记忆列表还没做」
    // 变成 404「地址写错了」，排查时白跑一趟——这条断言守住那个区分。
    for (const path of ['/memory', '/memory/']) {
      const { res, json } = call({ url: API_PREFIX + path })
      assert.equal(res.statusCode, 503, path)
      assert.equal(json.error.code, 'NOT_READY', path)
    }
  })

  it('未知子路径返回 404 NOT_FOUND', () => {
    const { res, json } = call({ url: API_PREFIX + '/nope' })
    assert.equal(res.statusCode, 404)
    assert.equal(json.error.code, 'NOT_FOUND')
  })

  it('健康检查收到 POST 时返回 405', () => {
    const { res, json } = call({ method: 'POST' })
    assert.equal(res.statusCode, 405)
    assert.equal(json.error.code, 'METHOD_NOT_ALLOWED')
  })

  it('错误响应不回显令牌', () => {
    const { res } = call({ headers: { 'x-ntdpet-token': 'c'.repeat(64) } })
    assert.ok(!res.body.includes('c'.repeat(64)))
    assert.ok(!res.body.includes(TOKEN))
  })
})

describe('情绪接口', () => {
  const reading = { mood: 0.68, energy: 0.42 }

  it('注入读数时返回 200 与两维数值', () => {
    const { res, json } = call({ url: API_PREFIX + '/mood' }, { readMood: () => reading })
    assert.equal(res.statusCode, 200)
    assert.equal(json.ok, true)
    assert.deepEqual(json.data, reading)
  })

  it('情绪服务没起来时返回 503，而不是编一个默认值', () => {
    const { res, json } = call({ url: API_PREFIX + '/mood' })
    assert.equal(res.statusCode, 503)
    assert.equal(json.error.code, 'NOT_READY')
    // 关键：不能出现 mood 字段，否则界面会把默认值当成真实情绪
    assert.equal(json.data, undefined)
  })

  it('服务在但读不出值时同样 503', () => {
    const { res, json } = call({ url: API_PREFIX + '/mood' }, { readMood: () => undefined })
    assert.equal(res.statusCode, 503)
    assert.equal(json.error.code, 'NOT_READY')
  })

  it('POST 到情绪接口返回 405', () => {
    const { res, json } = call({ url: API_PREFIX + '/mood', method: 'POST' }, { readMood: () => reading })
    assert.equal(res.statusCode, 405)
    assert.equal(json.error.code, 'METHOD_NOT_ALLOWED')
  })

  it('情绪接口同样要过鉴权', () => {
    const { res } = call(
      { url: API_PREFIX + '/mood', headers: { 'x-ntdpet-token': 'b'.repeat(64) } },
      { readMood: () => reading },
    )
    assert.equal(res.statusCode, 401)
  })

  it('情绪接口不缓存', () => {
    const { res } = call({ url: API_PREFIX + '/mood' }, { readMood: () => reading })
    assert.equal(res.headers['cache-control'], 'no-store')
  })
})

describe('记忆接口', () => {
  const items = [
    { id: 'raw_1', role: 'user', text: '不吃香菜', at: 1_700_000_000_000 },
    { id: 'raw_2', role: 'assistant', text: '那我记下了', at: 1_700_000_001_000 },
  ]

  it('有数据时原样返回条目', async () => {
    const { res, json } = await callAsync(
      { url: API_PREFIX + '/memory/recent' },
      { readRecent: () => items },
    )
    assert.equal(res.statusCode, 200)
    assert.equal(json.ok, true)
    assert.deepEqual(json.data.items, items)
  })

  it('没传参数时用默认会话键与默认 8 条', async () => {
    let seen = null
    await callAsync(
      { url: API_PREFIX + '/memory/recent' },
      { readRecent: (session, limit) => { seen = { session, limit }; return [] } },
    )
    assert.deepEqual(seen, { session: 'c2c:local', limit: 8 })
  })

  it('会话键与条数按入参生效', async () => {
    let seen = null
    const { json } = await callAsync(
      { url: API_PREFIX + '/memory/recent?session=group:887766&limit=3' },
      { readRecent: (session, limit) => { seen = { session, limit }; return [] } },
    )
    assert.deepEqual(seen, { session: 'group:887766', limit: 3 })
    // 回传实际生效值，调用方不必猜
    assert.equal(json.data.session, 'group:887766')
    assert.equal(json.data.limit, 3)
  })

  it('条数超过上限时压到 50，并如实回传', async () => {
    let seen = null
    const { json } = await callAsync(
      { url: API_PREFIX + '/memory/recent?limit=999' },
      { readRecent: (session, limit) => { seen = limit; return [] } },
    )
    assert.equal(seen, 50)
    assert.equal(json.data.limit, 50)
  })

  it('条数不是正整数时返回 400，不悄悄换成默认值', async () => {
    for (const bad of ['0', '-1', 'abc', '1.5']) {
      const { res, json } = await callAsync(
        { url: API_PREFIX + '/memory/recent?limit=' + encodeURIComponent(bad) },
        { readRecent: () => items },
      )
      assert.equal(res.statusCode, 400, bad)
      assert.equal(json.error.code, 'BAD_REQUEST', bad)
    }
  })

  it('会话键格式不对时返回 400', async () => {
    // 退回默认值会让界面展示另一段会话的记忆：看起来正常，内容却是错的
    for (const bad of ['c2c:', 'telegram:1', 'c2c:含汉字', 'c2c:a b']) {
      const { res, json } = await callAsync(
        { url: API_PREFIX + '/memory/recent?session=' + encodeURIComponent(bad) },
        { readRecent: () => items },
      )
      assert.equal(res.statusCode, 400, bad)
      assert.equal(json.error.code, 'BAD_REQUEST', bad)
    }
  })

  it('空数组是「没有记忆」，返回 200 而不是 503', async () => {
    const { res, json } = await callAsync(
      { url: API_PREFIX + '/memory/recent' },
      { readRecent: () => [] },
    )
    assert.equal(res.statusCode, 200)
    assert.deepEqual(json.data.items, [])
  })

  it('记忆服务没起来时返回 503', async () => {
    const { res, json } = await callAsync({ url: API_PREFIX + '/memory/recent' })
    assert.equal(res.statusCode, 503)
    assert.equal(json.error.code, 'NOT_READY')
  })

  it('读回调返回 undefined 时同样 503', async () => {
    const { res, json } = await callAsync(
      { url: API_PREFIX + '/memory/recent' },
      { readRecent: () => undefined },
    )
    assert.equal(res.statusCode, 503)
    assert.equal(json.error.code, 'NOT_READY')
  })

  it('存储层抛异常时兜成 500，且不回显异常内容', async () => {
    const { res, json } = await callAsync(
      { url: API_PREFIX + '/memory/recent' },
      { readRecent: () => { throw new Error('db file is locked at /Users/x/memory.db') } },
    )
    assert.equal(res.statusCode, 500)
    assert.equal(json.error.code, 'INTERNAL')
    assert.ok(!res.body.includes('memory.db'))
  })

  it('POST 到记忆接口返回 405', async () => {
    const { res, json } = await callAsync(
      { url: API_PREFIX + '/memory/recent', method: 'POST' },
      { readRecent: () => items },
    )
    assert.equal(res.statusCode, 405)
    assert.equal(json.error.code, 'METHOD_NOT_ALLOWED')
  })

  it('记忆接口同样要过鉴权', async () => {
    const { res } = await callAsync(
      { url: API_PREFIX + '/memory/recent', headers: { 'x-ntdpet-token': 'b'.repeat(64) } },
      { readRecent: () => items },
    )
    assert.equal(res.statusCode, 401)
  })
})

describe('对话接口', () => {
  /** 造一个假运行器：依次吐出给定分块，按指定原因结束。 */
  function runner(deltas, stopReason = 'stop') {
    const seen = {}
    return {
      seen,
      run: async (input, sink) => {
        seen.input = input
        seen.signal = sink.signal
        for (const text of deltas) sink.delta(text)
        return { stopReason }
      },
    }
  }

  /** 发一次对话请求。默认正文里带一句正常消息。 */
  const chatCall = (options = {}, extra = {}) =>
    callAsync(
      {
        method: 'POST',
        url: API_PREFIX + '/chat',
        body: JSON.stringify({ text: '在吗' }),
        ...options,
      },
      extra,
    )

  /** 把事件流正文拆成事件对象。 */
  function parseEvents(body) {
    return body
      .split('\n\n')
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.startsWith('data:'))
      .map((chunk) => JSON.parse(chunk.slice(5).trim()))
  }

  it('非 POST 返回 405，且先于「未接入」判断', async () => {
    // 方法判断必须在前：否则一个 GET 会得到 503「没接入」，
    // 而真正的原因是方法用错了，排查会走错方向
    const { res, json } = await chatCall({ method: 'GET' })
    assert.equal(res.statusCode, 405)
    assert.equal(json.error.code, 'METHOD_NOT_ALLOWED')
  })

  it('没有注入运行器时返回 503，而不是假装收到了消息', async () => {
    const { res, json } = await chatCall()
    assert.equal(res.statusCode, 503)
    assert.equal(json.error.code, 'NOT_READY')
  })

  it('正文不是 JSON 时返回 400', async () => {
    const { res, json } = await chatCall({ body: '不是 json' }, { chat: runner([]).run })
    assert.equal(res.statusCode, 400)
    assert.equal(json.error.code, 'BAD_REQUEST')
  })

  it('消息为空或全空格时返回 400', async () => {
    for (const body of ['', '{}', JSON.stringify({ text: '   ' }), JSON.stringify({ text: 1 })]) {
      const { res, json } = await chatCall({ body }, { chat: runner([]).run })
      assert.equal(res.statusCode, 400, body)
      assert.equal(json.error.code, 'BAD_REQUEST', body)
    }
  })

  it('消息超过 4000 字时返回 400，不把整段塞进模型', async () => {
    const long = '字'.repeat(4001)
    const { res, json } = await chatCall(
      { body: JSON.stringify({ text: long }) },
      { chat: runner([]).run },
    )
    assert.equal(res.statusCode, 400)
    assert.equal(json.error.code, 'BAD_REQUEST')
  })

  it('请求正文超过 64KB 时返回 400，不整段读进内存', async () => {
    const huge = JSON.stringify({ text: 'a'.repeat(70 * 1024) })
    const { res, json } = await chatCall({ body: huge }, { chat: runner([]).run })
    assert.equal(res.statusCode, 400)
    assert.equal(json.error.code, 'BAD_REQUEST')
  })

  it('会话键格式不对时返回 400', async () => {
    const { res, json } = await chatCall(
      { body: JSON.stringify({ text: '在吗', session: 'telegram:1' }) },
      { chat: runner([]).run },
    )
    assert.equal(res.statusCode, 400)
    assert.equal(json.error.code, 'BAD_REQUEST')
  })

  it('正常一轮：先 delta 后 done，走事件流而不是 JSON', async () => {
    const r = runner(['你', '好呀'])
    const { res } = await chatCall({}, { chat: r.run })

    assert.equal(res.statusCode, 200)
    assert.match(res.headers['content-type'], /text\/event-stream/)
    assert.equal(res.headers['cache-control'], 'no-store')
    assert.deepEqual(parseEvents(res.body), [
      { type: 'delta', text: '你' },
      { type: 'delta', text: '好呀' },
      { type: 'done', stopReason: 'stop' },
    ])
  })

  it('交给运行器的是 trim 过的原文与默认会话键', async () => {
    const r = runner(['嗯'])
    await chatCall({ body: JSON.stringify({ text: '  在吗 \n' }) }, { chat: r.run })
    assert.deepEqual(r.seen.input, { sessionKey: 'c2c:local', text: '在吗' })
  })

  it('运行器说服务没起来时，仍能用 503 说清楚', async () => {
    // 这条守住「第一块正文之前还能改状态码」这个约定：
    // 一旦写过 delta，响应头已经发出，503 就再也发不出去了
    const { res, json } = await chatCall(
      {},
      {
        chat: async () => {
          throw new NotReadyError('对话服务未就绪')
        },
      },
    )
    assert.equal(res.statusCode, 503)
    assert.equal(json.error.code, 'NOT_READY')
  })

  it('生成中途出错时，把失败当成流里的一条事件交出去', async () => {
    const { res } = await chatCall(
      {},
      {
        chat: async (input, sink) => {
          sink.delta('我说到一半')
          throw new Error('provider 断了')
        },
      },
    )
    // 状态码已经发出去了，改不了；关键是不能一个字都不给就断
    assert.equal(res.statusCode, 200)
    const events = parseEvents(res.body)
    assert.equal(events[0].type, 'delta')
    assert.equal(events.at(-1).type, 'error')
    // 异常原文不外泄
    assert.ok(!res.body.includes('provider 断了'))
  })

  it('中断时 done 事件的 stopReason 是 aborted，界面据此显示「已中断」', async () => {
    const r = runner(['说到一半'], 'aborted')
    const { res } = await chatCall({}, { chat: r.run })
    assert.equal(parseEvents(res.body).at(-1).stopReason, 'aborted')
  })

  it('正文为空也照常发头与终态，前端不会一直等', async () => {
    const { res } = await chatCall({}, { chat: runner([]).run })
    assert.equal(res.statusCode, 200)
    assert.deepEqual(parseEvents(res.body), [{ type: 'done', stopReason: 'stop' }])
  })

  it('汉字被拆在两个数据块里也能正确解码', async () => {
    // 一个汉字三字节。按字节切块是真实网络的常态，
    // 用 `decode(chunk)` 而不是 `decode(chunk, { stream: true })` 就会出乱码
    const bytes = new TextEncoder().encode(JSON.stringify({ text: '你好' }))
    const { res } = await chatCall(
      { rawChunks: [bytes.slice(0, 17), bytes.slice(17)] },
      { chat: runner([]).run },
    )
    assert.equal(res.statusCode, 200)
  })

  it('对端断开时中止上游，模型不会白算到结束', async () => {
    let signal = null
    const handler = createApiHandler({
      token: TOKEN,
      origin: ORIGIN,
      chat: async (input, sink) => {
        signal = sink.signal
        // 一直等到被中止，模拟一个还没生成完的长回复
        await new Promise((resolve) => sink.signal.addEventListener('abort', resolve, { once: true }))
        return { stopReason: 'aborted' }
      },
    })

    const res = fakeRes()
    const pending = handler(
      fakeReq({ method: 'POST', url: API_PREFIX + '/chat', body: JSON.stringify({ text: '在吗' }) }),
      res,
    )

    // 读正文是异步的，等一轮微任务再触发关闭，否则 signal 还没建出来
    await new Promise((resolve) => setImmediate(resolve))
    res.onClose()
    await pending

    assert.equal(signal !== null, true)
    assert.equal(signal.aborted, true)
  })
})

/**
 * 自检结果的形状。
 *
 * 三项判据的 id 与 severity 都是对外契约：界面按 severity 分档、按 id 找原因，
 * 改名字等于改协议。这里固定一份真实的形状来测，而不是造个 {ok:true} 糊过去。
 */
const STATUS_OK = {
  ok: true,
  checks: [
    { id: 'entry-count', ok: true, detail: '配置树 12 个条目，全部已激活', severity: 'warn' },
    { id: 'privacy-switches', ok: true, detail: '两项隐私开关均为 enabled: false', severity: 'fatal' },
    { id: 'key-packages', ok: true, detail: '4 个关键包均已激活', severity: 'warn' },
  ],
}

const STATUS_BAD = {
  ok: false,
  checks: [
    { id: 'entry-count', ok: true, detail: '配置树 12 个条目，全部已激活', severity: 'warn' },
    { id: 'privacy-switches', ok: false, detail: '隐私开关未硬关：session-log-deepseek 的 enabled 为 true', severity: 'fatal' },
    { id: 'key-packages', ok: false, detail: '缺少关键包：memory', severity: 'warn' },
  ],
}

describe('自检接口', () => {
  it('注入结果时返回 200 并原样回传', () => {
    const { res, json } = call({ url: API_PREFIX + '/status' }, { readStatus: () => STATUS_BAD })

    assert.equal(res.statusCode, 200)
    assert.equal(json.ok, true)
    // 不做排序、不筛掉通过项：界面要按原顺序列出失败项，
    // 后端替它挑挑拣拣，排查时就看不出「哪一项本该有却没有」。
    assert.deepEqual(json.data, STATUS_BAD)
  })

  it('全部通过时如实回 ok:true，失败列表为空', () => {
    const { res, json } = call({ url: API_PREFIX + '/status' }, { readStatus: () => STATUS_OK })

    assert.equal(res.statusCode, 200)
    assert.equal(json.data.ok, true)
    assert.equal(json.data.checks.filter((item) => !item.ok).length, 0)
  })

  it('没注入读端口时返回 503', () => {
    const { res, json } = call({ url: API_PREFIX + '/status' })

    assert.equal(res.statusCode, 503)
    assert.equal(json.error.code, 'NOT_READY')
  })

  it('自检还没跑完（返回 undefined）时也是 503，不给空结论', () => {
    // 这一条是本次最容易写错的地方：若在这里回一个 {ok:true, checks:[]}，
    // 界面就会在自检没跑完时判定「一切正常」并把横幅收起来，真异常永远不露面。
    const { res, json } = call({ url: API_PREFIX + '/status' }, { readStatus: () => undefined })

    assert.equal(res.statusCode, 503)
    assert.equal(json.error.code, 'NOT_READY')
  })

  it('只接受 GET', () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const { res, json } = call({ method, url: API_PREFIX + '/status' }, { readStatus: () => STATUS_OK })
      assert.equal(res.statusCode, 405, method)
      assert.equal(json.error.code, 'METHOD_NOT_ALLOWED', method)
    }
  })

  it('HEAD 与 GET 同等对待', () => {
    const { res } = call({ method: 'HEAD', url: API_PREFIX + '/status' }, { readStatus: () => STATUS_OK })
    assert.equal(res.statusCode, 200)
  })

  it('未授权时看不到自检结果', () => {
    const { res, json } = call(
      { url: API_PREFIX + '/status', headers: { 'x-ntdpet-token': 'b'.repeat(64) } },
      { readStatus: () => STATUS_BAD },
    )

    assert.equal(res.statusCode, 401)
    assert.equal(json.error.code, 'UNAUTHORIZED')
    assert.ok(!res.body.includes('privacy-switches'))
  })
})

describe('注入页面', () => {
  it('插到 </head> 之前，不破坏原有结构', () => {
    const html = '<html><head><title>x</title></head><body></body></html>'
    const out = injectToken(html, TOKEN)
    assert.ok(out.includes('window.__NTDPET_TOKEN__="' + TOKEN + '"'))
    assert.ok(out.indexOf('window.__NTDPET_TOKEN__') < out.indexOf('</head>'))
    assert.ok(out.endsWith('<body></body></html>'))
  })

  it('没有 head 时前置注入，仍能拿到令牌', () => {
    const out = injectToken('<div>裸片段</div>', TOKEN)
    assert.ok(out.startsWith('<script>'))
    assert.ok(out.endsWith('<div>裸片段</div>'))
  })
})

describe('令牌生成', () => {
  it('未配置 NTDPET_HOME 时给出 64 位十六进制且进程内稳定', () => {
    resetTokenCache()
    const first = resolveToken({})
    const second = resolveToken({})
    assert.match(first, /^[0-9a-f]{64}$/)
    assert.equal(first, second)
  })

  it('令牌不重复', () => {
    resetTokenCache()
    const a = resolveToken({})
    resetTokenCache()
    const b = resolveToken({})
    assert.notEqual(a, b)
  })
})

describe('真实 HTTP 栈', () => {
  /**
   * 假 req/res 能验证分支，但不能证明「真到了 HTTP 这一层还成立」——
   * 尤其是 URL 解析、请求头大小写、响应头是否真的写出。这里起一个临时端口
   * 绑 127.0.0.1:0（由系统分配），用 fetch 走完整链路，结束后立刻关闭。
   */
  it('真实请求下 health 返回 200、错令牌 401、未接入接口 503', async () => {
    const server = createServer()
    let origin = ''
    server.on('request', (req, res) => {
      createApiHandler({ token: TOKEN, origin })(req, res)
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    origin = 'http://127.0.0.1:' + address.port

    try {
      const ok = await fetch(origin + API_PREFIX + '/health', {
        headers: { 'x-ntdpet-token': TOKEN },
      })
      assert.equal(ok.status, 200)
      assert.equal(ok.headers.get('cache-control'), 'no-store')
      const body = await ok.json()
      assert.equal(body.ok, true)
      assert.equal(body.data.service, 'nt-dpet')

      const denied = await fetch(origin + API_PREFIX + '/health')
      assert.equal(denied.status, 401)
      assert.equal((await denied.json()).error.code, 'UNAUTHORIZED')

      const pending = await fetch(origin + API_PREFIX + '/mood', {
        headers: { 'x-ntdpet-token': TOKEN },
      })
      assert.equal(pending.status, 503)
      assert.equal((await pending.json()).error.code, 'NOT_READY')
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })
})

describe('不新增监听端口', () => {
  it('handler 只做请求处理，自己不监听端口', async () => {
    // 方案 A 的全部意义就是复用宿主端口。若将来有人图省事在包里 listen，
    // 这条断言会先炸，而不是等到线上发现多了一个暴露端口。
    for (const file of ['api/handler.js', 'api/token.js', 'index.js']) {
      const source = await readFile(join(HERE, '..', 'dist', file), 'utf8')
      assert.ok(!source.includes('.listen('), file + ' 不应自行监听端口')
      assert.ok(!source.includes('node:http"'), file + ' 不应创建 HTTP 服务')
    }
  })
})
