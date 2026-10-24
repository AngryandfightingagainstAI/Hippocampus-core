/**
 * 技能数值视图模型（C5-1）
 * ------------------------------------------------------------------
 * 只读：把 card.worldbook.skills[] 与 playerData.skillStats 整理成
 * 面板/提示词共用的行数据。**不做技能计算**（不重算 init/bonus/value）、
 * 不做规则校验、不写存档——数值一律取 C4 已落盘的字段。
 *
 * 数据契约（C1–C4）：
 *   playerData.skillStats = { "<skillId>": { init, bonus, alloc, value } }
 *   card.worldbook.skills[] = [{ id, name, stat?: { init, bonus, min, max, attrs } }]
 *
 * 纯逻辑：零 DOM、零 RN 依赖，桌面与 RN 共用同一份实现。
 */
(function (factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SkillView = api;
  if (typeof globalThis !== 'undefined') globalThis.SkillView = api;
})(function () {
  'use strict';

  var VERSION = 1;
  var PROMPT_MAX_ITEMS = 8;
  var PROMPT_MAX_CHARS = 240;

  function isObj(v) {
    return v != null && typeof v === 'object' && !Array.isArray(v);
  }

  function num(v) {
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  }

  function text(v) {
    return (v == null) ? '' : String(v);
  }

  /** 卡带里"有数值规则"的技能目录（只认 stat 为对象的条目，保持卡带顺序） */
  function catalog(card) {
    var wb = (isObj(card) && isObj(card.worldbook)) ? card.worldbook : {};
    var skills = Array.isArray(wb.skills) ? wb.skills : [];
    var out = [];
    var seen = {};
    skills.forEach(function (sk) {
      if (!isObj(sk) || !isObj(sk.stat)) return;
      var id = text(sk.id).trim();
      if (!id || seen[id]) return;
      seen[id] = true;
      out.push({
        id: id,
        name: text(sk.name).trim() || id,
        min: num(sk.stat.min),
        max: num(sk.stat.max),
        order: out.length
      });
    });
    return out;
  }

  function hasRules(card) {
    if (catalog(card).length) return true;
    var wb = (isObj(card) && isObj(card.worldbook)) ? card.worldbook : {};
    return isObj(wb.skillPool);
  }

  function statsOf(playerData) {
    if (!isObj(playerData)) return null;
    return isObj(playerData.skillStats) ? playerData.skillStats : null;
  }

  function makeRow(c, s, orphan) {
    var value = num(s && s.value);
    return {
      id: c ? c.id : text(s && s.id),
      name: c ? c.name : (text(s && s.name).trim() || text(s && s.id) || '（未知技能）'),
      init: num(s && s.init),
      bonus: num(s && s.bonus),
      alloc: num(s && s.alloc),
      value: value,
      min: c ? c.min : null,
      max: c ? c.max : null,
      orphan: !!orphan,
      hasValue: value != null,
      order: c ? c.order : 0
    };
  }

  /**
   * rows(card, playerData) -> {
   *   state: 'no-rules' | 'no-stats' | 'ok',
   *   rows:  [ { id, name, init, bonus, alloc, value, min, max, orphan, hasValue } ],
   *   total, orphanCount, hasStats
   * }
   * - no-rules：卡带没有任何技能数值规则 → 面板不渲染该段
   * - no-stats：卡带有规则但存档没有 skillStats（旧档）→ 显示"本档无技能数值"，不补算
   * - ok：按卡带顺序列出有 skillStats 的技能，孤立 id 排在最后
   */
  function rows(card, playerData) {
    var cat = catalog(card);
    var ss = statsOf(playerData);
    if (!cat.length) {
      return { state: 'no-rules', rows: [], total: 0, orphanCount: 0, hasStats: !!ss };
    }
    if (!ss) {
      return { state: 'no-stats', rows: [], total: 0, orphanCount: 0, hasStats: false };
    }
    var byId = {};
    cat.forEach(function (c) { byId[c.id] = c; });
    var list = [];
    cat.forEach(function (c) {
      var s = ss[c.id];
      if (!isObj(s)) return;      // 旧档局部缺失：不凭空造 0，跳过该行
      list.push(makeRow(c, s, false));
    });
    Object.keys(ss).forEach(function (id) {
      if (byId[id]) return;
      var s = ss[id];
      if (!isObj(s)) return;
      var r = makeRow(null, s, true);
      r.id = id;
      // 旧档里孤立条目可能没存 name：至少用 id 标识，避免面板出现空行
      if (!r.name || r.name === '（未知技能）') r.name = id;
      r.order = 10000 + list.length;
      list.push(r);
    });
    return {
      state: 'ok',
      rows: list,
      total: list.length,
      orphanCount: list.filter(function (r) { return r.orphan; }).length,
      hasStats: true
    };
  }

  /** 面板右栏：值 / 上限（无上限只显示值） */
  function valueText(r) {
    if (!r) return '—';
    if (r.orphan) return '—';
    if (!r.hasValue) return '—';
    if (r.max == null) return String(r.value) + '（无上限）';
    return r.value + '/' + r.max;
  }

  /** 面板次行：初始 / 加成 / 分配；失效项给原因 */
  function detailText(r) {
    if (!r) return '';
    if (r.orphan) return '已不在当前卡带中（失效）';
    return '初始 ' + (r.init == null ? '—' : r.init)
      + ' · 加成 ' + (r.bonus == null ? '—' : r.bonus)
      + ' · 分配 ' + (r.alloc == null ? '—' : r.alloc);
  }

  /** 旧档提示文案（面板统一用这一句） */
  function noStatsText() {
    return '本档无技能数值（旧存档未记录，不会补算）';
  }

  function clip(s, max) {
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)) + '…';
  }

  function promptItem(r) {
    var v = r.hasValue ? String(r.value) : '—';
    var tail = (r.max == null) ? (r.hasValue ? '（无上限）' : '') : ('/' + r.max);
    return r.name + ' ' + v + tail;
  }

  /**
   * promptLine(card, playerData, opts) -> string（无内容返回 ''）
   * - 只取有效技能（排除孤立 id、排除无 value 的残缺条目）
   * - 按 value 降序，最多 8 项
   * - 总长 ≤ 240 字；超出时减少条目并注明"另有 N 项未列出"
   */
  function promptLine(card, playerData, opts) {
    var o = isObj(opts) ? opts : {};
    var maxItems = (typeof o.maxItems === 'number' && o.maxItems > 0) ? Math.floor(o.maxItems) : PROMPT_MAX_ITEMS;
    var maxChars = (typeof o.maxChars === 'number' && o.maxChars > 0) ? Math.floor(o.maxChars) : PROMPT_MAX_CHARS;
    var v = rows(card, playerData);
    if (v.state !== 'ok') return '';
    var list = v.rows.filter(function (r) { return !r.orphan && r.hasValue; });
    if (!list.length) return '';
    list.sort(function (a, b) { return b.value - a.value; });

    var head = '· 技能（摘要，共 ' + list.length + ' 项）：';
    var note = '（未列出的技能不代表不存在）';
    var shown = Math.min(list.length, maxItems);
    for (; shown >= 0; shown--) {
      var parts = list.slice(0, shown).map(promptItem);
      var omitted = list.length - shown;
      var line = head + parts.join(' · ');
      if (omitted > 0) line += ' · 另有 ' + omitted + ' 项未列出' + note;
      if (line.length <= maxChars) return line;
    }
    // 极端情况：标题本身超长（卡带异常），退化为硬截断
    return clip(head + list[0].name, maxChars);
  }

  return {
    VERSION: VERSION,
    PROMPT_MAX_ITEMS: PROMPT_MAX_ITEMS,
    PROMPT_MAX_CHARS: PROMPT_MAX_CHARS,
    catalog: catalog,
    hasRules: hasRules,
    rows: rows,
    valueText: valueText,
    detailText: detailText,
    noStatsText: noStatsText,
    promptLine: promptLine
  };
});
