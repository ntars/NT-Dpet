// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 启动自检结果的呈现
 *
 * 只做一件事：把 `/status` 的结论摆到界面顶部，**全部通过时什么都不出现**。
 *
 * 为什么不常驻一条「一切正常」：正常是本分，不是消息。常驻一条绿色提示的后果
 * 是它天天在那儿，等到某天变红也没人多看一眼——这种横幅等于没有。
 *
 * 为什么分成两档：隐私开关没关是产品底线被破（fatal），关键包缺席只是能力
 * 降级（warn）。两档用完全不同的措辞与颜色，因为主人该做的事完全不同：
 * 前者要立刻去关开关，后者可以先照常用、回头再修。
 */

import { request } from './api.js';

/**
 * 重试阶梯（毫秒）。
 *
 * 自检要等配置树 settle 之后才跑，页面加载完的那一瞬间它多半还没结果，
 * 所以 503 是**正常路径**，不是故障。阶梯覆盖约 35 秒：再久还没结果，
 * 说明自检插件压根没装上，继续等只是白刷请求。
 */
const RETRY_MS = [1500, 4000, 9000, 20000];

/** 两档的标题文案。fatal 这一档按 ROADMAP M0.3.2 的要求写成「已拒绝启动」。 */
const TITLES = {
  fatal: '已拒绝启动',
  warn: '部分能力降级',
};

const TEXTS = {
  fatal: '隐私开关没有硬关，她会在后台把对话原文与插件清单传出去。这是产品底线，按设计此时应拒绝启动。',
  warn: '以下自检项未通过，相关能力可能不可用。',
};

/**
 * fatal 时的补充说明。
 *
 * 必须有这一行：横幅写着「已拒绝启动」，但输入框此刻仍能用，这两件事摆在一起
 * 会让人以为界面坏了。与其让它看起来像 bug，不如直接说清这是本轮的边界——
 * 真正锁死输入框要等后续任务，现在只保证「问题被看见」，不假装「问题已拦住」。
 */
const FATAL_FOOT = '本轮只做呈现、尚未锁定输入；请先到「设置 → 隐私」处理，再重启应用。';

let root = null;
let titleEl = null;
let textEl = null;
let listEl = null;
let footEl = null;

/** 是否已经拿到过结论。拿到即停，不再重试。 */
let settled = false;
/** 已用掉的重试次数，对应 RETRY_MS 的下标。 */
let attempt = 0;
let timer = null;

/* ── 元素 ── */

/**
 * 取元素引用。
 *
 * 每次渲染前现取而不在模块加载时缓存：这个模块由 app.js 在 boot 里调用，
 * 缓存一次也能用，但如果将来页面结构改成按需插入，早缓存的引用就永远是 null，
 * 表现成「横幅怎么都不出现」且没有任何报错。现取一次的开销可以忽略。
 */
function refs() {
  if (root) return true;
  root = document.getElementById('selfCheck');
  if (!root) return false;
  titleEl = document.getElementById('selfCheckTitle');
  textEl = document.getElementById('selfCheckText');
  listEl = document.getElementById('selfCheckList');
  footEl = document.getElementById('selfCheckFoot');
  return true;
}

/* ── 渲染 ── */

/** 一条失败项。用 textContent 构造，不拼 HTML：这些文字来自宿主，可能含尖括号。 */
function itemNode(item) {
  const li = document.createElement('li');
  li.className = 'selfcheck__item';

  const id = document.createElement('code');
  id.className = 'selfcheck__id';
  id.textContent = typeof item.id === 'string' && item.id !== '' ? item.id : '未知项';

  const why = document.createElement('span');
  why.className = 'selfcheck__why';
  why.textContent = typeof item.detail === 'string' && item.detail !== ''
    ? item.detail
    : '没有给出原因';

  li.append(id, why);
  return li;
}

/** 收起横幅，并清掉上一次的内容。 */
function hide() {
  if (!refs()) return;
  root.hidden = true;
  root.classList.remove('selfcheck--fatal');
  listEl.replaceChildren();
}

/**
 * 摆出结论。
 *
 * `checks` 里 `ok !== true` 的一律当失败处理：拿到的若不是布尔值，说明这条
 * 记录本身有问题，宁可多报一条也不要漏报——漏报的是一条真的异常。
 */
function render(data) {
  if (!refs()) return;

  const checks = data && Array.isArray(data.checks) ? data.checks : [];
  const failed = checks.filter((item) => item && item.ok !== true);
  if (failed.length === 0) {
    hide();
    return;
  }

  const fatal = failed.some((item) => item.severity === 'fatal');
  const tier = fatal ? 'fatal' : 'warn';

  root.classList.toggle('selfcheck--fatal', fatal);
  titleEl.textContent = TITLES[tier];
  textEl.textContent = TEXTS[tier];

  listEl.replaceChildren(...failed.map(itemNode));

  footEl.textContent = fatal ? FATAL_FOOT : '';
  footEl.hidden = !fatal;

  root.hidden = false;
}

/* ── 拉取 ── */

/** 排下一次重试。次数用尽就安静停下——没有结论时不该编一个出来。 */
function schedule() {
  if (settled || attempt >= RETRY_MS.length) return;
  const wait = RETRY_MS[attempt];
  attempt += 1;
  timer = setTimeout(() => {
    timer = null;
    void pull();
  }, wait);
}

async function pull() {
  try {
    const data = await request('/status');
    settled = true;
    render(data);
  } catch (err) {
    const code = err && err.code ? err.code : 'UNKNOWN';

    /*
     * 只有「还没就绪」值得再等。
     * 401 是令牌不对、连不上是宿主没在跑、500 是真出错——这三种重试多少次
     * 结果都一样，反复刷只会把控制台填满，反而盖住真正有用的那条错误。
     */
    if (code === 'NOT_READY' && !settled) {
      schedule();
      return;
    }
    settled = true;
  }
}

/**
 * 开始检查。
 *
 * 与 mood / memory 不同，这里**不做定时轮询**：自检的结论在一次运行里不会变，
 * 问出结果就够。每隔半分钟再问一遍，除了增加噪音没有任何意义。
 */
export function startStatusSync() {
  if (timer !== null) return;
  void pull();
}
