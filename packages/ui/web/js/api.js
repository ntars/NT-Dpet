// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ntarstudio（星玖工作室）

/**
 * 接口客户端：界面与 `/api/ntdpet` 之间的唯一通道。
 *
 * 为什么单独一个文件、不写进 app.js：
 * 后面情绪面板、右栏记忆、对话发送三处都要发请求。各自写一遍 fetch 的结果是
 * 超时、令牌、错误提示三套实现各说各话——其中一处忘了带令牌，表现成
 * 「这块突然加载不出来」，排查成本极高。这里统一一次，调用方只关心数据。
 *
 * 三条硬约束（ROADMAP M0.2.1）：
 *   1. 不引入第三方库，只用浏览器自带能力；
 *   2. 令牌不进日志、不在地址栏留存；
 *   3. 所有失败收敛成同一个错误对象，界面只需一种处理方式。
 *
 * 与后端约定的外层结构见 packages/ui/src/api/types.ts：
 *   成功 { ok: true, data: ... }
 *   失败 { ok: false, error: { code, message } }
 */

/** 路由前缀，与 handler.ts 的 API_PREFIX 必须一致。 */
const PREFIX = '/api/ntdpet';

/** 会话存储里的键名。只存本标签页，关掉就没了，符合「令牌不长期落地」。 */
const TOKEN_KEY = 'nt-dpet.token';

/** 令牌请求头，与 handler.ts 的 TOKEN_HEADER 一致（头名大小写不敏感）。 */
const TOKEN_HEADER = 'X-NTDPet-Token';

/** 普通请求的默认超时。8 秒是 ROADMAP 定的口径，够本地进程间调用。 */
const TIMEOUT_MS = 8000;

/**
 * 最后兜底的地址。
 *
 * 只在页面不是由宿主提供时才会用到（比如直接开 index.html 调界面）。
 * 9061 是 M0.1 探针用过的端口，不是生产端口——生产走 `location.origin`。
 */
const FALLBACK_ORIGIN = 'http://127.0.0.1:9061';

/**
 * 统一的失败对象。
 *
 * 用 Error 子类而不是普通对象：这样 `console.error(err)` 能带堆栈，
 * 同时调用方仍可用 `err.code` 分支。code 取值：
 *   UNAUTHORIZED / NOT_FOUND / METHOD_NOT_ALLOWED / NOT_READY / INTERNAL
 *     —— 后端给的（见 types.ts）
 *   TIMEOUT / NETWORK / ABORTED / BAD_RESPONSE
 *     —— 网络层产生，后端不会返回
 */
export class ApiError extends Error {
  /**
   * @param {string} code 机器可读的错误码
   * @param {string} message 给用户看的中文短句
   * @param {number} status HTTP 状态码，网络层失败时为 0
   */
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** 主动中断（关窗、切换会话）产生的错误，界面不该当成故障提示。 */
export function isAbort(err) {
  return err instanceof ApiError && err.code === 'ABORTED';
}

/* ── 地址与令牌 ── */

/**
 * 接口根地址，不带尾部斜杠。
 *
 * 优先 `window.__NTDPET_API__`（宿主或调试时可覆盖）；
 * 其次当前页面来源——生产就是这样：宿主把页面和接口放在同一端口，
 * 走同源还能免掉 CORS 与预检；
 * 最后才是兜底常量。
 */
export function baseURL() {
  const injected = window.__NTDPET_API__;
  if (typeof injected === 'string' && injected.trim() !== '') {
    return stripSlash(injected.trim());
  }

  // file:// 打开时 location.origin 是字符串 "null"，不能当地址用
  const origin = location.origin;
  if (typeof origin === 'string' && /^https?:\/\//.test(origin)) {
    return stripSlash(origin);
  }

  return FALLBACK_ORIGIN;
}

/**
 * 取本次会话的令牌。
 *
 * 三个来源，按可靠性排序：
 *   1. `window.__NTDPET_TOKEN__`：宿主用 tapIndex 直接写进 HTML，最可靠，
 *      因为这份 HTML 只可能来自同源请求；
 *   2. 查询串 `?token=`：手工打开页面或外部跳转时用；
 *   3. sessionStorage：刷新页面后接着用，省得每次重新拼查询串。
 *
 * 取到之后立刻从地址栏抹掉（见 forgetTokenInAddress）：令牌留在 URL 里
 * 会被截图、被复制粘贴、被写进浏览器历史，等于长期泄露。
 *
 * @returns {string} 取不到时返回空串，由调用方决定是否继续
 */
export function getToken() {
  const injected = window.__NTDPET_TOKEN__;
  if (typeof injected === 'string' && injected !== '') {
    remember(injected);
    return injected;
  }

  let fromQuery = '';
  try {
    fromQuery = new URLSearchParams(location.search).get('token') ?? '';
  } catch {
    /* 地址异常就当没有 */
  }

  if (fromQuery !== '') {
    remember(fromQuery);
    forgetTokenInAddress();
    return fromQuery;
  }

  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    // 隐私模式或站点数据被禁用时 sessionStorage 会抛，不能因此让页面崩掉
    return '';
  }
}

/* ── 普通请求 ── */

/**
 * 发一个请求并直接返回 `data`。
 *
 * 失败一律抛 ApiError，不返回 `{ ok: false }` 这种东西——调用方多一个分支，
 * 就多一次写错的机会；用异常时忘记处理的后果是「报错」，用返回值时忘记处理的
 * 后果是「界面空白」，后者更难查。
 *
 * @param {string} path 子路径，如 `/mood`
 * @param {object} [options]
 * @param {'GET'|'POST'|'PUT'|'DELETE'} [options.method]
 * @param {unknown} [options.body] 会被 JSON 序列化
 * @param {Record<string, string|number>} [options.query] 查询参数，自动编码
 * @param {AbortSignal} [options.signal] 外部中断信号
 * @param {number} [options.timeoutMs] 覆盖默认超时；传 0 表示不限时
 * @returns {Promise<any>}
 */
export async function request(path, options = {}) {
  const {
    method = 'GET',
    body,
    query,
    signal,
    timeoutMs = TIMEOUT_MS,
  } = options;

  const guard = createGuard(timeoutMs, signal);

  try {
    const res = await fetch(buildURL(path, query), {
      method,
      headers: buildHeaders(body),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: guard.signal,
      // 接口带 no-store，这里也禁止浏览器缓存，避免刷新后看到上一次的情绪值
      cache: 'no-store',
      credentials: 'same-origin',
    });

    const payload = await readJSON(res);

    if (!res.ok || !payload || payload.ok !== true) {
      throw toApiError(res.status, payload);
    }

    return payload.data;
  } catch (err) {
    throw normalize(err, guard);
  } finally {
    guard.release();
  }
}

/* ── 流式对话 ── */

/**
 * 发一次对话并逐块产出。
 *
 * 用异步生成器而不是回调：调用方 `for await` 就能按顺序渲染，
 * 不需要自己维护「上一块还没画完、下一块又到了」的队列。
 *
 * 产出的事件形状：
 *   { type: 'delta', text }                 —— 追加一段文字
 *   { type: 'done', stopReason }            —— 结束，stopReason 可能是 end / aborted / ...
 *   { type: 'error', message }              —— 上游在流里报错（HTTP 已 200 的情况）
 *   { type: 'event', data }                 —— 识别不了的块，原样给出，不吞掉
 *
 * 默认不设超时：一次对话可能远超 8 秒。要限制就显式传 timeoutMs。
 *
 * @param {object} body 请求正文，如 `{ conversationId: 'owner', text: '在吗' }`
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.timeoutMs]
 */
export async function* streamChat(body, options = {}) {
  const { signal, timeoutMs = 0 } = options;
  const guard = createGuard(timeoutMs, signal);

  try {
    const res = await fetch(buildURL('/chat'), {
      method: 'POST',
      headers: buildHeaders(body ?? {}),
      body: JSON.stringify(body ?? {}),
      signal: guard.signal,
      cache: 'no-store',
      credentials: 'same-origin',
    });

    // 鉴权失败、未接入等情况会在这里返回 JSON，不是流，必须先拦
    if (!res.ok || !res.body) {
      const payload = await readJSON(res);
      throw toApiError(res.status, payload);
    }

    yield* parseStream(res.body);
  } catch (err) {
    throw normalize(err, guard);
  } finally {
    guard.release();
  }
}

/* ── 内部实现 ── */

/**
 * 解析 text/event-stream。
 *
 * 两个容易踩的点：
 *   1. 一行的两端可能落在两个数据块里，必须自己攒行缓冲，不能对每块直接 split；
 *   2. 一个汉字的三个字节也可能被拆开，解码要用 `{ stream: true }`，
 *      否则拼缝处会出现乱码（问号或方块）。
 */
async function* parseStream(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');

  let buffer = '';
  let eventName = '';
  let dataLines = [];

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let cut = buffer.indexOf('\n');
      while (cut !== -1) {
        const rawLine = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 1);

        // 去掉行尾的 \r，兼容 CRLF 的服务端
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

        if (line === '') {
          const event = flushEvent(eventName, dataLines);
          eventName = '';
          dataLines = [];
          if (event) {
            yield event;
            if (event.type === 'done') return;
          }
        } else if (line.startsWith(':')) {
          // 注释行（心跳保活），忽略
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^ /, ''));
        } else if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        }
        // id: / retry: 及其它未知字段直接跳过

        cut = buffer.indexOf('\n');
      }
    }

    // 收尾：把解码器里剩的半个字符冲出来，再处理不带空行结尾的最后一条事件
    buffer += decoder.decode();
    if (buffer !== '') {
      const line = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
      if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
      else if (line.startsWith('event:')) eventName = line.slice(6).trim();
    }

    const tail = flushEvent(eventName, dataLines);
    if (tail) yield tail;
  } finally {
    // 提前 return 或抛错时释放读取锁，避免流一直挂着不回收
    reader.releaseLock();
  }
}

/** 把攒够的一个事件转成对外形状；没有数据就不产出。 */
function flushEvent(name, lines) {
  if (lines.length === 0) return null;

  const raw = lines.join('\n');

  // OpenAI 风格的结束标记
  if (raw === '[DONE]') return { type: 'done', stopReason: 'end' };

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    // 不是 JSON 就当纯文本增量。上游契约还没定，先容错
    data = raw;
  }

  return classify(name, data);
}

/**
 * 归一化一个事件。
 *
 * `/chat` 的正文格式要等 M0.2.4 定契约，这一版按「能认就认、认不出就原样交出」
 * 处理：宁可多给一个 event，也不要把内容悄悄丢掉——丢掉的表现是「她只说了半句」，
 * 而这类问题从界面完全看不出原因。
 */
function classify(name, data) {
  if (typeof data === 'string') {
    if (name === 'error') return { type: 'error', message: data };
    return data === '' ? null : { type: 'delta', text: data };
  }

  if (data && typeof data === 'object') {
    const kind = typeof data.type === 'string' ? data.type : name;

    if (kind === 'error') {
      return { type: 'error', message: String(data.message ?? '上游返回了错误') };
    }

    if (kind === 'done' || data.done === true || typeof data.stopReason === 'string') {
      return { type: 'done', stopReason: data.stopReason ?? 'end' };
    }

    const text = pickText(data);
    if (text !== undefined) return { type: 'delta', text };
  }

  return { type: 'event', data };
}

/** 从各种可能的分块字段里取文本。 */
function pickText(data) {
  for (const key of ['text', 'delta', 'content', 'chunk']) {
    const value = data[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

/**
 * 造一个可中断、可超时的信号。
 *
 * 为什么要包一层而不是直接用外部的 signal：外部只会因为「关窗」中断，
 * 而这里还要叠加一个超时。两者必须都生效，且事后能分清是哪一个，
 * 否则超时会被当成用户主动取消，界面就不会提示「请求超时」。
 */
function createGuard(timeoutMs, outer) {
  const controller = new AbortController();
  let reason = '';

  let timer = 0;
  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      reason = 'timeout';
      controller.abort();
    }, timeoutMs);
  }

  const onOuterAbort = () => {
    reason = 'outer';
    controller.abort();
  };

  if (outer) {
    if (outer.aborted) onOuterAbort();
    else outer.addEventListener('abort', onOuterAbort, { once: true });
  }

  return {
    signal: controller.signal,
    /** 是超时还是外部取消。 */
    reason: () => reason,
    release() {
      if (timer) clearTimeout(timer);
      if (outer) outer.removeEventListener('abort', onOuterAbort);
    },
  };
}

/** 把各种异常收敛成 ApiError。 */
function normalize(err, guard) {
  if (err instanceof ApiError) return err;

  if (err && (err.name === 'AbortError' || err.code === 20)) {
    return guard.reason() === 'timeout'
      ? new ApiError('TIMEOUT', '请求超时，请稍后重试')
      : new ApiError('ABORTED', '请求已中断');
  }

  // fetch 在断网、连接被拒时抛 TypeError，文案因浏览器而异，统一成一句中文
  return new ApiError('NETWORK', '连不上本地服务，请确认程序还在运行');
}

/** 状态码兜底文案：后端没给 message 时用，避免界面出现英文或空白。 */
function toApiError(status, payload) {
  const code = payload?.error?.code ?? codeFromStatus(status);
  const message = payload?.error?.message ?? messageFromStatus(status);
  return new ApiError(code, message, status);
}

function codeFromStatus(status) {
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 405) return 'METHOD_NOT_ALLOWED';
  if (status === 503) return 'NOT_READY';
  return 'INTERNAL';
}

function messageFromStatus(status) {
  if (status === 401 || status === 403) return '令牌无效或缺失';
  if (status === 404) return '无此接口';
  if (status === 405) return '该接口不接受这种请求方式';
  if (status === 503) return '该功能尚未接入';
  if (status >= 500) return '内部错误';
  return `请求失败（HTTP ${status}）`;
}

/** 读 JSON；响应不是 JSON（比如网关返回一页 HTML）时给 null，交给上层报错。 */
async function readJSON(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** 拼完整地址；查询参数统一走 URLSearchParams，省得自己处理转义。 */
function buildURL(path, query) {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  let url = baseURL() + PREFIX + suffix;

  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
    const text = params.toString();
    if (text !== '') url += `?${text}`;
  }

  return url;
}

/**
 * 请求头。
 *
 * 令牌只放请求头，不放查询串：查询串会被日志、代理、截图抄走。
 * 没有令牌时干脆不带这个头——带个空值反而让服务端分不清
 * 「没登录」和「令牌是空串」。
 */
function buildHeaders(body) {
  const headers = {};

  if (body !== undefined) headers['content-type'] = 'application/json';

  const token = getToken();
  if (token !== '') headers[TOKEN_HEADER] = token;

  return headers;
}

/** 写 sessionStorage，失败不抛：存不下只是下次要重新取，不该影响本次使用。 */
function remember(token) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* 存储被禁用，忽略 */
  }
}

/** 把 token 从地址栏去掉，其余参数与锚点保留。 */
function forgetTokenInAddress() {
  try {
    const url = new URL(location.href);
    if (!url.searchParams.has('token')) return;

    url.searchParams.delete('token');
    // 只传路径不传完整地址，避免把当前域写成绝对地址
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch {
    /* 地址异常就保持原样 */
  }
}

function stripSlash(value) {
  return value.replace(/\/+$/, '');
}
