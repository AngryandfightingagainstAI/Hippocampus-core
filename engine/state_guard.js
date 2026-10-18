// ============================================================
// 核心层 · StateGuard（P66 用户 m14969「别完全依赖 AI 自觉」的第三步）
// 回合前后给引擎状态拍快照、逐项 diff、必要时回滚。
//
// 为什么需要它：工具的写入由 AI 发起的调用驱动，工具自己失败时可能已经改了一半
// （`ToolExecutor.executeOne` 里 set 完再校验、或第二个工具抛错时第一个已落库）。
// 过去这种「半截写入」只体现在界面上，没有任何一处会把它回滚，也不会告诉 AI
// 「你以为改成功了，其实没改」。
//
// 口径：
//   · 只看 `GameState.currentState`（hud / sidebar / panels），这是卡带给玩家看的
//     那份数值，也是工具 set 的目标；chatHistory、时间、token 不在此列。
//   · diff 只数叶子标量（数字/字符串/布尔），最多收集 MAX_ITEMS 条给人看。
//   · `guard()` 的硬规则只有一条：**状态变了，但一个工具都没成功** ⇒ 回滚。
//     （有成功的工具时不做判断——多工具叠加里前进一半是正常业务，不该被回滚。）
//   · 没有 currentState（未载档）时全部 API 安全返回，不抛。
// ============================================================

var StateGuard = (function () {
  var MAX_ITEMS = 24;

  function _state() {
    try {
      if (typeof GameState === 'undefined' || !GameState) return null;
      return GameState.currentState || null;
    } catch (e) { return null; }
  }

  function _clone(v) {
    if (v == null) return null;
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return null; }
  }

  // 拍快照：没有状态时返回 null（调用方据此跳过检查，而不是当成「空状态」）
  function snapshot() {
    var st = _state();
    if (!st) return null;
    return { v: 1, ts: Date.now(), state: _clone(st) };
  }

  // 扁平化：{'hud.hp': 80, 'panels.p2.entries.0.current': 3, ...}
  function flatten(st, out, prefix) {
    out = out || {};
    prefix = prefix || '';
    if (st == null) return out;
    if (Array.isArray(st)) {
      for (var i = 0; i < st.length; i++) flatten(st[i], out, prefix + '.' + i);
      return out;
    }
    if (typeof st !== 'object') { out[prefix] = st; return out; }
    var keys = Object.keys(st);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      // 这三类不是玩家状态：id/name/icon/text 之类描述字段只在结构变化时动，
      // 数进来会把「卡带改名」也当数值变化，反而误报。
      if (/^(id|name|icon|label|type|desc|num|key|unit)$/.test(key)) continue;
      flatten(st[key], out, prefix + '.' + key);
    }
    return out;
  }

  // diff：返回 {changed, items:[{path,before,after}]}
  function diff(beforeState, afterState) {
    var res = { changed: 0, items: [] };
    var a = flatten(beforeState || null, {}, '');
    var b = flatten(afterState || null, {}, '');
    var seen = {};
    var keys = Object.keys(a).concat(Object.keys(b));
    for (var i = 0; i < keys.length; i++) {
      var p = keys[i];
      if (seen[p]) continue;
      seen[p] = 1;
      if (a[p] === b[p]) continue;
      // 结构新增/删除也算变化，但只在两边都缺一侧时计一次
      res.changed++;
      if (res.items.length < MAX_ITEMS) {
        res.items.push({ path: p.replace(/^\./, ''), before: a[p], after: b[p] });
      }
    }
    return res;
  }

  function restore(snap) {
    if (!snap || !snap.state) return false;
    try {
      if (typeof GameState === 'undefined' || !GameState) return false;
      GameState.currentState = _clone(snap.state);
      return true;
    } catch (e) { return false; }
  }

  // 守卫结论（纯函数式：给 before/after 快照 + 工具结果，返回该不该回滚）
  function verdict(beforeSnap, afterSnap, results) {
    var list = results || [];
    var ok = 0, fail = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].ok) ok++; else fail++;
    }
    var d = (beforeSnap && afterSnap) ? diff(beforeSnap.state, afterSnap.state) : { changed: 0, items: [] };
    // 硬规则：状态变了、却没有任何工具成功 ⇒ 一定是错的写入（工具半截失败或串了）
    var rollback = d.changed > 0 && ok === 0 && list.length > 0;
    return {
      changed: d.changed, items: d.items, ok: ok, fail: fail,
      rollback: rollback,
      reason: rollback ? ('本次 ' + list.length + ' 个工具全部失败，却改动了 ' + d.changed + ' 项状态') : ''
    };
  }

  // 给「关键词自检」用的一行引擎实测事实（没有变化也要说话，方便 AI 判断要不要补工具）
  function factsLine(v) {
    if (!v) return '';
    var s = '引擎实测：本回合工具成功 ' + v.ok + ' 个、失败 ' + v.fail + ' 个，关键数值变化 ' + v.changed + ' 项';
    if (v.rollback) s += '（全部失败却检测到写入，已自动回滚）';
    else if (v.changed > 0 && v.items.length) {
      s += '：' + v.items.slice(0, 3).map(function (it) {
        return it.path + ' ' + String(it.before) + '→' + String(it.after);
      }).join('，');
    }
    return s + '。';
  }

  return {
    snapshot: snapshot, diff: diff, restore: restore, verdict: verdict,
    factsLine: factsLine, flatten: flatten, MAX_ITEMS: MAX_ITEMS
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = StateGuard;
if (typeof window !== 'undefined') window.StateGuard = StateGuard;
