// ============================================================
// 阶段 C1 · 技能数值规则（A 类纯逻辑：零 DOM / 零 RN / 零副作用）
//
// 只做「技能模板 + 初始值/加成 + 分配校验 + 预算 + 容量 + 三模式」的纯计算，
// 不读写存档、不渲染、不接卡带字段、不改创角流程（C2 起才接入）。
//
// 数据契约（worldbook.skills[i].stat）：
//   init    number | 公式字符串     缺省 0
//   bonus   number | 公式字符串     缺省 0
//   min     number | null           缺省 null（不配置下限）
//   max     number | null           缺省 null（不配置上限）
//   attrs   string[]                缺省 []（声明 bonus 依赖哪些属性，用于校验与展示）
//
// 计算关系：value = init + bonus + alloc（不因上下限而改写 init/bonus）。
// 上限/下限校验的是「最终值」；分配点数合法性是另一项独立校验。
//
// 公式一律走 engine/core/formula.js；失败时保留原始错误码/位置与字段路径，
// 阻断当前计算流程，不用默认值掩盖。
// ============================================================

(function (factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SkillRules = api;
  if (typeof globalThis !== 'undefined') globalThis.SkillRules = api;
})(function () {
  'use strict';

  var VERSION = 1;
  var MODES = { block: true, warn: true, clamp: true };
  var DEFAULTS = { init: 0, bonus: 0, min: null, max: null, attrs: [] };

  function formula() {
    if (typeof Formula !== 'undefined' && Formula && typeof Formula.evaluate === 'function') return Formula;
    if (typeof require === 'function') {
      try {
        var m = require('./formula.js');
        if (m && typeof m.evaluate === 'function') return m;
      } catch (e) {}
    }
    return null;
  }

  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function isInt(v) { return isNum(v) && Math.floor(v) === v; }
  function str(v) { return v == null ? '' : String(v); }
  function bare(key) {
    var s = str(key);
    while (s.indexOf('attr_') === 0) s = s.slice(5);
    return s;
  }

  function mkErr(code, path, message, extra) {
    var e = { code: code, path: path || '', message: message || '' };
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }

  function mkFormulaErr(path, field, skillId, cause) {
    return mkErr('E_SKILL_FORMULA', path, '技能数值公式无法计算（' + path + '）', {
      field: field, skillId: skillId, cause: cause
    });
  }

  // 读取世界的属性定义（只用于 attrs 引用校验；缺失时只警告，不阻断旧卡）
  function attrBareSet(card) {
    var out = {};
    var list = (card && card.attributes) || [];
    for (var i = 0; i < list.length; i++) {
      var k = list[i] && list[i].key;
      if (k) out[bare(k)] = true;
    }
    return out;
  }

  // ---------- 1) 技能模板校验 ----------

  function validateCard(card) {
    var errors = [];
    var warnings = [];
    var defs = [];
    var wb = (card && card.worldbook) || {};
    var raw = wb.skills;
    var known = attrBareSet(card);
    var hasAttrs = Object.keys(known).length > 0;

    if (raw == null) return { ok: true, defs: defs, errors: errors, warnings: warnings };
    if (!Array.isArray(raw)) {
      errors.push(mkErr('E_SKILL_DEF', 'worldbook.skills', 'worldbook.skills 必须是数组'));
      return { ok: false, defs: defs, errors: errors, warnings: warnings };
    }

    var seen = {};
    for (var i = 0; i < raw.length; i++) {
      var base = 'worldbook.skills[' + i + ']';
      var s = raw[i];
      if (!isObj(s)) { errors.push(mkErr('E_SKILL_DEF', base, '技能必须是对象')); continue; }
      var id = str(s.id);
      if (!id) { errors.push(mkErr('E_SKILL_DEF', base + '.id', '技能缺少 id')); continue; }
      if (seen[id]) { errors.push(mkErr('E_SKILL_DEF', base + '.id', '技能 id 重复：' + id, { skillId: id })); continue; }
      seen[id] = true;

      var stat = s.stat;
      if (stat == null) {
        // 旧技能（只有 name/desc/levels）：不进入数值体系，但保留在卡带里
        continue;
      }
      if (!isObj(stat)) {
        errors.push(mkErr('E_SKILL_DEF', base + '.stat', 'stat 必须是对象', { skillId: id }));
        continue;
      }

      var initSpec = stat.init == null ? DEFAULTS.init : stat.init;
      var bonusSpec = stat.bonus == null ? DEFAULTS.bonus : stat.bonus;
      var minV = stat.min == null ? null : stat.min;
      var maxV = stat.max == null ? null : stat.max;
      var attrs = stat.attrs == null ? [] : stat.attrs;

      if (!(isNum(initSpec) || (typeof initSpec === 'string' && initSpec.trim()))) {
        errors.push(mkErr('E_SKILL_DEF', base + '.stat.init', 'init 必须是数字或非空公式字符串', { skillId: id, field: 'init' }));
      }
      if (!(isNum(bonusSpec) || (typeof bonusSpec === 'string' && bonusSpec.trim()))) {
        errors.push(mkErr('E_SKILL_DEF', base + '.stat.bonus', 'bonus 必须是数字或非空公式字符串', { skillId: id, field: 'bonus' }));
      }
      if (minV != null && !isNum(minV)) {
        errors.push(mkErr('E_SKILL_DEF', base + '.stat.min', 'min 必须是数字或 null', { skillId: id, field: 'min' }));
      }
      if (maxV != null && !isNum(maxV)) {
        errors.push(mkErr('E_SKILL_DEF', base + '.stat.max', 'max 必须是数字或 null', { skillId: id, field: 'max' }));
      }
      if (isNum(minV) && isNum(maxV) && minV > maxV) {
        errors.push(mkErr('E_SKILL_DEF', base + '.stat', 'min 不能大于 max', { skillId: id }));
      }
      if (!Array.isArray(attrs)) {
        errors.push(mkErr('E_SKILL_DEF', base + '.stat.attrs', 'attrs 必须是数组', { skillId: id, field: 'attrs' }));
        attrs = [];
      }
      for (var a = 0; a < attrs.length; a++) {
        var ak = attrs[a];
        if (typeof ak !== 'string' || !ak.trim()) {
          errors.push(mkErr('E_SKILL_DEF', base + '.stat.attrs[' + a + ']', 'attrs 里必须是属性 key 字符串', { skillId: id }));
          continue;
        }
        if (!hasAttrs) {
          warnings.push(mkErr('E_SKILL_ATTR_UNVERIFIED', base + '.stat.attrs[' + a + ']', '卡带没有声明 card.attributes，无法校验属性引用', { skillId: id, attr: bare(ak) }));
        } else if (!known[bare(ak)]) {
          errors.push(mkErr('E_SKILL_ATTR', base + '.stat.attrs[' + a + ']', 'attrs 引用了未声明的属性：' + bare(ak), { skillId: id, attr: bare(ak) }));
        }
      }

      // 公式静态检查（只查语法与已知引用；求值仍在 resolve 阶段）
      var F = formula();
      ['init', 'bonus'].forEach(function (f) {
        var spec = f === 'init' ? initSpec : bonusSpec;
        if (typeof spec !== 'string') return;
        if (!F) {
          errors.push(mkErr('E_SKILL_FORMULA', base + '.stat.' + f, '公式模块未加载，无法校验公式', { skillId: id, field: f }));
          return;
        }
        var chk = F.check(spec, hasAttrs ? { known: Object.keys(known) } : {});
        if (!chk.ok) {
          errors.push(mkErr('E_SKILL_FORMULA', base + '.stat.' + f, '公式非法：' + chk.error.message, {
            skillId: id, field: f, cause: chk.error
          }));
        }
      });

      defs.push({
        id: id,
        name: str(s.name || id),
        path: base,
        init: initSpec,
        bonus: bonusSpec,
        min: minV,
        max: maxV,
        attrs: attrs.map(function (x) { return bare(x); })
      });
    }

    return { ok: errors.length === 0, defs: defs, errors: errors, warnings: warnings };
  }

  // ---------- 2) 预算声明与解析 ----------

  function poolOf(card, step) {
    var errors = [];
    var wb = (card && card.worldbook) || {};
    var a = (step && step.pool) || null;
    var b = wb.skillPool || null;
    if (a == null && b == null) return { ok: true, pool: null, errors: errors };

    function pick(p, key) { return p && p[key] != null ? p[key] : null; }
    function sameValue(x, y) {
      if (x == null && y == null) return true;
      if (x == null || y == null) return false;
      if (isNum(x) && isNum(y)) return x === y;
      if (typeof x === 'boolean' || typeof y === 'boolean') return x === y;
      if (typeof x === 'string' && typeof y === 'string') return x.trim() === y.trim();
      return false;
    }
    function differs(x, y) { return x != null && y != null && !sameValue(x, y); }

    if (a && b) {
      var conflict = null;
      // 只有「两处都写了且值不同」才算冲突；一处缺省则由另一处补齐
      if (differs(pick(a, 'total'), pick(b, 'total'))) conflict = 'total';
      else if (differs(pick(a, 'mode'), pick(b, 'mode'))) conflict = 'mode';
      else if (differs(pick(a, 'requireSpend'), pick(b, 'requireSpend'))) conflict = 'requireSpend';
      if (conflict) {
        errors.push(mkErr('E_SKILL_POOL_CONFLICT', 'worldbook.skillPool',
          '步骤 budget 与 worldbook.skillPool 同时定义且 ' + conflict + ' 不一致；请只保留一处或改成相同值',
          { field: conflict }));
        return { ok: false, pool: null, errors: errors };
      }
    }

    var source = a ? 'step' : 'worldbook';
    var total = pick(a, 'total') != null ? pick(a, 'total') : pick(b, 'total');
    var mode = pick(a, 'mode') != null ? pick(a, 'mode') : pick(b, 'mode');
    var requireSpend = pick(a, 'requireSpend') != null ? pick(a, 'requireSpend') : pick(b, 'requireSpend');
    var base = pick(a, 'base') != null ? pick(a, 'base') : pick(b, 'base');

    if (total != null && !(isNum(total) || (typeof total === 'string' && total.trim()))) {
      errors.push(mkErr('E_SKILL_POOL_DEF', source === 'step' ? 'steps[].pool.total' : 'worldbook.skillPool.total', 'total 必须是数字或非空公式字符串'));
    }
    if (isNum(total) && (!isInt(total) || total < 0)) {
      errors.push(mkErr('E_SKILL_POOL_DEF', source === 'step' ? 'steps[].pool.total' : 'worldbook.skillPool.total', 'total 必须是非负整数'));
    }
    if (mode != null && !MODES[mode]) {
      errors.push(mkErr('E_SKILL_POOL_DEF', source === 'step' ? 'steps[].pool.mode' : 'worldbook.skillPool.mode', 'mode 只能是 block / warn / clamp'));
    }
    if (requireSpend != null && typeof requireSpend !== 'boolean') {
      errors.push(mkErr('E_SKILL_POOL_DEF', source === 'step' ? 'steps[].pool.requireSpend' : 'worldbook.skillPool.requireSpend', 'requireSpend 必须是布尔'));
    }
    if (base != null && !isNum(base)) {
      errors.push(mkErr('E_SKILL_POOL_DEF', source === 'step' ? 'steps[].pool.base' : 'worldbook.skillPool.base', 'base 必须是数字'));
    }

    if (errors.length) return { ok: false, pool: null, errors: errors };
    return {
      ok: true,
      errors: errors,
      pool: {
        total: total,
        mode: mode || 'block',
        requireSpend: requireSpend === true,
        base: base == null ? 0 : base,
        source: source
      }
    };
  }

  function resolveBudget(pool, attrs) {
    if (!pool || pool.total == null) return { ok: true, total: null };
    if (isNum(pool.total)) return { ok: true, total: pool.total };
    var F = formula();
    if (!F) {
      return { ok: false, error: mkErr('E_SKILL_FORMULA', 'worldbook.skillPool.total', '公式模块未加载，无法计算技能预算', { field: 'total' }) };
    }
    var r = F.evaluate(pool.total, { attrs: attrs || {} });
    if (!r.ok) {
      return {
        ok: false,
        error: mkErr('E_SKILL_FORMULA', 'worldbook.skillPool.total', '技能预算公式无法计算', {
          field: 'total', cause: r.error
        })
      };
    }
    if (!isInt(r.value) || r.value < 0) {
      return { ok: false, error: mkErr('E_SKILL_POOL_DEF', 'worldbook.skillPool.total', '技能预算公式结果必须是非负整数，实际 ' + r.value, { field: 'total' }) };
    }
    return { ok: true, total: r.value };
  }

  // ---------- 3) 初始值与加成 ----------

  function resolve(defs, attrs) {
    var F = formula();
    var items = [];
    var errors = [];
    (defs || []).forEach(function (d) {
      function one(spec, field) {
        if (isNum(spec)) return spec;
        if (!F) {
          errors.push(mkErr('E_SKILL_FORMULA', d.path + '.stat.' + field, '公式模块未加载，无法计算 ' + field, { skillId: d.id, field: field }));
          return null;
        }
        var r = F.evaluate(spec, { attrs: attrs || {} });
        if (!r.ok) {
          errors.push(mkFormulaErr(d.path + '.stat.' + field, field, d.id, r.error));
          return null;
        }
        return r.value;
      }
      var init = one(d.init, 'init');
      var bonus = one(d.bonus, 'bonus');
      if (init == null || bonus == null) return;
      items.push({ id: d.id, name: d.name, init: init, bonus: bonus, min: d.min, max: d.max, attrs: d.attrs });
    });
    return { ok: errors.length === 0, items: items, errors: errors };
  }

  // ---------- 4) 容量与分配范围 ----------

  function capacity(items, alloc) {
    var errors = [];
    var per = [];
    var bounded = true;
    var finiteRemaining = 0;
    var maxAbsorbable = 0;
    var allocMap = isObj(alloc) ? alloc : {};

    (items || []).forEach(function (it) {
      var base = it.init + it.bonus;
      var minAlloc = it.min == null ? 0 : Math.max(0, it.min - base);
      var maxAlloc = it.max == null ? Infinity : (it.max - base);
      if (it.max != null && maxAlloc < 0) {
        errors.push(mkErr('E_SKILL_CAP', 'skills[' + it.id + ']',
          '初始值+加成已超过上限 ' + it.max + '（' + base + '）', { skillId: it.id }));
        maxAlloc = 0;
      }
      if (minAlloc > maxAlloc) {
        errors.push(mkErr('E_SKILL_DEF', 'skills[' + it.id + ']',
          '合法分配区间为空（min 需要 ' + minAlloc + '，max 只允许 ' + maxAlloc + '）', { skillId: it.id }));
      }
      var cur = allocMap[it.id] == null ? 0 : allocMap[it.id];
      var finite = it.max != null;
      if (!finite) bounded = false;
      var remain = finite ? Math.max(0, maxAlloc - cur) : Infinity;
      if (finite) { finiteRemaining += remain; maxAbsorbable += Math.max(0, maxAlloc); }
      per.push({
        id: it.id, init: it.init, bonus: it.bonus, base: base,
        min: it.min, max: it.max, minAlloc: minAlloc, maxAlloc: maxAlloc,
        alloc: cur, remainAlloc: remain, finite: finite
      });
    });

    return {
      ok: errors.length === 0,
      errors: errors,
      bounded: bounded,
      perSkill: per,
      finiteRemaining: finiteRemaining,
      furtherCapacity: bounded ? finiteRemaining : Infinity,
      maxAbsorbable: bounded ? maxAbsorbable : Infinity
    };
  }

  // ---------- 5) 状态 / 校验 ----------

  function sumAlloc(alloc) {
    var t = 0;
    if (!isObj(alloc)) return 0;
    Object.keys(alloc).forEach(function (k) {
      var v = alloc[k];
      if (isNum(v)) t += v;
    });
    return t;
  }

  function status(items, alloc, budget) {
    var cap = capacity(items, alloc);
    var allocated = sumAlloc(alloc);
    var total = budget && budget.total != null ? budget.total : null;
    var remaining = total == null ? null : total - allocated;
    var requireSpend = !!(budget && budget.requireSpend);
    return {
      ok: cap.ok,
      errors: cap.errors,
      budgetTotal: total,
      allocated: allocated,
      remaining: remaining,
      requireSpend: requireSpend,
      bounded: cap.bounded,
      finiteRemaining: cap.finiteRemaining,
      furtherCapacity: cap.furtherCapacity,
      unspent: remaining != null && remaining > 0,
      satisfied: remaining == null ? true : (remaining === 0)
    };
  }

  function validate(items, alloc, budget) {
    var errors = [];
    var warnings = [];
    var cap = capacity(items, alloc);
    (cap.errors || []).forEach(function (e) { errors.push(e); });
    var byId = {};
    (items || []).forEach(function (it) { byId[it.id] = it; });

    if (isObj(alloc)) {
      Object.keys(alloc).forEach(function (id) {
        var v = alloc[id];
        if (!byId[id]) { errors.push(mkErr('E_SKILL_UNKNOWN', 'skills.' + id, '分配里出现未定义的技能：' + id, { skillId: id })); return; }
        if (!isInt(v)) { errors.push(mkErr('E_SKILL_ALLOC', 'skills.' + id, '分配点数必须是非负整数，实际 ' + v, { skillId: id, value: v })); return; }
        if (v < 0) errors.push(mkErr('E_SKILL_ALLOC', 'skills.' + id, '分配点数不得为负数', { skillId: id, value: v }));
      });
    } else if (alloc != null) {
      errors.push(mkErr('E_SKILL_ALLOC', 'skills', 'alloc 必须是对象'));
    }

    cap.perSkill.forEach(function (p) {
      if (p.alloc < 0) return; // 已由上面的非负校验覆盖
      if (p.alloc < p.minAlloc) {
        errors.push(mkErr('E_SKILL_MIN', 'skills.' + p.id,
          '最终值低于下限：' + (p.base + p.alloc) + ' < ' + p.min, { skillId: p.id, min: p.min, value: p.base + p.alloc }));
      }
      if (p.alloc > p.maxAlloc) {
        errors.push(mkErr('E_SKILL_CAP', 'skills.' + p.id,
          '最终值超过上限：' + (p.base + p.alloc) + ' > ' + p.max, { skillId: p.id, max: p.max, value: p.base + p.alloc }));
      }
    });

    var allocated = sumAlloc(alloc);
    var total = budget && budget.total != null ? budget.total : null;
    if (total != null) {
      if (allocated > total) {
        errors.push(mkErr('E_SKILL_OVER_BUDGET', 'skillPool', '已分配 ' + allocated + ' 超过预算 ' + total, { allocated: allocated, total: total }));
      }
      if (budget.requireSpend && allocated < total) {
        var remaining = total - allocated;
        if (cap.furtherCapacity !== Infinity && cap.furtherCapacity < remaining) {
          errors.push(mkErr('E_SKILL_POOL_CONFLICT', 'skillPool',
            '必须花完预算，但所有技能的合法容量只剩 ' + cap.furtherCapacity + '，不足以容纳剩余 ' + remaining,
            { remaining: remaining, furtherCapacity: cap.furtherCapacity, total: total, allocated: allocated }));
        } else {
          errors.push(mkErr('E_SKILL_UNDER_BUDGET', 'skillPool', '预算未花完：剩余 ' + remaining + ' / ' + total, { remaining: remaining, total: total }));
        }
      }
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      warnings: warnings,
      status: status(items, alloc, budget),
      capacity: cap
    };
  }

  // ---------- 6) block / warn / clamp ----------

  function apply(items, alloc, skillId, nextValue, budget, opts) {
    opts = opts || {};
    alloc = isObj(alloc) ? alloc : {};
    var mode = opts.mode || (budget && budget.mode) || 'block';
    if (!MODES[mode]) mode = 'block';
    var errors = [];
    var warnings = [];
    var reasons = [];
    var cap = capacity(items, alloc);
    var target = null;
    for (var i = 0; i < cap.perSkill.length; i++) if (cap.perSkill[i].id === skillId) target = cap.perSkill[i];

    if (!target) {
      return {
        ok: false, mode: mode, errors: [mkErr('E_SKILL_UNKNOWN', 'skills.' + skillId, '未定义的技能：' + skillId, { skillId: skillId })],
        warnings: warnings, requested: nextValue, actual: null, alloc: alloc, reasons: reasons
      };
    }
    if (!isInt(nextValue) || nextValue < 0) {
      // 「分配不得为负」是硬规则，warn/clamp 也不放行
      return {
        ok: false, mode: mode,
        errors: [mkErr('E_SKILL_ALLOC', 'skills.' + skillId, '分配点数必须是非负整数，实际 ' + nextValue, { skillId: skillId, value: nextValue })],
        warnings: warnings, requested: nextValue, actual: null, alloc: alloc, reasons: reasons
      };
    }

    var others = sumAlloc(alloc) - (isNum(alloc[skillId]) ? alloc[skillId] : 0);
    var lower = Math.max(0, Math.ceil(target.minAlloc));
    var upper = target.maxAlloc === Infinity ? Infinity : Math.floor(target.maxAlloc);
    if (budget && budget.total != null) upper = Math.min(upper, Math.floor(budget.total - others));
    if (upper < lower) {
      errors.push(mkErr('E_SKILL_POOL_CONFLICT', 'skills.' + skillId,
        '该技能的合法分配区间为空（需要至少 ' + lower + '，最多 ' + upper + '）',
        { skillId: skillId, lower: lower, upper: upper }));
      return { ok: false, mode: mode, errors: errors, warnings: warnings, requested: nextValue, actual: null, alloc: alloc, reasons: reasons };
    }

    var legal = nextValue >= lower && nextValue <= upper;
    if (legal) {
      var out = {};
      Object.keys(alloc || {}).forEach(function (k) { out[k] = alloc[k]; });
      out[skillId] = nextValue;
      return {
        ok: true, mode: mode, accepted: true, clamped: false,
        requested: nextValue, actual: nextValue, alloc: out, reasons: reasons, warnings: warnings,
        status: status(items, out, budget)
      };
    }

    if (mode === 'block') {
      if (nextValue < lower) reasons.push('below_min');
      if (nextValue > upper) reasons.push(budget && budget.total != null && nextValue > target.maxAlloc ? 'above_cap' : 'over_budget');
      errors.push(mkErr(nextValue < lower ? 'E_SKILL_MIN' : (reasons.indexOf('above_cap') >= 0 ? 'E_SKILL_CAP' : 'E_SKILL_OVER_BUDGET'),
        'skills.' + skillId, '非法分配：' + nextValue + '，允许范围 ' + lower + '..' + upper,
        { skillId: skillId, requested: nextValue, lower: lower, upper: upper }));
      return { ok: false, mode: mode, errors: errors, warnings: warnings, requested: nextValue, actual: null, alloc: alloc, reasons: reasons };
    }

    if (mode === 'warn') {
      if (nextValue < target.minAlloc) { warnings.push(mkErr('E_SKILL_MIN', 'skills.' + skillId, '最终值低于下限', { skillId: skillId })); reasons.push('below_min'); }
      if (nextValue > target.maxAlloc) { warnings.push(mkErr('E_SKILL_CAP', 'skills.' + skillId, '最终值超过上限', { skillId: skillId })); reasons.push('above_cap'); }
      if (budget && budget.total != null && others + nextValue > budget.total) { warnings.push(mkErr('E_SKILL_OVER_BUDGET', 'skillPool', '已分配超过预算', {})); reasons.push('over_budget'); }
      var wout = {};
      Object.keys(alloc || {}).forEach(function (k) { wout[k] = alloc[k]; });
      wout[skillId] = nextValue;
      return {
        ok: true, mode: mode, accepted: true, clamped: false,
        requested: nextValue, actual: nextValue, alloc: wout, reasons: reasons, warnings: warnings,
        status: status(items, wout, budget)
      };
    }

    // clamp：同时考虑单技能范围与剩余预算；只调整当前技能
    var actual = nextValue;
    if (actual < lower) { actual = lower; reasons.push('below_min'); }
    if (actual > target.maxAlloc) { actual = Math.floor(target.maxAlloc); reasons.push('above_cap'); }
    if (budget && budget.total != null && others + actual > budget.total) {
      actual = Math.max(0, Math.floor(budget.total - others));
      reasons.push('over_budget');
    }
    if (actual < lower || actual > upper) {
      errors.push(mkErr('E_SKILL_POOL_CONFLICT', 'skills.' + skillId, '截断后仍无法满足下限与预算', { skillId: skillId, lower: lower, upper: upper }));
      return { ok: false, mode: mode, errors: errors, warnings: warnings, requested: nextValue, actual: null, alloc: alloc, reasons: reasons };
    }
    var cout = {};
    Object.keys(alloc || {}).forEach(function (k) { cout[k] = alloc[k]; });
    cout[skillId] = actual;
    return {
      ok: true, mode: mode, accepted: true, clamped: true,
      requested: nextValue, actual: actual, alloc: cout, reasons: reasons, warnings: warnings,
      status: status(items, cout, budget)
    };
  }

  // ---------- 7) 最终值 ----------

  function finalize(items, alloc) {
    var errors = [];
    var out = {};
    (items || []).forEach(function (it) {
      var raw = isObj(alloc) ? alloc[it.id] : null;
      if (raw != null && (!isInt(raw) || raw < 0)) {
        errors.push(mkErr('E_SKILL_ALLOC', 'skills.' + it.id, '分配点数必须是非负整数，实际 ' + raw, { skillId: it.id, value: raw }));
        return;
      }
      var a = raw == null ? 0 : raw;
      var value = it.init + it.bonus + a;
      if (it.min != null && value < it.min) {
        errors.push(mkErr('E_SKILL_MIN', 'skills.' + it.id, '最终值 ' + value + ' 低于下限 ' + it.min, { skillId: it.id, value: value, min: it.min }));
      }
      if (it.max != null && value > it.max) {
        errors.push(mkErr('E_SKILL_CAP', 'skills.' + it.id, '最终值 ' + value + ' 超过上限 ' + it.max, { skillId: it.id, value: value, max: it.max }));
      }
      out[it.id] = { init: it.init, bonus: it.bonus, alloc: a, value: value };
    });
    return { ok: errors.length === 0, skills: out, errors: errors };
  }

  return {
    VERSION: VERSION,
    DEFAULTS: DEFAULTS,
    MODES: MODES,
    validateCard: validateCard,
    poolOf: poolOf,
    resolveBudget: resolveBudget,
    resolve: resolve,
    capacity: capacity,
    status: status,
    validate: validate,
    apply: apply,
    finalize: finalize
  };
});
