// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 情绪面板的数据源
 *
 * 做三件事：启动时拉一次真实情绪、之后每 30 秒刷新、失败时退回演示数据并
 * 在卡片顶部挂一个「演示数据」标识。
 *
 * 为什么标识不能省：情绪是这套界面的主角，一个 68 分的「不错」和一个 68 分的
 * 假数据，在屏幕上长得一模一样。不标出来的后果是主人以为她真的心情不错，
 * 实际上后端根本没起来——这种错误比白屏更难发现。
 *
 * 为什么只给数值、文案在本地拼：后端只产数字（见 src/api/types.ts 的
 * MoodReading）。把「有点累但见到你心情好了些」这类句子写进后端，等于让
 * 服务端替人格说话，换个说法就得改后端。
 */

import { request } from './api.js';
import { updateEmotion } from './panel.js';
import { emotion as demoEmotion } from './data.js';

/** 刷新间隔。ROADMAP M0.2.2 定的 30 秒：比这更快没有意义，情绪本来就变得慢。 */
const INTERVAL_MS = 30_000;

/**
 * 演示数据的快照
 *
 * 必须在这里拷一份，不能每次直接读 data.js 的 emotion。
 * 原因：updateEmotion() 会 Object.assign 到 data.js 那个对象上，
 * 一旦真实数据写进去，data.js 里的原值就被覆盖了——之后后端断开再想退回
 * 演示数据，拿到的其实是上一次的真实值，标识还挂着，数据却是真的，最坏的一种状态。
 */
const DEMO = Object.freeze({
  mood: demoEmotion.mood,
  energy: demoEmotion.energy,
  pill: demoEmotion.pill,
  summary: demoEmotion.summary,
});

let timer = null;

/* ── 数值翻译成人话 ── */

/**
 * 心情档位。
 *
 * 分界点取 0.2 / 0.4 / 0.6 / 0.8，与右栏数值条的视觉分段一致；
 * 词只用短词，因为它要塞进 18px 高的胶囊里。
 */
function moodWord(value) {
  if (value < 0.2) return '低落';
  if (value < 0.4) return '有些沉';
  if (value < 0.6) return '平静';
  if (value < 0.8) return '不错';
  return '雀跃';
}

/**
 * 精力档位。
 *
 * 五档统一带「精力」二字，是为了摘要读起来对称：
 * 「心情雀跃，精力充沛」比「心情雀跃，很充沛」清楚——后者要读者自己
 * 回想这半句说的是什么。
 */
function energyWord(value) {
  if (value < 0.2) return '精力几乎耗尽';
  if (value < 0.4) return '精力偏低';
  if (value < 0.6) return '精力一般';
  if (value < 0.8) return '精力充沛';
  return '精力很足';
}

/**
 * 校验并收敛到 0..1。
 *
 * 后端已经保证范围（emotion 写入时 clamp 过），这里仍要拦一道：
 * 中间可能隔着别的进程、代理或手改的 JSON。一个 NaN 会让数值条宽度变成
 * `NaN%`，浏览器直接忽略这条声明，表现成「进度条卡在原来的位置」，
 * 看不出是数据坏了。
 *
 * @returns {number|null} 不是有限数就返回 null，由调用方按失败处理
 */
function toUnit(value) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.min(1, Math.max(0, num));
}

/* ── 标识 ── */

/**
 * 开关「演示数据」标识。
 *
 * @param {boolean} show 是否显示
 * @param {string} [reason] 失败原因，挂在 title 上供悬停查看；不写在可见文本里
 */
function setDemoBadge(show, reason) {
  const badge = document.getElementById('demoBadge');
  if (!badge) return;

  badge.hidden = !show;
  if (show) {
    badge.title = reason ? `当前显示的是演示数据：${reason}` : '当前显示的是演示数据';
  } else {
    badge.removeAttribute('title');
  }
}

/* ── 渲染 ── */

/** 用真实读数刷新面板。 */
function applyReal(data) {
  const mood = toUnit(data && data.mood);
  const energy = toUnit(data && data.energy);

  // 结构对但值是坏的，和「请求失败」一样处理：宁可标演示数据，不显示半个真值
  if (mood === null || energy === null) {
    applyDemo('返回的数值不合法');
    return;
  }

  updateEmotion({
    mood,
    energy,
    pill: moodWord(mood),
    summary: `心情${moodWord(mood)}，${energyWord(energy)}`,
  });

  setDemoBadge(false);
}

/** 退回演示数据。 */
function applyDemo(reason) {
  updateEmotion({ ...DEMO });
  setDemoBadge(true, reason);
}

/**
 * 拉一次情绪。
 *
 * 所有失败都降级，不做分支：503（后端还没接上）、401（令牌缺失）、
 * 连不上、超时，对界面的结论完全一样——现在没有真实数据可用。
 * 区别只在 title 里的原因文字，方便排查而不干扰主人。
 */
async function refresh() {
  try {
    applyReal(await request('/mood'));
  } catch (err) {
    // code 是 api.js 归一化后的机器可读值，message 是中文短句
    const code = err && err.code ? err.code : 'UNKNOWN';
    const message = err && err.message ? err.message : '请求失败';
    applyDemo(`${message}（${code}）`);
  }
}

/**
 * 开始同步。
 *
 * 只调用一次即可：重复调用不会叠出两个定时器（下面有判空）。
 * 首次拉取不阻塞启动——界面先用 data.js 的数据画出来，
 * 真实值到了再覆盖，避免为了等一个 GET 让首屏空着。
 */
export function startMoodSync() {
  void refresh();

  if (timer === null) {
    timer = setInterval(() => {
      void refresh();
    }, INTERVAL_MS);
  }
}
