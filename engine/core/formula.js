// ============================================================
// 阶段 B · 公式解释器（A 类纯逻辑：零 DOM / 零 RN / 零副作用）
//
// 只做「确定性数值表达式」：数字、attr.<key> 引用、四则运算、括号、
// floor/ceil/round/min/max、比较与三元条件。
//
// 明确不支持（出现即报错，不假装支持）：
//   骰子 / 随机 / 时间 / 字符串 / 数组 / 变量赋值 / && || ! / 任意代码执行
//   skill.<key>：语法保留，第一版一律 E_UNSUPPORTED_REF（阶段 C 才接技能）
//
// 安全：手写 tokenizer + 递归下降 + AST 解释执行，源码里没有 eval / new Function。
// 返回值永远是可判定对象，不抛（编程错误除外）。
//
// 与 stat_rules 的关系：attr 引用经 stat_rules.canon 归一为 attr_<bare>，
// 取值经 stat_rules.valueOf（规范键优先、裸键兜底）。模块缺失时退回本地双键读法。
// ============================================================

(function (factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.Formula = api;
  if (typeof globalThis !== 'undefined') globalThis.Formula = api;
})(function () {
  'use strict';

  var VERSION = 1;
  var DEFAULTS = { maxLength: 512, maxDepth: 32, maxNodes: 256 };

  // 函数表：正数 = 固定参数个数；-1 = 至少 2 个（变参）
  var FUNCS = { floor: 1, ceil: 1, round: 1, min: -1, max: -1 };

  function sr() {
    if (typeof StatRules !== 'undefined' && StatRules && typeof StatRules.valueOf === 'function') return StatRules;
    if (typeof require === 'function') {
      try {
        var m = require('./stat_rules.js');
        if (m && typeof m.valueOf === 'function') return m;
      } catch (e) {}
    }
    return null;
  }

  function bareName(key) {
    var SR = sr();
    if (SR) return SR.bare(key);
    var s = String(key == null ? '' : key);
    while (s.indexOf('attr_') === 0) s = s.slice(5);
    return s;
  }

  function canonKey(key) {
    var SR = sr();
    if (SR) return SR.canon(key);
    return 'attr_' + bareName(key);
  }

  function mkErr(code, message, pos, expr, extra) {
    var e = { code: code, message: message, pos: pos == null ? 0 : pos, expr: expr == null ? '' : expr };
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }

  // ---------- tokenizer ----------

  function isDigit(c) { return c >= '0' && c <= '9'; }
  function isIdentStart(c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
  }
  function isIdentPart(c) { return isIdentStart(c) || isDigit(c); }

  function tokenize(text, expr) {
    var out = [];
    var i = 0;
    var n = text.length;
    while (i < n) {
      var c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      // 数字：只接受十进制整数/小数，不接受科学计数法、十六进制、前导点
      if (isDigit(c)) {
        var start = i;
        while (i < n && isDigit(text[i])) i++;
        if (text[i] === '.') {
          i++;
          if (!isDigit(text[i])) return { ok: false, error: mkErr('E_SYNTAX', '小数点后缺少数字', i, expr) };
          while (i < n && isDigit(text[i])) i++;
        }
        out.push({ t: 'num', v: Number(text.slice(start, i)), pos: start });
        continue;
      }
      // 标识符：函数名，或命名空间引用 attr.x / skill.x
      if (isIdentStart(c)) {
        var s0 = i;
        while (i < n && isIdentPart(text[i])) i++;
        var name = text.slice(s0, i);
        if (text[i] === '.') {
          i++;
          if (!isIdentStart(text[i])) return { ok: false, error: mkErr('E_SYNTAX', '「' + name + '.」后缺少标识符', i, expr) };
          var s1 = i;
          while (i < n && isIdentPart(text[i])) i++;
          var member = text.slice(s1, i);
          if (name === 'attr') {
            // bare 必须走 bareName：`attr.attr_str` 与 `attr.str` 是同一个属性，
            // 否则 refs.name 会把 `attr_str` 当成独立依赖，order()/check() 误报未知。
            out.push({ t: 'ref', ns: 'attr', name: member, bare: bareName(member), key: canonKey(member), pos: s0 });
            continue;
          }
          if (name === 'skill') {
            return { ok: false, error: mkErr('E_UNSUPPORTED_REF', '第一版公式不支持 skill 引用（技能系统未接入）', s0, expr, { ref: name + '.' + member }) };
          }
          return { ok: false, error: mkErr('E_SYNTAX', '未知命名空间「' + name + '」', s0, expr) };
        }
        if (Object.prototype.hasOwnProperty.call(FUNCS, name)) {
          out.push({ t: 'func', name: name, pos: s0 });
          continue;
        }
        return { ok: false, error: mkErr('E_SYNTAX', '未知标识符「' + name + '」（属性要写 attr.' + name + '）', s0, expr) };
      }
      // 双字符运算符
      var two = text.substr(i, 2);
      if (two === '<=' || two === '>=' || two === '==' || two === '!=') {
        out.push({ t: 'op', v: two, pos: i });
        i += 2;
        continue;
      }
      if ('+-*/<>?:(),'.indexOf(c) >= 0) {
        out.push({ t: 'op', v: c, pos: i });
        i++;
        continue;
      }
      return { ok: false, error: mkErr('E_SYNTAX', '无法识别的字符「' + c + '」', i, expr) };
    }
    out.push({ t: 'eof', pos: n });
    return { ok: true, tokens: out };
  }

  // ---------- parser ----------

  function parse(text, opts) {
    opts = opts || {};
    var expr = String(text == null ? '' : text);
    var maxLength = opts.maxLength != null ? opts.maxLength : DEFAULTS.maxLength;
    var maxDepth = opts.maxDepth != null ? opts.maxDepth : DEFAULTS.maxDepth;
    var maxNodes = opts.maxNodes != null ? opts.maxNodes : DEFAULTS.maxNodes;

    if (!expr.trim()) return { ok: false, error: mkErr('E_EMPTY', '公式为空', 0, expr) };
    if (expr.length > maxLength) {
      return { ok: false, error: mkErr('E_LIMIT_LENGTH', '公式过长（' + expr.length + ' > ' + maxLength + '）', maxLength, expr) };
    }

    var tk = tokenize(expr, expr);
    if (!tk.ok) return tk;
    var toks = tk.tokens;
    var p = 0;
    var nodes = 0;
    var refs = [];
    var refSeen = {};

    function peek() { return toks[p]; }
    function next() { return toks[p++]; }
    function fail(code, message, pos, extra) { return { ok: false, error: mkErr(code, message, pos, expr, extra) }; }

    function countNode(pos) {
      nodes++;
      if (nodes > maxNodes) return fail('E_LIMIT_DEPTH', '公式节点数超过上限 ' + maxNodes, pos);
      return null;
    }

    function parseExpr(depth) {
      if (depth > maxDepth) return fail('E_LIMIT_DEPTH', '公式嵌套超过上限 ' + maxDepth, peek().pos);
      return parseTernary(depth);
    }

    function parseTernary(depth) {
      var c = parseCmp(depth);
      if (c && c.ok === false) return c;
      if (peek().t === 'op' && peek().v === '?') {
        var pos = next().pos;
        var a = parseExpr(depth + 1);
        if (a && a.ok === false) return a;
        if (!(peek().t === 'op' && peek().v === ':')) return fail('E_SYNTAX', '三元表达式缺少「:」', peek().pos);
        next();
        var b = parseExpr(depth + 1);
        if (b && b.ok === false) return b;
        var node = { k: 'cond', c: c.ast, a: a.ast, b: b.ast, pos: pos };
        var cerr = countNode(pos);
        if (cerr) return cerr;
        return { ok: true, ast: node };
      }
      return c;
    }

    function parseCmp(depth) {
      var l = parseAdd(depth);
      if (l && l.ok === false) return l;
      var t = peek();
      if (t.t === 'op' && (t.v === '<' || t.v === '<=' || t.v === '>' || t.v === '>=' || t.v === '==' || t.v === '!=')) {
        next();
        var r = parseAdd(depth);
        if (r && r.ok === false) return r;
        var node = { k: 'bin', op: t.v, l: l.ast, r: r.ast, pos: t.pos };
        var cerr = countNode(t.pos);
        if (cerr) return cerr;
        return { ok: true, ast: node };
      }
      return l;
    }

    function parseAdd(depth) {
      var left = parseMul(depth);
      if (left && left.ok === false) return left;
      while (peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
        var op = next();
        var right = parseMul(depth);
        if (right && right.ok === false) return right;
        left = { ok: true, ast: { k: 'bin', op: op.v, l: left.ast, r: right.ast, pos: op.pos } };
        var cerr = countNode(op.pos);
        if (cerr) return cerr;
      }
      return left;
    }

    function parseMul(depth) {
      var left = parseUnary(depth);
      if (left && left.ok === false) return left;
      while (peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
        var op = next();
        var right = parseUnary(depth);
        if (right && right.ok === false) return right;
        left = { ok: true, ast: { k: 'bin', op: op.v, l: left.ast, r: right.ast, pos: op.pos } };
        var cerr = countNode(op.pos);
        if (cerr) return cerr;
      }
      return left;
    }

    function parseUnary(depth) {
      if (depth > maxDepth) return fail('E_LIMIT_DEPTH', '公式嵌套超过上限 ' + maxDepth, peek().pos);
      var t = peek();
      if (t.t === 'op' && (t.v === '-' || t.v === '+')) {
        next();
        var x = parseUnary(depth + 1);
        if (x && x.ok === false) return x;
        var node = t.v === '-' ? { k: 'un', op: '-', x: x.ast, pos: t.pos } : x.ast;
        var cerr = countNode(t.pos);
        if (cerr) return cerr;
        return { ok: true, ast: node };
      }
      return parsePrimary(depth);
    }

    function parsePrimary(depth) {
      var t = peek();
      if (t.t === 'num') {
        next();
        var ne = countNode(t.pos);
        if (ne) return ne;
        return { ok: true, ast: { k: 'num', v: t.v, pos: t.pos } };
      }
      if (t.t === 'ref') {
        next();
        var re = countNode(t.pos);
        if (re) return re;
        if (!refSeen[t.bare]) {
          refSeen[t.bare] = true;
          refs.push({ kind: 'attr', name: t.bare, key: t.key, pos: t.pos });
        }
        return { ok: true, ast: { k: 'ref', key: t.key, bare: t.bare, pos: t.pos } };
      }
      if (t.t === 'func') {
        var fn = next();
        if (!(peek().t === 'op' && peek().v === '(')) return fail('E_SYNTAX', '函数「' + fn.name + '」缺少「(」', peek().pos);
        next();
        var args = [];
        if (!(peek().t === 'op' && peek().v === ')')) {
          for (;;) {
            var a = parseExpr(depth + 1);
            if (a && a.ok === false) return a;
            args.push(a.ast);
            if (peek().t === 'op' && peek().v === ',') { next(); continue; }
            break;
          }
        }
        if (!(peek().t === 'op' && peek().v === ')')) return fail('E_SYNTAX', '函数「' + fn.name + '」缺少「)」', peek().pos);
        next();
        var arity = FUNCS[fn.name];
        if (arity > 0 && args.length !== arity) {
          return fail('E_TYPE', '函数「' + fn.name + '」需要 ' + arity + ' 个参数，实际 ' + args.length + ' 个', fn.pos);
        }
        if (arity < 0 && args.length < 2) {
          return fail('E_TYPE', '函数「' + fn.name + '」至少需要 2 个参数', fn.pos);
        }
        var ce = countNode(fn.pos);
        if (ce) return ce;
        return { ok: true, ast: { k: 'call', name: fn.name, args: args, pos: fn.pos } };
      }
      if (t.t === 'op' && t.v === '(') {
        next();
        var inner = parseExpr(depth + 1);
        if (inner && inner.ok === false) return inner;
        if (!(peek().t === 'op' && peek().v === ')')) return fail('E_SYNTAX', '括号未闭合', peek().pos);
        next();
        return { ok: true, ast: inner.ast };
      }
      if (t.t === 'eof') return fail('E_SYNTAX', '公式意外结束', t.pos);
      return fail('E_SYNTAX', '这里不该出现「' + (t.v || t.name || t.t) + '」', t.pos);
    }

    var res = parseExpr(0);
    if (res && res.ok === false) return res;
    if (peek().t !== 'eof') return fail('E_SYNTAX', '公式末尾有多余内容', peek().pos);
    return { ok: true, ast: res.ast, refs: refs };
  }

  // ---------- evaluator ----------

  function makeFail(error) {
    var e = new Error(error.message);
    e.formulaError = error;
    return e;
  }

  function evalAst(ast, ctx, opts) {
    opts = opts || {};
    var exprSource = opts.expr != null ? String(opts.expr) : '';
    var SR = sr();
    var attrs = (ctx && ctx.attrs) || {};
    var min = opts.min;
    var max = opts.max;

    function bad(code, message, pos, extra) {
      throw makeFail(mkErr(code, message, pos, exprSource, extra));
    }

    function readAttr(node) {
      var v;
      if (SR) v = SR.valueOf(attrs, node.key);
      else {
        v = attrs[node.key];
        if (v == null) v = attrs[node.bare];
      }
      if (v == null) {
        // 区分「没这个属性」与「有但不是数值」：后者报 E_TYPE，避免把脏值说成缺字段。
        // 历史双前缀 attr_attr_str 也算「有这个字段」（stat_rules.valueOf 会读到它）。
        var has = (attrs[node.key] != null) || (attrs[node.bare] != null) || (attrs['attr_' + node.key] != null);
        if (has) bad('E_TYPE', '属性 attr.' + node.bare + ' 不是有限数值', node.pos, { ref: 'attr.' + node.bare });
        bad('E_UNKNOWN_REF', '未知属性引用 attr.' + node.bare, node.pos, { ref: 'attr.' + node.bare });
      }
      if (typeof v !== 'number' || !isFinite(v)) bad('E_TYPE', '属性 attr.' + node.bare + ' 不是有限数值', node.pos, { ref: 'attr.' + node.bare });
      return v;
    }

    function ev(node) {
      switch (node.k) {
        case 'num': return node.v;
        case 'ref': return readAttr(node);
        case 'un': return -ev(node.x);
        case 'cond': return ev(node.c) !== 0 ? ev(node.a) : ev(node.b);
        case 'call': {
          var args = node.args.map(ev);
          if (node.name === 'floor') return Math.floor(args[0]);
          if (node.name === 'ceil') return Math.ceil(args[0]);
          if (node.name === 'round') return Math.round(args[0]);
          if (node.name === 'min') return Math.min.apply(null, args);
          if (node.name === 'max') return Math.max.apply(null, args);
          return bad('E_SYNTAX', '未知函数「' + node.name + '」', node.pos);
        }
        case 'bin': {
          if (node.op === '<') return ev(node.l) < ev(node.r) ? 1 : 0;
          if (node.op === '<=') return ev(node.l) <= ev(node.r) ? 1 : 0;
          if (node.op === '>') return ev(node.l) > ev(node.r) ? 1 : 0;
          if (node.op === '>=') return ev(node.l) >= ev(node.r) ? 1 : 0;
          if (node.op === '==') return ev(node.l) === ev(node.r) ? 1 : 0;
          if (node.op === '!=') return ev(node.l) !== ev(node.r) ? 1 : 0;
          var a = ev(node.l);
          var b = ev(node.r);
          if (node.op === '+') return a + b;
          if (node.op === '-') return a - b;
          if (node.op === '*') return a * b;
          if (node.op === '/') {
            if (b === 0) bad('E_DIV_ZERO', '除以零', node.pos);
            return a / b;
          }
          return bad('E_SYNTAX', '未知运算符「' + node.op + '」', node.pos);
        }
        default:
          return bad('E_SYNTAX', '未知表达式节点', node.pos);
      }
    }

    try {
      var value = ev(ast);
      if (typeof value !== 'number' || !isFinite(value)) {
        return { ok: false, error: mkErr('E_NON_FINITE', '计算结果不是有限数值', 0, exprSource) };
      }
      if (min != null && value < min) {
        return { ok: false, error: mkErr('E_RANGE', '结果 ' + value + ' 小于下限 ' + min, 0, exprSource) };
      }
      if (max != null && value > max) {
        return { ok: false, error: mkErr('E_RANGE', '结果 ' + value + ' 大于上限 ' + max, 0, exprSource) };
      }
      return { ok: true, value: value };
    } catch (e) {
      if (e && e.formulaError) return { ok: false, error: e.formulaError };
      return { ok: false, error: mkErr('E_TYPE', '公式求值失败：' + ((e && e.message) || String(e)), 0, exprSource) };
    }
  }

  // ---------- 公共接口 ----------

  function evaluate(text, ctx, opts) {
    opts = opts || {};
    var p = parse(text, opts);
    if (!p.ok) return p;
    var r = evalAst(p.ast, ctx, { expr: String(text == null ? '' : text), min: opts.min, max: opts.max });
    r.refs = p.refs;
    return r;
  }

  function check(text, opts) {
    opts = opts || {};
    var p = parse(text, opts);
    if (!p.ok) return p;
    if (opts.known) {
      var known = {};
      (opts.known || []).forEach(function (k) { known[bareName(k)] = true; });
      for (var i = 0; i < p.refs.length; i++) {
        if (!known[p.refs[i].name]) {
          return { ok: false, error: mkErr('E_UNKNOWN_REF', '未知属性引用 attr.' + p.refs[i].name, p.refs[i].pos, String(text), { ref: 'attr.' + p.refs[i].name }) };
        }
      }
    }
    return { ok: true, refs: p.refs };
  }

  function dependencies(refs) {
    var attr = [];
    (refs || []).forEach(function (r) {
      if (r && r.kind === 'attr' && attr.indexOf(r.name) < 0) attr.push(r.name);
    });
    return { attr: attr, skill: [] };
  }

  // 依赖排序：defs = [{ id, expr }]；返回 { ok, order } 或 { ok:false, error }
  // opts.external = ['str'] 允许引用不属于 defs 的外部属性；否则未知依赖报 E_UNKNOWN_REF。
  function order(defs, opts) {
    opts = opts || {};
    var list = defs || [];
    var byId = {};
    var parsed = {};
    var i;

    for (i = 0; i < list.length; i++) {
      var d = list[i] || {};
      var id = bareName(d.id);
      if (!id) return { ok: false, error: mkErr('E_SYNTAX', '依赖定义缺少 id', 0, '') };
      if (byId[id]) return { ok: false, error: mkErr('E_SYNTAX', '重复的定义 id「' + id + '」', 0, '') };
      byId[id] = d;
      var p = parse(d.expr, opts);
      if (!p.ok) {
        var e = p.error;
        e.owner = id;
        return { ok: false, error: e };
      }
      parsed[id] = p.refs;
    }

    var external = {};
    (opts.external || []).forEach(function (k) { external[bareName(k)] = true; });

    // 先做未知依赖检查（含 pos），再建邻接表
    var i2;
    for (i2 = 0; i2 < list.length; i2++) {
      var oid = bareName((list[i2] || {}).id);
      var orefs = parsed[oid] || [];
      for (var ri = 0; ri < orefs.length; ri++) {
        var rr = orefs[ri];
        if (!byId[rr.name] && !external[rr.name]) {
          return {
            ok: false,
            error: mkErr('E_UNKNOWN_REF', '未知依赖 attr.' + rr.name, rr.pos, '', { ref: 'attr.' + rr.name, owner: oid })
          };
        }
      }
    }

    // 邻接：id -> 依赖的 id（只保留在 byId 内的；外部依赖视为已知输入）
    var edges = {};
    Object.keys(parsed).forEach(function (id) {
      var deps = [];
      parsed[id].forEach(function (r) {
        if (byId[r.name] && deps.indexOf(r.name) < 0) deps.push(r.name);
      });
      edges[id] = deps;
    });

    // DFS 拓扑排序 + 环检测
    var color = {};
    var out = [];
    var stack = [];

    function visit(id) {
      if (color[id] === 2) return null;
      if (color[id] === 1) {
        var at = stack.indexOf(id);
        var chain = stack.slice(at >= 0 ? at : 0).concat([id]);
        return mkErr('E_CYCLE', '公式依赖成环：' + chain.join(' → '), 0, '', { chain: chain });
      }
      color[id] = 1;
      stack.push(id);
      var deps = edges[id] || [];
      for (var k = 0; k < deps.length; k++) {
        var cyc = visit(deps[k]);
        if (cyc) return cyc;
      }
      stack.pop();
      color[id] = 2;
      out.push(id);
      return null;
    }

    for (i = 0; i < list.length; i++) {
      var eid = bareName((list[i] || {}).id);
      var ce = visit(eid);
      if (ce) return { ok: false, error: ce };
    }
    return { ok: true, order: out };
  }

  function dependenciesOf(defs, opts) {
    var out = {};
    (defs || []).forEach(function (d) {
      var p = parse(d.expr, opts);
      out[bareName(d.id)] = p.ok ? dependencies(p.refs) : { attr: [], skill: [] };
    });
    return out;
  }

  return {
    VERSION: VERSION,
    DEFAULTS: DEFAULTS,
    parse: parse,
    evaluate: evaluate,
    evalAst: function (ast, ctx, opts) {
      opts = opts || {};
      return evalAst(ast, ctx, { expr: opts.expr || '', min: opts.min, max: opts.max });
    },
    check: check,
    dependencies: dependencies,
    dependenciesOf: dependenciesOf,
    order: order,
    bareName: bareName,
    canonKey: canonKey
  };
});
