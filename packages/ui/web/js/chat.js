// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 对话区渲染
 *
 * 只负责把消息数组变成 DOM，不含任何业务逻辑。
 * 消息数组的结构与 dialogue 包保持一致的形状，接后端时不用改结构。
 *
 * 流式回复的 DOM 由 `beginReply()` 交出的句柄来推进：先放一个打字指示，
 * 第一段正文到了再换成文字。这样「点击 → 有反应」之间不会空着一块。
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

/** 三颗跳动的点，用于「正在输入」。 */
function makeDots() {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 3; i += 1) frag.appendChild(document.createElement('i'));
  return frag;
}

export function scrollToBottom() {
  requestAnimationFrame(() => {
    threadEl.scrollTop = threadEl.scrollHeight;
  });
}

/* ── 流式回复 ── */

/**
 * 开一个「她正在说」的气泡，返回推进它的句柄。
 *
 * 为什么要有这个句柄而不是让调用方自己拼 DOM：一块块追加正文时，
 * 最容易写错的是「先建气泡再判断有没有内容」——顺序一乱就会出现空气泡，
 * 或者第一次 delta 把打字指示覆盖掉却忘了清掉 typing 类，三颗点一直转。
 * 把这三件事（换掉打字指示、追加正文、收尾小字）收在一个地方，
 * 调用方只管 `append` 就行。
 *
 * 消息同时也写进 conv.messages：切走会话再切回来重新渲染时，
 * 已经说过的话不能凭空消失。
 *
 * @param {object} conv 当前会话
 * @returns {{append: (text: string) => void, note: (text: string) => void, text: string}}
 */
export function beginReply(conv) {
  const row = document.createElement('div');
  row.className = 'msg msg--them msg--gap';

  const bubble = document.createElement('div');
  bubble.className = 'msg__bubble typing';
  bubble.appendChild(makeDots());

  const bodyEl = document.createElement('span');
  bodyEl.className = 'msg__text';
  const noteEl = document.createElement('span');
  noteEl.className = 'msg__note';
  noteEl.hidden = true;

  row.appendChild(bubble);
  threadEl.appendChild(row);
  scrollToBottom();

  const msg = { from: 'them', type: 'text', text: '' };
  conv.messages.push(msg);

  // 打字指示只在「还没有一个字」时存在，第一次写入内容时一并换掉
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    bubble.classList.remove('typing');
    bubble.textContent = '';
    bubble.append(bodyEl, noteEl);
  };

  return {
    append(text) {
      start();
      msg.text += text;
      bodyEl.textContent = msg.text;
      scrollToBottom();
    },
    /** 在正文下面补一行状态小字：已中断 / 发送失败，可重试。 */
    note(text) {
      start();
      noteEl.textContent = text;
      noteEl.hidden = false;
      scrollToBottom();
    },
    get text() {
      return msg.text;
    },
  };
}

export { persona };
