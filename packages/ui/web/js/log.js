// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 工作模式日志渲染
 *
 * 两层日志，用途不同（决策 66 及后续补充）：
 *
 *   zh   中文概览层 —— 普通用户可见。事件类型、工具名、参数全部映射成中文，
 *                     只说「发生了什么」。错误码与堆栈保留原文。
 *   raw  代码级层  —— 仅开发者模式可见。保留原始字段、原始 JSON、
 *                     SQL 语句、HTTP 报文、错误码与完整堆栈。
 *
 * 为什么分两层：普通用户看不懂 `RETRY_AFTER_RATE_LIMIT`，开发者查问题时
 * 又必须看到原文。合成一层的结果是两边都不满意。
 *
 * 代码级日志里的错误码、堆栈、JSON 键名**一律不翻译**，翻译后无法与
 * 上游文档对照，也没法搜索。
 */

import { logs, devLogs } from './data.js';

const logViewEl = document.getElementById('logView');

/** 'zh' | 'raw' */
let mode = 'zh';

/* ── 中文概览层 ── */

function buildLine(entry) {
  const line = document.createElement('div');
  line.className = 'logline';

  const time = document.createElement('span');
  time.className = 'logline__time';
  time.textContent = entry.time;

  const tag = document.createElement('span');
  tag.className = `tag tag--${entry.kind}`;
  tag.textContent = entry.tag;

  const text = document.createElement('span');
  text.className = 'logline__text';
  text.textContent = entry.text;

  line.append(time, tag, text);
  return line;
}

/* ── 代码级层 ── */

const LEVEL_LABEL = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

function buildRawLine(entry) {
  const wrap = document.createElement('div');
  wrap.className = `rawl rawl--${entry.level}`;

  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'rawl__head';

  const time = document.createElement('span');
  time.className = 'rawl__time';
  time.textContent = entry.time;

  const level = document.createElement('span');
  level.className = `rawl__level is-${entry.level}`;
  level.textContent = LEVEL_LABEL[entry.level] ?? entry.level.toUpperCase();

  const module = document.createElement('span');
  module.className = 'rawl__module';
  module.textContent = entry.module;

  const msg = document.createElement('span');
  msg.className = 'rawl__msg';
  msg.textContent = entry.msg;

  head.append(time, level, module, msg);

  const detail = document.createElement('pre');
  detail.className = 'rawl__detail';
  detail.textContent = entry.detail ?? '';

  // 点击表头折叠 / 展开详情
  head.addEventListener('click', () => {
    const collapsed = wrap.classList.toggle('is-collapsed');
    head.setAttribute('aria-expanded', String(!collapsed));
  });
  head.setAttribute('aria-expanded', 'true');

  wrap.append(head, detail);
  return wrap;
}

/* ── 对外接口 ── */

export function renderLogs() {
  logViewEl.textContent = '';

  const frag = document.createDocumentFragment();

  if (mode === 'raw') {
    devLogs.forEach((entry) => frag.appendChild(buildRawLine(entry)));
  } else {
    logs.forEach((entry) => frag.appendChild(buildLine(entry)));
  }

  logViewEl.appendChild(frag);

  requestAnimationFrame(() => {
    logViewEl.scrollTop = logViewEl.scrollHeight;
  });
}

export function getLogMode() {
  return mode;
}

export function setLogMode(next) {
  if (next !== 'zh' && next !== 'raw') return;
  mode = next;
  renderLogs();
}

/**
 * 追加一条中文日志（后端事件流调用）
 * @param {{time:string, kind:string, tag:string, text:string}} entry
 */
export function appendLog(entry) {
  if (mode !== 'zh') return;

  const nearBottom =
    logViewEl.scrollHeight - logViewEl.scrollTop - logViewEl.clientHeight < 40;

  logViewEl.appendChild(buildLine(entry));

  if (nearBottom) {
    requestAnimationFrame(() => {
      logViewEl.scrollTop = logViewEl.scrollHeight;
    });
  }
}
