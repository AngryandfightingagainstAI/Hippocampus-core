// ============================================================
// 单元测试 · engine/proposal_validator.js（P54·第15条）
// 锁三件事：
//   1. P54·第14条的表驱动重构没掉规则（34 个 handler 齐全、空腹调用不抛）
//   2. P53·③ 两条 fail-open 路径（未知类型 / 自身异常）都留审计痕
//   3. 查表语义：id/name 命中、map 对象、onlyFind 无回落、全局子系统定论优先、
//      二级商店物品、关联条目、背包字符串/对象条目、hud+sidebar 共用规则体
// 运行：node tests/unit/test_proposal_validator_unit.js
// ============================================================
const H = require('./_harness.js');

// 34 个 handler（与 engine/proposal_validator.js 的 _handlers 一一对应）
const HANDLERS = [
  'modify_hud', 'modify_sidebar', 'modify_entry', 'modify_relation', 'add_item', 'remove_item',
  'trigger_event', 'ban_event', 'unban_event', 'add_task', 'complete_task', 'fail_task', 'abandon_task',
  'add_achievement', 'unlock_achievement', 'trigger_ending', 'enter_node', 'complete_node',
  'bury_foreshadow', 'reveal_foreshadow', 'add_keyword', 'npc_knows', 'npc_focus', 'npc_unfocus',
  'npc_follow', 'npc_unfollow', 'npc_reveal', 'update_status', 'update_status_bulk', 'set_inner_voice',
  'set_weather', 'open_shop', 'buy_item', 'sell_item'
];

function sb(over) {
  const audited = [];
  const s = H.makeSandbox(Object.assign({
    ErrorLog: {
      audit: function(mod, kind, detail) { audited.push({ mod: mod, kind: kind, detail: detail }); return true; },
      action: function() {}, error: function() {}, log: function() {}
    },
    GameState: {
      currentCard: { worldbook: { npcs: [], mapNodes: {}, events: [], tasks: [], achievements: [], endings: [], shops: [] } },
      currentState: { hud: [], sidebar: [], panels: {} },
      playerData: { inventory: { bar: [], common: [], story: [], rare: [] } }
    }
  }, over || {}));
  s.__audited = audited;
  H.load(s, 'engine/core/card_validator.js');
  H.load(s, 'engine/proposal_validator.js');
  s.V = s.window.ProposalValidator;
  return s;
}

// ============ U1–U3 · 入口与两条 fail-open 路径的审计痕 ============
H.run('U1-无 type-校验失败不放行', function() {
  const s = sb();
  H.eq(s.V.validate({ payload: {} }).ok, false, '缺 type 的 ok');
  H.eq(s.V.validate(null).ok, false, 'null 提议的 ok');
});

H.run('U2-未知类型-放行且留 unknown_op 审计（detail 只取前 3 个键名）', function() {
  const s = sb();
  const r = s.V.validate({ type: 'no_such_tool', payload: { a: 1, b: 2, c: 3, d: 4 } });
  H.eq(r.ok, true, '未知类型应放行');
  H.eq(s.__audited.length, 1, '审计条数');
  H.eq(s.__audited[0].mod, 'proposal_validator', '审计模块名');
  H.eq(s.__audited[0].kind, 'unknown_op:no_such_tool', '审计 kind');
  H.eq(s.__audited[0].detail, ' keys=a,b,c', '审计 detail（只取前 3 个键）');
});

H.run('U3-未知类型且无 payload-审计 detail 为（无详情）', function() {
  const s = sb();
  s.V.validate({ type: 'x_op' });
  H.eq(s.__audited[0].detail, '（无详情）', '审计 detail');
});

H.run('U4-校验器自身异常-不阻塞但留 crash 审计', function() {
  const s = sb();
  // 让背包分类的 getter 抛错 ⇒ _hasInventoryItem 抛 ⇒ validate 的 catch 兜住
  s.GameState.playerData = { inventory: {} };
  Object.defineProperty(s.GameState.playerData.inventory, 'bar', {
    get: function() { throw new Error('boom'); }, enumerable: true
  });
  const r = s.V.validate({ type: 'remove_item', payload: { name: '匕首' } });
  H.eq(r.ok, true, '异常仍放行');
  H.eq(s.__audited.length, 1, '审计条数');
  H.eq(s.__audited[0].kind, 'crash:remove_item', '审计 kind');
  H.contains(s.__audited[0].detail, 'boom', '审计 detail 带异常信息');
});

H.run('U5-ErrorLog 不可用-审计静默降级且不影响校验（契约）', function() {
  const s = sb({ ErrorLog: undefined });
  const r = s.V.validate({ type: 'no_such_tool', payload: {} });
  H.eq(r.ok, true, '放行');
  H.eq(s.V._audit('unknown_op', 'x', {}), false, '_audit 返回值');
});

// ============ U6–U8 · 表驱动重构的完备性 ============
H.run('U6-34 个 handler 齐全且都是函数（锁第 14 条重构）', function() {
  const s = sb();
  const keys = Object.keys(s.V._handlers);
  H.eq(keys.length, 34, 'handler 数量');
  HANDLERS.forEach(function(name) {
    H.eq(typeof s.V._handlers[name], 'function', name + ' 存在且是函数');
  });
});

H.run('U7-每个 handler 空腹调用都不抛且返回布尔 ok', function() {
  const s = sb();
  HANDLERS.forEach(function(name) {
    const r = s.V.validate({ type: name, payload: {} });
    H.eq(typeof r, 'object', name + ' 返回对象');
    H.eq(typeof r.ok, 'boolean', name + ' 的 ok 是布尔');
  });
});

H.run('U8-9 个 _has* 转发函数都在（表驱动的对外契约）', function() {
  const s = sb();
  ['_hasNpc', '_hasMapNode', '_hasEvent', '_hasTask', '_hasAchievement', '_hasEnding',
    '_hasNode', '_hasForeshadow', '_hasShop'].forEach(function(fn) {
    H.eq(typeof s.V[fn], 'function', fn + ' 存在');
  });
  H.eq(Object.keys(s.V._hasSpecs).length, 9, '_hasSpecs 声明表条目数');
});

// ============ U9–U13 · 查表语义 ============
H.run('U9-NPC 按 id 与 name 都能命中，未知返回 false', function() {
  const s = sb();
  s.GameState.currentCard.worldbook.npcs = [{ id: 'npc_a', name: '阿甲' }];
  H.eq(s.V._hasNpc('npc_a'), true, '按 id');
  H.eq(s.V._hasNpc('阿甲'), true, '按 name');
  H.eq(s.V._hasNpc('npc_b'), false, '未知 id');
  H.eq(s.V._hasNpc(''), false, '空 id');
  H.eq(s.V._hasNpc(null), false, 'null id');
});

H.run('U10-mapNode 走 id 为键的对象，不做数组回落', function() {
  const s = sb();
  s.GameState.currentCard.worldbook.mapNodes = { node_a: { name: 'A' } };
  H.eq(s.V._hasMapNode('node_a'), true, '命中的键');
  H.eq(s.V._hasMapNode('node_b'), false, '未知键');
});

H.run('U11-没有世界书/卡带时一律 false，不抛', function() {
  const s = sb();
  s.GameState.currentCard = null;
  H.eq(s.V._hasNpc('npc_a'), false, '无卡带按 NPC');
  H.eq(s.V._hasShopItem('shop_a', 'it1'), false, '无卡带按商店物品');
  H.eq(s.V._hasInventoryItem('匕首'), false, '空背包');
});

H.run('U12-全局子系统给"没有"的定论时不回落世界书（event 语义）', function() {
  const s = sb();
  s.GameState.currentCard.worldbook.events = [{ id: 'ev1' }];
  s.Events = { findDef: function(id) { return false; } };   // 全局定论：没有
  H.eq(s.V._hasEvent('ev1'), false, '全局 false 应为定论');
  s.Events = { findDef: function(id) { return id === 'ev1'; } };
  H.eq(s.V._hasEvent('ev1'), true, '全局命中');
  H.eq(s.V._hasEvent('ev9'), false, '全局未命中');
  s.Events = { findDef: '不是函数' };                        // 非函数 ⇒ 探测失败 ⇒ 回落世界书
  H.eq(s.V._hasEvent('ev1'), true, '非函数时不作定论，回落世界书');
});

H.run('U13-node/foreshadow 只有 onlyFind-没有世界书回落', function() {
  const s = sb();
  s.GameState.currentCard.worldbook.storyNodes = [{ id: 'n1' }];
  H.eq(s.V._hasNode('n1'), false, '无 StoryNodes 子系统 ⇒ false（不回落世界书）');
  s.StoryNodes = { findNode: function(id) { return id === 'n1' ? { id: 'n1' } : null; } };
  H.eq(s.V._hasNode('n1'), true, '子系统命中');
  H.eq(s.V._hasNode('n9'), false, '子系统未命中');
  s.StoryNodes = { findNode: function() { throw new Error('子系统坏了'); } };
  H.eq(s.V._hasNode('n1'), false, '子系统抛错 ⇒ 探测为 null ⇒ onlyFind ⇒ false');
});

H.run('U14-二级商店物品查找', function() {
  const s = sb();
  s.GameState.currentCard.worldbook.shops = [{ id: 'shop_a', items: [{ id: 'it1' }] }];
  H.eq(s.V._hasShopItem('shop_a', 'it1'), true, '命中');
  H.eq(s.V._hasShopItem('shop_a', 'it9'), false, '物品不存在');
  H.eq(s.V._hasShopItem('shop_x', 'it1'), false, '商店不存在');
  H.eq(s.V._hasShopItem('shop_a', ''), false, '空物品 id');
});

H.run('U15-数值项查找覆盖 hud/sidebar/panels 三处，hud 与 sidebar 共用规则体', function() {
  const s = sb();
  s.GameState.currentState.hud = [{ key: 'hp' }];
  s.GameState.currentState.sidebar = [{ key: 'mp' }];
  s.GameState.currentState.panels = { p1: { entries: [{ key: 'gold' }] } };
  H.eq(s.V._findStat('hp').key, 'hp', 'hud 命中');
  H.eq(s.V._findStat('mp').key, 'mp', 'sidebar 命中');
  H.eq(s.V._findStat('gold').key, 'gold', 'panels 命中');
  H.eq(s.V._findStat('nope'), null, '未知 key');
  H.eq(s.V.validate({ type: 'modify_hud', payload: { key: 'hp', delta: 1 } }).ok, true, 'modify_hud 命中');
  H.eq(s.V.validate({ type: 'modify_sidebar', payload: { key: 'hp', delta: 1 } }).ok, true, 'modify_sidebar 走同一条规则体');
  H.eq(s.V.validate({ type: 'modify_hud', payload: { key: 'nope', delta: 1 } }).ok, false, '未知 key 拦截');
  H.contains(s.V.validate({ type: 'modify_hud', payload: {} }).reason, '缺少 key', '缺 key 的提示');
});

H.run('U16-关联条目按 panels[*].entries 的 type=relation 匹配', function() {
  const s = sb();
  s.GameState.currentState.panels = {
    p1: { entries: [{ type: 'relation', from: '甲', to: '乙' }] },
    p2: { entries: [] }
  };
  H.eq(s.V._hasRelation('甲', '乙'), true, '命中');
  H.eq(s.V._hasRelation('乙', '甲'), false, '方向敏感');
  H.eq(s.V._hasRelation('甲', ''), false, '空 to');
});

H.run('U17-背包物品同时支持字符串与对象两种条目', function() {
  const s = sb();
  s.GameState.playerData.inventory = { bar: ['匕首'], common: [{ name: '剑' }], story: [], rare: [] };
  H.eq(s.V._hasInventoryItem('匕首'), true, '字符串条目');
  H.eq(s.V._hasInventoryItem('剑'), true, '对象条目');
  H.eq(s.V._hasInventoryItem('弓'), false, '不存在');
  H.eq(s.V.validate({ type: 'remove_item', payload: { name: '匕首' } }).ok, true, 'remove_item 命中放行');
  H.eq(s.V.validate({ type: 'remove_item', payload: { name: '弓' } }).ok, false, 'remove_item 未命中拦截');
});

H.finish();
