// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 应用入口
 *
 * 负责：主题初始化、三块区域首次渲染、视图与会话切换、输入交互。
 * 所有业务数据来自 data.js；接后端时把 data.js 换成请求即可。
 */

import { initTheme, setThemeMode } from './theme.js';
import { conversations, persona } from './data.js';
import { renderThread, appendMessage, simulateReply } from './chat.js';
import { renderPanel, refreshIdentity } from './panel.js';
import { startMoodSync } from './mood.js';
import { startMemorySync } from './memory.js';
import { renderLogs, setLogMode } from './log.js';
import { getPref, setPref } from './prefs.js';
import { setSegmented } from './segmented.js';
import { showToast } from './toast.js';
import { openSettings, bindSettings } from './settings.js';

/* ── 元素引用 ── */

const viewChat = document.getElementById('viewChat');
const viewWork = document.getElementById('viewWork');
const segmented = document.getElementById('viewSwitch');
const threadTitle = document.getElementById('topTitle');
const threadSub = document.getElementById('topSub');
const input = document.getElementById('composerInput');
const sendBtn = document.getElementById('sendBtn');

const logModeEl = document.getElementById('logMode');
const logHint = document.getElementById('logHint');
const devNotice = document.getElementById('devNotice');

let currentConv = conversations[0];
let currentView = 'chat';

/* ── 开发者模式 ── */

/**
 * 开发者模式的真源在 prefs。这里不再自己存一份副本，
 * 否则设置面板改了开关、主界面还拿着旧值，日志会切不过去。
 */
function isDevMode() {
  return getPref('devMode') === true;
}

/* ── 日志层级切换 ── */

function applyLogMode(mode) {
  setLogMode(mode);

  // 选中态与滑块位移统一由 segmented.js 处理，
  // 原先这里手写了一份，导致日志层的滑块从来没动过
  setSegmented(logModeEl, 'data-logmode', mode);

  logHint.textContent = mode === 'raw'
    ? '原始报文 · 含对话原文'
    : '中文映射 · 错误码保留原文';
}

/* ── 轻提示 ── */

// 实现在 toast.js，与设置面板共用同一个节点。
// 各写一份的后果是两个提示条会叠着出现。
const toast = showToast;

/* ── 会话切换 ── */

function openConversation(conv, button) {
  currentConv = conv;

  document.querySelectorAll('.conv').forEach((el) => {
    el.classList.toggle('is-active', el === button);
  });

  threadTitle.textContent = conv.name;
  threadSub.textContent = conv.kind === 'group'
    ? `群聊 · ${conv.channel}`
    : `私聊 · ${conv.channel}`;

  renderThread(conv);
}

/* ── 视图切换（对话 / 工作） ── */

function switchView(view) {
  currentView = view;

  // 选中态与滑块位置由 segmented.js 统一处理，不再依赖写死的 data-active 规则
  setSegmented(segmented, 'data-view', view);

  const isChat = view === 'chat';
  viewChat.classList.toggle('is-active', isChat);
  viewWork.classList.toggle('is-active', !isChat);

  if (!isChat) {
    // 首次进入工作模式时才渲染，符合按需加载
    if (!viewWork.dataset.rendered) {
      renderLogs();
      viewWork.dataset.rendered = '1';
    }
    // 切到工作模式时，标题区改显示为日志视角
    threadTitle.textContent = '运行日志';
    threadSub.textContent = `${persona.name} · 当前会话的全部事件`;
  } else {
    threadTitle.textContent = currentConv.name;
    threadSub.textContent = currentConv.kind === 'group'
      ? `群聊 · ${currentConv.channel}`
      : `私聊 · ${currentConv.channel}`;
  }
}

/* ── 输入区 ── */

const MAX_INPUT_HEIGHT = 132;

function autoGrow() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, MAX_INPUT_HEIGHT)}px`;
}

function updateSendState() {
  sendBtn.disabled = input.value.trim().length === 0;
}

function send() {
  const text = input.value.trim();
  if (!text) return;

  appendMessage(currentConv, { from: 'me', type: 'text', text });

  input.value = '';
  autoGrow();
  updateSendState();
  input.focus();

  simulateReply(currentConv);
}

/* ── 事件绑定 ── */

function bindEvents() {
  // 会话
  document.querySelectorAll('.conv').forEach((btn) => {
    btn.addEventListener('click', () => {
      const conv = conversations.find((c) => c.id === btn.dataset.conv);
      if (conv) openConversation(conv, btn);
      if (currentView !== 'chat') switchView('chat');
    });
  });

  // 视图切换
  segmented.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // 输入
  input.addEventListener('input', () => {
    autoGrow();
    updateSendState();
  });

  input.addEventListener('keydown', (event) => {
    // Enter 发送，Shift + Enter 换行
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      send();
    }
  });

  sendBtn.addEventListener('click', send);

  // 日志层级：代码级需要开发者模式
  logModeEl.querySelectorAll('[data-logmode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.logmode;

      if (next === 'raw' && !isDevMode()) {
        devNotice.hidden = false;
        return;
      }

      devNotice.hidden = true;
      applyLogMode(next);
    });
  });

  // 尚未接后端的功能，统一给出明确反馈，而不是静默无响应
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;

    // 窄屏下侧栏收起，视图切换由顶栏按钮承担
    if (action === 'toggle-view') {
      switchView(currentView === 'chat' ? 'work' : 'chat');
      history.replaceState(null, '', currentView === 'work' ? '#work' : '#chat');
      return;
    }

    // 开发者模式：开启即建还原点并开始审计
    if (action === 'dev-enable') {
      setPref('devMode', true);
      devNotice.hidden = true;
      applyLogMode('raw');
      toast('已创建还原点 · 构建脚本审计已开启');
      return;
    }

    if (action === 'dev-cancel') {
      devNotice.hidden = true;
      applyLogMode('zh');
      return;
    }

    // 设置面板
    if (action === 'settings') {
      openSettings();
      return;
    }

    const hints = {
      search: '搜索会话尚未接入',
      more: '更多操作尚未接入',
      sticker: '表情包尚未接入',
      voice: '语音发送尚未接入',
      memory: '记忆管理尚未接入',
      pet: '桌宠尚未接入，需安装桌面外壳后可用',
    };

    toast(hints[action] ?? '该功能尚未接入');
  });
}

/* ── 启动 ── */

function boot() {
  try {
    start();
    /**
     * 启动完成标志
     *
     * 给自动化测试与外部跳转用：绑完事件、渲染完首屏之后才置位。
     * 仅凭 DOM 里有没有某个元素判断不可靠——元素可能已经存在但事件还没绑，
     * 这时点下去什么都不会发生。
     */
    window.__ntdpetReady = true;
  } catch (err) {
    /*
     * 启动失败不能只留一行控制台报错。
     * 不置位就绪标志，并把原因挂到 window 上：
     * 界面看着是空的，但排查时能立刻知道卡在哪一步，而不是面对一片白屏。
     */
    window.__ntdpetBootError = err && err.stack ? err.stack : String(err);
    console.error('[NT-Dpet] 启动失败', err);
  }
}

function start() {
  initTheme();

  // 允许用 ?theme=dark 覆盖主题：验收与外部跳转需要，也会持久化
  const themeParam = new URLSearchParams(location.search).get('theme');
  if (themeParam === 'dark' || themeParam === 'light') setThemeMode(themeParam);

  renderPanel();
  renderThread(currentConv);
  // 首屏先用 data.js 画出来，真实情绪到了再覆盖：不等请求，避免白屏
  startMoodSync();
  // 记忆没有演示数据可先画，只能等接口：拉不到就显示「记忆暂不可用」
  startMemorySync();

  // 视图由 class 控制，移除 HTML 上的 hidden 以免两套机制打架
  viewWork.hidden = false;
  viewWork.classList.remove('is-active');

  bindEvents();
  bindSettings();
  updateSendState();
  autoGrow();

  // 初始化两处分段控件的格数与滑块位置。
  // 不做这一步的话，滑块会停在 CSS 默认的第 0 格，与文字高亮的选中项对不上。
  setSegmented(segmented, 'data-view', currentView);
  setSegmented(logModeEl, 'data-logmode', 'zh');

  /**
   * 设置面板改动后的联动
   *
   * 之所以用事件而不是让设置面板直接调主界面的函数：
   * 设置面板不该知道主界面有哪些变量（currentView 之类），
   * 反过来主界面也不该知道设置面板长什么样。两边只通过偏好变更通信。
   */
  document.addEventListener('nt-prefs-change', (event) => {
    const { key, value } = event.detail;

    // 称呼类：左栏名字、右栏标题、输入框占位符
    if (key === 'personaName' || key === 'relation' || key === 'personaCall') {
      refreshIdentity();
      return;
    }

    // 开发者模式被关掉：代码级日志不能再看了，退回中文层
    if (key === 'devMode' && value === false) {
      devNotice.hidden = true;
      if (currentView === 'work') applyLogMode('zh');
    }
  });

  // 支持用 #work 直接打开工作模式（外部跳转与验收都需要）
  if (location.hash === '#work') switchView('work');
  window.addEventListener('hashchange', () => {
    switchView(location.hash === '#work' ? 'work' : 'chat');
  });

  /**
   * 深链接：?pane=her 直接打开设置里的某一页
   * 验收截图、文档里的跳转链接都用得上。参数不合法时忽略，不报错。
   */
  const pane = new URLSearchParams(location.search).get('pane');
  const PANES = ['model', 'her', 'look', 'channel', 'privacy', 'dev', 'about'];
  if (pane && PANES.includes(pane)) openSettings(pane);
}

boot();
