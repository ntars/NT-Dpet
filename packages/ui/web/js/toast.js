// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 轻提示
 *
 * 单例。连续调用时复用同一个节点，重放淡入动画，而不是叠出一堆提示框。
 * 之所以抽成模块：主界面与设置面板都要用，各写一份会出现两个提示条同时出现。
 */

let el = null;
let timer = null;

/**
 * 显示一条提示
 * @param {string} text
 * @param {number} [duration] 毫秒，默认 1800
 */
export function showToast(text, duration = 1800) {
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }

  el.textContent = text;

  // 强制重排，确保连续调用时动画能重放
  void el.offsetWidth;
  el.classList.add('is-show');

  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('is-show'), duration);
}
