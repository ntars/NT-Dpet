// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * @nt-dpet/memory — 记忆双层存储、异步提炼、三层裁决检索
 *
 * 设计依据：docs/ARCHITECTURE.md §6（记忆系统）、§6.7（不加密的取舍）
 * 决策依据：决策 22（双层）、23（衰减）、24（用户可编辑）、
 *           73、77（三层裁决与双路混合）、89（不加密）
 *
 * 当前实现范围：
 *   - 已实现：双层结构、原文写入、事实写入、三层裁决检索（关键词退化）、
 *             衰减档位、异步提炼调度（按会话合并 + 串行不并发）、
 *             提炼器（`createLlmExtractor`，严格 JSON 提示词 + 失败即丢弃
 *             + 20 条 / 3000 字截断）、提炼器挂载到服务（M0.4.2）
 *   - 未实现：向量检索路（等 sqlite-vec）
 */

import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { MEMORY_SERVICE_KEY, createMemoryService } from './service.js'
import { createMemoryStore } from './store.js'
import { createSqliteStore } from './store-sqlite.js'
import { createLlmExtractor, resolveLlm } from './extractor.js'

export { MEMORY_SERVICE_KEY } from './service.js'
export type { FactExtractor, MemoryService } from './service.js'
export type { DecayTier, MemoryFact, MemoryRaw } from './types.js'
export { DECAY_HALF_LIFE, DEFAULT_DECAY_TIER, RECALL_WEIGHTS } from './types.js'
export { bigrams, recall, recencyScore, semanticScore } from './recall.js'
export { createMemoryStore } from './store.js'
export { createSqliteStore } from './store-sqlite.js'
export type { MemoryStore } from './store.js'
export {
  EXTRACT_DEFAULT_PROVIDER,
  EXTRACT_MAX_CHARS,
  EXTRACT_MAX_RAW,
  ExtractParseError,
  buildExtractMessages,
  createLlmExtractor,
  parseFacts,
  resolveLlm,
  truncateRaw,
} from './extractor.js'
export type {
  ExtractorLlm,
  ExtractorMessage,
  ExtractorOptions,
  ExtractorChunk,
  FactDraft,
} from './extractor.js'

export const name = 'nt-dpet-memory'

/** 本包提供的服务名。 */
export const provide = MEMORY_SERVICE_KEY

/**
 * 选存储：配置了 `NTDPET_HOME` 就用 SQLite（落 `user/memory.db`），
 * 否则退回内存实现。打不开 SQLite 也不阻塞启动——记忆降级总比整套起不来好。
 */
function selectStore() {
  const home = process.env['NTDPET_HOME']
  if (!home) return createMemoryStore()
  try {
    return createSqliteStore(join(home, 'user', 'memory.db'))
  } catch (err) {
    ctx_log('SQLite 打开失败，退回内存存储：' + (err as Error).message)
    return createMemoryStore()
  }
}

/** 极简日志：本包不依赖 ctx.logger，避免在选存储阶段就要求上下文。 */
function ctx_log(msg: string): void {
  process.emitWarning(msg, 'NtDpetMemory')
}

export function apply(ctx: Context): () => void {
  const handle = createMemoryService(selectStore())
  const service = handle.service
  ctx.provide(MEMORY_SERVICE_KEY, service)

  // 有 llm 就顺手挂上提炼器（M0.4.2）。挂不上也不是故障：
  // memory 的职责是存与取，提炼只是「更好用」，不该成为起不来的理由。
  const llm = resolveLlm(ctx)
  if (llm) {
    service.setExtractor(
      createLlmExtractor(llm, {
        // 失败会话必须回报给服务，否则这批原文会被当成「已提炼」永久判死。
        // 这里只记日志、不重试：下轮调度自然会再取到它们。
        onSessionFail: (sessionKey, reason) => {
          ctx_log(`提炼失败（会话 ${sessionKey}）：${reason}；原文保留待下轮`)
          service.reportExtractFailure(sessionKey, reason)
        },
      }),
    )
  } else {
    ctx_log('未找到 llm 服务，本轮只存不提炼（原文层照常累积）')
  }

  return handle.dispose
}
