// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildVars, DEFAULT_ADDRESS, substitute, CAT_LEVEL_HINT } from '../dist/vars.js'
import { createPersonaService } from '../dist/service.js'

const variant = {
  layer: 'L1', name: 'test', budget: 350, relationship: 'sister',
  entries: [
    { id: 'identity', priority: 100, always: true, content: '我是{{name}}，喊你{{callUser}}。' },
    { id: 'personality', priority: 90, always: true, content: '我有点黏人。' },
    { id: 'todo_one', priority: 80, always: true, content: null },
  ],
}

describe('称呼默认值', () => {
  it('五种关系各有默认称呼', () => {
    assert.equal(DEFAULT_ADDRESS.sister, '哥哥')
    assert.equal(DEFAULT_ADDRESS.partner, '宝宝')
    assert.equal(DEFAULT_ADDRESS.assistant, '主人')
    assert.equal(DEFAULT_ADDRESS.parent, '爸爸')
  })

  it('换关系时称呼跟着变', () => {
    const { service } = createPersonaService({ relation: 'sister' })
    assert.equal(service.currentAddress(), '哥哥')
    service.setRelation('parent')
    assert.equal(service.currentAddress(), '爸爸')
  })

  it('手动改过称呼后，换关系不再改动它', () => {
    const { service } = createPersonaService({ relation: 'sister' })
    service.setAddressUser('阿玖')
    service.setRelation('partner')
    assert.equal(service.currentAddress(), '阿玖')
  })

  it('清空手动称呼后恢复跟随关系', () => {
    const { service } = createPersonaService({ relation: 'partner', addressUser: '阿玖' })
    service.setAddressUser('')
    assert.equal(service.currentAddress(), '宝宝')
  })
})

describe('变量替换', () => {
  it('支持双大括号与美元两种写法', () => {
    const vars = { name: '小鲸鱼', callUser: '哥哥' }
    assert.equal(substitute('我是{{name}}', vars), '我是小鲸鱼')
    assert.equal(substitute('我是$name', vars), '我是小鲸鱼')
  })

  it('未知占位原样保留，不静默清空', () => {
    assert.equal(substitute('我是{{who}}', {}), '我是{{who}}')
  })

  it('变量表包含称呼与浓度提示', () => {
    const vars = buildVars({ name: '小鲸鱼', relation: 'friend', addressUser: '阿玖', catLevel: 'heavy' })
    assert.equal(vars.callUser, '阿玖')
    assert.equal(vars.catHint, CAT_LEVEL_HINT.heavy)
  })
})

describe('锚点拼装', () => {
  it('按优先级降序拼接，并跳过空内容', () => {
    const { service } = createPersonaService({ name: '小鲸鱼', relation: 'sister' })
    const got = service.composeAnchor(variant)
    assert.ok(got.text.startsWith('我是小鲸鱼，喊你哥哥。'))
    assert.deepEqual(got.missing, ['todo_one'])
    assert.equal(got.entries[0].id, 'identity')
  })

  it('猫娘浓度作为独立一段追加在末尾', () => {
    const { service } = createPersonaService({ catLevel: 'light' })
    const got = service.composeAnchor(variant)
    assert.equal(got.entries.at(-1).id, 'cat_level')
    assert.equal(got.entries.at(-1).text, CAT_LEVEL_HINT.light)
  })

  it('换浓度会改变最后一段', () => {
    const { service } = createPersonaService({ catLevel: 'light' })
    const a = service.composeAnchor(variant).entries.at(-1).text
    service.setCatLevel('heavy')
    const b = service.composeAnchor(variant).entries.at(-1).text
    assert.notEqual(a, b)
  })
})

describe('内核 + 关系微调合并（决策 91）', () => {
  const core = {
    layer: 'L1', name: 'core', budget: 240, relationship: 'sister',
    entries: [
      { id: 'identity', priority: 100, always: true, content: '我是{{name}}。' },
      { id: 'honesty', priority: 94, always: true, content: '不知道就说不知道。' },
    ],
  }
  const delta = {
    layer: 'L1', name: 'delta', budget: 120, relationship: 'parent',
    entries: [
      { id: 'address', priority: 100, always: true, content: '你是我的{{callUser}}。' },
      { id: 'bond', priority: 85, always: true, content: '我黏你一点。' },
    ],
  }

  it('内核在前，关系微调随后，浓度最后', () => {
    const { service } = createPersonaService({ name: '小鲸鱼', relation: 'parent' })
    const got = service.compose(core, delta)
    const ids = got.entries.map((e) => e.id)
    assert.deepEqual(ids, ['identity', 'address', 'honesty', 'bond', 'cat_level'])
    assert.ok(got.text.includes('我是小鲸鱼。'))
    assert.ok(got.text.includes('你是我的爸爸。'))
  })

  it('同 id 条目后者覆盖前者', () => {
    const override = {
      layer: 'L1', name: 'o', budget: 10, relationship: 'sister',
      entries: [{ id: 'identity', priority: 100, always: true, content: '换个说法。' }],
    }
    const { service } = createPersonaService({ name: '小鲸鱼', relation: 'sister' })
    const got = service.compose(core, override)
    assert.ok(got.text.includes('换个说法。'))
    assert.ok(!got.text.includes('我是小鲸鱼。'))
  })

  it('composeAnchor 等价于 compose 单个变体', () => {
    const { service } = createPersonaService({ name: '小鲸鱼', relation: 'sister' })
    assert.equal(service.composeAnchor(delta).text, service.compose(delta).text)
  })
})
