// ============================================================
// P47 · 天命系统（A 类纯逻辑，两仓同源，零 DOM / 零 RN 依赖）
//
// 天命 = CoC 跑团的「天命 N 选一」：
//   卡带在 worldbook.destiny 里声明属性表与每项的掷骰公式，
//   玩家点「掷天命」一次生成 N 组属性，从中挑一组写进 playerData。
//
// 公式语法（parseFormula）：
//   3d6*5       → 掷 3 个 6 面骰求和，再 ×5
//   (2d6+6)*5   → 掷 2 个 6 面骰求和 +6，再 ×5
//   4d4+2       → 掷 4 个 4 面骰求和，再 +2
//   支持 + - * 与括号；NdM 的 N / M 为正整数（1-999）。
//   min / max 是钳位保护：掷出的数值超出 [min, max] 就钳到边界。
//
// 掷骰复用 engine/dice.js 的 DiceEngine（NdM 子项）；DiceEngine 缺失时退回
// 本地 Math.random，数值分布一致（便于纯 Node 环境测试本模块）。
//
// 纪律：'use strict'；不碰颜色；不读写存储；不弹 UI；不依赖 DOM。
// ============================================================

(function () {
  'use strict';

  // ---------- 掷骰：优先复用 DiceEngine，缺失时本地兜底 ----------
  function rollNdM(count, sides) {
    if (typeof DiceEngine !== 'undefined' && DiceEngine && typeof DiceEngine.roll === 'function') {
      var r = DiceEngine.roll(count + 'd' + sides);
      if (r && r.ok && typeof r.total === 'number') return r.total;
    }
    var sum = 0;
    for (var i = 0; i < count; i++) sum += Math.floor(Math.random() * sides) + 1;
    return sum;
  }

  // ---------- 词法：数字 / NdM / 运算符 / 括号 ----------
  var DICE_RE = /^(\d+)d(\d+)/;
  function tokenize(expr) {
    var s = String(expr == null ? '' : expr).replace(/\s+/g, '').toLowerCase();
    if (!s) return null;
    var toks = [], i = 0;
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === '+' || c === '-' || c === '*' || c === '(' || c === ')') { toks.push(c); i++; continue; }
      if (c >= '0' && c <= '9') {
        var rest = s.slice(i);
        var dm = DICE_RE.exec(rest);
        if (dm) {
          var cnt = parseInt(dm[1], 10), sd = parseInt(dm[2], 10);
          if (!(cnt >= 1 && cnt <= 999) || !(sd >= 1 && sd <= 999)) return null;
          toks.push({ dice: true, count: cnt, sides: sd });
          i += dm[0].length;
          continue;
        }
        var nm = /^\d+/.exec(rest);
        toks.push(parseInt(nm[0], 10));
        i += nm[0].length;
        continue;
      }
      return null; // 非法字符（含 . 、 / 等未支持符号）
    }
    return toks;
  }

  // ---------- 语法 → AST（一次成型；evalAst 每次调用重新掷） ----------
  //   优先级：* 高于 + / -；括号最高。
  function buildAst(toks) {
    var pos = 0;
    function peek() { return toks[pos]; }
    function eat() { return toks[pos++]; }
    function expr() {
      var a = term();
      if (a === null) return null;
      while (peek() === '+' || peek() === '-') {
        var op = eat();
        var b = term();
        if (b === null) return null;
        a = { op: op, a: a, b: b };
      }
      return a;
    }
    function term() {
      var a = factor();
      if (a === null) return null;
      while (peek() === '*') {
        eat();
        var b = factor();
        if (b === null) return null;
        a = { op: '*', a: a, b: b };
      }
      return a;
    }
    function factor() {
      var t = peek();
      if (t === '(') {
        eat();
        var v = expr();
        if (v === null) return null;
        if (eat() !== ')') return null;
        return v;
      }
      if (typeof t === 'number') { eat(); return { n: t }; }
      if (t && t.dice) { eat(); return { d: t }; }
      return null;
    }
    var ast = expr();
    if (ast === null || pos !== toks.length) return null;
    return ast;
  }

  function evalAst(node) {
    if (node.n !== undefined) return node.n;
    if (node.d) return rollNdM(node.d.count, node.d.sides);
    var a = evalAst(node.a), b = evalAst(node.b);
    if (node.op === '+') return a + b;
    if (node.op === '-') return a - b;
    return a * b;
  }

  // parseFormula('3d6*5') → function()（可反复调用，每次重新掷骰）
  // 公式非法 → null（调用方不得当成 0）
  function parseFormula(expr) {
    var toks = tokenize(expr);
    if (!toks) return null;
    var ast = buildAst(toks);
    if (!ast) return null;
    return function () { return evalAst(ast); };
  }

  function clamp(v, min, max) {
    v = Math.round(Number(v));
    if (isNaN(v)) v = 0;
    if (typeof min === 'number' && v < min) v = min;
    if (typeof max === 'number' && v > max) v = max;
    return v;
  }

  // rollSet(attributes) → { key: value, ... }
  //   attributes: [{ key, name?, formula, min?, max? }]
  //   公式无效的项跳过（不塞 NaN，也不静默当成 0 害人）
  function rollSet(attributes) {
    var out = {};
    (attributes || []).forEach(function (attr) {
      if (!attr || !attr.key) return;
      var f = parseFormula(attr.formula);
      if (!f) return;
      out[attr.key] = clamp(f(), attr.min, attr.max);
    });
    return out;
  }

  // 一组属性的总和（只看 attributes 声明的项）
  function totalOf(set, attributes) {
    var total = 0;
    (attributes || []).forEach(function (attr) {
      if (attr && attr.key && typeof set[attr.key] === 'number') total += set[attr.key];
    });
    return total;
  }

  // rollBatch(attributes, sets) → [{ values: {key:value,...}, total }, ...]
  //   按 total 降序（最好的排在最前）；sets 缺省 1，钳在 1-20。
  function rollBatch(attributes, sets) {
    var n = parseInt(sets, 10);
    if (isNaN(n)) n = 1;
    n = Math.max(1, Math.min(20, n));
    var out = [];
    for (var i = 0; i < n; i++) {
      var values = rollSet(attributes);
      out.push({ values: values, total: totalOf(values, attributes) });
    }
    out.sort(function (a, b) { return b.total - a.total; });
    return out;
  }

  // ---------- 卡带配置读取 ----------
  function currentCard() {
    if (typeof GameState !== 'undefined' && GameState && GameState.currentCard) return GameState.currentCard;
    return null;
  }

  // config(card) → worldbook.destiny 对象 | null
  function config(card) {
    var c = card || currentCard();
    var d = c && c.worldbook && c.worldbook.destiny;
    return (d && typeof d === 'object') ? d : null;
  }

  // attributes(card) → 属性数组（无则空数组）
  function attributes(card) {
    var d = config(card);
    return (d && Array.isArray(d.attributes)) ? d.attributes : [];
  }

  // enabled(card) → 卡带是否启用天命（enabled === true 且属性表非空）
  function enabled(card) {
    var d = config(card);
    return !!(d && d.enabled === true && Array.isArray(d.attributes) && d.attributes.length > 0);
  }

  // defaultSets(card) → 卡带声明的组数（缺省 5，钳在 1-20）
  function defaultSets(card) {
    var d = config(card);
    var n = d ? parseInt(d.sets, 10) : NaN;
    if (isNaN(n)) n = 5;
    return Math.max(1, Math.min(20, n));
  }

  var Destiny = {
    parseFormula: parseFormula,
    rollSet: rollSet,
    totalOf: totalOf,
    rollBatch: rollBatch,
    config: config,
    attributes: attributes,
    enabled: enabled,
    defaultSets: defaultSets
  };

  if (typeof window !== 'undefined') window.Destiny = Destiny;
  if (typeof module !== 'undefined' && module.exports) module.exports = Destiny;
})();
