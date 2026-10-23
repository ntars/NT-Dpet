// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 偏好设置的单一真源
 *
 * 为什么单独一个模块：设置面板与主界面都要读写同一批状态
 * （比如开发者模式既要在设置里开关，又要决定日志能不能切到代码级）。
 * 如果两边各存一份 localStorage，必然出现「设置里开了、日志里还是关的」
 * 这种自相矛盾的状态。所以读取与写入只在这里发生。
 *
 * 存储形态：一个 JSON 对象放在 nt-dpet.prefs 里，而不是一个键一个值。
 * 理由是一次读写、一次解析，也便于将来整体导出与导入。
 *
 * 变更通知：写入后派发 nt-prefs-change 事件，detail 为 { key, value, prefs }。
 * 需要联动的模块监听这个事件即可，不必轮询。
 */

const STORAGE_KEY = 'nt-dpet.prefs';

/** 兼容旧版本的独立键，读到后迁移进新结构 */
const LEGACY_DEV_KEY = 'nt-dpet.devMode';

/**
 * 默认值
 *
 * 每一个默认值都对应文档里的决策，改这里之前先看 DECISIONS.md：
 *   relation=partner   决策 32 的四选一，默认「伴侣」是产品定位
 *   density=normal     决策 30 的浓度三档
 *   proactive=normal   决策 41 的主动消息，标准档
 *   devMode=false      决策 59，默认关闭
 *
 * 注意：主题不在这里。theme.js 自己管 nt-dpet.theme.mode 与经纬度，
 * 那边还要算日出日落，搬过来只会变成两份状态互相打架。
 * 设置面板直接调 theme.js 的 getThemeMode / setThemeMode。
 */
const DEFAULTS = {
  relation: 'partner',
  density: 'normal',
  proactive: 'normal',
  model: 'deepseek-flash',
  reasoning: 'low',
  devMode: false,
  personaName: '小鲸鱼',
  personaCall: '主人',
  channels: {
    'qq-official': true,
    feishu: false,
    'qq-napcat': false,
  },
};

/** 内存副本，避免每次读都解析 JSON */
let cache = null;

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* 存储被禁用或内容损坏时退回默认值，不阻塞界面 */
  }
  return null;
}

function migrateLegacy(obj) {
  if (obj) return obj;
  try {
    const legacy = localStorage.getItem(LEGACY_DEV_KEY);
    if (legacy === '1') return { devMode: true };
  } catch {
    /* 忽略 */
  }
  return {};
}

/**
 * 合并后的完整偏好
 * 只做一层深合并：channels 是唯一的嵌套对象，其余都是标量。
 */
export function getPrefs() {
  if (cache) return cache;

  const stored = migrateLegacy(readStorage());
  cache = {
    ...DEFAULTS,
    ...stored,
    channels: { ...DEFAULTS.channels, ...(stored.channels ?? {}) },
  };
  return cache;
}

export function getPref(key) {
  return getPrefs()[key];
}

/**
 * 写入一项偏好
 * @param {string} key
 * @param {unknown} value
 */
export function setPref(key, value) {
  const prefs = getPrefs();
  if (prefs[key] === value) return;

  prefs[key] = value;
  persist();
  notify(key, value);
}

/**
 * 写入某个通道的开关
 * @param {string} id 通道标识，如 'qq-napcat'
 * @param {boolean} on
 */
export function setChannel(id, on) {
  const prefs = getPrefs();
  if (prefs.channels[id] === on) return;

  prefs.channels[id] = on;
  persist();
  notify(`channels.${id}`, on);
}

export function getChannel(id) {
  return getPrefs().channels[id] === true;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* 存储不可用时仅内存生效，界面照常工作 */
  }
}

function notify(key, value) {
  document.dispatchEvent(
    new CustomEvent('nt-prefs-change', { detail: { key, value, prefs: cache } }),
  );
}
