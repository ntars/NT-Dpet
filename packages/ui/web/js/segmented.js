// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 分段控件（segmented）的选中态
 *
 * 为什么抽成模块：主界面的「对话 / 工作」、日志的「中文 / 代码级」、
 * 设置里的三档与四档，全都在用同一个视觉组件。
 * 原先每种场景各写一遍设置逻辑，结果只有写了 data-active="work" 的那一处滑块会动，
 * 日志层的滑块一直停在原地。统一到这里之后只有一个真相：
 * 谁有几格、现在在第几格，全由 CSS 变量描述，滑块据此位移。
 *
 * 约定：
 *   子按钮上用某个属性承载值，例如 data-view / data-logmode / data-density
 *   容器上用 --seg-n / --seg-i 表示格数与当前位置
 */

/**
 * 把一组分段按钮切到指定值
 * @param {HTMLElement|null} root 容器
 * @param {string} attr 承载值的属性名，带方括号传给 querySelector，如 'data-view'
 * @param {string} value 目标值
 */
export function setSegmented(root, attr, value) {
  if (!root) return;

  const items = Array.from(root.querySelectorAll(`[${attr}]`));
  if (items.length === 0) return;

  const index = Math.max(0, items.findIndex((el) => el.getAttribute(attr) === value));

  root.dataset.active = value;
  root.style.setProperty('--seg-n', String(items.length));
  root.style.setProperty('--seg-i', String(index));
  // 单格宽度用百分比交给 JS 算：CSS calc 不允许除以 var()，
  // 写成 calc(100% / var(--seg-n)) 会被浏览器静默丢弃。
  root.style.setProperty('--seg-w', `${100 / items.length}%`);

  items.forEach((el, i) => {
    const active = i === index;
    el.classList.toggle('is-active', active);
    el.setAttribute('aria-selected', String(active));
  });
}
