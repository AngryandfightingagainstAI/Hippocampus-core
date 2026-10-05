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

var DRAFT_TTL_MS = 7 * 24 * 3600 * 1000;

function _now(nowMs) { return nowMs != null ? nowMs : Date.now(); }
function _vfs() { return (typeof VFS !== 'undefined' && VFS) ? VFS : null; }

// ---------- 属性池 ----------

function getPool(card, step) {
  if (step && step.pool && step.pool.total != null) return step.pool;
  if (card && card.attributePool && card.attributePool.total != null) return card.attributePool;
  return null;
}

function isAttrStep(step) {
  if (!step || !step.fields || !step.fields.length) return false;
  var allNumber = step.fields.every(function (f) { return f.type === 'number'; });
  var allAttrKey = step.fields.every(function (f) { return f.key && String(f.key).indexOf('attr_') === 0; });
  return allNumber || allAttrKey;
}

function calcAllocated(step, data, pool) {
  if (!pool) return 0;
  var base = pool.base != null ? pool.base : 0;
  var total = 0;
  (step.fields || []).forEach(function (f) {
    var v = data[f.key];
    if (typeof v !== 'number' || isNaN(v)) return;
    var fb = f.min != null ? f.min : base;
    total += Math.max(0, v - fb);
  });
  return total;
}

// 池条是否生效：有池 && 该步是属性步（与桌面 renderForm:745 一致）
function poolOf(card, step) {
  var pool = getPool(card, step);
  return (pool && isAttrStep(step)) ? pool : null;
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

// next:1025-1028 等效：返回下一有效步下标，越界返回 'finish'
function nextIndex(steps, index, data) {
  var i = index;
  if (i >= steps.length - 1) return 'finish';
  i++;
  while (i < steps.length && isSkipped(steps[i], data)) i++;
  if (i >= steps.length) return 'finish';
  return i;
}

// ---------- 表单默认值 ----------

function fieldFallback(f, isAttr) {
  return (f.default != null) ? f.default : (isAttr && f.min != null ? f.min : '');
}

// P23·①：输入框显示值 —— 只在「没填过」（null / undefined）时回落默认值。
//   玩家显式清空（''）必须显示空，否则删掉默认数字的瞬间它就弹回来了（RG-1）。
function shownValue(f, val, isAttr) {
  return (val != null) ? val : fieldFallback(f, isAttr);
}

// renderForm:756-763 等效：把 fallback 同步进 data（用户没动过输入框时也有值）。
// P23·①：判据由「null / 空串」收紧为「null」——空串是玩家清空的动作，不是「没填过」；
//   继续按 fallback 回填会让「清空 → 默认值」在切步/重渲染时反复发生（RG-1）。
function syncDefaults(step, data, isAttr) {
  (step.fields || []).forEach(function (f) {
    var fb = fieldFallback(f, isAttr);
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

function validateStep(card, step, data) {
  if (!step) return { ok: true };
  if (step.type === 'form') {
    // 1) number 先 clamp 回 [min,max]（validateCurrent:990-1000）
    (step.fields || []).forEach(function (f) {
      if (f.type !== 'number') return;
      var v = data[f.key];
      if (typeof v === 'number' && !isNaN(v)) data[f.key] = clampNumber(v, f.min, f.max);
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
      var a = calcAllocated(step, data, pool);
      if (a > pool.total) return { ok: false, code: 'POOL_OVER', a: a, total: pool.total };
      if (a < pool.total) return { ok: false, code: 'POOL_UNDER', a: a, total: pool.total };
    }
  } else if (step.type === 'select') {
    var k = step.key || step.id;
    if (!data[k]) return { ok: false, code: 'SELECT_REQUIRED' };
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
  (card && card.attributes || []).forEach(function (a) {
    lm['attr_' + a.key] = a.name || a.key;
    lm[a.key] = a.name || a.key;
  });
  (card && card.steps || []).forEach(function (step) {
    (step.fields || []).forEach(function (f) {
      lm[f.key] = f.label || f.key;
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
  return Object.keys(data).map(function (k) {
    var v = data[k];
    var l = lm[k] || k;
    if (Array.isArray(v)) v = v.map(function (x) { return om[k + '.' + x] || x; }).join('、');
    else if (typeof v === 'string' && om[k + '.' + v]) v = om[k + '.' + v];
    return { k: l, v: String(v) };
  });
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

function buildPlayerData(data) {
  var pd = JSON.parse(JSON.stringify(data || {}));
  if (!pd.inventory) pd.inventory = { bar: [], common: [], story: [], rare: [] };
  if (typeof Alias !== 'undefined' && Alias && Alias.normalize) Alias.normalize(pd);
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
  calcAllocated: calcAllocated,
  poolOf: poolOf,
  isSkipped: isSkipped,
  filterSteps: filterSteps,
  nextIndex: nextIndex,
  fieldFallback: fieldFallback,
  shownValue: shownValue,
  syncDefaults: syncDefaults,
  clampNumber: clampNumber,
  validateStep: validateStep,
  toggleMulti: toggleMulti,
  summaryEntries: summaryEntries,
  draftKey: draftKey,
  peekDraft: peekDraft,
  saveDraft: saveDraft,
  clearDraft: clearDraft,
  buildPlayerData: buildPlayerData,
  findResumable: findResumable
};
