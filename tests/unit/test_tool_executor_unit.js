// ============================================================
// 单元测试 · engine/core/tool_executor.js（P54·第15条）
// 该模块此前只有 tool_ready_smoke 的集成覆盖，没有针对「工具块解析 / 白名单分发 /
// 单次调用返回值」的单测。这里用最小假 GameState 夹住这些边界，特别是
// P10·B4 的超限块契约（不提取、不 strip、必须留可见信号 —— 不许静默）。
// 运行：node tests/unit/test_tool_executor_unit.js
// ============================================================
const H = require('./_harness.js');

function sb(over) {
  const actions = [];
  const hints = [];
  const s = H.makeSandbox(Object.assign({
    GameState: {
      currentCard: { worldbook: { npcs: [], mapNodes: {}, factions: [] } },
      currentState: { hud: [], sidebar: [], panels: {} },
      playerData: { inventory: { bar: [], common: [], story: [], rare: [] }, locationId: '' }
    },
    ErrorLog: {
      audit: function() { return true; },
      action: function(mod, msg) { actions.push({ mod: mod, msg: msg }); },
      error: function() {}, log: function() {}
    },
    Platform: { ui: { appendHint: function(t) { hints.push(t); }, renderTopbar: function() {}, renderSidebarExpanded: function() {} } }
  }, over || {}));
  s.__actions = actions;
  s.__hints = hints;
  H.load(s, 'engine/core/tool_executor.js');
  s.T = s.window.ToolExecutor;
  return s;
}

function toolBlock(obj) {
  return '<<<TOOL>>>' + JSON.stringify(obj) + '<<<END>>>';
}

// ============ T1–T5 · 工具块解析与清理 ============
H.run('T1-extract 抽出单块并 trim', function() {
  const s = sb();
  const out = s.T.extract('前言 ' + toolBlock({ name: 'query_player', args: {} }) + ' 后记');
  H.eq(out.length, 1, '块数');
  H.contains(out[0], 'query_player', '块内容');
});

H.run('T2-extract 多块按出现顺序返回', function() {
  const s = sb();
  const out = s.T.extract(toolBlock({ name: 'a' }) + '中间' + toolBlock({ name: 'b' }));
  H.eq(out.length, 2, '块数');
  H.contains(out[0], '"a"', '第一块');
  H.contains(out[1], '"b"', '第二块');
});

H.run('T3-空块被忽略，空输入返回空数组', function() {
  const s = sb();
  H.eq(s.T.extract('<<<TOOL>>><<<END>>>').length, 0, '空块');
  H.eq(s.T.extract('').length, 0, '空串');
  H.eq(s.T.extract(null).length, 0, 'null');
  H.eq(s.T.extract('没有工具块的正文').length, 0, '无块正文');
});

H.run('T4-超限块不提取但留可见信号（ErrorLog + 提示行）', function() {
  const s = sb();
  const big = '<<<TOOL>>>' + new Array(s.T.TOOL_BLOCK_LIMIT + 2).join('x') + '<<<END>>>';
  const out = s.T.extract(big);
  H.eq(out.length, 0, '超限块不执行');
  H.eq(s.T._lastOversize.length, 1, '记入 _lastOversize');
  H.ok(s.__actions.length >= 1, 'ErrorLog.action 有记录');
  H.ok(s.__hints.length >= 1, '提示行有输出');
  H.contains(s.__hints[0], '工具块过大', '提示文案');
});

H.run('T5-strip 删可提取块、保留超限块（与 extract 同一上限）', function() {
  const s = sb();
  const small = toolBlock({ name: 'query_player' });
  const big = '<<<TOOL>>>' + new Array(s.T.TOOL_BLOCK_LIMIT + 2).join('y') + '<<<END>>>';
  H.eq(s.T.strip('前' + small + '后'), '前后', '小块被删掉');
  const kept = s.T.strip('前' + big + '后');
  H.contains(kept, '<<<TOOL>>>', '超限块保留在正文里');
  H.eq(s.T.strip(''), '', '空串');
});

// ============ T6–T8 · 单次执行的分发 ============
H.run('T6-executeOne 坏 JSON → ok:false 且说明原因', function() {
  const s = sb();
  return s.T.executeOne('这不是 JSON').then(function(r) {
    H.eq(r.ok, false, 'ok');
    H.eq(r.reason, 'JSON 解析失败', 'reason');
    H.ok(s.T._failCount >= 1, '失败计数 +1');
  });
});

H.run('T7-executeOne 未知工具 → ok:false 且带工具名', function() {
  const s = sb();
  return s.T.executeOne(JSON.stringify({ name: 'no_such_tool', args: {} })).then(function(r) {
    H.eq(r.ok, false, 'ok');
    H.contains(r.reason, '未知工具', 'reason');
    H.contains(r.reason, 'no_such_tool', 'reason 带工具名');
  });
});

H.run('T8-executeOne query_player 命中白名单并返回玩家数据', function() {
  const s = sb();
  return s.T.executeOne(JSON.stringify({ name: 'query_player', args: {} })).then(function(r) {
    H.eq(r.ok, true, 'ok');
    H.eq(r.queryType, 'player', 'queryType');
    H.eq(r.data, s.GameState.playerData, 'data 指向 playerData');
    H.eq(s.T._failCount, 0, '成功重置失败计数');
  });
});

// ============ T9–T11 · 查询类参数校验 ============
H.run('T9-query_npc 未知 NPC → ok:false', function() {
  const s = sb();
  s.GameState.currentCard.worldbook.npcs = [{ id: 'npc_a', name: '阿甲' }];
  return s.T.executeOne(JSON.stringify({ name: 'query_npc', args: { id: 'npc_b' } })).then(function(r) {
    H.eq(r.ok, false, 'ok');
    H.eq(r.reason, 'NPC 不存在', 'reason');
  });
});

H.run('T10-query_npc 命中且无运行时数据时 runtime 为 null', function() {
  const s = sb();
  s.GameState.currentCard.worldbook.npcs = [{ id: 'npc_a', name: '阿甲', weight: 1 }];
  return s.T.executeOne(JSON.stringify({ name: 'query_npc', args: { id: 'npc_a' } })).then(function(r) {
    H.eq(r.ok, true, 'ok');
    H.eq(r.data.static.id, 'npc_a', 'static.id');
    H.eq(r.data.runtime, null, '无 NpcRuntime 时 runtime 为 null');
  });
});

H.run('T11-query_map 未知节点 → ok:false', function() {
  const s = sb();
  s.GameState.currentCard.worldbook.mapNodes = { a: { name: 'A' } };
  return s.T.executeOne(JSON.stringify({ name: 'query_map', args: { id: 'b' } })).then(function(r) {
    H.eq(r.ok, false, 'ok');
    H.eq(r.reason, '节点不存在', 'reason');
  });
});

// ============ T12–T15 · 移动与目的地 ============
H.run('T12-set_location 缺 locationId → ok:false', function() {
  const s = sb();
  return s.T.executeOne(JSON.stringify({ name: 'set_location', args: {} })).then(function(r) {
    H.eq(r.ok, false, 'ok');
    H.contains(r.reason, '缺少 locationId', 'reason');
  });
});

H.run('T13-set_location 地点不存在 → ok:false 且不改玩家位置', function() {
  const s = sb();
  s.GameState.currentCard.worldbook.mapNodes = { a: { name: 'A' } };
  s.GameState.playerData.locationId = 'a';
  return s.T.executeOne(JSON.stringify({ name: 'set_location', args: { locationId: 'z' } })).then(function(r) {
    H.eq(r.ok, false, 'ok');
    H.contains(r.reason, '地点不存在', 'reason');
    H.eq(s.GameState.playerData.locationId, 'a', '位置未被改动');
  });
});

H.run('T14-set_location 命中 → 更新玩家位置并回报标签', function() {
  const s = sb();
  s.GameState.currentCard.worldbook.mapNodes = { a: { name: 'A' }, b: { name: 'B' } };
  return s.T.executeOne(JSON.stringify({ name: 'set_location', args: { locationId: 'b' } })).then(function(r) {
    H.eq(r.ok, true, 'ok');
    H.eq(s.GameState.playerData.locationId, 'b', '位置已更新');
    H.contains(r.label, 'B', '标签带地名');
  });
});

H.run('T15-list_destinations 按 scope 过滤子节点', function() {
  const s = sb();
  s.GameState.currentCard.worldbook.mapNodes = {
    a: { name: 'A', parentId: null },
    b: { name: 'B', parentId: 'a' },
    c: { name: 'C', parentId: 'a' },
    d: { name: 'D', parentId: 'b' }
  };
  s.GameState.playerData.locationId = 'a';
  return s.T.executeOne(JSON.stringify({ name: 'list_destinations', args: { scope: 'children' } })).then(function(r) {
    H.eq(r.ok, true, 'ok');
    H.eq(r.data.length, 2, '子节点数');
    const ids = r.data.map(function(x) { return x.id; }).sort().join(',');
    H.eq(ids, 'b,c', '子节点 id');
  }).then(function() {
    return s.T.executeOne(JSON.stringify({ name: 'list_destinations', args: {} }));
  }).then(function(r) {
    H.eq(r.data.length, 4, 'scope=all 全量');
  });
});

// ============ T16–T18 · 背包、分段与批量 ============
H.run('T16-add_item / remove_item 往返', function() {
  const s = sb();
  function flat() {
    const inv = s.GameState.playerData.inventory;
    return [].concat(inv.bar || [], inv.common || [], inv.story || [], inv.rare || []).map(function(it) {
      return typeof it === 'string' ? it : (it && it.name);
    });
  }
  return s.T.executeOne(JSON.stringify({ name: 'add_item', args: { category: 'common', name: '匕首', desc: '短刃' } }))
    .then(function(r) {
      H.eq(r.ok, true, 'add ok');
      H.ok(flat().indexOf('匕首') >= 0, '已入包');
      return s.T.executeOne(JSON.stringify({ name: 'remove_item', args: { name: '匕首' } }));
    })
    .then(function(r) {
      H.eq(r.ok, true, 'remove ok');
      H.eq(flat().indexOf('匕首'), -1, '已出包');
    });
});

H.run('T17-_findSeg 区间边界（左闭右闭，越界 null）', function() {
  const s = sb();
  const segs = [{ min: 0, max: 9 }, { min: 10, max: 19 }];
  H.eq(s.T._findSeg(segs, 0).min, 0, '下界含');
  H.eq(s.T._findSeg(segs, 9).min, 0, '上界含');
  H.eq(s.T._findSeg(segs, 10).min, 10, '下一段下界');
  H.eq(s.T._findSeg(segs, -1), null, '低于全部');
  H.eq(s.T._findSeg(segs, 99), null, '高于全部');
  H.eq(s.T._findSeg([], 1), null, '空表');
});

H.run('T18-executeAll 保持顺序，formatForHistory 不抛', function() {
  const s = sb();
  const list = [
    JSON.stringify({ name: 'query_player', args: {} }),
    '这不是 JSON',
    JSON.stringify({ name: 'query_map', args: { id: 'z' } })
  ];
  return s.T.executeAll(list).then(function(out) {
    H.eq(out.length, 3, '结果数');
    H.eq(out[0].ok, true, '第 1 条成功');
    H.eq(out[1].ok, false, '第 2 条失败');
    H.eq(out[2].ok, false, '第 3 条失败');
    const text = H.noThrow(function() { return s.T.formatForHistory(out); }, 'formatForHistory');
    H.eq(typeof text, 'string', '返回字符串');
    H.ok(text.length > 0, '非空');
  });
});

H.finish();
