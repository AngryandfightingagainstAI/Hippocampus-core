// ============================================================
// 阶段 C4 · 技能创角流程（共享纯逻辑，桌面 / RN 同源）
//
// 职责边界：
//   - 只做「步骤准备 / 派生数据 / 单次分配 / 最终提交 / 人设后重算」；
//   - 不碰 DOM、不碰 React Native、不碰 GameState / Storage / 存档；
//   - 所有数值规则调用 engine/core/skill_rules.js，属性 key 归一走 stat_rules.js；
//   - 不重写公式解析器，不做第二套计算。
//
// 与 C1 的关系：C1 出错码/字段路径原样透传，本模块只做聚合与「孤立 id」处理。
// ============================================================
(function (root) {
  'use strict';

  var VERSION = 1;
  var DEFAULT_STEP_ID = '__skills';

  function pickGlobal(name) {
    try { if (typeof root !== 'undefined' && root && root[name]) return root[name]; } catch (e) {}
    try { if (typeof globalThis !== 'undefined' && globalThis && globalThis[name]) return globalThis[name]; } catch (e) {}
    return null;
  }

  function statRules() {
    var S = pickGlobal('StatRules');
    if (S && typeof S.valueOf === 'function' && typeof S.isAttrStep === 'function') return S;
    try {
      var m = require('./stat_rules.js');
      if (m && typeof m.valueOf === 'function' && typeof m.isAttrStep === 'function') return m;
    } catch (e) {}
    return null;
  }

  function skillRules() {
    var R = pickGlobal('SkillRules');
    if (R && typeof R.validateCard === 'function' && typeof R.validate === 'function') return R;
    try {
      var m = require('./skill_rules.js');
      if (m && typeof m.validateCard === 'function' && typeof m.validate === 'function') return m;
    } catch (e) {}
    return null;
  }

  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function clone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (e) { return x; } }
  function str(x) { return x == null ? '' : String(x); }
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }

  function mkErr(code, path, message, extra) {
    var e = { code: code, path: path, message: message };
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }

  // ---------- 1) 属性读取 ----------
  // data 里可能是 attr_str / str / attr_attr_str；统一按 bare 名取数值
  function attrsOf(card, data) {
    var S = statRules();
    var out = {};
    var attrs = (card && Array.isArray(card.attributes)) ? card.attributes : [];
    attrs.forEach(function (a) {
      if (!a || !a.key) return;
      var bare = S ? S.bare(a.key) : str(a.key).replace(/^attr_/, '');
      if (!bare) return;
      var v = S ? S.valueOf(data || {}, a.key) : (data || {})[a.key];
      if (v == null) v = (data || {})[bare];
      v = num(v);
      if (v != null) out[bare] = v;
    });
    return out;
  }

  // ---------- 2) 卡带是否有技能数值规则 ----------
  function hasRules(card) {
    var wb = (card && card.worldbook) || {};
    var skills = Array.isArray(wb.skills) ? wb.skills : [];
    for (var i = 0; i < skills.length; i++) {
      if (skills[i] && typeof skills[i] === 'object' && skills[i].stat != null) return true;
    }
    return wb.skillPool != null;
  }

  function isSkillStep(step) { return !!step && step.type === 'skills'; }

  // ---------- 3) 步骤准备（插入 / 去重） ----------
  // 规则：
  //   1. 卡带已有 type:'skills' 步骤 → 原样返回，绝不重复插入；
  //   2. 没有显式步骤且确实有规则 → 在「最后一个属性步骤」之后插一个虚拟步骤；
  //   3. 旧卡（无 stat、无 skillPool）→ 不插，行为与以前一致。
  function prepareSteps(card) {
    var raw = (card && Array.isArray(card.steps)) ? card.steps : [];
    var steps = raw.map(function (s) { return s; });
    var explicit = false;
    steps.forEach(function (s) { if (isSkillStep(s)) explicit = true; });
    var rules = hasRules(card);
    if (explicit || !rules) {
      return { steps: steps, inserted: false, explicit: explicit, hasRules: rules };
    }
    var S = statRules();
    var lastAttr = -1;
    for (var i = 0; i < steps.length; i++) {
      if (S && S.isAttrStep && S.isAttrStep(steps[i])) lastAttr = i;
    }
    var step = { id: DEFAULT_STEP_ID, type: 'skills', virtual: true };
    var at = lastAttr >= 0 ? lastAttr + 1 : steps.length;
    steps.splice(at, 0, step);
    return { steps: steps, inserted: true, explicit: false, hasRules: true };
  }

  function skillStepOf(steps) {
    var found = null;
    (steps || []).forEach(function (s) { if (!found && isSkillStep(s)) found = s; });
    return found;
  }

  // ---------- 4) 分配归一 / 孤立 id ----------
  function normAlloc(alloc) {
    var out = {};
    if (!isObj(alloc)) return out;
    Object.keys(alloc).forEach(function (k) {
      var v = alloc[k];
      if (v == null) return;
      out[k] = v; // 保留原值（含非法值），由 C1 校验报错；不静默丢弃
    });
    return out;
  }

  function orphansOf(alloc, defs) {
    var known = {};
    (defs || []).forEach(function (d) { known[d.id] = true; });
    var out = [];
    Object.keys(alloc || {}).forEach(function (id) {
      if (!known[id]) out.push({ id: id, alloc: alloc[id] });
    });
    return out;
  }

  // ---------- 5) 步骤派生数据 ----------
  // 不写状态；UI 只渲染这里返回的东西。
  function planStep(card, step, attrs, alloc) {
    var R = skillRules();
    if (!R) {
      return {
        ok: false, enabled: false, defs: [], items: [], pool: null, budget: null,
        capacity: null, status: null, alloc: normAlloc(alloc), orphans: [], minRequired: {},
        errors: [mkErr('E_SKILL_RULES', 'engine/core/skill_rules.js', '数值规则模块未加载，无法计算技能分配')],
        warnings: []
      };
    }
    var a = normAlloc(alloc);
    var vc = R.validateCard(card);
    var defs = vc.defs || [];
    var poolRes = R.poolOf(card, step || null);
    var budget = null;
    var configErrors = [];
    var allocErrors = [];
    var warnings = [];
    (vc.errors || []).forEach(function (e) { configErrors.push(e); });
    (vc.warnings || []).forEach(function (e) { warnings.push(e); });
    (poolRes.errors || []).forEach(function (e) { configErrors.push(e); });
    if (poolRes.pool) {
      var b = R.resolveBudget(poolRes.pool, attrs || {});
      if (b.ok) {
        budget = { total: b.total, mode: poolRes.pool.mode, requireSpend: poolRes.pool.requireSpend, base: poolRes.pool.base };
      } else {
        configErrors.push(b.error);
      }
    }
    var res = R.resolve(defs, attrs || {});
    (res.errors || []).forEach(function (e) { configErrors.push(e); });
    var items = res.items || [];
    var cap = R.capacity(items, a);
    (cap.errors || []).forEach(function (e) { configErrors.push(e); });
    var v = R.validate(items, a, budget || { total: null });
    (v.errors || []).forEach(function (e) { allocErrors.push(e); });
    (v.warnings || []).forEach(function (e) { warnings.push(e); });

    var orphans = orphansOf(a, defs);
    var minRequired = {};
    (cap.perSkill || []).forEach(function (p) { minRequired[p.id] = p.minAlloc; });

    return {
      // ok：卡带配置与预算是否可渲染（空分配不算配置错误）
      // submitOk：当前分配是否可提交（预算/下限/上限全部满足）
      ok: configErrors.length === 0,
      submitOk: configErrors.length === 0 && allocErrors.length === 0,
      enabled: hasRules(card) || isSkillStep(step),
      defs: defs,
      items: items,
      pool: poolRes.pool || null,
      budget: budget,
      capacity: cap,
      status: v.status,
      alloc: a,
      orphans: orphans,
      minRequired: minRequired,
      errors: configErrors.concat(allocErrors),
      configErrors: configErrors,
      allocErrors: allocErrors,
      warnings: warnings
    };
  }

  // ---------- 6) 单次操作 ----------
  // 返回 C1 apply 的结果；alloc 只改当前 id，孤立记录原样保留。
  function stepApply(card, step, attrs, alloc, id, nextValue, opts) {
    var plan = planStep(card, step, attrs, alloc);
    var R = skillRules();
    if (!R) {
      return { ok: false, mode: 'block', alloc: plan.alloc, errors: plan.errors, warnings: [], reasons: [] };
    }
    var budget = plan.budget || { total: null, mode: 'block' };
    var out = R.apply(plan.items, plan.alloc, id, nextValue, budget, opts || {});
    out.orphans = plan.orphans;
    return out;
  }

  // ---------- 7) 最终提交 ----------
  // 只有这里产生 skillStats；没有技能规则时返回 null（不写空对象）。
  function commit(card, attrs, alloc, step) {
    var R = skillRules();
    if (!R) {
      return {
        ok: false, skillStats: null, orphans: [],
        errors: [mkErr('E_SKILL_RULES', 'engine/core/skill_rules.js', '数值规则模块未加载，无法提交技能数值')],
        warnings: []
      };
    }
    if (!hasRules(card)) {
      return { ok: true, skillStats: null, errors: [], warnings: [], orphans: [] };
    }
    var a = normAlloc(alloc);
    var plan = planStep(card, step || null, attrs, a);
    if (!plan.submitOk) {
      return { ok: false, skillStats: null, errors: plan.errors, warnings: plan.warnings, orphans: plan.orphans };
    }
    if (plan.orphans.length) {
      var errs = plan.errors.slice();
      plan.orphans.forEach(function (o) {
        errs.push(mkErr('E_SKILL_UNKNOWN', 'skillStats.' + o.id, '技能 ' + o.id + ' 已不在卡带中，请先移除该分配', { skillId: o.id, alloc: o.alloc }));
      });
      return { ok: false, skillStats: null, errors: errs, warnings: plan.warnings, orphans: plan.orphans };
    }
    var fin = R.finalize(plan.items, a);
    if (!fin.ok) {
      return { ok: false, skillStats: null, errors: (plan.errors || []).concat(fin.errors || []), warnings: plan.warnings, orphans: [] };
    }
    return { ok: true, skillStats: fin.skills, errors: [], warnings: plan.warnings, orphans: [] };
  }

  // ---------- 8) 人设阶段属性变化后重算 ----------
  // 保留 alloc，bonus 由公式重算（不是累加），再跑一次合法性校验。
  function recalc(card, attrs, skillStats, step) {
    var R = skillRules();
    if (!R) {
      return {
        ok: false, skillStats: skillStats || null, changed: false,
        errors: [mkErr('E_SKILL_RULES', 'engine/core/skill_rules.js', '数值规则模块未加载，无法重算技能数值')],
        warnings: [], orphans: []
      };
    }
    var old = isObj(skillStats) ? clone(skillStats) : {};
    if (!hasRules(card)) {
      return { ok: true, skillStats: old, changed: false, errors: [], warnings: [], orphans: [] };
    }
    var defs = R.validateCard(card).defs || [];
    var alloc = {};
    Object.keys(old).forEach(function (id) {
      var s = old[id];
      if (s && typeof s.alloc === 'number') alloc[id] = s.alloc;
    });
    var plan = planStep(card, step || null, attrs, alloc);
    var errors = plan.errors.slice();
    var next = {};
    var changed = false;
    var orphans = [];
    var byId = {};
    plan.items.forEach(function (it) { byId[it.id] = it; });

    Object.keys(old).forEach(function (id) {
      var prev = old[id] || {};
      var it = byId[id];
      if (!it) {
        // 卡带里已没有这个技能：原样保留，标 orphan，不静默删除
        next[id] = { init: prev.init, bonus: prev.bonus, alloc: prev.alloc, value: prev.value };
        orphans.push({ id: id, alloc: prev.alloc });
        return;
      }
      var a = typeof prev.alloc === 'number' ? prev.alloc : 0;
      var value = it.init + it.bonus + a;
      if (it.min != null && value < it.min) {
        errors.push(mkErr('E_SKILL_MIN', 'skills.' + id, '重算后最终值 ' + value + ' 低于下限 ' + it.min, { skillId: id, value: value, min: it.min }));
      }
      if (it.max != null && value > it.max) {
        errors.push(mkErr('E_SKILL_CAP', 'skills.' + id, '重算后最终值 ' + value + ' 超过上限 ' + it.max, { skillId: id, value: value, max: it.max }));
      }
      next[id] = { init: it.init, bonus: it.bonus, alloc: a, value: value };
      if (!prev || prev.init !== it.init || prev.bonus !== it.bonus || prev.value !== value || prev.alloc !== a) changed = true;
    });

    // 新增技能（技能表里新出现、但旧 skillStats 没有）：补 alloc=0 的条目
    defs.forEach(function (d) {
      if (next[d.id]) return;
      var it = byId[d.id];
      if (!it) return;
      next[d.id] = { init: it.init, bonus: it.bonus, alloc: 0, value: it.init + it.bonus };
      changed = true;
    });

    return {
      ok: errors.length === 0,
      skillStats: next,
      changed: changed,
      errors: errors,
      warnings: plan.warnings,
      orphans: orphans
    };
  }

  // ---------- 9) 草稿临时键 ----------
  // 创角数据里 `__` 开头的键只属于草稿（__picks_*、__skillAlloc），不得进入 playerData。
  function stripTransient(data) {
    var out = {};
    if (!isObj(data)) return out;
    Object.keys(data).forEach(function (k) {
      if (k.indexOf('__') === 0) return;
      out[k] = data[k];
    });
    return out;
  }

  var api = {
    VERSION: VERSION,
    DEFAULT_STEP_ID: DEFAULT_STEP_ID,
    attrsOf: attrsOf,
    hasRules: hasRules,
    prepareSteps: prepareSteps,
    skillStepOf: skillStepOf,
    isSkillStep: isSkillStep,
    planStep: planStep,
    stepApply: stepApply,
    commit: commit,
    recalc: recalc,
    orphansOf: orphansOf,
    normAlloc: normAlloc,
    stripTransient: stripTransient
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SkillFlow = api;
  if (typeof globalThis !== 'undefined') globalThis.SkillFlow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
