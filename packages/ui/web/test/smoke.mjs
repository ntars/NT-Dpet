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

/**
 * 接口桩：在页面里替换 `window.fetch`，只接管 `/api/ntdpet` 下的请求。
 *
 * 为什么必须桩在网络层、而不是替换 js/api.js 里的函数：
 * 要验的正是「真实请求路径」——地址拼得对不对、令牌有没有进请求头、
 * 503 会不会走到降级分支。把这层换掉，测的就只是自己写的假函数。
 *
 * 为什么由 CDP 在新文档执行、而不是启动后再注入：
 * mood 与 memory 在 boot 阶段就发请求，晚一步注入，首个请求已经打到真实网络，
 * 断言会看到「先失败再成功」的中间态。
 *
 * 场景由地址里的 `?stub=` 决定，每个场景一次导航：
 *   ok         情绪 0.9 / 精力 0.1，记忆两条，对话一次性吐完
 *   fail       三者全部 503，验降级
 *   empty      记忆为空数组，验「暂无记忆」与「记忆暂不可用」的区分
 *   slow       对话分 250ms 一块推送，验打字指示与生成期间禁用
 *   chat-error 流里回 error 事件，验失败文案与原文回填
 *   chat-abort 流里回 stopReason=aborted，验「已中断」
 *
 * 这个函数会被 toString() 后整段注入页面，**不能引用外部变量**。
 */
function installApiStub() {
  const mode = new URLSearchParams(location.search).get('stub');
  if (!mode) return;

  const realFetch = window.fetch.bind(window);
  const log = [];
  window.__stubLog = log;

  const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
  const encoder = new TextEncoder();

  const jsonResponse = (status, payload) => new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

  const notReady = () => jsonResponse(503, {
    ok: false,
    error: { code: 'NOT_READY', message: '该功能尚未接入' },
  });

  const dataLine = (payload) => ({ raw: `data: ${JSON.stringify(payload)}\n\n` });
  const doneLine = (stopReason) => dataLine({ type: 'done', stopReason });

  /** 按步骤推送的 SSE 响应；wait 是「推这一块之前先等多久」。 */
  const sseResponse = (steps) => new Response(new ReadableStream({
    async start(controller) {
      for (const step of steps) {
        if (step.wait) await sleep(step.wait);
        if (step.raw) controller.enqueue(encoder.encode(step.raw));
      }
      controller.close();
    },
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } });

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!url.includes('/api/ntdpet')) return realFetch(input, init);

    const headers = (init && init.headers) || {};
    log.push({
      path: url.slice(url.indexOf('/api/ntdpet')),
      method: (init && init.method) || 'GET',
      token: headers['X-NTDPet-Token'] || '',
    });

    const path = url.split('/api/ntdpet')[1].split('?')[0];

    if (path === '/mood') {
      if (mode === 'fail') return notReady();
      return jsonResponse(200, { ok: true, data: { mood: 0.9, energy: 0.1 } });
    }

    if (path === '/memory/recent') {
      if (mode === 'fail') return notReady();
      if (mode === 'empty') return jsonResponse(200, { ok: true, data: { items: [], limit: 8 } });
      return jsonResponse(200, {
        ok: true,
        data: {
          limit: 8,
          items: [
            // 330000ms = 5.5 分钟，取整后仍是「5 分钟前」，不受断言时刻的毫秒差影响
            { text: '主人不吃香菜', at: Date.now() - 330000 },
            { text: '周一上午要去体检', at: Date.now() - 7200000 },
          ],
        },
      });
    }

    if (path === '/chat') {
      if (mode === 'fail') return notReady();
      if (mode === 'chat-error') {
        return sseResponse([
          dataLine({ type: 'delta', text: '主人' }),
          dataLine({ type: 'error', message: '模型出错了' }),
        ]);
      }
      if (mode === 'chat-abort') {
        return sseResponse([
          dataLine({ type: 'delta', text: '主人' }),
          doneLine('aborted'),
        ]);
      }
      if (mode === 'slow') {
        return sseResponse([
          { wait: 450 },
          dataLine({ type: 'delta', text: '主人' }),
          { wait: 300 },
          dataLine({ type: 'delta', text: '，我在' }),
          { wait: 300 },
          dataLine({ type: 'delta', text: '呢～' }),
          doneLine('end'),
        ]);
      }
      return sseResponse([
        dataLine({ type: 'delta', text: '主人，我在呢～' }),
        doneLine('end'),
      ]);
    }

    return jsonResponse(404, { ok: false, error: { code: 'NOT_FOUND', message: '无此接口' } });
  };
}

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

  /**
   * 桩脚本必须在任何页面脚本之前就位，所以走 Page 域的
   * 「新文档即执行」，而不是启动后再 evaluate 一段——那时 boot 已经跑完了。
   * 不带 ?stub= 的页面里桩函数会直接 return，不影响原有那批检查。
   */
  await send('Page.enable', {});
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(${installApiStub.toString()})();`,
  });

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

  /**
   * 轮询等一个表达式为真。
   *
   * 不用固定 sleep：机器忙的时候 200ms 可能连首帧都没画完，
   * 断言会拿到「还没渲染」的中间态，冒出一堆假失败。
   */
  async function waitFor(expression, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (await evaluate(expression)) return;
      } catch {
        /* 导航中取不到，继续等 */
      }
      await new Promise((r) => setTimeout(r, 60));
    }
    throw new Error(`等待超时：${expression}`);
  }

  /**
   * 换一个桩场景重新加载页面。
   *
   * 先等地址里出现本次的 stub 值，再等就绪标志：只等就绪会踩到旧文档的
   * `__ntdpetReady`（导航还没提交时它仍然是 true），于是拿旧页面做断言。
   */
  async function openWith(stub) {
    const url = new URL(URL_TARGET);
    url.searchParams.set('stub', stub);
    // 令牌只走请求头：这里给一个假令牌，用来验证它确实被带上
    url.searchParams.set('token', 'smoke-token');

    await send('Page.navigate', { url: url.toString() });
    await waitFor(`location.search.includes('stub=${stub}')`);
    await waitReady();
  }

  /** 往输入框写字并触发 input 事件，让发送按钮重算可用状态。 */
  async function type(value) {
    await evaluate(`(() => {
      const el = document.getElementById('composerInput');
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await tick();
  }

  /** 点发送，并等第一块正文或状态小字出现。 */
  async function sendNow() {
    await evaluate('document.getElementById("sendBtn").click()');
  }

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

  /* ── 10. 接口桩：真实读数覆盖演示值 ── */
  await openWith('ok');
  await waitFor('document.querySelectorAll("#memoryList .memory-item").length === 2');

  check(
    '情绪采用接口读数',
    await evaluate('document.getElementById("moodLine").textContent'),
    '心情雀跃，精力几乎耗尽',
  );
  check(
    '有真实读数时不挂演示标识',
    await evaluate('document.getElementById("demoBadge").hidden'),
    true,
  );
  check(
    '记忆条目数与接口一致',
    await evaluate('document.querySelectorAll("#memoryList .memory-item").length'),
    2,
  );
  check(
    '记忆时间显示为相对时间',
    await evaluate('document.querySelector("#memoryList .memory-item__time").textContent'),
    '5 分钟前',
  );
  check(
    '令牌随请求头发出',
    await evaluate('window.__stubLog.length === 2 && window.__stubLog.every((r) => r.token === "smoke-token")'),
    true,
  );
  check(
    '请求打在接口前缀下',
    await evaluate('window.__stubLog.map((r) => r.path.split("?")[0]).sort().join(",")'),
    '/api/ntdpet/memory/recent,/api/ntdpet/mood',
  );

  /* ── 11. 降级路径：后端整体不可用 ── */
  await openWith('fail');
  await waitFor('document.getElementById("demoBadge").hidden === false');

  check(
    '后端不可用时出现演示标识',
    await evaluate('document.getElementById("demoBadge").hidden'),
    false,
  );
  check(
    '情绪退回演示数值',
    await evaluate('document.getElementById("moodPill").textContent'),
    '缓和',
  );
  await waitFor('document.querySelector("#memoryList .memory-empty") !== null');
  check(
    '记忆不可用与无记忆分开措辞',
    await evaluate('document.querySelector("#memoryList .memory-empty").textContent'),
    '记忆暂不可用',
  );

  /* ── 12. 空记忆不等于故障 ── */
  await openWith('empty');
  await waitFor('document.querySelector("#memoryList .memory-empty") !== null');

  check(
    '无记忆时文案为暂无记忆',
    await evaluate('document.querySelector("#memoryList .memory-empty").textContent'),
    '暂无记忆',
  );
  check(
    '记忆为空不挂演示标识',
    await evaluate('document.getElementById("demoBadge").hidden'),
    true,
  );

  /* ── 13. 发送态：逐块渲染与生成期间禁用 ── */
  await openWith('slow');

  await type('在吗');
  check('有内容且空闲时可发送', await evaluate('document.getElementById("sendBtn").disabled'), false);

  await sendNow();
  await waitFor('document.querySelector(".typing") !== null', 2000);
  check('生成期间显示打字指示', await evaluate('document.querySelectorAll(".typing").length'), 1);
  check(
    '发送后用户气泡立刻出现',
    await evaluate('[...document.querySelectorAll(".msg--me .msg__bubble")].some((b) => b.textContent === "在吗")'),
    true,
  );

  /*
   * 只把输入框填满再断言禁用，才能证明「禁用」是 busy 造成的。
   * 输入框空着时按钮本来就禁用（未输入不可发），那条断言恒真，测了等于没测。
   */
  await type('第二句');
  check(
    '生成期间即使有输入也不可发送',
    await evaluate('document.getElementById("sendBtn").disabled'),
    true,
  );

  await waitFor('document.querySelector(".msg__text")?.textContent === "主人，我在呢～"');
  check(
    '回复拼接完整未丢块',
    await evaluate('document.querySelector(".msg__text").textContent'),
    '主人，我在呢～',
  );
  check('结束后不留打字指示', await evaluate('document.querySelectorAll(".typing").length'), 0);
  check(
    '结束后按钮随内容恢复可用',
    await evaluate('document.getElementById("sendBtn").disabled'),
    false,
  );

  /* ── 14. 流内错误：文案 + 原文回填 ── */
  await openWith('chat-error');

  await type('再试一次');
  await sendNow();
  await waitFor('document.querySelector(".msg__note:not([hidden])") !== null', 4000);

  check(
    '流内错误显示可重试文案',
    await evaluate('document.querySelector(".msg__note:not([hidden])").textContent'),
    '发送失败，可重试',
  );
  check(
    '失败后原文回到输入框',
    await evaluate('document.getElementById("composerInput").value'),
    '再试一次',
  );
  check(
    '失败后按钮可再次发送',
    await evaluate('document.getElementById("sendBtn").disabled'),
    false,
  );

  /* ── 15. 主动中断：不报失败 ── */
  await openWith('chat-abort');

  await type('打断看看');
  await sendNow();
  await waitFor('document.querySelector(".msg__note:not([hidden])") !== null', 4000);

  check(
    '中断时显示已中断',
    await evaluate('document.querySelector(".msg__note:not([hidden])").textContent'),
    '已中断',
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
