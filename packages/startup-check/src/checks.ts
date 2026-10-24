// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 自检的判定逻辑。
 *
 * 这个文件里没有 cordis、没有 IO、没有时间——输入一份快照，输出一份结论。
 * 这么做不是为了好看：四类异常（全通过、条目缺失、隐私开启、关键包缺失）
 * 都能直接构造快照来测，不用为了测一个判定去启动整个宿主。
 */

import {
  KEY_PACKAGES,
  PRIVACY_ENTRIES,
  type CheckResult,
  type CheckSeverity,
  type ConfigSnapshot,
  type EntrySnapshot,
  type StartupCheckResult,
} from './types.js'

/** detail 里最多列几个条目 id，再多就折成「等 N 个」，免得横幅被撑爆。 */
const MAX_LISTED = 5

/**
 * 取包名最后一段，用来做宽松匹配。
 *
 * `@nt-dpet/emotion` 与 `emotion` 都归到 `emotion`：配置树里写全名还是短名
 * 取决于安装方式，按最后一段比对两种写法都能命中。
 */
function shortName(name: string): string {
  const parts = name.split('/')
  return parts[parts.length - 1] ?? name
}

/** 把一串条目折成一句可读的话，超过上限就省略。 */
function listIds(labels: string[]): string {
  if (labels.length <= MAX_LISTED) return labels.join('、')
  const head = labels.slice(0, MAX_LISTED).join('、')
  return `${head} 等 ${labels.length} 个`
}

/**
 * 给一个失败条目造可读标签。
 *
 * 为什么不能只印 id：条目 id 未必是人写的。配置树里显式声明过的条目 id 通常
 * 自带语义（`nt-dpet:core:memory`），但运行期用 `loader.create()` 挂上去的条目
 * 拿到的是八位随机码（实测 `dbc76ec5`）。横幅上只写这个随机码，主人看到的是
 * 「有个叫 dbc76ec5 的东西没起来」，既认不出是哪个插件，也无从去配置里搜。
 *
 * 判据是「id 里能不能认出包名」：认得出来就只印 id，免得 `nt-dpet:core:memory`
 * 后面再拖一个 `（@nt-dpet/memory）` 显得啰嗦；认不出来才补上包名——
 * 这一补，随机码才有意义。
 */
function labelOf(entry: EntrySnapshot): string {
  if (entry.name === null) return entry.id
  const short = shortName(entry.name)
  if (short.length > 0 && entry.id.toLowerCase().includes(short.toLowerCase())) return entry.id
  return `${entry.id}（${entry.name}）`
}

/** 配置树读不到时，三项都无法判定，统一给出同一条原因。 */
function unreadable(reason: string): StartupCheckResult {
  const checks: CheckResult[] = [
    {
      id: 'entry-count',
      ok: false,
      detail: `配置树不可读，无法统计条目数：${reason}`,
      severity: 'warn',
    },
    {
      id: 'privacy-switches',
      ok: false,
      detail: `配置树不可读，无法确认隐私开关：${reason}`,
      severity: 'fatal',
    },
    {
      id: 'key-packages',
      ok: false,
      detail: `配置树不可读，无法确认关键包：${reason}`,
      severity: 'warn',
    },
  ]
  return { ok: false, checks }
}

/**
 * 判据一：配置树条目数与激活数相等。
 *
 * 口径要说清，否则这条检查会自己制造噪音：
 *   - 分组节点（group）不参与统计——它们只是容器，本来就不会 apply。
 *   - 被 `disabled` 显式关掉的条目也不参与——它们「不该激活」，不是「激活失败」。
 *   - 其余条目必须全部处于激活态。有任何一个留在未激活，就说明启动中途断了，
 *     而界面上通常看不出来，只能靠这里报。
 */
function checkEntryCount(entries: EntrySnapshot[]): CheckResult {
  const expected = entries.filter((entry) => !entry.disabled)
  if (expected.length === 0) {
    return {
      id: 'entry-count',
      ok: false,
      detail: '配置树里没有任何可激活条目，profile 可能没有正确组合',
      severity: 'warn',
    }
  }

  const inactive = expected.filter((entry) => !entry.active)
  if (inactive.length === 0) {
    return {
      id: 'entry-count',
      ok: true,
      detail: `配置树 ${expected.length} 个条目，全部已激活`,
      severity: 'warn',
    }
  }

  // 启动失败与「没起来」分开写：前者要去翻日志，后者多半是依赖没到位。
  const failed = inactive.filter((entry) => entry.error).map(labelOf)
  const pending = inactive.filter((entry) => !entry.error).map(labelOf)
  const parts: string[] = []
  if (failed.length) parts.push(`启动失败：${listIds(failed)}`)
  if (pending.length) parts.push(`未激活：${listIds(pending)}`)
  return {
    id: 'entry-count',
    ok: false,
    detail: `配置树 ${expected.length} 个条目，${expected.length - inactive.length} 个已激活；${parts.join('；')}`,
    severity: 'warn',
  }
}

/**
 * 判据二：两项隐私开关必须都是 `enabled: false`。
 *
 * 三种失败情形都要分开报，因为它们对应完全不同的处置：
 *   - 条目不存在：配置层根本没覆盖到，等于默认开着上传。
 *   - `enabled` 没写：同上，宿主默认值一般是 true。
 *   - `enabled: true`：有人明确打开了，这是主动违规，不是漏配。
 *
 * 这一项失败是 fatal——按 ARCHITECTURE §16.1，静默放行等于把聊天全文传出去。
 */
function checkPrivacySwitches(entries: EntrySnapshot[]): CheckResult {
  // 两类问题分开收：blocking 是真的还开着（必须失败），advisory 是达成了目的
  // 但手法不对（只提醒）。早先版本靠「文案里有没有某几个字」来分流，
  // 一改措辞就悄悄失效，故改成结构化分组。
  const blocking: string[] = []
  const advisory: string[] = []

  for (const wanted of PRIVACY_ENTRIES) {
    // 条目 id 允许带层级前缀（`nt-dpet:...`），所以按末段或整体比对，
    // 也允许包名式写法，三种写法都能命中。
    const entry = entries.find(
      (candidate) =>
        candidate.id === wanted ||
        candidate.id.endsWith(`:${wanted}`) ||
        (candidate.name !== null && shortName(candidate.name) === wanted),
    )
    if (!entry) {
      blocking.push(`${wanted} 不在配置树里（未覆盖，默认可能仍在上传）`)
      continue
    }
    if (entry.disabled) {
      // 整条禁用要先判：禁用之后插件不运行，`enabled` 写什么都不会真的上传。
      // 但配置里若仍写着 true，属于「被掩盖着的问题」——哪天有人取消禁用，
      // 上传就悄悄恢复了，所以这种情形照样算失败，不能只看当下有没有传。
      if (entry.enabled === true) {
        blocking.push(`${wanted} 的 enabled 仍为 true，只是被整条禁用掩盖（一经启用即上传）`)
      } else {
        advisory.push(`${wanted} 靠禁用整条达成静默，建议改为 enabled: false`)
      }
      continue
    }
    if (entry.enabled === undefined) {
      blocking.push(`${wanted} 的 enabled 不是明确的 false（默认可能仍在上传）`)
      continue
    }
    if (entry.enabled !== false) {
      blocking.push(`${wanted} 的 enabled 为 true`)
      continue
    }
  }

  if (blocking.length === 0) {
    return {
      id: 'privacy-switches',
      ok: true,
      detail:
        advisory.length === 0
          ? '两项隐私开关均为 enabled: false'
          : `两项隐私开关均未开启；提醒：${advisory.join('；')}`,
      severity: 'fatal',
    }
  }

  return {
    id: 'privacy-switches',
    ok: false,
    detail: `隐私开关未硬关：${[...blocking, ...advisory].join('；')}`,
    severity: 'fatal',
  }
}

/**
 * 判据三：四个关键包都在激活列表里。
 *
 * 只看激活的条目，不看配置树里存不存在——包装了却没起来，能力一样是缺的，
 * 这正是 M0.3.2 要让人看见的那种「看起来正常、实则不能」的状态。
 */
function checkKeyPackages(entries: EntrySnapshot[]): CheckResult {
  const activeNames = new Set<string>()
  for (const entry of entries) {
    if (!entry.active || entry.name === null) continue
    activeNames.add(shortName(entry.name))
  }

  const missing = KEY_PACKAGES.filter((pkg) => !activeNames.has(shortName(pkg)))
  if (missing.length === 0) {
    return {
      id: 'key-packages',
      ok: true,
      detail: `${KEY_PACKAGES.length} 个关键包全部在激活列表：${KEY_PACKAGES.join('、')}`,
      severity: 'warn',
    }
  }

  return {
    id: 'key-packages',
    ok: false,
    detail: `缺少关键包 ${missing.length} 个：${missing.join('、')}；相关能力应降级为只读`,
    severity: 'warn',
  }
}

/**
 * 跑一次自检。
 *
 * 三项都跑完再下结论，不短路：只报第一项的话，修完一个问题还要再等一轮启动
 * 才知道还有别的问题，来回折腾。
 */
export function evaluateStartup(snapshot: ConfigSnapshot): StartupCheckResult {
  if (!snapshot.readable) {
    return unreadable(snapshot.reason ?? '未给出原因')
  }

  const checks: CheckResult[] = [
    checkEntryCount(snapshot.entries),
    checkPrivacySwitches(snapshot.entries),
    checkKeyPackages(snapshot.entries),
  ]

  return {
    ok: checks.every((check) => check.ok),
    checks,
  }
}

/** 按严重程度筛出失败项，供界面决定「拒绝启动」还是「出横幅」。 */
export function failingChecks(
  result: StartupCheckResult,
  severity: CheckSeverity,
): CheckResult[] {
  return result.checks.filter((check) => !check.ok && check.severity === severity)
}
