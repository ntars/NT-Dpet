# 上下文交接提示词 · v0.1

> 用途：新会话开场时，把这份内容整段贴给模型，即可无损接续本项目。
> 版本：**0.1.0**（2026-10-23 记）——语义是「设计定稿 + 两个包已实现」的起步里程碑，**不是可安装版本**。
> 采用 0.x：API 与行为仍会变动，1.0 留到 S0 验收通过（可日常使用）时再打。
> 上一次提交：`704624a`

---

## 一、你要接手的是什么

**NT-Dpet · 玄宠（NT-Dpet - 玄宠，从代码到身边）**——一个桌面伴侣软件，是 DeepSeek-Harness（下称 DSH）的**发行版**，不是独立框架。

- 仓库：`github.com/ntars/NT-Dpet`，AGPL-3.0
- 本地：`/Users/ntars/Documents/Github/NT-Dpet`
- 上游内核：DSH 桌面版 `0.2.1-rc.2`
- 主人：小玖（星玖工作室 Ntarstudio），全中文交流

它做三件事：**装配**（把人格/记忆/情绪/通道/声音装成整体）、**看住**（单点失效不拖垮全局）、**兜底**（增强失败静默退回基础能力）。

---

## 二、当前真实状态（不要假设更多）

| 模块 | 状态 |
|---|---|
| `@nt-dpet/emotion` 五维情感 | **已实现**，21 个单元测试 |
| `@nt-dpet/dialogue` 轻量对话通道 | **已实现**，12 个单元测试 + 真实网关端到端验证 |
| `packages/ui/web` 界面壳 | **已实现但纯静态**（演示数据，未接后端） |
| 项目介绍页 `index.html` | 已实现并部署（EdgeOne） |
| `@nt-dpet/pet-mobile` | 占位，默认 `disabled` |
| 其余 27 个包 | 骨架（`apply()` 为空） |
| 安装器 / 三端打包 | 未开始 |

包总数 **32**，全量构建通过（`npx pnpm@9 -r --filter './packages/**' build`）。
**仓库里没有任何可双击安装的产物。**

---

## 三、已经验证过的硬事实（可直接采信，不必重测）

1. **`DSH_HOME` 隔离有效**：独立目录跑完 CLI 后，目录外无任何文件被创建
2. **自定义包能被加载**：`apply(ctx)` 真实执行；`cordis.patch.yml` 必须用 `- insert: [...]` 包裹，**裸 entry 不报错、直接消失**
3. **插件加载是软失败**：挂不存在的包只打 `warning: 1 entry did not activate`，服务照常启动 → 因此必须做 entry 激活数自检
4. **不建 Session 也能调模型**：`ctx.llm.stream()` 直接可用，隐私约束不需要用功能换
5. **读取 `ctx.llm` 必须声明 `inject: ['llm']`**，否则抛 `cannot get property "llm" without inject` 且**整个插件不激活**
6. **流分片形状**（实测）：`block-start(reasoning) → reasoning-delta → block-start(text) → text-delta → block-end → usage → finish{reason:{kind}}`；正文字段是 **`text`**，不是 `delta`
7. **patch 覆盖已有 entry 必须写 `id`**，否则 `patch: id is required for non-insert patches`
8. **`--profile X` 后不要写 app 名**，否则 `too many arguments`
9. **CLI 位置**：`/Applications/DeepSeek Harness.app/Contents/Resources/app/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js`，系统 node 22 可跑
10. **推送通道**：`github.com:443` 被网络阻断，`ssh.github.com:443` 可达；origin 已是 SSH + `core.sshCommand "ssh -p 443"`

---

## 四、不可突破的约束

1. **运行时完全隔离**：独立 `DSH_HOME` / `DSH_AGENTS_HOME` / profile `nt-dpet` / 不写 `~/.dsh`、`~/.agents` / 不占 3080
2. **NT-Dpet 专属命名**：productName `NT-DPet`、appId `com.ntars.ntdpet`、进程名 `nt-dpet-host`、变量前缀 `NTDPET_`、服务键 `nt-dpet:*`、存储键 `ntdpet.`、端口默认 **9060**
3. **进程只按 pidfile 杀**，绝不 `pkill -f dsh`（会误杀官方 DSH）
4. **隐私**：`session-log-deepseek` 与 `plugin-package-inventory-deepseek` 固定 `false`，启动校验不过则**拒绝启动**；界面不给隐私开关
5. **用户资产与宿主数据分离**：`…/NT-Dpet/user/` 存人格/凭据/日记/账本/还原点，不进 `dsh-home/`
6. **高风险能力默认关闭**：个人微信、QQ 个人号（NapCat）
7. **不限制实现语言**：按组件选最优解，跨语言走进程/HTTP 契约，不用 FFI 绑死
8. **版权**：任何新增第三方组件必须同时登记 `NOTICE` 与 `docs/CREDITS.md`，区分「已引入 / 宿主提供 / 计划引入 / 禁止分发 / 仅参考」

---

## 五、下一步该做什么（按顺序）

S0 验收标准：**桌面能聊 20 轮 + 记忆跨轮生效 + 情绪会变 + 回复分条**。

| 顺序 | 任务 | 关键设计依据 |
|---|---|---|
| **1** | `@nt-dpet/memory`：双层存储（原文层同步、事实层异步 5 秒提炼）、三层裁决检索（语义 0.4 / 时间 0.4 / 重要度 0.2）、向量路先退化到关键词 | ARCHITECTURE §6 |
| 2 | `@nt-dpet/rhythm`：分条、停顿、深夜变慢（纯计算，可单测） | §3.4 |
| 3 | `@nt-dpet/persona`：五份 L1 锚点（妹妹/伴侣/朋友/助手/亲子）+ `$callUser` 变量替换 | §8.1、§8.2 |
| 4 | 界面接真实服务 + 启动自检 | §4.4 |
| 5 | desktop 隔离落地（paths / isolation / 端口 9060 / pidfile） | §2.3.1 |

人格关系五选一与默认称呼：妹妹→哥哥；伴侣→宝宝/乖乖/老公；朋友→名字或外号；助手→主人/老板；亲子→爸爸/妈妈（她自称女儿）。称呼是**默认值联动，可自定义**。

---

## 六、文件地图（先读这些）

| 路径 | 作用 |
|---|---|
| `README.md` | 产品文档：定位、亮点、设计九条、进度、平台、构建 |
| `NOTICE` | **法律文件**：第三方组件五种关系清单 |
| `docs/ARCHITECTURE.md` | 架构：隔离命名体系 §2.3、插件约定 §4.2、启动自检 §4.4、情感 §7、人格 §8、主动性 §10.8、移动端 §11.4 |
| `docs/TECH-RESEARCH.md` | 技术底账：§5.7 外部项目核查、§5.8 加载实证、§5.10 dialogue 实证 |
| `docs/DECISIONS.md` | 88 项决策，逐项可溯源 |
| `docs/CREDITS.md` | 致谢与许可边界（冲突时以 NOTICE 为准） |
| `packages/emotion/` | 参考实现：模块拆分、惰性回归、存储端口、单测写法 |
| `packages/dialogue/` | 参考实现：服务注入、流分片映射、假 ctx 单测写法 |

---

## 七、工作方式约定（主人偏好）

- 全中文，含内心独白；不自称英文
- **不臆造**：区分事实/推测/观点；不确定就说不确定，并给依据
- 每步先给结论，再给依据；发现前提错误直接指出
- 文件按模块化拆分，注释完整；不写无用代码
- 长任务分步落盘，断点续跑；收到「继续」先做断点恢复，不重做已完成步骤
- 交付时同步更新 README 与相关文档
- 高风险/不可逆操作：先警告、列清单、等确认

---

## 八、开场可直接用的一句话

> 接手 NT-Dpet v0.1。先读 `docs/HANDOFF.md`（本文）与 `README.md`，当前 emotion 与 dialogue 已实现，下一步是 `@nt-dpet/memory`。请先做断点恢复确认，再从 memory 开始实现，不要重做已完成部分。

---

*本文件随项目演进更新；版本号与 `CHANGELOG.md` 对应。*
