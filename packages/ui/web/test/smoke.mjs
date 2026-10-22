/**
 * 界面交互冒烟测试
 *
 * 为什么需要它：这个壳最怕的不是样式丑，是「点了没反应」。
 * 一个按钮看着能点、实际什么都不发生，比缺功能更糟——用户会以为已经生效了。
 * 所以每次改完界面都跑一遍，确认真实点击能改到状态。
 *
 * 只验证状态，不验证像素：
 *   偏好是否写入 localStorage、DOM 是否更新、面板是否开关、有没有未捕获错误。
 *
 * 静态服务与浏览器都由脚本自己拉起并回收，不依赖 python、不留残余进程。
 *
 * 运行：
 *   node packages/ui/web/test/smoke.mjs
 */

import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webm': 'video/webm',
};

/*
 * 自带静态服务，不用 python -m http.server。
 * 原先用 python 时，页面要并发拉 index.html + 4 个 CSS + 9 个 JS，
 * 偶发丢请求，表现成「DOM 完整但 app.js 没执行」的启动超时——
 * 看起来像代码 bug，实际是服务端的问题，排查成本极高。
 */
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const relative = pathname === '/' ? '/index.html' : pathname;
    const file = normalize(join(WEB_ROOT, relative));

    // 防路径穿越：只允许读 WEB_ROOT 之下的文件
    if (!file.startsWith(WEB_ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const WEB_PORT = server.address().port;
const URL_TARGET = process.argv[2] ?? `http://127.0.0.1:${WEB_PORT}/index.html?theme=light`;

/** 按常见安装位置找浏览器，找不到就让用户显式指定 */
const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

const CHROME = CANDIDATES.find((p) => existsSync(p));
if (!CHROME) {
  console.error('找不到 Chrome 或 Chromium。请设置环境变量 CHROME_PATH 指向可执行文件。');
  process.exit(2);
}

const PROFILE = join(tmpdir(), `ntdpet-smoke-${Date.now()}`);
/*
 * 端口随机。
 * 固定端口在连续跑、或上一次浏览器没退干净时会被占用，
 * 新实例起不来，表现成「页面启动超时」这种很难定位的失败。
 */
const PORT = 9400 + Math.floor(Math.random() * 400);

const browser = spawn(CHROME, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  // 无头模式不推进合成器动画，带 opacity:0 起始帧的元素会整片消失。
  // 强制减弱动效即可让起始与结束状态一致，截图与断言都稳定。
  '--force-prefers-reduced-motion',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  '--window-size=1440,900',
  // 直接把目标页作为启动参数，而不是先开 about:blank 再 Page.navigate。
  // 后者在冷启动时偶尔会导航到一个已被替换的 target，表现为启动超时。
  URL_TARGET,
], { stdio: 'ignore' });

async function waitForPort() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return;
    } catch {
      /* 还没起来，继续等 */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('浏览器调试端口未就绪');
}

function cleanup() {
  // SIGKILL 而不是默认的 SIGTERM：无头 Chrome 有时不响应 TERM，
  // 留着的进程会占住调试端口，让下一次运行莫名其妙地失败。
  try { browser.kill('SIGKILL'); } catch { /* 已经退出 */ }
  try { server.close(); } catch { /* 已经关闭 */ }
  // 浏览器退出时还在写缓存，删除可能因目录非空失败。
  // 临时目录由系统回收，这里失败不当作错误。
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

let ws;
try {
  await waitForPort();

  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const pages = list.filter((t) => t.type === 'page');
  /*
   * 优先取已经加载 http 页面的 target。
   * 浏览器启动时可能同时存在空白页与目标页，
   * 取第一个 page 有时会拿到那个还在 about:blank 的，于是永远等不到就绪标志。
   */
  const page = pages.find((t) => t.url.startsWith('http')) ?? pages[0];
  if (!page) throw new Error('找不到页面目标');

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let seq = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };

  const send = (method, params) => new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

  async function evaluate(expression) {
    const res = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    const ex = res.result?.exceptionDetails;
    if (ex) throw new Error(`${ex.text} ${ex.exception?.description ?? ''}`);
    return res.result?.result?.value;
  }

  /** 等两帧，让事件绑定与 DOM 更新落地 */
  const tick = () => evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');

  const results = [];
  const check = (name, actual, expected) => {
    results.push({ ok: JSON.stringify(actual) === JSON.stringify(expected), name, actual, expected });
  };

  /* 页面已由启动参数加载，这里只需等启动完成 */

  /**
   * 等启动完成标志，而不是固定睡一段时间。
   * 固定等待在机器忙时会不够，导致「点下去没反应」的假失败；
   * 而没有就绪标志时又只能靠猜。app.js 在 boot 末尾置位。
   * 冷启动时浏览器自己就要花几秒，给足 20 秒。
   */
  async function waitReady(timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (await evaluate('window.__ntdpetReady === true')) return;
      } catch {
        /* 页面还没加载完，继续等 */
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    const diag = await evaluate(`JSON.stringify({
      readyState: document.readyState,
      bootError: window.__ntdpetBootError ?? null,
      hasReadyFlag: window.__ntdpetReady ?? null,
      scripts: Array.from(document.scripts).map(s => s.src.split('/').pop()),
      hasSheet: !!document.getElementById('settingsSheet'),
      bodyLength: document.body ? document.body.innerHTML.length : -1
    })`).catch(() => '（取不到）');
    throw new Error(`页面启动超时，__ntdpetReady 未置位。状态：${diag}`);
  }
  await waitReady();

  /* ── 1. 打开设置 ── */
  await evaluate('document.querySelector(\'[data-action="settings"]\').click()');
  await tick();
  check('点击「设置」后面板打开', await evaluate('!document.getElementById("settingsSheet").hidden'), true);

  /* ── 2. 分类切换 ── */
  await evaluate('document.querySelector(\'.sheet__navlist [data-pane="her"]\').click()');
  await tick();
  check(
    '切到「她」分类',
    await evaluate('document.querySelector(\'.sheet__pane[data-pane="her"]\').classList.contains("is-active")'),
    true,
  );

  /* ── 3. 关系联动 ── */
  await evaluate('document.querySelector(\'[data-relation="sister"]\').click()');
  await tick();
  check('关系写入偏好', await evaluate('JSON.parse(localStorage.getItem("nt-dpet.prefs")).relation'), 'sister');
  check('右栏关系标签同步', await evaluate('document.getElementById("relationTag").textContent'), '妹妹');

  /* ── 4. 名字联动 ── */
  await evaluate(`(() => {
    const el = document.getElementById('personaName');
    el.value = '阿鲸';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await tick();
  check('左栏名字同步', await evaluate('document.getElementById("brandName").textContent'), '阿鲸');

  /* ── 5. 主题 ── */
  await evaluate('document.querySelector(\'[data-theme-mode="dark"]\').click()');
  await tick();
  check('主题切到深色', await evaluate('document.documentElement.dataset.theme'), 'dark');

  /* ── 6. 开发者模式的两条保护 ── */
  await evaluate('document.querySelector(\'.sheet__navlist [data-pane="dev"]\').click()');
  await tick();
  check('开发者模式默认关闭', await evaluate('document.getElementById("devModeSwitch").checked'), false);

  await evaluate('document.getElementById("devModeSwitch").click()');
  await tick();
  check('点开关只弹警告、不直接生效', await evaluate('!document.getElementById("devWarn").hidden'), true);
  check('此时开关仍为关', await evaluate('document.getElementById("devModeSwitch").checked'), false);

  await evaluate('document.querySelector(\'[data-action="dev-confirm"]\').click()');
  await tick();
  check('确认后偏好写入', await evaluate('JSON.parse(localStorage.getItem("nt-dpet.prefs")).devMode'), true);

  /* ── 7. 关闭面板 ── */
  await evaluate('document.querySelector(\'[data-action="settings-close"]\').click()');
  await tick();
  check('关闭设置面板', await evaluate('document.getElementById("settingsSheet").hidden'), true);

  /* ── 8. 代码级日志 ── */
  await evaluate('document.querySelector(\'[data-action="toggle-view"]\').click()');
  await tick();
  await evaluate('document.querySelector(\'[data-logmode="raw"]\').click()');
  await tick();
  check(
    '代码级日志可切换',
    await evaluate('document.querySelector(\'[data-logmode="raw"]\').classList.contains("is-active")'),
    true,
  );
  check('代码级日志确实渲染', await evaluate('document.querySelectorAll("#logView .rawl").length > 0'), true);

  /* ── 9. 分段滑块随选中移动（曾经一直停在第 0 格） ── */
  check(
    '日志分段滑块随之移动',
    await evaluate('document.getElementById("logMode").style.getPropertyValue("--seg-i")'),
    '1',
  );

  /* ── 汇总 ── */
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    const mark = r.ok ? '通过' : '失败';
    const detail = r.ok ? '' : `  实际=${JSON.stringify(r.actual)} 期望=${JSON.stringify(r.expected)}`;
    console.log(`${mark}  ${r.name}${detail}`);
  }
  console.log(`\n合计 ${results.length} 项，失败 ${failed.length} 项`);

  ws.close();
  cleanup();
  process.exit(failed.length === 0 ? 0 : 1);
} catch (err) {
  console.error('测试执行失败：', err.message);
  try { ws?.close(); } catch { /* 忽略 */ }
  cleanup();
  process.exit(2);
}
