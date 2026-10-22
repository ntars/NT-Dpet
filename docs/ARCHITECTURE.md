# NT-Dpet 架构设计（v0.2）

> 编写日期：2026-10-22　｜　状态：**设计定稿，未进入编码**
> 决策依据：`docs/DECISIONS.md`（68 项已确认决策 + 10 项待定）
> 技术依据：`docs/TECH-RESEARCH.md`（技术底账与许可矩阵）

## 0. 版本变更（v0.1 → v0.2）

v0.1 中存在 20 余处未经主人确认的设计。v0.2 全部改为以下处理之一：换成主人明确裁决，或标注 `[待定]`。

| 项 | v0.1 | v0.2 |
|---|---|---|
| 插件数量 | 9 个包 | **29 个包，界面按 7 组展示**（决策 15） |
| 默认人格 | 空（仅技术标识） | **猫娘「小鲸鱼」，称呼主人**（决策 28-30） |
| 关系定位 | 未涉及 | **四选一**（决策 32） |
| 界面布局 | 自拟三栏 | **与 DSH 一致 + 默认视图为对话**（决策 12、63、64） |
| 分条上限 | 全部压到 4 条 | **官方 4 条，其他平台不限制**（决策 39） |
| 行动层入口 | 放在开发者模式后面 | **普通设置里就能开**（决策 46） |
| 开发者模式保护 | 未经确认 | **两条都加**（决策 59） |
| 施工顺序 | M0→M7 线性 | **先桌面能聊 → 三端打包 → 填功能**（决策 67） |
| 三端顺序 | 未明确 | **Win → Mac → Linux**（决策 9） |
| 情绪重置（换人格） | 玖玖自定为重置 | **保留，不重置**（决策 69） |

## 关于可信度标注

| 标记 | 含义 |
|---|---|
| `[已核实]` | 有官方文档、原始代码或实测数据可直接验证 |
| `[第三方]` | 来自第三方评测或社区实践，需二次确认 |
| `[待验证]` | 尚无可靠来源，编码前必须实测 |
| `[推测]` | 基于现有信息推理，未经证实 |
| `[设计]` | 本方案，尚未实现 |
| `[待定]` | **主人尚未裁决，实现前必须确认** |

---

## 1. 设计原则

八条贯穿全文。任何模块设计与其冲突，以此为准。

### 1.1 默认给好，全部可调

每处行为参数 = 合理默认值 + 用户可改入口，配「渐进式暴露」：

| 模式 | 用户看到 |
|---|---|
| 简单（默认） | 四档：关闭 / 缓慢 / 标准 / 快速 |
| 高级 | 具体数值：半衰期小时数、token 预算、概率 |

### 1.2 不动上游

不修改 DSH 源码，不 fork 任何第三方项目。改动只发生在**插件**与**配置补丁层**。这是许可要求（NapCat 禁止衍生开发），也是维护要求。

### 1.3 单一真源

引擎、数据模型、共用逻辑只存在一份。Web / 桌宠 / 安装器加载同一份产物。

### 1.4 失败静默降级

任何增强能力失败都退回基础能力，且**不向用户暴露错误**：

| 失败 | 降级到 |
|---|---|
| 语音合成/上传失败 | 发文本 |
| 表情包生成失败 | 只发文本 |
| 视觉模型不可用 | 停止行动，回复「我现在做不了这个」 |
| 通道不支持某消息类型 | 转成文本 |

### 1.5 可逆注册

Cordis 的核心模型是「注册即副作用，卸载即撤销」。定时器、监听器、子进程、工具、UI 面板全部注册为可逆副作用。

### 1.6 进程边界按崩溃半径切

| 放在 DSH 进程内 | 必须进程外 |
|---|---|
| 内核（每轮几十次内存访问，跨进程会拖垮响应） | GPU 推理（OOM 是常态） |
| 通道适配器（纯 I/O） | NapCat（独立 Node 进程） |
| 市场、配置、UI | adb 二进制 |
| — | Python 声音服务 |

### 1.7 默认关闭高危能力

| 能力 | 默认 | 开启方式 |
|---|---|---|
| 个人号通道（NapCat） | 关 | 首绑时不可跳过的风险确认 |
| 通用 GUI Agent | 关 | 普通设置可开，但需过实验性警告（决策 46） |
| 开发者模式 | 关 | 总开关 + 强制还原点 + 脚本审计（决策 59） |

### 1.8 用户数据优先于官方配置

配置分四层，更新只动上面两层。详见 §13.3。

---

## 2. 系统形态

**NT-Dpet 是 DeepSeek Harness 的一个发行版，不是独立框架**（决策 1）。

一个 NT-Dpet 实例 = 五样东西的组合：

| 组成 | 内容 |
|---|---|
| 一个 profile | `$DSH_HOME/profiles/nt-dpet/` |
| 一组插件 | §4 的 29 个包 |
| 一份默认配置 | `bundles/starter/cordis.patch.yml` |
| 一套默认人格 | `personas/xiaojingyu/` |
| 一个 Electron 外壳 | 安装器 + 桌宠窗口 |

用户从不知道 DSH 是什么。他看到的是一个窗口，里面是小鲸鱼。

### 2.1 为什么必须用 DSH

不是因为它会聊天（它不会），而是三件事它已经做好了：

1. **插件树与配置装配**——省掉整套插件加载器
2. **Web UI 宿主与工具生态**——行动层可直接用它的工具系统
3. **多模型适配 seam**——不用自己对接十几家 API

### 2.2 但日常对话不走它的 agent loop（决策 13）

| | DSH agent loop | 伴侣对话 |
|---|---|---|
| 每轮开销 | 装配工具 schema、重建 prompt、写 session log | 记忆检索 + 一次生成 |
| 会话语义 | 一次任务 = 一个 session | 一段关系 = 一个持续 session |
| 工具 | 核心能力 | 绝大多数轮次不需要 |

**两条路分开走**：

```
日常聊天  → dialogue 包（自建轻量通道，只用 DSH 的 llm seam）
需要动手  → 唤起 DSH 工具链（adb / 浏览器 / Minecraft / 文件）
```

**额外收益**：日常对话不产生 agent 的 session log，隐私暴露面天然更小。

`[待验证 #1]`：DSH 的 `llm` seam 能否脱离 agent loop 单独调用。这是本架构成立的前提，M0 阶段必须实测。

---

## 3. 进程拓扑

```
┌─────────────────────────────────────────────────────────────┐
│  Electron 主进程                                             │
│  ├─ installer/    首次运行：环境探测 → 下载 → 校验 → 拉起      │
│  ├─ pet/          桌宠透明窗口（首次询问是否启动）             │
│  └─ window/       WebView 宿主，加载 DSH 的 Web UI            │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP (127.0.0.1，随机端口)
┌───────────────────────▼─────────────────────────────────────┐
│  DSH 进程（node --profile nt-dpet）                          │
│  ┌────────────────────────────────────────────────────┐      │
│  │ 插件树（Cordis，单进程，共享事件循环）                │      │
│  │  29 个包，按 7 组挂载                                │      │
│  └────────────────────────────────────────────────────┘      │
└───────┬──────────────────┬──────────────────┬───────────────┘
        │                  │                  │
   ┌────▼─────┐      ┌─────▼──────┐    ┌──────▼──────┐
   │ NapCat   │      │ adb server │    │ 声音服务     │
   │ (外部)   │      │ (外部)     │    │ (Python，可选)│
   └──────────┘      └────────────┘    └─────────────┘
```

### 3.1 「互不影响」的三级实现（决策 16）

| 级别 | 机制 | 防住什么 | 防不住什么 |
|---|---|---|---|
| **L1 逻辑隔离** | Cordis `inject` 依赖声明 + 可逆注册 | 依赖缺失 → 该包不启动，其他照跑 | 运行时错误 |
| **L2 错误边界** | 每包包裹 try/catch + `uncaughtException` 钩子 + 自动禁用 | 单包抛错 → 捕获后禁用该包 | 死循环、OOM、原生崩溃 |
| **L3 进程隔离** | 重包跑 `worker_threads` / `child_process` + IPC | 死循环、OOM、原生崩溃 | —（有通信开销） |

**分配方案** `[设计]`：

| 级别 | 包 |
|---|---|
| L1 | `privacy`、`log-zh`、`ui` |
| L1+L2 | `emotion`、`memory`、`worldbook`、`rhythm`、`proactive`、`dialogue`、`persona`、`router`、7 个 adapter、`sticker`、`avatar`、`market`、`snapshot` |
| L1+L2+L3 | `tts`、`adb`、`browser`、`minecraft`、`gui-agent` |

L2 命中后：写 `plugin-failures.log`，禁用该包，UI 顶部显示一条中文提示「XX 功能已停止（原因：…），已自动隔离，其余功能不受影响」。

---

## 4. 插件清单（29 包 / 7 组，决策 15）

物理上 29 个独立包（真正互不影响），界面上只展示 7 个组（用户不需要知道里面有几个）。

### G1 内核（5）

| 包 | 职责 | 依赖服务 |
|---|---|---|
| `@nt-dpet/emotion` | 五维情感状态机、衰减、弥散 | `storage` |
| `@nt-dpet/memory` | 记忆双层存储、异步提炼、三层裁决检索 | `storage`、`llm` |
| `@nt-dpet/worldbook` | 六层世界书、token 预算、中文关键词触发 | `memory` |
| `@nt-dpet/rhythm` | 分条、停顿、深夜变慢 | — |
| `@nt-dpet/proactive` | 主动消息三重闸门 | `emotion`、`memory` |

### G2 对话（2）

| 包 | 职责 |
|---|---|
| `@nt-dpet/dialogue` | 轻量对话通道（不走 agent loop）、提示词组装 |
| `@nt-dpet/persona` | 人格包加载、变量替换、SillyTavern 角色卡导入 |

### G3 通道（8，决策 34）

| 包 | 职责 |
|---|---|
| `@nt-dpet/adapter-qq-official` | QQ 官方机器人（合规） |
| `@nt-dpet/adapter-qq-napcat` | QQ 个人号（灰色，默认关） |
| `@nt-dpet/adapter-feishu` | 飞书 |
| `@nt-dpet/adapter-dingtalk` | 钉钉 |
| `@nt-dpet/adapter-wecom` | 企业微信 |
| `@nt-dpet/adapter-telegram` | Telegram |
| `@nt-dpet/adapter-discord` | Discord |
| `@nt-dpet/router` | 唤醒判断、多会话排队、能力查询 |

### G4 表达（5）

| 包 | 职责 |
|---|---|
| `@nt-dpet/tts` | 三类适配器（云端 / RVC 本地 / 外部软件） |
| `@nt-dpet/sticker` | 表情包四套来源 |
| `@nt-dpet/avatar` | 立绘渲染（Live2D / 静态降级） |
| `@nt-dpet/pet` | 桌宠窗口（Electron 侧） |
| `@nt-dpet/expression-decide` | 四层闸门决策 |

### G5 行动（4，决策 45）

| 包 | 职责 |
|---|---|
| `@nt-dpet/adb` | 设备连接、截图、点击、输入 |
| `@nt-dpet/browser` | 浏览器自动化 |
| `@nt-dpet/minecraft` | Mineflayer 接入 |
| `@nt-dpet/gui-agent` | 通用决策环 + 三层安全网 |

### G6 系统（4）

| 包 | 职责 |
|---|---|
| `@nt-dpet/privacy` | 关闭日志上传、合规告知、风控三层提醒（决策 38、54、55） |
| `@nt-dpet/market` | 组合包管理、冲突检测、开发者模式（决策 58、59） |
| `@nt-dpet/snapshot` | 还原点分层快照（决策 60） |
| `@nt-dpet/log-zh` | 中文日志查看器（决策 66） |

### G7 界面（1）

| 包 | 职责 |
|---|---|
| `@nt-dpet/ui` | Web UI（三栏布局，见 §14） |

### 4.1 每个包的必备文件

缺一个就装不上——这是社区 1700+ 插件统计出的最高频失败：

```
packages/<name>/
├── package.json          # 必须含 dsh.bundle.patch + type: module + files 含 patch
├── cordis.patch.yml      # 用包名引用，不用路径
└── src/index.ts          # export name / export function apply(ctx)
```

`package.json` 关键字段 `[已核实]`：

```json
{
  "name": "@nt-dpet/emotion",
  "type": "module",
  "main": "dist/index.js",
  "files": ["dist", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

### 4.2 三条硬约束

1. **ESM only**——`@deepseek-ai/*` 是 ESM，CommonJS 会报 `ERR_REQUIRE_ESM`
2. **必须声明 `inject`**——读未声明的服务会抛 `cannot get property "X" without inject`
3. **`loader entry id` 全项目唯一**——29 个包必须遵守命名规范 `nt-dpet:<组>:<名>`，例如 `nt-dpet:core:emotion`。`code-runtime` 由基础 bundle 持有，不得占用

---

## 5. 数据模型

### 5.1 实体关系

```
instance（实例：一个她）
  ├── channel_bindings[]   通道绑定（一个实例可接多个平台）
  ├── persona_id           当前人格包（可换，记忆与关系不随之清空）
  ├── emotion_state        全局情绪（mood / energy）
  ├── sessions[]           会话（c2c / group）
  │     └── session_key      c2c:<uid>  或  group:<gid>
  ├── participants[]       会话里出现过的每个人
  │     └── relationship    （instance × participant）四维关系
  └── memory_raw[] / memory_fact[]   记忆双层
```

### 5.2 隔离键（决策 26）

| 维度 | 隔离键 | 依据 |
|---|---|---|
| 记忆 | `(instance_id, session_key)` | 私聊按 QQ 号、群聊按群号分 |
| 关系 | `(instance_id, participant_id)` | 对每个人关系不同 |
| 情绪 | `instance_id`（全局一份） | 她是一个人，此刻只有一个心情（决策 18） |
| 人格 | `instance_id → persona_id` | 换人格不清空记忆与关系（决策 33 相关） |

`session_key` 构造：

```
私聊：c2c:<platform_uid>      例：c2c:10001
群聊：group:<platform_gid>    例：group:887766
```

**效果**：

- A 在群里对她说的话 → 归到 `group:887766`，同群 B 问起时可提（同群共享）
- A 私聊的话 → 归到 `c2c:10001`，不会出现在群里（跨会话不串）
- A 群的事不会带到 B 群

### 5.3 表结构

```sql
CREATE TABLE instance (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  persona_id    TEXT NOT NULL,
  config_json   TEXT NOT NULL DEFAULT '{}',
  created_at    INTEGER NOT NULL
);

CREATE TABLE channel_binding (
  id            TEXT PRIMARY KEY,
  instance_id   TEXT NOT NULL REFERENCES instance(id),
  platform      TEXT NOT NULL,        -- qq-official | qq-napcat | feishu | dingtalk | wecom | telegram | discord
  mode          TEXT NOT NULL,        -- official | personal
  credentials   BLOB,                 -- 加密，密钥在系统密钥链
  status        TEXT NOT NULL,        -- active | expired | risk
  last_checked  INTEGER
);

CREATE TABLE session (
  id            TEXT PRIMARY KEY,
  instance_id   TEXT NOT NULL REFERENCES instance(id),
  session_key   TEXT NOT NULL,
  session_type  TEXT NOT NULL,        -- c2c | group
  display_name  TEXT,
  created_at    INTEGER NOT NULL,
  UNIQUE(instance_id, session_key)
);

CREATE TABLE participant (
  id            TEXT PRIMARY KEY,
  instance_id   TEXT NOT NULL REFERENCES instance(id),
  platform_uid  TEXT NOT NULL,
  display_name  TEXT,
  is_friend     INTEGER NOT NULL DEFAULT 0,
  first_seen    INTEGER NOT NULL,
  last_seen     INTEGER,
  UNIQUE(instance_id, platform_uid)
);

CREATE TABLE relationship (
  instance_id     TEXT NOT NULL REFERENCES instance(id),
  participant_id  TEXT NOT NULL REFERENCES participant(id),
  affection       REAL NOT NULL DEFAULT 0.1,   -- 好感（决策 72）
  trust           REAL NOT NULL DEFAULT 0.1,   -- 信任（慢涨快跌）
  intimacy        REAL NOT NULL DEFAULT 0.0,   -- 亲密
  familiarity     REAL NOT NULL DEFAULT 0.0,   -- 熟悉度（决定注入多少画像）
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (instance_id, participant_id)
);

CREATE TABLE emotion_state (
  instance_id   TEXT PRIMARY KEY REFERENCES instance(id),
  mood          REAL NOT NULL DEFAULT 0.5,
  energy        REAL NOT NULL DEFAULT 0.7,
  persona_id    TEXT NOT NULL,        -- 记录产生这份情绪的人格，仅用于排查（决策 69）
  updated_at    INTEGER NOT NULL
);

-- 原文层（只记对她说的话 + 她的回复，决策 25）
CREATE TABLE memory_raw (
  id            TEXT PRIMARY KEY,
  instance_id   TEXT NOT NULL,
  session_key   TEXT NOT NULL,
  speaker_id    TEXT,                 -- participant.id，她自己为 NULL
  role          TEXT NOT NULL,        -- user | assistant
  content       TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  extracted     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_raw_lookup ON memory_raw(instance_id, session_key, created_at DESC);

-- 事实层（异步提炼）
CREATE TABLE memory_fact (
  id               TEXT PRIMARY KEY,
  instance_id      TEXT NOT NULL,
  session_key      TEXT NOT NULL,
  subject_id       TEXT,
  predicate        TEXT NOT NULL,
  object           TEXT,
  confidence       REAL NOT NULL DEFAULT 0.7,
  importance       REAL NOT NULL DEFAULT 0.5,
  source_raw_id    TEXT REFERENCES memory_raw(id),
  created_at       INTEGER NOT NULL,
  superseded_by    TEXT,
  manually_edited  INTEGER NOT NULL DEFAULT 0,   -- 用户改过的，提炼任务不得覆盖（决策 24）
  deleted_at       INTEGER
);
CREATE INDEX idx_fact_lookup ON memory_fact(instance_id, session_key, superseded_by);
```

---

## 6. 记忆系统

### 6.1 双层结构（决策 22）

| 层 | 存什么 | 谁写 | 何时写 |
|---|---|---|---|
| 原文层 | 对她说的话 + 她的回复，逐条原样 | `dialogue` 同步写 | 每轮 |
| 事实层 | 提炼后的一句话事实 | `memory` 异步任务 | 每轮结束后 5 秒内 |

**异步提炼是硬要求**：同步提炼会让每句话多一次模型调用，延迟翻倍。正确顺序是——先回用户，再提炼。

### 6.2 衰减由用户决定（决策 23）

四档预设，默认「标准」：

| 档位 | 行为 |
|---|---|
| 不衰减 | 永不淘汰，只靠排序裁剪 |
| 缓慢 | 半衰期 30 天 |
| 标准（默认） | 半衰期 7 天 |
| 快速 | 半衰期 2 天 |

**不衰减档下的检索**：没有淘汰依据，只能靠排序。所以必须有 §6.3 的三层裁决，否则「去年的喜欢」和「今天的讨厌」会同时注入。

上下文长度同样可调，但**跟随模型能力校验**：手动指定的 token 数超过模型窗口的 70% 时，UI 拒绝并提示实际可用值。

### 6.3 三层裁决（决策 73、77）

```
第一层 召回：双路并行
            路径 A 关键词倒排（中文分词后召回前 50）
            路径 B 向量检索（sqlite-vec，可用时）
            融合用 RRF（Reciprocal Rank Fusion）
            ← 向量不可用时自动退化为单路，不阻塞

第二层 排序：score = 语义相似 × 0.40
                    + 时间新近 × 0.40
                    + 重要度   × 0.20

第三层 冲突：同一 (subject, predicate) 多条时，
            只注入 created_at 最新的一条，
            其余标记 superseded_by，不参与注入

截断：按 score 降序填充，到预算为止
```

**双路混合必须有退化路径**（决策 77）：`sqlite-vec` 是 C 扩展，Node 绑定成熟度待验证。代码必须写成「向量可用则融合，不可用则纯关键词」，不得硬依赖。

**冲突裁决必须单列**：语义相似度无法分辨「去年说喜欢猫」和「今天说讨厌猫」，两条都会高分召回。不裁决就会把矛盾信息同时塞进上下文。

### 6.4 用户可编辑（决策 24）

| 操作 | 实现 |
|---|---|
| 浏览事实层 | 按会话分组，显示时间、来源原句 |
| 编辑 | 改写 `predicate` / `object`，置 `manually_edited=1` |
| 删除 | 软删除（写 `deleted_at`），检索时排除 |
| 手动添加 | 新建 fact，`source_raw_id` 为 NULL，`manually_edited=1` |
| 查看原文 | 由 `source_raw_id` 反查 |

**`manually_edited=1` 的记录，后台提炼任务永不覆盖。** 这是 §1.8 在记忆层的落地。

### 6.5 世界书 token 在多人场景的分配

NT-Sine 原设计中 L2 用户画像占 180 token 且 `always: true`。群里 10 人 = 1800 token，直接超总预算。

**注意力分层** `[设计，阈值 0.7 / 0.3 为初始值，实测调]`：

| 关系距离（按 familiarity） | 注入内容 | 预算 |
|---|---|---|
| 亲密 `≥ 0.7` | 完整画像 + 相关记忆 | ≤ 180 token |
| 认识 `0.3 ~ 0.7` | 一行摘要（名字 + 一两个特征） | ≤ 30 token |
| 陌生 `< 0.3` | 只有名字 + 当前这句话 | 0 |

分配算法：

```
1. 当前说话人 → 必给完整画像（无论 familiarity）
2. 其余在场者按 familiarity 降序
3. 从 L2 剩余额度依次分配，给完为止
4. 额度耗尽 → 后续一律按「陌生」处理
```

**副产品**：天然解决「她对每个人都一样热情」——对陌生人的信息量本来就不够支撑热情。

### 6.6 世界书六层（沿用 NT-Sine，不可突破）

| 层 | 内容 | 预算 |
|---|---|---|
| L1 | 角色锚点 | 350 |
| L2 | 用户画像 | 180（按 §6.5 动态分配） |
| L3 | 情感状态 | 100 |
| L4 | 记忆事件 | 500 |
| L5 | 当前场景 | 200 |
| L6 | 边界规则 | 150 |
| 合计 | | 1480，硬顶 1600 |

三条继承约束：

1. **中文必须关闭「匹配完整单词」**——引擎层强制，条目不可覆盖
2. 仅 L4 可递归，最大递归步骤 3
3. L4 场景卡互斥，同刻只留优先级最高的一张（防串味）

---

## 7. 情感系统

### 7.1 五维与归属（决策 18）

| 维度 | 归属 | 含义 | 默认（决策 72） |
|---|---|---|---|
| `mood` | 实例全局 | 此刻心情 | 0.5 |
| `energy` | 实例全局 | 此刻精力 | 0.7 |
| `affection` | 按人 | 对某人的好感 | 0.1 |
| `trust` | 按人 | 对某人的信任（慢涨快跌） | 0.1 |
| `intimacy` | 按人 | 与某人的亲密 | 0.0 |
| `familiarity` | 按人 | 熟悉度（决定注入多少画像） | 0.0 |

「略有好感」的含义：初见时有一点点好感但不亲近，既不冷淡也不自来熟，感情从零开始累积。

### 7.2 回归曲线（决策 19）

默认指数回归，四档预设：

```
mood(t) = baseline + (mood₀ - baseline) × exp(-λ·t)
λ = ln(2) / 半衰期
```

| 档位 | 半衰期 |
|---|---|
| 快速 | 1 小时 |
| 标准（默认） | 4 小时 |
| 缓慢 | 12 小时 |
| 不回归 | ∞ |

「几小时到半天」对应「快速 / 标准 / 缓慢」三档，默认标准。

### 7.3 弥散（决策 20）

```
对 B 的态度偏移 = (mood - baseline) × 弥散系数 × (1 - 关系距离系数)
  弥散系数默认 0.4（初始值，实测调）
  关系距离系数 = familiarity × 0.5
    → 越熟，越能分辨「这不是你的错」，受牵连越少
```

反直觉但正确的效果：**陌生人反而更容易被殃及**。因为不熟的人，她没理由为他区分。

### 7.4 换人格时的状态处理（决策 69）

| 状态 | 处理 | 依据 |
|---|---|---|
| 记忆（双层） | **保留** | 记忆绑人，人格是外壳 |
| 关系（四维） | **保留** | 主人选「关系也保留」 |
| 情绪（mood / energy） | **保留**（决策 69） | 主人选「保留」 |

全部保留意味着**人格包是「皮肤」而不是「另一个角色」**。

| 好处 | 代价 |
|---|---|
| 换人格不丢任何情感积累，用户敢随便切 | 人格包市场是皮肤市场，不是「养成新角色」市场 |
| 数据模型简单（全部挂 instance） | 想体验「全新的她」，只能新建实例（独立库，决策 61） |

`emotion_state.persona_id` 字段保留但不再用于重置判断，只作为「这份情绪由哪个人格产生」的记录，便于排查。

### 7.5 可见与可调（决策 21）

UI 提供：

- 五维数值可视化（条形图 + 文字描述双呈现，如「心情不错」+ 0.62）
- 手动调整（滑块）
- 一键重置
- 近 7 天历史曲线

放在设置「高级」区；简单模式只显示文字描述。

### 7.6 落盘策略 `[设计]`

```
内存中维护当前值 → 每 60 秒批量落盘
               → 进程退出时强制落盘
               → 关系跨阈值时立即落盘
```

崩溃最多丢失 60 秒的情绪变化，可接受。

---

## 8. 人格系统

### 8.1 默认人格（决策 28-31）

| 项 | 值 |
|---|---|
| 名字 | **小鲸鱼**（用户可自定义，决策 29） |
| 物种设定 | 猫娘 |
| 称呼用户 | **主人**（决策 30） |
| 猫娘浓度 | **可调三档**：清淡 / 标准 / 浓（决策 31） |
| 关系定位 | **四选一**：妹妹 / 伴侣 / 朋友 / 助手（决策 32） |

「一只猫娘叫小鲸鱼」这个反差本身是记忆点，不需要解释成某种设定——它就是个可爱的名字。

### 8.2 人格包必须支持变量

「关系初始可选」意味着人格包不能是死的一份：

```yaml
# personas/xiaojingyu/persona.yaml
identity:
  name: 小鲸鱼
  species: 猫娘
  addressUser: 主人          # 用户可改
relationship:
  type: ${userChoice}        # 妹妹 | 伴侣 | 朋友 | 助手
catgirl:
  intensity: ${userChoice}   # light | normal | heavy
```

`l1_anchor.json` 里涉及关系措辞的段落，按 `relationship.type` 分支选取。

**决策 71 定的是「四套不同性格」，不是同一性格改亲密度。** 也就是四种关系是四个不同的性格内核：

| 关系 | 性格内核 | 行为特征 |
|---|---|---|
| 妹妹 | 依赖、撒娇、会闹小脾气 | 主动索取关注，闹完会自己回来 |
| 伴侣 | 亲密、有占有欲、在意回应 | 会问「你今天怎么这么晚」，会在意冷淡 |
| 朋友 | 平等、会吐槽、不多黏 | 不主动索取，聊得来就聊，聊不来就散 |
| 助手 | 恭谨、可靠、偏正式 | 不撒娇、少情绪表达、以完成事情为先 |

这意味着 `personas/xiaojingyu/variants/` 下要有**四份完整的 L1 文件**（各约 350 token），人格包升级时四份同步改。这是四倍的内容维护量，不是技术成本。

四份 L1 文本属撰写任务，需按上表性格内核逐份写，不在本文档范围内。

### 8.3 猫娘浓度的三档语义（决策 70）

| 档位 | 表现 | 参数方向 |
|---|---|---|
| 清淡 | 平时像普通女孩，只在撒娇、惊讶、开心时带「喵」 | 语气词频率低，无猫拟态动作描述 |
| 标准（默认） | 常用「喵」，有轻微猫习惯（耳朵、尾巴的反应） | 频率中等，少量拟态 |
| 浓 | 高频语气词，明显的猫行为与拟态描述 | 频率高，拟态密集 |

语义方向已定，具体参数（语气词出现频率、拟态密度）需实测调。

### 8.4 人格包升级（决策 33）

**只补不改**：升级只写新增字段，已有字段一律不动。

```
升级流程：
1. 读旧人格包
2. 读新人格包 schema
3. 只把「旧包里不存在的字段」补进去
4. 用户改过的字段 → 完全跳过
5. 备份旧包到 snapshots/
```

### 8.5 导入外部角色卡

支持 SillyTavern 角色卡（V2 spec，PNG 内嵌 JSON 或独立 JSON），转换时做字段映射：

| 角色卡字段 | 映射到 |
|---|---|
| `name` | `identity.name` |
| `description` | L1 角色锚点 |
| `personality` | L1 角色锚点 |
| `scenario` | L5 当前场景 |
| `first_mes` | 开场白 |
| `mes_example` | **默认不导入**（会大幅吃掉上下文预算） |
| `system_prompt` / `post_history_instructions` | L6 边界规则（需人工复核） |

导入后必须让用户确认三件事：名字、关系定位、猫娘浓度（外部角色卡通常不是猫娘）。

---

## 9. 表达决策：四层闸门（决策 41）

语音的代价是硬的：合成 2-5 秒 + 上传 1-3 秒，纯文本 1 秒就出。群里每条都发语音，十分钟内被踢。

### 9.1 闸门逻辑（决策 75）

```
① 情绪强度     |mood - baseline| > 0.4
② 句子长度     6 ≤ 字数 ≤ 30
③ 人设权重     人格包 speechPreference > 0.3
④ 通道闸门     支持语音 + 未超频次（群聊 ≤ 3 条/小时）

四条全满足 → 发语音
任一不满足 → 发文本（不报错、不提示）
```

情绪阈值 0.4 的语义：**明显波动时才发语音**——开心或低落都算，平静时不发。这样语音条是「有分量」的，不是日常。

其余参数（句子长度范围、人设权重阈值、频次上限）为初始值，实测调。

另一条约束：**连续 3 条不得使用同一种形式**（防单调）。

### 9.2 智能判断不等于让模型随便决定

四个闸门都是可计算的状态量，不是随机数。模型可在通过闸门的候选集里给偏好权重，但**通道能力是硬约束，模型无权越过**。

### 9.3 静默降级链

```
语音路径失败 → 发文本 → 文本也失败 → 记日志，不重试（避免刷屏）
```

用户只会看到一条文本消息，看不到任何错误提示。

---

## 10. 通道层

### 10.1 双轨策略（决策 34）

| | 官方机器人 | 个人号（NapCat） |
|---|---|---|
| 身份 | 独立 BOT 应用，合法 | 你的 QQ 号 |
| 封号风险 | **零** | 高 |
| 接入 | 开放平台申请 + 审核 | 扫码登录 |
| 收消息 | 全部 / @最近10条 / 仅@（群主设置） | 全部 |
| 被动回复 | 群聊 5 分钟 / **5 次**；单聊 60 分钟 / 4 次 | 无限制 |
| 主动消息 | 需群主手动开；认证 60 qpm / 未认证 30 qpm | 无限制（风险高） |
| AI 标识 | **BOT 身份自带标识** | 无 |

**这条差异顺手解决一个死结**：走官方机器人，BOT 身份本身就是 AI 标识，既不用加后缀，也不违反《人工智能生成合成内容标识办法》。这是唯一两全的走法。

### 10.2 官方通道硬限制与对策

| 限制 | 后果 | 对策 |
|---|---|---|
| 群聊每条最多回 5 次 | 分条 5 条用满，第 6 条发不出 | **分条上限 4 条**，留 1 次给纠错（决策 39） |
| 被动回复窗口 5 分钟 | 超时无法被动回复 | 长任务改主动消息 + 频控 |
| 主动消息需群主授权 | 「她主动找你」不可靠 | UI 明示，不做承诺 |
| 富媒体需先上传拿 `file_info` | 语音多两步，且有 ttl | 上传缓存 + 失败降级文本 |
| 单聊/群聊上传接口不互通 | 同一段语音传两次 | 按 session_type 分别缓存 |

### 10.3 分条上限（决策 39）

| 通道 | 上限 |
|---|---|
| 官方 QQ 群聊 | **4 条**（硬限制 5 次，留 1 次余量） |
| 官方 QQ 单聊 | 4 条（同源限制） |
| NapCat 个人号 | 不限制 |
| 飞书 / 钉钉 / 企微 / TG / DC | 不限制 |

实现上读 `capabilities.maxReplyCount`，不写死常量。

### 10.4 适配器接口

```ts
export interface InboundMessage {
  id: string
  instanceId: string
  platform: Platform
  sessionKey: string
  sessionType: 'c2c' | 'group'
  sender: { uid: string; name: string; isFriend: boolean }
  parts: MessagePart[]
  timestamp: number
  isMentioned: boolean
  trigger: 'at' | 'keyword' | 'probability' | 'private'
  quote?: { messageId: string; content: string }
  raw: unknown
}

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'image'; url?: string; data?: Buffer }
  | { type: 'audio'; url?: string; data?: Buffer; duration?: number }
  | { type: 'file'; name: string; data: Buffer }

export interface OutboundMessage {
  sessionKey: string
  parts: MessagePart[]
  replyTo?: string
  seq?: number
}

export interface ChannelCapabilities {
  audio: boolean
  image: boolean
  file: boolean
  markdown: boolean
  maxReplyCount: number       // 0 表示不限
  replyWindowMs: number
  activeMessageAllowed: boolean
}

export interface ChannelAdapter {
  readonly platform: Platform
  readonly capabilities: ChannelCapabilities
  start(): Promise<void>
  stop(): Promise<void>
  send(msg: OutboundMessage): Promise<{ id?: string }>
  onMessage(handler: (msg: InboundMessage) => void): () => void
}
```

`capabilities` 必须运行时读取，不是写死常量。表达层决策时先查这张表，不支持的形式直接剔除候选。

### 10.5 唤醒判断（决策 35、36、74）

```
优先级：
1. 私聊消息                         → 必回
2. 被 @                              → 必回
3. 命中关键词（名字 / 人格包关键词表） → 必回
4. 概率命中（默认 10%，可调）         → 回
5. 其余                              → 不回，但记入上下文（不提炼事实）

额外闸门：
- 非好友私聊 → 不回（决策 36）
- 同一句话已回复过 → 不回
- 距上次发言过近 → 概率降半（防刷屏）
```

10% 的含义：十条无关消息里大概接一句。有存在感，不至于刷屏。活跃群里想更低调可以调到 5%，想更活跃调到 20%，也可以直接关掉随机开口（只回 @ 和关键词）。

### 10.6 多会话并发（决策 37）

```
消息进入队列 → 按到达时间排序
→ 逐个处理，每个会话内保持节奏层分条
→ 跨会话不并行
```

不并行的理由：人不能同时说两句话。并行响应会让两个群的回复同时到达，明显不像人，也更容易触发风控。

**代价**：五个群同时叫她，最后一个会等较久。这是刻意的取舍。

### 10.7 风控提醒三层（决策 38）

| 层 | 时机 | 形式 | 要求 |
|---|---|---|---|
| 一 | 首次绑定个人号 | 全屏确认页 | **不可跳过**，必须勾选。文案写明：可能永久封号、可能波及群聊、可能牵连关联账号 |
| 二 | 通道列表页 | 常驻色标 | 官方绿标，个人号橙标 + 一行说明 |
| 三 | 运行中 | 顶部横幅 | 发送失败率 > 20%、被限流、被踢群时主动弹出，建议暂停 |

必须包含一句：**「本软件无法保证账号安全，风险由使用者自行承担。」**

---

## 11. 表达层

### 11.1 TTS 三类适配器（决策 42）

```ts
export interface TtsProvider {
  readonly id: string
  readonly label: string
  synthesize(req: {
    text: string
    voiceId: string
    speed?: number
    emotion?: string
  }): Promise<{ audio: Buffer; format: 'wav' | 'mp3' | 'silk' | 'amr'; durationMs: number }>
  listVoices(): Promise<{ id: string; name: string; gender?: string }[]>
  healthCheck(): Promise<boolean>
}
```

| 文件 | 类型 |
|---|---|
| `tts/cloud.ts` | 云端 API，各家签名不同，用子类覆盖 |
| `tts/rvc-local.ts` | 本地 Python 子进程，HTTP 交互，崩溃不影响主进程 |
| `tts/external.ts` | 外部软件桥接，用户填自定义 HTTP 端点，按 OpenAI `/v1/audio/speech` 形态对接 |

**默认策略**：云端优先，开箱能出声；未配置 Key 时提示三条路，不阻塞主流程。

### 11.2 表情包四套来源（决策 43）

| 来源 | 实现 | 优先级 |
|---|---|---|
| 内置基础库 | 随包分发，无版权或已授权素材 | 高 |
| 模板合成 | `sharp` + SVG 模板 + 文字排版 | 中 |
| 用户上传 | 本地目录，去重 + 尺寸归一化 | 中 |
| AI 生成 | 可选，需用户自备 Key | 低（默认关） |

选择逻辑：按情绪标签 + 关键词匹配，从四路候选中按优先级取第一个可用项；全不可用则不发图（静默降级）。

### 11.3 立绘与桌宠（决策 44）

- 渲染：`pixi-live2d-display` + PixiJS（均 MIT）
- **Cubism Core 不可随包分发**（专有软件）→ 首次使用时弹协议，用户确认后从官网下载到 `runtime/live2d/`
- 未获取 Core 时降级为静态立绘（PNG + CSS 动画）
- 桌宠**首次询问**是否启动，记住了选择

桌宠状态由情绪驱动，不是随机数 `[设计]`：

| 情绪条件 | 表现 |
|---|---|
| `energy < 0.2` | 打哈欠 / 睡着 |
| `mood > 0.7` + 短句 | 比心 / 欢呼 |
| 被快速点击 3 次 | 生气（情绪实际下降） |
| 长时间无交互 | 自主活动（对应主动消息闸门） |
| 说话时 | 口型与 TTS 音频时长对齐 |

---

## 12. 行动层

### 12.1 定位（决策 45、46）

**不预设游戏，做通用 GUI Agent 循环**，入口在**普通设置里**，但开启时需过实验性警告。

```ts
export interface AdapterTtsConfig {
  providerId: string
  voiceId: string
}
```

### 12.2 循环结构

```
观察（截图） → 理解（视觉模型） → 决策 → 执行（adb） → 校验（截图比对）
     ↑                                                      │
     └──────────────── 未达成目标则继续 ←────────────────────┘
```

每轮成本 `[推测，按各环节常规耗时叠加]`：截图 1-3 秒 + 推理 1-3 秒 + 执行 0.5 秒 = **3-7 秒/步**。

### 12.3 三种失败模式与对策

| 失败 | 表现 | 对策 |
|---|---|---|
| 识别错 | 点错按钮，进入无关页面 | 每步后校验界面特征，不符即回退 |
| 状态迷失 | 不知道自己在哪一层界面 | 维护界面栈，支持「返回上一级」 |
| 死循环 | 反复点同一位置无变化 | 相同动作 3 次无变化即中止 |

### 12.4 三层安全网（不可关闭）

| 层 | 机制 |
|---|---|
| 危险区域黑名单 | 识别到支付、密码、人脸、系统设置界面 → 立即停止并通知 |
| App 白名单 | 用户手动添加（决策 48），默认一个都不授权 |
| 动作确认阈值 | 按钮含「确认/购买/提交/支付」→ 一律不自动点 |

**这三条不做，功能不能上线。** 这是这类 Agent 最常见的翻车方式。

### 12.5 多设备支持（决策 47）

三者在 adb 层统一，差异只在连接方式：

| 设备 | 连接 | 特殊处理 |
|---|---|---|
| 备用机 | USB / WiFi adb | 保持常亮、关闭锁屏 |
| 主力机 | WiFi adb | 检测断开时暂停任务，不重试 |
| 模拟器 | `localhost:5555` | 检测模拟器特征，游戏场景提示风控风险 |

### 12.6 行动播报（决策 49）

**偶尔提一嘴、偶尔报备**，不逐步播报。实现：按概率触发（初始 30%），说「等我一下」「我去看看」这类模糊表述，不暴露具体操作细节。

---

## 13. 市场、配置与还原点

### 13.1 组合包格式（决策 5、78）

一个条目 = 一组插件 + 一份配置 + 一套人格包。采用**完整集字段**。

```yaml
# bundles/starter/bundle.yaml
# ── 基础标识 ─────────────────────────────
name: nt-dpet-starter
displayName: 开箱即用
version: 1.0.0
description: 官方 QQ 机器人 + 语音 + 默认人格，装完即可对话
changelog:
  1.0.0: 首个可用版本
  0.9.0: 内测

# ── 归属与展示 ───────────────────────────
author:
  name: Ntarstudio
  url: https://github.com/ntars
license: AGPL-3.0
icon: ./assets/icon.png
screenshots:
  - ./assets/shot-chat.png
  - ./assets/shot-panel.png
category: companion          # companion | channel | voice | action | theme
tags: [默认, 新手, 官方]

# ── 组成 ─────────────────────────────────
persona: xiaojingyu
plugins:
  - package: "@nt-dpet/privacy"
    version: "^0.1.0"
  - package: "@nt-dpet/emotion"
    version: "^0.1.0"
  - package: "@nt-dpet/memory"
    version: "^0.1.0"
  # … 其余按组列出

config:
  memory:
    decay: standard
    contextBudget: auto
  emotion:
    halfLifeHours: 4
    dispersion: 0.4
  router:
    wakeProbability: 0.1
  tts:
    enabled: true
    provider: cloud

# ── 权限声明 ─────────────────────────────
permissions:
  network: true              # 会联网（模型 API）
  filesystem: workspace      # 只读写工作区
  process: false             # 不启动外部进程
  device: false              # 不碰 adb / 摄像头 / 麦克风
  networkDomains:            # 会连接哪些域名
    - api.deepseek.com
    - registry.npmmirror.com

# ── 兼容与冲突 ───────────────────────────
requires:
  dsh: ">=0.2.1-rc.2 <0.3.0"
conflicts:
  - "@nt-dpet/legacy-storage"

# ── 完整性 ───────────────────────────────
checksum:
  algorithm: sha256
  files:
    cordis.patch.yml: "<sha256>"
    bundle.yaml: "<sha256>"

# ── 扩展位（预留，永不移除）───────────────
custom: {}
```

**两条格式纪律**（决策 78 的代价约束）：

1. **字段只增不改名**——一旦对外发布，改名会破坏所有已发布组合包
2. **保留 `custom: {}` 扩展位**——第三方想加私有字段都往这里放，避免被迫改结构

`permissions` 是完整集里唯一的**功能项**（不只是展示）：安装时读取并向用户展示，与 §12.4 的 App 白名单、§16.3 的本地化清单共用一套语义。

### 13.2 冲突检测

安装前跑五道检查，任一失败即拒绝并给出中文原因：

| 检查 | 失败原因示例 |
|---|---|
| 包名重复挂载 | 「插件 X 已由组合包 Y 提供」 |
| `loader entry id` 冲突 | 「id `nt-dpet:core:emotion` 重复」 |
| `conflicts` 命中 | 「与已装的 X 不兼容」 |
| DSH 版本超区间 | 「当前 DSH 0.3.0 超出支持范围」 |
| 原生依赖需构建 | 「插件 X 含原生模块，需开启构建脚本」 |

### 13.3 配置分层覆盖（决策 57）

```
优先级（后者覆盖前者）：
1. 插件自带默认配置
2. 组合包注入的 config
3. profile 的 cordis.patch.yml（用户改过的）
4. $DSH_HOME/cordis.patch.yml（全局）
```

**更新只重写 1、2 层，永不触碰 3、4 层。**

一个必须注意的坑 `[已核实]`：DSH 的 patch 是**整行替换，不是深合并**。覆盖某行时必须把该行需要的所有键写全，只写改动的键会丢掉其余。所以生成第 2 层要做「读-合并-写全」。

### 13.4 还原点（决策 60）

用户要求「全量快照 + 每次装插件前自动 + 可配数量与大小」。

**真全量不可行**：一次约 8-12 GB（含 node_modules 与模型权重），装十个插件 = 80-120 GB。

**分层 + 写时复制** `[设计]`：

| 内容 | 策略 | 单次增量 |
|---|---|---|
| profile 配置 | 真拷贝 | 几 KB |
| 用户数据（SQLite） | 真拷贝（先 checkpoint） | 几十 MB |
| `node_modules` | **只写硬链接清单**（pnpm store 内容寻址） | 接近 0 |
| 模型权重 | 按内容哈希引用，只备份一次 | 0（首次除外） |

写时复制依赖系统能力：

| 系统 | 机制 |
|---|---|
| macOS | APFS `clonefile`（`cp -c`） |
| Linux | `cp --reflink`（需 btrfs / xfs） |
| Windows | NTFS 硬链接（`mklink /H`） |

**结果**：每个还原点实际增量 ≤ 50 MB。

```
~/.nt-dpet/snapshots/
└── 20261022-211045-add-@nt-dpet-tts/
    ├── meta.json            # 时间、触发原因、DSH 版本、插件清单
    ├── config/
    ├── data/
    └── node_modules.links
```

**保留策略**（决策 76）：默认 3 个，约 150 MB。三种策略用户可选：

| 策略 | 行为 |
|---|---|
| 按数量（默认） | 超过 N 个从最旧的删，默认 N = 3 |
| 按总大小 | 超过阈值从最旧的删，默认 2 GB |
| 关闭 | 不自动清理，满了提醒手动删 |

UI 显示当前总占用、每个还原点的大小与创建时间。

### 13.5 开发者模式（决策 58、59）

**一个总开关全放开**，加两条保护：

| 措施 | 具体 |
|---|---|
| **强制还原点** | 打开瞬间自动建快照（配置 + 用户数据 + 依赖清单），不可取消、不可跳过 |
| **构建脚本审计** | 记录每次 `postinstall`：包名、命令原文、时间、退出码、输出摘要，写入 `~/.nt-dpet/audit/scripts.log`，设置里可查可导出 |

打开时的警告文案：

> 开发者模式会允许：
> 1. 从本地目录安装插件
> 2. 从 GitHub 直接安装
> 3. 执行插件自带的构建脚本（**等于允许任意代码在你的电脑上运行**）
>
> 建议仅在你信任插件作者时使用。已自动创建还原点。

---

## 14. 界面规范（决策 63、64）

### 14.1 布局：与 DSH 一致，内容换掉

DSH 原生布局 `[已核实]`：左侧会话列表+工作区，中间对话区（默认显示代码日志），右侧产物预览，底部状态栏显示 TPS/权限等级。

**NT-Dpet 的布局**：

```
┌────────────┬───────────────────────┬──────────────┐
│ 左栏        │ 中间                   │ 右侧          │
│            │                        │              │
│ [对话|工作] │ 对话模式 → 和她聊天      │ 她的状态      │
│   ↑切换     │ 工作模式 → 代码日志/工具 │ 情绪五维       │
│            │                        │ 关系           │
│ 会话列表    │  ← 默认切到「对话」      │ 最近记忆       │
│ 按 QQ/群号  │                        │              │
└────────────┴───────────────────────┴──────────────┘
```

| 位置 | DSH 原样 | NT-Dpet |
|---|---|---|
| 左栏 | 会话列表 + 工作区 | 会话列表（按 QQ 号 / 群号分）+ 对话/工作切换 |
| 中间 | 代码日志（默认） | **对话（默认）** / 代码日志（切到工作模式） |
| 右侧 | 产物预览 | **她的状态面板**（决策 64） |
| 底部 | TPS / 权限等级 | 情绪文字描述 + 通道连接状态 |

**安装器必须写入的配置项**（决策 12）：profile 默认视图 = 对话。否则用户装完看到一片日志，会以为装错了。

### 14.2 视觉规范（决策 62）

- 严格 Apple HIG：大留白、毛玻璃、系统字体、圆角卡片
- 字体单位**只用 px / rem，禁用 rpx**
- 深浅色跟随系统；系统未提供时按日出日落切换
- 曲线闭合、线条粗细一致、层级清晰

### 14.3 首次启动（决策 65）

四段递进，每段都可跳过：

```
① 导入角色      SillyTavern 角色卡 / NT-Dpet 人格包
② 预设人格      内置小鲸鱼（默认选中）
③ 创建人格      起名、选关系、选浓度、选声音
④ 其他配置      模型 Key、通道、备份
```

跳过 ①-③ 的用户直接落到预设人格，保证「装完就能聊」。

---

## 15. 安装器（决策 7、8）

Electron 主进程，与桌宠共用外壳。

### 15.1 启动流程

```
双击安装包
  ↓
① 环境探测      系统 / 架构 / 磁盘 / 已有 Node / 已有 DSH / 网络可达性
  ↓
② 组件下载      便携 Node（如需）/ DSH 锁定版 / 组合包依赖
  ↓              国内镜像优先，失败回退官方源（决策 10）
③ 完整性校验    SHA-256 分段校验，失败可续传
  ↓
④ 装配 profile  创建 $DSH_HOME/profiles/nt-dpet/
  ↓              写 cordis.patch.yml + dsh.profile.bundles
⑤ 装组合包      dsh plugin --profile nt-dpet add <bundle>
  ↓
⑥ 隐私加固      写入 session-log-deepseek: enabled=false（§16.1）
  ↓
⑦ 视图设定      默认视图 = 对话（§14.1）
  ↓
⑧ 首启引导      四段递进（§14.3）
  ↓
⑨ 拉起主进程    dsh --profile nt-dpet + 打开 Electron 窗口
```

### 15.2 下载源：自动检测 + 手动覆盖（决策 79）

**模式一：自动检测**

```
启动下载前
  ↓
并发探活候选源（HEAD 请求 + 1MB 测速）
  ↓
选最快且可用的一个作为主源，其余按速度排序为备选
  ↓
下载中失败 → 自动切下一个，不中断整体流程
  ↓
全部失败 → 提示用户走「手动覆盖」
```

候选源清单（域名可用性需实测后写入代码）：

| 用途 | 首选 | 备选 |
|---|---|---|
| npm 包 | `registry.npmmirror.com` | `registry.npmjs.org` |
| Node 二进制 | `npmmirror.com/mirrors/node` | `nodejs.org/dist` |
| 模型权重 | `hf-mirror.com` | `huggingface.co` |
| GitHub 直链 | `github.com` | 其他加速镜像（稳定性差，仅作兜底） |

**模式二：手动覆盖**

用户从 GitHub 手动下载安装包，安装器主动识别并提示：

```
扫描位置：
  ~/Downloads/*.dmg / *.exe / *.AppImage / *.zip
  用户指定的任意目录

检测到同名安装包时：
  弹窗「发现本地安装包 nt-dpet-1.0.0.exe，是否使用它安装？」
  → 用户确认 → 校验 SHA-256（对照 GitHub Release 的 checksums 文件）
  → 校验通过 → 使用本地包，跳过下载
  → 校验失败 → 明确告知「文件可能损坏或被篡改」，拒绝使用
```

**为什么要有手动覆盖**：镜像源全部不通时（企业内网、极端网络环境），这是唯一出路。而手动下载的东西必须校验，否则等于给供应链攻击开后门。

### 15.3 必须守住两点

**DSH 版本锁定**（决策 11）`[已核实]`：`@deepseek-ai/*` 的 `latest` dist-tag 曾指向不可用的 `0.0.1-rc.x`，可用版本在 `next` tag。安装器必须：锁定明确可运行版本 → 安装后校验实际版本 → 不符则回滚。

**幂等性**：下载中断、磁盘满、杀软误杀、代理失败、镜像不通——每步都能重来且不留脏状态。

```
分段校验和 + 断点续传 + 失败回滚 + 多镜像源
```

### 15.4 三端差异

| | Windows | macOS | Linux |
|---|---|---|---|
| 安装包 | NSIS / Inno Setup | `.app` + dmg，需 codesign + 公证 | AppImage / deb |
| 运行时 | 便携 Node + VC++ 运行库 | 内置 Node | 内置 Node |
| 障碍 | 路径空格与中文、长路径 | Gatekeeper、ARM/x86 双架构 | glibc 版本、Wayland 权限 |
| GPU | CUDA | CPU（MPS 更慢） | ROCm / CPU |

---

## 16. 隐私与合规

### 16.1 关闭 DSH 会话日志上传（决策 54，最高优先级）

已核实事实 `[已核实，多来源交叉验证]`：

| 项 | 内容 |
|---|---|
| 上传什么 | `dsh_session_log`，含**消息全文、工具参数与结果、工作区路径** |
| 默认状态 | **默认开启**，随每次模型请求发出 |
| 不占 token | 不在 `messages` 里，不增加计费，但**不代表留在本机** |
| 遥测开关能关吗 | **不能**。`DSH_TELEMETRY_DISABLED=1` 下实测 3/3 请求仍携带 |
| 怎么才关得掉 | 对 `session-log-deepseek` 设 `enabled: false`，实测 0/3 |
| 最危险 | **关掉后再打开，会补传关闭期间累积的全部未确认事件** |

**处理**：

```yaml
# bundles/starter/cordis.patch.yml（安装器写入，UI 不提供开关）
- id: session-log-deepseek
  config:
    enabled: false
- id: plugin-package-inventory-deepseek
  config:
    enabled: false
```

同时启动 DSH 时注入 `DSH_TELEMETRY_DISABLED=1` 作为第二道防线。

`privacy` 包负责：启动时校验上述 row 确实为 `false`，被改动则**强制改回并提示**。这不是可选偏好，是产品底线。

### 16.2 AI 内容标识（决策 55）

**功能不代标。** 但首次启动有一次不可跳过的告知：

> 本软件的对话内容由人工智能生成。
> 若你在公开平台（群聊、社交平台等）使用本软件的输出，**依法你有义务对 AI 生成内容进行标识**。
> 详见《人工智能生成合成内容标识办法》（2025 年 9 月 1 日施行）。

**明确不做**：

- 不把「自动规避标识」做成功能
- 不做批量去标识工具
- 不在宣传中暗示可规避标识义务

**顺带的好处**：走官方机器人通道时，BOT 身份本身就是标识，义务天然满足（§10.1）。

### 16.3 数据本地化

| 数据 | 位置 | 联网 |
|---|---|---|
| 记忆 / 情感 / 关系 | 本地 SQLite | 否 |
| 人格包 | 本地文件 | 否 |
| 通道凭证 | 系统密钥链 | 否 |
| 备份 | 本地（可选网盘，可选加密） | 仅用户开启时 |
| 对话内容 | 本地 SQLite | **否**（§16.1） |

### 16.4 导出与卸载（决策 50-53）

| 场景 | 行为 |
|---|---|
| 导出 | JSON（完整可再导入）/ Markdown（可读）/ SillyTavern 兼容（**降级，丢情感与关系，UI 必须标注**） |
| 卸载 | 询问「保留数据 / 一并删除」，两项写明后果；同时提供「先导出」入口 |
| 备份加密 | 可选，标准 ZIP + AES-256 口令；提示「macOS 自带解压不支持 AES ZIP，请用 7-Zip 或 Keka」 |

---

## 17. 日志层（决策 66、83）

### 17.0 两层日志，两种读者

日志不是一层，是两层。合成一层的结果是普通用户看不懂、开发者查不到。

| 层 | 读者 | 内容 | 入口 |
|---|---|---|---|
| **中文概览** | 普通用户 | 已翻译的事件流，只说「发生了什么」 | 工作模式（默认） |
| **代码级** | 开发者 | 原始字段、原始 JSON、SQL、HTTP 报文、错误码、完整堆栈 | 工作模式的「代码级」页签，**需开发者模式** |

代码级日志的入口受开发者模式约束，因为里面会出现对话原文、账号 ID、请求头。开启时自动建还原点，与决策 59 一致。

### 17.1 中文概览层的四层映射

| 层 | 原文 | 中文呈现 |
|---|---|---|
| 事件类型 | `tool_call_start` | 开始调用工具 |
| 工具名 | `fs.readFile` | 读取文件 |
| 参数 | `{"path":"/a/b.txt"}` | 路径：/a/b.txt |
| 错误提示 | `ERR_REQUIRE_ESM` | 模块格式不兼容（CommonJS 不能被 ESM 引入） |

### 17.2 一条不可动的规则

**错误码与堆栈必须保留原文**，与中文解释并列：

```
[错误] 模块格式不兼容
  ERR_REQUIRE_ESM
  at Module._load (node:internal/modules/cjs/loader:1024:19)
```

理由：搜报错时英文原文才有结果。全译成中文等于断掉排查能力。

### 17.3 代码级层的格式

```
21:09:46.203  WARN   channel.send           retry=1 code=RETRY_AFTER_RATE_LIMIT
  HTTP 429 { "retry_after": 0.9, "limit": "group_msg_per_min", "remaining": 2 }
  // 退避 900ms 后重试，未消耗回复次数
```

四个固定列：毫秒级时间、级别（DEBUG / INFO / WARN / ERROR）、模块名、结构化消息。详情行可折叠。

代码级层里**只有我们自己的注释用中文**，字段名、错误码、JSON 键、堆栈一律保持原文——翻译它们等于让人没法搜索。

### 17.4 未知项处理

遇到未收录的 key，**原样显示英文并标注 `[未翻译]`**，不猜。

---

## 18. 目录结构

```
NT-Dpet/
├── package.json                  # pnpm workspace 根
├── pnpm-workspace.yaml
├── LICENSE                       # AGPL-3.0
├── README.md
├── docs/
│   ├── TECH-RESEARCH.md
│   ├── ARCHITECTURE.md           # 本文
│   └── DECISIONS.md
├── packages/
│   ├── emotion/                  # G1 内核
│   ├── memory/
│   ├── worldbook/
│   ├── rhythm/
│   ├── proactive/
│   ├── dialogue/                 # G2 对话
│   ├── persona/
│   ├── adapter-qq-official/      # G3 通道
│   ├── adapter-qq-napcat/
│   ├── adapter-feishu/
│   ├── adapter-dingtalk/
│   ├── adapter-wecom/
│   ├── adapter-telegram/
│   ├── adapter-discord/
│   ├── router/
│   ├── tts/                      # G4 表达
│   ├── sticker/
│   ├── avatar/
│   ├── pet/
│   ├── expression-decide/
│   ├── adb/                      # G5 行动
│   ├── browser/
│   ├── minecraft/
│   ├── gui-agent/
│   ├── privacy/                  # G6 系统
│   ├── market/
│   ├── snapshot/
│   ├── log-zh/
│   └── ui/                       # G7 界面
├── personas/
│   └── xiaojingyu/
│       ├── persona.yaml
│       ├── l1_anchor.json
│       ├── l2_user_profile.json
│       ├── l6_boundary.json
│       └── variants/             # 四种关系措辞
├── bundles/
│   └── starter/
│       ├── bundle.yaml
│       └── cordis.patch.yml
├── desktop/                      # Electron 壳
│   └── src/
│       ├── main.ts
│       ├── installer/
│       │   ├── detect.ts
│       │   ├── download.ts
│       │   ├── verify.ts
│       │   └── rollback.ts
│       ├── pet/
│       └── window/
└── runtime/                      # 下载的外部组件（.gitignore）
    ├── node/
    ├── voice/
    ├── live2d/
    └── models/
```

每个 `packages/<name>/` 内部结构同 §4.1。

---

## 19. 施工顺序（决策 67、68）

**先桌面能聊，再打通三端，然后填功能。** 风险前置。

| 阶段 | 内容 | 验收标准 | 预估 |
|---|---|---|---|
| **S0 骨架 + 最小可聊** | monorepo、必要包骨架、数据模型、世界书、情感、节奏、对话通道、Electron 空壳 | 桌面窗口打开，能和预设人格聊 20 轮；记忆跨轮生效；情绪会变；回复会分条 | 3 周 |
| **S1 三端打包** | 安装器 + Win/macOS/Linux 打包 + 版本锁定 + 镜像源 | 三端都能双击安装，装完能聊（S0 的能力） | 3 周 |
| **S2 单通道打通** | 官方 QQ 机器人适配器 + 唤醒路由 + 风控提醒 | 真实 QQ 群 @ 她能回；非 @ 按概率开口；绑定页有风险说明 | 2 周 |
| **S3 市场与还原点** | 组合包格式 + 冲突检测 + 分层快照 + 开发者模式 | 能装/卸组合包；装前自动建还原点；能回滚 | 2 周 |
| **S4 表达层** | TTS 三类 + 四层闸门 + 表情包四套 | 私聊时会转语音；失败静默退文本 | 2.5 周 |
| **S5 桌宠** | 透明窗口 + Live2D/静态 + 情绪驱动 | 首次询问后出现；energy 低时打哈欠 | 2 周 |
| **S6 行动层** | adb 决策环 + 三层安全网 + 三设备 | 让它打开一个 App 完成一步；进支付页立即停止 | 3 周 |
| **S7 其余通道** | 飞书 / 钉钉 / 企微 / TG / DC / NapCat | 每个通道能收能回 | 3 周 |

合计 **20.5 周（约 5 个月）单人全职** `[估算，不含上游变更导致的返工]`。

**依赖关系**：

```
S0 ──▶ S1 ──▶ S2 ──▶ S3
       │       │
       └──▶ S4 ─┴──▶ S5
              │
              └──▶ S6 ──▶ S7
```

S1 必须在 S0 完成后立刻做——打包风险最早暴露，改动成本最低。

---

## 20. 待验证清单

| # | 待验证 | 影响 | 验证方式 |
|---|---|---|---|
| 1 | DSH 的 `llm` seam 能否脱离 agent loop 单独调用 | **决定 §2.2 是否成立** | S0 写最小用例实测 |
| 2 | `node:sqlite` 在目标 Node 版本的稳定性 | 决定是否需 `better-sqlite3`（原生模块） | 三端读写压测 |
| 3 | `sqlite-vec` 的 Node 绑定能否稳定安装 | 决定双路混合里的向量路能否启用 | 装包实测；失败则退化为单路关键词 |
| 4 | 中文分词（纯 JS 精度 vs 原生编译麻烦） | 决定世界书关键词触发准确率 | 真实群聊语料对比 |
| 5 | 官方机器人语音消息格式要求（silk / amr / mp3） | 决定 TTS 是否需转码 | 实发测试 |
| 6 | 官方机器人 `file_info` 的 ttl 时长 | 决定语音缓存策略 | 实测 |
| 7 | Live2D Cubism Core 下载与商用条款 | 决定桌宠路线 | 查官方文档 |
| 8 | NapCat 当前版本对 OneBot 11/12 支持度 | 决定适配器版本 | 查仓库 release |
| 9 | Electron 三端体积与启动耗时 | 决定是否拆包 | 三端打包实测 |
| 10 | 硬链接快照在 Windows NTFS 的实际行为 | 决定还原点能否压到 50MB | 实测 |
| 11 | 29 个包的 `loader entry id` 是否会被 DSH 正确加载 | 决定包粒度是否可行 | S0 装全部包实测 |

---

## 21. 风险登记

| 风险 | 等级 | 说明 | 缓解 |
|---|---|---|---|
| **DSH preview 变更** | 高 | 官方明确「核心插件与 API 会继续演进」，0.1→0.2 已出现 dist-tag 陷阱 | 锁版本 + 插件层隔离 + 每版实测 |
| **账号封禁** | 高 | 个人号通道随时可能被风控 | 双轨策略，官方通道为默认推荐；三层风险提醒 |
| **隐私泄露（上游）** | 高 | DSH 默认上传会话日志，遥测开关关不掉 | §16.1 硬关 + 启动校验 + 环境变量兜底 |
| **许可污染** | 高 | NapCat 要求衍生授权；Cubism Core 专有 | 运行时下载 + 子进程调用 + 不修改不内置 |
| **通用 Agent 点错** | 高 | 可能误触支付或隐私操作 | 三层安全网 + 实验性定位 + 强警告 |
| **29 包装配复杂** | 中 | 依赖顺序、id 冲突、装机失败 | `nt-dpet:<组>:<名>` 命名规范 + 组合包统一装配 |
| **上下文预算爆掉** | 中 | 群里多人时画像挤占 | 注意力分层（§6.5） |
| **磁盘占用** | 中 | 快照 × 多次 | 分层 + 写时复制（§13.4） |
| **原生依赖编译失败** | 中 | 用户机器无编译环境 | 优先纯 JS；必须原生时预编译分发 |
| **工程量失控** | 中 | 29 包 + 三端 + 七通道 | 按 §19 阶段推进，每步可验收 |

---

## 22. 内容撰写任务与初始参数表

原 10 项待定已全部裁决（决策 69-82）。剩下的是**撰写任务**，不是决策。

### 22.1 待撰写内容

| 项 | 说明 | 依据 |
|---|---|---|
| 四份 L1 锚点 | 妹妹 / 伴侣 / 朋友 / 助手，四种不同性格内核，各约 350 token | 决策 71 |
| L2 用户画像模板 | 因关系类型而异的画像侧重点 | §8 |
| L6 边界规则 | 四种关系共用一套硬边界，措辞略有差异 | §8 |
| 默认开场白 | 首次对话的第一句 | §14.3 |
| 组合包展示素材 | 图标 1 张、截图 2 张、逐版本更新日志 | 决策 78 |

### 22.2 初始参数表（实测调参入口）

以下数值均为初始值，代码中全部可配，通过真实对话数据调优。

| 参数 | 初始值 | 位置 |
|---|---|---|
| 情绪半衰期 | 4 小时 | §7.2 |
| 情绪弥散系数 | 0.4 | §7.3 |
| 情绪落盘间隔 | 60 秒 | §7.6 |
| 检索权重（语义/时间/重要度） | 0.40 / 0.40 / 0.20 | §6.3 |
| 注意力分层阈值 | 0.7 / 0.3 | §6.5 |
| 语音情绪阈值 | 偏离 0.4 | §9.1 |
| 语音句子长度 | 6-30 字 | §9.1 |
| 语音频次上限 | 群聊 3 条/小时 | §9.1 |
| 唤醒随机概率 | 10% | §10.5 |
| 关系初始值 | affection 0.1 / trust 0.1 / intimacy 0 / familiarity 0 | §7.1 |
| 还原点数量 | 3 个 | §13.4 |
| 还原点大小上限 | 2 GB | §13.4 |
| 行动播报概率 | 30% | §12.6 |
| 猫娘浓度三档参数 | 待定（语义已定） | §8.3 |

---

## 23. 本文档的边界

- **不含**：实现代码、UI 视觉稿、提示词全文、人格包具体字段值
- **不含**：定价、运营、推广策略
- 所有 `[设计]` 方案尚未实现，落地以实测为准
- 原 10 项待定已全部裁决（决策 69-82），剩余为内容撰写任务（§22.1）
- 决策依据见 `docs/DECISIONS.md`，技术依据见 `docs/TECH-RESEARCH.md`
