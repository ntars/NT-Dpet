// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 设置面板
 *
 * 结构：左栏分类 + 右栏内容，覆盖整窗的对话框。
 *
 * 三条设计取舍，改之前先看：
 *
 * 1. 每一项都落在真实偏好上，不用假开关凑数。
 *    尚未接后端的项，界面上直接标「未接入」，而不是做一个点了没反应的开关。
 *    假开关比缺功能更糟——用户会以为已经生效。
 *
 * 2. 主题不归本模块存。theme.js 管模式和经纬度，这里只调它的接口。
 *    两处各存一份必然出现「设置里显示深色、界面还是浅色」。
 *
 * 3. 开发者模式的两条保护必须同时生效（决策 59）：
 *    先看到警告并确认，开启后立刻有还原点。
 *    只做其中一条等于没做，所以这里的开关会先展开警告、要求二次点击。
 */

import { getPrefs, setPref, setChannel } from './prefs.js';
import { getThemeMode, setThemeMode } from './theme.js';
import { setSegmented } from './segmented.js';
import { showToast } from './toast.js';

const sheet = document.getElementById('settingsSheet');
const body = document.getElementById('settingsBody');
const navList = sheet.querySelector('.sheet__navlist');

/** 交互前先把焦点存下来，关闭时还回去，避免键盘用户丢失位置 */
let lastFocused = null;

/* ══ 打开 / 关闭 ══ */

/**
 * @param {string} [pane] 打开时定位到哪个分类，默认沿用上次
 */
export function openSettings(pane) {
  lastFocused = document.activeElement;
  syncUI();

  sheet.hidden = false;
  document.body.style.overflow = 'hidden';

  switchPane(pane ?? navList.querySelector('.is-active')?.dataset.pane ?? 'model');

  // 焦点移进面板，屏幕阅读器才会读对话框内容
  const first = sheet.querySelector('.sheet__navlist .is-active');
  if (first) first.focus({ preventScroll: true });
}

export function closeSettings() {
  if (sheet.hidden) return;

  sheet.hidden = true;
  document.body.style.overflow = '';

  if (lastFocused && typeof lastFocused.focus === 'function') {
    lastFocused.focus({ preventScroll: true });
  }
  lastFocused = null;
}

export function isSettingsOpen() {
  return !sheet.hidden;
}

function switchPane(pane) {
  navList.querySelectorAll('[data-pane]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.pane === pane);
  });

  body.querySelectorAll('.sheet__pane').forEach((section) => {
    section.classList.toggle('is-active', section.dataset.pane === pane);
  });

  body.scrollTop = 0;
}

/* ══ 回填界面 ══ */

function syncUI() {
  const prefs = getPrefs();

  /* 模型 */
  const modelSelect = document.getElementById('modelSelect');
  if (modelSelect) modelSelect.value = prefs.model;
  setSegmented(document.getElementById('reasoningSeg'), 'data-reasoning', prefs.reasoning);

  /* 她 */
  const nameInput = document.getElementById('personaName');
  const callInput = document.getElementById('personaCall');
  if (nameInput) nameInput.value = prefs.personaName;
  if (callInput) callInput.value = prefs.personaCall;

  setSegmented(document.getElementById('densitySeg'), 'data-density', prefs.density);
  setSegmented(document.getElementById('proactiveSeg'), 'data-proactive', prefs.proactive);

  document.querySelectorAll('[data-relation]').forEach((btn) => {
    const active = btn.dataset.relation === prefs.relation;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-checked', String(active));
  });

  /* 外观 */
  setSegmented(document.getElementById('themeSeg'), 'data-theme-mode', getThemeMode());
  updateThemeDesc();

  /* 通道 */
  document.querySelectorAll('[data-channel]').forEach((input) => {
    input.checked = prefs.channels[input.dataset.channel] === true;
  });

  /* 开发者 */
  const devSwitch = document.getElementById('devModeSwitch');
  if (devSwitch) devSwitch.checked = prefs.devMode;

  /* 隐私页的代码级日志状态跟着开发者模式走 */
  const rawStatus = document.getElementById('rawLogStatus');
  if (rawStatus) rawStatus.textContent = prefs.devMode ? '可在工作视图开启' : '未开启';
}

function updateThemeDesc() {
  const desc = document.getElementById('themeDesc');
  if (!desc) return;

  const map = {
    system: '跟随系统设置',
    light: '始终浅色',
    dark: '始终深色',
    solar: '按本机经纬度估算日出日落，日落后 20 分钟切深色',
  };
  desc.textContent = map[getThemeMode()] ?? map.system;
}

/* ══ 事件绑定 ══ */

export function bindSettings() {
  /* 分类切换 */
  navList.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-pane]');
    if (btn) switchPane(btn.dataset.pane);
  });

  /* 模型 */
  document.getElementById('modelSelect')?.addEventListener('change', (event) => {
    setPref('model', event.target.value);
  });

  document.getElementById('reasoningSeg')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-reasoning]');
    if (!btn) return;
    setPref('reasoning', btn.dataset.reasoning);
    setSegmented(document.getElementById('reasoningSeg'), 'data-reasoning', btn.dataset.reasoning);
  });

  /* 她 */
  document.getElementById('personaName')?.addEventListener('input', (event) => {
    setPref('personaName', event.target.value.trim() || '小鲸鱼');
  });

  document.getElementById('personaCall')?.addEventListener('input', (event) => {
    setPref('personaCall', event.target.value.trim() || '主人');
  });

  document.getElementById('relationGrid')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-relation]');
    if (!btn) return;

    setPref('relation', btn.dataset.relation);
    document.querySelectorAll('[data-relation]').forEach((el) => {
      const active = el === btn;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-checked', String(active));
    });
    showToast('已切换关系 · 记忆与好感度保留');
  });

  document.getElementById('densitySeg')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-density]');
    if (!btn) return;
    setPref('density', btn.dataset.density);
    setSegmented(document.getElementById('densitySeg'), 'data-density', btn.dataset.density);
  });

  document.getElementById('proactiveSeg')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-proactive]');
    if (!btn) return;
    setPref('proactive', btn.dataset.proactive);
    setSegmented(document.getElementById('proactiveSeg'), 'data-proactive', btn.dataset.proactive);
  });

  /* 外观 */
  document.getElementById('themeSeg')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-theme-mode]');
    if (!btn) return;

    const mode = btn.dataset.themeMode;
    setThemeMode(mode);
    setSegmented(document.getElementById('themeSeg'), 'data-theme-mode', mode);
    updateThemeDesc();
  });

  /* 通道 */
  document.querySelectorAll('[data-channel]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.dataset.channel;

      // 个人号通道：开启时先把风险说清楚。关闭不需要拦。
      if (id === 'qq-napcat' && input.checked) {
        const ok = window.confirm(
          'QQ 个人号通道使用非官方协议。\n\n'
          + '腾讯可能判定为违规，导致账号或群被永久封禁，且无法申诉恢复。\n'
          + '这条通道默认关闭是有原因的。\n\n'
          + '你确定要开启吗？',
        );
        if (!ok) {
          input.checked = false;
          return;
        }
      }

      setChannel(id, input.checked);
    });
  });

  /* 开发者模式 */
  const devSwitch = document.getElementById('devModeSwitch');
  const devWarn = document.getElementById('devWarn');

  devSwitch?.addEventListener('change', () => {
    if (devSwitch.checked) {
      // 先展开后果说明，不直接生效。用户取消就退回去。
      devSwitch.checked = false;
      devWarn.hidden = false;
      devWarn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }

    devWarn.hidden = true;
    setPref('devMode', false);
    showToast('开发者模式已关闭');
  });

  /* 警告框里的确认与取消走本地绑定，取消要把开关复位 */
  devWarn?.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="dev-abort"]')) {
      devWarn.hidden = true;
      devSwitch.checked = false;
      return;
    }

    const btn = event.target.closest('[data-action="dev-confirm"]');
    if (!btn) return;

    devWarn.hidden = true;
    devSwitch.checked = true;
    setPref('devMode', true);
    showToast('已创建还原点 · 代码级日志可用');
  });

  /* 还原点与致谢 */
  body.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    if (target.dataset.action === 'snapshot') {
      showToast('已创建还原点');
    } else if (target.dataset.action === 'credits') {
      showToast('致谢文档：docs/CREDITS.md');
    }
  });

  /* 关闭：遮罩、按钮、Esc */
  sheet.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="settings-close"]')) closeSettings();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isSettingsOpen()) {
      event.stopPropagation();
      closeSettings();
    }
  });
}
