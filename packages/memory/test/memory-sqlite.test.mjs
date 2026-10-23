// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * SQLite 存储的持久化测试：写进去、关掉、重开，数据还在。
 * 用系统临时目录，跑完即删。
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { createSqliteStore } from '../dist/store-sqlite.js'
import { createMemoryService } from '../dist/service.js'

let dir
before(() => { dir = mkdtempSync(join(tmpdir(), 'ntdpet-mem-')) })
after(() => { rmSync(dir, { recursive: true, force: true }) })

const dbPath = () => join(dir, 'user', 'memory.db')

describe('SQLite 持久化', () => {
  it('写入后重开仍在（原文与事实都持久）', async () => {
    const svc1 = createMemoryService(createSqliteStore(dbPath()))
    await svc1.service.appendTurn({
      sessionKey: 's1', speakerId: 'u1',
      userText: '我明天要去体检，有点紧张', assistantText: '那我陪你记着',
    })
    await svc1.service.addFact({
      sessionKey: 's1', subjectId: 'u1', predicate: '明天要', object: '体检',
      confidence: 0.9, importance: 0.8, sourceRawId: null,
      supersededBy: null, manuallyEdited: false, deletedAt: null,
    })

    // 换一个全新的 store 实例，模拟进程重启
    const svc2 = createMemoryService(createSqliteStore(dbPath()))
    const raws = await svc2.service.recent('s1')
    assert.equal(raws.length, 2)
    const facts = await svc2.service.recall('s1', '体检')
    assert.equal(facts.length, 1)
    assert.equal(facts[0].fact.object, '体检')
  })

  it('已提炼标记会持久化，不会重复提炼', async () => {
    const store = createSqliteStore(dbPath())
    const svc = createMemoryService(store)
    svc.service.setExtractor(async (pending) => pending.map((r) => ({
      sessionKey: r.sessionKey, subjectId: r.speakerId, predicate: '说过',
      object: r.content.slice(0, 6), confidence: 0.5, importance: 0.3,
      sourceRawId: r.id, supersededBy: null, manuallyEdited: false, deletedAt: null,
    })))
    const n = await svc.service.extractNow()
    assert.ok(n >= 2, '应提炼出至少两条')
    assert.equal((await store.listUnextracted(10)).length, 0, '重开前已清空待提炼队列')

    const store2 = createSqliteStore(dbPath())
    assert.equal((await store2.listUnextracted(10)).length, 0, '重开后仍为空')
  })

  it('库文件权限是 0600，目录是 0700（不加密靠权限守）', () => {
    const fileMode = statSync(dbPath()).mode & 0o777
    const dirMode = statSync(join(dir, 'user')).mode & 0o777
    assert.equal(fileMode, 0o600, '库文件应为 0600，实际 ' + fileMode.toString(8))
    assert.equal(dirMode, 0o700, '目录应为 0700，实际 ' + dirMode.toString(8))
  })

  it('删除与取代的事实不参与检索', async () => {
    const svc = createMemoryService(createSqliteStore(dbPath()))
    await svc.service.addFact({
      sessionKey: 's2', subjectId: 'u1', predicate: '喜欢', object: '咖啡',
      confidence: 1, importance: 1, sourceRawId: null, supersededBy: null,
      manuallyEdited: false, deletedAt: Date.now(),
    })
    assert.equal((await svc.service.recall('s2', '咖啡')).length, 0)
  })
})
