// ============================================================
// 战役 4 · 批次 4-1：buildStyleTokens · CSS 变量 → RN tokens
// RN 独有 · A 类纯逻辑（零 react-native / React 依赖，Node 可直跑）。
//
// 输入：engine/theme.js 的 Theme.buildCssVars(theme) 输出对象。
//   契约来自 theme.js L503-545（直盘 grounding，封闭键集合）：
//   - 43 个 --c-* 色变量（#hex / rgba()，RN 均可直接消费）
//   - --font-sans / --font-serif / --font-mono / --kai（CSS font stack）
//   - --font-size-xs/sm/base/md/lg/xl（'10px' / '11.5px' … 小数字符串）
//   - --radius-none/sm/md/lg（'0' 无单位或 '2px'；编辑风三主题值不同）
//   - --glass-opacity（'1' 无单位）、--bg-image（'none' | url("…")）
//   - --fs-scale（'1' / '0.9' / '1.15'，CSS 侧消费语义为
//     calc(Npx * var(--fs-scale)) —— 乘法，故字号在 tokens 层乘算预算）
//   - 编辑风桥接：--bg/--panel/--card/--ink/--ink-2/--muted/--faint/
//     --hair/--hair-strong/--accent/--seal（色，语义别名）、
//     --sans/--serif/--kai（栈）、--radius、--glass-blur、--paper-grain、
//     --body-size、--body-lh
//
// 输出（五键契约 + 两个附加键承载编辑风 token，全量不漏映射）：
//   { colors, fontSizes, radius, fonts, background, editorial, meta }
//
// 纪律：theme.js 双仓共享零改动；本文件不回写 Electron 仓。
// ============================================================

'use strict';

// 数值化：'11.5px' → 11.5（保小数，禁用 parseInt）；
// '0' → 0；'1.8' → 1.8。非数值/空 → null（由调用方按字段决定兜底）。
function toNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  var n = parseFloat(String(raw));
  return isFinite(n) ? n : null;
}

// 乘算出口的数值规范化：fs-scale 乘法产生 IEEE754 尾巴
// （11.5*0.9=11.700000000000001、17*1.15=19.549999999999997）。
// CSS 侧由渲染像素取整消化；RN 直送浮点会把脏值带进样式契约，
// 故在 tokens 乘算单点收敛到千分位（字号场景精度足够）。
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

// --c-text-muted2 → textMuted2；--c-bg-white → bgWhite；
// --c-deep-error-bg → deepErrorBg；--c-shadow-sm → shadowSm；--c-text-3 → text3
function kebabVarToCamel(varName) {
  var core = varName.replace(/^--c-/, '');
  var parts = core.split('-');
  var out = parts[0];
  for (var i = 1; i < parts.length; i++) {
    var p = parts[i];
    out += p.charAt(0).toUpperCase() + p.slice(1);
  }
  return out;
}

// CSS font stack → RN 单 fontFamily。
// RN fontFamily 不接受 CSS 通用族栈（'-apple-system, …'）与未内嵌的
// CDN webfont（Noto/LXGW/马善政），故按"栈语义 + 平台可用系统字体"映射；
// kai（楷体）Android 无系统楷体，降级 serif（阶段 0 已标注的视觉降级点）。
var SYSTEM_FONTS = {
  ios: { sans: 'System', serif: 'Georgia', kai: 'Kaiti SC', mono: 'Menlo' },
  android: { sans: 'sans-serif', serif: 'serif', kai: 'serif', mono: 'monospace' },
  default: { sans: 'sans-serif', serif: 'serif', kai: 'serif', mono: 'monospace' }
};
function mapFontFamily(stack, kind, platform) {
  var table = SYSTEM_FONTS[platform] || SYSTEM_FONTS.default;
  return table[kind] || table.sans;
}

// 'none' → null；'url("https://x/y.png")' → { uri: 'https://x/y.png' }
function parseBgImage(raw) {
  if (!raw || raw === 'none') return null;
  var m = String(raw).match(/^url\(\s*(['"]?)(.*?)\1\s*\)$/);
  if (m && m[2]) return { uri: m[2] };
  return null;
}

// 编辑风语义别名（buildCssVars 的 --ink 等 11 个桥接色 → RN camelCase）
var ALIAS_COLOR_VARS = {
  '--bg': 'bg',
  '--panel': 'panel',
  '--card': 'card',
  '--ink': 'ink',
  '--ink-2': 'ink2',
  '--muted': 'muted',
  '--faint': 'faint',
  '--hair': 'hair',
  '--hair-strong': 'hairStrong',
  '--accent': 'accent',
  '--seal': 'seal'
};

var FONT_SIZE_VARS = ['--font-size-xs', '--font-size-sm', '--font-size-base',
  '--font-size-md', '--font-size-lg', '--font-size-xl'];
var FONT_SIZE_KEYS = ['xs', 'sm', 'base', 'md', 'lg', 'xl'];
var RADIUS_VARS = ['--radius-none', '--radius-sm', '--radius-md', '--radius-lg'];
var RADIUS_KEYS = ['none', 'sm', 'md', 'lg'];
var FONT_KINDS = [
  { varName: '--font-sans', alias: '--sans', kind: 'sans', key: 'sans' },
  { varName: '--font-serif', alias: '--serif', kind: 'serif', key: 'serif' },
  { varName: '--kai', kind: 'kai', key: 'kai' },
  { varName: '--font-mono', kind: 'mono', key: 'mono' }
];

function buildStyleTokens(cssVars, options) {
  var vars = cssVars || {};
  var opts = options || {};
  var platform = opts.platform || 'default';
  // fontScale：显式 options 优先；否则吃 --fs-scale；最终默认 1。
  var scale = (opts.fontScale != null)
    ? Number(opts.fontScale)
    : toNumber(vars['--fs-scale']);
  if (!isFinite(scale)) scale = 1;

  // ---- colors：43 个 --c-* 语义键（值原样透传，#hex/rgba RN 均可消费）----
  var colors = {};
  Object.keys(vars).forEach(function (v) {
    if (v.indexOf('--c-') === 0) {
      colors[kebabVarToCamel(v)] = String(vars[v]);
    }
  });
  // 编辑风语义别名（兼容别名策略：两种命名都能取到，不漏契约）
  Object.keys(ALIAS_COLOR_VARS).forEach(function (v) {
    if (vars[v] !== undefined) colors[ALIAS_COLOR_VARS[v]] = String(vars[v]);
  });

  // ---- fontSizes：px 数值化后乘 fs-scale（calc(Npx * scale) 预算）----
  var fontSizes = {};
  FONT_SIZE_VARS.forEach(function (v, i) {
    var n = toNumber(vars[v]);
    fontSizes[FONT_SIZE_KEYS[i]] = (n === null) ? null : round3(n * scale);
  });
  var bodySize = toNumber(vars['--body-size']);
  fontSizes.body = (bodySize === null) ? null : round3(bodySize * scale);

  // ---- radius：px/无单位统一数值化（不乘 fs-scale，CSS 里圆角不参与缩放）----
  var radius = {};
  RADIUS_VARS.forEach(function (v, i) {
    radius[RADIUS_KEYS[i]] = toNumber(vars[v]);
  });

  // ---- fonts：CSS 栈 → 平台系统 fontFamily ----
  var fonts = {};
  FONT_KINDS.forEach(function (f) {
    var stack = vars[f.varName] !== undefined ? vars[f.varName] : vars[f.alias];
    fonts[f.key] = mapFontFamily(stack, f.kind, platform);
  });

  // ---- background：url() → {uri}；opacity 数值化；
  //      filter：buildCssVars 不输出该变量（background.filter='none'），
  //      RN 亦无 CSS filter，恒 null 保留键形状 ----
  var background = {
    image: parseBgImage(vars['--bg-image']),
    opacity: (function () {
      var n = toNumber(vars['--glass-opacity']);
      return n === null ? 1 : n;
    })(),
    filter: null
  };

  // ---- editorial：编辑风三书票附加 token（旧六主题走 buildCssVars 兜底值）----
  var editorial = {
    radius: toNumber(vars['--radius']),
    glassBlur: toNumber(vars['--glass-blur']),
    paperGrain: toNumber(vars['--paper-grain']),
    seal: vars['--seal'] !== undefined ? String(vars['--seal']) : null,
    bodySize: fontSizes.body,
    bodyLh: toNumber(vars['--body-lh'])
  };

  return {
    colors: colors,
    fontSizes: fontSizes,
    radius: radius,
    fonts: fonts,
    background: background,
    editorial: editorial,
    meta: { fontScale: scale, platform: platform }
  };
}

module.exports = {
  buildStyleTokens: buildStyleTokens,
  // 导出纯工具供单测/复用
  toNumber: toNumber,
  kebabVarToCamel: kebabVarToCamel,
  mapFontFamily: mapFontFamily,
  parseBgImage: parseBgImage
};
