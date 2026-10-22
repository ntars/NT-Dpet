/**
 * @nt-dpet/emotion 的单元测试。
 *
 * 用 Node 内置的 node:test，不引入 vitest 之类的依赖——这个包是纯计算，
 * 不需要测试框架的重装备。
 *
 * 跑法：先 build，再 node --test test/
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DEFAULT_DIFFUSE_COEFFICIENT,
  diffuseOffset,
} from '../dist/diffuse.js'
import { regress, resolveHalfLife, HALF_LIFE_PRESETS } from '../dist/decay.js'
import { EmotionState } from '../dist/state.js'
import { DEFAULT_GLOBAL, DEFAULT_RELATION } from '../dist/types.js'

const HOUR = 60 * 60 * 1000

describe('指数回归', () => {
  it('过半衰期后应走到基线与初值的中点', () => {
    // 从 0.9 回归到 0.5，半衰期 4 小时，过 4 小时应到 0.7
    const after = regress(0.9, 0.5, 4 * HOUR, HALF_LIFE_PRESETS.standard)
    assert.ok(Math.abs(after - 0.7) < 1e-9, `期望 0.7，实际 ${after}`)
  })

  it('两个半衰期后只剩四分之一未回归', () => {
    // 0.5 + 0.4 × exp(-2ln2) = 0.5 + 0.4 × 0.25 = 0.6
    const after = regress(0.9, 0.5, 8 * HOUR, HALF_LIFE_PRESETS.standard)
    assert.ok(Math.abs(after - 0.6) < 1e-9, `期望 0.6，实际 ${after}`)
  })

  it('低于基线时也朝基线回归', () => {
    const after = regress(0.1, 0.5, 4 * HOUR, HALF_LIFE_PRESETS.standard)
    assert.ok(Math.abs(after - 0.3) < 1e-9, `期望 0.3，实际 ${after}`)
  })

  it('不回归档：值永远不动', () => {
    assert.equal(regress(0.9, 0.5, 999 * HOUR, HALF_LIFE_PRESETS.never), 0.9)
  })

  it('时间为 0 或负数时原样返回', () => {
    assert.equal(regress(0.9, 0.5, 0, HALF_LIFE_PRESETS.standard), 0.9)
    assert.equal(regress(0.9, 0.5, -100, HALF_LIFE_PRESETS.standard), 0.9)
  })

  it('非有限输入不抛异常', () => {
    assert.equal(regress(NaN, 0.5, HOUR, HALF_LIFE_PRESETS.standard), NaN)
    assert.equal(regress(0.9, Infinity, HOUR, HALF_LIFE_PRESETS.standard), 0.9)
  })

  it('不认识的档位名按标准档处理', () => {
    assert.equal(resolveHalfLife('随便写的'), HALF_LIFE_PRESETS.standard)
    assert.equal(resolveHalfLife(undefined), HALF_LIFE_PRESETS.standard)
  })
})

describe('弥散', () => {
  it('心情低于基线时偏移为负（迁怒）', () => {
    const offset = diffuseOffset(0.3, 0.5, DEFAULT_DIFFUSE_COEFFICIENT, 0)
    assert.ok(offset < 0, `期望负数，实际 ${offset}`)
  })

  it('心情高于基线时偏移为正（爱屋及乌）', () => {
    const offset = diffuseOffset(0.7, 0.5, DEFAULT_DIFFUSE_COEFFICIENT, 0)
    assert.ok(offset > 0, `期望正数，实际 ${offset}`)
  })

  it('越熟受牵连越少', () => {
    const stranger = diffuseOffset(0.3, 0.5, DEFAULT_DIFFUSE_COEFFICIENT, 0)
    const familiar = diffuseOffset(0.3, 0.5, DEFAULT_DIFFUSE_COEFFICIENT, 1)
    assert.ok(
      Math.abs(familiar) < Math.abs(stranger),
      `熟人偏移 ${familiar} 应小于陌生人 ${stranger}`,
    )
  })

  it('心情在基线上时没有偏移', () => {
    assert.equal(diffuseOffset(0.5, 0.5, DEFAULT_DIFFUSE_COEFFICIENT, 0), 0)
  })
})

describe('状态容器', () => {
  it('初始值符合决策 72', () => {
    const state = new EmotionState()
    assert.deepEqual(state.readGlobal(), DEFAULT_GLOBAL)
    assert.deepEqual(state.readRelation('someone'), DEFAULT_RELATION)
  })

  it('刚写进去的值立刻能读回来（回归还没生效）', () => {
    const state = new EmotionState()
    state.writeGlobal({ mood: 0.9 })
    assert.equal(state.readGlobal().mood, 0.9)
  })

  it('超过一个半衰期后，写入值会向基线回归', () => {
    const state = new EmotionState()
    const start = 1_000_000
    state.writeGlobal({ mood: 0.9 }, start)
    const later = state.readGlobal(start + 4 * HOUR)
    assert.ok(Math.abs(later.mood - 0.7) < 1e-9, `期望 0.7，实际 ${later.mood}`)
  })

  it('连续读取不会累积回归误差', () => {
    const state = new EmotionState()
    const start = 1_000_000
    state.writeGlobal({ mood: 0.9 }, start)
    // 分四次读，每次过 1 小时
    let now = start
    let last = state.readGlobal(now).mood
    for (let i = 0; i < 4; i++) {
      now += HOUR
      last = state.readGlobal(now).mood
    }
    assert.ok(Math.abs(last - 0.7) < 1e-9, `分次读应与一次读结果一致，实际 ${last}`)
  })

  it('超界的写入值被夹到 0..1', () => {
    const state = new EmotionState()
    state.writeGlobal({ mood: 5 })
    assert.equal(state.readGlobal().mood, 1)
    state.writeGlobal({ mood: -5 })
    assert.equal(state.readGlobal().mood, 0)
  })

  it('关系从 0.4 跨到 0.6 时返回 true，需要立即落盘', () => {
    const state = new EmotionState()
    // 先落到 0.4（这一步会跨过 0.25 档，同样返回 true，但不影响后续断言）
    state.writeRelation('p1', { affection: 0.4 })
    assert.equal(state.writeRelation('p1', { affection: 0.6 }), true)
  })

  it('关系在同一档内移动返回 false，跨档返回 true', () => {
    const state = new EmotionState()
    // 0.1 → 0.2：都在 0.25 以下，同档
    assert.equal(state.writeRelation('p1', { affection: 0.2 }), false)
    // 0.2 → 0.3：跨过 0.25 档
    assert.equal(state.writeRelation('p1', { affection: 0.3 }), true)
    // 0.3 → 0.4：都在 0.25 与 0.5 之间，同档
    assert.equal(state.writeRelation('p1', { affection: 0.4 }), false)
  })

  it('不同参与者的关系互不干扰', () => {
    const state = new EmotionState()
    state.writeRelation('p1', { affection: 0.9 })
    state.writeRelation('p2', { affection: 0.2 })
    assert.equal(state.readRelation('p1').affection, 0.9)
    assert.equal(state.readRelation('p2').affection, 0.2)
  })

  it('重置清空关系并回到初始值', () => {
    const state = new EmotionState()
    state.writeGlobal({ mood: 0.1 })
    state.writeRelation('p1', { affection: 0.9 })
    state.reset()
    assert.deepEqual(state.readGlobal(), DEFAULT_GLOBAL)
    assert.deepEqual(state.readRelation('p1'), DEFAULT_RELATION)
  })

  it('快照是副本，改动快照不会影响内部状态', () => {
    const state = new EmotionState()
    state.writeGlobal({ mood: 0.9 })
    const snap = state.getSnapshot()
    snap.global.mood = 0
    assert.equal(state.readGlobal().mood, 0.9)
  })
})
