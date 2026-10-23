# NT-Dpet · 玄宠

> **从代码到身边。**

面向个人的桌面伴侣软件：将人格、记忆、情绪、语音与形象装配为一个可直接使用的整体。

- 产品全名：**NT-Dpet - 玄宠，从代码到身边**
- 上游内核：DeepSeek-Harness（下称 DSH）`0.2.1-rc.2`
- 当前版本：**0.1.0**（起步里程碑，不代表可安装或可日常使用）
- 许可：GNU Affero General Public License v3.0
- 仓库：`github.com/ntars/NT-Dpet`

---

## 一、项目定位

NT-Dpet 是 DSH 的**发行版**，不是独立框架。DSH 提供插件树、模型调用、会话与工具链等内核能力；NT-Dpet 在其之上完成三件事：

| 职责 | 说明 |
|---|---|
| **装配** | 将人格、记忆、情感、通道、语音、形象组合为可运行的整体 |
| **监控** | 单一环节失效时，其余部分保持运行；启动时校验插件激活数量与关键能力 |
| **降级** | 增强能力失败时回退至基础能力，不向用户暴露错误 |

### 非目标范围

- 不自研基础模型，仅做接入
- 不进行协议逆向，仅使用现成协议端
- 不提供零件式插件市场，提供整装组合包
- 不宣称零风险，个人号通道的封禁风险如实标注

---

## 二、核心亮点

每项均标注实现状态。设计完成与功能可用在本文件中分开表述。

### 2.1 情绪随时间回归基线

五维情绪按指数曲线回归基线，提供四档半衰期（1 小时、4 小时、12 小时、不回归），默认 4 小时。

- 公式：`v(t) = 基线 + (v₀ − 基线) × e^(−λt)`，`λ = ln2 / 半衰期`
- 数值在读取时按经过时长计算，不依赖定时器推进；进程重启无需补偿运算
- 关系值跨过 0.25、0.50、0.75 任一档位时立即落盘，其余情况每 60 秒批量落盘
- 状态：**已实现**

### 2.2 主动性具备克制机制

主动消息需依次通过三道判定，前一道未通过则后续不再计算：

| 判定 | 内容 |
|---|---|
| 时机 | 处于作息窗口内、距上次主动已达冷却时长、通过拒绝判定 |
| 话由 | 存在未消化的记忆、情绪偏离基线、或时间性事件 |
| 分寸 | 当日额度未用尽、不处于静默时段、用户未处于忙碌状态 |

- 唤醒时刻在窗口内随机，不设整点，避免机械感
- 三道判定全部通过后，仍有 30% 概率当日不主动发起
- 连续 3 天未获回应则降低频次，第 7 天归零；日记仍照常写入
- 状态：**设计已定**（`@nt-dpet/proactive` 为骨架）

### 2.3 称呼随关系定位联动

| 关系定位 | 角色身份 | 默认称呼用户 |
|---|---|---|
| 妹妹 | 妹妹 | 哥哥 |
| 伴侣 | 恋人 | 宝宝 / 乖乖 / 老公（「亲爱的」过于正式，不进入默认值） |
| 朋友 | 平等朋友 | 用户昵称或外号 |
| 助手 | 助手 | 主人 / 老板 |
| 亲子 | 女儿 | 爸爸 / 妈妈（由用户指定，默认爸爸） |

称呼为默认值联动，不是硬性绑定：手动修改后不再随关系变化，清空则恢复联动。状态：**已实现**。

### 2.4 日常对话不经过执行链路

日常对话使用独立轻量通道，不创建 DSH 会话、不发起工具调用、不进入 agent 执行链路。

- 仅向界面推送正文，模型推理内容一律过滤
- 中断（用户关闭窗口）与失败分别记录，不使用同一状态表示
- 未知分片类型不抛出异常，避免上游协议扩展导致对话中断
- 状态：**已实现**

### 2.5 隐私项不提供开关

- 会话日志上传与使用统计固定关闭，界面仅显示「已固定关闭」，不提供入口
- 关闭配置在安装时写入，每次启动执行校验；校验未通过则拒绝启动
- 日志上传一经开启，关闭期间产生的内容会在重新开启时补发，因此「关闭即可清除」不成立
- 状态：**设计已定**（校验逻辑随 `@nt-dpet/privacy` 实现）

### 2.6 界面遵循 Apple HIG

- 三栏布局：会话列表、对话区、状态面板；对话与工作双视图
- 七组渐进式设置：模型、她、外观、通道、隐私、开发者、关于
- 四种主题模式：跟随系统、浅色、深色、日出日落自动
- 字体单位仅使用 px / rem；主色 `#3D7CA8`
- 所有控件绑定真实状态；尚未接入后端的项目标注「未接入」，不提供无响应控件
- 状态：**界面壳已实现（静态数据）**

---

## 三、产品行为说明

### 3.1 关系定位与人格结构

人格为基准，关系定位仅作微调。人格配置分为两部分：

| 文件 | 内容 |
|---|---|
| `personas/xiaojingyu/l1_core.json` | 身份、性格、诚实、边界四项，五种关系共用 |
| `personas/xiaojingyu/variants/l1_<关系>.json` | 该关系的称呼、相处节奏、典型反应 |

拼装顺序为：人格内核 → 关系微调 → 猫娘浓度提示。相同 id 的条目后者覆盖前者。

### 3.2 情绪模型

| 维度 | 归属 | 含义 | 初始值 |
|---|---|---|---|
| `mood` | 实例级 | 当前心情 | 0.5 |
| `energy` | 实例级 | 当前精力 | 0.7 |
| `affection` | 按参与者 | 好感 | 0.1 |
| `trust` | 按参与者 | 信任（上升缓慢、下降较快） | 0.1 |
| `intimacy` | 按参与者 | 亲密程度 | 0.0 |
| `familiarity` | 按参与者 | 熟悉度，决定画像注入量 | 0.0 |

情绪弥散：对某参与者的偏移量 = `(mood − 基线) × 0.4 × (1 − 熟悉度 × 0.5)`。关系越疏远，越不会为其区分情绪来源。

切换关系定位时，五维状态全部保留：人格是表现层，不是另一个角色。

### 3.3 记忆模型

| 层 | 内容 | 写入时机 |
|---|---|---|
| 原文层 | 用户发言与回复全文，逐条保存 | 每轮对话，同步写入 |
| 事实层 | 提炼后的事实陈述 | 每轮结束后 5 秒异步提炼 |

- 检索按语义 0.4、时间 0.4、重要度 0.2 加权裁决
- 语义路径当前为关键词退化实现（中文按二元组切分），向量检索待 `sqlite-vec` 接入
- 衰减四档：不衰减、30 天、7 天（默认）、2 天；超过 4 个半衰期视为过期
- 已删除与已被取代的事实不参与检索
- 存储不加密（决策 89），安全边界由文件权限承担

### 3.4 表达与节奏

- 语音输出需通过四道闸门：情绪强度 > 0.4、句子 6–30 字、人设权重 > 0.3、通道未超频次
- 连续三条不得使用同一形式
- 失败时静默回退为文本，不显示错误
- 分条规则：强分隔符（。！？；）必切；省略号、破折号、逗号仅在句子超过 40 字时参与切分
- 夜间（23:00–06:00）打字时长乘以 1.6，单条延迟限幅 300–6000 毫秒

---

## 四、设计决策说明

以下为设计理由，而非功能清单。每项均记录于 `docs/ARCHITECTURE.md` 与 `docs/DECISIONS.md`，可逐条追溯。

### 4.1 情绪回归采用指数曲线

真实情绪表现为初期变化快、后期趋缓。线性衰减会在某一时点骤然归零，与观察不符。

### 4.2 情绪弥散与熟悉度负相关

心情偏离基线时，对关系疏远者的影响大于对熟悉者的影响。原因是熟悉度低时无法为其区分情绪来源，该设定符合拟人化预期。

### 4.3 语音输出设有四道闸门

语音合成需要 2–5 秒、上传需要 1–3 秒，纯文本约 1 秒可发出。若群聊中每条均为语音，会显著降低可用性。因此语音仅在情绪明显偏离基线时使用，以保证其信息密度。

### 4.4 分条策略优先保持语句完整

示例句「嗯……算了吧，你先忙。」切分为四条会破坏语句连贯性，切分为两条更贴近自然表达。因此强分隔符必切，软停顿仅在句子超长时参与。

### 4.5 隐私项不提供开关

日志上传一经开启，关闭期间产生的内容会在重新开启时补发，因此「关闭即可清除」不成立。与其提供可能造成误解的开关，不如不提供。

### 4.6 进程终止仅依据 pidfile

按进程名匹配终止会连带终止官方 DSH。本项目使用独立进程组，退出时仅终止自身记录的 PID。

### 4.7 组合包安装前自动创建还原点

组合包采用完整字段集（作者、图标、截图、权限声明、校验和）。安装前执行冲突检测并自动创建还原点，默认保留 3 个。

### 4.8 不设置无效控件

尚未接入后端的项目标注「未接入」，不提供无响应控件。无效控件比缺少功能更严重，因其会使使用者误判功能已生效。

### 4.9 启动执行自检

DSH 对插件加载失败仅输出告警，不中断启动。该行为在插件宿主中属合理设计，但会导致功能静默缺失。因此每次启动执行激活数量自检：

| 检查项 | 判据 | 不一致时 |
|---|---|---|
| 插件激活数 | 配置树条目数等于实际激活数 | 界面横幅告警，列出未激活条目 |
| 隐私配置 | 会话日志上传与使用统计均为关闭 | 拒绝启动并给出修复指引 |
| 关键插件 | 情感、记忆、对话、人格均在激活列表 | 降级为只读并说明缺失能力 |

---

## 五、架构与插件体系

插件以 7 组挂载于 DSH 插件树，共 **32 个插件包**。

| 分组 | 数量 | 内容 | 状态 |
|---|---|---|---|
| 内核 | 5 | 情感、记忆、世界书、节奏、主动消息 | 情感、记忆、节奏已实现 |
| 对话 | 2 | 轻量对话通道、人格包 | 通道与人格已实现 |
| 通道 | 10 | QQ（官方 / 个人号）、微信公众号、个人微信、飞书、钉钉、企业微信、Telegram、Discord、唤醒路由 | 骨架 |
| 表达 | 6 | TTS、表情包、立绘、桌宠、移动端桌宠、表达决策 | 骨架 / 占位 |
| 行动 | 4 | adb、浏览器、Minecraft、GUI 决策环 | 骨架 |
| 系统 | 4 | 隐私、市场、还原点、中文日志 | 骨架 |
| 界面 | 1 | Web UI | 界面壳已实现，插件入口为空 |

> 包划分待重划。原「29 包全自研」的结论形成于生态调研之前。当前 DSH 环境已安装 `dsh-pet`、`dsh-soul-md`、`dsh-context` 等插件，与多个自研包功能重叠。决策 85 已调整为「复用优先、只做差异，且可跟随上游更新」，因此包划分需在 S0 内重做一次，依据见 `docs/TECH-RESEARCH.md` §5.5。

### 5.1 目录结构

```
NT-Dpet/
├── index.html              项目介绍页（仓库根，供静态托管直接取用）
├── css/site.css            介绍页样式（与软件界面共用颜色令牌）
├── assets/                 介绍页图片与图标
├── edgeone.json            托管平台构建配置
├── README.md               本文件
├── NOTICE                  第三方组件与版权声明
├── CHANGELOG.md            版本记录
├── LICENSE                 AGPL-3.0 全文
├── docs/                   设计文档
│   ├── ARCHITECTURE.md     架构设计
│   ├── TECH-RESEARCH.md    技术底账与实测记录
│   ├── DECISIONS.md        决策记录（92 项）
│   ├── CREDITS.md          致谢与许可边界
│   ├── ADOPTION-REGISTER.md 采用登记册
│   ├── UPSTREAM-CANDIDATES.md 上游候选清单
│   └── HANDOFF.md          上下文交接说明
├── packages/               32 个插件包
├── personas/               人格配置
├── bundles/                组合包配置
└── desktop/                Electron 主进程
```

### 5.2 隔离与命名体系

安装 NT-Dpet 不修改用户已有的 DSH 环境。隔离覆盖所有可能与官方版本冲突的标识：

| 项目 | 官方 DSH | NT-Dpet |
|---|---|---|
| 产品名 | DeepSeek Harness | NT-DPet |
| 应用标识 | `com.deepseek.dsh` | `com.ntars.ntdpet` |
| 用户数据目录 | `~/Library/Application Support/DeepSeek Harness` | `…/NT-Dpet` |
| 数据根 | `~/.dsh` | `…/NT-Dpet/dsh-home` |
| 技能根 | `~/.agents` | `…/NT-Dpet/agents` |
| profile | `desktop` | `nt-dpet` |
| 进程名 | DeepSeek Harness | `nt-dpet-host` |
| 进程管理 | 官方 App | 独立进程组 + pidfile，仅按 PID 终止 |
| 端口 | 3080 | 9060（可调，冲突时递增） |
| 环境变量前缀 | `DSH_*` | `NTDPET_*` |

四项禁止事项：不写 `~/.dsh`、不写 `~/.agents`、不占用 3080、不依赖官方 App 的进程存活。

唯一的跨目录读取：首次启动时以只读方式检查已配置的密钥，并询问是否沿用；经确认后才复制至自有目录，不回写原文件。

### 5.3 隐私与数据

- 对话与记忆默认全部存储于本机
- 记忆不加密（决策 89）：目录权限 0700、数据库文件 0600
- 上游默认的会话日志上传行为已强制关闭，并在每次启动时校验
- 对话通道不创建 DSH 会话，因此不产生会话日志
- 用户资产（人格、凭据、日记、还原点）存放于 `user/` 目录，与 `dsh-home/` 分离，避免配置重建时清除

---

## 六、第三方组件与版权声明

本项目自身以 **AGPL-3.0-or-later** 发布。完整法律声明见根目录 [`NOTICE`](NOTICE)；逐项采用决策与声明动作见 [`docs/ADOPTION-REGISTER.md`](docs/ADOPTION-REGISTER.md)；候选项目全量清单见 [`docs/UPSTREAM-CANDIDATES.md`](docs/UPSTREAM-CANDIDATES.md)。

### 6.1 已引入的依赖

| 组件 | 版本 | 许可证 | 用途 |
|---|---|---|---|
| `@deepseek-ai/cordis` | `^4.0.5` | MIT | 插件树与依赖注入，全部插件包的运行基础 |
| `typescript` | `^5.7.0` | Apache-2.0 | 编译期使用，不进入运行时 |
| `electron` | `^45.0.0` | MIT | 桌面外壳（当前为开发依赖） |

### 6.2 由宿主提供、本项目不分发

| 组件 | 版本 | 许可证 | 说明 |
|---|---|---|---|
| DeepSeek-Harness | `0.2.1-rc.2` | MIT | 插件宿主，本项目为其发行版 |
| `@deepseek-ai/dsh-llm` | 随宿主 | BSD-3-Clause | 模型调用服务，仅按其接口结构调用 |
| `@deepseek-ai/dsh-host-webserver` | 随宿主 | MIT | 宿主 HTTP 服务（Cordis 服务 `webServer`）；接口层按方案 A 复用它注册路由，不另起端口，实测见 `docs/TECH-RESEARCH.md` §5.11 |
| Node.js | ≥ 22（实测 22.22.2） | MIT 及若干组件各自许可 | 运行时；记忆持久化使用内置 `node:sqlite` |
| pnpm | 9.x（实测 9.15.9） | MIT | 工作区与依赖管理，仅开发期使用 |

### 6.3 计划引入、尚未加入依赖

| 组件 | 许可证 | 计划用途 |
|---|---|---|
| PixiJS、pixi-live2d-display、wlipsync | MIT | 立绘渲染与嘴型同步 |
| better-sqlite3 | MIT | SQLite 备选实现（当前使用 `node:sqlite`） |
| sqlite-vec | MIT OR Apache-2.0 | 向量检索（按 MIT 分支使用） |
| Mineflayer、mineflayer-pathfinder | MIT | Minecraft 接入与寻路 |
| electron-builder、alex8088/electron-vite | MIT | 三端打包与构建 |
| zhinjs/qq-official-bot、grammY | MIT | QQ 官方机器人、Telegram 通道 |
| OpenCC、markdown-it、shiki | Apache-2.0 / MIT | 繁简转换、消息渲染、代码高亮 |
| onnxruntime、transformers.js | MIT / Apache-2.0 | 本地推理（VAD、embedding） |
| GPT-SoVITS、RVC、silero-vad | MIT | 本地语音（独立进程，不打包） |

> 本表把「已定级的计划依赖」与「尚未定级的依赖候选」合并列出，二者都未写入任何 `package.json`。逐项定级（计划依赖 / 依赖候选 / 采用时登记）以 [`docs/ADOPTION-REGISTER.md`](docs/ADOPTION-REGISTER.md) 为准；`NOTICE` §五 只登记其中已定级为计划引入的部分。

### 6.4 不得随包分发的组件

| 组件 | 原因 |
|---|---|
| Live2D Cubism Core | 专有软件，不可再分发；由用户确认协议后自官方渠道下载 |
| NapCat、Lagrange.Core | 未声明许可或有限再分发，与 AGPL-3.0 不兼容；仅引导用户自行安装 |
| LLOneBot | GPL-2.0-only，与 AGPLv3 不兼容 |
| ADBKeyboard | GPL-2.0-only，与 AGPLv3 不兼容 |

### 6.5 仅参考设计、未复制代码

AIRI（MIT）、dsh-bili-whale（MIT）、ai-companion-kit（MIT）、AstrBot（AGPL-3.0）、MaiBot（GPL-3.0）、SillyTavern（AGPL-3.0）。上述项目仅参考其机制设计，未复制代码。

### 6.6 许可兼容口径

| 上游许可 | 能否采用 | 条件 |
|---|---|---|
| MIT / ISC / BSD / Apache-2.0 | 可以 | 保留版权声明与许可全文；Apache-2.0 需另附其 NOTICE |
| AGPL-3.0 / GPL-3.0 | 可以 | 同族兼容；复制其代码后本项目仍为 AGPL，须保留署名 |
| LGPL-3.0 / MPL-2.0 | 可以 | 隔离使用；修改其文件需回馈 |
| GPL-2.0-only | 不可以 | 与 AGPLv3 不兼容，仅可独立进程、不打包 |
| 专有许可 | 有条件 | 由用户自行安装，本项目不打包 |
| 未声明许可 | 不可以 | 无声明即保留所有权利；署名不能替代授权 |

### 6.7 仓库不含第三方源码

`node_modules/`、`dist/`、`runtime/` 均未提交入库。仓库仅包含本项目自有源代码、文档与自有素材。源代码文件头部统一标注 `SPDX-License-Identifier: AGPL-3.0-or-later` 与版权行。

### 6.8 商标

DeepSeek、Live2D、微信、QQ、企业微信、飞书、钉钉、Telegram、Discord、Minecraft 等名称归各自权利人所有。本文件提及仅用于说明兼容对象，不表示关联或背书。

---

## 七、当前实现范围

版本 0.1.0，处于 S0 阶段。

| 模块 | 状态 | 验证方式 |
|---|---|---|
| `@nt-dpet/emotion` 情感状态机 | 已实现 | 21 个单元测试；真实构建产物在 DSH 中挂载成功 |
| `@nt-dpet/dialogue` 对话通道 | 已实现 | 12 个单元测试；真实网关端到端验证通过 |
| `@nt-dpet/memory` 记忆双层 | 已实现 | 23 个单元测试，含 SQLite 持久化与 0600/0700 权限校验 |
| `@nt-dpet/rhythm` 分条与节奏 | 已实现 | 15 个单元测试 |
| `@nt-dpet/persona` 人格与称呼 | 已实现 | 13 个单元测试；五份人格锚点已撰写 |
| `@nt-dpet/ui` 接口层与界面壳 | 已实现（接口 `/health`、`/mood`、`/memory/recent`；情绪面板与右栏记忆接真实数据，对话仍为演示数据） | 36 个单元测试 + 14 项交互冒烟 |
| `@nt-dpet/pet-mobile` 移动端桌宠 | 占位（默认禁用） | 无实现 |
| 其余 25 个插件包 | 骨架 | 仅通过编译 |
| 安装器、三端打包 | 未开始（`desktop/src/main.ts` 为骨架） | 无可运行产物；`@nt-dpet/desktop` 仅声明 electron 开发依赖 |

端到端实测记录（真实插件，非测试桩）：

```
[e2e] dialogue 服务: true | emotion 服务: true
[e2e] 用时 15196 ms
[e2e] 回复: "欢迎回来喵，主人～"
[e2e] stopReason: stop | usage: {"inputTokens":44,"outputTokens":6,"totalTokens":50}
[e2e] 流式增量条数: 6
```

### 7.1 已知限制

1. 不提供安装包，当前仅可源码构建
2. 记忆为 SQLite 持久化，但事实提炼提示词尚未编写
3. 情感状态默认使用内存存储，进程退出即丢失；存储端口已预留
4. 界面壳尚未全部联通插件服务：接口层（`/api/ntdpet` 路由与自鉴权）已落地，情绪面板与右栏记忆已接真实数据；对话发送、启动自检、记忆管理页仍用静态数据（`docs/ROADMAP.md` M0.2.4 起）
5. 包划分未定稿
6. 测试覆盖不均：五个模块有单元测试，其余包尚无
7. 人格文本尚未经真实对话校验
8. 移动端仅保留占位

---

## 八、平台支持

| 平台 | 状态 | 说明 |
|---|---|---|
| macOS | 已验证 | 唯一完成实测的平台 |
| Windows | 未验证 | 计划 S1 支持 |
| Linux | 未验证 | 计划 S1 支持 |

### 8.1 移动端桌宠（占位）

`packages/pet-mobile/` 已保留位置，默认禁用，无实现。三端能力差异为结构性差异，不能共用同一渲染实现：

| 平台 | 桌面常驻立绘 | 可行形态 |
|---|---|---|
| 安卓 | 可行（`SYSTEM_ALERT_WINDOW`） | 常驻、可拖动、可交互 |
| 苹果 | 不可行（系统不开放第三方全局悬浮窗） | 灵动岛、实时活动、小组件与应用程序内形象 |
| 鸿蒙 | 待确认 | 服务卡片、万能卡片，需单独适配 |

因此移动端不以桌面立绘为主要形态，而以通知、锁屏信息、小组件状态为主。该判断需在产品层面确认后实施，详见 `docs/ARCHITECTURE.md` §11.4。

---

## 九、构建与测试

### 9.1 环境要求

| 项目 | 要求 | 说明 |
|---|---|---|
| Node.js | ≥ 22 | 实测 `22.22.2` |
| pnpm | 9.x | 实测 `9.15.9`；`packageManager` 锁定 `pnpm@9.15.0` |
| DSH 宿主 | 桌面版 `0.2.1-rc.2` | 插件运行于其进程内 |

`pnpm` 未加入 PATH 时使用 `npx pnpm@9`。不使用 `corepack`：其默认安装 12.x，与 `packageManager` 声明不一致。

### 9.2 构建

```bash
# 安装依赖（跳过 postinstall，避免下载 Electron 二进制）
npx pnpm@9 install --ignore-scripts

# 构建全部 32 个包
npx pnpm@9 -r --filter './packages/**' build

# 类型检查
npx pnpm@9 -r exec tsc --noEmit
```

### 9.3 测试

```bash
# 情感状态机：21 个用例
npx pnpm@9 --filter '@nt-dpet/emotion' run test

# 对话通道：12 个用例
npx pnpm@9 --filter '@nt-dpet/dialogue' run test

# 记忆：23 个用例（含 SQLite 持久化与权限）
npx pnpm@9 --filter '@nt-dpet/memory' run test

# 节奏：15 个用例
npx pnpm@9 --filter '@nt-dpet/rhythm' run test

# 人格：13 个用例
npx pnpm@9 --filter '@nt-dpet/persona' run test

# 界面交互冒烟：14 项
node packages/ui/web/test/smoke.mjs
```

`--filter` 后必须带 `run`：`pnpm --filter X test` 会调用 pnpm 内置命令，退出码不反映测试结果。

### 9.4 在独立 DSH 环境验证插件

以下流程不触碰用户已有的 `~/.dsh`：

```bash
BIN="/Applications/DeepSeek Harness.app/Contents/Resources/app/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js"
export DSH_HOME=/tmp/nt-dpet-probe/dsh-home

# 1. 从内置模板创建独立 profile
node "$BIN" --profile nt-dpet --from-default-profile web

# 2. 查看合成后的插件树
node "$BIN" --profile nt-dpet --patch ./my.yml --dump-config

# 3. 启动
node "$BIN" --profile nt-dpet --patch ./my.yml --no-open --port 9060
```

三项实测结论：启动日志中的 URL 带随机 token，默认绑定 `127.0.0.1`；插件加载失败不中断启动，仅输出告警；`--profile` 与 app 名不可同时出现。

### 9.5 界面预览

```bash
cd packages/ui/web && python3 -m http.server 8731
# http://127.0.0.1:8731/
# 工作视图：http://127.0.0.1:8731/#work
# 指定设置页：http://127.0.0.1:8731/?pane=her
```

项目介绍页：

```bash
python3 -m http.server 8920
# http://127.0.0.1:8920/
```

---

## 十、模型接入

模型调用统一经 `dsh-llm` 服务，由 provider 适配器实现。密钥不出现在配置文件中：patch 仅声明环境变量名，其值在每次请求时解析。

```yaml
- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      magpie:
        displayName: 本地网关
        api: openai-completions
        baseURL: http://127.0.0.1:3425/v1
        apiKeyEnv: MAGPIE_API_KEY
        models:
          - id: group/ntars
            name: 本地模型
            contextWindow: 1048576
            maxTokens: 384000
```

```bash
export MAGPIE_API_KEY=<密钥>
```

两项注意：覆盖已存在的条目时必须写明 `id`；手工声明的 provider 不出现在 `ctx.llm.listProviders()` 中，但 `ctx.llm.stream({ provider })` 可正常使用。

---

## 十一、插件开发约定

### 11.1 包的必备文件

```
packages/<name>/
├── package.json          必须含 type: module、main、files、dsh.bundle.patch
├── cordis.patch.yml      挂载声明，必须使用 insert 包裹
├── tsconfig.json
└── src/index.ts          export name / export function apply(ctx)
```

```yaml
- insert:
    - id: nt-dpet:core:emotion
      name: "@nt-dpet/emotion"
```

写成裸条目（`- id:` 直接开头）不会报错，也不会生效，条目会被静默丢弃。

### 11.2 四项约束

1. 仅 ESM：`@deepseek-ai/*` 为 ESM，CommonJS 会触发 `ERR_REQUIRE_ESM`
2. 必须声明 `inject`：读取未声明的服务会抛出异常，且整个插件不激活
3. entry id 全项目唯一：命名规范 `nt-dpet:<组>:<名>`
4. patch 必须使用 `insert` 包裹

### 11.3 实现语言

本项目不规定实现语言，按组件选择最优解：插件与界面使用 TypeScript，本地语音使用 Python 子进程，macOS 原生能力使用 Swift。约束在于进程边界与接口契约，跨语言组件不得以 FFI 方式绑定运行时。

---

## 十二、实施阶段

| 阶段 | 内容 | 状态 |
|---|---|---|
| S0 | 骨架与最小可聊（文本、记忆、情感） | 进行中 |
| S1 | 三端打包（Windows → macOS → Linux） | 未开始 |
| S2 | 官方 QQ 机器人、微信公众号通道 | 未开始 |
| S3 | 组合包市场与还原点 | 未开始 |
| S4 | 语音与表情包 | 未开始 |
| S5 | 桌面桌宠 | 未开始 |
| S6 | 手机操作 | 未开始 |
| S7 | 其余通道 | 未开始 |

S0 完成前不发布任何可安装产物。

---

## 十三、风险与限制说明

**账号风险**：接入个人 QQ 号或个人微信可能导致账号永久封禁，并可能波及所在群聊与关联账号。本软件无法保证账号安全。官方机器人通道不存在该风险，为推荐接入方式。

**AI 内容标识**：本软件不代使用者添加 AI 生成内容标识。在公开平台使用其输出时，使用者依《人工智能生成合成内容标识办法》（2025 年 9 月 1 日施行）承担标识义务。

**隐私**：对话与记忆默认存储于本机且不加密，安全边界由目录权限承担。上游默认的会话日志上传行为已被强制关闭并在每次启动校验。

---

## 十四、文档索引

| 文档 | 内容 |
|---|---|
| [`NOTICE`](NOTICE) | 第三方组件与版权声明（法律文件） |
| [`docs/ADOPTION-REGISTER.md`](docs/ADOPTION-REGISTER.md) | 采用登记册：逐项采用决策与声明动作 |
| [`docs/UPSTREAM-CANDIDATES.md`](docs/UPSTREAM-CANDIDATES.md) | 上游候选清单：GitHub 扫描结果与定级 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 架构设计：拓扑、数据模型、接口契约、施工顺序 |
| [`docs/TECH-RESEARCH.md`](docs/TECH-RESEARCH.md) | 技术底账：选型、许可矩阵、宿主实测 |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | 决策记录：92 项，逐项可溯源 |
| [`docs/CREDITS.md`](docs/CREDITS.md) | 致谢与许可边界 |
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | 上下文交接说明 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | 开发清单：M0–M8 共 71 个可勾选项（M0 已细化到 22 个子步） |
| [`docs/AUTOMATION.md`](docs/AUTOMATION.md) | 定时任务的职责、边界与暂停方式 |
| [`CHANGELOG.md`](CHANGELOG.md) | 版本记录 |

---

## 十五、贡献

- 提交前执行 `npx pnpm@9 -r --filter './packages/**' build` 与相关测试
- 新增插件包须遵守 §11.1 的目录结构与 §11.2 的四项约束
- 涉及第三方代码时，先在 `docs/CREDITS.md` 与 `docs/ADOPTION-REGISTER.md` 中明确使用方式与声明要求

---

## 十六、版权与许可

本项目版权归 Ntarstudio（星玖工作室）所有，以 [GNU Affero General Public License v3.0](LICENSE) 发布。

```
NT-Dpet · 玄宠
Copyright (C) 2026 Ntarstudio（星玖工作室）
SPDX-License-Identifier: AGPL-3.0-or-later
```

两项许可条件：分发本软件（含修改版）时须向接收者提供完整对应源码；将修改版作为网络服务提供时，须向该服务用户提供源码。

第三方组件的完整清单、许可义务与禁止分发范围见 [NOTICE](NOTICE)。
