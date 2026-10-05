// ============================================================
// 战役 4 · 批次 4-1 · buildStyleTokens 验证（Node）
// 用法：node tools/theme_tokens_smoke.js
//
// 真链：require rn/rn_bootstrap.js（47 模块 + Storage polyfill），
// 取共享数据层 Theme，对全部 9 套内置主题跑
// buildCssVars → buildStyleTokens，做全量契约断言：
// - 五键结构完整；colors 全 string；fontSizes/radius 全 number；
//   fonts 全 string；background/editorial 形状；无 undefined / NaN
// - paper-white 详细值抽查（含 11.5 小数精度红线）
// - glass rgba 透传 + 编辑风 token；fs-scale 乘法预算
// - url()/none 背景解析、kebab→camel、平台字体映射
// ============================================================

'use strict';

var ok = 0, fail = 0;
var failures = [];

function check(name, cond, detail) {
  if (cond) {
    ok++;
    console.log('PASS: ' + name);
  } else {
    fail++;
    failures.push(name + (detail ? (' :: ' + detail) : ''));
    console.log('FAIL: ' + name + (detail ? (' :: ' + detail) : ''));
  }
}

// 深度扫描：任何叶子不得为 undefined；任何 number 必须 finite（禁 NaN）
function scanBad(node, path, acc) {
  if (node === undefined) { acc.undef.push(path); return; }
  if (typeof node === 'number' && !isFinite(node)) { acc.nan.push(path); return; }
  if (node && typeof node === 'object') {
    Object.keys(node).forEach(function (k) { scanBad(node[k], path + '.' + k, acc); });
  }
}

// ---- 真链：bootstrap（Theme 为缓存同对象，Storage polyfill 已挂）----
console.log('---- 真链：rn_bootstrap ----');
var boot = require('../rn/rn_bootstrap.js');
// P4 同步 50→51：rn_bootstrap 新增 LogQuery（P4·S2 query_log 检索入口），断言随模块清单同步
check('BOOTSTRAP 64/0（H6 加 UI_Portrait、P1-F 加 CARDS、P1-G 加 CardClassifyPure、P1-H 加 InfoFeed、P2·S1 加 WebSearchManager、P2·S2 加 NumEditor、P4·S2 加 LogQuery、P15 加 12 个导入层模块、P28 加 Background）', boot.ok === 64 && boot.failed === 0,
  'ok=' + boot.ok + ' failed=' + boot.failed);

var Theme = require('../engine/theme.js');
var TT = require('../rn/theme_tokens.js');
var buildStyleTokens = TT.buildStyleTokens;

// H2-R1：H2 主题 9→13 同步，补 high-contrast/solarized/dark/sepia 4 个 id
var EXPECTED_IDS = ['paper-white', 'eye-green', 'warm-sun', 'midnight-blue',
  'charcoal', 'deep-purple', 'paper', 'glass', 'scroll',
  'high-contrast', 'solarized', 'dark', 'sepia'];
var builtins = Theme.BUILTIN_THEMES;
// H2-R1：期望值 9→13（H2 移植 4 套新主题）
check('内置主题 === 13 套', builtins.length === 13, 'actual=' + builtins.length);
check('13 套 ID 与基准逐字一致',
  EXPECTED_IDS.every(function (id, i) { return builtins[i].id === id; }),
  builtins.map(function (t) { return t.id; }).join(','));

var FONT_SIZE_KEYS = ['xs', 'sm', 'base', 'md', 'lg', 'xl', 'body'];
var RADIUS_KEYS = ['none', 'sm', 'md', 'lg'];
var FONT_KEYS = ['sans', 'serif', 'kai', 'mono'];

// 43 个 --c-* 语义键 + 编辑风别名新增 9 个唯一名
// （--bg/--accent 与 --c-bg/--c-accent 同名，不重复计数）
var EXPECTED_COLOR_COUNT = 43 + 9;

console.log('---- 9 主题全量契约 ----');
builtins.forEach(function (theme) {
  var vars = Theme.buildCssVars(theme);
  var tk = buildStyleTokens(vars, { fontScale: theme.fontScale || 1 });
  var tag = '[' + theme.id + '] ';

  check(tag + '五键结构',
    tk.colors && tk.fontSizes && tk.radius && tk.fonts && tk.background,
    'keys=' + Object.keys(tk).join(','));

  check(tag + 'colors 键数 === ' + EXPECTED_COLOR_COUNT,
    Object.keys(tk.colors).length === EXPECTED_COLOR_COUNT,
    'actual=' + Object.keys(tk.colors).length);

  var badColor = Object.keys(tk.colors).filter(function (k) {
    return typeof tk.colors[k] !== 'string' || tk.colors[k] === '';
  });
  check(tag + 'colors 全为非空 string', badColor.length === 0,
    badColor.join(','));

  var badFs = FONT_SIZE_KEYS.filter(function (k) { return typeof tk.fontSizes[k] !== 'number'; });
  check(tag + 'fontSizes 7 键全 number', badFs.length === 0,
    badFs.map(function (k) { return k + '=' + tk.fontSizes[k]; }).join(','));

  var badR = RADIUS_KEYS.filter(function (k) { return typeof tk.radius[k] !== 'number'; });
  check(tag + 'radius 4 键全 number', badR.length === 0,
    badR.map(function (k) { return k + '=' + tk.radius[k]; }).join(','));

  var badF = FONT_KEYS.filter(function (k) { return typeof tk.fonts[k] !== 'string' || !tk.fonts[k]; });
  check(tag + 'fonts 4 键全非空 string', badF.length === 0, badF.join(','));

  check(tag + 'background 形状（image/opacity/filter）',
    (tk.background.image === null || (tk.background.image && tk.background.image.uri)) &&
    typeof tk.background.opacity === 'number' && tk.background.filter === null,
    JSON.stringify(tk.background));

  check(tag + 'editorial 形状',
    typeof tk.editorial.radius === 'number' &&
    typeof tk.editorial.glassBlur === 'number' &&
    typeof tk.editorial.paperGrain === 'number' &&
    typeof tk.editorial.bodySize === 'number' &&
    typeof tk.editorial.bodyLh === 'number' &&
    typeof tk.editorial.seal === 'string',
    JSON.stringify(tk.editorial));

  var acc = { undef: [], nan: [] };
  scanBad(tk, 'tokens', acc);
  check(tag + '无 undefined / NaN',
    acc.undef.length === 0 && acc.nan.length === 0,
    'undef=' + acc.undef.join(',') + ' nan=' + acc.nan.join(','));
});

// ---- paper-white 详细抽查（默认主题 grounding 基准）----
console.log('---- paper-white 详细值 ----');
var pw = Theme.getBuiltin('paper-white');
var pwVars = Theme.buildCssVars(pw);
var pwTk = buildStyleTokens(pwVars);

check('paper-white colors.bg 抽查', pwTk.colors.bg === '#f5f3ee', pwTk.colors.bg);
check('paper-white colors.text 抽查', pwTk.colors.text === '#2a2a2a', pwTk.colors.text);
check('paper-white colors.primary 抽查', pwTk.colors.primary === '#4a4736', pwTk.colors.primary);
check('paper-white colors.accent 抽查（大小写原样）', pwTk.colors.accent === '#5D5113', pwTk.colors.accent);
check('paper-white colors.deepRejectedBg（kebab 转换）',
  pwTk.colors.deepRejectedBg === '#2a1a1a', pwTk.colors.deepRejectedBg);
check('paper-white colors.textMuted2（数字后缀转换）',
  pwTk.colors.textMuted2 === '#7a7a7a', pwTk.colors.textMuted2);

check('小数精度 sm === 11.5（禁 parseInt）', pwTk.fontSizes.sm === 11.5,
  'actual=' + pwTk.fontSizes.sm);
check('字号 xs/base/md/lg/xl',
  pwTk.fontSizes.xs === 10 && pwTk.fontSizes.base === 13 &&
  pwTk.fontSizes.md === 14 && pwTk.fontSizes.lg === 16 && pwTk.fontSizes.xl === 20,
  JSON.stringify(pwTk.fontSizes));
check('radius none/sm/md/lg === 0/2/6/8（none 无单位）',
  pwTk.radius.none === 0 && pwTk.radius.sm === 2 &&
  pwTk.radius.md === 6 && pwTk.radius.lg === 8,
  JSON.stringify(pwTk.radius));
check('编辑风兜底 radius 2 / blur 0 / grain 0 / seal / body 17 / lh 1.85',
  pwTk.editorial.radius === 2 && pwTk.editorial.glassBlur === 0 &&
  pwTk.editorial.paperGrain === 0 && pwTk.editorial.seal === '#a8402f' &&
  pwTk.editorial.bodySize === 17 && pwTk.editorial.bodyLh === 1.85,
  JSON.stringify(pwTk.editorial));
check('旧六主题背景 image=null opacity=1 filter=null',
  pwTk.background.image === null && pwTk.background.opacity === 1 &&
  pwTk.background.filter === null);
check('编辑风别名 ink/panel/card/muted/faint/hair/hairStrong/seal 全部可达',
  pwTk.colors.ink === '#2a2a2a' && pwTk.colors.panel === '#f0ede6' &&
  pwTk.colors.card === '#ffffff' && pwTk.colors.muted === '#6a6a6a' &&
  pwTk.colors.faint === '#a0a0a0' && pwTk.colors.hair === '#e0ddd6' &&
  pwTk.colors.hairStrong === '#d0cdc6' && pwTk.colors.seal === '#a8402f');

// ---- 平台字体映射 ----
console.log('---- 字体平台映射 ----');
var iosTk = buildStyleTokens(pwVars, { platform: 'ios' });
var andTk = buildStyleTokens(pwVars, { platform: 'android' });
check('ios 字体 sans=System serif=Georgia kai=Kaiti SC mono=Menlo',
  iosTk.fonts.sans === 'System' && iosTk.fonts.serif === 'Georgia' &&
  iosTk.fonts.kai === 'Kaiti SC' && iosTk.fonts.mono === 'Menlo',
  JSON.stringify(iosTk.fonts));
check('android 字体 sans=sans-serif serif/kai=serif mono=monospace（kai 降级）',
  andTk.fonts.sans === 'sans-serif' && andTk.fonts.serif === 'serif' &&
  andTk.fonts.kai === 'serif' && andTk.fonts.mono === 'monospace',
  JSON.stringify(andTk.fonts));

// ---- glass：rgba 透传 + 编辑风圆角/磨砂 ----
console.log('---- glass/scroll 编辑风 ----');
var gl = buildStyleTokens(Theme.buildCssVars(Theme.getBuiltin('glass')));
check('glass bgCard rgba 原样透传',
  gl.colors.bgCard === 'rgba(255,255,255,0.07)', gl.colors.bgCard);
check('glass radius sm/md/lg === 4/8/12',
  gl.radius.sm === 4 && gl.radius.md === 8 && gl.radius.lg === 12,
  JSON.stringify(gl.radius));
check('glass editorial radius12 blur14 grain0.02 seal#e0706a body16 lh1.8',
  gl.editorial.radius === 12 && gl.editorial.glassBlur === 14 &&
  gl.editorial.paperGrain === 0.02 && gl.editorial.seal === '#e0706a' &&
  gl.editorial.bodySize === 16 && gl.editorial.bodyLh === 1.8,
  JSON.stringify(gl.editorial));
var sc = buildStyleTokens(Theme.buildCssVars(Theme.getBuiltin('scroll')));
check('scroll radius md/lg === 4/6，grain 0.04',
  sc.radius.md === 4 && sc.radius.lg === 6 && sc.editorial.paperGrain === 0.04,
  JSON.stringify(sc.radius) + ' grain=' + sc.editorial.paperGrain);

// ---- fs-scale 乘法预算（calc(Npx * var(--fs-scale)) 语义）----
console.log('---- fs-scale ----');
var small = buildStyleTokens(pwVars, { fontScale: 0.9 });
var large = buildStyleTokens(pwVars, { fontScale: 1.15 });
check('scale=0.9：sm 10.35 / base 11.7（小数不丢精度）',
  small.fontSizes.sm === 10.35 && small.fontSizes.base === 11.7,
  'sm=' + small.fontSizes.sm + ' base=' + small.fontSizes.base);
check('scale=1.15：xl 23 / body 19.55',
  large.fontSizes.xl === 23 && large.fontSizes.body === 19.55,
  'xl=' + large.fontSizes.xl + ' body=' + large.fontSizes.body);
check('radius 不随 fs-scale 缩放',
  small.radius.md === 6 && large.radius.md === 6);
var scaleFromVars = buildStyleTokens(
  Object.assign({}, pwVars, { '--fs-scale': '1.15' }));
check('options 缺省时从 --fs-scale 读取（xl=23）',
  scaleFromVars.fontSizes.xl === 23 && scaleFromVars.meta.fontScale === 1.15,
  'xl=' + scaleFromVars.fontSizes.xl);

// ---- 工具函数边界 ----
console.log('---- 工具函数 ----');
check('toNumber 小数/无单位/非法',
  TT.toNumber('11.5px') === 11.5 && TT.toNumber('0') === 0 &&
  TT.toNumber('1.8') === 1.8 && TT.toNumber('none') === null &&
  TT.toNumber('') === null && TT.toNumber(null) === null);
check('kebabVarToCamel 关键转换',
  TT.kebabVarToCamel('--c-bg') === 'bg' &&
  TT.kebabVarToCamel('--c-shadow-sm') === 'shadowSm' &&
  TT.kebabVarToCamel('--c-text-3') === 'text3' &&
  TT.kebabVarToCamel('--c-deep-uncertain-bg') === 'deepUncertainBg');
check('parseBgImage：none/双引号/单引号/无引号',
  TT.parseBgImage('none') === null &&
  TT.parseBgImage('url("https://x/a.png")').uri === 'https://x/a.png' &&
  TT.parseBgImage("url('https://x/b.png')").uri === 'https://x/b.png' &&
  TT.parseBgImage('url(https://x/c.png)').uri === 'https://x/c.png');
var urlTk = buildStyleTokens(
  Object.assign({}, pwVars, { '--bg-image': 'url("file:///bg.jpg")' }));
check('tokens.background.image url → {uri}',
  urlTk.background.image && urlTk.background.image.uri === 'file:///bg.jpg',
  JSON.stringify(urlTk.background.image));

// ---- 汇总 ----
console.log('THEME_TOKENS_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
if (fail > 0) {
  console.log('FAILURES:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
