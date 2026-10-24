// ============================================================
// 阶段 C3 · 技能编辑器共用逻辑（A 类纯逻辑，零 DOM / 零 RN）
// 职责：
//   1) 把 C1 的 SkillRules.validateCard / poolOf 结果统一成编辑器可渲染的
//      issues 列表（level / code / path / message），桌面与 RN 共用同一份。
//   2) 缺失数值规则统计、公式/数字输入判定、发行说明文案。
// 不改 C1/C2 语义：validateCard/poolOf 本身一行不动，这里只做「聚合 + 展示口径」。
//     其中 E_SKILL_ATTR（引用未声明属性）在编辑器里按用户决策降级为 warning，
//     但导入/诊断仍按 C1/C2 原样报 error —— 编辑器放宽显示，不放宽校验规则。
// ============================================================

(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.SkillEditorHelpers = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = 1;
  var EDITOR_DOWNGRADE = { E_SKILL_ATTR: true };   // 仅编辑器展示层降级

  function rules() {
    if (typeof SkillRules !== 'undefined' && SkillRules && typeof SkillRules.validateCard === 'function') return SkillRules;
    try { return require('./skill_rules.js'); } catch (e) { return null; }
  }

  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function clone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (e) { return null; } }

  function push(list, level, e) {
    if (!e || !e.code) return;
    var lv = level;
    if (e.code === 'E_SKILL_ATTR' && EDITOR_DOWNGRADE[e.code]) lv = 'warning';
    list.push({
      level: lv,
      code: e.code,
      path: e.path || '',
      message: e.message || '',
      field: e.field || null,
      attr: e.attr || null,
      skillId: e.skillId || null,
      cause: e.cause || null
    });
  }

  // opts.skills / opts.skillPool：编辑器内存里的未保存草稿（覆盖进克隆，不改原卡带）
  // opts.skillPool === null 表示「本次起草稿显式不带 skillPool」
  function validate(card, opts) {
    opts = opts || {};
    var R = rules();
    if (!R) {
      return {
        ok: false,
        issues: [{ level: 'error', code: 'E_SKILL_RULES', path: 'worldbook.skills', message: '数值规则模块未加载（skill_rules.js），无法做保存前检查' }],
        errorCount: 1, warningCount: 0
      };
    }
    var c = clone(card) || {};
    c.worldbook = c.worldbook || {};
    if (opts.skills !== undefined) c.worldbook.skills = clone(opts.skills);
    if (opts.skillPool !== undefined) {
      if (opts.skillPool == null) delete c.worldbook.skillPool;
      else c.worldbook.skillPool = clone(opts.skillPool);
    }

    var issues = [];
    var v = R.validateCard(c);
    (v.errors || []).forEach(function (e) { push(issues, 'error', e); });
    (v.warnings || []).forEach(function (e) { push(issues, 'warning', e); });

    var p = null;
    try { p = R.poolOf(c, null); } catch (e) { p = null; }
    if (p && p.ok === false) (p.errors || []).forEach(function (e) { push(issues, 'error', e); });

    // 步骤里也可能声明 pool（steps[].pool）；与 worldbook.skillPool 冲突时要报出来。
    // 与 CardValidator.auditSkillStats 的导入期口径一致，只借用 poolOf，不改 C1。
    (Array.isArray(c.steps) ? c.steps : []).forEach(function (st) {
      if (!st || !st.pool) return;
      var sp = null;
      try { sp = R.poolOf(c, st); } catch (e) { sp = null; }
      if (sp && sp.ok === false) {
        (sp.errors || []).forEach(function (e) {
          push(issues, 'error', { code: e.code, path: e.path, message: e.message + '（步骤 ' + (st.id || '未命名') + '）', field: e.field });
        });
      }
    });

    var errorCount = 0, warningCount = 0;
    issues.forEach(function (i) { if (i.level === 'error') errorCount++; else warningCount++; });
    return { ok: errorCount === 0, issues: issues, errorCount: errorCount, warningCount: warningCount };
  }

  function countMissingStat(skills) {
    var n = 0;
    (skills || []).forEach(function (s) { if (isObj(s) && s.stat == null) n++; });
    return n;
  }

  // 输入是「公式」还是「数字」：纯数字（可带正负号/小数）视为数字，其余非空按公式处理
  function looksFormula(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return false;
    return !/^-?\d+(\.\d+)?$/.test(s);
  }

  function toStatValue(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return undefined;                        // 空 = 删除该字段（用缺省值）
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s); // 数字
    return s;                                        // 公式字符串，交给 C1 校验
  }

  function formatIssue(it) {
    var head = '[' + it.code + '] ' + it.path;
    return head + ' — ' + it.message;
  }

  return {
    VERSION: VERSION,
    validate: validate,
    countMissingStat: countMissingStat,
    looksFormula: looksFormula,
    toStatValue: toStatValue,
    formatIssue: formatIssue
  };
});
