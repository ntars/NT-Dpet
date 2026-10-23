# 上游候选清单（GitHub 全量扫描）

> 目的：把「NT-Dpet 能用到的开源项目与技术」一次性找齐、核实、定级，避免施工时靠印象选型。
> 扫描日期：**2026-10-23**。数据来源：GitHub Search API + Repos API（star 数、许可证、最后提交时间均为当日抓取）。
> 口径：共 68 组关键词、200+ 仓库，去重后逐一过筛；**只收录与本项目能力域相关的**，无关结果（如政治类、无关教程）直接剔除，不在此列出。

## 一、怎么读这份表

| 采纳级别 | 含义 | 义务 |
|---|---|---|
| **直接依赖** | 写入 `package.json`，装进依赖树 | 必须在 `NOTICE` 登记，随包附许可全文 |
| **运行时调用** | 独立进程/服务，不打包 | 由用户自行安装；界面需说明来源 |
| **参考实现** | 读设计、读接口，不复制代码 | 在 `CREDITS` 注明；复制代码则升级为依赖并遵守其许可 |
| **禁止分发** | 许可冲突或明确限制 | 只能引导用户自装，安装包内不得出现 |
| **不适用** | 平台或形态不符 | 记录排除理由，避免日后重复评估 |

---

## 二、宿主与插件基座

| 仓库 | ★ | 许可 | 最近提交 | 用途 | 级别 |
|---|---|---|---|---|---|
| `deepseek-ai/deepseek-harness` | 258k | MIT | 2026-10-17 | 我们运行其上的宿主内核 | **运行时调用** |
| `@deepseek-ai/cordis`（DSH 内置） | — | MIT | — | 插件树、依赖注入、可逆副作用 | **直接依赖** |
| `ruvnet/ruflo` | 78k | MIT | 2026-10-23 | 另一个 agent harness，架构参考（插件分层、工具注册） | 参考实现 |

---

## 三、形象层（立绘 / 桌宠）

| 仓库 | ★ | 许可 | 最近提交 | 用途 | 级别 |
|---|---|---|---|---|---|
| `guansss/pixi-live2d-display` | 1.5k | MIT | 2024-08-20 | PixiJS 上播放 Live2D（Cubism 2/4） | **直接依赖** |
| `Live2D/CubismWebSamples` | 394 | 专有（SDK 协议） | 2026-04-02 | 官方样例，用于确认 Cubism Core API 用法 | 参考实现 |
| `Live2D/CubismWebFramework` | 238 | 专有（SDK 协议） | 2026-04-02 | 官方 Web 框架，**不得打包** | **禁止分发** |
| `Untitled-Story/untitled-pixi-live2d-engine` | 77 | MIT | 2026-09-20 | PixiJS v8 + Cubism 2–5 的替代实现，若 pixi-live2d-display 不兼容新版本时备选 | 参考实现 |
| `Panzer-Jack/easy-live2d` | 219 | MIT | 2026-09-24 | 把 Live2D 当普通 pixi sprite 控制的简化封装 | 参考实现 |
| `avgjs/pixi-live2d` | 682 | 未声明 | 2017-04-12 | 老项目，已停更，仅作历史参考 | 不适用 |
| `pixiv/three-vrm` | 2.2k | MIT | 2026-10-22 | VRM 模型渲染（一期不做 VRM，二期备选） | 参考实现 |
| `MidraLab/uDesktopMascot` | 357 | Apache-2.0 | 2026-03-15 | 跨平台桌面吉祥物（Unity），交互设计参考 | 参考实现 |
| `zenghongtu/PPet` | 2k | MIT | 2024-06-18 | Electron 桌宠（Mac/Win/Linux），窗口与交互参考 | 参考实现 |
| `OpenPetsHQ/openpets` | 1.3k | MIT | 2026-10-21 | 本地优先的桌面伴侣平台，动画/状态组织参考 | 参考实现 |
| `rullerzhou-afk/clawd-on-desk` | 6.5k | AGPL-3.0 | 2026-10-23 | 像素桌宠，观察 agent 状态并显示；状态映射思路参考 | 参考实现（AGPL，勿复制代码） |
| `Sutera-Diffusus/dsh-whale-musume` | 162 | MIT | 2026-10-23 | **DSH 生态桌宠**（元气鲸鱼娘，45 项成就、3 个小游戏、跨端存档） | 参考实现，优先评估能否直接用 |
| `JimHans/live2d-kanban-desktop` | 336 | GPL-3.0 | 2025-07-10 | Electron + Live2D 看板娘（含日程提醒） | 参考实现（GPL，勿复制） |

---

## 四、语音（TTS / 音色 / VAD）

| 仓库 | ★ | 许可 | 最近提交 | 用途 | 级别 |
|---|---|---|---|---|---|
| `RVC-Boss/GPT-SoVITS` | 63.6k | MIT | 2026-10-19 | 少样本音色克隆 + 中文 TTS，本地部署 | **运行时调用** |
| `RVC-Project/Retrieval-based-Voice-Conversion-WebUI` | 38.9k | MIT | 2026-08-04 | 音色转换（RVC） | **运行时调用** |
| `QwenAudio/CosyVoice` | 24.1k | Apache-2.0 | 2026-05-25 | 阿里多语种 TTS，质量高 | 运行时调用（备选） |
| `2noise/ChatTTS` | 39.9k | AGPL-3.0 | 2026-04-10 | 对话式 TTS，**AGPL 会传染本项目** | **禁止分发**（仅可独立进程调用） |
| `index-tts/index-tts` | 24.7k | 未声明 | 2026-09-29 | 字节 IndexTTS，零样本克隆；许可未声明，需人工确认 | 待确认 |
| `SWivid/F5-TTS` | 15.4k | MIT | 2026-10-14 | 流匹配 TTS，快 | 运行时调用（备选） |
| `rany2/edge-tts` | 12.4k | 未声明（GPL 争议） | 2026-10-14 | 微软 Edge 在线语音，**逆向接口，非官方** | 不适用（合规风险） |
| `rhasspy/piper` | 11.3k | MIT | 2025-08-26 | 轻量离线 TTS，适合低配兜底 | 运行时调用（备选） |
| `OpenMOSS/MOSS-TTS-Nano` | 4.5k | Apache-2.0 | 2026-09-06 | 100M 小模型实时 TTS | 观察 |
| `KevinWang676/Bark-Voice-Cloning` | 2.9k | MIT | 2026-05-31 | Bark 中文音色克隆 | 参考 |
| `snakers4/silero-vad` | 10.5k | MIT | 2026-10-22 | VAD，判断用户是否说完 | **直接依赖**（经 onnxruntime） |
| `TEN-framework/ten-vad` | 2.3k | 未声明 | 2026-10-09 | 低延迟 VAD | 备选 |
| `FireRedTeam/FireRedVAD` | 555 | Apache-2.0 | 2026-05-06 | 工业级 VAD | 备选 |
| `ggml-org/whisper.cpp` | 54.6k | MIT | 2026-10-19 | 本地 ASR（若做语音输入） | 运行时调用（备选） |
| `openai/whisper` | 111k | MIT | 2026-08-31 | 参考实现（Python） | 参考 |

---

## 五、通道（QQ / 微信 / IM）

| 仓库 | ★ | 许可 | 最近提交 | 用途 | 级别 |
|---|---|---|---|---|---|
| `NapNeko/NapCatQQ` | 11.3k | 未声明（有限再分发） | 2026-10-22 | QQ 个人号协议端（NTQQ） | **禁止分发**（仅引导自装） |
| `LagrangeDev/Lagrange.Core` | 3k | 未声明 | 2026-09-07 | 另一条 QQ 协议端路线 | 禁止分发 |
| `LLOneBot/LuckyLilliaBot` | 3.7k | GPL-2.0 | 2026-10-19 | OneBot 实现 | 禁止分发 |
| `Mrs4s/go-cqhttp` | 10.6k | AGPL-3.0 | 2026-10-20 | 老牌 QQ 协议端（已趋停更） | 不适用 |
| `nonebot/nonebot2` | 7.8k | MIT | 2026-10-22 | Python 机器人框架；适配器抽象参考 | 参考实现 |
| `AstrBotDevs/AstrBot` | 42.9k | AGPL-3.0 | 2026-10-23 | 多平台 Agent 框架，插件市场与适配器设计参考 | 参考实现（勿复制） |
| `Mai-with-u/MaiBot` | 6.4k | GPL-3.0 | 2026-10-23 | 长期记忆 + 人格的聊天机器人 | 参考实现（勿复制） |
| `zhenxun-org/zhenxun_bot` | 3.8k | AGPL-3.0 | 2026-10-07 | NoneBot2 生态的成熟实现 | 参考实现 |
| `zhinjs/qq-official-bot` | 89 | MIT | 2026-10-23 | QQ 官方机器人 SDK（Node） | **直接依赖**（S2 通道） |
| `HG-ha/ymbotpy` | 22 | MIT | 2026-06-18 | QQ 频道 Python SDK | 参考 |
| `wechaty/wechaty` | 23.4k | Apache-2.0 | 2025-12-21 | 微信协议抽象（需付费 puppet） | 参考 |
| `lich0821/WeChatFerry` | 6.8k | MIT | 2026-07-10 | Windows 微信 hook | 不适用（仅 Windows，灰色） |
| `eatmoreapple/openwechat` | 5.5k | Apache-2.0 | 2025-01-02 | Go 微信 SDK（含个人号 web 协议） | 参考 |
| `danni-cool/wechatbot-webhook` | 2.2k | MIT | 2024-12-01 | 个人微信转 webhook 的轻量方案 | 参考实现 |
| `wangrongding/wechat-bot` | 11.5k | MIT | 2026-09-04 | 多平台 IM AI Agent | 参考实现 |
| `wq19901103wq/wechat-mac-rpa` | 125 | MIT | 2026-10-23 | **macOS 微信 RPA**（多模态视觉 + Agent） | 参考实现（我们平台正好是 macOS） |
| `openilink/openilink-hub` | 1.6k | MIT | 2026-06-18 | 微信 Bot 管理平台 | 参考 |
| `grammyjs/grammY` | 3.8k | MIT | 2026-10-16 | Telegram Bot 框架 | **直接依赖**（S7 通道） |

---

## 六、记忆与检索

| 仓库 | ★ | 许可 | 最近提交 | 用途 | 级别 |
|---|---|---|---|---|---|
| `mem0ai/mem0` | 67.7k | Apache-2.0 | 2026-10-22 | 记忆层（抽取+去重+更新语义） | 参考实现 |
| `letta-ai/letta` | 25.2k | Apache-2.0 | 2026-10-18 | MemGPT 系有状态 agent，记忆分块设计 | 参考实现 |
| `getzep/graphiti` | 32.2k | Apache-2.0 | 2026-10-22 | 时序知识图谱记忆 | 参考实现 |
| `OSU-NLP-Group/HippoRAG` | 4.1k | MIT | 2026-10-06 | 类海马体的长期记忆检索 | 参考实现 |
| `memvid/memvid` | 16.6k | Apache-2.0 | 2026-07-14 | 用单文件视频容器存记忆（替代复杂 RAG） | 观察 |
| `tigerless-labs/agent-memory` | 4.5k | MIT | 2026-10-22 | 纯 Markdown 的长期记忆运行时 | 参考实现 |
| `NirDiamant/Agent_Memory_Techniques` | 1.1k | Apache-2.0 | 2026-10-22 | 30 个可跑的记忆技术示例 | 参考（学习） |
| `asg017/sqlite-vec` | 8.2k | Apache-2.0 / MIT | 2026-05-18 | SQLite 向量检索扩展 | **直接依赖**（已登记） |
| `asg017/sqlite-vss` | 2k | MIT | 2024-05-05 | 上一代方案（依赖 FAISS） | 不适用（改用 sqlite-vec） |
| `sqliteai/sqlite-vector` | 1.2k | Apache-2.0 | 2026-09-11 | 另一实现，跨平台 | 备选 |
| `unum-cloud/USearch` | 4.3k | Apache-2.0 | 2026-10-18 | 高性能向量检索（非 SQLite） | 备选 |
| `doobidoo/mcp-memory-service` | 2k | Apache-2.0 | 2026-10-23 | MCP 记忆服务 | 参考 |

---

## 七、模型网关与本地推理

| 仓库 | ★ | 许可 | 最近提交 | 用途 | 级别 |
|---|---|---|---|---|---|
| `BerriAI/litellm` | 61.9k | 未声明（MIT 为主） | 2026-10-23 | 100+ provider 统一网关 | 参考实现 |
| `QuantumNous/new-api` | 50.5k | AGPL-3.0 | 2026-10-23 | 模型聚合与分发 | 不适用（AGPL，且我们是客户端） |
| `maximhq/bifrost` | 9k | Apache-2.0 | 2026-10-23 | 高性能 AI 网关 | 参考 |
| `Portkey-AI/gateway` | 13.3k | MIT | 2026-05-25 | 带护栏的网关 | 参考 |
| `Mirrowel/LLM-API-Key-Proxy` | 558 | 未声明 | 2026-09-23 | 统一密钥代理 | 参考 |
| `huggingface/transformers.js` | 16.4k | Apache-2.0 | 2026-10-23 | 浏览器/Node 端跑小模型（本地 embedding） | **直接依赖候选** |
| `microsoft/onnxruntime` | 22.2k | MIT | 2026-10-23 | VAD/TTS 小模型推理 | 直接依赖候选 |
| `ggml-org/llama.cpp` | 132k | MIT | 2026-10-23 | 本地 LLM（可选离线模式） | 运行时调用（备选） |

---

## 八、存储与中文文本

| 仓库 | ★ | 许可 | 最近提交 | 用途 | 级别 |
|---|---|---|---|---|---|
| `WiseLibs/better-sqlite3` | 7.5k | MIT | 2026-08-10 | SQLite 绑定（同步 API，适合桌面） | **直接依赖候选** |
| `nodejs/node`（`node:sqlite`） | 122k | MIT | 2026-10-23 | 内置 SQLite（Node 22+ 实验） | 备选（零依赖） |
| `BYVoid/OpenCC` | 10k | Apache-2.0 | 2026-10-23 | 繁简转换 | 直接依赖候选 |
| `fxsjy/jieba` | 35.2k | MIT | 2024-08-21 | 中文分词（Python）；Node 侧用 nodejieba 或退化二元组 | 参考（当前用二元组） |
| `markdown-it/markdown-it` | 22k | MIT | 2026-10-23 | 消息 Markdown 渲染 | 直接依赖候选 |
| `shikijs/shiki` | 13.9k | MIT | 2026-10-01 | 代码高亮（工作视图） | 直接依赖候选 |

---

## 九、桌面外壳与打包

| 仓库 | ★ | 许可 | 最近提交 | 用途 | 级别 |
|---|---|---|---|---|---|
| `electron/electron` | 123k | MIT | 2026-10-23 | 桌面外壳 | **直接依赖**（已登记） |
| `electron-userland/electron-builder` | 14.7k | MIT | 2026-10-23 | 三端打包 | **直接依赖**（S1） |
| `electron/forge` | 7.2k | MIT | 2026-10-22 | 打包备选（官方） | 备选 |
| `vercel/hazel` | 3k | MIT | 2024-06-10 | 自托管更新服务 | 观察 |
| `electron/update.electronjs.org` | 703 | 未声明 | 2026-10-22 | 免费更新服务（开源项目） | 观察 |
| `ArekSredzki/electron-release-server` | 2.2k | MIT | 2024-04-22 | 自托管发布服务 | 不适用（停更） |
| `sfatihk/electron-tray-window` | 178 | MIT | 2023-10-02 | 托盘弹窗 | 参考 |
| `electron-vite/electron-vite` | — | — | — | **仓库不存在（404）**，实际为 `alex8088/electron-vite` | 待核实 |

---

## 十、世界书与角色卡

| 仓库 | ★ | 许可 | 最近提交 | 用途 | 级别 |
|---|---|---|---|---|---|
| `SillyTavern/SillyTavern` | 34.8k | AGPL-3.0 | 2026-10-02 | 世界书（World Info）与角色卡生态的原始设计 | 参考实现（勿复制代码） |
| `malfoyslastname/character-card-spec-v2` | 199 | 未声明 | 2023-06-22 | 角色卡 v2 规范 | **参考规范**（按规范实现，不复制代码） |
| `kwaroran/Risuai` | 1.7k | GPL-3.0 | 2026-10-22 | 角色扮演前端，变量与触发器设计 | 参考 |
| `PocketRisu/PocketRisu` | 412 | GPL-3.0 | 2026-10-22 | 自托管 RP 平台 | 参考 |
| `LenAnderson/SillyTavern-Lore-Variables` | 17 | 未声明 | 2023-11-29 | 世界书变量机制 | 参考 |

---

## 十一、行动层（手机 / 浏览器 / 游戏）

| 仓库 | ★ | 许可 | 最近提交 | 用途 | 级别 |
|---|---|---|---|---|---|
| `PrismarineJS/mineflayer` | 7.6k | MIT | 2026-10-20 | Minecraft 机器人 | **直接依赖** |
| `PrismarineJS/mineflayer-pathfinder` | 315 | MIT | 2026-10-06 | 寻路插件 | **直接依赖** |
| `mindcraft-bots/mindcraft` | 5.9k | MIT | 2026-10-21 | LLM 驱动 Mineflayer 的范例（任务拆解） | 参考实现 |
| `openstf/adbkit` | 880 | 未声明 | 2023-03-24 | Node 端 ADB 客户端 | 备选 |
| `Drenzzz/ADBKit` | 367 | MIT | 2026-10-22 | ADB 图形工具（非库） | 参考 |
| `rayworks/DroidCast` | 190 | Apache-2.0 | 2026-09-19 | 安卓投屏（截屏取流） | 参考 |
| `yang1ming/android-harness` | 176 | MIT | 2026-10-20 | ADB-first 的安卓自动化壳 | **参考实现（重点）** |
| `nut-tree/nut.js` | 2.9k | 未声明 | 2024-05-01 | 跨平台 UI 自动化（键鼠） | 备选（许可待确认） |
| `xushengfeng/eSearch` | 7.4k | GPL-3.0 | 2026-10-21 | 截屏/OCR/贴图（Electron 实现参考） | 参考（勿复制） |
| `sw33tLie/macshot` | 3.9k | GPL-3.0 | 2026-10-14 | macOS 原生截屏录制 | 参考 |

---

## 十二、参考设计与范式

| 仓库 | ★ | 许可 | 最近提交 | 用途 |
|---|---|---|---|---|
| `humanlayer/12-factor-agents` | 26.8k | 未声明 | 2025-09-21 | agent 工程原则（上下文所有权、可控性） |
| `volcengine/OpenViking` | 40.7k | AGPL-3.0 | 2026-10-23 | 自演化上下文数据库，上下文分层思路 |
| `volcengine/MineContext` | 5.5k | Apache-2.0 | 2026-05-07 | 主动式上下文感知助手（主动性设计参考） |
| `BoundaryML/baml` | 9.4k | Apache-2.0 | 2026-10-23 | 提示词即代码/类型化 LLM 调用 |
| `Shikigami-Lab/Shikigami-Protocol` | 12 | AGPL-3.0 | 2026-08-27 | 本地优先的 AI 角色陪伴框架（情绪+记忆+主动性） |

---

## 十三、明确排除的项与理由

| 项目 | 排除理由 |
|---|---|
| `ChatTTS`（AGPL） | 会传染本项目许可；若要用只能独立进程、不打包 |
| `edge-tts` | 逆向微软在线接口，非官方，合规风险 |
| `WeChatFerry` / NapCat / Lagrange | 平台限制（Windows-only / 有限再分发），只能引导用户自装 |
| `go-cqhttp` | 已趋停更，官方亦不推荐新项目使用 |
| `sqlite-vss` | 依赖 FAISS，体积大，已由 sqlite-vec 取代 |
| `electron-vue` / `vue-cli-plugin-electron-builder` | 停更多年（2022–2023），不引入 |
| `avgjs/pixi-live2d` | 2017 年停更 |
| `nut.js` 许可未声明 | 商用前必须确认许可，否则不用 |

---

## 十四、下一步怎么用这份清单

1. **S0 收尾**：`node:sqlite` 与 `better-sqlite3` 二选一（见 §八），把 memory 的持久化补上
2. **S1 打包**：`electron-builder`（MIT）直接引入，同时把 `electron` 从 devDependency 提升为运行时依赖
3. **S4 语音**：`GPT-SoVITS` 走独立进程（不打包），`silero-vad` 走 onnxruntime
4. **S5 桌宠**：`pixi-live2d-display` + 用户自装 Cubism Core；先评估 `dsh-whale-musume` 能否直接复用
5. **S2/S7 通道**：`zhinjs/qq-official-bot`、`grammY` 直接依赖；微信个人号仅参考 `wechat-mac-rpa`，不打包

**任何一项从「候选」转为「直接依赖」时，必须同步更新 `NOTICE` 与 `docs/CREDITS.md`**，并在本文件把级别改掉。

---

*本清单为一次性全量扫描结果，后续新增候选请追加到对应章节，不要另起文件。*
