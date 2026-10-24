// ============================================================
// 战役 P5 · 新建存档（创角）纯逻辑模型（A 类：零 React / 零 RN / 零 DOM）
// RN 独有。承载桌面 engine/story.js CreateFlow:586-1048 的全部「数据 + 判定」
// 口径，供 B 类视图 rn/screens/CreateScreen.js 直调，Node smoke 可直接 require。
//
// 与桌面的对应关系（只搬逻辑，不搬 DOM 渲染）：
//   池      getPool:679 / isAttrStep:684 / calcAllocated:690
//   跳过    isSkipped:703 / start 过滤 :638 / next 跳步 :1027
//   表单    fieldFallback + 默认值同步 :756-763
//   校验    validateCurrent:987-1022（返回错误码，文案由视图层逐字给出）
//   多选    toggleMulti:980-986
//   草稿    _draftKey:592 / _peekDraft:599（7 天过期）/ _saveDraft:610 / _clearDraft:628
//   汇总    renderSummary:956-978（label/option 反查 + 数组用「、」连接）
//   完成    finish:1035-1047 的「playerData 深拷贝 → inventory 默认 → Alias.normalize」
//
// 视图层契约：校验/池条/多选上限的玩家可见文案全部由 CreateScreen.js 持有，
// 本模块只产错误码 + 参数（code/a/total/min/max/label），不产中文文案。
//
// VFS / Alias 为 bootstrap 挂载全局，裸用同 engine 风格；Node smoke 用
// globalThis 注入内存假件。nowMs 参数用于草稿过期可测。
// ============================================================

'use strict';

// C4：技能流程（自动插步骤 / 分配校验 / 提交）。模块不可用时返回 null，调用方退回旧行为。
var _SF_CACHE = null;
function SF() {
  if (_SF_CACHE !== null) return _SF_CACHE || null;
  try { _SF_CACHE = require('../engine/core/skill_flow.js'); } catch (e) { _SF_CACHE = false; }
  return _SF_CACHE || null;
}

var DRAFT_TTL_MS = 7 * 24 * 3600 * 1000;

function _now(nowMs) { return nowMs != null ? nowMs : Date.now(); }
function _vfs() { return (typeof VFS !== 'undefined' && VFS) ? VFS : null; }

// ---------- 属性池 ----------

// 数值规则唯一实现（engine/core/stat_rules.js）：与桌面 engine/story.js CreateFlow 同口径。
// 属性键归一 / 锁定项不计池 / 池来源优先级都走这里，避免双端各写一份漂移。
function _sr() {
  if (typeof StatRules !== 'undefined' && StatRules && typeof StatRules.allocated === 'function') return StatRules;
  if (typeof require === 'function') {
    try {
      var m = require('../engine/core/stat_rules.js');
      if (m && typeof m.allocated === 'function') return m;
    } catch (e) {}
  }
  return null;
}

function getPool(card, step) {
  var SR = _sr();
  if (SR) return SR.poolOf(card, step);
  if (step && step.pool && step.pool.total != null) return step.pool;
  if (card && card.attributePool && card.attributePool.total != null) return card.attributePool;
  return null;
}

function isAttrStep(step) {
  var SR = _sr();
  if (SR) return SR.isAttrStep(step);
  if (!step || !step.fields || !step.fields.length) return false;
  var allNumber = step.fields.every(function (f) { return f.type === 'number'; });
  var allAttrKey = step.fields.every(function (f) { return f.key && String(f.key).indexOf('attr_') === 0; });
  return allNumber || allAttrKey;
}

// A2：属性定义统一入口（card.attributes 权威，step.fields 只在 attributes 缺项时兜底）。
//   桌面 engine/story.js renderForm / validateCurrent、prompt_builder 走的是同一个 StatRules.defs，
//   这样「显示 / 校验 / 点数 / 提示词」四处不会再各拿一份定义。
function defsOf(card, step) {
  var SR = _sr();
  if (SR && typeof SR.defs === 'function') return SR.defs(card, step);
  return (step && step.fields || []).filter(function (f) { return f && f.key; }).map(function (f) {
    return { key: f.key, bare: f.key, name: f.label || f.key, min: f.min, max: f.max, init: f.default, legacy: true };
  });
}

// 属性定义查表（canon 键与裸键都命中）；defMap 缺失时退回 defsOf 自行拼
function defMapOf(card, step) {
  var SR = _sr();
  if (SR && typeof SR.defMap === 'function') return SR.defMap(card, step);
  var out = {};
  defsOf(card, step).forEach(function (d) { out[d.key] = d; if (d.bare) out[d.bare] = d; });
  return out;
}

// A2 诊断：card.attributes 与属性步定义不一致时的可读提示（不改任何一边）
function defWarningsOf(card, step) {
  var SR = _sr();
  if (SR && typeof SR.defWarnings === 'function') {
    try { return SR.defWarnings(card, step); } catch (e) { return []; }
  }
  return [];
}

function calcAllocated(card, step, data, pool) {
  if (!pool) return 0;
  var SR = _sr();
  var list = defsOf(card, step);
  if (SR) {
    return SR.allocated(list, data, pool.base != null ? pool.base : 0, {
      excludeLocked: true,
      locked: SR.lockedValues(data)
    });
  }
  var base = pool.base != null ? pool.base : 0;
  var total = 0;
  list.forEach(function (d) {
    var v = data[d.key];
    if (typeof v !== 'number' || isNaN(v)) return;
    var fb = d.min != null ? d.min : base;
    total += Math.max(0, v - fb);
  });
  return total;
}

// 池条是否生效：有池 && 该步是属性步（与桌面 renderForm:745 一致）
function poolOf(card, step) {
  var pool = getPool(card, step);
  return (pool && isAttrStep(step)) ? pool : null;
}

// ---------- 天命落库（与桌面 engine/story.js:1833 pickDestiny 同口径）----------
// 选一组天命：属性经 stat_rules 写规范键（同时保留裸键兼容旧读取方），
// 并落 playerData._destiny 锁（locked/values/label/lockedAt）。
// 重掷后再选：先清掉这一组属性键，避免上一组值残留。
function applyDestinyPick(data, attrs, set, index, nowMs) {
  var SR = _sr();
  var next = {};
  Object.keys(data || {}).forEach(function (k) { next[k] = data[k]; });
  var list = attrs || [];
  var values = {};

  function canonOf(key) {
    if (SR) return SR.canon(key);
    return 'attr_' + String(key).replace(/^attr_/, '');
  }
  function bareOf(key) {
    if (SR) return SR.bare(key);
    return String(key).replace(/^attr_/, '');
  }

  // 1) 清掉上一组写进去的值（规范键 + 裸键），保证重掷后不残留
  list.forEach(function (a) {
    if (!a || !a.key) return;
    delete next[canonOf(a.key)];
    delete next[bareOf(a.key)];
  });

  // 2) 写入新一组（只写这一组声明过的属性）
  list.forEach(function (a) {
    if (!a || !a.key || !set || !set.values) return;
    var v = set.values[a.key];
    if (typeof v !== 'number') return;
    if (SR) SR.writeValue(next, a.key, v, true);
    else next[a.key] = v;
    values[canonOf(a.key)] = v;
  });

  next._destiny = {
    locked: true,
    values: values,
    label: '天命 ' + ((index || 0) + 1) + ' 组',
    lockedAt: new Date(nowMs != null ? nowMs : Date.now()).toISOString()
  };
  return next;
}

// ---------- 步骤跳过 ----------

function isSkipped(step, data) {
  if (!step || !step.skipWhen) return false;
  var m = String(step.skipWhen).match(/^(\w+)\s*!=\s*null$/);
  if (m) return (data || {})[m[1]] != null;
  return false;
}

// start:638 等效：按当前 data 过滤跳过步
function filterSteps(card, data) {
  var steps = (card && card.steps) || [];
  return steps.filter(function (s) { return !isSkipped(s, data); });
}

// C4：自动插入技能步骤（与桌面 CreateFlow.start 同源）。返回 {steps, inserted, explicit}
function prepareSteps(card) {
  var s = SF();
  var base = (card && Array.isArray(card.steps)) ? card.steps : [];
  if (!s || !s.prepareSteps) return { steps: base.slice(), inserted: false, explicit: false, hasRules: false };
  var r = s.prepareSteps(card);
  return { steps: (r.steps || []).slice(), inserted: !!r.inserted, explicit: !!r.explicit, hasRules: !!r.hasRules };
}

// next:1025-1028 等效：返回下一有效步下标，越界返回 'finish'
function nextIndex(steps, index, data) {  var i = index;
  if (i >= steps.length - 1) return 'finish';
  i++;
  while (i < steps.length && isSkipped(steps[i], data)) i++;
  if (i >= steps.length) return 'finish';
  return i;
}

// ---------- 表单默认值 ----------

function fieldFallback(f, isAttr, d) {
  var init = (d && d.init != null) ? d.init : f.default;
  var min = (d && d.min != null) ? d.min : f.min;
  return (init != null) ? init : (isAttr && min != null ? min : '');
}

// P23·①：输入框显示值 —— 只在「没填过」（null / undefined）时回落默认值。
//   玩家显式清空（''）必须显示空，否则删掉默认数字的瞬间它就弹回来了（RG-1）。
//   A2：d 是该属性的统一定义（card.attributes 优先），不传时退回字段自身。
function shownValue(f, val, isAttr, d) {
  return (val != null) ? val : fieldFallback(f, isAttr, d);
}

// renderForm:756-763 等效：把 fallback 同步进 data（用户没动过输入框时也有值）。
// P23·①：判据由「null / 空串」收紧为「null」——空串是玩家清空的动作，不是「没填过」；
//   继续按 fallback 回填会让「清空 → 默认值」在切步/重渲染时反复发生（RG-1）。
function syncDefaults(step, data, isAttr, dmap) {
  (step.fields || []).forEach(function (f) {
    var d = dmap ? (dmap[f.key] || null) : null;
    var fb = fieldFallback(f, isAttr, d);
    if (data[f.key] == null && fb !== '' && fb != null) {
      data[f.key] = fb;
    }
  });
  return data;
}

// 数值夹取（对齐 onNumberBlur:800-817 / validateCurrent 的 number 分支）
function clampNumber(v, min, max) {
  if (typeof v !== 'number' || isNaN(v)) return v;
  var c = v;
  if (min != null && c < min) c = min;
  if (max != null && c > max) c = max;
  return c;
}

// ---------- 校验（返回错误码，文案由视图层给）----------

// P67 问卷：答案存在 data['__picks_' + quizId]（按题序的 outcomeId 数组）
function _quiz() {
  return (typeof CreationQuiz !== 'undefined' && CreationQuiz) ? CreationQuiz : null;
}

function quizDefs(step) {
  var Q = _quiz();
  if (!Q || !step) return [];
  return Q.normalize(step.quizzes);
}

function quizPicks(data, quizId) {
  var v = data && data['__picks_' + quizId];
  return Array.isArray(v) ? v : [];
}

function setQuizPick(data, quizId, qi, outcome) {
  var arr = quizPicks(data, quizId).slice();
  while (arr.length < qi) arr.push('');
  arr[qi] = outcome;
  if (data) data['__picks_' + quizId] = arr;
  return arr;
}

// 玩家自写答案（原话）：{ qi: '文本' }；只用来判断「这题算不算答过」，不投票
function quizCustoms(data, quizId) {
  var v = data && data['__custom_' + quizId];
  return (v && typeof v === 'object') ? v : {};
}

function quizMissing(step, data) {
  var defs = quizDefs(step);
  var miss = 0;
  defs.forEach(function (q) {
    var Q = _quiz();
    if (Q && typeof Q.missing === 'function') {
      miss += Q.missing(q, quizPicks(data, q.id), quizCustoms(data, q.id));
      return;
    }
    var picks = quizPicks(data, q.id);
    q.questions.forEach(function (item, qi) { if (!picks[qi]) miss++; });
  });
  return miss;
}

function quizResults(step, data) {
  var Q = _quiz();
  if (!Q) return [];
  var defs = quizDefs(step);
  var picks = {};
  var customs = {};
  defs.forEach(function (q) {
    picks[q.id] = quizPicks(data, q.id);
    customs[q.id] = quizCustoms(data, q.id);
  });
  return Q.scoreAll(defs, picks, customs);
}

function validateStep(card, step, data) {
  if (!step) return { ok: true };
  // C4：技能步骤的提交合法性（与桌面 validateCurrent 的 skills 分支同口径）
  if (step.type === 'skills') {
    var s = SF();
    if (!s) return { ok: false, code: 'SKILL_MODULE', message: '技能数值模块未加载，无法校验技能分配' };
    var plan = s.planStep(card, step, s.attrsOf(card, data), (data && data.__skillAlloc) || {});
    var orphans = plan.orphans || [];
    if (orphans.length) {
      return {
        ok: false, code: 'SKILL_ORPHAN',
        message: '有 ' + orphans.length + ' 个技能已不在当前卡带中（' + orphans.map(function (o) { return o.id; }).join('、') + '）\n请先移除再继续'
      };
    }
    if (!plan.submitOk) {
      var errs = plan.errors || [];
      var under = errs.filter(function (e) { return e.code === 'E_SKILL_UNDER_BUDGET'; })[0];
      if (under) {
        return {
          ok: false, code: 'SKILL_UNDER',
          a: plan.status ? plan.status.allocated : 0,
          total: plan.budget ? plan.budget.total : 0,
          message: '技能点还没分配完（已分配 ' + (plan.status ? plan.status.allocated : 0) + ' / ' + (plan.budget ? plan.budget.total : 0) + '）\n请继续分配'
        };
      }
      var e0 = errs[0];
      return {
        ok: false, code: (e0 && e0.code) || 'SKILL_INVALID',
        message: (e0 ? e0.message : '技能分配还不合法') + (e0 && e0.path ? '（' + e0.path + '）' : '')
      };
    }
    return { ok: true };
  }
  if (step.type === 'form') {
    // 1) number 先 clamp 回 [min,max]（validateCurrent:990-1000）
    //    A2：属性步的上下限取统一定义（card.attributes 权威），字段值只兜底
    var dmapV = isAttrStep(step) ? defMapOf(card, step) : null;
    (step.fields || []).forEach(function (f) {
      if (f.type !== 'number') return;
      var d = dmapV ? (dmapV[f.key] || null) : null;
      var mn = (d && d.min != null) ? d.min : f.min;
      var mx = (d && d.max != null) ? d.max : f.max;
      var v = data[f.key];
      if (typeof v === 'number' && !isNaN(v)) data[f.key] = clampNumber(v, mn, mx);
    });
    // 2) required 缺值（:1001-1003）
    for (var i = 0; i < (step.fields || []).length; i++) {
      var f = step.fields[i];
      if (f.required && (data[f.key] == null || data[f.key] === '')) {
        return { ok: false, code: 'REQUIRED', label: f.label };
      }
    }
    // 3) 属性池两条（:1004-1011）
    var pool = poolOf(card, step);
    if (pool) {
      var a = calcAllocated(card, step, data, pool);
      if (a > pool.total) return { ok: false, code: 'POOL_OVER', a: a, total: pool.total };
      if (a < pool.total) return { ok: false, code: 'POOL_UNDER', a: a, total: pool.total };
    }
  } else if (step.type === 'select') {
    var k = step.key || step.id;
    if (!data[k]) return { ok: false, code: 'SELECT_REQUIRED' };
  } else if (step.type === 'quiz') {
    // P67：问卷必须每题都选（判卷在引擎侧，视图只负责收答案）
    var miss = quizMissing(step, data);
    if (miss > 0) return { ok: false, code: 'QUIZ_MISS', miss: miss };
  } else if (step.type === 'multi-select') {
    var k2 = step.key || step.id;
    var cur = data[k2] || [];
    var min = step.min != null ? step.min : 0;
    if (cur.length < min) return { ok: false, code: 'MULTI_MIN', min: min };
  }
  return { ok: true };
}

// toggleMulti:980-986 等效
function toggleMulti(data, key, id, min, max) {
  var arr = (data[key] || []).slice();
  var idx = arr.indexOf(id);
  if (idx >= 0) arr.splice(idx, 1);
  else {
    if (arr.length >= max) return { ok: false, code: 'MULTI_MAX', max: max };
    arr.push(id);
  }
  data[key] = arr;
  return { ok: true };
}

// ---------- 汇总（renderSummary:956-978）----------

function summaryEntries(card, data) {
  var lm = {}, om = {};
  // A2：属性名取统一定义（card.attributes 权威），字段 label 只在没有属性名时兜底
  defsOf(card, null).forEach(function (d) {
    var nm = d.name || d.bare || d.key;
    lm[d.key] = nm;
    if (d.bare) lm[d.bare] = nm;
  });
  (card && card.steps || []).forEach(function (step) {
    (step.fields || []).forEach(function (f) {
      if (!lm[f.key]) lm[f.key] = f.label || f.key;
      if (f.type === 'choice') (f.options || []).forEach(function (o) {
        om[f.key + '.' + o.id] = o.label || o.name || o.id;
      });
    });
    var key = step.key || step.id;
    if (step.options) {
      if (!lm[key]) lm[key] = step.title || key;
      (step.options || []).forEach(function (o) { om[key + '.' + o.id] = o.name || o.label || o.id; });
    }
  });
  var quizRows = [];
  (card && card.steps || []).forEach(function (step) {
    if (!step || step.type !== 'quiz') return;
    quizResults(step, data).forEach(function (r) {
      if (r.answered !== r.total) return;
      quizRows.push({ k: r.resultName, v: r.name });
    });
  });
  var rows = Object.keys(data).filter(function (k) {
    return k.indexOf('__') !== 0; // P67：__picks_* / __quiz 不进摘要
  }).map(function (k) {
    var v = data[k];
    var l = lm[k] || k;
    if (Array.isArray(v)) v = v.map(function (x) { return om[k + '.' + x] || x; }).join('、');
    else if (typeof v === 'string' && om[k + '.' + v]) v = om[k + '.' + v];
    return { k: l, v: String(v) };
  });
  return quizRows.concat(rows);
}

// ---------- 草稿（_draftKey/_peekDraft/_saveDraft/_clearDraft）----------

function draftKey(cardId, saveId) {
  var cid = cardId || '';
  var sid = saveId || '';
  if (!cid || !sid) return null;
  return '/saves/' + cid + '/' + sid + '/draft.json';
}

function peekDraft(cardId, saveId, nowMs) {
  var v = _vfs();
  if (!v) return null;
  try {
    var p = draftKey(cardId, saveId);
    if (!p) return null;
    var d = v.readJSON(p);
    if (!d || !d.data) return null;
    if (d.ts && _now(nowMs) - d.ts > DRAFT_TTL_MS) { clearDraft(cardId, saveId); return null; }
    return d;
  } catch (e) { return null; }
}

function saveDraft(cardId, saveId, index, data, totalSteps, nowMs) {
  var v = _vfs();
  if (!v || !saveId) return;
  try {
    var p = draftKey(cardId, saveId);
    if (!p) return;
    v.writeJSON(p, {
      cardId: cardId,
      saveId: saveId,
      index: index,
      data: data,
      totalSteps: totalSteps,
      ts: _now(nowMs)
    });
  } catch (e) {}
}

function clearDraft(cardId, saveId) {
  var v = _vfs();
  if (!v) return;
  try {
    var p = draftKey(cardId, saveId);
    if (p) v.deleteFile(p);
  } catch (e) {}
}

// ---------- 完成（finish:1036-1038 的数据段）----------

function buildPlayerData(data, card) {
  var pd = JSON.parse(JSON.stringify(data || {}));
  // P67：问卷答案只是过程数据，不进存档
  Object.keys(pd).forEach(function (k) { if (k.indexOf('__picks_') === 0) delete pd[k]; });
  if (!pd.inventory) pd.inventory = { bar: [], common: [], story: [], rare: [] };
  // C4：临时分配只属于草稿，绝不能进 playerData（问卷结论 __quizFacts 是正式数据，保留）
  if ('__skillAlloc' in pd) delete pd.__skillAlloc;
  if (typeof Alias !== 'undefined' && Alias && Alias.normalize) Alias.normalize(pd);
  // P67：问卷结论落库（quiz_<id> / __quiz / __quizFacts），grants 叠加到属性
  var Q = _quiz();
  if (Q && card) {
    var qStep = (card.steps || []).filter(function (s) { return s && s.type === 'quiz'; })[0];
    if (qStep) {
      var results = quizResults(qStep, data);
      if (results.length) {
        var bonus = Q.apply(pd, results);
        Q.applyGrants(pd, bonus, card.attributes);
        pd.__quizFacts = Q.facts(results);
      }
    }
  }
  return pd;
}

// ---------- 续档：找同卡带内「未完成且有草稿」的档（对齐 continueSave 的 _peekDraft 续跑）----------

function findResumable(cardId, list, loadFn, nowMs) {
  var arr = list || [];
  for (var i = 0; i < arr.length; i++) {
    var sid = arr[i] && arr[i].saveId;
    if (!sid) continue;
    var d = peekDraft(cardId, sid, nowMs);
    if (!d || !d.data) continue;
    var loaded = null;
    try { loaded = loadFn(cardId, sid); } catch (e) { loaded = null; }
    var pd = loaded && loaded.player && loaded.player.playerData;
    if (!pd || !Object.keys(pd).length) return { saveId: sid, draft: d };
  }
  return null;
}

module.exports = {
  DRAFT_TTL_MS: DRAFT_TTL_MS,
  getPool: getPool,
  isAttrStep: isAttrStep,
  defsOf: defsOf,
  defMapOf: defMapOf,
  defWarningsOf: defWarningsOf,
  calcAllocated: calcAllocated,
  poolOf: poolOf,
  applyDestinyPick: applyDestinyPick,
  isSkipped: isSkipped,
  filterSteps: filterSteps,
  prepareSteps: prepareSteps,
  nextIndex: nextIndex,
  fieldFallback: fieldFallback,
  shownValue: shownValue,
  syncDefaults: syncDefaults,
  clampNumber: clampNumber,
  validateStep: validateStep,
  toggleMulti: toggleMulti,
  quizDefs: quizDefs,
  quizPicks: quizPicks,
  quizCustoms: quizCustoms,
  setQuizPick: setQuizPick,
  quizMissing: quizMissing,
  quizResults: quizResults,
  summaryEntries: summaryEntries,
  draftKey: draftKey,
  peekDraft: peekDraft,
  saveDraft: saveDraft,
  clearDraft: clearDraft,
  buildPlayerData: buildPlayerData,
  findResumable: findResumable
};
