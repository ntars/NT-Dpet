# 采用登记册（Adoption Register）

> 配套文档：[UPSTREAM-CANDIDATES.md](UPSTREAM-CANDIDATES.md)（候选清单）｜[NOTICE](../NOTICE)（法律声明）｜[CREDITS.md](CREDITS.md)（致谢）
> 更新：2026-10-23

## 一、法律口径（必须先读，否则下面全部作废）

**本项目许可是 AGPL-3.0-or-later。** 所有兼容性判断都以这个前提计算：

| 上游许可 | 能否用 | 条件 |
|---|---|---|
| **MIT / ISC / BSD-2 / BSD-3** | ✅ 可以 | 保留版权声明与许可全文即可 |
| **Apache-2.0** | ✅ 可以 | 保留声明 + 附 NOTICE（若上游提供）；专利条款对我们有利 |
| **AGPL-3.0 / GPL-3.0** | ✅ 可以 | 与我们是同族，可链接、可分发；复制其代码后本项目仍为 AGPL，需保留其声明与作者 |
| **LGPL-3.0 / MPL-2.0** | ✅ 可以 | 动态链接/文件级隔离即可，改动其文件需回馈 |
| **GPL-2.0-only** | ❌ 不可以 | 与 GPLv3/AGPLv3 不兼容（FSF 明确立场），只能独立进程、不打包 |
| **专有许可**（Live2D Cubism Core） | ⚠️ 有条件 | 只能由用户自行下载，我们不打包、不再分发 |
| **未声明许可** | ❌ 默认不可用 | **无声明 = 保留所有权利**。「我们署名了」不能替代授权（《伯尔尼公约》自动保护原则） |

### 对「未声明许可」项目的三条可行路径

1. **只读源码、学设计、不复制代码**——不构成侵权，但要避免「实质性相似」：接口、命名、结构都要自己重写。归入 **参考实现**
2. **作为独立进程，由用户自行安装**——我们不打包、不分发，风险显著降低。归入 **运行时调用（用户自装）**，界面需明确写出「需自行安装，来源：xxx」
3. **联系作者取得书面许可**——唯一能让它成为「直接依赖」的路径。拿到书面许可后，把许可文本存档到 `docs/licenses/` 并在本表更新

> 一句话：**「没声明」不是「随便用」，是「先别用」。** 我们可以慢，但不能带着侵权风险上线。

---

## 二、采用总表

级别含义：**依赖**=已写入 package.json｜**计划依赖**=已定级、尚未写入 package.json（括号内为引入阶段）｜**运行时**=独立进程、不打包｜**参考**=只学设计不复制代码｜**不用**=评估后排除

### 2.1 宿主与插件基座

| 项目 | 许可 | 怎么用 | 声明动作 |
|---|---|---|---|
| `deepseek-ai/deepseek-harness` | MIT | 运行时（宿主） | NOTICE §四 |
| `@deepseek-ai/cordis` | MIT | **依赖**（peer+dev） | NOTICE §三 |
| `microsoft/TypeScript` | Apache-2.0 | **依赖**（根 `devDependencies`，仅编译期，不进入运行时） | NOTICE §三 + §3.1（一旦以任何形式分发其本体，须补附上游 NOTICE） |
| `ruvnet/ruflo` | MIT | 参考（插件分层） | CREDITS |
| `humanlayer/12-factor-agents` | 未声明 | 参考（只读原则，不复制） | CREDITS |

### 2.2 形象层

| 项目 | 许可 | 怎么用 | 声明动作 |
|---|---|---|---|
| `guansss/pixi-live2d-display` | MIT | **计划依赖**（S5） | NOTICE §五 已登记 |
| `pixi.js` | MIT | **计划依赖**（S5） | NOTICE §五 |
| `Live2D/CubismWebSamples` | 专有（SDK 协议） | 参考 API 用法 | NOTICE §六（禁止分发） |
| `Live2D/CubismWebFramework` | 专有 | 不用（不可再分发） | NOTICE §六 |
| `Untitled-Story/untitled-pixi-live2d-engine` | MIT | 备选依赖（PixiJS v8 兼容） | 采用时登记 |
| `Panzer-Jack/easy-live2d` | MIT | 参考 | CREDITS |
| `pixiv/three-vrm` | MIT | 备选（二期 VRM） | 采用时登记 |
| `Sutera-Diffusus/dsh-whale-musume` | MIT | **优先评估直接复用**（DSH 生态桌宠） | 采用时登记 |
| `OpenPetsHQ/openpets` | MIT | 参考（状态与动画组织） | CREDITS |
| `zenghongtu/PPet` | MIT | 参考（Electron 桌宠窗口） | CREDITS |
| `MidraLab/uDesktopMascot` | Apache-2.0 | 参考（交互设计） | CREDITS |
| `rullerzhou-afk/clawd-on-desk` | AGPL-3.0 | 参考（状态映射），不复制 | CREDITS |
| `JimHans/live2d-kanban-desktop` | GPL-3.0 | 参考（窗口与提醒） | CREDITS |

### 2.3 语音

| 项目 | 许可 | 怎么用 | 声明动作 |
|---|---|---|---|
| `RVC-Boss/GPT-SoVITS` | MIT | **运行时**（本地语音，独立进程） | NOTICE §五 |
| `RVC-Project/Retrieval-based-Voice-Conversion-WebUI` | MIT | **运行时**（音色转换） | NOTICE §五 |
| `QwenAudio/CosyVoice` | Apache-2.0 | 运行时备选 | 采用时登记 |
| `SWivid/F5-TTS` | MIT | 运行时备选 | 采用时登记 |
| `rhasspy/piper` | MIT | 运行时备选（低配兜底） | 采用时登记 |
| `OpenMOSS/MOSS-TTS-Nano` | Apache-2.0 | 观察（小模型实时） | — |
| `2noise/ChatTTS` | **AGPL-3.0** | **可用**（与我们同族）；因体积大暂作运行时备选 | 采用时登记 |
| `index-tts/index-tts` | **未声明** | 暂不用；如需用，先联系作者取书面许可 | 无 |
| `rany2/edge-tts` | 未声明（逆向接口） | 不用（合规风险 + 非官方接口） | 无 |
| `snakers4/silero-vad` | MIT | **依赖候选**（经 onnxruntime） | 采用时登记 |
| `TEN-framework/ten-vad` | 未声明 | 暂不用 | 无 |
| `FireRedTeam/FireRedVAD` | Apache-2.0 | 备选 | 采用时登记 |
| `ggml-org/whisper.cpp` | MIT | 运行时备选（语音输入） | 采用时登记 |
| `openai/whisper` | MIT | 参考 | CREDITS |

### 2.4 通道

| 项目 | 许可 | 怎么用 | 声明动作 |
|---|---|---|---|
| `zhinjs/qq-official-bot` | MIT | **计划依赖**（S2 官方 QQ） | NOTICE §五 |
| `grammyjs/grammY` | MIT | **计划依赖**（S7 Telegram） | NOTICE §五 |
| `NapNeko/NapCatQQ` | 未声明（有限再分发） | 运行时（用户自装，我们不分发） | NOTICE §六 + 界面提示 |
| `LagrangeDev/Lagrange.Core` | 未声明 | 同上（备选协议端） | NOTICE §六 |
| `LLOneBot/LuckyLilliaBot` | GPL-2.0-only | **不用**（与 AGPL 不兼容） | NOTICE §六 |
| `Mrs4s/go-cqhttp` | AGPL-3.0 | 不用（已趋停更） | — |
| `nonebot/nonebot2` | MIT | 参考（适配器抽象） | CREDITS |
| `AstrBotDevs/AstrBot` | AGPL-3.0 | 参考（插件市场/适配器设计），复制则保持 AGPL 并署名 | CREDITS |
| `Mai-with-u/MaiBot` | GPL-3.0 | 参考（记忆与人格组织） | CREDITS |
| `wechaty/wechaty` | Apache-2.0 | 参考（协议抽象，puppet 需付费） | CREDITS |
| `eatmoreapple/openwechat` | Apache-2.0 | 参考（Go 侧实现） | CREDITS |
| `danni-cool/wechatbot-webhook` | MIT | 参考（webhook 桥接） | CREDITS |
| `wangrongding/wechat-bot` | MIT | 参考（多平台 Agent） | CREDITS |
| `wq19901103wq/wechat-mac-rpa` | MIT | **重点参考**（macOS 微信 RPA，正对我们平台） | CREDITS |
| `openilink/openilink-hub` | MIT | 参考（Bot 管理面板） | CREDITS |
| `lich0821/WeChatFerry` | MIT | 不用（仅 Windows，灰色） | — |
| `HG-ha/ymbotpy` / `zhinjs` 之外 QQ 频道 SDK | MIT | 备选 | 采用时登记 |

### 2.5 记忆与检索

| 项目 | 许可 | 怎么用 | 声明动作 |
|---|---|---|---|
| `asg017/sqlite-vec` | **MIT OR Apache-2.0**（双许可，本项目按 MIT 分支使用） | **依赖候选**（向量检索） | NOTICE §五 已登记 |
| `WiseLibs/better-sqlite3` | MIT | 备选（若 node:sqlite 的实验 API 变动过大） | 采用时登记 |
| `nodejs/node`（`node:sqlite`） | MIT | **已采用**（记忆持久化，Node 22.22 无需 flag） | NOTICE §四（Node 运行时） |
| `mem0ai/mem0` | Apache-2.0 | 参考（抽取/去重/更新语义） | CREDITS |
| `letta-ai/letta` | Apache-2.0 | 参考（记忆分块） | CREDITS |
| `getzep/graphiti` | Apache-2.0 | 参考（时序知识图谱） | CREDITS |
| `OSU-NLP-Group/HippoRAG` | MIT | 参考（长期记忆检索） | CREDITS |
| `tigerless-labs/agent-memory` | MIT | 参考（Markdown 记忆） | CREDITS |
| `memvid/memvid` | Apache-2.0 | 观察 | — |
| `sqliteai/sqlite-vector` | Apache-2.0 | 备选 | 采用时登记 |
| `unum-cloud/USearch` | Apache-2.0 | 备选（非 SQLite 路线） | 采用时登记 |
| `asg017/sqlite-vss` | MIT | 不用（依赖 FAISS，被 sqlite-vec 取代） | — |
| `NirDiamant/Agent_Memory_Techniques` | Apache-2.0 | 参考（学习材料） | CREDITS |

### 2.6 模型网关与本地推理

| 项目 | 许可 | 怎么用 | 声明动作 |
|---|---|---|---|
| `BerriAI/litellm` | 未声明（MIT 为主） | 不用（我们是客户端，走 DSH 的 llm seam） | — |
| `maximhq/bifrost` / `Portkey-AI/gateway` | Apache-2.0 / MIT | 参考 | CREDITS |
| `QuantumNous/new-api` | AGPL-3.0 | 不用（服务端形态不符） | — |
| `huggingface/transformers.js` | Apache-2.0 | **依赖候选**（本地 embedding） | 采用时登记 |
| `microsoft/onnxruntime` | MIT | **依赖候选**（VAD/TTS 小模型） | 采用时登记 |
| `ggml-org/llama.cpp` | MIT | 运行时备选（完全离线模式） | 采用时登记 |

### 2.7 存储与中文文本

| 项目 | 许可 | 怎么用 | 声明动作 |
|---|---|---|---|
| `BYVoid/OpenCC` | Apache-2.0 | **依赖候选**（繁简转换） | 采用时登记 |
| `fxsjy/jieba` | MIT | 参考（我们当前用二元组，不引分词） | CREDITS |
| `markdown-it/markdown-it` | MIT | **依赖候选**（消息渲染） | 采用时登记 |
| `shikijs/shiki` | MIT | **依赖候选**（工作视图高亮） | 采用时登记 |

### 2.8 桌面外壳与打包

| 项目 | 许可 | 怎么用 | 声明动作 |
|---|---|---|---|
| `electron/electron` | MIT | **依赖**（已登记） | NOTICE §三 |
| `electron-userland/electron-builder` | MIT | **计划依赖**（S1 打包） | NOTICE §五 |
| `electron/forge` | MIT | 备选（官方打包） | 采用时登记 |
| `alex8088/electron-vite` | MIT | **依赖候选**（构建体验；注意先前误写为 `electron-vite/electron-vite`，该仓库 404） | 采用时登记 |
| `vercel/hazel` | MIT | 观察（自托管更新） | — |
| `electron/update.electronjs.org` | 未声明 | 不用 | — |
| `ArekSredzki/electron-release-server` | MIT | 不用（停更） | — |
| `sfatihk/electron-tray-window` | MIT | 参考（托盘弹窗） | CREDITS |

### 2.9 世界书与角色卡

| 项目 | 许可 | 怎么用 | 声明动作 |
|---|---|---|---|
| `SillyTavern/SillyTavern` | AGPL-3.0 | 参考（世界书/角色卡生态）；复制则保持 AGPL 并署名 | CREDITS |
| `malfoyslastname/character-card-spec-v2` | 未声明 | **按规范实现**（规范属事实性描述，不复制文本） | CREDITS |
| `kwaroran/Risuai` | GPL-3.0 | 参考（变量与触发器） | CREDITS |
| `LenAnderson/SillyTavern-Lore-Variables` | 未声明 | 参考（变量机制） | CREDITS |

### 2.10 行动层

| 项目 | 许可 | 怎么用 | 声明动作 |
|---|---|---|---|
| `PrismarineJS/mineflayer` | MIT | **计划依赖**（S6 Minecraft） | NOTICE §五 |
| `PrismarineJS/mineflayer-pathfinder` | MIT | **计划依赖** | NOTICE §五 |
| `mindcraft-bots/mindcraft` | MIT | 参考（任务拆解） | CREDITS |
| `yang1ming/android-harness` | MIT | **重点参考**（ADB-first 安卓自动化） | CREDITS |
| `openstf/adbkit` | 未声明 | 参考（ADB 客户端实现） | CREDITS |
| `rayworks/DroidCast` | Apache-2.0 | 参考（安卓投屏取流） | CREDITS |
| `nut-tree/nut.js` | 未声明 | 暂不用（许可待确认） | — |
| `xushengfeng/eSearch` | GPL-3.0 | 参考（截屏/OCR 实现） | CREDITS |
| `sw33tLie/macshot` | GPL-3.0 | 参考（macOS 截屏） | CREDITS |

### 2.11 参考设计与范式

| 项目 | 许可 | 怎么用 |
|---|---|---|
| `volcengine/OpenViking` | AGPL-3.0 | 参考（上下文分层） |
| `volcengine/MineContext` | Apache-2.0 | 参考（主动式上下文感知） |
| `BoundaryML/baml` | Apache-2.0 | 参考（类型化 LLM 调用） |
| `Shikigami-Lab/Shikigami-Protocol` | AGPL-3.0 | 参考（本地优先陪伴框架） |
| `dsh-bili-whale`（第三方 DSH 插件） | MIT | 参考（主动性四条机制） |

---

## 三、声明纪律（谁在什么时候改哪里）

| 场景 | 必做 |
|---|---|
| 任何项目从「候选/参考」转为「依赖或运行时」 | ① 更新本表级别 ② 更新 `NOTICE` 对应章节 ③ 更新 `CREDITS` ③ 若含 Apache-2.0，附其 NOTICE |
| 复制了任何第三方代码（哪怕几行） | 在文件头注明来源与作者，本项目整体保持 AGPL-3.0 |
| 引入「未声明许可」项目 | 先取得书面许可，许可文本存 `docs/licenses/<项目>.txt`，本表标注许可来源与日期 |
| 打包分发 | 构建脚本自动收集 `node_modules` 中被分发组件的 LICENSE，随包输出 |

**一条不可让步的底线**：没有明确许可的项目，不进依赖树、不进安装包。我们可以在文档里写「参考了某项目的设计」，但不能把它的代码放进我们的产物里——那不是「没声明」，那条是侵权。

---

*本表随采用决策实时更新；与 `NOTICE` 冲突时以 `NOTICE` 为准。*
