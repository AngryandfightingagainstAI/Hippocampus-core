// ============================================================
// P75 · 天命系统（A 类纯逻辑，两仓同源，零 DOM / 零 RN 依赖）
//
// 天命 = CoC 跑团的「天命 N 选一」：
//   卡带在 worldbook.destiny 里声明属性表与每项的掷骰公式，
//   玩家点「掷天命」一次生成 N 组属性，从中挑一组写进 playerData。
//
// 公式语法（parseFormula）——取开源骰子机器人的通用记号
// （Avrae d20 / DiceMaiden / 标准 dice notation）：
//   3d6              掷 3 个 6 面骰求和
//   4d6kh3 / 4d6h3   掷 4 个 6 面骰，取最高 3 个（DnD 5e 属性标准掷法）
//   4d6kl3           取最低 3 个
//   4d6dh1 / 4d6dl1  丢弃最高 / 最低 1 个
//   4d6r1            掷出 1 的骰子重掷一次
//   4d6rr1           掷出 1 的骰子一直重掷（上限 10 次，防死循环）
//   3d6!             爆炸骰：掷出最大面时追加一颗（上限 1000 颗总数）
//   3d6e5            掷出 >=5 时爆炸
//   d20              省略个数 = 1 个
//   (2d6+6)*5        四则运算 + 括号
//   -3d6             一元负号
//   数值范围：个数 0-999，面数 1-999；N 省略时按 1 处理。
//
// 属性条数与组数都不设人为上限：卡带写几项就掷几项，写几组就出几组
// （只对 NaN / 负数 / Infinity 这类脏数据兜底到 1）。
//
// 掷骰复用 engine/dice.js 的 DiceEngine（NdM 子项）；DiceEngine 缺失时退回
// 本地 Math.random，数值分布一致（便于纯 Node 环境测试本模块）。
//
// 纪律：'use strict'；不碰颜色；不读写存储；不弹 UI；不依赖 DOM。
// ============================================================

(function () {
  'use strict';

  // ---------- 掷骰：优先复用 DiceEngine，缺失时本地兜底 ----------
  function rand(sides) {
    return Math.floor(Math.random() * sides) + 1;
  }

  function rollNdM(count, sides) {
    if (typeof DiceEngine !== 'undefined' && DiceEngine && typeof DiceEngine.roll === 'function') {
      var r = DiceEngine.roll(count + 'd' + sides);
      if (r && r.ok && typeof r.total === 'number') return r.total;
    }
    var sum = 0;
    for (var i = 0; i < count; i++) sum += rand(sides);
    return sum;
  }

  // ---------- 词法：数字 / 骰子表达式 / 运算符 / 括号 ----------
  var DICE_RE = /^(\d*)d(\d+)/i;
  // 修饰符按「长的在前」排列，避免 kh 被 k 抢先匹配
  var MOD_RE = /^(kh|kl|dh|dl|rr|ro|r|h|l|k|e|!)(\d*)/i;

  function clampInt(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  // 解析骰子后的修饰符串，写进 spec
  function readMods(s, i, spec) {
    while (i < s.length) {
      var ws = s.charAt(i);
      if (ws === ' ' || ws === '\t' || ws === '\n' || ws === '\r') { i++; continue; }
      var m = MOD_RE.exec(s.slice(i));
      if (!m) break;
      var tag = m[1].toLowerCase();
      var num = m[2] === '' ? null : parseInt(m[2], 10);
      if (tag === '!') {
        if (spec.explode != null) return -1;
        spec.explode = spec.sides;
        i += 1;
        continue;
      }
      if (tag === 'e') {
        if (spec.explode != null || num == null) return -1;
        if (!(num >= 1 && num <= spec.sides)) return -1;
        spec.explode = num;
        i += m[0].length;
        continue;
      }
      if (tag === 'r' || tag === 'ro' || tag === 'rr') {
        var th = num == null ? 1 : num;
        if (!(th >= 1 && th < spec.sides)) return -1;
        if (spec.reroll != null) return -1;
        spec.reroll = th;
        spec.rerollUntil = (tag === 'rr');
        i += m[0].length;
        continue;
      }
      // keep / drop 四选一，重复或冲突直接判非法
      if (spec.keepMode != null) return -1;
      var n = num == null ? 1 : num;
      if (!(n >= 1)) return -1;
      n = clampInt(n, 1, Math.max(1, spec.count));
      if (tag === 'kh' || tag === 'k' || tag === 'h') { spec.keepMode = 'high'; spec.keepType = 'keep'; spec.keepN = n; }
      else if (tag === 'kl' || tag === 'l') { spec.keepMode = 'low'; spec.keepType = 'keep'; spec.keepN = n; }
      else if (tag === 'dh') { spec.keepMode = 'high'; spec.keepType = 'drop'; spec.keepN = n; }
      else if (tag === 'dl') { spec.keepMode = 'low'; spec.keepType = 'drop'; spec.keepN = n; }
      else return -1;
      i += m[0].length;
    }
    return i;
  }

  function tokenize(expr) {
    // 空白只当分隔符：'3d6 + 2' 合法，而 '1d6 2' 会是「骰子 + 数字」两个记号、
    //   由 buildAst 判非法。绝不先删空白——删掉会把 '1d6 2' 悄悄读成 '1d62'。
    var s = String(expr == null ? '' : expr).toLowerCase();
    var toks = [], i = 0;
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (c === '+' || c === '-' || c === '*' || c === '(' || c === ')') { toks.push(c); i++; continue; }
      if ((c >= '0' && c <= '9') || c === 'd') {
        var rest = s.slice(i);
        var dm = DICE_RE.exec(rest);
        if (dm) {
          var cnt = dm[1] === '' ? 1 : parseInt(dm[1], 10);
          var sd = parseInt(dm[2], 10);
          if (!(cnt >= 0 && cnt <= 999) || !(sd >= 1 && sd <= 999)) return null;
          var spec = { count: cnt, sides: sd, explode: null, reroll: null, rerollUntil: false, keepMode: null, keepType: null, keepN: 0 };
          i += dm[0].length;
          i = readMods(s, i, spec);
          if (i < 0) return null;
          toks.push({ dice: true, spec: spec });
          continue;
        }
        if (c === 'd') return null; // 只有 d 没有面数
        var nm = /^\d+/.exec(rest);
        toks.push(parseInt(nm[0], 10));
        i += nm[0].length;
        continue;
      }
      return null; // 非法字符（含 . 、 / 等未支持符号）
    }
    return toks.length ? toks : null;
  }

  // ---------- 掷一组骰子并按修饰符筛选 ----------
  function rollDiceSpec(spec) {
    var arr = [], i;
    for (i = 0; i < spec.count; i++) arr.push(rand(spec.sides));

    // 爆炸：命中条件的骰子追加一颗，新骰子同样参与判定；总数封顶防死循环
    if (spec.explode != null) {
      var guard = 0;
      for (i = 0; i < arr.length && guard < 1000; i++) {
        var v = arr[i];
        var hops = 0;
        while (v >= spec.explode && hops < 20 && arr.length < 1000) {
          v = rand(spec.sides);
          arr.push(v);
          hops++;
          guard++;
        }
      }
    }

    // 重掷：r 只重掷一次，rr 一直重掷到不满足条件（上限 10 次）
    if (spec.reroll != null) {
      for (i = 0; i < arr.length; i++) {
        var tries = 0;
        while (arr[i] <= spec.reroll && tries < (spec.rerollUntil ? 10 : 1)) {
          arr[i] = rand(spec.sides);
          tries++;
        }
      }
    }

    if (!spec.keepMode) {
      var sum = 0;
      for (i = 0; i < arr.length; i++) sum += arr[i];
      return sum;
    }

    // 排序口径统一成「要留下的排前面」：
    //   keep high → 降序取前 N；keep low → 升序取前 N；
    //   drop high → 先排低（留下的是低的那批）；drop low → 先排高。
    //   反过来写会让 dh/dl 的分布对调，两者区间完全一样，只有均值能看出来。
    var keptFirstHigh = (spec.keepType === 'drop') ? (spec.keepMode === 'low') : (spec.keepMode === 'high');
    var order = arr.map(function (_, idx) { return idx; });
    order.sort(function (a, b) {
      return keptFirstHigh ? arr[b] - arr[a] : arr[a] - arr[b];
    });
    var keepCount = spec.keepType === 'drop' ? arr.length - spec.keepN : spec.keepN;
    keepCount = clampInt(keepCount, 0, arr.length);
    var drop = {};
    for (i = keepCount; i < order.length; i++) drop[order[i]] = 1;
    var kept = 0;
    for (i = 0; i < arr.length; i++) if (!drop[i]) kept += arr[i];
    return kept;
  }

  // ---------- 语法 → AST（一次成型；evalAst 每次调用重新掷） ----------
  //   优先级：* 高于 + / -；括号最高；一元 + / - 次之。
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
      var a = unary();
      if (a === null) return null;
      while (peek() === '*') {
        eat();
        var b = unary();
        if (b === null) return null;
        a = { op: '*', a: a, b: b };
      }
      return a;
    }
    function unary() {
      if (peek() === '-') { eat(); var v = unary(); if (v === null) return null; return { op: 'neg', a: v }; }
      if (peek() === '+') { eat(); return unary(); }
      return factor();
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
      if (t && t.dice) { eat(); return { d: t.spec }; }
      return null;
    }
    var ast = expr();
    if (ast === null || pos !== toks.length) return null;
    return ast;
  }

  function evalAst(node) {
    if (node.n !== undefined) return node.n;
    if (node.d) return rollDiceSpec(node.d);
    if (node.op === 'neg') return -evalAst(node.a);
    var a = evalAst(node.a), b = evalAst(node.b);
    if (node.op === '+') return a + b;
    if (node.op === '-') return a - b;
    return a * b;
  }

  // parseFormula('4d6kh3') → function()（可反复调用，每次重新掷骰）
  // 公式非法 → null（调用方不得当成 0）
  function parseFormula(expr) {
    if (typeof expr !== 'string') return null; // 只认字符串，别把 123 / null 当公式
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

  // ---------- 定义校验（卡带 / AI 返回的属性表都走这里） ----------
  // normalizeDefinition({ sets, attributes:[{key,name,formula,min,max}] })
  //   → { ok:true, sets, attributes } | { ok:false, reason }
  //   属性项数不设上限；非法项（缺 key / 公式解析不了）直接丢弃并记录在 dropped。
  var KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
  function normalizeDefinition(def) {
    if (!def || typeof def !== 'object') return { ok: false, reason: '定义不是对象' };
    var raw = def.attributes;
    if (!Array.isArray(raw) || !raw.length) return { ok: false, reason: 'attributes 为空' };
    var attrs = [], seen = {}, dropped = [];
    for (var i = 0; i < raw.length; i++) {
      var a = raw[i];
      if (!a || typeof a !== 'object') { dropped.push({ index: i, reason: '不是对象' }); continue; }
      var key = String(a.key == null ? '' : a.key).trim();
      if (!KEY_RE.test(key)) { dropped.push({ index: i, reason: 'key 非法：' + key }); continue; }
      if (seen[key]) { dropped.push({ index: i, reason: 'key 重复：' + key }); continue; }
      var formula = String(a.formula == null ? '' : a.formula).trim();
      if (!parseFormula(formula)) { dropped.push({ index: i, reason: '公式非法：' + formula }); continue; }
      var item = { key: key, name: String(a.name == null ? key : a.name), formula: formula };
      if (typeof a.min === 'number' && isFinite(a.min)) item.min = a.min;
      if (typeof a.max === 'number' && isFinite(a.max)) item.max = a.max;
      seen[key] = 1;
      attrs.push(item);
    }
    if (!attrs.length) return { ok: false, reason: '没有一项合法属性' };
    var sets = def.sets == null ? 5 : parseInt(def.sets, 10);
    if (!isFinite(sets) || sets < 1) sets = 5;
    return { ok: true, sets: sets, attributes: attrs, dropped: dropped };
  }

  // ---------- 掷一组 / 一批 ----------
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
  //   按 total 降序（最好的排在最前）；组数不设上限，只兜底非法值。
  //   防卡死保险：单次最多 1000 组（不是设计上限，超过这个数没有任何可玩性，
  //   再高只会把创角页卡住）。
  var HARD_MAX_SETS = 1000;
  function rollBatch(attributes, sets) {
    var n = parseInt(sets, 10);
    if (!isFinite(n) || n < 1) n = 1;
    n = Math.min(HARD_MAX_SETS, n);
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

  // defaultSets(card) → 卡带声明的组数（缺省 5，不设上限，脏数据兜底 1）
  function defaultSets(card) {
    var d = config(card);
    var n = d ? parseInt(d.sets, 10) : NaN;
    if (!isFinite(n) || n < 1) n = 5;
    return Math.min(HARD_MAX_SETS, n);
  }

  var Destiny = {
    parseFormula: parseFormula,
    normalizeDefinition: normalizeDefinition,
    rollNdM: rollNdM,
    rollSet: rollSet,
    totalOf: totalOf,
    rollBatch: rollBatch,
    config: config,
    attributes: attributes,
    enabled: enabled,
    defaultSets: defaultSets,
    HARD_MAX_SETS: HARD_MAX_SETS
  };

  if (typeof window !== 'undefined') window.Destiny = Destiny;
  if (typeof module !== 'undefined' && module.exports) module.exports = Destiny;
})();
