// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 发送一条消息：把一句话交给 `/chat`，边收边画。
 *
 * 为什么单独一个文件、不塞进 app.js：
 * app.js 管的是「界面骨架」（视图、会话、输入框），发送这件事是「一次请求的
 * 完整生命周期」——建气泡、收流、收尾、失败重试原话。两件事搅在一起以后，
 * 想改发送行为就得在一堆视图逻辑里翻。这里只对外给两个函数。
 *
 * 三条界面约束（ROADMAP M0.2.4）：
 *   1. 收到一块画一块，不做整体替换（否则长回复会先空白再整段蹦出）；
 *   2. 生成期间不许再发（见 isSending，按钮禁用由 app.js 做）；
 *   3. `stopReason=aborted` 显示「已中断」，失败显示「发送失败，可重试」。
 */

import { streamChat, isAbort } from './api.js';
import { beginReply } from './chat.js';

/**
 * 会话键。
 *
 * 与后端 handler.ts 的 DEFAULT_SESSION_KEY 保持一致（`c2c:local`）。
 * 这是 M0 阶段的过渡值：还没接通道（M2 才做），没有平台账号可依据。
 */
const DEFAULT_SESSION = 'c2c:local';

/** 正在进行的请求。同一时刻只允许一个：两股流同时往两个气泡里写字会乱序。 */
let active = null;

/** 当前是否正在生成。 */
export function isSending() {
  return active !== null;
}

/**
 * 关窗或刷新时中止请求。
 *
 * 不做这件事的后果在服务端：浏览器断了，模型那头照常算到结束，
 * 这段 token 是白花的。abort 之后 Signal 一路传到 dialogue，上游随之停下。
 */
window.addEventListener('pagehide', () => {
  if (active) active.abort();
});

/**
 * 发一条消息并渲染回复。
 *
 * @param {object} conv 当前会话
 * @param {string} text 已 trim 过的用户输入
 * @returns {Promise<{status: 'ok'|'aborted'|'error'|'busy'}>}
 *   `error` 时调用方可以把原文放回输入框——提示写着「可重试」，就得真能一键重发。
 */
export async function sendMessage(conv, text) {
  if (active) return { status: 'busy' };

  const controller = new AbortController();
  active = controller;

  const reply = beginReply(conv);

  try {
    let stopReason = 'stop';

    for await (const event of streamChat(
      { session: DEFAULT_SESSION, text },
      { signal: controller.signal },
    )) {
      if (event.type === 'delta') {
        reply.append(event.text);
        continue;
      }

      if (event.type === 'error') {
        // 上游在流里报错：HTTP 已经是 200，界面只能靠这条事件知道失败
        reply.note('发送失败，可重试');
        return { status: 'error' };
      }

      if (event.type === 'done') {
        stopReason = event.stopReason || 'stop';
        break;
      }

      // 'event'：认不出的块。正文已经由 delta 画过了，
      // 这里不往界面上写任何东西——把原始 JSON 摊给主人看没有意义。
    }

    if (stopReason === 'aborted') {
      reply.note('已中断');
      return { status: 'aborted' };
    }

    if (stopReason === 'error') {
      reply.note('发送失败，可重试');
      return { status: 'error' };
    }

    // 正常结束但一个字都没有：不留一个看着像卡住的空泡
    if (reply.text === '') {
      reply.note('没有收到回复');
    }

    return { status: 'ok' };
  } catch (err) {
    /*
     * 主动中断（关窗、切换会话）不是故障，不能弹「发送失败」。
     * 这条分支在关窗时其实已经轮不到界面渲染了，但同一套代码也会被
     * 将来的「停止生成」按钮用到，所以提示照实写。
     */
    if (isAbort(err)) {
      reply.note('已中断');
      return { status: 'aborted' };
    }

    // 超时、连不上、令牌失效、503 未接入：对界面的结论一样——这条没发出去
    reply.note('发送失败，可重试');
    return { status: 'error' };
  } finally {
    active = null;
  }
}
