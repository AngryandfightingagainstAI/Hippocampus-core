// ============================================================
// 导入层 · 卡带草稿
// 从中间格式(IMD)生成一张「能过 Validator 的 HC 卡带壳」，并把需要人/AI 补的地方
// 明确列成 gaps（缺口清单）。
//
// 职责边界（对应 GPT 方案的第三条提醒）：
//   · AI 负责「理解、拆分、补全、修复建议」
//   · CardValidator 负责最终验收
//   · 本模块只负责「按规则能填的先填上 + 把填不了的说清楚」
// 所以这里不会假装草稿是成品：build() 一定同时返回 gaps。
// ============================================================

var ImportDraft = {
  SCHEMA_VERSION: '1.2',

  // ---- 默认骨架（对齐 cards_demo.js 的字段结构）----
  defaultHud: function () {
    return [
      { key: 'hp', name: '体力', icon: 'heart', max: 100, init: 100 },
      { key: 'mp', name: '精神', icon: 'sparkle', max: 100, init: 100 }
    ];
  },
  defaultSidebar: function () {
    return [
      {
        key: 'fatigue', name: '疲劳', icon: 'battery', max: 100, init: 0,
        segments: [{ min: 0, max: 33, text: '精力充沛。' }, { min: 34, max: 66, text: '有些累了。' }, { min: 67, max: 100, text: '快撑不住了。' }]
      }
    ];
  },
  defaultPanels: function () {
    return [
      { id: 'attrs', num: 2, name: '属性', entries: [] },
      { id: 'items', num: 3, name: '物品', entries: [] },
      { id: 'relations', num: 4, name: '关系', entries: [] },
      { id: 'world', num: 5, name: '世界', entries: [] }
    ];
  },
  defaultAttributes: function () {
    return [
      { key: 'str', name: '力量', icon: 'sword', min: 1, max: 10, init: 5 },
      { key: 'agi', name: '敏捷', icon: 'wind', min: 1, max: 10, init: 5 },
      { key: 'int', name: '智力', icon: 'book', min: 1, max: 10, init: 5 }
    ];
  },
  emptyWorldbook: function () {
    return {
      worldSetting: { existence: { has: [], hasNot: [] }, eraProducts: [] },
      maps: [], mapNodes: [], timeline: { official: [], fanFuture: [], playerLine: [] },
      npcs: [], factions: [], items: [], skills: [], shops: [], events: [], tasks: [], achievements: [],
      weather: { mode: 'off', changeEvery: 0, pool: [] },
      currency: { currencies: [], allowBarter: true, allowSell: true },
      hasRaces: false, races: [], occupations: []
    };
  },

  // ---- 从文件名/标题推一个 cardId ----
  makeCardId: function (title) {
    var base = String(title || 'imported').toLowerCase().replace(/[\s\/\\]+/g, '_').replace(/[^a-z0-9_\u4e00-\u9fa5]/g, '');
    if (!base) base = 'imported';
    if (base.length > 40) base = base.slice(0, 40);
    return 'imported_' + base + '_' + Math.floor(Date.now() / 1000).toString(36);
  },

  // ---- 主入口：IMD -> { card, gaps, notes } ----
  build: function (imd, opts) {
    opts = opts || {};
    var gaps = [];
    var notes = [];

    var title = pickTitle(imd, opts);
    var blocks = (imd && imd.blocks) || [];

    var card = {
      schemaVersion: ImportDraft.SCHEMA_VERSION,
      cardId: opts.cardId || ImportDraft.makeCardId(title),
      cardName: title,
      author: opts.author || '导入',
      description: '由「导入文游资料」生成' + (imd && imd.source && imd.source.name ? '：' + imd.source.name : ''),
      game: {
        title: title,
        background: '',
        sourceUniverse: '',
        eraRange: ['', ''],
        openingPrompt: ''
      },
      hud: ImportDraft.defaultHud(),
      sidebar: ImportDraft.defaultSidebar(),
      panels: ImportDraft.defaultPanels(),
      attributes: ImportDraft.defaultAttributes(),
      attributePool: { total: 20, base: 5 },
      steps: [],
      statusCard: { enabled: true, sections: [] },
      npcs: [],
      tools: [],
      timeline: { startYear: 0, events: [] },
      outputSchema: null,
      worldbook: ImportDraft.emptyWorldbook(),
      _import: {
        importId: imd ? imd.importId : null,
        sourceName: imd && imd.source ? imd.source.name : null,
        sha256: imd && imd.source ? imd.source.sha256 : null,
        generatedAt: new Date().toISOString(),
        draft: true
      }
    };

    // ---- 1) 背景：取开头的正文段落 ----
    // P26：正文默认从 900 提到 2600 字，并把「原文总量 / 是否截断」记进 _import；
    //   背景末尾指路 query_source —— 资料全文留在原件保管库，AI 可随时检索。
    var bgLimit = opts.backgroundChars || 2600;
    var prose = collectProse(blocks, bgLimit);
    if (prose) {
      var proseAll = collectProse(blocks, 1e9) || '';
      var proseTotal = Math.max(proseAll.length, prose.length);
      card._import.sourceChars = {
        total: proseTotal,
        used: Math.min(proseTotal, bgLimit),
        truncated: proseTotal > bgLimit
      };
      card.game.background = (proseTotal > bgLimit)
        ? (prose + '\n（导入资料正文共 ' + proseTotal + ' 字，以上为前 ' + Math.min(proseTotal, bgLimit) + ' 字；写到当事人、地名、事件细节时先用 query_source 工具把原文取回来，不要凭空编。）')
        : prose;
    }
    else gaps.push({ field: 'game.background', why: '资料里没有可用的正文段落', how: '手工补一段世界观背景，或确认原文件是否只含表格/图片' });

    // ---- 2) 世界设定：标题层级 + 「存在/不存在」小节 ----
    applyOutline(imd, card, notes);
    applyExistence(blocks, card, notes);

    // ---- 3) 表格 → 人物 / 物品 / 势力 / 技能 / 商店 ----
    // 表头未必自带类别（很多资料的表头只有「名称 / 说明」），
    // 所以同时看它上面最近的一个标题——「物品」小节下的表就是物品表。
    var tables = [], curHeading = '';
    for (var bi = 0; bi < blocks.length; bi++) {
      var bk = blocks[bi];
      if (bk.type === 'heading') curHeading = String(bk.text || '').trim();
      else if (bk.type === 'table') tables.push({ table: bk, section: curHeading });
    }
    for (var t = 0; t < tables.length; t++) applyTable(tables[t].table, card, notes, tables[t].section);

    // ---- 4) 时间线：能认出年份的行 ----
    applyTimeline(blocks, card, notes);

    // ---- 5) 开场提示词：优先找「开场/序章/开始」小节 ----
    var opening = findSectionText(blocks, /^(开场|序章|开局|起始|opening)/i);
    if (opening) card.game.openingPrompt = opening;
    else gaps.push({ field: 'game.openingPrompt', why: '没有找到「开场/序章」小节', how: '补写一段开场场景（包括玩家初始处境），或让 AI 依据背景生成' });

    // ---- 6) 缺口清单 ----
    if (!card.worldbook.npcs.length) gaps.push({ field: 'worldbook.npcs', why: '没从资料里识别出人物表', how: '没有人物表就留空也能开局，但建议补主要角色，否则 NPC 侧没有设定可挂' });
    if (!card.game.eraRange[0]) gaps.push({ field: 'game.eraRange', why: '没有识别出时代范围', how: '填两个年份（如 2000 / 2010），没有的话可留空' });
    if (!card.timeline.events.length) gaps.push({ field: 'timeline.events', why: '没有识别出时间线事件', how: '可选：按「年份 + 事件」补，供日历/大事件使用' });
    if (card.hud.length === 2 && card.attributes.length === 3) {
      notes.push('hud / attributes 目前是默认值，没有从资料里推断出更适合的字段（资料里若有「属性」「数值」表，会更准）');
    }

    card._import.gaps = gaps.length;
    return { card: card, gaps: gaps, notes: notes };
  },

  // ---- 用 Validator 验收（本模块不替 AI 做最终判断）----
  validate: function (card) {
    if (typeof CardValidator === 'undefined' || !CardValidator || !CardValidator.validate) {
      return { ok: false, msg: 'CardValidator 不可用，无法验收', unavailable: true };
    }
    var r = null;
    try { r = CardValidator.validate(card); } catch (e) { return { ok: false, msg: 'Validator 抛错：' + e.message }; }
    return r || { ok: false, msg: 'Validator 返回空' };
  },

  // ---- AI 补全的提示词（只要求 AI 输出「补丁」，不要求它输出完整卡带，减少出错面）----
  buildPrompt: function (imd, draft, opts) {
    opts = opts || {};
    var maxChars = opts.maxChars || 12000;
    var text = ImportMiddle.toPlainText(imd, { maxChars: maxChars });
    var gaps = (draft && draft.gaps) || [];
    var lines = [];
    lines.push('你在帮一款文字冒险游戏把「已有资料」转成卡带。资料已经做过结构化提取，以下是它的正文与结构。');
    lines.push('');
    lines.push('【任务】只输出一个 JSON 对象作为「补丁」，用来补全下面列出的缺口。不要输出完整卡带，不要输出解释文字。');
    lines.push('');
    lines.push('【允许的补丁结构】');
    lines.push('{"game":{"title":"","background":"","eraRange":["",""],"openingPrompt":""},');
    lines.push(' "worldbook":{"npcs":[{"name":"","desc":""}],"factions":[{"name":"","desc":""}],');
    lines.push(' "items":[{"name":"","desc":""}],"skills":[{"name":"","desc":""}],"shops":[{"name":"","desc":""}],');
    lines.push(' "worldSetting":{"existence":{"has":[],"hasNot":[]}},"timeline":{"official":[{"year":0,"text":""}]}},');
    lines.push(' "hud":[{"key":"","name":"","icon":"","max":100,"init":100}],');
    lines.push(' "attributes":[{"key":"","name":"","icon":"","min":1,"max":10,"init":5}]}');
    lines.push('只写你能从资料里找到依据的字段；没有依据就不要写这个键。宁可少写，不要编造。');
    lines.push('');
    if (gaps.length) {
      lines.push('【当前缺口】');
      for (var i = 0; i < gaps.length; i++) lines.push('- ' + gaps[i].field + '：' + gaps[i].why);
      lines.push('');
    }
    lines.push('【资料正文与结构】');
    lines.push(text);
    return lines.join('\n');
  },

  // ---- 把补丁合并进草稿（白名单字段，避免 AI 顺手改坏结构）----
  applyPatch: function (card, patch, opts) {
    opts = opts || {};
    var applied = [], rejected = [];
    if (!patch || typeof patch !== 'object') return { card: card, applied: applied, rejected: ['补丁不是对象'] };

    if (patch.game && typeof patch.game === 'object') {
      var g = patch.game;
      if (typeof g.title === 'string' && g.title.trim()) { card.game.title = g.title.trim(); card.cardName = opts.keepCardName ? card.cardName : g.title.trim(); applied.push('game.title'); }
      if (typeof g.background === 'string' && g.background.trim()) { card.game.background = g.background.trim(); applied.push('game.background'); }
      if (typeof g.openingPrompt === 'string' && g.openingPrompt.trim()) { card.game.openingPrompt = g.openingPrompt.trim(); applied.push('game.openingPrompt'); }
      if (Array.isArray(g.eraRange) && g.eraRange.length === 2) { card.game.eraRange = [String(g.eraRange[0]), String(g.eraRange[1])]; applied.push('game.eraRange'); }
      if (typeof g.sourceUniverse === 'string') { card.game.sourceUniverse = g.sourceUniverse; applied.push('game.sourceUniverse'); }
    }

    if (Array.isArray(patch.hud) && patch.hud.length) {
      var hud = normDefs(patch.hud, ['key', 'name']);
      if (hud.length) { card.hud = hud; applied.push('hud(' + hud.length + ')'); } else rejected.push('hud：没有一条带 key 和 name');
    }
    if (Array.isArray(patch.attributes) && patch.attributes.length) {
      var at = normDefs(patch.attributes, ['key', 'name']);
      if (at.length) { card.attributes = at; applied.push('attributes(' + at.length + ')'); } else rejected.push('attributes：没有一条带 key 和 name');
    }

    if (patch.worldbook && typeof patch.worldbook === 'object') {
      var wb = patch.worldbook;
      var listFields = ['npcs', 'factions', 'items', 'skills', 'shops', 'events', 'tasks', 'achievements'];
      for (var i = 0; i < listFields.length; i++) {
        var f = listFields[i];
        if (Array.isArray(wb[f]) && wb[f].length) {
          var merged = mergeNamed(card.worldbook[f], wb[f]);
          card.worldbook[f] = merged;
          applied.push('worldbook.' + f + '(' + wb[f].length + ')');
        }
      }
      if (wb.worldSetting && wb.worldSetting.existence) {
        var ex = wb.worldSetting.existence;
        if (Array.isArray(ex.has)) card.worldbook.worldSetting.existence.has = dedupeStrings(card.worldbook.worldSetting.existence.has.concat(ex.has));
        if (Array.isArray(ex.hasNot)) card.worldbook.worldSetting.existence.hasNot = dedupeStrings(card.worldbook.worldSetting.existence.hasNot.concat(ex.hasNot));
        applied.push('worldSetting.existence');
      }
      if (wb.timeline && Array.isArray(wb.timeline.official)) {
        card.worldbook.timeline.official = card.worldbook.timeline.official.concat(wb.timeline.official.filter(function (e) { return e && typeof e.year !== 'undefined'; }));
        card.timeline.events = card.timeline.events.concat(wb.timeline.official.map(function (e) { return String(e.year) + ' ' + (e.text || ''); }));
        applied.push('timeline.official');
      }
    }
    return { card: card, applied: applied, rejected: rejected };
  },

  // ---- 追加上一次的错误，让 AI 修（「发现问题 → AI 修复 → 再 Validator」那一环）----
  buildRepairPrompt: function (card, validation, opts) {
    var lines = [];
    lines.push('上一版卡带草稿没有通过校验。请只输出一个 JSON 补丁来修复它。');
    lines.push('');
    lines.push('【校验器报的错】' + (validation && validation.msg ? validation.msg : '（未提供具体原因）'));
    lines.push('');
    lines.push('【当前卡带的关键字段】');
    lines.push(JSON.stringify({
      schemaVersion: card.schemaVersion, cardId: card.cardId, cardName: card.cardName,
      game: card.game,
      hudCount: (card.hud || []).length, sidebarCount: (card.sidebar || []).length,
      panelNums: (card.panels || []).map(function (p) { return p.num; }),
      attributesCount: (card.attributes || []).length
    }, null, 2));
    lines.push('');
    lines.push('规则：hud/sidebar/panels/attributes 必须是数组；panels 必须包含 num 为 2、3、4、5 的四项；game.title 不能为空。');
    lines.push('只输出 JSON 补丁，不要解释。');
    return lines.join('\n');
  }
};

// ================= 内部工具 =================

function pickTitle(imd, opts) {
  if (opts.title) return opts.title;
  if (imd && imd.meta && imd.meta.title) return String(imd.meta.title).trim();
  if (imd && imd.outline && imd.outline.length) {
    var h1 = null;
    for (var i = 0; i < imd.outline.length; i++) { if (imd.outline[i].level === 1) { h1 = imd.outline[i].title; break; } }
    if (h1) return String(h1).trim();
    return String(imd.outline[0].title).trim();
  }
  if (imd && imd.source && imd.source.name) return String(imd.source.name).replace(/\.[^.]+$/, '');
  return '未命名卡带';
}

function collectProse(blocks, limit) {
  var out = [];
  var len = 0;
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (b.type !== 'paragraph') continue;
    var t = (b.text || '').trim();
    if (!t || t.length < 20) continue;
    if (/^(目录|前言|版权|免责声明|目录$)/.test(t)) continue;
    out.push(t);
    len += t.length;
    if (len >= limit) break;
  }
  var s = out.join('\n\n');
  return s.length > limit ? s.slice(0, limit) + '\n…' : s;
}

function applyOutline(imd, card, notes) {
  if (!imd || !imd.outline || !imd.outline.length) return;
  var has = [], hasNot = [];
  for (var i = 0; i < imd.outline.length; i++) {
    var t = String(imd.outline[i].title || '').trim();
    if (!t) continue;
    if (/不存在|没有|无法|禁忌|禁止/.test(t)) hasNot.push(t);
    else if (/存在|有|可以|允许/.test(t)) has.push(t);
  }
  if (has.length) card.worldbook.worldSetting.existence.has = dedupeStrings(has);
  if (hasNot.length) card.worldbook.worldSetting.existence.hasNot = dedupeStrings(hasNot);
  if (imd.outline.length > 3) notes.push('从标题结构里读到 ' + imd.outline.length + ' 个章节（等级 ' + imd.outline[0].level + ' 起）');
}

function applyExistence(blocks, card, notes) {
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    var t = b.type === 'heading' ? (b.text || '') : (b.type === 'paragraph' ? (b.text || '') : '');
    if (!t) continue;
    var m = /(存在|有)[:：]\s*(.+)/.exec(t);
    if (m) card.worldbook.worldSetting.existence.has = dedupeStrings(card.worldbook.worldSetting.existence.has.concat(splitList(m[2])));
    var m2 = /(不存在|没有|禁止)[:：]\s*(.+)/.exec(t);
    if (m2) card.worldbook.worldSetting.existence.hasNot = dedupeStrings(card.worldbook.worldSetting.existence.hasNot.concat(splitList(m2[2])));
  }
}

function splitList(s) {
  return String(s).split(/[、,，;；\/|]/).map(function (x) { return x.trim(); }).filter(Boolean);
}
function dedupeStrings(a) {
  var seen = {}, out = [];
  for (var i = 0; i < a.length; i++) {
    var k = String(a[i]).trim();
    if (!k || seen[k]) continue;
    seen[k] = true; out.push(k);
  }
  return out;
}

var TABLE_KIND_RULES = [
  { field: 'npcs', re: /(人物|角色|NPC|npc|姓名|名字)/ },
  { field: 'factions', re: /(势力|阵营|组织|派系|公会)/ },
  { field: 'items', re: /(物品|道具|装备|道具表|物资)/ },
  { field: 'skills', re: /(技能|法术|能力|招式)/ },
  { field: 'shops', re: /(商店|店铺|商人|交易)/ },
  { field: 'occupations', re: /(职业|身份|出身)/ },
  { field: 'races', re: /(种族|族裔)/ },
  { field: 'tasks', re: /(任务|委托)/ },
  { field: 'achievements', re: /(成就|奖杯)/ },
  { field: 'events', re: /(事件|遭遇)/ }
];

function applyTable(table, card, notes, section) {
  var headers = (table.headers || []).map(function (h) { return String(h || '').trim(); });
  if (!headers.length) return;
  var head = headers.join(' ');
  var target = null;
  // 先按表头判，表头认不出再看小节标题（表头常常只写「名称 / 说明」）
  for (var i = 0; i < TABLE_KIND_RULES.length; i++) {
    if (TABLE_KIND_RULES[i].re.test(head)) { target = TABLE_KIND_RULES[i].field; break; }
  }
  if (!target && section) {
    for (var j = 0; j < TABLE_KIND_RULES.length; j++) {
      if (TABLE_KIND_RULES[j].re.test(section)) { target = TABLE_KIND_RULES[j].field; notes.push('小节「' + section + '」下的表格按 ' + target + ' 归类（表头认不出类别）'); break; }
    }
  }
  if (!target) return;

  var nameIdx = 0;
  for (var h = 0; h < headers.length; h++) {
    if (/^(名称|名字|姓名|人物|角色|物品|道具|技能)$/.test(headers[h])) { nameIdx = h; break; }
  }
  var rows = table.rows || [];
  var added = 0;
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r] || [];
    var name = String(row[nameIdx] || '').trim();
    if (!name) continue;
    var descParts = [];
    for (var c = 0; c < row.length; c++) {
      if (c === nameIdx) continue;
      var cell = String(row[c] || '').trim();
      if (!cell) continue;
      descParts.push((headers[c] ? headers[c] + '：' : '') + cell);
    }
    card.worldbook[target] = mergeNamed(card.worldbook[target], [{ name: name, desc: descParts.join('；') }]);
    added++;
  }
  if (added) notes.push('表格「' + headers.slice(0, 3).join(' / ') + '」→ 补了 ' + added + ' 条 ' + target);
}

function mergeNamed(existing, incoming) {
  var byName = {}, out = [];
  var i;
  for (i = 0; i < existing.length; i++) {
    if (!existing[i] || !existing[i].name) continue;
    byName[existing[i].name] = out.length;
    out.push(existing[i]);
  }
  for (i = 0; i < incoming.length; i++) {
    var it = incoming[i];
    if (!it || !it.name) continue;
    var n = String(it.name).trim();
    if (byName[n] !== undefined) {
      var cur = out[byName[n]];
      if (it.desc && (!cur.desc || String(cur.desc).length < String(it.desc).length)) cur.desc = it.desc;
      continue;
    }
    byName[n] = out.length;
    out.push({ name: n, desc: it.desc || '' });
  }
  return out;
}

function applyTimeline(blocks, card, notes) {
  var added = 0;
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (b.type !== 'paragraph' && b.type !== 'list') continue;
    var texts = b.type === 'list' ? (b.items || []) : [b.text || ''];
    for (var j = 0; j < texts.length; j++) {
      var t = String(texts[j] || '').trim();
      var m = /^(\d{3,4})\s*年?\s*[·\-—:：]?\s*(.{4,})/.exec(t);
      if (m) {
        var y = parseInt(m[1], 10);
        card.timeline.events.push(y + ' ' + m[2].trim());
        card.worldbook.timeline.official.push({ year: y, text: m[2].trim() });
        added++;
      }
    }
    if (added > 60) break;
  }
  if (added) {
    if (!card.timeline.startYear) {
      var years = card.worldbook.timeline.official.map(function (e) { return e.year; }).sort(function (a, b) { return a - b; });
      if (years.length) card.timeline.startYear = years[0];
    }
    notes.push('从正文里认出 ' + added + ' 条「年份 + 事件」，已放入时间线（可能有误，请核对）');
  }
}

function findSectionText(blocks, titleRe) {
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (b.type !== 'heading') continue;
    if (!titleRe.test(String(b.text || '').trim())) continue;
    var buf = [];
    for (var j = i + 1; j < blocks.length; j++) {
      var nb = blocks[j];
      if (nb.type === 'heading') break;
      if (nb.type === 'paragraph' && nb.text) buf.push(nb.text);
      if (buf.join('\n').length > 800) break;
    }
    if (buf.length) return buf.join('\n\n').slice(0, 1200);
  }
  return null;
}

function normDefs(list, requiredKeys) {
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var it = list[i];
    if (!it || typeof it !== 'object') continue;
    var ok = true;
    for (var k = 0; k < requiredKeys.length; k++) if (!it[requiredKeys[k]]) ok = false;
    if (!ok) continue;
    out.push(it);
  }
  return out;
}

if (typeof window !== 'undefined') window.ImportDraft = ImportDraft;
if (typeof module !== 'undefined' && module.exports) module.exports = ImportDraft;
