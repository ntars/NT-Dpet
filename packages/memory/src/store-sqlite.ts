// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 记忆的 SQLite 存储实现。
 *
 * 为什么用 `node:sqlite`（决策 92）：
 *   - Node 22.22 起**无需 flag** 即可用（实测），只是会打印 ExperimentalWarning
 *   - 零依赖、无原生模块，省掉 better-sqlite3 的 electron-rebuild 地狱
 *   - 同步 API，与我们的读写模式一致
 * 风险：仍标记为实验特性，API 可能变。因此上层只依赖 `MemoryStore` 端口，
 * 真要换实现只改这一处；启动时也会做一次自检（打不开就退回内存实现）。
 *
 * 不加密（决策 89）：目录 0700、库文件 0600，安全边界由文件权限承担。
 */

import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type { MemoryStore } from './store.js'
import type { MemoryFact, MemoryRaw } from './types.js'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memory_raw (
  id          TEXT PRIMARY KEY,
  session_key TEXT NOT NULL,
  speaker_id  TEXT,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  extracted   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_raw_lookup ON memory_raw(session_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_pending ON memory_raw(extracted, created_at);

CREATE TABLE IF NOT EXISTS memory_fact (
  id              TEXT PRIMARY KEY,
  session_key     TEXT NOT NULL,
  subject_id      TEXT,
  predicate       TEXT NOT NULL,
  object          TEXT NOT NULL,
  confidence      REAL NOT NULL,
  importance      REAL NOT NULL,
  source_raw_id   TEXT,
  created_at      INTEGER NOT NULL,
  superseded_by   TEXT,
  manually_edited INTEGER NOT NULL DEFAULT 0,
  deleted_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_fact_lookup ON memory_fact(session_key, superseded_by);
`

/** 打开（或创建）一个 SQLite 记忆库。 */
export function createSqliteStore(dbPath: string): MemoryStore {
  const dir = dirname(dbPath)
  if (!existsSync(dir)) {
    // 目录只给属主，防止同机其他用户读到聊天原文（决策 89）
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }

  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec(SCHEMA)
  try {
    chmodSync(dbPath, 0o600)
  } catch {
    // 某些文件系统（网络盘）不支持 chmod，不影响功能，只是权限弱一些
  }

  const insertRaw = db.prepare(
    `INSERT OR REPLACE INTO memory_raw (id, session_key, speaker_id, role, content, created_at, extracted)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertFact = db.prepare(
    `INSERT OR REPLACE INTO memory_fact
      (id, session_key, subject_id, predicate, object, confidence, importance,
       source_raw_id, created_at, superseded_by, manually_edited, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const selectRaw = db.prepare(
    `SELECT * FROM memory_raw WHERE session_key = ? ORDER BY created_at DESC LIMIT ?`,
  )
  const selectFacts = db.prepare(`SELECT * FROM memory_fact WHERE session_key = ?`)
  const markOne = db.prepare(`UPDATE memory_raw SET extracted = 1 WHERE id = ?`)
  const softDelete = db.prepare(`UPDATE memory_fact SET deleted_at = ? WHERE id = ?`)
  const selectPending = db.prepare(
    `SELECT * FROM memory_raw WHERE extracted = 0 ORDER BY created_at ASC LIMIT ?`,
  )

  return {
    async appendRaw(entry) {
      insertRaw.run(
        entry.id, entry.sessionKey, entry.speakerId, entry.role,
        entry.content, entry.createdAt, entry.extracted ? 1 : 0,
      )
    },
    async appendFact(fact) {
      insertFact.run(
        fact.id, fact.sessionKey, fact.subjectId, fact.predicate, fact.object,
        fact.confidence, fact.importance, fact.sourceRawId, fact.createdAt,
        fact.supersededBy, fact.manuallyEdited ? 1 : 0, fact.deletedAt,
      )
    },
    async listRaw(sessionKey, limit) {
      return (selectRaw.all(sessionKey, limit) as unknown as RawRow[]).map(toRaw)
    },
    async listFacts(sessionKey) {
      return (selectFacts.all(sessionKey) as unknown as FactRow[]).map(toFact)
    },
    async markExtracted(ids) {
      for (const id of ids) markOne.run(id)
    },
    async softDeleteFact(id, at) {
      softDelete.run(at, id)
    },
    async listUnextracted(limit) {
      return (selectPending.all(limit) as unknown as RawRow[]).map(toRaw)
    },
  }
}

interface RawRow {
  id: string; session_key: string; speaker_id: string | null; role: string
  content: string; created_at: number; extracted: number
}

interface FactRow {
  id: string; session_key: string; subject_id: string | null; predicate: string
  object: string; confidence: number; importance: number; source_raw_id: string | null
  created_at: number; superseded_by: string | null; manually_edited: number; deleted_at: number | null
}

/** 数据库列名是下划线风格，转回驼峰。集中在这里，避免散落各处。 */
function toRaw(r: RawRow): MemoryRaw {
  return {
    id: r.id, sessionKey: r.session_key, speakerId: r.speaker_id,
    role: r.role === 'assistant' ? 'assistant' : 'user',
    content: r.content, createdAt: r.created_at, extracted: r.extracted === 1,
  }
}

function toFact(r: FactRow): MemoryFact {
  return {
    id: r.id, sessionKey: r.session_key, subjectId: r.subject_id,
    predicate: r.predicate, object: r.object, confidence: r.confidence,
    importance: r.importance, sourceRawId: r.source_raw_id, createdAt: r.created_at,
    supersededBy: r.superseded_by, manuallyEdited: r.manually_edited === 1,
    deletedAt: r.deleted_at,
  }
}
