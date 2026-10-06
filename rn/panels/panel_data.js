// ============================================================
// 战役 4 · 批次 H4：六面板视图模型（A 类，零 React / 零 RN 依赖）
// RN 独有。六个 B 类面板组件的纯逻辑数据层：Node smoke 直接 require
// 本文件喂假 GameState 测三态（空 / 正常 / 缺字段），组件只渲染。
//
// 裁定 2：每个 compute 必须 try/catch 兜底——模块未装载、字段缺失、
// currentState.panels 为 undefined 一律返回空态对象，绝不抛。
//
// 空态文案逐字照桌面（ui_panels.js），中文标点不改。
// ============================================================

'use strict';

// ---------- 状态卡（桌面 ui_panels.js:14 renderStatusCardPanel）----------
// 空态主句：「本卡带未启用状态卡系统。」（ui_panels.js:17）
// P10·A9：副引导句逐字照桌面同段 <span>：「如需启用，请去 世界书编辑器 → 世界设定 里配置。」
function computeStatusCard() {
  var empty = {
    enabled: false, sections: [], fields: {}, gameTime: '',
    emptyText: '本卡带未启用状态卡系统。',
    subText: '如需启用，请去 世界书编辑器 → 世界设定 里配置。'
  };
  try {
    if (typeof StatusCard === 'undefined') return empty;
    if (!StatusCard.isEnabled()) return empty;
    var cfg = StatusCard.getConfig() || {};
    var sections = Array.isArray(cfg.sections) ? cfg.sections : [];
    var fields = {};
    try { fields = StatusCard.getAllFields() || {}; } catch (e) { fields = {}; }
    var gameTime = '';
    try { gameTime = GameState.formatGameTime() || ''; } catch (e) { gameTime = ''; }

    // 逐 section 预解析为可渲染行（桌面四种 type：time/fields/relation/innerVoice/custom）
    var resolved = [];
    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i] || {};
      if (sec.type === 'time') {
        var rows = [{ k: '游戏内', v: gameTime }];
        if (sec.showWeather) {
          var w = null;
          try { w = (typeof Weather !== 'undefined') ? Weather.getCurrent() : null; } catch (e) { w = null; }
          rows.push({ k: '天气', v: w ? (w.type || '') : '（未设置）' });
        }
        resolved.push({ type: 'time', title: '时间', rows: rows });
      } else if (sec.type === 'fields') {
        var keys = Array.isArray(sec.keys) ? sec.keys : [];
        if (!keys.length) continue;
        var labels = sec.labels || {};
        var frows = [];
        for (var j = 0; j < keys.length; j++) {
          var k = keys[j];
          var v = fields[k] || '';
          frows.push({ k: labels[k] || k, v: v || '（未设）' });
        }
        resolved.push({ type: 'fields', title: '场景', rows: frows });
      } else if (sec.type === 'relation') {
        var from = sec.from || 'player';
        var to = sec.to || '';
        var relEntry = null;
        try {
          var panels = (GameState.currentState && GameState.currentState.panels) || {};
          var pids = Object.keys(panels);
          for (var pi = 0; pi < pids.length && !relEntry; pi++) {
            var ents = panels[pids[pi]].entries || [];
            for (var ei = 0; ei < ents.length; ei++) {
              var e2 = ents[ei];
              if (e2 && e2.type === 'relation' && e2.from === from && e2.to === to) { relEntry = e2; break; }
            }
          }
        } catch (e) { relEntry = null; }
        var cur = relEntry && relEntry.current != null ? relEntry.current : 0;
        var min = relEntry && relEntry.min != null ? relEntry.min : -100;
        var max = relEntry && relEntry.max != null ? relEntry.max : 100;
        var pct = max > min ? Math.max(0, Math.min(100, ((cur - min) / (max - min)) * 100)) : 0;
        resolved.push({ type: 'relation', title: '关系 · ' + from + ' → ' + to, name: to, current: cur, pct: pct });
      } else if (sec.type === 'innerVoice') {
        var npcId = sec.npcId || '';
        var iv = '';
        try { iv = StatusCard.getInnerVoice(npcId) || ''; } catch (e) { iv = ''; }
        resolved.push({ type: 'innerVoice', title: npcId + ' 心声', text: iv || '（未记录）' });
      } else if (sec.type === 'custom') {
        resolved.push({ type: 'custom', title: sec.label || '自定义', text: sec.text || '' });
      }
    }
    if (!resolved.length) return { enabled: true, sections: [], fields: fields, gameTime: gameTime, emptyText: '（状态卡未配置任何 section）' };
    return { enabled: true, sections: resolved, fields: fields, gameTime: gameTime, emptyText: '' };
  } catch (e) {
    return empty;
  }
}

// ---------- 日志（桌面 ui_panels.js:519 renderLogPanel / :530 renderLogList）----------
// 空态：「还没有日志。」（ui_panels.js:531）；
// 搜索/清空按钮在 RN 侧由 LogPanel.js 自绘（H6 G8 实装，P4 复核），不走 DOM。
function computeLog() {
  var empty = { logs: [], emptyText: '还没有日志。' };
  try {
    if (typeof Logger === 'undefined') return empty;
    if (!GameState.currentCardId) return { logs: [], emptyText: '未在游戏中。' };
    var logs = Logger.listLogs(GameState.currentCardId, GameState.currentSaveId) || [];
    var out = [];
    for (var i = 0; i < logs.length; i++) {
      var l = logs[i] || {};
      var d = l.gameDate;
      var dateStr = d ? (d.year + '-' + d.month + '-' + d.day) : '?';
      out.push({ id: l.id || '', date: dateStr, title: l.title || '', summary: l.summary || '' });
    }
    if (!out.length) return empty;
    return { logs: out, emptyText: '' };
  } catch (e) {
    return empty;
  }
}

// ---------- 骰子历史（桌面 ui_panels.js:184 renderDiceHistoryPanel）----------
// 空态：「还没有骰子记录。」（ui_panels.js:202）；清空按钮不搬。
function computeDiceHistory() {
  var empty = { stats: null, list: [], emptyText: '还没有骰子记录。' };
  try {
    if (typeof DiceHistory === 'undefined') return empty;
    var list = [];
    var stats = null;
    try { list = DiceHistory.listAll() || []; } catch (e) { list = []; }
    try { stats = DiceHistory.getStats() || null; } catch (e) { stats = null; }
    if (!list.length) return { stats: stats, list: [], emptyText: '还没有骰子记录。' };
    var recent = list.slice(-50).reverse();
    var out = [];
    for (var i = 0; i < recent.length; i++) {
      var x = recent[i] || {};
      out.push({
        gameTime: x.gameTime || '',
        round: x.round,
        label: x.label || '',
        detail: x.detail || ''
      });
    }
    return { stats: stats, list: out, emptyText: '' };
  } catch (e) {
    return empty;
  }
}

// ---------- 角色（桌面 ui_panels.js:432 renderCharacterPanel）----------
// 「重审人设」按钮已搬（H6 G9：UI_Portrait RN 实装，CharacterPanel 直触发屏）。
function computeCharacter() {
  var empty = {
    name: '（未填）', gender: '—', age: '—', birthday: '—',
    height: '', appearance: '', background: '',
    portraitSummary: '', traits: [], attrs: [], talents: [],
    money: '—', inventory: [
      { key: 'bar', label: '快捷栏', items: [] },
      { key: 'common', label: '通用道具', items: [] },
      { key: 'story', label: '剧情道具', items: [] },
      { key: 'rare', label: '稀有道具', items: [] }
    ],
    emptyText: ''
  };
  try {
    var pd = GameState.playerData || {};
    var card = GameState.currentCard || {};
    var attrs = Array.isArray(card.attributes) ? card.attributes : [];

    function alias(k) {
      try { return (typeof Alias !== 'undefined') ? (Alias.get(pd, k) || '') : (pd[k] || ''); }
      catch (e) { return pd[k] || ''; }
    }

    empty.name = alias('name') || '（未填）';
    empty.gender = alias('gender') || '—';
    var age = null;
    try { age = GameState.computeAge(); } catch (e) { age = null; }
    if (age == null) age = alias('age') || null;
    empty.age = age != null && age !== '' ? String(age) : '—';
    empty.birthday = alias('birthday') || (alias('birth_year') ? (alias('birth_year') + ' 年') : '—');
    empty.height = alias('height') || '';
    empty.appearance = alias('appearance') || '';
    empty.background = alias('background') || '';

    if (pd.portrait && pd.portrait.summary) {
      empty.portraitSummary = String(pd.portrait.summary);
      if (Array.isArray(pd.portrait.traits)) {
        empty.traits = pd.portrait.traits.map(function (t) { return String(t); });
      }
    }

    for (var i = 0; i < attrs.length; i++) {
      var a = attrs[i] || {};
      var v = pd['attr_' + a.key] != null ? pd['attr_' + a.key] : (pd[a.key] != null ? pd[a.key] : (a.init || 0));
      var max = a.max != null ? a.max : 20;
      var pct = Math.max(0, Math.min(100, (v / max) * 100));
      empty.attrs.push({ key: a.key || '', name: a.name || a.key || '', value: v, max: max, pct: pct });
    }

    var talents = pd.talents || pd.skills || [];
    if (Array.isArray(talents)) {
      empty.talents = talents.map(function (t) { return String(t); });
    }

    if (pd.money != null) empty.money = String(pd.money);
    else if (pd.gold != null) empty.money = String(pd.gold);

    var inv = pd.inventory || {};
    for (var ci = 0; ci < empty.inventory.length; ci++) {
      var cat = empty.inventory[ci].key;
      var items = Array.isArray(inv[cat]) ? inv[cat] : [];
      empty.inventory[ci].items = items.map(function (it) {
        if (typeof it === 'string') return { name: it, desc: '' };
        return { name: (it && it.name) || '', desc: (it && it.desc) || '' };
      });
    }
    return empty;
  } catch (e) {
    return empty;
  }
}

// ---------- 卡带自定义面板（桌面 ui_panels.js:579 renderEntries）----------
// 裁定 3：按 currentState.panels 里任意 panelId 路由，不许写死；按 num 排序。
// 元素四型：number / relation / switch / list（ui_panels.js:581-602）。
function computeEntries(panelId) {
  var empty = { name: '', entries: [], emptyText: '' };
  try {
    var st = GameState.currentState;
    var panels = (st && st.panels) || {};
    var p = panels[panelId];
    if (!p) return { name: '', entries: [], emptyText: '（面板不存在）' };
    var entries = Array.isArray(p.entries) ? p.entries : [];
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i] || {};
      var seg = '';
      try { seg = GameState.getEntrySegmentText(e) || ''; } catch (e2) { seg = ''; }
      if (e.type === 'number') {
        var pct = (e.max != null && e.max > 0) ? Math.max(0, Math.min(100, (e.current / e.max) * 100)) : 0;
        out.push({ type: 'number', name: e.name || '', current: e.current, max: e.max != null ? e.max : null, pct: pct, desc: seg || e.desc || '' });
      } else if (e.type === 'relation') {
        var rpct = (e.max != null && e.min != null && e.max > e.min) ? Math.max(0, Math.min(100, ((e.current - e.min) / (e.max - e.min)) * 100)) : 0;
        out.push({ type: 'relation', name: e.name || e.label || '', from: e.from || '?', to: e.to || '?', current: e.current, pct: rpct, desc: seg || e.desc || '' });
      } else if (e.type === 'switch') {
        out.push({ type: 'switch', name: e.name || '', value: !!e.value });
      } else if (e.type === 'list') {
        var items = [];
        var rawItems = Array.isArray(e.items) ? e.items : [];
        for (var ii = 0; ii < rawItems.length; ii++) {
          var it = rawItems[ii];
          var nm = typeof it === 'string' ? it : ((it && it.name) || '');
          if (nm) items.push(nm);
        }
        out.push({ type: 'list', name: e.name || '', items: items });
      } else {
        out.push({ type: 'unknown', name: e.name || '' });
      }
    }
    // P6·S4-5：空条目逐字照桌面（ui_core.js:849「（暂无条目）」）
    return { name: p.name || '', entries: out, emptyText: out.length ? '' : '（暂无条目）' };
  } catch (e) {
    return empty;
  }
}

// P33·②：卡带自定义面板里属于「人物卡 / 人物素质 / 个人素质 / 素质 / 属性」的那些
//   并成一条，由「角色」面板统一承载（用户裁决：人物素质与人物卡不要分开放）。
// 返回 { label, ids, others }：label = 合并行的显示名（无匹配时为空串，调用方回落「角色」）；
// ids = 被并入的面板 id（CharacterPanel 按序渲染其条目）；others = 仍单列的自定义面板。
var CHAR_PANEL_RE = /^(人物卡|人物素质|个人素质|素质|属性)$/;
// P33·②：只有「人物卡 / 人物素质」这类命名才接管合并行的行名；「个人素质 / 属性 /
//   素质」被并进来但不改行名 —— 否则一行里装着整个人物卡却叫「个人素质」，反而更乱。
var CHAR_ROW_NAME_RE = /^(人物卡|人物素质)$/;

function computeMergedCharPanels() {
  var all = computePanelList();
  var ids = [];
  var rowName = '';
  var others = [];
  for (var i = 0; i < all.length; i++) {
    var p = all[i];
    var key = String(p.name || '').replace(/\s/g, '');
    if (CHAR_PANEL_RE.test(key)) {
      ids.push(p.id);
      if (!rowName && CHAR_ROW_NAME_RE.test(key)) rowName = p.name;
    } else others.push(p);
  }
  return { label: rowName, ids: ids, others: others };
}

// 卡带自定义面板列表（侧栏入口用；按 num 排序）
function computePanelList() {
  try {
    var st = GameState.currentState;
    var panels = (st && st.panels) || {};
    var list = [];
    var keys = Object.keys(panels);
    for (var i = 0; i < keys.length; i++) {
      var p = panels[keys[i]];
      if (p && p.name) list.push({ id: keys[i], name: p.name, num: p.num || 0 });
    }
    list.sort(function (a, b) { return a.num - b.num; });
    return list;
  } catch (e) { return []; }
}

// ---------- 商店索引（桌面 ui_panels.js:227 renderShopIndexPanel）----------
// 空态：「这个卡带没有商店。」（ui_panels.js:231）
function computeShopIndex() {
  var empty = { shops: [], emptyText: '这个卡带没有商店。' };
  try {
    if (typeof Shop === 'undefined') return empty;
    var shops = [];
    try { shops = Shop.listShops() || []; } catch (e) { shops = []; }
    if (!shops.length) return empty;
    var out = [];
    for (var i = 0; i < shops.length; i++) {
      var s = shops[i] || {};
      out.push({
        id: s.id || '',
        name: s.name || s.id || '',
        desc: s.desc || '',
        itemCount: (s.items || []).length,
        locationId: s.locationId || '',
        npcId: s.npcId || ''
      });
    }
    return { shops: out, emptyText: '' };
  } catch (e) {
    return empty;
  }
}

// ---------- H6 · 任务（桌面 ui_panels.js:88-130 renderTasksPanel）----------
// 空态逐字：未装载 →「任务模块未加载。」；读失败 →「读取任务失败：」+msg；无任务 →「暂无任务。」
function computeTasks() {
  var empty = { tasks: [], emptyText: '任务模块未加载。' };
  try {
    if (typeof Tasks === 'undefined') return empty;
    if (!GameState.currentCardId) return { tasks: [], emptyText: '未在游戏中。' };
    var list = [];
    try { list = Tasks.listAll() || []; } catch (e) {
      return { tasks: [], emptyText: '读取任务失败：' + (e.message || String(e)) };
    }
    if (!list.length) return { tasks: [], emptyText: '暂无任务。' };
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i] || {};
      var steps = [];
      if (Array.isArray(t.steps)) {
        for (var j = 0; j < t.steps.length; j++) {
          var s = t.steps[j] || {};
          steps.push({
            id: s.id || '', desc: s.desc || '', done: !!s.done,
            doneAt: s.doneAt || '', active: !!s.active
          });
        }
      }
      out.push({
        id: t.id || '', name: t.name || '', desc: t.desc || '',
        type: t.type || '', priority: t.priority || 0,
        status: t.status || '', visible: t.visible !== false,
        steps: steps, reward: t.reward || null,
        startedAt: t.startedAt || '', doneAt: t.doneAt || '',
        failedAt: t.failedAt || '', failReason: t.failReason || ''
      });
    }
    return { tasks: out, emptyText: '' };
  } catch (e) {
    return { tasks: [], emptyText: '读取任务失败：' + (e.message || String(e)) };
  }
}

// ---------- H6 · 成就（桌面 ui_panels.js:135-172 renderAchievementsPanel）----------
// 空态逐字：未装载 →「成就模块未加载。」；读失败 →「读取成就失败：」+msg；无定义 →「这个卡带还没有成就。」
// hidden:true 且未解锁 → 名称显示「神秘成就」（桌面 :165），描述不泄露
function computeAchievements() {
  var empty = { achievements: [], emptyText: '成就模块未加载。' };
  try {
    if (typeof Achievements === 'undefined') return empty;
    if (!GameState.currentCardId) return { achievements: [], emptyText: '未在游戏中。' };
    var list = [];
    try { list = Achievements.listAll() || []; } catch (e) {
      return { achievements: [], emptyText: '读取成就失败：' + (e.message || String(e)) };
    }
    if (!list.length) return { achievements: [], emptyText: '这个卡带还没有成就。' };
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i] || {};
      var isHidden = a.hidden === true && !a.unlocked;
      out.push({
        id: a.id || '',
        name: isHidden ? '神秘成就' : (a.name || ''),
        desc: isHidden ? '' : (a.desc || ''),
        hidden: !!a.hidden, icon: a.icon || '',
        category: a.category || '',
        unlocked: !!a.unlocked, unlockedAt: a.unlockedAt || '',
        reward: a.reward || null,
        _realName: a.name || ''
      });
    }
    return { achievements: out, emptyText: '' };
  } catch (e) {
    return { achievements: [], emptyText: '读取成就失败：' + (e.message || String(e)) };
  }
}

// ---------- H6 · 结局（桌面 ui_core.js:1073-1127，后日谈 :1129-1206）----------
// 开关：Endings.isEnabled()（:55-68，settings.endings.enabled !== false 且 worldbook.endings 非空）
// 空态逐字照 §4 G6
function computeEndings() {
  var empty = { enabled: false, endings: [], reachedCount: 0, totalCount: 0, emptyText: '结局模块未加载。' };
  try {
    if (typeof Endings === 'undefined') return empty;
    if (!GameState.currentCardId) return { enabled: false, endings: [], reachedCount: 0, totalCount: 0, emptyText: '未在游戏中。' };
    var enabled = false;
    try { enabled = Endings.isEnabled(); } catch (e) { enabled = false; }
    if (!enabled) return {
      enabled: false, endings: [], reachedCount: 0, totalCount: 0,
      emptyText: '本卡带未启用结局系统。',
      subText: '启用方法：卡带里 worldbook.endings 非空，且全局设置开启。'
    };
    var list = [];
    try { list = Endings.listAll() || []; } catch (e) {
      return { enabled: true, endings: [], reachedCount: 0, totalCount: 0, emptyText: '读取结局失败：' + (e.message || String(e)) };
    }
    if (!list.length) return { enabled: true, endings: [], reachedCount: 0, totalCount: 0, emptyText: '本卡带未定义任何结局。' };
    // 系统锁：Endings.isLocked() 无参，读世界/主循环级 _data.locked（桌面 ui_core.js:1086）
    // H6R 订正：原先误写 Endings.isLocked(e.id)，该 API 不接收参数，
    // 每个结局项的 locked 被静默吞成系统锁（false）。per-item 应取 listAll() 已给出的
    // e.locked（engine/endings.js:99 locked: !!def.locked）。
    var systemLocked = false;
    try { systemLocked = Endings.isLocked(); } catch (e2) { systemLocked = false; }
    var out = [];
    var reached = 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i] || {};
      if (e.reached) reached++;
      out.push({
        id: e.id || '', name: e.name || '', type: e.type || '',
        desc: e.desc || '', priority: e.priority || 0,
        locked: !!e.locked, reached: !!e.reached,
        reachedAt: e.reachedAt || '', reachedRound: e.reachedRound || '',
        reachedBy: e.reachedBy || '', epilogue: e.epilogue || '',
        extensions: e.extensions || [], isDefEpilogue: !!e.isDefEpilogue
      });
    }
    return { enabled: true, endings: out, reachedCount: reached, totalCount: out.length, systemLocked: systemLocked, emptyText: '' };
  } catch (e) {
    return { enabled: false, endings: [], reachedCount: 0, totalCount: 0, emptyText: '结局模块未加载。' };
  }
}

// ---------- H6 · 剧情节点（桌面 ui_core.js:1211-1283 renderStoryNodesPanel）----------
// 开关：StoryNodes.isEnabled()（:73-86，settings.storyNodes.enabled === true 且 worldbook.storyNodes 非空）
function computeStoryNodes() {
  var empty = { enabled: false, summary: null, emptyText: '节点模块未加载。' };
  try {
    if (typeof StoryNodes === 'undefined') return empty;
    if (!GameState.currentCardId) return { enabled: false, summary: null, emptyText: '未在游戏中。' };
    var enabled = false;
    try { enabled = StoryNodes.isEnabled(); } catch (e) { enabled = false; }
    if (!enabled) return {
      enabled: false, summary: null,
      emptyText: '本卡带未启用节点系统。',
      subText: '启用方法：全局设置开启 + 卡带里 worldbook.storyNodes 非空。'
    };
    var summary = null;
    try { summary = StoryNodes.getSummary() || null; } catch (e) { summary = null; }
    if (!summary) return {
      enabled: true, summary: null,
      emptyText: '（还没有进入任何节点）',
      subText: '点击节点名进入。'
    };
    // 解析 summary 结构
    var cur = summary.currentNode || null;
    var completed = Array.isArray(summary.completed) ? summary.completed : [];
    var available = Array.isArray(summary.available) ? summary.available : [];
    var parsed = {
      enabled: true,
      currentNode: cur ? {
        id: cur.id || '', name: cur.name || '', type: cur.type || '',
        hint: cur.hint || cur.promptHint || '',
        exitHint: cur.exitHint || (cur.exit && cur.exit.hint) || ''
      } : null,
      completed: completed.map(function (n) {
        return { id: n.id || n, name: (n.name || n) };
      }),
      available: available.map(function (n) {
        return { id: n.id || n, name: (n.name || n) };
      }),
      pendingForeshadows: summary.pendingForeshadows || [],
      stuck: !!summary.stuck,
      emptyText: '',
      subText: '点击节点名进入。（AI 也可以主动 enter_node）'
    };
    return parsed;
  } catch (e) {
    return { enabled: false, summary: null, emptyText: '节点模块未加载。' };
  }
}

// ---------- H6 · 事件提议（桌面 ui_core.js:853-900）----------
// 空态逐字照 §4 G4
function computeEventProposals() {
  var empty = { proposals: [], emptyText: '事件模块未加载。' };
  try {
    if (typeof Events === 'undefined') return empty;
    if (!GameState.currentCardId) return { proposals: [], emptyText: '未在游戏中。' };
    var list = [];
    try { list = Events.getPendingProposals() || []; } catch (e) { list = []; }
    if (!list.length) return {
      proposals: [],
      emptyText: '暂无待审核的事件提议。',
      subText: 'AI 在剧情中会提议新事件，届时会出现在这里。'
    };
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i] || {};
      out.push({
        id: p.id || '',
        title: p.title || p.name || '',
        desc: p.desc || p.description || '',
        type: p.type || '',
        reason: p.reason || ''
      });
    }
    var header = 'AI 提议了 ' + out.length + ' 个新事件。接受后进入世界事件池，拒绝则丢弃。';
    return { proposals: out, emptyText: '', header: header };
  } catch (e) {
    return { proposals: [], emptyText: '事件模块未加载。' };
  }
}

// ---------- H6 · 变更提议（桌面 ui_core.js:924-950）----------
// 空态逐字照 §4 G5
function computeChangeProposals() {
  var empty = { proposals: [], emptyText: '提议模块未加载。' };
  try {
    if (typeof Proposals === 'undefined') return empty;
    if (!GameState.currentCardId) return { proposals: [], emptyText: '未在游戏中。' };
    var list = [];
    try { list = Proposals.list() || []; } catch (e) { list = []; }
    if (!list.length) return {
      proposals: [],
      emptyText: '暂无待确认的变更提议。',
      subText: '当你说"这个应该加进去"时，AI 会提议变更，出现在这里。'
    };
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i] || {};
      var desc = '';
      try { desc = Proposals.describe(p) || ''; } catch (e2) { desc = ''; }
      out.push({
        id: p.id || '',
        title: p.title || p.name || '',
        desc: desc,
        type: p.type || '',
        reason: p.reason || ''
      });
    }
    return { proposals: out, emptyText: '', header: '有 ' + out.length + ' 条变更提议等待确认。' };
  } catch (e) {
    return { proposals: [], emptyText: '提议模块未加载。' };
  }
}

// ---------- P27 · 产出物（对应引擎 engine/outputs.js）----------
// 面板只渲染本函数的返回；引擎写操作（create/update/review/settle）留在组件动作里。
// 关：全局设置 settings.outputs.enabled（Storage.getGlobal()），默认关。
// 字段：review.state = none/pending/included/revised/rejected；fate = fermenting/settled。
function computeOutputs() {
  var empty = {
    enabled: false, count: 0, fermenting: 0, items: [],
    emptyText: '产出物系统当前未开启（设置 → 通用 → 产出物系统）。',
    empty: '还没有产出物…'
  };
  try {
    if (typeof Outputs === 'undefined') {
      return {
        enabled: false, count: 0, fermenting: 0, items: [],
        emptyText: '产出物模块未加载。',
        empty: '还没有产出物…'
      };
    }
    if (!Outputs.isEnabled()) return empty;
    var list = [];
    try { list = Outputs.listAll() || []; } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    var labels = {
      none: '已纳入剧情', pending: '待审', included: '已纳入',
      revised: '已修改并纳入', rejected: '已驳回'
    };
    var out = [];
    var fermenting = 0;
    for (var i = 0; i < list.length; i++) {
      var o = list[i] || {};
      var review = o.review || {};
      var st = review.state || 'none';
      if (o.fate === 'fermenting') fermenting++;
      out.push({
        id: o.id || '',
        title: o.title || o.name || '',
        name: o.name || '',
        desc: o.desc || '',
        content: o.content || '',
        reviewState: st,
        label: labels[st] || labels.none,
        fate: o.fate || 'fermenting',
        progress: (typeof o.progress === 'number') ? o.progress : 0,
        type: o.type || '',
        reason: review.reason || '',
        raw: review.raw || ''
      });
    }
    return {
      enabled: true,
      count: out.length,
      fermenting: fermenting,
      items: out,
      emptyText: '',
      empty: '还没有产出物…',
      header: out.length ? ('共 ' + out.length + ' 件产出物，发酵中 ' + fermenting + ' 件。') : ''
    };
  } catch (e) {
    return empty;
  }
}

// ---------- H6 · NPC 人物（桌面 engine/ui_npc.js:45-91 UI_Npc.render）----------
// 空态逐字照 §4 G7-a
function computeNpc() {
  var empty = { focus: [], scene: [], npcs: {}, pending: [], history: [], emptyText: '这个卡带还没有 NPC。去设置 → 世界书 → NPC 添加。' };
  try {
    var card = GameState.currentCard || {};
    var wb = card.worldbook || {};
    var npcDefs = wb.npcs || {};
    var defKeys = Object.keys(npcDefs);
    if (!defKeys.length) return empty;
    if (!GameState.currentCardId) return { focus: [], scene: [], npcs: {}, pending: [], history: [], emptyText: '未在游戏中。' };

    // 定义转可渲染
    var npcMap = {};
    for (var i = 0; i < defKeys.length; i++) {
      var k = defKeys[i];
      var d = npcDefs[k] || {};
      npcMap[k] = {
        id: k,
        name: d.name || k,
        weight: d.weight || 0,
        keywords: d.keywords || [],
        desc: d.desc || ''
      };
    }

    // 运行时：getFocus/getSceneOnly 返回完整 NPC 对象（带 _rt），不是 ID 字符串
    var focusIds = [];
    var sceneIds = [];
    var runtimeMap = {};
    try {
      if (typeof NpcRuntime !== 'undefined') {
        var focusObjs = NpcRuntime.getFocus() || [];
        var sceneObjs = NpcRuntime.getSceneOnly() || [];
        // 从对象中提取 id 和 _rt
        for (var j = 0; j < focusObjs.length; j++) {
          var fo = focusObjs[j];
          if (!fo) continue;
          var fid = fo.id || fo;
          if (typeof fid !== 'string') continue;
          focusIds.push(fid);
          var frt = fo._rt || fo.__rt;
          if (frt) {
            runtimeMap[fid] = {
              mood: frt.mood || '',
              locationId: frt.locationId || '',
              playerRelation: frt.playerRelation || '',
              alive: frt.alive !== false,
              knownFacts: frt.knownFacts || [],
              recentEvents: frt.recentEvents || []
            };
          }
        }
        for (var k = 0; k < sceneObjs.length; k++) {
          var so = sceneObjs[k];
          if (!so) continue;
          var sid = so.id || so;
          if (typeof sid !== 'string') continue;
          sceneIds.push(sid);
          if (!runtimeMap[sid]) {
            var srt = so._rt || so.__rt;
            if (srt) {
              runtimeMap[sid] = {
                mood: srt.mood || '',
                locationId: srt.locationId || '',
                playerRelation: srt.playerRelation || '',
                alive: srt.alive !== false,
                knownFacts: srt.knownFacts || [],
                recentEvents: srt.recentEvents || []
              };
            } else {
              // 无 _rt 附带，尝试单独 get
              try {
                var gt = NpcRuntime.get(sid);
                if (gt) {
                  runtimeMap[sid] = {
                    mood: gt.mood || '',
                    locationId: gt.locationId || '',
                    playerRelation: gt.playerRelation || '',
                    alive: gt.alive !== false,
                    knownFacts: gt.knownFacts || [],
                    recentEvents: gt.recentEvents || []
                  };
                }
              } catch (e) { /* */ }
            }
          }
        }
        // 对 focus 中无 _rt 的也尝试 get
        for (var m = 0; m < focusIds.length; m++) {
          if (!runtimeMap[focusIds[m]]) {
            try {
              var gt2 = NpcRuntime.get(focusIds[m]);
              if (gt2) {
                runtimeMap[focusIds[m]] = {
                  mood: gt2.mood || '',
                  locationId: gt2.locationId || '',
                  playerRelation: gt2.playerRelation || '',
                  alive: gt2.alive !== false,
                  knownFacts: gt2.knownFacts || [],
                  recentEvents: gt2.recentEvents || []
                };
              }
            } catch (e) { /* */ }
          }
        }
      }
    } catch (e) { /* NpcRuntime 全量异常 → 空运行时 */ }

    // 推演链
    var pending = [];
    var history = [];
    try {
      if (typeof NpcDeduction !== 'undefined') {
        pending = NpcDeduction.listPending() || [];
        history = NpcDeduction.listHistory() || [];
      }
    } catch (e) { /* */ }

    // 在场/现场无运行时
    var hasFocus = focusIds.length > 0;
    var hasScene = sceneIds.length > 0;

    return {
      focus: focusIds,
      scene: sceneIds,
      npcs: npcMap,
      runtime: runtimeMap,
      pending: pending,
      history: history,
      emptyText: '',
      noFocusText: hasFocus ? '' : '暂无 NPC 在场。剧情需要时会自动抽取 NPC 出场。',
      noRuntimeText: '（无运行时状态）'
    };
  } catch (e) {
    return empty;
  }
}

// ---------- 报错面板（P1-E；桌面壳 engine/error_log_dom.js 判不搬，只取
// core 数据。数据源 ErrorLog._state.errors / _load()，键名直读
// engine/error_log_core.js:89-97 的 item 形状）----------
// 空态逐字照桌面 error_log_dom.js:258「没有捕获到错误」。
// 条目倒序（桌面 :237 slice().reverse() 新错误在前）；编号 = 录入序号，
// 最新条编号最大（桌面 :249 '[' + (length - i) + ']' 在倒序数组上的等价式）。
function computeErrorLog() {
  var empty = { errors: [], count: 0, emptyText: '没有捕获到错误', storageText: '—' };
  try {
    if (typeof ErrorLog === 'undefined' || !ErrorLog) return empty;
    try { ErrorLog._load(); } catch (e) { /* 装载失败按内存态 */ }
    var st = ErrorLog._state || {};
    var raw = Array.isArray(st.errors) ? st.errors : [];
    // P10·A3：存储占用一行（口径逐字照桌面 error_log_dom.js:230
    //   `存储占用：<b>' + (core._estimateBytes()/1024/1024).toFixed(2) + ' MB</b>`）。
    //   _estimateBytes 缺失/抛错时退化为 '—'，不进 try 主链。
    var storageText = '—';
    try {
      if (typeof ErrorLog._estimateBytes === 'function') {
        storageText = (Number(ErrorLog._estimateBytes()) / 1024 / 1024).toFixed(2) + ' MB';
      }
    } catch (e2) { /* 保持 '—' */ }
    var items = [];
    for (var i = raw.length - 1; i >= 0; i--) {
      var e = raw[i] || {};
      var ctx = e.context || {};
      items.push({
        index: i + 1,
        time: e.time || '',
        timeFull: e.timeFull || '',
        type: e.type || 'Error',
        message: e.message || '',
        stack: e.stack || '',
        screen: ctx.screen || '?',
        cardId: ctx.cardId || '?',
        round: (ctx.round == null ? '?' : ctx.round),
        gameTime: ctx.gameTime || '?'
      });
    }
    return { errors: items, count: items.length, emptyText: '没有捕获到错误', storageText: storageText };
  } catch (e) {
    return empty;
  }
}

// 清空（走 core.clear，同 error_log_dom.js:206 确认后 core.clear()）
function clearErrorLog() {
  try { if (typeof ErrorLog !== 'undefined' && ErrorLog) ErrorLog.clear(); } catch (e) { /* — */ }
}

// 整份诊断报告文本（P10·A3；桌面 error_log_dom.js:275-284 copyReport → core.getReport()）。
// 纯读，不碰 RN API；返回 '' 表示取不到（面板仍可复制空串，不抛）。
function errorLogReport() {
  try {
    if (typeof ErrorLog !== 'undefined' && ErrorLog && typeof ErrorLog.getReport === 'function') {
      return String(ErrorLog.getReport() || '');
    }
  } catch (e) { /* — */ }
  return '';
}

// ---------- 调试面板（P1-I · I-3；桌面壳 engine/ui_panels.js:417 renderDebugPanel）----------
// 桌面四段只读：游戏时间 / playerData / 快照（共 N 个 + 最近第 N 轮）/ NPC 运行时。
// RN 侧各段取 JSON 字符串，交由 DebugPanel 渲染（分段标题逐字照桌面）。
// P10·A11：补第七、八段（预算配置 / 最近降级账本）。
// 口径与 P9·S14 侧栏 SidebarDrawer.readPrompt() 逐字一致，不造第二口径：
//   _lastPromptEstimate/_lastPromptChars = 第四部分（状态快照）；
//   _lastPromptFullEstimate = 整条 prompt；_lastTrimmedLevel/_lastTrimLog = 降级账本；
//   _lastPromptBudget = { enabled, maxTokens }（buildDynamic 内写入）。
function computeDebug() {
  var out = {
    gameTime: '—', playerData: '—', snapCount: 0, snapText: '共 0 个快照\n最近：无',
    npcRuntime: '{}', budgetText: '—', trimText: '本轮未触发降级。'
  };
  try {
    out.gameTime = JSON.stringify((GameState && GameState._gameTime) || null, null, 2);
  } catch (e) { out.gameTime = '—'; }
  try {
    out.playerData = JSON.stringify((GameState && GameState.playerData) || null, null, 2);
  } catch (e) { out.playerData = '—'; }
  try {
    var snaps = (typeof Snapshots !== 'undefined' && Snapshots) ? (Snapshots.list() || []) : [];
    out.snapCount = snaps.length;
    out.snapText = '共 ' + snaps.length + ' 个快照\n最近：' +
      (snaps.length ? ('第 ' + snaps[snaps.length - 1].round + ' 轮') : '无');
  } catch (e) { out.snapText = '共 0 个快照\n最近：无'; }
  try {
    var rt = (typeof NpcRuntime !== 'undefined' && NpcRuntime) ? (NpcRuntime.getAll() || {}) : {};
    out.npcRuntime = JSON.stringify(rt, null, 2);
  } catch (e) { out.npcRuntime = '{}'; }

  // P10·A11 段一：预算配置
  try {
    var budget = (GameState && GameState._lastPromptBudget) || null;
    var lines = [];
    if (!budget) {
      lines.push('预算刹车：尚未运行（本轮未组装 prompt）');
    } else {
      lines.push('开关：' + (budget.enabled === false ? '已关闭' : '启用'));
      lines.push('上限：' + Number(budget.maxTokens || 0) + ' tok（第四部分口径）');
    }
    var est = Number((GameState && GameState._lastPromptEstimate) || 0);
    var chars = Number((GameState && GameState._lastPromptChars) || 0);
    var full = Number((GameState && GameState._lastPromptFullEstimate) || 0);
    var lv = Number((GameState && GameState._lastTrimmedLevel) || 0);
    if (est > 0) {
      lines.push('第四部分估算：≈ ' + est + ' tok（' + (chars / 1024).toFixed(1) + ' KB）');
      if (full > 0) lines.push('整条 prompt 估算：≈ ' + full + ' tok');
      lines.push('当前档位：' + lv + (lv > 0 ? '（已降级）' : '（未降级）'));
    }
    out.budgetText = lines.join('\n');
  } catch (e) { out.budgetText = '—'; }

  // P10·A11 段二：最近降级账本（GameState._lastTrimLog，buildDynamic 写入）
  try {
    var log = (GameState && GameState._lastTrimLog) || [];
    if (!log.length) {
      out.trimText = '本轮未触发降级。';
    } else {
      out.trimText = log.map(function (x, i) {
        return '第 ' + (i + 1) + ' 档 [' + x.section + '] ' + x.before + ' → ' + x.after + ' tok\n  ' + x.reason;
      }).join('\n');
    }
  } catch (e) { out.trimText = '本轮未触发降级。'; }
  return out;
}

// ---------- 手机（剧情外信息层 · P1-H / H7；桌面壳 engine/ui_panels.js renderInfoFeedPanel）----------
// 空态文案逐字（设计稿 §9.1）：讯息「还没有收到任何讯息。」/ 广播「还没有广播。」/
// 模块未装载「手机模块未加载。」。内部 try/catch 兜底，模块未装/字段缺失一律返空态，绝不抛。
function _infoPhoneRecipients() {
  var out = [];
  try {
    var card = (typeof GameState !== 'undefined' && GameState) ? GameState.currentCard : null;
    var npcs = (card && card.worldbook && Array.isArray(card.worldbook.npcs)) ? card.worldbook.npcs : [];
    npcs.forEach(function (n) {
      if (n && n.id) out.push({ id: String(n.id), name: String(n.name || n.id) });
    });
  } catch (e) { out = []; }
  return out;
}

function computeInfoPhone(threadId) {
  var empty = {
    loaded: false,
    emptyText: '手机模块未加载。',
    time: '',
    unread: 0,
    threads: [],
    broadcasts: [],
    messages: [],
    threadTitle: '',
    recipients: []
  };
  try {
    if (typeof InfoFeed === 'undefined' || !InfoFeed || typeof InfoFeed.listThreads !== 'function') return empty;
    var out = {
      loaded: true,
      emptyText: empty.emptyText,
      time: '',
      unread: 0,
      threads: [],
      broadcasts: [],
      messages: [],
      threadTitle: '',
      recipients: _infoPhoneRecipients()
    };
    try { out.time = GameState.formatGameTime() || ''; } catch (e) { out.time = ''; }
    try { out.unread = InfoFeed.unreadTotal() || 0; } catch (e) { out.unread = 0; }

    var threads = [];
    try { threads = InfoFeed.listThreads() || []; } catch (e) { threads = []; }
    out.threads = threads.map(function (t) {
      var actionable = false;
      try {
        var th = InfoFeed.getThread(t.id);
        var msgs = (th && th.messages) || [];
        var last = msgs.length ? msgs[msgs.length - 1] : null;
        actionable = !!(last && last.importance === 'actionable' && last.flow !== 'story');
      } catch (e) { actionable = false; }
      return {
        id: t.id,
        title: t.title,
        preview: t.preview,
        lastAt: t.lastAt,
        unread: t.unread || 0,
        actionable: actionable
      };
    });

    var bcs = [];
    try { bcs = InfoFeed.listBroadcasts() || []; } catch (e) { bcs = []; }
    out.broadcasts = bcs.map(function (b) {
      return {
        id: b.id,
        at: b.at,
        title: b.title,
        body: b.body,
        sourceName: b.sourceName || b.source || '',
        publicity: b.publicity,
        scope: b.scope,
        followed: b.flow === 'story',
        actionable: b.importance === 'actionable' && b.flow !== 'story'
      };
    });

    var tid = String(threadId || '');
    if (tid) {
      var th2 = null;
      try { th2 = InfoFeed.getThread(tid); } catch (e) { th2 = null; }
      if (th2) {
        out.threadTitle = th2.title || '';
        out.messages = (th2.messages || []).map(function (m) {
          return {
            id: m.id,
            mine: m.from === 'player',
            fromName: m.fromName || m.from || '',
            text: m.text,
            at: m.at,
            followed: m.flow === 'story',
            actionable: m.importance === 'actionable' && m.flow !== 'story'
          };
        });
      }
    }
    return out;
  } catch (e) { return empty; }
}

// 进入线程即 markRead（写动作；照 clearErrorLog 先例收在本文件）
function infoMarkRead(threadId) {
  try { if (typeof InfoFeed !== 'undefined' && InfoFeed) InfoFeed.markRead(String(threadId || '')); } catch (e) { /* — */ }
}

// 线程内玩家回复：只写信息层
function infoSend(threadId, text) {
  try {
    if (typeof InfoFeed === 'undefined' || !InfoFeed) return false;
    return !!InfoFeed.playerSend(String(threadId || ''), String(text || ''));
  } catch (e) { return false; }
}

// 工具栏「写讯息」：选收件人 → 建线程（若无）→ 玩家发送，只进信息层
function infoSendNew(toId, text) {
  try {
    if (typeof InfoFeed === 'undefined' || !InfoFeed) return false;
    var to = String(toId || '');
    var t = String(text || '');
    if (!to || !t) return false;
    var name = to;
    var rec = _infoPhoneRecipients();
    for (var i = 0; i < rec.length; i++) { if (rec[i].id === to) { name = rec[i].name; break; } }
    InfoFeed.ensureThread('th_' + to, { title: name, participants: ['player', to], kind: 'direct' });
    return !!InfoFeed.playerSend('th_' + to, t);
  } catch (e) { return false; }
}

// 「跟进正文」（§8 玩家侧）：升级为 story 并触发一次正常回合；关面板由组件负责
function infoPromote(id) {
  try {
    if (typeof InfoFeed === 'undefined' || !InfoFeed) return { ok: false, reason: '模块未加载' };
    var r = InfoFeed.promoteToStory(String(id || ''), { by: 'player' });
    if (r && r.ok) {
      try {
        if (typeof StoryLoop !== 'undefined' && StoryLoop && typeof StoryLoop.callAI === 'function') StoryLoop.callAI();
      } catch (e) { /* 回合触发失败不阻断升级 */ }
    }
    return r || { ok: false, reason: '未知条目' };
  } catch (e) { return { ok: false, reason: '异常' }; }
}

module.exports = {
  computeStatusCard: computeStatusCard,
  computeLog: computeLog,
  computeDiceHistory: computeDiceHistory,
  computeCharacter: computeCharacter,
  computeEntries: computeEntries,
  computeMergedCharPanels: computeMergedCharPanels,
  computePanelList: computePanelList,
  computeShopIndex: computeShopIndex,
  computeTasks: computeTasks,
  computeAchievements: computeAchievements,
  computeEndings: computeEndings,
  computeStoryNodes: computeStoryNodes,
  computeEventProposals: computeEventProposals,
  computeChangeProposals: computeChangeProposals,  computeOutputs: computeOutputs,

  computeNpc: computeNpc,
  computeErrorLog: computeErrorLog,
  clearErrorLog: clearErrorLog,
  errorLogReport: errorLogReport,
  computeDebug: computeDebug,
  computeInfoPhone: computeInfoPhone,
  infoMarkRead: infoMarkRead,
  infoSend: infoSend,
  infoSendNew: infoSendNew,
  infoPromote: infoPromote
};
