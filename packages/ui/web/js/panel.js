/**
 * 右侧状态面板
 *
 * 展示三块：此刻情绪（全局五维中的两项）、对某人的关系（按人存）、最近记忆。
 * 依据 docs/ARCHITECTURE.md §7：mood / energy 为实例全局，
 * affection / trust / intimacy / familiarity 按人各一份。
 */

import { emotion, relationship, memories, persona } from './data.js';

/** 情绪：实例全局 */
const EMOTION_METRICS = [
  { key: 'mood', label: '心情', color: 'var(--emo-mood)' },
  { key: 'energy', label: '精力', color: 'var(--emo-energy)' },
];

/** 关系：按人 */
const RELATION_METRICS = [
  { key: 'affection', label: '好感', color: 'var(--emo-affection)' },
  { key: 'trust', label: '信任', color: 'var(--emo-trust)' },
  { key: 'intimacy', label: '亲密', color: 'var(--emo-intimacy)' },
  { key: 'familiarity', label: '熟悉', color: 'var(--label-3)' },
];

function buildMetric({ key, label, color }, value) {
  const row = document.createElement('div');
  row.className = 'metric';
  row.style.setProperty('--c', color);
  row.style.setProperty('--v', String(value));

  const labelEl = document.createElement('span');
  labelEl.className = 'metric__label';
  labelEl.textContent = label;

  const track = document.createElement('span');
  track.className = 'metric__track';
  track.appendChild(document.createElement('i'));

  const valueEl = document.createElement('span');
  valueEl.className = 'metric__value';
  valueEl.textContent = String(Math.round(value * 100));

  row.append(labelEl, track, valueEl);
  return row;
}

function fillMetrics(container, defs, source) {
  container.textContent = '';
  defs.forEach((def) => {
    container.appendChild(buildMetric(def, source[def.key] ?? 0));
  });
}

function renderMemories(list) {
  const container = document.getElementById('memoryList');
  container.textContent = '';

  list.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'memory-item';

    const mark = document.createElement('span');
    mark.className = 'memory-item__mark';

    const text = document.createElement('span');
    text.textContent = item.text;

    li.append(mark, text);
    container.appendChild(li);
  });
}

export function renderPanel() {
  // 情绪文字与标签
  document.getElementById('moodLine').textContent = emotion.summary;
  document.getElementById('moodPill').textContent = emotion.pill;

  // 情绪两项
  fillMetrics(document.getElementById('metricList'), EMOTION_METRICS, emotion);

  // 关系四项
  fillMetrics(document.getElementById('relationList'), RELATION_METRICS, relationship);

  // 记忆
  renderMemories(memories);

  // 品牌名与关系标签
  document.getElementById('brandName').textContent = persona.name;
}

/**
 * 数值动画：从旧值过渡到新值
 * 后端推送情绪变化时调用，避免数值瞬跳
 */
export function updateEmotion(next) {
  Object.assign(emotion, next);
  document.getElementById('moodLine').textContent = emotion.summary;
  document.getElementById('moodPill').textContent = emotion.pill;

  const rows = document.getElementById('metricList').children;
  EMOTION_METRICS.forEach((def, i) => {
    const row = rows[i];
    if (!row) return;
    row.style.setProperty('--v', String(emotion[def.key]));
    row.querySelector('.metric__value').textContent = String(
      Math.round(emotion[def.key] * 100),
    );
  });
}
