// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 右栏「记得的事」的数据源
 *
 * 只做一件事：拉 `/api/ntdpet/memory/recent`，把结果交给 panel.js 画。
 *
 * 为什么不用演示数据兜底（跟 mood.js 的处理相反）：
 * 情绪是数值，编一个 0.68 挂上「演示数据」标识，主人一眼知道那是假的，还能看排版；
 * 记忆是具体内容，「不吃香菜」这种句子编出来没有任何标识能弥补——它看起来就是
 * 一段真实记忆，读的人会当成真的。所以这里宁可空着，也不铺假条目。
 *
 * 为什么失败文案要跟「暂无记忆」分开：
 * 后端没起来和真的没记过事，在屏幕上都是「列表是空的」。写成同一句话，
 * 主人会以为她什么都没记住，实际只是服务没开——一个可以马上解决的小问题，
 * 被掩盖成「记忆功能坏了」。
 */

import { request } from './api.js';
import { renderMemories, renderMemoryEmpty } from './panel.js';

/** 条数：与 ROADMAP M0.2.3 一致，右栏卡片放 8 条刚好不滚。 */
const LIMIT = 8;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 把时间戳翻成中文相对时间。
 *
 * 只到「年前」为止：再往前的记忆在右栏里本来就该被更新的事挤掉，
 * 精确到具体日期反而占地方。
 *
 * 未来时间（时钟被改过、或两端时钟不同步）一律按「刚刚」处理：
 * 显示「-3 分钟前」比不显示更让人困惑。
 *
 * @param {number} at epoch 毫秒
 * @param {number} [now] 当前时间，便于测试
 * @returns {string} 取不到有效时间就返回空串，由调用方决定不画
 */
export function relativeTime(at, now = Date.now()) {
  if (!Number.isFinite(at)) return '';

  const diff = now - at;
  if (diff < MINUTE) return '刚刚';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;

  const days = Math.floor(diff / DAY);
  if (days < 30) return `${days} 天前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}

/**
 * 后端条目 → 渲染条目。
 *
 * 返回 null 表示这条没法显示（没有正文，或者正文不是字符串），
 * 由调用方过滤掉。宁可少显示一条，也不要在列表里留一行空白。
 *
 * @param {unknown} raw
 * @returns {{ text: string, time: string } | null}
 */
function toItem(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  if (!text) return null;

  return {
    text,
    // at 缺失时给空串，渲染那边会跳过时间元素
    time: relativeTime(Number(raw.at)),
  };
}

/**
 * 拉一次并渲染。
 *
 * 不做定时刷新：记忆只在真的聊过之后才变，而聊天本身就会触发渲染
 * （M0.2.4 接上发送后由那边调用）。定时轮询只会一直重复读同一批数据。
 */
export async function refreshMemories() {
  try {
    const data = await request('/memory/recent', { query: { limit: LIMIT } });
    const list = Array.isArray(data && data.items) ? data.items : [];
    const items = list.map(toItem).filter(Boolean);

    if (items.length === 0) {
      // 服务正常、但确实没有记忆——这是「空空如也」，不是错误
      renderMemoryEmpty('暂无记忆');
      return;
    }

    renderMemories(items);
  } catch (err) {
    // code 是 api.js 归一化后的机器可读值，message 是中文短句
    const code = err && err.code ? err.code : 'UNKNOWN';
    const message = err && err.message ? err.message : '请求失败';
    renderMemoryEmpty('记忆暂不可用', `${message}（${code}）`);
  }
}

/**
 * 启动时拉一次。
 *
 * 只调一次即可，重复调用只是多发一个请求，不会叠定时器（本来也没有）。
 */
export function startMemorySync() {
  void refreshMemories();
}
