/**
 * NT-Dpet Electron 主进程
 *
 * 职责三件：
 *   1. 首次运行：跑安装器（环境探测 → 下载 → 校验 → 装配 profile）
 *   2. 日常运行：拉起 DSH 子进程，等就绪，打开窗口
 *   3. 桌宠：独立透明窗口，首次询问是否启动
 *
 * 状态：骨架，尚未实现
 * 设计依据：docs/ARCHITECTURE.md §3（进程拓扑）、§15（安装器）
 * 决策依据：docs/DECISIONS.md 决策 7-12、44
 */

import { app, BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * DSH 只监听回环地址，绝不用 0.0.0.0。
 * 依据：2025-09 发生过 NapCat WebUI 默认监听 0.0.0.0 被扫描后操纵 API 的事件，
 * 导致账号与群永久封禁。这是本项目不可妥协的一条。
 */
const HOST = '127.0.0.1'

/** 端口从高位随机取，避开常用服务端口。 */
const PORT_MIN = 38080
const PORT_MAX = 38099

/** DSH profile 名。一个 NT-Dpet 实例对应一个 profile。 */
const PROFILE = 'nt-dpet'

let dshProcess: ChildProcess | null = null
let mainWindow: BrowserWindow | null = null
let petWindow: BrowserWindow | null = null

/** 安装是否已完成。判断依据是 profile 目录是否存在。 */
function isInstalled(): boolean {
  const dshHome = process.env['DSH_HOME'] ?? join(homedir(), '.dsh')
  return existsSync(join(dshHome, 'profiles', PROFILE))
}

/** 在指定范围内找一个可用端口。 */
async function pickPort(): Promise<number> {
  // TODO: 用 net.createServer 试监听，拿到空闲端口后关闭
  throw new Error('未实现：pickPort')
}

/**
 * 拉起 DSH 子进程。
 *
 * 关键约束：
 *   - 必须注入 DSH_TELEMETRY_DISABLED=1（第二道隐私防线）
 *   - 必须校验 bundled 配置里 session-log-deepseek 为 false（第一道防线在配置层）
 *   - 退出时不留孤儿进程
 */
async function startDsh(port: number): Promise<string> {
  // TODO: 解析本地 node 与 dsh 可执行文件路径（runtime/ 下的便携版）
  // TODO: spawn('node', [dshBin, '--profile', PROFILE, 'web', '--port', String(port)])
  // TODO: 轮询 http://127.0.0.1:<port> 直到就绪，超时则报错
  // TODO: 把子进程挂在 dshProcess 上，app.on('before-quit') 里 kill
  throw new Error('未实现：startDsh')
}

/** 主窗口：加载 DSH 的 Web UI。 */
async function createMainWindow(url: string): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 860,
    minHeight: 600,
    title: 'NT-Dpet',
    // 视觉遵循 Apple HIG：隐藏默认菜单栏，让页面自己控制标题区
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  await mainWindow.loadURL(url)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/**
 * 桌宠窗口：透明、无边框、置顶、不占任务栏。
 * 首次运行时询问是否启动（决策 44），选择结果持久化到配置。
 */
async function createPetWindow(): Promise<void> {
  const shouldStart = await askPetPreference()
  if (!shouldStart) return

  petWindow = new BrowserWindow({
    width: 260,
    height: 320,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // TODO: 加载桌宠渲染页，订阅 emotion 服务的状态变化驱动动画
  petWindow.on('closed', () => {
    petWindow = null
  })
}

/** 首次运行询问是否要桌宠。已询问过则读配置。 */
async function askPetPreference(): Promise<boolean> {
  // TODO: 读 config；未设置则弹一次对话框并持久化
  return false
}

/**
 * 安装流程入口。
 * 九步流水线见 docs/ARCHITECTURE.md §15.1。
 */
async function runInstaller(): Promise<void> {
  // TODO: ① 环境探测（系统/架构/磁盘/已有 Node/网络可达性）
  // TODO: ② 组件下载（镜像自动检测，失败切备选，全失败提示手动覆盖）
  // TODO: ③ 完整性校验（SHA-256 分段，支持续传）
  // TODO: ④ 装配 profile（写 cordis.patch.yml + dsh.profile.bundles）
  // TODO: ⑤ 装组合包
  // TODO: ⑥ 隐私加固（校验 session-log-deepseek 为 false）
  // TODO: ⑦ 视图设定（默认对话）
  // TODO: ⑧ 首启引导（导入角色 → 预设人格 → 创建人格 → 其他配置）
  // TODO: ⑨ 拉起主进程
  throw new Error('未实现：runInstaller')
}

async function main(): Promise<void> {
  await app.whenReady()

  if (!isInstalled()) {
    await runInstaller()
  }

  const port = await pickPort()
  const url = await startDsh(port)

  await createMainWindow(url)
  await createPetWindow()
}

/** 退出时确保 DSH 子进程被清理，不留孤儿。 */
function shutdown(): void {
  if (dshProcess && !dshProcess.killed) {
    dshProcess.kill('SIGTERM')
    dshProcess = null
  }
}

app.on('before-quit', shutdown)
app.on('window-all-closed', () => {
  shutdown()
  app.quit()
})

main().catch((err: unknown) => {
  // TODO: 换成中文错误页 + 一键导出诊断信息，不要只打控制台
  console.error('[NT-Dpet] 启动失败：', err)
  app.quit()
})
