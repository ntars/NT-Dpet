// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 演示数据
 *
 * 当前 UI 壳没有后端，所有内容都来自这里。
 * 接入后端时，只需把各个导出改成异步请求（保持字段名一致），
 * 渲染层无需改动。
 *
 * 字段语义与数据模型对应关系：
 *   emotion      → docs/ARCHITECTURE.md §7（mood / energy 为实例全局）
 *   relationship → 同 §7（affection / trust / intimacy / familiarity 按人）
 *   memories     → §6（事实条目层）
 */

export const persona = {
  name: '小鲸鱼',
  species: '猫娘',
  relationshipId: 'sister',
  relationshipLabel: '妹妹',
  catgirlIntensity: 'normal',   // light | normal | heavy
  addressUser: '主人',
};

/** 当前情绪：mood / energy 是实例全局，与具体的人无关 */
export const emotion = {
  mood: 0.68,
  energy: 0.42,
  pill: '缓和',
  summary: '有点累，但见到主人心情好了些',
};

/** 她对「主人」的关系数值：按人存 */
export const relationship = {
  affection: 0.62,
  trust: 0.48,
  intimacy: 0.35,
  familiarity: 0.55,
};

/** 事实条目层（演示用 4 条） */
export const memories = [
  { text: '不吃香菜，闻到味道就皱眉', at: '3 天前' },
  { text: '周三常加班到十点，回来时话会变少', at: '5 天前' },
  { text: '说想在周末去看海，但一直没去成', at: '2 周前' },
  { text: '怕吵，写东西的时候不喜欢被搭话', at: '1 个月前' },
];

/**
 * 会话与消息
 * from: 'them' 表示她/群友，'me' 表示主人
 * type: 'text' | 'voice'
 */
export const conversations = [
  {
    id: 'owner',
    kind: 'private',
    name: '主人',
    initial: '主',
    channel: 'QQ 官方机器人',
    daymark: '今天',
    messages: [
      { from: 'them', type: 'text', text: '主人今天回来得好晚喵' },
      { from: 'them', type: 'text', text: '我等了你好久' },
      { from: 'me', type: 'text', text: '加班，路上又堵' },
      { from: 'them', type: 'text', text: '那……吃饭了吗' },
      { from: 'them', type: 'text', text: '（耳朵垂下来）不许说没吃' },
      { from: 'me', type: 'text', text: '吃了，楼下那家面' },
      { from: 'them', type: 'text', text: '那就好' },
      {
        from: 'them',
        type: 'voice',
        duration: 7,
        text: '下次晚回来跟我说一声嘛，我不会催的，就是想知道你还好',
      },
    ],
  },
  {
    id: 'seaside',
    kind: 'group',
    name: '海边的猫',
    initial: '海',
    channel: 'QQ 官方机器人',
    daymark: '今天',
    messages: [
      { from: 'them', type: 'text', text: '小鲸鱼在吗', name: '阿澈' },
      { from: 'them', type: 'text', text: '在的喵', name: '小鲸鱼', self: true },
      { from: 'them', type: 'text', text: '你说猫是不是都喜欢纸箱', name: '阿澈' },
      {
        from: 'them',
        type: 'text',
        text: '不一定哦。我更喜欢被子里面，纸箱太硬了',
        name: '小鲸鱼',
        self: true,
      },
      { from: 'them', type: 'text', text: '……你居然认真回答了', name: '阿澈' },
    ],
  },
  {
    id: 'night',
    kind: 'group',
    name: '夜班便利店',
    initial: '夜',
    channel: '飞书',
    daymark: '昨天',
    messages: [
      { from: 'them', type: 'text', text: '今天有人要来换班吗', name: '小林' },
      { from: 'them', type: 'text', text: '应该有的，我帮你问问', name: '小鲸鱼', self: true },
      { from: 'them', type: 'text', text: '晚安，明天见', name: '小林' },
    ],
  },
];

/** 工作模式日志：事件类型已映射为中文（决策 66） */
export const logs = [
  { time: '21:09:41', kind: 'channel', tag: '通道', text: '收到私聊消息 · QQ 官方 · 来自 主人' },
  { time: '21:09:41', kind: 'router', tag: '路由', text: '私聊消息 → 直接回复，不经过唤醒判断' },
  { time: '21:09:41', kind: 'memory', tag: '记忆', text: '召回 4 条相关记忆（语义 3 · 关键词 1）· 耗时 11ms' },
  { time: '21:09:42', kind: 'model', tag: '模型', text: '请求 deepseek-chat · 输入 1384 tokens · 温度 0.80' },
  { time: '21:09:44', kind: 'model', tag: '模型', text: '返回 68 tokens · 耗时 1.92s · 首字 0.41s' },
  { time: '21:09:44', kind: 'rhythm', tag: '节奏', text: '拆分 2 条 · 句长 9 / 11 字 · 间隔 1.4s' },
  { time: '21:09:46', kind: 'channel', tag: '通道', text: '发送成功 2/2 · 剩余回复次数 3' },
  { time: '21:10:03', kind: 'channel', tag: '通道', text: '收到群消息 · 群「海边的猫」· 来自 阿澈' },
  { time: '21:10:03', kind: 'router', tag: '路由', text: '命中关键词「小鲸鱼」→ 决定回复' },
  { time: '21:10:04', kind: 'memory', tag: '记忆', text: '召回 1 条相关记忆 · 注意力分层：熟人' },
  { time: '21:10:05', kind: 'model', tag: '模型', text: '请求 deepseek-chat · 输入 1192 tokens' },
  { time: '21:10:06', kind: 'model', tag: '模型', text: '返回 34 tokens · 耗时 1.31s' },
  { time: '21:10:07', kind: 'rhythm', tag: '节奏', text: '拆分 1 条 · 群聊模式，不追加语音' },
  { time: '21:10:07', kind: 'channel', tag: '通道', text: '发送成功 1/1' },
  { time: '21:11:28', kind: 'memory', tag: '记忆', text: '异步提炼完成 · 新增事实条目 1 条（待确认）' },
  { time: '21:12:40', kind: 'channel', tag: '通道', text: '收到私聊消息 · 来自 主人' },
  { time: '21:12:40', kind: 'router', tag: '路由', text: '私聊消息 → 直接回复' },
  { time: '21:12:41', kind: 'model', tag: '模型', text: '请求 deepseek-chat · 输入 1402 tokens' },
  { time: '21:12:43', kind: 'rhythm', tag: '节奏', text: '情绪强度 0.18 未达阈值 → 不转语音，发文本' },
  { time: '21:12:44', kind: 'channel', tag: '通道', text: '发送成功 2/2' },
];

/**
 * 代码级日志：仅开发者模式可见（决策补充）
 *
 * 与上面的中文概览是两层东西：
 *   概览层  给普通用户看，已翻译，只说「发生了什么」
 *   代码级  给开发者看，保留原始字段、原始 JSON、SQL、HTTP 报文、错误码与堆栈
 *
 * 代码级的错误码和堆栈**不得翻译**，否则无法检索、无法对照上游文档。
 */
export const devLogs = [
  {
    time: '21:09:41.284',
    level: 'debug',
    module: 'channel.qq-official',
    msg: 'event=message.receive',
    detail: '{"type":"message","message_type":"private","sub_type":"friend","user_id":"10001",\n "raw_message":"加班，路上又堵","message_id":"-2147483647","time":1729598981}\n// 已关闭会话日志上传：session-log-deepseek.enabled=false',
  },
  {
    time: '21:09:41.291',
    level: 'debug',
    module: 'router.dispatch',
    msg: 'rule=private_direct matched=true',
    detail: '{ "sessionKey": "qq-official:private:10001", "priority": 0, "queueDepth": 1,\n  "awaken": { "gate": "private", "skip": true } }',
  },
  {
    time: '21:09:41.302',
    level: 'debug',
    module: 'memory.recall',
    msg: 'vec=sqlite-vec topK=50 elapsed=11ms',
    detail: 'SELECT rowid, distance FROM vec_fact\n  WHERE embedding MATCH ? AND k = 50\n  ORDER BY distance\n// 融合权重 alpha=0.5 beta=0.5（关键词 + 向量，RRF）',
  },
  {
    time: '21:09:41.318',
    level: 'debug',
    module: 'memory.rank',
    msg: 'candidates=50 injected=4 dropped=46',
    detail: '{ "score": "0.6*similarity + 0.4*recency", "conflict": "latest_wins",\n  "budget": { "total": 1600, "used": 1187, "layer": { "L1": 312, "L2": 176, "L4": 508, "L6": 148 } } }',
  },
  {
    time: '21:09:42.117',
    level: 'info',
    module: 'llm.request',
    msg: 'provider=deepseek model=deepseek-chat',
    detail: 'POST https://api.deepseek.com/v1/chat/completions\n{ "model": "deepseek-chat", "temperature": 0.8, "max_tokens": 512,\n  "messages": [ { "role": "system", "content": "<omitted 1187 chars>" }, … ] }\n// dsh_session_log 字段：未附加（已禁用）',
  },
  {
    time: '21:09:44.038',
    level: 'info',
    module: 'llm.response',
    msg: 'status=200 tokens=68/1384 elapsed=1921ms',
    detail: '{ "id": "chatcmpl-…", "usage": { "prompt_tokens": 1384, "completion_tokens": 68 },\n  "first_token_ms": 412, "cache": { "hit": false } }',
  },
  {
    time: '21:09:44.041',
    level: 'debug',
    module: 'rhythm.split',
    msg: 'segments=2 lens=[9,11]',
    detail: '{ "maxSegments": 4, "pause": [0.6, 2.5], "longPauseChance": 0.2,\n  "nightFactor": 1.0, "channelLimit": { "officialGroup": 4, "current": 2 } }',
  },
  {
    time: '21:09:45.120',
    level: 'debug',
    module: 'emotion.update',
    msg: 'mood 0.66→0.68 energy 0.42→0.42',
    detail: '{ "delta": { "mood": 0.02, "energy": 0.0 }, "dispersion": 0.4,\n  "batchWrite": { "intervalMs": 60000, "pending": 1 } }',
  },
  {
    time: '21:09:46.203',
    level: 'warn',
    module: 'channel.send',
    msg: 'retry=1 code=RETRY_AFTER_RATE_LIMIT',
    detail: 'HTTP 429 { "retry_after": 0.9, "limit": "group_msg_per_min", "remaining": 2 }\n// 退避 900ms 后重试，未消耗回复次数',
  },
  {
    time: '21:09:47.110',
    level: 'info',
    module: 'channel.send',
    msg: 'ok=true msg_id=1847392011 attempts=2',
    detail: '{ "seq": "2/2", "quota_left": 3, "latency_ms": 907 }',
  },
  {
    time: '21:11:28.552',
    level: 'debug',
    module: 'memory.extract',
    msg: 'facts=1 queued=true',
    detail: 'INSERT INTO fact_candidate (session_id, persona_id, participant_id, text, source_msg_id, status)\n  VALUES (?, ?, ?, ?, ?, \'pending\');\n// 待用户确认，未写入正式事实层',
  },
  {
    time: '21:11:28.601',
    level: 'error',
    module: 'privacy.verify',
    msg: 'E_DSH_SESSION_LOG_REENABLED',
    detail: 'Error: 检测到 session-log-deepseek 被上游更新重置为 enabled: true\n    at PrivacyGuard.verify (packages/privacy/src/index.ts:84:13)\n    at Plugin.onStart (packages/privacy/src/index.ts:41:5)\n// 已自动改回 false，并在下次启动重新校验',
  },
];
