# NT-Dpet · 玄宠

> **从代码到身边。** 人格、记忆、情绪、声音、身体——装好就能用的桌面伴侣。

- 产品全名：**NT-Dpet - 玄宠，从代码到身边**
- 许可：GNU Affero General Public License v3.0
- 上游：DeepSeek-Harness（下称 DSH）`0.2.1-rc.2`
- 仓库：`github.com/ntars/NT-Dpet`

---

## 一、当前状态

**本项目处于 S0「骨架 + 最小可聊」阶段。除下文明确标注「已实现」的模块外，其余能力均未实现。**

为避免误读，先给出精确到模块的状态表。评级标准：**已实现**＝有代码、能编译、有验证记录；**骨架**＝有文件结构与接口注释、`apply()` 为空；**占位**＝仅保留位置与边界说明。

| 模块 | 状态 | 验证方式 |
|---|---|---|
| `@nt-dpet/emotion` 情感状态机 | **已实现** | 21 个单元测试通过；真实构建产物在 DSH 中挂载成功 |
| `@nt-dpet/dialogue` 轻量对话通道 | **已实现** | 端到端实测返回文本（见 §6.2）；**尚无单元测试** |
| `packages/ui/web` 界面壳 | **已实现（纯静态）** | 交互冒烟测试；数据来自演示数据，未接后端 |
| 项目介绍页 `index.html` | **已实现** | 已部署 |
| 其余 27 个包 | 骨架 | 仅通过编译（其中 `ui` 的 Web 壳已完成，插件入口仍为空） |
| `@nt-dpet/pet-mobile` 移动端桌宠 | 占位（默认禁用） | 无 |
| 安装器 / 三端打包 | 未开始 | 无 |

> 仓库中不存在任何可双击安装的产物。当前只有源码、文档、静态界面与两个能跑的插件包。

---

## 二、项目定位

NT-Dpet 是 DSH 的**发行版**，不是独立框架。DSH 相当于内核，NT-Dpet 相当于一套预配置好的发行套件：不重写内核，只负责装配、隔离与兜底。

它承担三件事：

1. **装配**——把人格、记忆、情感、通道、声音、行动等能力装成一个可运行的整体
2. **隔离**——任何一个环节失效，其余部分照常工作
3. **兜底**——增强能力失败时退回基础能力，不把报错抛给用户

### 它不是

- 不是自研模型，仅做接入
- 不做协议逆向，只使用现成协议端
- 不做零件货架，做整装组合包
- 不承诺账号安全：个人号通道存在封禁风险，详见 §11

---

## 三、与官方 DSH 的隔离

安装 NT-Dpet **不会修改用户已有的 DSH 环境**。隔离在目录、端口、进程、锁四个层面同时生效：

| 维度 | 官方 DSH | NT-Dpet | 隔离手段 |
|---|---|---|---|
| 数据目录 | `~/.dsh` | 自有 `dsh-home/` | `DSH_HOME` |
| 技能与指令 | `~/.agents` | 自有 `agents/` | `DSH_AGENTS_HOME` |
| profile | `desktop` | `nt-dpet` | `--profile` |
| 端口 | `3080` | `3180`（冲突时递增） | `--port` |
| 进程 | 官方 App | 独立子进程树 | 各自 spawn |
| Electron 单实例锁 | 官方 App 的 | 独立 `productName` | 应用标识不同 |

四条禁止事项（违反任一条即破坏隔离）：

1. 不写 `~/.dsh` 下的任何文件
2. 不写 `~/.agents` 下的任何文件
3. 不占用 `3080`
4. 不依赖官方 App 的进程存活

**唯一允许的跨目录读取**：首次启动时以只读方式检查 `~/.dsh/.credentials.yaml`，询问用户是否沿用已配置的密钥。用户确认后才复制到自有目录，**绝不回写**。

上述隔离已实测确认：在独立 `DSH_HOME` 下运行 CLI 后，该目录外无任何文件被创建。设计细节见 `docs/ARCHITECTURE.md` §2.3。

---

## 四、架构

插件以 7 组挂载到 DSH 的插件树上。日常对话**不经过 DSH 的 agent loop**，只有需要执行动作（操作手机、浏览器、游戏）时才唤起工具链。

> **包划分待重划。** 原「29 个包全自研」的结论形成于生态调研之前。实测本机 DSH 已安装 `dsh-pet`（桌宠，含 97 段动画与亲密度状态机）、`dsh-soul-md`（人格与分层记忆）、`dsh-context` 等插件，与多个自研包功能重叠。决策 85 已改为「复用优先、只做差异，且必须可跟随上游更新」，因此包划分需在 S0 内重做一次。依据见 `docs/TECH-RESEARCH.md` §5.5。

| 组 | 包数 | 内容 |
|---|---|---|
| 内核 | 5 | 情感、记忆、世界书、节奏、主动消息 |
| 对话 | 2 | 轻量对话通道、人格包 |
| 通道 | 8 | QQ（官方 / 个人号）、飞书、钉钉、企微、Telegram、Discord、唤醒路由 |
| 表达 | 6 | TTS、表情包、立绘、桌宠、移动端桌宠（占位）、表达决策 |
| 行动 | 4 | adb、浏览器、Minecraft、GUI 决策环 |
| 系统 | 4 | 隐私、市场、还原点、中文日志 |
| 界面 | 1 | Web UI |

包总数：**30**。

### 4.1 目录结构

```
NT-Dpet/
├── index.html              项目介绍页（仓库根，供静态托管直接取用）
├── css/site.css            介绍页样式（令牌与软件界面同源）
├── assets/                 介绍页图片与图标
├── edgeone.json            托管平台构建配置（阻止其安装 monorepo 依赖）
├── docs/                   设计文档（ARCHITECTURE / TECH-RESEARCH / DECISIONS / CREDITS）
├── packages/               30 个插件包
│   ├── emotion/            情感状态机（已实现）
│   ├── dialogue/           对话通道（已实现）
│   ├── pet-mobile/         移动端桌宠（占位）
│   └── ...                 其余包
├── desktop/                Electron 主进程骨架
├── personas/               人格包
├── bundles/                组合包配置
└── runtime/                运行时下载目录（不入库）
```

每个插件包的必备文件与写法见 §8。

---

## 五、环境要求

| 项 | 要求 | 说明 |
|---|---|---|
| 操作系统 | macOS | **仅 macOS 经过实测**；Windows / Linux 未验证 |
| Node.js | ≥ 22 | 实测 `22.22.2` |
| pnpm | 9.x | 实测 `9.15.9`；`packageManager` 字段锁定 `pnpm@9.15.0` |
| DSH 宿主 | 桌面版 `0.2.1-rc.2` | 插件运行于其进程内 |

`pnpm` 未加入 PATH 时使用 `npx pnpm@9`。**不要使用 `corepack`**：它会安装 12.x，与 `packageManager` 声明不一致。

---

## 六、构建与验证

### 6.1 构建

```bash
# 安装依赖（跳过 postinstall，避免下载 Electron 二进制）
npx pnpm@9 install --ignore-scripts

# 构建全部 30 个包
npx pnpm@9 -r --filter './packages/**' build

# 类型检查
npx pnpm@9 -r exec tsc --noEmit
```

构建产物输出至各包 `dist/`，不入库。

### 6.2 单元测试

```bash
# 情感状态机：21 个用例（指数回归、弥散、阈值跨档、快照隔离）
npx pnpm@9 --filter '@nt-dpet/emotion' run test
```

> 必须带 `run`：`pnpm --filter X test` 会走 pnpm 内置的 `test` 命令，退出码不反映测试结果。

测试使用 Node 内置 `node:test`，不引入额外框架。当前仅 `emotion` 有测试覆盖；`dialogue` 走的是端到端验证，尚无单元测试，这一项是已知缺口。

### 6.3 在独立 DSH 环境中验证插件

以下流程不触碰用户已有的 `~/.dsh`：

```bash
BIN="/Applications/DeepSeek Harness.app/Contents/Resources/app/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js"
export DSH_HOME=/tmp/nt-dpet-probe/dsh-home

# 1. 从内置 web 模板创建独立 profile（无需先安装插件）
node "$BIN" --profile nt-dpet --from-default-profile web

# 2. 查看合成后的插件树，确认自己的 entry 已进入
node "$BIN" --profile nt-dpet --patch ./my.yml --dump-config

# 3. 启动（使用 --profile 时不要再写 app 名）
node "$BIN" --profile nt-dpet --patch ./my.yml --no-open --port 3180
```

三条实测结论：

- 启动日志中的 URL 带**随机 token**，默认绑定 `127.0.0.1`
- **插件加载失败不阻断启动**：只输出 `warning: 1 entry did not activate`。因此产品侧必须做 entry 激活数自检（见 §8.2）
- `--profile` 与 app 名不可同时出现，否则报 `too many arguments`

---

## 七、模型接入

模型调用统一经 `dsh-llm` 服务，由 provider 适配器落地。**密钥不出现在任何配置文件里**：patch 只声明环境变量名，值由凭据 seam 在每次请求时解析。

以 OpenAI 兼容的本地网关为例：

```yaml
# cordis.patch.yml
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

两条注意：

- 覆盖已存在的 entry 时**必须写 `id`**，否则报 `patch: id is required for non-insert patches`
- 手工声明的 provider 不会出现在 `ctx.llm.listProviders()` 中（该方法报告的是 GUI 可选目录），但 `ctx.llm.stream({ provider })` 照常可用

调用方式与实测返回的分片序列见 `docs/TECH-RESEARCH.md` §5.10。

---

## 八、插件开发约定

### 8.1 包的必备文件

```
packages/<name>/
├── package.json          # 必须含 type: module、main、files、dsh.bundle.patch
├── cordis.patch.yml      # 挂载声明，必须用 insert 包裹
├── tsconfig.json
└── src/index.ts          # export name / export function apply(ctx)
```

`cordis.patch.yml` 的正确写法：

```yaml
- insert:
    - id: nt-dpet:core:emotion
      name: "@nt-dpet/emotion"
```

写成裸 entry（`- id:` 直接开头）**不报错、不警告、直接消失**。这是本项目最容易踩且最难发现的坑。

### 8.2 四条硬约束

1. **仅 ESM**：`@deepseek-ai/*` 为 ESM，CommonJS 会触发 `ERR_REQUIRE_ESM`
2. **必须声明 `inject`**：读取未声明的服务会抛 `cannot get property "X" without inject`，且**整个插件不激活**
3. **entry id 全项目唯一**：命名规范 `nt-dpet:<组>:<名>`
4. **patch 必须用 `insert` 包裹**（见 §8.1）

### 8.3 启动自检

由于 DSH 对插件加载失败采取软失败策略，NT-Dpet 每次启动须执行自检：

| 检查项 | 判据 | 不一致时 |
|---|---|---|
| entry 激活数 | 配置树 entry 数 == 实际激活数 | 界面横幅告警，列出未激活 id |
| 隐私开关 | `session-log-deepseek` 与 `plugin-package-inventory-deepseek` 均为 `false` | **拒绝启动** |
| 关键包 | `emotion` / `memory` / `dialogue` / `persona` 均在激活列表 | 降级为只读并明示缺失能力 |

设计依据见 `docs/ARCHITECTURE.md` §4.4。

---

## 九、界面

界面壳位于 `packages/ui/web/`，可直接在浏览器中查看。三栏布局（会话 / 对话 / 她），对话与工作双视图切换，深浅色跟随系统或按日出日落切换；设置面板覆盖模型、人格、外观、通道、隐私、开发者、关于七组。

```bash
cd packages/ui/web && python3 -m http.server 8731
# http://127.0.0.1:8731/
# 工作视图：http://127.0.0.1:8731/#work
# 指定设置页：http://127.0.0.1:8731/?pane=her

# 交互冒烟测试（脚本自起静态服务与浏览器并回收）
node packages/ui/web/test/smoke.mjs
```

界面为**纯静态壳**，数据来自 `js/data.js` 的演示数据，未连接任何后端。所有开关均绑定真实偏好状态，未接入后端的项显式标注「未接入」。

### 9.1 项目介绍页

```bash
python3 -m http.server 8920
# http://127.0.0.1:8920/
```

介绍页位于仓库根，便于静态托管平台直接取用入口文件。页面「界面」一节使用界面壳真实截图（`assets/ui-*.png`），按 `prefers-color-scheme` 自动切换深浅两版；界面变更后应重拍，不得手动修图。

`edgeone.json` 将安装与构建命令置空、输出目录指向仓库根，避免托管平台安装整个 workspace 依赖。

---

## 十、隐私与数据

- 对话与记忆默认全部存放在本机
- 上游 DSH 默认随每次模型请求上传会话日志（含消息全文、工具参数与结果、工作区路径），且 `DSH_TELEMETRY_DISABLED=1` 无法关闭该行为。NT-Dpet 在安装时强制关闭，并在每次启动时校验
- 对话通道**不创建 DSH Session**，因此不产生会话日志；该约束已实测确认不影响功能
- 用户资产（人格、凭据、日记、账本、还原点）存放在 `user/` 目录，与 `dsh-home/` 分离，避免 profile 重建时被清空

详见 `docs/ARCHITECTURE.md` §2.3、§16。

---

## 十一、平台支持

| 平台 | 桌面端 | 说明 |
|---|---|---|
| macOS | 已验证 | 唯一完成实测的平台 |
| Windows | 未验证 | 计划在 S1 支持 |
| Linux | 未验证 | 计划在 S1 支持 |

### 11.1 移动端桌宠（占位）

`packages/pet-mobile/` 已留出位置，**默认禁用**，无任何实现。三端能力差异是结构性的，不能共用一套渲染：

| 平台 | 能否桌面常驻立绘 | 可行形态 |
|---|---|---|
| 安卓 | 可以（`SYSTEM_ALERT_WINDOW`） | 真·桌宠：常驻、可拖动、可交互 |
| 苹果 | 不可以（系统不开放第三方全局悬浮窗） | 灵动岛 / 实时活动 / 小组件 + 应用内形象 |
| 鸿蒙 | 待确认 | 服务卡片 / 万能卡片，需单独适配 |

因此移动端不采用「桌面立绘」这一形态，而以「通知中的她、锁屏一行字、小组件状态」为主。该判断需在产品层面确认后再实现。详见 `docs/ARCHITECTURE.md` §11.4。

---

## 十二、路线图

| 阶段 | 内容 | 状态 |
|---|---|---|
| S0 | 骨架 + 桌面能聊（文本 + 记忆 + 情感） | 进行中（情感、对话已实现） |
| S1 | 三端打包（Windows → macOS → Linux） | 未开始 |
| S2 | 官方 QQ 机器人通道 | 未开始 |
| S3 | 组合包市场 + 还原点 | 未开始 |
| S4 | 语音与表情包 | 未开始 |
| S5 | 桌宠（桌面端） | 未开始 |
| S6 | 手机操作 | 未开始 |
| S7 | 其余通道 | 未开始 |

S0 未完成前不会发布任何可安装产物。

---

## 十三、已知限制

1. **无安装包**：当前只能从源码构建，且仅验证 macOS
2. **无记忆**：`@nt-dpet/memory` 为骨架，对话不跨轮保留上下文
3. **无持久化**：情感状态的默认存储实现为内存，进程退出即丢失；存储端口已预留，待 `storage` 落地后替换
4. **界面对接未知**：界面壳为静态数据，未与插件服务连通
5. **包划分未定稿**：见 §4 引用块
6. **测试覆盖不均**：仅 `emotion` 有单元测试
7. **移动端未实现**：仅保留位置

---

## 十四、风险声明

**账号风险**：接入个人 QQ 号（NapCat 通道）可能导致**永久封号**，并可能波及所在群聊与关联账号。软件无法保证账号安全，风险由使用者承担。官方机器人通道无此风险，是无封号顾虑时的推荐选择。

**AI 内容标识**：本软件不代替使用者添加 AI 生成内容标识。在公开平台使用本软件输出时，使用者依《人工智能生成合成内容标识办法》（2025 年 9 月 1 日施行）负有标识义务。

**隐私**：详见 §10。上游默认上传会话日志的行为已由本项目强制关闭并校验，这是本项目优先级最高的一项修复。

---

## 十五、文档

| 文档 | 内容 |
|---|---|
| [`docs/TECH-RESEARCH.md`](docs/TECH-RESEARCH.md) | 技术底账：能力域选型、许可矩阵、硬件基线、DSH 宿主实测、待验证清单 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 架构设计：进程拓扑、数据模型、接口契约、情感与主动性机制、施工顺序 |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | 决策记录：86 项已确认决策，逐项可溯源 |
| [`docs/CREDITS.md`](docs/CREDITS.md) | 致谢与第三方依赖：使用方式、许可边界、法律红线 |

设计过程中的关键判断（含被否决的方案与理由）均记录在上述文档中，未只保留在对话里。

---

## 十六、贡献

- 提交前运行 `npx pnpm@9 -r --filter './packages/**' build` 与相关测试
- 新增插件包须遵守 §8 的目录结构与四条硬约束
- 涉及第三方代码时，先在 `docs/CREDITS.md` 中明确「直接依赖 / 运行时调用 / 参考实现」的分类

---

## 十七、许可

[GNU Affero General Public License v3.0](LICENSE)

可自由使用、修改、分发；若作为网络服务提供给他人，须公开完整源码。
