/**
 * 应用入口
 *
 * 负责：主题初始化、三块区域首次渲染、视图与会话切换、输入交互。
 * 所有业务数据来自 data.js；接后端时把 data.js 换成请求即可。
 */

import { initTheme, setThemeMode } from './theme.js';
import { conversations, persona } from './data.js';
import { renderThread, appendMessage, simulateReply } from './chat.js';
import { renderPanel } from './panel.js';
import { renderLogs, setLogMode } from './log.js';

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

const DEV_MODE_KEY = 'nt-dpet.devMode';

let devMode = (() => {
  try {
    return localStorage.getItem(DEV_MODE_KEY) === '1';
  } catch {
    return false;
  }
})();

function setDevMode(next) {
  devMode = next;
  try {
    localStorage.setItem(DEV_MODE_KEY, next ? '1' : '0');
  } catch {
    /* 存储不可用时仅内存生效 */
  }
}

/* ── 日志层级切换 ── */

function applyLogMode(mode) {
  setLogMode(mode);

  logModeEl.dataset.active = mode;
  logModeEl.querySelectorAll('[data-logmode]').forEach((btn) => {
    const active = btn.dataset.logmode === mode;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  });

  logHint.textContent = mode === 'raw'
    ? '原始报文 · 含对话原文'
    : '中文映射 · 错误码保留原文';
}

/* ── 轻提示 ── */

let toastEl = null;
let toastTimer = null;

function toast(text) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = text;
  // 强制重排，确保连续调用时动画能重放
  void toastEl.offsetWidth;
  toastEl.classList.add('is-show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-show'), 1800);
}

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

  segmented.dataset.active = view;
  segmented.querySelectorAll('[data-view]').forEach((btn) => {
    const active = btn.dataset.view === view;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  });

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

      if (next === 'raw' && !devMode) {
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
      setDevMode(true);
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

    const hints = {
      search: '搜索会话尚未接入',
      settings: '设置页尚未接入',
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
  initTheme();

  // 允许用 ?theme=dark 覆盖主题：验收与外部跳转需要，也会持久化
  const themeParam = new URLSearchParams(location.search).get('theme');
  if (themeParam === 'dark' || themeParam === 'light') setThemeMode(themeParam);

  renderPanel();
  renderThread(currentConv);

  // 视图由 class 控制，移除 HTML 上的 hidden 以免两套机制打架
  viewWork.hidden = false;
  viewWork.classList.remove('is-active');

  bindEvents();
  updateSendState();
  autoGrow();

  // 支持用 #work 直接打开工作模式（外部跳转与验收都需要）
  if (location.hash === '#work') switchView('work');
  window.addEventListener('hashchange', () => {
    switchView(location.hash === '#work' ? 'work' : 'chat');
  });
}

boot();
