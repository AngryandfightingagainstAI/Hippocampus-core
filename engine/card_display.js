// ============================================================
// 卡带身份层（display 契约）· A 类纯逻辑
// 战役 3 · U-2：主页随卡而变的唯一数据咽喉。
// 零 DOM / 零存储依赖，可在 Node 下单测；浏览器与 RN 双挂载。
//
// display 八字段（卡带顶层可选对象 card.display）：
//   title  题名（楷体大标题）
//   seal   印章文字（竖排朱印，过长截断）
//   glyph  浮层首字（换卡列表里的大号楷字）
//   genre  类型行（overline 左段）
//   volume 卷次（overline 右段，可空串）
//   sub    题辞（斜体一行）
//   accent 身份色（#hex；落地时 --seal 与 --accent 同取此值；
//                  缺省不输出，回落当前主题的 seal/accent）
//   theme  默认书票，仅允许 paper/glass/scroll；缺省 paper
//
// 老卡（无 display 段，含内置 cards_demo）走回退表，绝不白屏。
// ============================================================

(function(global) {
  var CardDisplay = {};

  // 三书票 id 白名单（与 theme.js BUILTIN_THEMES 编辑风三主题一致）
  var SKIN_THEMES = ['paper', 'glass', 'scroll'];
  var DEFAULT_THEME = 'paper';
  var FALLBACK_GENRE = '未知卡带';
  var FALLBACK_TITLE = '未命名卡带';

  // 各字符串字段展示长度上限（超出取首 N 个字符；按码点切，不劈 emoji）
  var LIMITS = { title: 40, seal: 8, glyph: 2, genre: 20, volume: 20, sub: 120 };

  // 身份色：#rgb / #rgba / #rrggbb / #rrggbbaa
  var ACCENT_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

  // 已知八字段（未知字段进诊断、不消费）
  var KNOWN_KEYS = { title: 1, seal: 1, glyph: 1, genre: 1, volume: 1, sub: 1, accent: 1, theme: 1 };

  function chars(s) { return Array.from(String(s == null ? '' : s)); }
  function firstN(s, n) { return chars(s).slice(0, n).join(''); }
  function isStr(v) { return typeof v === 'string'; }

  // 清洗单个字符串字段：非字符串/空白 → null（视为未提供，交给回退），
  // 合法则 trim + 按码点截断。
  function cleanStr(v, limit) {
    if (!isStr(v)) return null;
    var t = v.trim();
    if (!t) return null;
    return firstN(t, limit);
  }

  CardDisplay.SKIN_THEMES = SKIN_THEMES;
  CardDisplay.DEFAULT_THEME = DEFAULT_THEME;
  CardDisplay.FALLBACK_GENRE = FALLBACK_GENRE;

  // 是合法书票 id
  CardDisplay.isSkinTheme = function(id) {
    return isStr(id) && SKIN_THEMES.indexOf(id) >= 0;
  };

  // 是合法身份色
  CardDisplay.isAccent = function(v) {
    return isStr(v) && ACCENT_RE.test(v.trim());
  };

  // 检查/清洗 display 段本身（不看卡带其它字段）。
  // 返回 { fields: 合法提供字段（仅含可直接消费的键）, diagnostics: 人话诊断数组 }
  // raw 为 undefined/null：可选段缺省，零诊断。
  CardDisplay.inspectDisplay = function(raw) {
    var fields = {};
    var diagnostics = [];

    if (raw === undefined || raw === null) return { fields: fields, diagnostics: diagnostics };
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      return { fields: fields, diagnostics: ['display 必须是对象，已忽略整段并回退默认'] };
    }

    Object.keys(raw).forEach(function(k) {
      if (!KNOWN_KEYS[k]) {
        diagnostics.push('display.' + k + ' 是未知字段，已忽略');
        return;
      }
      var v = raw[k];

      if (k === 'accent') {
        if (v === null || v === '') return; // 显式清空 = 回落主题色
        if (!CardDisplay.isAccent(v)) {
          diagnostics.push('display.accent 必须是 #hex 色值，已回退主题身份色');
          return;
        }
        fields.accent = v.trim();
        return;
      }

      if (k === 'theme') {
        if (!isStr(v) || !v.trim()) return;
        if (!CardDisplay.isSkinTheme(v.trim())) {
          diagnostics.push('display.theme 只允许 paper/glass/scroll，已回退 paper');
          return;
        }
        fields.theme = v.trim();
        return;
      }

      // volume 允许空串（语义 = 不显示卷次分隔）
      if (k === 'volume') {
        if (!isStr(v)) {
          diagnostics.push('display.volume 必须是字符串，已回退空卷次');
          return;
        }
        fields.volume = firstN(v.trim(), LIMITS.volume);
        return;
      }

      var cleaned = cleanStr(v, LIMITS[k]);
      if (cleaned === null) {
        if (!isStr(v)) diagnostics.push('display.' + k + ' 必须是字符串，已回退');
        // 空白字符串等同未提供，不报错
        return;
      }
      fields[k] = cleaned;
    });

    return { fields: fields, diagnostics: diagnostics };
  };

  // 主入口：任意卡带对象 → 八字段齐全的身份描述。
  // 永不抛错；card 为空也返回全套回退值。
  CardDisplay.resolveCardDisplay = function(card) {
    var c = (card && typeof card === 'object') ? card : {};
    var r = CardDisplay.inspectDisplay(c.display);
    var f = r.fields;

    var baseTitle = cleanStr(c.cardName, LIMITS.title)
      || cleanStr(c.cardId, LIMITS.title)
      || FALLBACK_TITLE;

    var title = f.title || baseTitle;

    return {
      title: title,
      seal: f.seal || firstN(title, 2),
      glyph: f.glyph || firstN(title, 1),
      genre: f.genre || FALLBACK_GENRE,
      volume: f.volume !== undefined ? f.volume : '',
      sub: f.sub !== undefined ? f.sub : (cleanStr(c.description, LIMITS.sub) || ''),
      // accent 缺省为 null：UI 层不得输出 --seal/--accent 覆盖，回落主题色
      accent: f.accent || null,
      theme: f.theme || DEFAULT_THEME
    };
  };

  // 顺带返回诊断（导入诊断口 / UI 提示用）
  CardDisplay.resolveWithDiagnostics = function(card) {
    var d = CardDisplay.resolveCardDisplay(card);
    var r = CardDisplay.inspectDisplay((card && typeof card === 'object') ? card.display : undefined);
    return { display: d, diagnostics: r.diagnostics };
  };

  // 身份色 → CSS 变量。accent 缺省返回空对象（不 setProperty，回落主题）。
  // 裁决 3：display 只收一个 accent，印章底色与强调色同取此值。
  CardDisplay.displayToCssVars = function(display) {
    if (display && display.accent) return { '--seal': display.accent, '--accent': display.accent };
    return {};
  };

  // 生效书票 id：玩家按卡覆盖（skinOverride[cardId]）优先，否则卡带默认 theme，再否则 paper。
  // overrideMap 由 UI 层从 global.settings.skinOverride 取入，纯函数不碰存储。
  CardDisplay.resolveThemeId = function(displayOrTheme, overrideMap, cardId) {
    var override = (overrideMap && cardId != null) ? overrideMap[cardId] : null;
    if (CardDisplay.isSkinTheme(override)) return override;
    var theme = (displayOrTheme && typeof displayOrTheme === 'object') ? displayOrTheme.theme : displayOrTheme;
    if (CardDisplay.isSkinTheme(theme)) return theme;
    return DEFAULT_THEME;
  };

  // overline 文案：volume 空串时只显示 genre，不加分隔符
  CardDisplay.formatOverline = function(display) {
    if (!display) return FALLBACK_GENRE;
    return display.volume ? (display.genre + ' · ' + display.volume) : display.genre;
  };

  // 双挂载：浏览器 window / Node module.exports（RN 启动 smoke 同用）
  if (typeof window !== 'undefined') window.CardDisplay = CardDisplay;
  if (typeof module !== 'undefined' && module.exports) module.exports = CardDisplay;
})(typeof window !== 'undefined' ? window : globalThis);
