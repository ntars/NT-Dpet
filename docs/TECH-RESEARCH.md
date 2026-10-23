# NT-Dpet 技术摸底（v0.2）

> 核实日期：2026-10-22　｜　状态：**动工前调研，未进入编码**
> 本文档只记事实与判断，不含任何已实施代码。
>
> **v0.2 变更**：补录 §5「DSH 宿主底账」。v0.1 完全没有登记 DSH 本体——它是本项目最大的依赖，这个缺口直接影响了好几项设计的可信度。同时关闭待验证 A/B/C 三项，并把生态插件的能力重叠问题（§5.5）首次写进底账。

## 关于可信度标注

调研过程中区分四类信息，全文统一标注，避免把推测当结论：

| 标记 | 含义 |
|---|---|
| `[已核实]` | 有官方仓库、官方文档或原始代码可直接验证 |
| `[第三方]` | 来自第三方评测站/博客，可能滞后或被误引，需二次确认 |
| `[待验证]` | 尚无可靠来源，需实测 |
| `[推测]` | 基于现有信息推理，未经证实 |

---

## 1. 项目定位

**NT-Dpet 是把分散的开源件拼装成「普通人能一键运行」的 AI 拟人伴侣桌面软件。**

它不发明人格算法，也不逆向任何协议；它的价值在编排、装配、守护与降级。

明确的**不做**清单：
- 不做自研人格模型（复用 NT-Sine）
- 不做协议逆向（只用现成协议端）
- 不做大模型训练（只做接入）

## 2. 能力域技术选型

### 2.1 人格 / 记忆 / 情绪 / 节奏

**来源：NT-Sine（主人自有项目，AGPL-3.0）** `[已核实]`

已实现的五层架构，可直接采纳：

| 层 | 模块 | 已实现内容 |
|---|---|---|
| 调度层 | `app/orchestrator.py` | 该不该回、延迟、回复长度、场景四档扫描深度 |
| 记忆层 | `app/memory/` | SQLite 三层（短期窗口 + 事实表 + 时间线）+ 世界书引擎 |
| 情感引擎 | `app/emotion/engine.py` | 五维状态机 mood/affection/trust/energy/intimacy，带衰减与单轮上限 |
| 生成层 | `app/generation/` | OpenAI 兼容客户端，改 `base_url` 即换模型 |
| 节奏层 | `app/output/rhythm.py` | 分条 8-25 字、条间停顿 0.6-2.5s、20% 概率 3-9s 长停顿、深夜变慢 1.6× |
| 主动消息 | `app/proactive/gate.py` | 三重闸门 + 放弃率 0.35 + 凌晨 1-6 点静默 |
| 日记 | `app/diary/` | 独白体生成、角度轮换 |

**世界书引擎的关键约束**（不可突破，源自 NT-Sine 方案）：
- 六层条目：L1 角色锚点 / L2 用户画像 / L3 情感状态 / L4 记忆事件 / L5 当前场景 / L6 边界规则
- 总预算硬顶 1600 token，按层分配（350/180/100/500/200/150）
- **中文必须关闭「匹配完整单词」**，引擎层强制，条目不可覆盖
- 仅 L4 可递归，最大递归步骤 3
- L4 场景卡互斥，同刻只留优先级最高的一张（防串味）

**人设 = 三个 JSON**（`l1_anchor.json` / `l2_user_profile.json` / `l6_boundary.json`）。
这意味着「人设可自定义、不锁定单一角色」在现有架构里天然成立，无需重训模型。

**必须改造的两处**（现有代码是单用户单人格）：
1. 单库单状态 → 多实例：`db_path` 与 `emotion_state.json` 需按「人 × 人格」维度隔离
2. 单人格 → 人格包：L1/L2/L6 三件套需支持导入/导出，并允许配套 LoRA 可选挂载

### 2.2 通道层

| 平台 | 方案 | 许可 | 判定 |
|---|---|---|---|
| QQ | **NapCat + OneBot 11** | 混合许可，明确要求衍生开发需作者授权 `[已核实]` | **不可内置**，只能运行时下载 + 子进程调用 |
| QQ（备选） | Lagrange.Core（.NET 协议实现） | 待核实 | 需要 .NET 运行时，与 Python/Node 混合栈叠加成本高 |
| QQ（管理壳） | SnowLuma | 待核实 | 仅替换 NapCat 的管理界面，不替代协议层 |
| 飞书 | 自建应用 + 机器人 API | 官方 | 合规首选 |
| 钉钉 | 企业内部机器人 API | 官方 | 合规首选 |
| 企业微信 | 群机器人 webhook + 客服 API | 官方 | 合规，但客服仅 1v1，进不了外部群 |
| 个人微信 | 无合规路径 | — | **不做**。详见 §8 风险 |
| 微信（可选） | OpenClaw 的 iLink 通道 | 第三方开源，非腾讯产品 `[已核实]` | 官方文档明确**仅支持私聊，不支持群聊** |

**架构要求**：上层内核不认识任何平台，只认统一消息模型（发送者 / 会话 / 文本 / 附件 / 时间 / 引用）。平台差异全部收在适配器内。

**参考实现**：AstrBot（**AGPL-3.0**，2026-10-22 核实约 42.8k star `[已核实]`）已支持 QQ / 微信 / 飞书 / 钉钉 / Lark 等 10+ 平台，其适配器抽象可作设计参考。AGPL-3.0 与本项目许可一致，可并入，需保留版权声明。

> 更正记录（2026-10-22）：本文档早期版本将 AstrBot 记为 MIT，经查其仓库 `LICENSE` 实为 **AGPL-3.0**。已修正全部三处。

### 2.3 表达能力

**TTS（说话）**

- 首选 **GPT-SoVITS v2Pro**（MIT）`[已核实]`
- 官方显存数据：推理 FP16 4.5GB / FP32 7GB；显存低于 4GB 自动落 CPU
- 版本选择：v2Pro / v2ProPlus 官方定位为「比 v2 稍高显存，性能超过 v4」，是当前推荐档
- 关键选型理由：素材只需 3-10 秒参考音频即可零样本合成，1 分钟素材可微调
- 服务形式：`api_v2.py` 提供 `/tts` 接口，支持流式

**SVC（唱歌）—— 与 TTS 是两套系统，不可混为一谈**

| 方案 | 最小素材 | 训练显存 | 训练耗时 | 音质特点 | 生态 |
|---|---|---|---|---|---|
| **RVC** | 约 30 分钟 | 6-8GB | 基准 | 稳定，高音偶有机械感 | 极好，底模丰富 |
| so-vits-svc 4.1 | 1 小时（建议 3-5 小时） | 10-12GB | 2-3 倍 | 颤音/假声明显更好 | 一般 |

`[第三方]` 数据来自多篇评测，绝对值会随版本与批大小变化，但**相对关系稳定**。

**判断：先上 RVC。** 门槛低、训练宽容、生态好；音色不满意再升级 so-vits-svc。

**表情包**

三条路线，选**模板 + 文字合成**（Pillow 绘制），辅以图库检索：
- 模板合成：可控、秒级、最像真人发的表情包，零模型依赖
- 图库检索：需 CLIP / 向量匹配，命中率看库质量
- AI 出图：每次数秒且有崩坏率，不适合聊天即时性场景 `[推测]`

**虚拟形象（Live2D）—— 存在许可陷阱**

- `pixi-live2d-display` 0.4.0 与 PixiJS 6.5.10 均为 MIT `[已核实]`
- **`live2dcubismcore.min.js` 是 Live2D Inc. 专有软件，不可随开源仓库分发** `[已核实]`
- 所有公开桌宠项目均声明「不包含、不分发该文件，需用户自行获取」

结论：AGPL 项目不能内置 Cubism Core。三条出路——
1. 首次运行时弹协议 → 用户确认 → 从 Live2D 官网下载到本地（合规，多一步）
2. 改用自研 WebGL 立绘渲染 + 序列帧/CSS 动画（绕开许可，表现力下降）
3. 一期不做桌宠，只在 UI 内展示立绘

### 2.4 行动能力

- **手机操控**：`adb` + `ADBKeyboard`（中文输入），思路沿用 ai-companion-kit 的 phone-mcp（34 个工具）`[已核实]`
- **游戏**：
  - Minecraft → **Mineflayer**（Node，MIT）`[第三方]`
  - 手机游戏 → 需自研决策环：截图 → 视觉模型识别 → 动作规划 → adb 执行 → 结果校验。**phone-mcp 只提供动作，不提供决策**，这部分是新增工作量 `[推测]`

### 2.5 模型接入

统一走 **OpenAI 兼容端点**：

| 场景 | 端点形态 |
|---|---|
| 云端 API（DeepSeek / 通义 / 智谱 / OpenAI 等） | `https://.../v1` |
| Ollama | `http://127.0.0.1:11434` |
| LM Studio | `http://127.0.0.1:1234` |
| mlx-lm（Apple Silicon） | `http://127.0.0.1:8081` |
| vLLM / llama.cpp server | 各自默认端口 |

一层抽象即可覆盖全部，换模型不改代码。

### 2.6 部署与分发

**「一键部署」的现实形态：引导器，不是单文件 exe。**

依赖构成决定了不可能离线单文件：
- Node 运行时（NapCat / OpenClaw / Mineflayer）
- GPU 推理环境（CUDA / ROCm / MPS）
- adb 二进制
- 模型权重（数百 MB 至 GB 级）

因此采用 **引导器模式**：小型启动器 → 环境探测 → 按需下载到 `runtime/` → 完整性校验 → 拉起进程树 → 健康检查 → 崩溃自愈。

**三端差异（这是「三端并行」的真实成本）** `[推测]`：

| | Windows | macOS | Linux |
|---|---|---|---|
| Python 运行时 | 便携版 embeddable | 系统或 venv | 系统或 venv |
| 系统依赖 | VC++ 运行库 | codesign + 公证（需开发者账号） | glibc 版本 |
| GPU | CUDA | MPS（推理慢于 CPU） | ROCm / CPU |
| 打包 | NSIS / Inno Setup | .app + dmg | AppImage / deb |
| 特殊障碍 | 路径空格与中文 | Gatekeeper 拦截、ARM/x86 双架构 | Wayland 权限 |

### 2.7 前端

**主 UI 用 Web（FastAPI 托管静态资源 + 浏览器访问）**，理由：三端并行下唯一不重复写三遍的路径。

唯一例外是**透明桌宠窗口**，必须 Electron 或 Tauri 单独实现，按需启动、可完全关闭。

---

## 3. 许可矩阵

| 项目 | 许可 | 能否并入 AGPL-3.0 仓库 | 处理方式 |
|---|---|---|---|
| NT-Sine | AGPL-3.0 | 可以（同族） | 直接采纳，保留版权与来源标注 |
| ai-companion-kit | MIT | 可以 | 保留原版权声明 |
| AstrBot | **AGPL-3.0** | 可以（同许可） | 保留原版权声明 |
| GPT-SoVITS | MIT | 可以 | 保留原版权声明 |
| Mineflayer | MIT | 可以 | 保留原版权声明 |
| RVC | MIT | 可以 | 保留原版权声明 |
| MaiBot | GPL-3.0 | 可以（AGPLv3 与 GPLv3 双向兼容） | 保留原版权声明 |
| pixi-live2d-display | MIT | 可以 | 保留原版权声明 |
| **NapCat** | **混合许可，要求衍生授权** | **不可以** | 运行时下载 + 子进程调用，不修改不内置 |
| **Live2D Cubism Core** | **专有软件** | **不可以** | 用户自行获取，或改用开源渲染 |
| OpenClaw | 待核实 | 待定 | 若仅作可选外部依赖，不并入仓库 |

**AGPL-3.0 的两条现实代价**（选定即接受）：
1. **网络服务条款（第 13 条）**：若将来提供云端托管版，必须向使用者提供完整源码，等于放弃闭源 SaaS
2. **生态代价**：会劝退部分想闭源二次开发的用户与企业客户

---

## 4. 硬件基线

按「能否跑本地音色」分三档：

| 档位 | 配置 | 可支撑能力 |
|---|---|---|
| 最低 | 无独显 / 4GB 显存以下 | 仅云端 API + 云端 TTS，本地音色不可用 |
| 推荐 | NVIDIA 8GB 显存以上 | 本地 LLM（4B 量化）+ GPT-SoVITS v2Pro 推理 |
| 完整 | NVIDIA 12GB 以上 | 上述 + RVC 训练 + LoRA 微调 |

**Apple Silicon 特殊说明** `[已核实]`：GPT-SoVITS 官方配置中，Mac 训练强制 FP32 走 CPU、推理走 CPU，MPS 反而更慢。因此 **Mac 上本地音色实用性有限**，应默认降级到云端 TTS 并在 UI 明确提示。

---

## 5. DSH 宿主底账 `[已核实]`

**本节为 2026-10-22 补录。** 此前版本未登记 DSH 本体——而它是本项目最大的依赖，属于底账的结构性缺口。本节所有条目均来自本机已安装产物与官方仓库，可逐条复查。

### 5.1 本体

| 项 | 值 | 证据 |
|---|---|---|
| 仓库 | `github.com/deepseek-ai/deepseek-harness` | 官方仓库 |
| 许可 | **MIT** | 仓库 LICENSE；`@deepseek-ai/dsh-llm/package.json` 的 `license` 字段 |
| 底层框架 | **Cordis 4.x**（`@deepseek-ai/cordis ~4.0.5`） | 各包的 `peerDependencies` |
| 架构主张 | 「一切皆插件」，agent loop 本身也是插件 | 仓库 README；`dsh-agent-loop` 为独立包 |
| 运行 | `npx @deepseek-ai/dsh web`，默认 `127.0.0.1:3080` | 官方 README |
| 阶段 | 开发者预览，**明确声明会有破坏兼容性变更** | 官方 README |
| 本机实测版本 | `0.2.1-rc.2` | 已装包 `package.json` 的 `version` |
| Node 要求 | `^20.19 \|\| >=22` | 官方快速开始 |

**版本策略的直接后果**：DSH 处于开发者预览且自述会破坏兼容，所以「锁定具体版本」不是保守，而是必须。已与决策 11 一致。

### 5.2 profile 机制 `[已核实]`

实测 `~/.dsh/profiles/desktop/package.json` 的真实结构：

```json
{
  "name": "dsh-profile-desktop",
  "dependencies": { "dshmarket": "1.66.45", "dsh-pet": "0.3.7" },
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "..."] } }
}
```

- profile 目录内即一个 pnpm 工程：`package.json` + `pnpm-lock.yaml` + `pnpm-workspace.yaml` + `node_modules/`
- 生效手段是 `cordis.yml` 与 `cordis.patch.yml`（实测分别 223 B / 33 KB）
- **`dsh.profile.bundles` 是一个有序数组**——加载顺序可读可改，这正是「整装组合包」的挂载点

**这印证了架构文档 §2 的假设**：组合包 = 一组依赖 + 一段 bundles 顺序 + 一份 patch。假设成立。

- 安装命令：`dsh plugin --profile <name> add <pkg>`
- 查看生效配置：`dsh --profile <name> --dump-config`
- **`desktop` profile 由 Electron 应用独占**，CLI 会直接拒绝：`error: profile "desktop" is managed exclusively by the Electron application` `[第三方]`（社区文档一致陈述，本机未复现拒绝行为）

**对本项目的直接约束**：我们要接管的是 `desktop` profile，因此安装流程**不能依赖 CLI**，必须由 Electron 主进程自己改动 profile 的 `package.json` 与 patch，或改用独立的 profile 名。这是编码前必须定的事。

### 5.3 LLM 服务可以脱离 agent loop 单独调用 `[已核实]`

**这是架构 §2.2 成立的前提，原「待验证 #1」，现结论为成立。**

依据 `@deepseek-ai/dsh-llm` 中文 README 原文：

> 任何调用模型提供方的组合——agent loop（智能体循环）、会话标题生成器、压缩（compaction）摘要器——都会通过本服务流式发起请求。

即 agent loop 只是「消费方之一」，不是必经路径。最小可用组合只有两个包：

```yaml
- name: '@deepseek-ai/dsh-llm'
- name: '@deepseek-ai/dsh-llm-deepseek-api-key'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
```

调用形态（README 原样示例）：

```ts
for await (const chunk of ctx.llm.stream({
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
})) {
  // chunks: block-start, text-delta, ..., usage, finish
}
```

辅助事实：
- `dsh-llm` 的依赖里**没有** `dsh-agent-loop`，反向依赖不成立
- 每个流必以 `finish` 收尾：正常、`{ kind: 'error' }`、`{ kind: 'aborted' }`
- 失败带稳定 code：`NO_ADAPTER` / `MISSING_CREDENTIAL` / `INVALID_CREDENTIAL` / `AUTH` / `RATE_LIMIT` / `CONTEXT_WINDOW_EXCEEDED` / `QUOTA`，**按 code 分支，不解析文案**
- provider 名：`deepseek-official`；entry id 约定 `llm-deepseek`（API Key）与 `llm-deepseek-account`（账号登录）
- 本服务**不自行重试**，重试归 `dsh-llm-retry`

### 5.4 隐私：会话日志上传的实际行为 `[已核实]`

原架构称「`session-log-deepseek` 默认上传、开关关不掉、重开还会补传」。核对源码与文档后，**结论成立，但需要修正措辞**：

| 事实 | 出处 |
|---|---|
| `enabled` 默认 `true`，随附 profile 默认挂载 | 该包 README 配置表 |
| 关闭后重开，**会继续补传关闭期间记录的事件** | 原文：「重新开启后继续上传尚未确认的后缀，包括关闭期间记录的事件」 |
| 上传是「至少一次」，崩溃可能重放已接受范围 | 原文「接受与重试」节 |
| `maxBytes` 默认 8 MiB，超限**分多次请求续传** | 同上 |
| 开关位置：设置 → 通用 → 在使用官方模型 API 时上传 Session Log | 同上 |

**措辞修正**：开关本身是有效的（`enabled: false` 会停止贡献），但**不追溯清空**——已记录的事件会在重开时补发。所以「关掉开关就干净了」是错的，必须在配置层硬关，且不依赖用户手动关闭。

**新增的关键发现（此前未记录）**：

> 缺少存活会话的直接请求会省略 `dsh_session_log`。

含义：只要调用不带存活 `sessionId`，该字段**根本不会进请求体**。agent、压缩、会话标题调用都携带存活会话 id，所以它们会上传；而我们自建的 dialogue 通道若不建 DSH Session，天然不触发。

**这使架构 §2.2 的「额外收益」从「暴露面更小」升级为「按代码路径不触发」，但附带一条硬约束**：dialogue 必须自己管消息存储，**不得为省事去建 DSH Session**；一旦建了会话，隐私优势立刻消失。

### 5.5 生态现状：能力重叠风险 `[已核实]`

本机 `desktop` profile 已安装的插件里，有四个与 NT-Dpet 计划自研的包**功能重叠**：

| 已装插件 | 版本 | 已提供的能力 | 与哪个自研包重叠 |
|---|---|---|---|
| `dsh-pet` | 0.3.7 | 97 个手绘透明动画、待机呼吸、随机动作、屏幕漫游、点击 Q 弹、拖拽甩抛、右键点播、联想气泡、**碎碎念与对话（可配表情包）**、多开同屏、**透明置顶独立桌面窗**、pet pack 自定义物种、亲密度/投喂系统 | 桌宠、表情包、主动消息的呈现层 |
| `dsh-soul-md` | 0.10.2 | 人格 `soul.md`、**分层记忆**（`memory_read/search/append` + topic 体系，persona 覆盖 global）、关键词检索、可选回忆、压缩后回忆恢复 | 人格、记忆检索、世界书部分 |
| `dsh-context` | 0.74.0 | 上下文管理 | 世界书预算 |
| `billion-context` | 0.1.203 | 长上下文扩展 | 记忆/上下文 |

`dsh-pet` 尤其需要注意：它的 `~/.dsh/pet.json` 已含 `petId: "whale-girl"`、`affinity`（亲密度/抚摸/投喂/拒绝计数）、`treats`、`display`（可见性/尺寸/坐标/气泡缩放）——**鲸鱼娘 + 亲密度 + 桌面浮窗**，与 NT-Dpet 的默认人格「小鲸鱼」和桌宠定位高度重合。而且它提供 `npx dsh-pet-standalone`，可完全不启动 DSH 独立运行。

**这不是「要不要抄」的问题，是「要不要重造」的问题。** 29 个包的设计完成于发现这些既有实现之前，因此存在重复投入的风险。是否需要调整包划分，属于主人决策，本文档只记录事实。

### 5.6 其余可复用底座 `[已核实]`

已装包共 **307 个**官方包 + 十余个第三方包。与项目相关且无需自研的：

| 能力 | 官方包 |
|---|---|
| 文件访问 | `dsh-fs-local`（若存在）／内置工具链 |
| 终端 | `dsh-bash-local`、`dsh-bash-sandbox` |
| 定时 | `cordis-plugin-timer` |
| 附件 | `dsh-attachment`、`dsh-attachment-local` |
| 设置界面 | `dsh-client-ui-settings-*` 系列 |
| 模型选择 | `dsh-client-ui-model-selection` |
| 多模型适配 | `dsh-llm-deepseek`、`dsh-llm-pi-ai` |

### 5.7 外部项目核查（第二轮，2026-10-22）

主人点名四个项目：WXAUTO、AIRI、dsh-bili-whale、yangyu-bot。逐个查证结果如下。**其中一项不成立、一项查无此项目**，先说清楚，再谈怎么用。

#### 5.7.1 WXAUTO：原版跑不了，等价物有，但依然不建议做核心

| 事实 | 依据 |
|---|---|
| 原版是 `cluic/wxauto`，Python，约 7.4k star | 仓库首页 |
| **仅支持 Windows 10/11**，基于微软 UIAutomation 框架 | README「环境」小节 |
| README 原文：「代码仅用于对 UIAutomation 技术的交流学习使用，**禁止用于实际生产项目**，请勿用于非法用途和商业用途」 | 仓库 README |

**这台机器是 macOS，原版 wxauto 根本装不上。** 这是硬前提错误，不是配置问题。

macOS 上确实有等价物，且都是「AppleScript + Accessibility API」而非 UIAutomation：

| 项目 | 形态 | 能力 |
|---|---|---|
| `PatrickHua/wxauto-mac` | Python 库，`pip install wxauto-mac` | `GetAllFriends()` / `SendToFriend()` / `GetChatHistory()`，API 刻意对齐 wxauto |
| `s7arfish/wxauto-mcp-macos` | MCP Server | `send_message` / `get_recent_messages` / `check_unread` |
| `Good0007/opencli` 的 wechat 适配器 | CLI | 状态、发送、读取、搜索、切页 |

但它们的实现原理决定了三件事，必须正视：

1. **需要「辅助功能」系统授权**——等于把整台电脑的 UI 控制权交出去，不只微信。
2. **读取靠 `Cmd+A → Cmd+C` 全选复制**，发送靠剪贴板粘贴 + 回车。这不是「接口」，是「替你点鼠标」，微信一改界面就碎。
3. 会动到**全部聊天记录**。这直接撞上主人的隐私红线。

叠加 §9 已登记的事实——2025-12 豆包手机助手因模拟点击被强制下线——结论是：

> **不作为核心通道，不做默认开启项。** 若主人坚持要，只做「只发不收」的可选外部桥（我们自己生成的内容发出去，不读任何历史消息），默认关闭并带风险弹窗。

#### 5.7.2 AIRI：形象层的真正答案，但不能当依赖装

`moeru-ai/airi`，MIT，TypeScript + Vue3 + pnpm/turborepo，约 5 万 star，当前版本 `v0.12.0-beta.5`。有 Web / macOS / Windows 三态。

它的包拆分几乎就是我们要的 `avatar` + `pet` 的完整答案：

| AIRI 包 | 对应我们的 | 说明 |
|---|---|---|
| `model-driver-magic-live2d` | `@nt-dpet/avatar` | Live2D 模型驱动 |
| `model-driver-lipsync` | `@nt-dpet/avatar` | 嘴型同步，底层是 `wlipsync` |
| `model-driver-mediapipe` | — | 摄像头面部追踪（让它看见主人的表情） |
| `core-character` | `@nt-dpet/persona` | 角色内核 |
| `pipelines-audio` | `@nt-dpet/tts` | VAD / ASR / TTS 管线 |
| `electron-native-backdrop` | `@nt-dpet/pet` | **macOS 透明 Electron 窗的区域模糊**，含原生构建 |
| `electron-screen-capture` | — | 屏幕捕获 |

**关键约束（这决定我们只能怎么用）**：AIRI 的全部 `packages/*` 都是 `"private": true` + `workspace:^` 引用，**没有发布到 npm，无法 `npm i @proj-airi/xxx`**。所以只有两条路：

- **参考实现**（推荐）：读它的设计，用我们自己的 PixiJS + pixi-live2d-display 重写。我们技术栈本来就一致（CREDITS 已列这两个 MIT 库）。
- **按 MIT 单文件 vendor**：只搬必要时长的具体实现，保留版权声明。整包搬会连带扛上它的 3110 个依赖。

唯一可以**直接依赖**的是 `wlipsync`（MIT，npm 最新 1.3.1）——独立库，不绑 AIRI。

#### 5.7.3 dsh-bili-whale：不是形象参考，是「主动性」的教科书

`Alterssss/dsh-bili-whale`，MIT，JavaScript，当前 `v0.4.5`，2026-10-17 建仓。它是个 DSH 插件：按作息自己刷 B 站、读字幕弹幕评论抽帧、写两本日记、挑值得的 @ 主人。

它做的功能（刷 B 站）对我们没用，**但它的克制机制正中我们 `@nt-dpet/proactive` 的空白**：

| 它的设计 | 我们现在的状态 | 价值 |
|---|---|---|
| 窗口内**随机一个时刻**醒，不是整点 | 决策 74 只定了「唤醒随机开口 10%」 | 补上「什么时候醒」这一层 |
| **30% 概率今天不想看**（它也有权利不看） | **没有** | 宠物必须有不主动的自由，否则是机器人 |
| **两本日记**：给主人的信（有细节有情绪）+ 自己那本（不加滤镜） | `memory` 只有双层存储，无视角区分 | 主动性与隐私分离的正确做法 |
| **沉默衰减**：连续 3 天无表态 → 分享额度降 → 第 7 天归零，但日记照写 | **没有** | 这是情感逻辑不是限流逻辑：不是「少打扰」，是「不被回应就收起心事」 |
| 主人直接回；**其他人先写草稿送审** | `privacy` 包未细化到此 | 对外发言一律走草稿 |
| 撞风控**立刻停手并报告** | 风控三层有，缺「停手后怎么办」 | 补停机上报 |
| 人设存 `~/.bili-ai/persona.md`，**五段式，取前 3000 字** | `personas/xiaojingyu/` 的 L1 四变体 content 全是 `null` | **直接可用的撰写模板** |
| 数据目录 `~/.bili-ai/`（人设 + 凭据 + 账本同放），换机器拷目录就走 | `dsh-home` 与用户资产未分层 | 对应我们该有的 `…/NT-Dpet/user/`（见 DECISIONS S4），不能混进 `dsh-home` |
| 插件**不内置任何人格**，默认中性 | 与我们的「人格包外置」一致 | 互相印证 |

人设五段式（顺序即优先级，因为只取前 3000 字）：`# 我是谁` / `# 说话` / `# 我在意什么` / `# 我绝不会` / `# 日记怎么写 / 分享的标准`。

#### 5.7.4 yangyu-bot：查无此项目

按这个名字在 GitHub、npm、dsh.pub 插件目录检索，**没有找到对应项目**。撞名但不相关的有两个：

- `YangYu-bot-droid`——一个 GitHub **用户**（中国石油大学学生），仓库是 CFD-DEM 多相流仿真，与此无关。
- `YTCdev/yangubot`——Discord + WooCommerce 商店机器人，2023 年已归档。

**需要主人补一个仓库链接或准确名字。** 在拿到确切来源前，不为它做任何设计假设。

### 5.8 插件加载机制实证 `[已实测，2026-10-23]`

用独立 `DSH_HOME` 实测了「独立 profile + 自定义包能否被 DSH 加载」这条全链路。**这是 S0 最大的风险点，现在已解除。**

#### 5.8.1 CLI 从哪来

`dsh` CLI **不在 PATH 里**，桌面版把它藏在 App 内部：

```
/Applications/DeepSeek Harness.app/Contents/Resources/app/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js
```

`@deepseek-ai/dsh` 的 `package.json` 里 `bin: { "dsh": "lib/bin.js" }`。用**系统 node 22.22.2 就能跑**（App 要求 node 24，但 CLI 层面 22 兼容，实测无报错）。

> `Resources/runtime/bin/node` 是个 shim 脚本，依赖 App 主进程注入的 `DSH_DESKTOP_NODE_EXECUTABLE`，**不能独立调用**。别指望用它。

#### 5.8.2 `DSH_HOME` 隔离确认为真

```
DSH_HOME=/tmp/nt-dpet-probe/dsh-home node <bin.js> --version
→ 0.2.1-rc.2，且该目录保持为空
```

`--version` 跑完独立 home 里一个文件都没生成，说明**没有被偷偷写回 `~/.dsh`**。隔离四层的第一层成立。

#### 5.8.3 独立 profile 可以凭空创建

```
node <bin.js> --profile nt-dpet --from-default-profile web --dump-config
```

不需要先 `plugin add`。`--from-default-profile web` 会用内置 web 模板建出 profile。生成结构：

```
$DSH_HOME/profiles/nt-dpet/
├── cordis.yml           ← 空 entry list，注释明确写「Edit cordis.patch.yml, not this file」
├── cordis.patch.yml     ← 用户层覆盖，这才是我们该改的
├── package.json         ← dsh.profile.bundles = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]
└── pnpm-workspace.yaml
```

**层级顺序**（引自 schema 的 `$comment`）：bundle layer → profile layer → home layer → CLI layer，依次叠加；**一层 patch 的 config 是整块替换，不是深合并**。

#### 5.8.4 patch 语法：两写法一字之差，一个是「静默丢弃」

实测三种写法，结果如下：

| 写法 | 结果 |
|---|---|
| `- insert: [ {id, name} ]` | ✅ **正确**，entry 出现在合成树末端 |
| `- id: ..., name: ...`（裸 entry，不带 `insert`） | ❌ **不报错、不警告、直接消失** |
| `- insert: [ {group:true, name:"cordis:group", config:[]}, {group:"父id"} ]` | ✅ 支持，可把包挂进分组 |

第二条是最危险的：写错了没有任何提示，插件就是不见了。

`--dump-config` 的输出里会用 `# == <patch文件路径>` 注释标出每一层的来源，末尾那段就是自己被采纳的部分。**以后每写一个 `cordis.patch.yml`，都先 dump 一次看它有没有出现在树里。**

`id` 用冒号分段的 `nt-dpet:core:emotion` 形式**合法**，实测无报错。

#### 5.8.5 自定义包确实能被加载

最小包（`package.json` + `index.mjs` 导出 `name` / `apply(ctx)`），软链到 profile 的 `node_modules/@nt-dpet/probe`，然后：

```
node <bin.js> --profile nt-dpet --patch ./a.yml --no-open --port 3180
→ [NT-DPET-PROBE] 包已加载，ctx 存在: true
→ dsh web: http://127.0.0.1:3180/?token=aY70Doy-...
```

`apply(ctx)` 真的被执行了，服务真的在指定端口起来了。**29 包粒度方案在加载层面可行。**

#### 5.8.6 加载失败是「软失败」——这条必须写进产品设计

反证实验：故意挂一个不存在的包 `@nt-dpet/does-not-exist-at-all`。

```
dsh: warning: 1 entry did not activate
nt-dpet:bogus (@nt-dpet/does-not-exist-at-all): failed to import:
  Error [ERR_MODULE_NOT_FOUND]: Cannot find package ...
dsh web: http://127.0.0.1:3182/?token=...        ← 服务照常起来了
```

**插件加载失败不阻断启动，只打一行 warning。** 这意味着：

- 用户看到窗口正常打开、界面正常显示，以为一切正常
- 实际上某个包根本没加载，功能静默缺失
- 而 `--no-open` 模式下连这行 warning 都可能没人看

对照实验的三组结果，证据链是完整的：

| 挂载对象 | 日志表现 | 结论 |
|---|---|---|
| 自建 probe 包（带 console.log） | 打印 `包已加载，ctx 存在: true`，无 warning | 加载并执行 |
| **真实构建产物** `@nt-dpet/emotion` | **无 warning** | 加载成功（loader 只对失败告警） |
| 不存在的包 | `1 entry did not activate` + 完整堆栈 | 失败可见但不阻断 |

**由此得出一条产品要求**：NT-Dpet 每次启动必须做 **entry 激活自检**——比对「配置树里的 entry 数」与「实际激活数」，不一致就在界面上报警，而不是让它静默降级。这条要落进 `@nt-dpet/privacy` 或独立的启动自检模块。

#### 5.8.7 参数顺序有个坑

```
✅ dsh --profile nt-dpet --patch <file> --no-open --port 3180
❌ dsh --profile nt-dpet --patch <file> web --no-open --port 3180
```

第二种会报 `error: too many arguments. Expected 0 arguments but got 1: web.`——**用了 `--profile` 就不要再写 app 名**，app 由 profile 的 bundles 决定。`--help` 里的例子 `dsh web --patch ./extra.yml` 是「把 web 当 profile 名」的另一种用法，两者别混。

#### 5.8.8 顺带确认的安全事实

启动日志打印的 URL 带**随机 token**（`?token=...`），每次启动都不一样，不是固定值。默认绑 `127.0.0.1`。这两点与 §9 风险登记里 NapCat 因 `0.0.0.0` + 固定 token 被扫描出事的历史正好相反，方向是对的。

`/api/*` 全部要求鉴权，直接拿 token 当 query 参数访问会 401——browser-trust fence 只认浏览器侧建立的信任，不接受裸 token 直连。这一层是好的。

#### 5.8.9 构建链现状

- `pnpm` 不在 PATH，需 `npx pnpm@9`（实测 9.15.9）。`corepack` 也在一，但会拉到 12.x，与 `packageManager: pnpm@9.15.0` 不一致，**统一用 npx pnpm@9**
- 29 个包原先**都缺 `@deepseek-ai/cordis` 依赖声明**，`tsc` 全部报 `TS2307: Cannot find module '@deepseek-ai/cordis'`。已统一补 `peerDependencies` + `devDependencies` 为 `^4.0.5`（npm 上 latest 即 4.0.5，MIT）
- 补齐后 `pnpm -r --filter './packages/**' build` **29 个包全部通过**
- 产物导出形态实测：`Object.keys()` → `['apply', 'name']`，`name` 为 `nt-dpet-emotion`，`apply` 为 function——符合 Cordis 4 的具名导出约定

### 5.10 dialogue 通道实证：不建 Session 也能调模型 `[已实测，2026-10-23]`

**待验证 #9 关闭。** 隐私约束的最大悬念解除：dialogue 包可以完全不建 DSH Session 地拿到模型回复。

#### 5.10.1 实测链路

探针插件（`export const inject = ['llm']`）直接 `ctx.llm.stream()`，LLM 路由配置全部走 patch：

```yaml
- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      magpie:
        displayName: 星玖优选（magpie 本地网关）
        api: openai-completions
        baseURL: http://127.0.0.1:3425/v1
        apiKeyEnv: MAGPIE_API_KEY
        models:
          - id: group/ntars
            name: 星玖优选
            contextWindow: 1048576
            maxTokens: 384000
            reasoningEfforts:
              high: high
```

凭据走环境变量 `MAGPIE_API_KEY=magpie`——**patch 里永远不写密钥明文**，`apiKeyEnv` 按请求解析。实测结果：

```
[chunk 0] block-start  blockType=reasoning
[chunk 1] reasoning-delta  "The"
[chunk 2] block-start  blockType=text
[chunk 3] text-delta   "好的"
[chunk 5] block-end reasoning
[chunk 6] block-end text
[chunk 7] usage  inputTokens=342 outputTokens=14
[chunk 8] finish reason={kind:"stop"} replayState={provider:"magpie",...}
```

**要点确认**：

- 未建任何 Session，请求照常流动——「dialogue 不得建 Session」的隐私约束不需要付出功能代价
- 流以 `{type:'finish', reason:{kind:'stop'}}` 终结， ошиб토没有 error / aborted，与 README 「每流恒一个终态分片」一致
- reasoning 内容走独立的 reasoning-delta 分片，正文走 text-delta——对话通道过滤掉 reasoning block 即可拿到干净正文

#### 5.10.2 又一条实测教训：inject 必须显式

探针第一版直接 `ctx.llm`，加载失败：

```
Error: cannot get property "llm" without inject
```

且插件**整个不激活**（`1 entry did not activate`），不是只失败那一个属性读取。这印证 §4.2 第 2 条，且升级了它的严重性：**不是「读不到」，是「插件不存在」**。

另一个坑：patch 覆盖已有 entry（如给 `llm-pi-ai` 传 config）时**必须写 `id`**，报错为 `patch: id is required for non-insert patches`。`insert` 分支可以不写 id（loader 会生成），非 insert 的覆盖分支必须指明要覆盖谁。

#### 5.10.3 `ctx.llm.listProviders()` 返回空数组

`listProviders()` 报 `[]`，但 `stream({provider:'magpie'})` 照常工作。含义：**listProviders 报的是「GUI 可选目录」，手工声明路由不在其中**；README 说「GUI 需要目录成员资格才能选择」，探针走代码直调不受限。**对 NT-Dpet 的含义**：如果将来想在设置界面里让用户直接选模型，可能需要走 `models` 目录声明而不是手工 providers；两条路都通，先按手工 config 走。




---

### 5.11 接口层可行性：插件可注册 HTTP 路由 `[已实测，2026-10-23]`

M0.1.1 的问题：上游是否允许自定义插件注册 HTTP 路由，决定界面接线走「插件内暴露接口」还是「另起本地服务」。

#### 5.11.1 结论

**可行，采用方案 A。** 上游 `@deepseek-ai/dsh-host-webserver` 提供 Cordis 服务 `webServer`，插件注入后即可注册具名路由。

| API | 签名 | 用途 |
|---|---|---|
| `ctx.webServer.register(route)` | `{ kind: 'exact' \| 'prefix', path, handler(req, res) }` → disposer | 注册 HTTP 路由 |
| `ctx.webServer.registerUpgrade(route)` | `handler(req, socket, head)` | WebSocket 升级 |
| `ctx.webServer.registerFallback(handler)` | 单一所有者，重复注册抛错 | SPA 回退位 |
| `ctx.webServer.tapIndex(transform)` | `(html) => html` | 向 index.html 注入片段 |
| `ctx.webServer.getOrigin()` | `http://127.0.0.1:<port>` | 取本机访问根地址 |

匹配顺序固定：先精确路由，再最长前缀，最后回退 handler。

#### 5.11.2 证据

包内未随附类型声明（`lib/` 只有 `index.js`），因此结论来自运行时探针，不是读文档推断：

```
[http-probe] webServer 存在: true
[http-probe] 方法: register,registerUpgrade,registerFallback,getOrigin
[http-probe] origin: http://127.0.0.1:3189
[http-probe] 已注册 /api/ntdpet/health
```

```
$ curl http://127.0.0.1:3189/api/ntdpet/health
HTTP 200
{"ok":true,"service":"nt-dpet","path":"/api/ntdpet/health","at":1792758246059}
```

#### 5.11.3 安全发现：自定义路由不经过宿主鉴权

这是本次探测最需要记住的一条：

| 请求 | 结果 |
|---|---|
| 自己注册的 `/api/ntdpet/health`，**不带任何凭据** | **200**（直接进 handler） |
| 未注册的 `/api/other` | **401**（宿主鉴权围栏拦下） |
| 前缀路由 `/api/ntdpet`，不带凭据 | **到达 handler**（探针内抛错，返回 400） |

即：宿主的鉴权挂在它自己的 `/api` fetch handler 上，**只保护它认领的路径**。我们注册的 exact / prefix 路由绕过了它。

宿主的鉴权机制是**签名 Cookie**（`dsh-client-connection`）：URL 上的 `?token=` 换取 Cookie，服务端用激活期密钥验签，失败返回 `401 dsh web authentication required`。

`connection` 服务对插件只暴露 `authenticatedUrl`，`isAuthenticated` / `writeUnauthorized` 均非公开（运行时实测 `typeof` 均为 `undefined`）。因此**无法直接复用宿主的鉴权判定**。

#### 5.11.4 由此确定的自鉴权设计

接口层必须自己做鉴权，不能依赖上游：

1. 启动时生成 32 字节随机 token，落 `…/NT-Dpet/user/api-token`（`0600`）；同机同用户进程仍可读，故它挡的是浏览器跨站与误连，不是本机恶意进程
2. 用 `tapIndex()` 把 token 注入 index.html（`window.__NTDPET_TOKEN__`），页面同源加载才能拿到；跨源页面读不到
3. 路由统一校验：`X-NTDPet-Token` 头或 `?token=` 必须匹配，否则 `401` + `no-store`
4. 不设 `Access-Control-Allow-Origin`；校验 `Origin` 头，非本机同源一律拒绝
5. 响应统一 `cache-control: no-store`、`x-content-type-options: nosniff`
6. 只注册 `prefix` 一条 `/api/ntdpet`，不散落多个 exact 路由，便于集中校验

#### 5.11.5 为什么不选方案 B（独立本地服务）

| 维度 | 方案 A（插件内注册） | 方案 B（另起 9061 服务） |
|---|---|---|
| 端口 | 复用宿主端口，无需额外监听 | 多一个端口，多一处失败点 |
| 鉴权 | 自建 token（必须做） | 同样要自建 token |
| 生命周期 | 随插件加载/卸载，天然干净 | 需 desktop 另行拉管，崩溃要重拉 |
| Electron 场景 | 同一进程内直调，链路最短 | 需跨进程 HTTP，多一层 |

方案 B 的唯一优势是「浏览器里独立调试」，但方案 A 在 `dsh web` 模式下已经是浏览器可访问的，这个优势并不成立。因此选定方案 A，方案 B 仅作为「宿主不提供 webServer 时」的退路记录在此。

#### 5.11.6 一条工具层面的教训

排查时把 `/Applications/DeepSeek<空格>Harness.app` 写成连字符，导致多次「包不存在」。用码点核对后确认：**磁盘上的名字含 U+0020 空格**，而命令输出与日志显示时会把它渲染成 `-`，肉眼极易误判。

同一现象此前在 README 路径上误导过两次。今后遇到路径类「文件不存在」而 `ls` 明明列得出来时，先打印码点，不要靠眼看。

#### 5.11.7 二次复核：类型声明与独立复现 `[已核实，2026-10-23 晚]`

同一天晚间的复核，补两件上一轮没记的事。

**类型声明确实存在于 npm 包**（App 内 `lib/` 不带 `.d.ts`，见 §5.11.2；npm 包带，可作为长期依据）：

```
$ npm pack @deepseek-ai/dsh-host-webserver@0.2.1-rc.2
$ tar xzf … && ls package/lib/types
index.d.ts  injections.d.ts
```

`index.d.ts` 原文可查到的契约：`register(route) → disposer`、`registerUpgrade`、`registerFallback`（单一所有者，重复注册抛错）、`tapIndex`、`getOrigin()`；匹配顺序写死为「先 exact 表，再最长前缀，最后 fallback」；`host` 拒绝通配地址、端口写 0 由系统分配。包许可 **MIT**（`package.json` 的 `license` 字段），与 §3 许可矩阵一致，M0.1.2 引入时按 MIT 登记。

**独立复现**（临时目录，不进入仓库，只装 cordis + webserver 两个包，绑 `127.0.0.1:9061`）：

```
[probe] webServer 就绪 origin = http://127.0.0.1:9061
[probe] 可用方法 = register,registerUpgrade,registerFallback,tapIndex,getOrigin
[probe] 重复注册抛错: webserver: duplicate exact route "/api/ntdpet/health"
$ curl -s http://127.0.0.1:9061/api/ntdpet/health
{"ok":true,"service":"nt-dpet","path":"/api/ntdpet/health","at":1792758630228}
$ curl -s "http://127.0.0.1:9061/api/ntdpet/mood/recent?limit=3"
{"ok":true,"matched":"prefix","path":"/api/ntdpet/mood/recent?limit=3"}
$ curl -o /dev/null -w '%{http_code}' http://127.0.0.1:9061/api/ntdpet/other
404
```

结论不变：**方案 A**。同时纠正一处口误——M0.1.2 验收里写的「curl `127.0.0.1:9061`」在方案 A 下不成立：路由挂在宿主自己的监听端口上（`getOrigin()` 给的就是它），不存在第二个端口。9061 只在将来真的退到方案 B 时才用；「端口不占用 9060」这条仍然有效，因为方案 A 压根不新增监听。

---

## 6. 参考项目清单

| 项目 | 语言 | 许可 | 定位 | 备注 |
|---|---|---|---|---|
| NT-Sine | Python | AGPL-3.0 | 情感陪伴引擎（五层架构） | 主人自有，本项目内核来源 |
| ai-companion-kit | Node.js | MIT | 记忆/拟人化/手机操控/QQ空间 | 音色包 `her-voice` 已从仓库撤下 |
| NapCat | TypeScript | 混合 | QQ 协议端（OneBot 11） | 不可内置 |
| AstrBot | Python | AGPL-3.0 | 多平台机器人框架 | 通道抽象参考 |
| MaiBot | Python | GPL-3.0 | 拟人化 QQ 群聊智能体 | 记忆/人格设计参考 |
| GPT-SoVITS | Python | MIT | TTS / 少样本音色克隆 | 表达层核心 |
| RVC | Python | MIT | 歌声/音色转换 | SVC 首选 |
| so-vits-svc | Python | AGPL-3.0 | 歌声转换（音质优先） | 二期备选 |
| Mineflayer | Node.js | MIT | Minecraft 机器人 | 游戏能力 |
| pixi-live2d-display | TypeScript | MIT | Live2D 渲染 | 需配 Cubism Core |
| **AIRI** | TypeScript | MIT | 虚拟伴侣整体实现：Live2D/VRM、嘴型、语音管线、透明 Electron 窗 | 包全 `private`，**只能参考不能装**；见 §5.7.2 |
| **wlipsync** | TypeScript | MIT | Live2D 嘴型同步，从 AIRI 抽出的独立库 | 唯一可直接依赖的一项，npm 1.3.1 |
| **dsh-bili-whale** | JavaScript | MIT | DSH 插件的「主动性克制」范式：生物钟、拒绝权、双日记、沉默衰减 | 功能无用，机制有用；见 §5.7.3 |
| **wxauto** | Python | Apache-2.0（作者声明禁止生产使用） | Windows 微信 UI 自动化 | **仅 Windows，本项目用不上**；见 §5.7.1 |
| **wxauto-mac** | Python | 未核 | macOS 微信 UI 自动化（Accessibility API） | 原理同上，风险同 §9 |

star 数、最新提交时间等动态数据未写入本文档——此类数据变化快，用到时现场核对。

---

## 7. 待验证清单

动工前必须实测或查证，不能带假设开工。

### 7.1 已关闭项（2026-10-22）

| # | 原待验证项 | 结论 | 依据 |
|---|---|---|---|
| A | DSH 的 `llm` seam 能否脱离 agent loop 单独调用 | **成立**——agent loop 只是消费方之一，`ctx.llm.stream()` 可直接调 | §5.3 |
| B | profile 与 `dsh.profile.bundles` 结构是否符合架构假设 | **符合**，本机 `~/.dsh/profiles/desktop` 实测 | §5.2 |
| C | 会话日志上传是否默认开启、能否关净 | **默认开启**；`enabled: false` 有效但**不追溯**，重开会补发关闭期间的记录 | §5.4 |
| D | 插件能否注册自己的 HTTP 路由（决定界面接线方案） | **可以**——`ctx.webServer.register({kind,path,handler})`，实测 200。附带发现：自定义路由**不经过宿主鉴权**，必须自建 token | §5.11 |

### 7.2 仍待验证

| # | 待验证项 | 影响 |
|---|---|---|
| 1 | GPT-SoVITS 在 Apple Silicon 上的实际推理耗时（秒/句） | 决定 Mac 端是否默认关闭本地音色 |
| 2 | RVC 是否支持 Apple Silicon（MPS）训练与推理 | 决定 Mac 端唱歌能力是否存在 |
| 3 | 飞书 / 钉钉 / 企微机器人对**语音消息**与**图片**的发送限制 | 决定「会说话」在各平台能否落地 |
| 4 | NapCat 当前版本对 OneBot 12 的支持度 | 决定协议层按 11 还是 12 设计 |
| 5 | Live2D Cubism Core 的下载与商用授权具体条款 | 决定桌宠实现路线 |
| 6 | ~~OpenClaw 的许可类型与微信通道稳定性~~ → 已由 §5.7.1 取代：原版 wxauto 仅 Windows 且作者禁止生产使用；macOS 等价物为 AppleScript + Accessibility，风险已定性 | **已定性，待主人裁决是否要** |
| 7 | phone-mcp 的 34 个工具在非中文输入法、非标准分辨率下的兼容性 | 决定手机操控的通用性 |
| 8 | `desktop` profile 被 Electron 独占时，第三方安装器如何合法写入 | 决定安装器实现路径（§5.2） |
| 9 | dialogue 不建 Session 时，`dsh-llm.stream()` 是否仍可用 | **已实测成立**（2026-10-23）：探针插件未建任何 Session，直接 `ctx.llm.stream()` 经 `dsh-llm-pi-ai` 走 magpie 网关，拿到完整流（block-start → text-delta → block-end → usage → finish(stop)） | §5.10 |
| 10 | `dsh-web-app` 默认视图的配置字段名 | 决定决策 12（默认视图为对话）如何落地 |
| 11 | 第三方插件的 `engines.dsh` 与本机 `0.2.1-rc.2` 的兼容判定规则 | 决定组合包的版本锁定粒度 |
| 12 | 29 个包与既有生态插件的重划分方案 | 见 §5.5，**需主人裁决** |

---

## 8. 未决问题（需主人决策）

1. `kernel/` 代码同步策略：内置副本 + 变更记录人工合并，还是别的机制
2. 虚拟形象路线：用户自取 Cubism Core / 自研渲染 / 一期不做（AIRI 已给出参考实现，见 §5.7.2，但仍受 Cubism Core 授权约束）
3. 微信私聊通道是否纳入——**现状已查清**（§5.7.1）：原版仅 Windows 且禁止生产使用；macOS 等价物存在但需辅助功能授权、读全量聊天记录。建议不做，或只做「只发不收」的可选桥
4. 首发 MVP 的功能边界
5. 桌面端是否需要 Electron 桌宠组件，还是仅 Web UI（AIRI 的 `electron-native-backdrop` 证明 macOS 透明窗可行，见 §5.7.2）
6. `yangyu-bot` 具体指哪个仓库——**查无此项目**（§5.7.4），需主人补链接

---

## 9. 风险登记

| 风险 | 等级 | 说明 | 缓解 |
|---|---|---|---|
| **账号封禁** | 高 | 2025-09 NapCat WebUI 默认监听 `0.0.0.0` + 固定 token，被扫描后操纵 API 发违法信息，波及账号与群永久封禁 `[第三方，NapCat 前群管自述]` | 默认只监听 `127.0.0.1`；强制随机 token；首次启动安全自检 |
| **个人微信违规** | 高 | 腾讯三重锁死：协议层封禁、法律风险、行为学风控。2025-12 豆包手机助手因模拟点击被强制下线 `[第三方，多来源一致]`。wxauto 作者本人也写明「禁止用于实际生产项目」（§5.7.1） | 不做，或做成默认关闭+风险弹窗的可选插件 |
| **辅助功能授权的溢出风险** | 高 | macOS 微信自动化需授予「辅助功能」权限，拿到的是**整机 UI 控制权**而非仅微信；且读取靠全选复制，会触碰全部聊天记录 | 即使做也只「只发不收」，不申请读权限；权限用途在授权前明示 |
| **许可污染** | 高 | NapCat 要求衍生授权；Cubism Core 为专有 | 见 §3 许可矩阵 |
| **上游变更** | 中 | NapCat 发版密集（同日多次 patch），无迁移指南与回滚文档 `[第三方]` | 锁版本 + 保留旧产物 + 适配器隔离 |
| **硬件门槛** | 中 | 本地音色需 8GB+ 显存，普通轻薄本不可用 | 云端优先 + 能力探测 + 灰态提示 |
| **法律合规** | 中 | 拟人化内容、AI 生成音频标识要求 | 输出侧预留 AI 生成内容标识能力 |

---

## 10. 本文档的边界

- 未包含任何目录结构、类设计、接口定义——这些属于「大脉络」阶段
- 未包含工期估算——在功能边界确定前估算没有意义
- 所有第三方数据以标注为准，实测以实测报告为准
