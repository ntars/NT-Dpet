// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 接口令牌。
 *
 * 为什么需要它：宿主只给「它自己认领的路径」挂鉴权，我们注册的自定义路由
 * 会直接进 handler（§5.11.3 实测）。没有这东西，本机任何页面都能驱动她的对话。
 *
 * 它挡的是什么、不挡什么（§5.11.4 第 1 条）：
 *   - 挡：浏览器跨站请求、别的程序误连到端口
 *   - 不挡：同机同用户的恶意进程——token 文件对它可读，这是本地应用的固有边界
 */

import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 32 字节随机数 → 64 位十六进制。长度足够，且只含安全字符。 */
export function createToken(): string {
  return randomBytes(32).toString('hex')
}

/** 合法的 token 形态：64 位小写十六进制。 */
const TOKEN_PATTERN = /^[0-9a-f]{64}$/

/** 进程内缓存，避免每次请求都读盘。 */
let cached: string | null = null

/**
 * 取本次进程使用的令牌。
 *
 * 落盘只在配置了 `NTDPET_HOME` 时发生（写 `…/user/api-token`，权限 0600）。
 * 没配置就纯内存生成——定时任务不允许写项目目录外的文件，默认路径因此不落地；
 * 重启后令牌会变，但页面每次都由 `tapIndex` 拿到新值，不影响使用。
 *
 * @param env 环境变量，传入是为了测试，正常调用不用管。
 */
export function resolveToken(env: Record<string, string | undefined> = process.env): string {
  if (cached) return cached

  const home = env['NTDPET_HOME']
  if (!home) {
    cached = createToken()
    return cached
  }

  const dir = join(home, 'user')
  const file = join(dir, 'api-token')
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const existing = readFileSync(file, 'utf8').trim()
    if (TOKEN_PATTERN.test(existing)) {
      cached = existing
      return existing
    }
  } catch {
    // 文件不存在或读不了：下面重新生成，属于首次启动的正常路径
  }

  const created = createToken()
  try {
    writeFileSync(file, created, { mode: 0o600 })
    // writeFileSync 的 mode 只在新建时生效；已有文件权限可能更宽，这里强制收紧
    chmodSync(file, 0o600)
  } catch (err) {
    // 落盘失败不阻塞启动：本次用内存令牌，页面照样能连上
    process.emitWarning('接口令牌落盘失败，改用内存令牌：' + (err as Error).message, 'NtDpetUi')
  }
  cached = created
  return created
}

/** 清掉进程内缓存。仅供测试使用。 */
export function resetTokenCache(): void {
  cached = null
}
