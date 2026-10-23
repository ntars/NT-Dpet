// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 对话区渲染
 *
 * 只负责把消息数组变成 DOM，不含任何业务逻辑。
 * 真实接入时，消息数组来自 dialogue 包，结构保持不变。
 */

import { persona } from './data.js';

/** 语音条波形高度（固定值，避免每次渲染抖动） */
const WAVE_BARS = [4, 8, 12, 7, 11, 14, 9, 5, 10, 13, 8, 6, 11, 9, 7, 12, 5, 8, 10, 6];

const threadEl = document.getElementById('thread');

/* ── 单个气泡 ── */

function buildBubble(msg) {
  const bubble = document.createElement('div');
  bubble.className = 'msg__bubble';

  if (msg.type === 'voice') {
    bubble.appendChild(buildVoiceBody(msg));
  } else {
    bubble.textContent = msg.text;
  }

  return bubble;
}

function buildVoiceBody(msg) {
  const wrap = document.createElement('span');
  wrap.className = 'voice-msg';

  // 播放图标
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 20 20');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '1.5');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M10 5.4 6.2 8.2H3.6v3.6h2.6L10 14.6z');
  const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arc.setAttribute('d', 'M12.8 8.1a2.9 2.9 0 0 1 0 3.8');
  icon.append(path, arc);

  // 波形
  const wave = document.createElement('span');
  wave.className = 'voice-msg__wave';
  const count = Math.min(WAVE_BARS.length, Math.max(6, msg.duration));
  for (let i = 0; i < count; i += 1) {
    const bar = document.createElement('i');
    bar.style.height = `${WAVE_BARS[i]}px`;
    wave.appendChild(bar);
  }

  // 时长
  const dur = document.createElement('span');
  dur.className = 'voice-msg__dur';
  dur.textContent = `${msg.duration}″`;

  wrap.append(icon, wave, dur);
  return wrap;
}

/* ── 整段对话 ── */

export function renderThread(conv) {
  threadEl.textContent = '';

  const frag = document.createDocumentFragment();

  if (conv.daymark) {
    const mark = document.createElement('div');
    mark.className = 'thread__daymark';
    mark.textContent = conv.daymark;
    frag.appendChild(mark);
  }

  let prevFrom = null;

  conv.messages.forEach((msg) => {
    const isMe = msg.from === 'me';

    const row = document.createElement('div');
    row.className = `msg ${isMe ? 'msg--me' : 'msg--them'}`;

    if (prevFrom !== null) {
      row.classList.add(prevFrom === msg.from ? 'msg--cont' : 'msg--gap');
    }

    // 群聊里别人的消息显示说话人；她自己的消息名字用强调色
    const isGroupMember = conv.kind === 'group' && msg.name && !isMe;

    if (isGroupMember) {
      const body = document.createElement('div');
      body.className = 'msg__group';

      const name = document.createElement('div');
      name.className = `msg__name${msg.self ? ' msg__name--self' : ''}`;
      name.textContent = msg.name;

      body.append(name, buildBubble(msg));
      row.appendChild(body);
    } else {
      row.appendChild(buildBubble(msg));
    }

    frag.appendChild(row);
    prevFrom = msg.from;
  });

  threadEl.appendChild(frag);
  scrollToBottom();
}

/* ── 追加与状态 ── */

export function appendMessage(conv, msg) {
  const isMe = msg.from === 'me';

  const row = document.createElement('div');
  row.className = `msg ${isMe ? 'msg--me' : 'msg--them'} msg--gap`;
  row.appendChild(buildBubble(msg));

  threadEl.appendChild(row);
  conv.messages.push(msg);
  scrollToBottom();
}

let typingEl = null;

export function showTyping() {
  if (typingEl) return;

  typingEl = document.createElement('div');
  typingEl.className = 'msg msg--them msg--gap';

  const bubble = document.createElement('div');
  bubble.className = 'msg__bubble typing';
  bubble.append(
    document.createElement('i'),
    document.createElement('i'),
    document.createElement('i'),
  );

  typingEl.appendChild(bubble);
  threadEl.appendChild(typingEl);
  scrollToBottom();
}

export function hideTyping() {
  if (!typingEl) return;
  typingEl.remove();
  typingEl = null;
}

export function scrollToBottom() {
  requestAnimationFrame(() => {
    threadEl.scrollTop = threadEl.scrollHeight;
  });
}

/* ── 演示回复（后端接入后删除） ── */

const DEMO_REPLIES = [
  ['嗯……那你早点休息喵', '明天还要早起呢'],
  ['我知道啦', '（尾巴轻轻扫了一下）不是生气，就是有点想你'],
  ['主人', '你说话的时候我有在听'],
  ['那你忙完了叫我', '我不吵你'],
];

let demoIndex = 0;

/**
 * 模拟一次回复：先显示正在输入，再逐条落下
 * @param {object} conv 当前会话
 */
export function simulateReply(conv) {
  showTyping();

  const lines = DEMO_REPLIES[demoIndex % DEMO_REPLIES.length];
  demoIndex += 1;

  setTimeout(() => {
    hideTyping();
    lines.forEach((text, i) => {
      setTimeout(() => {
        appendMessage(conv, { from: 'them', type: 'text', text });
      }, i * 1200);
    });
  }, 1100);
}

export { persona };
