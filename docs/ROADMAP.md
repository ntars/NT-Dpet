# 开发清单（至可交付上线）

> 可执行清单，不是摘要。每项含：前置条件、改动位置、实现要点、验收标准。
> 定时任务每次取第一项未勾选者执行；完成后勾选并在行末记录提交号。
> 编号规则：M<里程碑>.<任务>，子步 M<里程碑>.<任务>.<子步>。

## 执行约定

1. 一次一项：只做第一个未勾选任务，不并行、不跳跃。
2. 不通过不提交：构建或测试失败即 `git checkout -- .` 回退，任务转入「阻塞项登记」。
3. 不越目录：不写 `~/.dsh`、`~/.agents`，不改项目外文件。
4. 不删除文件：自动化无删除权限，清理留人工。
5. 不改版本：里程碑中途不升版本，仅收口任务负责升版与打 tag。
6. 声明同步：新增依赖必须同一提交更新 `NOTICE`、`docs/CREDITS.md`、`docs/ADOPTION-REGISTER.md`。
7. 先备份：每次运行前执行 `./scripts/backup.sh`，产物落 `/Volumes/Expand/Backups/nt-dpet`。

---

## M0 S0 收尾：桌面端可完整对话（22 项）

目标：从「能给出一句回复」推进到「二十轮对话有记忆、情绪会变、回复分条、异常可见」。

### M0.1 接口层可行性

- [x] **M0.1.1** 确认上游是否支持插件注册 HTTP 路由。（commit 99d6440）
  - 前置：无。
  - 做法：读 App 内 `@deepseek-ai/dsh-web-app`、`@deepseek-ai/dsh-api-gateway` 等包的入口与类型；检索 `router`、`route`、`http`、`webserver` 等服务名；用最小探针插件尝试 `ctx.get('http')` 或等价服务。
  - 判据：能拿到可注册路由的服务 → 方案 A；拿不到 → 方案 B。
  - 验收：在 `docs/TECH-RESEARCH.md` 新增小节，写明结论、证据（命令与输出）、与两方案的取舍。
- [x] **M0.1.2** 按结论落地接口层。（commit d331088）
  - 结论依据：§5.11 与 §5.11.7，选定**方案 A**；方案 B 仅作退路保留，不实现。
  - 方案 A：在 `packages/ui/src/index.ts` 中 `inject: ['webServer']`，只注册**一条** `prefix` 路由 `/api/ntdpet`，由单一 handler 内部按子路径分发；自鉴权按 §5.11.4 执行（`tapIndex()` 注入 token、校验 `X-NTDPet-Token`、`no-store`、校验 `Origin`）。
  - 实现要点：统一 `{ ok, data, error }` 响应结构；错误码含 `UNAUTHORIZED`、`NOT_READY`、`INTERNAL`；不打印请求正文。
  - 验收：与宿主同端口 `curl -s -H "X-NTDPet-Token: <token>" http://127.0.0.1:<宿主端口>/api/ntdpet/health` 返回 `{"ok":true,...}`；带错 token 返回 `401`；不新增监听端口，9060 仍空闲。

### M0.2 界面接入真实服务

- [x] **M0.2.1** 新增 `packages/ui/web/js/api.js`。（commit 832c3c2）
  - 内容：`baseURL()`（优先 `window.__NTDPET_API__`，其次 `location.origin`，再次 `http://127.0.0.1:9061`）、`getToken()`（从查询串取 `token`，存 `sessionStorage`）、`request()`（超时 8 秒、统一错误对象）、`streamChat()`（`fetch` + `ReadableStream` 逐块解析 `data:`）。
  - 约束：不引入第三方库；不把 token 打进日志。
  - 验收：在浏览器控制台手动调用三个方法均返回预期结构。
- [x] **M0.2.2** 情绪面板接 `/api/ntdpet/mood`。（commit c6862c6）
  - 做法：启动时拉取一次，之后每 30 秒刷新；失败时使用 `js/data.js` 并在顶部加「演示数据」标识（复用现有 `.pill`）。
  - 验收：停掉后端后刷新页面，界面不白屏，标识出现。
  - 实现补记：接口 `/mood` 原先只是 `PENDING_PATHS` 里的占位（恒 503），只做前端会永远停在演示数据上，故本轮同时补齐后端读数：`packages/ui/src/index.ts` 用 `ctx.get('nt-dpet:emotion')` 取服务（不写成必选 inject，避免 emotion 缺席时整个插件不激活），`src/api/handler.ts` 新增 `/mood` 分支，读不到即 503。前端见 `packages/ui/web/js/mood.js`。
- [x] **M0.2.3** 右栏记忆接 `/api/ntdpet/memory/recent?limit=8`。（commit 8e4fd7f）
  - 做法：空列表显示「暂无记忆」，不使用演示数据冒充。
  - 验收：有数据时展示条目与时间；无数据时文案正确。
  - 实现补记：与 M0.2.2 同一个坑——后端原本只有 `PENDING_PATHS` 占位，故同时补齐 `/memory/recent` 分支。要点四条：
    1. handler 由此变为异步（记忆服务读的是 Promise），除该分支外其余路径仍在第一个 `await` 前写完响应，调用方无需改签名。
    2. 会话键按 ARCHITECTURE §5.1 的 `c2c:|group:` 格式校验，格式不对回 400 而非退回默认值——静默兜底会展示另一段会话的记忆，错得看不出来。本机无平台账号，默认键取 `c2c:local` 作过渡。
    3. `limit` 默认 8、上限 50，超限压到 50 并回传实际生效值；非正整数回 400。
    4. 「服务没起来」（503）与「确实没有记忆」（200 + 空数组）分开，前端对应「记忆暂不可用」与「暂无记忆」两种文案。
  - 前端：新增 `web/js/memory.js`；`panel.js` 导出 `renderMemories()` / `renderMemoryEmpty()`；`data.js` 删除演示记忆（已无引用）。
- [x] **M0.2.4** 对话发送接 `POST /api/ntdpet/chat`。（commit ea47350）
  - 做法：发送后逐块渲染；渲染期间禁用发送按钮；`stopReason=aborted` 显示「已中断」，`error` 显示「发送失败，可重试」。
  - 验收：浏览器完成一次真实对话；关闭窗口时请求中止且不报错。
  - 实现补记：与 M0.2.2 / M0.2.3 同一个坑——后端只有 `PENDING_PATHS` 占位，故同时补齐 `/chat` 分支。要点六条：
    1. 响应是事件流（`text/event-stream`），事件只有三种：`{type:'delta',text}` / `{type:'done',stopReason}` / `{type:'error',message}`。字段名与 M0.2.1 的 `classify()` 对齐，前端不用改解析。
    2. 状态码只有一次机会：`headSent` 之前出错还能回 503/500，第一个 delta 之后就只能把失败当作流里的一条 `error` 事件。因此「对话服务没起来」必须由实现层抛 `NotReadyError`，而不是返回空结果。
    3. 正文自己按块攒（宿主没给解析接口），上限 64KB；消息 trim 后不得为空、不超过 4000 字，超限回 400 而不是截断——截断等于替主人删字。
    4. 对端断开时 `res.on('close')` → `AbortController.abort()` → 一路传到模型请求。不这么做，浏览器关了模型还在算，token 白烧。
    5. 前端新增 `web/js/send.js`：一个请求一个气泡，`chat.js` 新增 `beginReply()` 交出「追加正文 / 补状态小字」的句柄；打字指示在第一次正文到达时被替换，不会留三颗点。失败时把原文回填输入框，让「可重试」不只停在文案上。
    6. 模型参数（`magpie` / `group/ntars` / 1024）暂写在 `packages/ui/src/index.ts`：配置层还没有「模型选择」这一项，取值依据 `TECH-RESEARCH.md` §5.10.1 实测走通的路由。
  - 验证：全量构建通过；ui 单测 51/51（新增 15 项）；冒烟 14/14；真实浏览器 + 真实模型网关（`127.0.0.1:3425`）端到端 13/13，含逐块增长、生成期间按钮禁用、失败文案与回填、关页面后上游 `signal.aborted === true`。
- [x] **M0.2.5** 更新冒烟测试。（commit ba4cf46）
  - 做法：`packages/ui/web/test/smoke.mjs` 增加接口桩（拦截 `fetch` 返回固定数据）、降级路径、发送态禁用、错误态文案，目标 ≥ 18 项。
  - 验收：`node packages/ui/web/test/smoke.mjs` 全绿。
  - 实现补记：整套检查从 13 项扩到 36 项，新增 23 项覆盖 M0.2.1–M0.2.4 的真实链路。要点四条：
    1. 桩打在**网络层**（替换 `window.fetch`，只接管 `/api/ntdpet` 前缀），不换 `js/api.js` 里的函数。这么做的理由很直白：要验的正是「地址拼得对不对、令牌有没有进请求头、503 会不会走到降级分支」，把 api.js 换掉，测的就只是自己写的假函数。
    2. 桩由 CDP 的 `Page.addScriptToEvaluateOnNewDocument` 在**新文档执行**，不是启动后注入：mood 与 memory 在 boot 阶段就发请求，晚一步注入首个请求已打到真实网络，断言会看到「先失败再成功」的中间态。
    3. 场景（`?stub=`）六个：`ok` / `fail` / `empty` / `slow` / `chat-error` / `chat-abort`。`slow` 分 250ms 一块推送，用来验打字指示、生成期间禁用、以及回复拼接不丢块。
    4. 桩数据刻意与 `js/data.js` 的演示值错开（0.9/0.1 对 0.68/0.42）。两者若撞成同一个档位，「采用接口读数」这条断言会被演示数据蒙对，测了等于没测。
  - 验证：全量构建通过；ui 单测 51/51；冒烟 36/36，连跑两次结果一致。

### M0.3 启动自检

- [x] **M0.3.1** 新增 `packages/startup-check/src/index.ts`。（commit 80d690c）
  - 做法：`inject: ['profileContext']`（若无此服务则改为读取配置树快照）；比对配置树条目数与激活数；读取 `session-log-deepseek`、`plugin-package-inventory-deepseek` 两项开关；检查 emotion / memory / dialogue / persona 是否在激活列表。
  - 输出：`{ ok, checks: [{ id, ok, detail }] }`，通过 `ctx.provide('nt-dpet:startup-check', ...)` 暴露。
  - 验收：单测覆盖四种场景（全通过、条目缺失、隐私开启、关键包缺失）。
  - 实现补记：要点六条。
    1. `profileContext` **确实存在**，不是假设。2026-10-24 在 0.2.1-rc.2 的 `dsh/lib/profile-boot-*.js` 里核到 `hostCtx.provide("profileContext", profileContext)`，字段为 `name / dir / patchPath / installAnchor / startedBundles / cwd / home / overlays / telemetryDisabledEnv`。故按原计划走必选 inject，不启用「读取配置树快照」的退路。
    2. 但**条目数与激活数不能从 `profileContext` 得到**：`startedBundles` 是「组合层包名」数组，不是配置树条目。真正的条目要问 `ctx.loader.entries()`。因此本包同时读 `loader`（可选，不是 inject），读不到就如实降级为「配置树不可读」，绝不假装通过。
    3. 分三层：`types.ts` 只放普通对象类型；`checks.ts` 是纯函数，不碰 cordis；`snapshot.ts` 是唯一接触宿主内部结构的文件，且只声明自己用到的字段，不 import 宿主的 `Entry` 类型。宿主改结构时坏的只有一个文件。
    4. 统计口径三个坑：分组节点（`options.group` 或运行期 `subgroup`）必须排除，否则条目数永远对不上；`disabled` 的条目不该算「激活失败」，它们是「不该激活」；`entry.id` 与 `entry.disabled` 都是 getter，父树缺失时会抛，读取一律包 try/catch 并回退到 `options.id`。
    5. 隐私项判定顺序：**先看整条禁用，再看 `enabled`**。禁用后插件不运行，`enabled` 写什么都传不出去，所以 `disabled + 未设 enabled` 只算提醒；但 `disabled + enabled: true` 仍判失败——那是被掩盖着的问题，谁取消禁用就恢复上传。早先版本顺序写反，单测当场抓出来了。
    6. 输出比任务书多一个 `severity` 字段（`fatal | warn`）：M0.3.2 要求隐私异常时界面走「已拒绝启动」样式，其余只出横幅。没有这个字段，前端只能靠 id 名字硬编码判断，那是把判定逻辑漏进渲染层。同时导出 `failingChecks(result, severity)` 供按档筛选。
  - 验证：全量构建 33 包通过；startup-check 单测 25/25；界面冒烟 36/36；真实 cordis 实例四组边界实测——无 `profileContext` 时插件完全不激活、隐私开启时 `ok=false` 且 `fatal` 项正是 `privacy-switches`、关键包缺失时只列缺的那几个、无 `loader` 时插件不崩且如实报「配置树不可读」。
  - 附带改动：`bundles/starter/bundle.yaml` 的 G6 组补上本包（不进组合包就永远装不上，M0.3.2 的接口也就取不到服务）；README 与 NOTICE 里「32 个插件包」按实际校正为 33。未引入新依赖，`cordis` 三处声明原已登记，无需改动。
- [x] **M0.3.2** 自检结果呈现。（commit 8862258）
  - 做法：`/api/ntdpet/status` 返回自检结果；界面顶部横幅仅在有异常时出现，列出 `id` 与原因；隐私项异常时文案为「已拒绝启动」样式。
  - 验收：人为挂一个不存在的插件，启动后界面出现横幅且列出该 `id`。
  - 实现补记：要点五条。
    1. 后端**只读不跑**：`/status` 取 `ctx.get('nt-dpet:startup-check').last()`，不提供「重跑」入口。自检要在配置树 settle 之后才有意义，一个 HTTP 请求随时可能落在还没 settle 的时刻，此刻补跑会把还在路上的条目全算成未激活，报出一堆只存在几秒的假异常。
    2. 未就绪一律回 503，**绝不回空结论**。若在此时给一个 `{ok:true, checks:[]}`，界面会判定「一切正常」并把横幅收起来，真异常永远不露面。前端把 503 当**正常路径**，按 1.5s / 4s / 9s / 20s 四级阶梯重试（约 35 秒），只对 `NOT_READY` 重试；401、连不上、500 重试多少次结果都一样，反复刷只会把控制台填满。
    3. 两档样式由数据决定，不靠 id 名字硬编码：隐私项 `fatal` 走「已拒绝启动」红色，其余 `warn` 走「部分能力降级」橙色。判定逻辑留在自检包，渲染层只负责表现。
    4. `fatal` 档必须写明「本轮只做呈现、尚未锁定输入」：横幅说已拒绝启动、而输入框此刻仍能用，两件事摆在一起会被当成界面坏了。与其看起来像 bug，不如说清这是本轮的边界——保证「问题被看见」，不假装「问题已拦住」。
    5. 失败条目的标签不能只印 id：运行期 `loader.create()` 挂上的条目拿到的是八位随机码（实测 `a8d6cdaa`），横幅上只写这个码等于没说。故 `checks.ts` 在「id 里认不出包名」时补成 `a8d6cdaa（this-plugin-does-absolutely-not-exist）`，认得出就只印 id，免得 `nt-dpet:core:memory` 后面再拖一个重复的包名。
  - 验证：全量构建 33 包通过；startup-check 27/27；ui 59/59；界面冒烟 49/49（新增 13 项，覆盖全通过 / 告警 / 致命 / 一直未就绪四态）。
  - 端到端实测（真实链路，非桩数据）：真实 `cordis` + 真实 `cordis-plugin-loader` + 真实 `dsh-host-webserver` + 真实 ui 插件，`loader.create({ name: 'this-plugin-does-absolutely-not-exist' })` 挂一个不存在的插件 → 自检报 `未激活：a8d6cdaa（this-plugin-does-absolutely-not-exist）` → 真实 HTTP `/status` 200 → 无令牌 401 → 真实 Chrome 载入页面后横幅自动出现、`hidden` 撤除、套用 `selfcheck--fatal`、标题「已拒绝启动」、原因与处理指引齐全，**完全满足本任务验收口径**。
  - 未引入新依赖，NOTICE / CREDITS / ADOPTION-REGISTER 三处无需改动。

### M0.4 记忆提炼器

- [ ] **M0.4.1** 新增 `packages/memory/src/extractor.ts`。
  - 做法：输入 `MemoryRaw[]`，构造提示词要求严格 JSON 数组，字段 `predicate/object/confidence/importance/subjectId`；用 `ctx.llm.stream()` 收集正文；解析失败时丢弃本次结果并记录日志。
  - 约束：单次输入不超过 20 条、总字数不超过 3000；超长截断，不拆多次调用。
  - 验收：单测覆盖正常 JSON、带 ``` 包裹、非法 JSON、空数组、超长截断。
- [ ] **M0.4.2** 接入 dialogue。
  - 做法：`appendTurn()` 后 5 秒触发；同一会话合并调度，避免并发；失败只记日志不重试。
  - 验收：连续 5 轮后 `recall()` 命中 ≥ 1 条；失败路径不抛异常。
- [ ] **M0.4.3** 提炼结果写入与去重。
  - 做法：同一 `predicate+object` 已存在时，保留 `importance` 高者，被取代者写 `supersededBy`；`manuallyEdited=1` 的事实不被覆盖。
  - 验收：单测覆盖去重与「用户手改不被覆盖」。

### M0.5 对话与记忆串联

- [ ] **M0.5.1** `dialogue.chat()` 接受记忆。
  - 做法：新增可选 `memory: { recent: MemoryRaw[]; facts: RecalledFact[] }`；拼装顺序为 system → 事实摘要（≤ 500 字）→ 最近原文（≤ 10 条）→ 本轮输入；超预算从最早原文开始裁。
  - 验收：单测断言拼装顺序与裁剪边界。
- [ ] **M0.5.2** 新增 `scripts/e2e-20turns.mjs`。
  - 做法：连续 20 轮对话，第 3 轮埋入「我明天要体检」，第 18 轮询问相关内容；断言能召回；记录每轮情绪值与输出条数。
  - 验收：脚本退出码 0；输出摘要含命中事实数与 `mood` 变化区间。

### M0.6 情感持久化

- [ ] **M0.6.1** `packages/emotion/src/store-sqlite.ts`。
  - 表结构：`emotion_state(instance_id, mood, energy, persona_id, updated_at)`、`relationship(instance_id, participant_id, affection, trust, intimacy, familiarity, updated_at)`。
  - 实现要点：复用 `node:sqlite`；目录 0700、库文件 0600；`save()` 幂等（`INSERT OR REPLACE`）。
  - 验收：单测：写入 → 新实例读取 → 值一致；权限断言通过。
- [ ] **M0.6.2** emotion 自动选择存储。
  - 做法：`NTDPET_HOME` 存在则用 SQLite，否则内存；打开失败退回内存并告警。
  - 验收：设置环境变量后重启，情绪不归零。

### M0.7 人格与提示词拼装

- [ ] **M0.7.1** `packages/persona/src/prompt.ts` 增加 `buildSystemPrompt()`。
  - 做法：内核条目 → 关系微调 → 浓度提示 → 边界声明；输出附带 `length` 与 `budget`（默认 1600 字符）；超预算时按优先级从低到高裁剪。
  - 验收：五种关系各生成一次，长度均 ≤ 预算；称呼替换正确。
- [ ] **M0.7.2** dialogue 改用该提示词。
  - 做法：删除测试中的硬编码 system；由调用方传入 `system`，缺省时用 persona 生成。
  - 验收：现有 dialogue 测试全过；新增一条断言默认 system 非空。

### M0.8 节奏接入输出

- [ ] **M0.8.1** 对话流结束后分条。
  - 做法：`planDelivery(text, { maxMessages })`，`maxMessages` 取通道能力，缺省 4；界面按 `delayMs` 依次渲染，渲染中显示「正在输入」。
  - 验收：单轮长文本被切为 1–4 条，间隔落在 300–6000ms。
- [ ] **M0.8.2** 夜间减速生效。
  - 做法：`now` 可注入，便于测试。
  - 验收：23:30 与 12:00 同文本的 `delayMs` 比值约为 1.6。

### M0.9 S0 收口

- [ ] **M0.9.1** 汇总验证。
  - 做法：全量构建、六个测试入口、界面冒烟、`scripts/backup.sh` 各跑一次，结果写入 `docs/S0-REPORT.md`。
  - 验收：报告含每项命令、用时、结论。
- [ ] **M0.9.2** 升版与打 tag。
  - 做法：version → `0.2.0`；CHANGELOG 增 `0.2.0`；README 状态表同步；`git tag -a v0.2.0`。
  - 验收：全新目录按 README 步骤可复现构建与测试。

---

## M1 三端打包（9 项）

- [ ] **M1.1** 引入构建工具。
  - 做法：`alex8088/electron-vite` + `electron-builder`；两者均为 MIT，需在 NOTICE「计划引入」移至「已引入」，并在采纳登记册改级别。
  - 验收：`npx electron-builder --dir` 在本机产出可启动的 `.app`。
- [ ] **M1.2** 主进程落地命名体系。
  - 做法：`app.setName('NT-DPet')`、`app.setPath('userData', …/NT-DPet)`；pidfile 写 `nt-dpet.pid`；子进程注入 `DSH_HOME`、`DSH_AGENTS_HOME`、`NTDPET_HOME`、`NTDPET_PORT`、`TMPDIR`。
  - 验收：启动后 `ps` 中进程名为 `nt-dpet-host`；`~/Library/Application Support` 下仅出现 `NT-DPet`。
- [ ] **M1.3** 子进程管理。
  - 做法：`detached: true` 起独立进程组；轮询等待端口可用（超时 30 秒）；退出按 pidfile 终止；异常退出自动重启一次，第二次失败则提示。
  - 验收：手动 `kill` 子进程后 5 秒内自动恢复；关闭应用后无残留进程。
- [ ] **M1.4** macOS 打包。
  - 做法：arm64 + x64；产出 `.dmg`；不公证，文档写明 Gatekeeper 手动放行步骤。
  - 验收：安装后首次启动可见引导页。
- [ ] **M1.5** Windows 打包。
  - 做法：NSIS；验证路径含空格与中文；`appId` 与 productName 保持 NT-DPet。
  - 验收：安装到中文路径后能启动并对话。
- [ ] **M1.6** Linux 打包。
  - 做法：AppImage；验证 `chmod +x` 后可运行。
  - 验收：Ubuntu 22.04 容器内启动成功。
- [ ] **M1.7** 首次启动引导。
  - 做法：四段（导入角色 / 预设人格 / 创建人格 / 其他配置），每段可跳过，跳过即用预设人格；状态存 `user/onboarding.json`。
  - 验收：跳过全部三段的用户可直接进入对话。
- [ ] **M1.8** 三端冒烟。
  - 做法：安装 → 启动 → 完成一次对话 → 退出 → 重启，检查记忆与情绪保留。
  - 验收：三端各出一份记录，写入 `docs/PLATFORM-SMOKE.md`。
- [ ] **M1.9** 收口：`0.3.0` + tag。

---

## M2 通道（7 项）

- [ ] **M2.1** 适配器接口定稿：`sendMessage`、`capabilities`、`onMessage`、`healthCheck`；`capabilities` 含 `maxReplyCount`、`supportsVoice`、`rateLimit`。
- [ ] **M2.2** QQ 官方机器人：`zhinjs/qq-official-bot`；被动回复 5 分钟窗口；分条上限 4；群聊需 @ 才唤醒。
- [ ] **M2.3** 微信公众号：服务号客服消息 + 48 小时窗口；超窗走模板消息或提示用户重发；订阅号仅被动回复。
- [ ] **M2.4** 个人微信：仅接口与风险提示，`disabled: true`，不实现自动化，界面二次确认。
- [ ] **M2.5** 唤醒路由：私聊、群聊 @、关键词三类；群聊每小时 ≤ 3 条语音；静默时段不主动。
- [ ] **M2.6** 通道测试：假适配器驱动 inbound → 完整链路 → 分条发送；断言条数与顺序。
- [ ] **M2.7** 收口：`0.4.0` + tag。

---

## M3 组合包与还原点（6 项）

- [ ] **M3.1** 组合包 schema 与校验器：完整字段集，校验必填项与校验和。
- [ ] **M3.2** 安装流程：冲突检测 → 建还原点 → 写 profile → 触发自检；任一步失败回滚。
- [ ] **M3.3** 还原点管理：默认保留 3 个，支持按数量与体积回收；回收前二次确认。
- [ ] **M3.4** 开发者模式：后果说明 + 二次确认 → 立即建还原点；两条缺一不生效。
- [ ] **M3.5** 本地包目录与界面列表（不联网）；空态文案正确。
- [ ] **M3.6** 收口：`0.5.0` + tag。

---

## M4 语音与表情（7 项）

- [ ] **M4.1** TTS 接口与三类实现骨架：云端、本地 Python 子进程、外部 HTTP 桥接。
- [ ] **M4.2** GPT-SoVITS 接入：独立进程、HTTP 契约、超时 15 秒、崩溃不影响主进程。
- [ ] **M4.3** silero-vad（onnxruntime）：判定语句结束，静音阈值可配。
- [ ] **M4.4** 四道闸门接线：情绪强度 > 0.4、句长 6–30、人设权重 > 0.3、通道未超频次。
- [ ] **M4.5** 连续三条不同形式；失败静默回退文本，不弹错误。
- [ ] **M4.6** 表情包四套来源与选择策略；无合适表情时不发。
- [ ] **M4.7** 收口：`0.6.0` + tag。

---

## M5 桌面桌宠（7 项）

- [ ] **M5.1** 评估 `dsh-whale-musume` 可否直接复用（决策 85 复用优先）；给出「复用 / 改造 / 自研」结论与理由。
- [ ] **M5.2** PixiJS + pixi-live2d-display 接入；Cubism Core 用户自装，缺失时降级静态立绘。
- [ ] **M5.3** 透明窗口、无边框拖动、置顶；macOS 优先，Windows 次之。
- [ ] **M5.4** 情绪 → 表情/动作映射表，五档情绪各对应一组。
- [ ] **M5.5** wlipsync 嘴型同步，仅在有语音时启用。
- [ ] **M5.6** 显示/隐藏、点击穿透、与主窗口互斥策略。
- [ ] **M5.7** 收口：`0.7.0` + tag。

---

## M6 手机操作（4 项）

- [ ] **M6.1** adb 通道：设备发现、截图、点击、输入；全部命令带超时。
- [ ] **M6.2** 权限与风险提示；无设备时功能静默不可用，不报错。
- [ ] **M6.3** GUI 决策环：截图 → 模型给单一动作 → 执行 → 截图校验；限单步、可撤销，不做连续自动化。
- [ ] **M6.4** 收口：`0.8.0` + tag。

---

## M7 其余通道（7 项）

- [ ] **M7.1** Telegram（grammY）→ **M7.2** Discord → **M7.3** 飞书 → **M7.4** 钉钉 → **M7.5** 企业微信。
- [ ] **M7.6** 通道矩阵测试：统一频次限制与分条上限，输出矩阵表。
- [ ] **M7.7** 收口：`0.9.0` + tag。

---

## M8 发布准备（6 项）

- [ ] **M8.1** 许可复核：`NOTICE`、`docs/ADOPTION-REGISTER.md`、`docs/CREDITS.md` 三处一致；禁止分发项零出现；逐项核对许可证原文。
- [ ] **M8.2** 隐私说明页：明文存储位置、固定关闭项、导出与卸载行为。
- [ ] **M8.3** 安装包内自动收集被分发组件的 LICENSE 并随包输出；构建脚本强校验。
- [ ] **M8.4** 官网更新：状态、下载入口、安装说明、已知限制。
- [ ] **M8.5** 发布检查表：三端安装、通道连通、记忆持久、情绪回归、自检、卸载残留。
- [ ] **M8.6** 升版 `1.0.0`，打 tag，发布 Release 与 SHA-256 校验和。

---

## 阻塞项登记

| 编号 | 阻塞原因 | 解除条件 | 记录时间 |
|---|---|---|---|
| — | — | — | — |

---

*本清单由定时任务维护：完成后勾选并追加提交号；遇阻塞写入上表并停止该项。*
