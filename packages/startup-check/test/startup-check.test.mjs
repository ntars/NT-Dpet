/**
 * @nt-dpet/startup-check 的单元测试。
 *
 * 用 Node 内置的 node:test，不引入测试框架——本包是纯计算，
 * 判定与采集都不碰真实宿主，四类异常可以直接构造快照来测。
 *
 * 跑法：先 build，再 node --test test/
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { evaluateStartup, failingChecks } from '../dist/checks.js'
import { snapshotFromLoader } from '../dist/snapshot.js'

/** 造一个配置树条目，默认是「已激活、关键包之一」。 */
function entry(overrides = {}) {
  return {
    id: 'nt-dpet:core:memory',
    name: '@nt-dpet/memory',
    disabled: false,
    active: true,
    error: null,
    enabled: undefined,
    ...overrides,
  }
}

/** 一份全部正常的配置树：四个关键包在位，两个隐私项都关着。 */
function healthyEntries() {
  return [
    entry({ id: 'nt-dpet:core:emotion', name: '@nt-dpet/emotion' }),
    entry({ id: 'nt-dpet:core:memory', name: '@nt-dpet/memory' }),
    entry({ id: 'nt-dpet:dialogue:dialogue', name: '@nt-dpet/dialogue' }),
    entry({ id: 'nt-dpet:dialogue:persona', name: '@nt-dpet/persona' }),
    entry({ id: 'session-log-deepseek', name: '@deepseek-ai/dsh-session-log', enabled: false }),
    entry({
      id: 'plugin-package-inventory-deepseek',
      name: '@deepseek-ai/dsh-plugin-package-inventory',
      enabled: false,
    }),
  ]
}

function snapshot(entries) {
  return { profileName: 'desktop', readable: true, reason: null, entries }
}

/** 按 id 取某一项结论，顺手断言它确实存在——免得漏项被静默当成通过。 */
function pick(result, id) {
  const found = result.checks.find((check) => check.id === id)
  assert.ok(found, `结果里缺少自检项 ${id}`)
  return found
}

describe('场景一：全部通过', () => {
  it('三项全绿时总体为通过', () => {
    const result = evaluateStartup(snapshot(healthyEntries()))
    assert.equal(result.ok, true)
    assert.equal(result.checks.length, 3)
    for (const check of result.checks) assert.equal(check.ok, true, `${check.id} 不该失败`)
  })

  it('条目数的统计口径写进 detail，能看出数了多少', () => {
    const result = evaluateStartup(snapshot(healthyEntries()))
    assert.match(pick(result, 'entry-count').detail, /6 个条目，全部已激活/)
  })

  it('关键包通过与缺失都不静默，detail 里带得出包名', () => {
    const result = evaluateStartup(snapshot(healthyEntries()))
    assert.match(pick(result, 'key-packages').detail, /@nt-dpet\/emotion/)
  })
})

describe('场景二：条目缺失', () => {
  it('隐私条目整个不在配置树里，判为失败', () => {
    const entries = healthyEntries().filter((item) => item.id !== 'session-log-deepseek')
    const result = evaluateStartup(snapshot(entries))
    const privacy = pick(result, 'privacy-switches')
    assert.equal(privacy.ok, false)
    assert.match(privacy.detail, /session-log-deepseek 不在配置树里/)
    assert.equal(result.ok, false)
  })

  it('缺的是另一个隐私项也要报出来', () => {
    const entries = healthyEntries().filter(
      (item) => item.id !== 'plugin-package-inventory-deepseek',
    )
    const result = evaluateStartup(snapshot(entries))
    assert.match(pick(result, 'privacy-switches').detail, /plugin-package-inventory-deepseek/)
  })

  it('隐私项的 enabled 没写，等同于可能还开着，判失败', () => {
    const entries = healthyEntries().map((item) =>
      item.id === 'session-log-deepseek' ? { ...item, enabled: undefined } : item,
    )
    const result = evaluateStartup(snapshot(entries))
    const privacy = pick(result, 'privacy-switches')
    assert.equal(privacy.ok, false)
    assert.match(privacy.detail, /不是明确的 false/)
  })
})

describe('场景三：隐私开启', () => {
  it('enabled 被改成 true 时判失败，且严重级别是拒绝启动', () => {
    const entries = healthyEntries().map((item) =>
      item.id === 'session-log-deepseek' ? { ...item, enabled: true } : item,
    )
    const result = evaluateStartup(snapshot(entries))
    const privacy = pick(result, 'privacy-switches')
    assert.equal(privacy.ok, false)
    assert.equal(privacy.severity, 'fatal')
    assert.match(privacy.detail, /enabled 为 true/)
    assert.equal(result.ok, false)
  })

  it('隐私失败能被单独筛出来，供界面走「已拒绝启动」', () => {
    const entries = healthyEntries().map((item) =>
      item.id === 'plugin-package-inventory-deepseek' ? { ...item, enabled: true } : item,
    )
    const result = evaluateStartup(snapshot(entries))
    const fatal = failingChecks(result, 'fatal')
    assert.equal(fatal.length, 1)
    assert.equal(fatal[0].id, 'privacy-switches')
  })

  it('靠禁用整条达成静默不算违规，但要留下提醒', () => {
    const entries = healthyEntries().map((item) =>
      item.id === 'session-log-deepseek'
        ? { ...item, enabled: undefined, disabled: true }
        : item,
    )
    const result = evaluateStartup(snapshot(entries))
    const privacy = pick(result, 'privacy-switches')
    assert.equal(privacy.ok, true)
    assert.match(privacy.detail, /靠禁用整条达成静默/)
  })
})

describe('场景四：关键包缺失', () => {
  it('缺 emotion 时判失败，且只报缺的那一个', () => {
    const entries = healthyEntries().filter((item) => item.name !== '@nt-dpet/emotion')
    const result = evaluateStartup(snapshot(entries))
    const keyPackages = pick(result, 'key-packages')
    assert.equal(keyPackages.ok, false)
    assert.match(keyPackages.detail, /缺少关键包 1 个：@nt-dpet\/emotion/)
    assert.equal(keyPackages.severity, 'warn')
  })

  it('包在配置树里但没激活，同样算缺失', () => {
    const entries = healthyEntries().map((item) =>
      item.name === '@nt-dpet/dialogue' ? { ...item, active: false } : item,
    )
    const result = evaluateStartup(snapshot(entries))
    assert.match(pick(result, 'key-packages').detail, /@nt-dpet\/dialogue/)
  })

  it('四个包同时缺席时全部列出', () => {
    const entries = healthyEntries().filter((item) => item.id.startsWith('session-log') || item.id.startsWith('plugin-package'))
    const result = evaluateStartup(snapshot(entries))
    assert.match(pick(result, 'key-packages').detail, /缺少关键包 4 个/)
  })
})

describe('条目数与激活数', () => {
  it('有条目没起来时判失败，并列出它的 id', () => {
    const entries = healthyEntries().map((item) =>
      item.id === 'nt-dpet:core:memory'
        ? { ...item, active: false, error: '失败' }
        : item,
    )
    const result = evaluateStartup(snapshot(entries))
    const count = pick(result, 'entry-count')
    assert.equal(count.ok, false)
    assert.match(count.detail, /5 个已激活/)
    assert.match(count.detail, /启动失败：nt-dpet:core:memory/)
  })

  it('未激活但没报错的，归到「未激活」而不是「启动失败」', () => {
    const entries = healthyEntries().map((item) =>
      item.id === 'nt-dpet:core:memory' ? { ...item, active: false, error: null } : item,
    )
    const result = evaluateStartup(snapshot(entries))
    const detail = pick(result, 'entry-count').detail
    assert.match(detail, /未激活：nt-dpet:core:memory/)
    assert.doesNotMatch(detail, /启动失败/)
  })

  it('被禁用的条目不参与统计，不算失败', () => {
    const entries = [
      ...healthyEntries(),
      entry({ id: 'nt-dpet:extra:off', name: '@nt-dpet/tts', disabled: true, active: false }),
    ]
    const result = evaluateStartup(snapshot(entries))
    assert.equal(pick(result, 'entry-count').ok, true)
    assert.match(pick(result, 'entry-count').detail, /6 个条目/)
  })

  it('配置树空空如也时判失败，而不是假装通过', () => {
    const result = evaluateStartup(snapshot([]))
    const count = pick(result, 'entry-count')
    assert.equal(count.ok, false)
    assert.match(count.detail, /没有任何可激活条目/)
  })

  it('未激活条目太多时 detail 折行，不把整棵树铺开', () => {
    const extra = Array.from({ length: 8 }, (_, index) =>
      entry({
        id: `nt-dpet:extra:${index}`,
        name: `@nt-dpet/extra-${index}`,
        active: false,
      }),
    )
    const result = evaluateStartup(snapshot([...healthyEntries(), ...extra]))
    const detail = pick(result, 'entry-count').detail
    assert.match(detail, /等 8 个/)
  })
})

describe('配置树不可读', () => {
  it('读不到时三项都判失败，隐私项仍是拒绝启动', () => {
    const result = evaluateStartup({
      profileName: null,
      readable: false,
      reason: 'loader 服务不可用',
      entries: [],
    })
    assert.equal(result.ok, false)
    assert.equal(result.checks.length, 3)
    for (const check of result.checks) assert.equal(check.ok, false, `${check.id} 不该通过`)
    assert.equal(pick(result, 'privacy-switches').severity, 'fatal')
  })

  it('原因会带进 detail，方便直接照抄去排查', () => {
    const result = evaluateStartup({
      profileName: null,
      readable: false,
      reason: 'loader 服务不可用',
      entries: [],
    })
    assert.match(pick(result, 'entry-count').detail, /loader 服务不可用/)
  })
})

describe('采集层', () => {
  it('分组节点被排除，不参与条目数统计', () => {
    const loader = {
      *entries() {
        yield { options: { id: 'group-1', group: true }, subgroup: {} }
        yield { options: { id: 'nt-dpet:core:memory', name: '@nt-dpet/memory' }, fiber: { state: 2 } }
      },
    }
    const result = snapshotFromLoader(loader, 'desktop')
    assert.equal(result.readable, true)
    assert.equal(result.entries.length, 1)
    assert.equal(result.entries[0].id, 'nt-dpet:core:memory')
    assert.equal(result.entries[0].active, true)
  })

  it('fiber 状态 3 记为启动失败，状态 0 记为未激活', () => {
    const loader = {
      *entries() {
        yield { options: { id: 'a', name: 'pkg-a' }, fiber: { state: 3 } }
        yield { options: { id: 'b', name: 'pkg-b' }, fiber: { state: 0 } }
      },
    }
    const result = snapshotFromLoader(loader, null)
    assert.equal(result.entries[0].error, '失败')
    assert.equal(result.entries[0].active, false)
    assert.equal(result.entries[1].error, null)
    assert.equal(result.entries[1].active, false)
  })

  it('读取 id 的 getter 抛错时不炸，改用包名占位', () => {
    const loader = {
      *entries() {
        const bad = { options: { name: '@nt-dpet/tts' } }
        Object.defineProperty(bad, 'id', {
          get() {
            throw new Error('parent tree missing')
          },
        })
        yield bad
      },
    }
    const result = snapshotFromLoader(loader, null)
    assert.equal(result.readable, true)
    assert.equal(result.entries[0].id, '@nt-dpet/tts')
  })

  it('loader 不可用时给出可读的原因，而不是抛异常', () => {
    const result = snapshotFromLoader(undefined, 'desktop')
    assert.equal(result.readable, false)
    assert.match(result.reason, /loader 服务不可用/)
    assert.equal(result.profileName, 'desktop')
  })

  it('遍历中途抛错时整体降级为不可读', () => {
    const loader = {
      *entries() {
        throw new Error('树被写坏了')
      },
    }
    const result = snapshotFromLoader(loader, null)
    assert.equal(result.readable, false)
    assert.match(result.reason, /树被写坏了/)
  })

  it('enabled 不是布尔值时按未设置处理', () => {
    const loader = {
      *entries() {
        yield {
          options: { id: 'session-log-deepseek', config: { enabled: 'yes' } },
          fiber: { state: 2 },
        }
      },
    }
    const result = snapshotFromLoader(loader, null)
    assert.equal(result.entries[0].enabled, undefined)
  })
})
