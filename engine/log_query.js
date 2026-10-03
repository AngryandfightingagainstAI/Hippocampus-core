// ============================================================
// P4 · 日志检索工具（AI 侧入口）
// A 类：零 DOM、零 RN API，Node 可直测。
//
// 背景：日志分两层——摘要（Logger.getRecentSummaries，注入 prompt）
//   与原文（Logger 的 fullText，按天累积）。摘要不够用时，AI 需要
//   一个能去搜原文的工具，这就是 query_log。
//
// 注册范式照 engine/dice_history.js 的 ToolExecutor.WHITELIST.query_dice_history。
// 时间闸门照 engine/npc_deduction_ai.js 的「date ≤ 当前游戏日」过滤。
// 返回结构照查询类工具：{ok:true, type:'query', queryType:'log', data:[...]}。
// 失败：{ok:false, reason:'...'}。
//
// 硬上限（防把 prompt 预算打爆：Logger.search 命中 fullText 时返回的是整条日志）：
//   片段 = 命中点前后各 80 字；每条日志 ≤3 段；≤3 条日志；总字符 ≤1200。
// ============================================================

(function () {
  'use strict';

  var LIMITS = {
    SNIPPET_PAD: 80,   // 命中点前后各 80 字
    SNIPPETS_PER_LOG: 3,
    LOGS: 3,
    CHARS: 1200
  };

  function pad(n) { return String(n).padStart(2, '0'); }

  function dateKey(d) {
    if (!d) return '?';
    return d.year + '-' + pad(d.month) + '-' + pad(d.day);
  }

  // 游戏内日期 → 可比较数字（与 vfs/logger.js 的 dateNum 同式）
  function dateNum(d) {
    if (!d) return 0;
    return (d.year || 0) * 10000 + (d.month || 0) * 100 + (d.day || 0);
  }

  // 解析 "YYYY-MM-DD" / "YYYY-M-D" / {year,month,day} → 数字；解析不了返回 null
  function parseDate(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'object') {
      var n = dateNum(v);
      return n || null;
    }
    var m = String(v).match(/(\d{1,4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (!m) return null;
    return dateNum({ year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10) });
  }

  // 取最多 n 段「命中点前后各 pad 字」的片段
  function snippetsOf(text, keyword, n, padLen) {
    var out = [];
    if (!text) return out;
    var hay = String(text);
    var low = hay.toLowerCase();
    var kw = String(keyword).toLowerCase();
    if (!kw) return out;
    var from = 0;
    while (out.length < n) {
      var i = low.indexOf(kw, from);
      if (i < 0) break;
      var s = Math.max(0, i - padLen);
      var e = Math.min(hay.length, i + kw.length + padLen);
      var piece = hay.slice(s, e);
      if (s > 0) piece = '…' + piece;
      if (e < hay.length) piece = piece + '…';
      out.push(piece);
      from = e; // 避免重叠
    }
    return out;
  }

  var LogQuery = {
    LIMITS: LIMITS,

    run: function (a) {
      a = a || {};
      var kw = String(a.keyword == null ? '' : a.keyword).trim();
      if (!kw) return { ok: false, reason: 'keyword 为空' };
      if (typeof Logger === 'undefined' || !Logger || typeof Logger.search !== 'function') {
        return { ok: false, reason: '日志模块未加载' };
      }
      if (typeof GameState === 'undefined' || !GameState ||
          !GameState.currentCardId || !GameState.currentSaveId) {
        return { ok: false, reason: '未在游戏中' };
      }

      // 时间闸门：只保留 date ≤ 当前游戏日 的日志（当前游戏日未知时不过滤）
      var cur = GameState._gameTime ? dateNum(GameState._gameTime) : null;
      var fromD = parseDate(a.from);
      var toD = parseDate(a.to);

      var limit = parseInt(a.limit, 10);
      if (!(limit > 0)) limit = LIMITS.LOGS;
      if (limit > LIMITS.LOGS) limit = LIMITS.LOGS;

      var cands = Logger.search(GameState.currentCardId, GameState.currentSaveId, kw) || [];
      var eligible = 0;
      var kept = [];
      for (var i = 0; i < cands.length; i++) {
        var l = cands[i];
        var d = dateNum(l.gameDate);
        if (cur != null && d > cur) continue;
        if (fromD != null && d < fromD) continue;
        if (toD != null && d > toD) continue;
        eligible++;
        if (kept.length < limit) kept.push(l);
      }

      var truncated = false;
      var total = 0;
      var data = [];
      for (var k = 0; k < kept.length; k++) {
        var log = kept[k];
        var dk = dateKey(log.gameDate);
        var title = log.title || '';
        var summary = log.summary || '';
        var hits = snippetsOf(log.fullText, kw, LIMITS.SNIPPETS_PER_LOG, LIMITS.SNIPPET_PAD);
        // fullText 里没有命中点（只是标题/摘要/实体命中）⇒ 用摘要当片段，别返回空
        if (!hits.length && summary) hits = [summary.length > 200 ? summary.slice(0, 200) + '…' : summary];

        var entry = { date: dk, title: title, summary: summary, hits: hits };

        // 预算：标题 + 摘要 + 片段总字符 ≤ LIMITS.CHARS
        var cost = title.length + summary.length;
        for (var h = 0; h < hits.length; h++) cost += hits[h].length;
        if (total + cost > LIMITS.CHARS) {
          // 逐段砍到装得下；一段都装不下就整条丢
          var room = LIMITS.CHARS - total - title.length - summary.length;
          if (room <= 0) { truncated = true; break; }
          var trimmedHits = [];
          for (var h2 = 0; h2 < hits.length; h2++) {
            if (hits[h2].length <= room) { trimmedHits.push(hits[h2]); room -= hits[h2].length; }
            else if (room > 20) { trimmedHits.push(hits[h2].slice(0, room) + '…'); room = 0; }
            else break;
          }
          if (!trimmedHits.length) { truncated = true; break; }
          entry.hits = trimmedHits;
          truncated = true;
          total += title.length + summary.length;
          for (var h3 = 0; h3 < trimmedHits.length; h3++) total += trimmedHits[h3].length;
          data.push(entry);
          break;
        }
        total += cost;
        data.push(entry);
      }
      if (kept.length < eligible) truncated = true;

      return {
        ok: true, type: 'query', queryType: 'log',
        data: data,
        truncated: truncated
      };
    }
  };

  // 自注册（ToolExecutor 由 bootstrap 挂在全局；Node smoke 注入假件）
  if (typeof ToolExecutor !== 'undefined' && ToolExecutor && ToolExecutor.WHITELIST) {
    ToolExecutor.WHITELIST.query_log = {
      run: function (a) { return LogQuery.run(a); }
    };
  }

  if (typeof window !== 'undefined') window.LogQuery = LogQuery;
  if (typeof module !== 'undefined' && module.exports) module.exports = LogQuery;
})();
