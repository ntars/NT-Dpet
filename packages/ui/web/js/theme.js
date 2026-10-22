/**
 * 主题控制
 *
 * 四种模式（决策 62：深浅色跟随系统；系统未提供时按日出日落切换）：
 *   system  跟随系统
 *   light   始终浅色
 *   dark    始终深色
 *   solar   按日出日落自动切换
 *
 * 日出日落用 NOAA 简化公式按日期与纬度计算，误差约在十分钟内，
 * 用于判断「现在是不是白天」足够。经纬度默认取中国中部，
 * 用户可在设置里改。
 */

const MODE_KEY = 'nt-dpet.theme.mode';
const GEO_KEY = 'nt-dpet.theme.geo';

export const THEME_MODES = ['system', 'light', 'dark', 'solar'];

/** 默认经纬度：中国中部（用于日出日落估算） */
const DEFAULT_GEO = { lat: 35, lon: 105 };

const mql = window.matchMedia('(prefers-color-scheme: dark)');

let currentMode = 'system';
let geo = { ...DEFAULT_GEO };

/* ── 存储（localStorage 不可用时静默降级为内存态） ── */

function readStore(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 隐私模式或 file:// 限制，忽略即可 */
  }
}

/* ── 日出日落计算 ── */

/**
 * 计算某天的日出与日落时刻（本地时间，单位：小时的小数形式）
 * @param {Date} date
 * @param {number} lat 纬度（北纬为正）
 * @returns {{sunrise: number|null, sunset: number|null}} 极昼或极夜时返回 null
 */
export function computeSunTimes(date, lat) {
  const startOfYear = Date.UTC(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - startOfYear) / 86400000);

  // 太阳赤纬（度）
  const declDeg = 23.45 * Math.sin(((2 * Math.PI) / 365) * (284 + dayOfYear));
  const decl = (declDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;

  const cosH = -Math.tan(latRad) * Math.tan(decl);
  if (cosH >= 1) return { sunrise: null, sunset: null };   // 极夜
  if (cosH <= -1) return { sunrise: null, sunset: null };  // 极昼

  // 半昼长（小时）
  const halfDay = (Math.acos(cosH) * 180) / Math.PI / 15;

  // 时差修正（分钟）
  const b = ((2 * Math.PI) / 364) * (dayOfYear - 81);
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);

  // 经度修正：东八区中央经线 120°E
  const lonCorrection = (geo.lon - 120) / 15;

  const solarNoon = 12 - lonCorrection - eot / 60;
  return {
    sunrise: solarNoon - halfDay,
    sunset: solarNoon + halfDay,
  };
}

/* ── 主题解析 ── */

function resolveSolar() {
  const now = new Date();
  const { sunrise, sunset } = computeSunTimes(now, geo.lat);

  // 极昼 / 极夜：直接按极昼处理（白天）
  if (sunrise === null || sunset === null) return 'light';

  const hour = now.getHours() + now.getMinutes() / 60;
  return hour >= sunrise && hour < sunset ? 'light' : 'dark';
}

export function resolveTheme() {
  switch (currentMode) {
    case 'light':
      return 'light';
    case 'dark':
      return 'dark';
    case 'solar':
      return resolveSolar();
    default:
      return mql.matches ? 'dark' : 'light';
  }
}

export function applyTheme() {
  document.documentElement.dataset.theme = resolveTheme();
}

/* ── 对外接口 ── */

export function getThemeMode() {
  return currentMode;
}

export function setThemeMode(mode) {
  if (!THEME_MODES.includes(mode)) return;
  currentMode = mode;
  writeStore(MODE_KEY, mode);
  applyTheme();
}

export function getGeo() {
  return { ...geo };
}

export function setGeo(next) {
  geo = { ...geo, ...next };
  writeStore(GEO_KEY, JSON.stringify(geo));
  if (currentMode === 'solar') applyTheme();
}

export function initTheme() {
  const savedMode = readStore(MODE_KEY);
  if (THEME_MODES.includes(savedMode)) currentMode = savedMode;

  const savedGeo = readStore(GEO_KEY);
  if (savedGeo) {
    try {
      const parsed = JSON.parse(savedGeo);
      if (typeof parsed.lat === 'number' && typeof parsed.lon === 'number') {
        geo = parsed;
      }
    } catch {
      /* 存储损坏则沿用默认值 */
    }
  }

  applyTheme();

  // 系统主题变化
  mql.addEventListener('change', () => {
    if (currentMode === 'system') applyTheme();
  });

  // 日出日落模式下每分钟校验一次，跨过日出/日落时自动切换
  setInterval(() => {
    if (currentMode === 'solar') applyTheme();
  }, 60000);
}
