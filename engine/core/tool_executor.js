// ============================================================
// 核心层 · 工具执行器
// AI 工具的 whitelist + 执行分发 + 结果格式化。
// 运行时依赖 GameState / getDiceConfig / DiceEngine / NpcRuntime /
// WebSearchManager / ErrorLog / UI（均在方法体内解析，加载期不触碰）。
// ============================================================

// ============================================================
// 工具执行器
// ============================================================
(function() {
  var ToolExecutor = {
  WHITELIST: {
    modify_hud: { run: function(a) { return ToolExecutor._modifyStat('hud', null, a.key, a.delta); } },
    modify_sidebar: { run: function(a) { return ToolExecutor._modifyStat('sidebar', null, a.key, a.delta); } },
    modify_entry: { run: function(a) { return ToolExecutor._modifyStat('entry', a.panelId, a.key, a.delta); } },
    modify_relation: { run: function(a) { return ToolExecutor._modifyRelation(a.from, a.to, a.delta); } },
    add_item: { run: function(a) { return ToolExecutor._addItem(a.category, a.name, a.desc); } },
    remove_item: { run: function(a) { return ToolExecutor._removeItem(a.name); } },
    query_player: { run: function() { return { ok: true, type: 'query', queryType: 'player', data: GameState.playerData }; } },
    query_npc: { run: function(a) {
      const wb = GameState.currentCard.worldbook || {};
      const n = (wb.npcs || []).find(x => x.id === a.id || x.name === a.id);
      if (!n) return { ok: false, reason: 'NPC 不存在' };
      const rt = (typeof NpcRuntime !== 'undefined') ? (NpcRuntime.get(n.id) || null) : null;
      return {
        ok: true, type: 'query', queryType: 'npc', id: a.id,
        data: {
          static: {
            id: n.id, name: n.name, weight: n.weight, keywords: n.keywords,
            gender: n.gender, desc: n.desc, abilities: n.abilities,
            likes: n.likes, dislikes: n.dislikes, tags: n.tags,
            factions: n.factions, relations: n.relations
          },
          runtime: rt ? {
            status: rt.status, sceneWeight: rt.sceneWeight, alive: rt.alive,
            mood: rt.mood, locationId: rt.locationId, playerRelation: rt.playerRelation,
            knownFacts: rt.knownFacts, recentEvents: rt.recentEvents,
            lastSeenRound: rt.lastSeenRound
          } : null
        }
      };
    }},
    query_faction: { run: function(a) {
      const wb = GameState.currentCard.worldbook || {};
      const f = (wb.factions || []).find(x => x.id === a.id || x.name === a.id);
      if (!f) return { ok: false, reason: '势力不存在' };
      return { ok: true, type: 'query', queryType: 'faction', id: a.id, data: f };
    }},
    query_map: { run: function(a) {
      const wb = GameState.currentCard.worldbook || {};
      const n = (wb.mapNodes || {})[a.id];
      if (!n) return { ok: false, reason: '节点不存在' };
      return { ok: true, type: 'query', queryType: 'map', id: a.id, data: n };
    }},
    query_worldsetting: { run: function() {
      const wb = GameState.currentCard.worldbook || {};
      return { ok: true, type: 'query', queryType: 'worldsetting', data: wb.worldSetting || {} };
    }},
    query_source: { run: function(a) {
      // P26：导入资料的全文检索。card.game.background 只留开头一段，
      //   资料全文在原件保管库（ImportVault），这里按关键词或块序号把原文取回来。
      a = a || {};
      var card = (typeof GameState !== 'undefined' && GameState) ? GameState.currentCard : null;
      var imp = card && card._import;
      if (!imp || !imp.importId) return { ok: false, reason: '当前卡带没有导入资料（无 _import.importId）' };
      if (typeof ImportVault === 'undefined' || !ImportVault || typeof ImportVault.loadImd !== 'function') {
        return { ok: false, reason: 'ImportVault 不可用（导入层未加载）' };
      }
      var imd = null;
      try { imd = ImportVault.loadImd(imp.importId); } catch (e) { imd = null; }
      if (!imd || !Array.isArray(imd.blocks)) return { ok: false, reason: '导入资料已不存在（importId=' + imp.importId + '）' };
      var docs = [], totalChars = 0;
      for (var i = 0; i < imd.blocks.length; i++) {
        var b = imd.blocks[i];
        var t = (b && typeof b.text === 'string') ? b.text : '';
        if (!t) continue;
        docs.push({ n: i, type: String((b && b.type) || ''), text: t });
        totalChars += t.length;
      }
      if (!docs.length) return { ok: false, reason: '导入资料里没有可检索的文本块' };
      var clip = function(s, n) { s = String(s); return s.length > n ? (s.slice(0, n) + '…') : s; };
      var limit = Math.max(1, Math.min(5, parseInt(a.limit, 10) || 2));
      var chars = Math.max(60, parseInt(a.chars, 10) || 220);
      if (limit * chars > 700) chars = Math.max(60, Math.floor(700 / limit));
      var src = { id: imp.importId, sourceName: imp.sourceName || '', blocks: docs.length, chars: totalChars };
      if (a.keyword != null && String(a.keyword) !== '') {
        var kw = String(a.keyword).toLowerCase();
        var from = parseInt(a.from, 10);
        if (isNaN(from)) from = -1;
        var items = [], scanned = 0, more = false;
        for (var j = 0; j < docs.length; j++) {
          if (from >= 0 && docs[j].n < from) continue;
          scanned = j + 1;
          if (docs[j].text.toLowerCase().indexOf(kw) >= 0) {
            items.push({ n: docs[j].n, text: clip(docs[j].text, chars) });
            if (items.length >= limit) {
              for (var k = j + 1; k < docs.length; k++) {
                if (docs[k].text.toLowerCase().indexOf(kw) >= 0) { more = true; break; }
              }
              break;
            }
          }
        }
        return { ok: true, type: 'query', queryType: 'source', id: imp.importId,
          data: { source: src, keyword: a.keyword, scanned: scanned, items: items, more: more,
            hint: items.length ? (more ? '还有更多命中，带 from = 本页最后一段的 n + 1 继续查' : '命中已列完') : '没找到这个词；换成更短的关键词（只用一个词，别用整句）再试一次' } };
      }
      if (a.offset == null && a.index == null) {
        var heads = [];
        for (var h = 0; h < docs.length && heads.length < 10; h++) {
          if (docs[h].type === 'heading') heads.push(docs[h].n + ':' + clip(docs[h].text, 24));
        }
        return { ok: true, type: 'query', queryType: 'source', id: imp.importId,
          data: { source: src, headings: heads,
            hint: '找内容：query_source({keyword:"词"})；读原文：query_source({offset:块序号, limit:2})' } };
      }
      var off = parseInt(a.offset != null ? a.offset : a.index, 10) || 0;
      if (off < 0) off = 0;
      var page = docs.slice(off, off + limit).map(function(d) { return { n: d.n, type: d.type, text: clip(d.text, chars) }; });
      var next = page.length ? (off + page.length) : null;
      return { ok: true, type: 'query', queryType: 'source', id: imp.importId,
        data: { source: src, offset: off, items: page,
          nextOffset: (next != null && next < docs.length) ? next : null,
          hint: 'nextOffset 为 null 表示已到资料末尾' } };
    }},
    roll_dice: { run: function(a) {
      const cfg = getDiceConfig();
      if (!cfg.enabled) return { ok: false, reason: '骰子系统未开启' };
      if (typeof DiceEngine === 'undefined') return { ok: false, reason: '骰子引擎未加载' };
      const expr = String(a.expr || '').trim();
      if (!expr) return { ok: false, reason: 'expr 为空' };
      const parsed = DiceEngine.parse(expr);
      if (!parsed) return { ok: false, reason: '表达式无效：' + expr };
      if (parsed.type === 'check' && !cfg.cocCheck) return { ok: false, reason: 'CoC 检定未开启' };
      if (parsed.type === 'bonus' && !cfg.bonusPenalty) return { ok: false, reason: '奖励/惩罚骰未开启' };
      if (parsed.type === 'normal' && !cfg.basic) return { ok: false, reason: '基础骰未开启' };
      const r = DiceEngine.roll(expr, a.label || '');
      if (r.ok) {
        if (r.type === 'check' && r.check && !cfg.criticalFumble) {
          if (r.check.level === '大成功') r.check = { level: '成功', class: 'success' };
          if (r.check.level === '大失败') r.check = { level: '失败', class: 'fail' };
        }
        if (r.type === 'check' && r.check && !cfg.successLevel) {
          if (r.check.level === '极难成功' || r.check.level === '困难成功') r.check = { level: '成功', class: 'success' };
        }
        r.type2 = 'dice';
      }
      return r;
    }},
    roll_check: { run: function(a) {
      const cfg = getDiceConfig();
      if (!cfg.enabled) return { ok: false, reason: '骰子系统未开启' };
      if (!cfg.cocCheck) return { ok: false, reason: 'CoC 检定未开启' };
      const target = Number(a.target);
      if (!target || target < 1 || target > 100) return { ok: false, reason: 'target 必须是 1-100 的数字' };
      if (typeof DiceEngine === 'undefined') return { ok: false, reason: '骰子引擎未加载' };
      const r = DiceEngine.roll('ra' + target, a.label || '');
      if (r.ok) {
        if (!cfg.criticalFumble && r.check) {
          if (r.check.level === '大成功') r.check = { level: '成功', class: 'success' };
          if (r.check.level === '大失败') r.check = { level: '失败', class: 'fail' };
        }
        if (!cfg.successLevel && r.check) {
          if (r.check.level === '极难成功' || r.check.level === '困难成功') r.check = { level: '成功', class: 'success' };
        }
        r.type2 = 'dice';
        // ★ 缓存最后一次检定，供孤注一掷使用
        GameState._lastCheck = { target: target, label: r.label || '', pushed: false };
      }
      return r;
    }},
    roll_opposed: { run: function(a) {
      const cfg = getDiceConfig();
      if (!cfg.enabled) return { ok: false, reason: '骰子系统未开启' };
      if (!cfg.cocCheck) return { ok: false, reason: 'CoC 检定未开启' };
      const ta = Number(a.targetA), tb = Number(a.targetB);
      if (!ta || !tb || ta < 1 || ta > 100 || tb < 1 || tb > 100) return { ok: false, reason: 'targetA / targetB 必须是 1-100' };
      const ra = DiceEngine.roll('ra' + ta, a.labelA || 'A');
      const rb = DiceEngine.roll('ra' + tb, a.labelB || 'B');
      if (!ra.ok || !rb.ok) return { ok: false, reason: '掷骰失败' };
      const rank = { '大成功': 5, '极难成功': 4, '困难成功': 3, '成功': 2, '失败': 1, '大失败': 0 };
      const raR = rank[ra.check.level] || 0;
      const rbR = rank[rb.check.level] || 0;
      let winner;
      if (raR > rbR) winner = 'A';
      else if (rbR > raR) winner = 'B';
      else if (raR === 0 && rbR === 0) winner = 'tie';
      else if (ra.total < rb.total) winner = 'A';
      else if (rb.total < ra.total) winner = 'B';
      else winner = 'tie';
      return {
        ok: true, type: 'opposed', type2: 'dice',
        label: a.label || '',
        a: { label: a.labelA || 'A', total: ra.total, target: ta, check: ra.check },
        b: { label: a.labelB || 'B', total: rb.total, target: tb, check: rb.check },
        winner: winner
      };
    }},
    web_search: { run: function(a) {
      if (typeof WebSearchManager === 'undefined') return { ok: false, reason: '搜索模块未加载' };
      if (!WebSearchManager.isEnabled()) return { ok: false, reason: '联网未开启' };
      const kw = String(a.query || a.keyword || '').trim();
      if (!kw) return { ok: false, reason: '查询关键词为空' };
      return { __async: true, promise: (async function() {
        const r = await WebSearchManager.query(kw, { count: a.count || 3 });
        if (!r.ok) return { ok: false, reason: r.reason || '搜索失败', searchMeta: r };
        return { ok: true, type: 'search', type2: 'search', searchMeta: r, keyword: kw };
      })() };
    }}
  },

  _failCount: 0,
  // P10·B4：工具块内文上限 12000 字符。以前超限块被「静默吞掉」——extract 的
  //   正则带上限提不到它，strip 的无上限正则却照样把它从正文删掉 ⇒ 玩家与 AI
  //   都看不到这次调用发生过。现改为：超限块不提取（不执行）、也不 strip（原文
  //   留在正文里可见），并给出可见信号（ErrorLog + 提示行）。不许静默。
  TOOL_BLOCK_LIMIT: 12000,
  _lastOversize: [],
  extract: function(t) {
    if (!t) return [];
    this._lastOversize = [];
    const out = [];
    const re = /<<<TOOL>>>([\s\S]*?)<<<END>>>/g;
    let m;
    while ((m = re.exec(t)) !== null) {
      if (!m[1].length) continue;                       // 空块：同旧行为，忽略
      if (m[1].length > this.TOOL_BLOCK_LIMIT) { this._lastOversize.push('<<<TOOL>>>' + m[1] + '<<<END>>>'); continue; }
      out.push(m[1].trim());
    }
    if (this._lastOversize.length) {
      const msg = '工具块过大（>' + this.TOOL_BLOCK_LIMIT + ' 字符），已保留原文但未执行（共 ' +
        this._lastOversize.length + ' 个）';
      try { if (typeof ErrorLog !== 'undefined' && ErrorLog.action) ErrorLog.action('TOOL', '⚠ ' + msg); } catch (e) {}
      try { if (typeof Platform !== 'undefined' && Platform.ui && Platform.ui.appendHint) Platform.ui.appendHint('（⚠ ' + msg + '）'); } catch (e) {}
    }
    return out;
  },
  // strip：只删「能被提取执行」的块；超限块保留在正文（与 extract 同一上限）。
  strip: function(t) { if (!t) return t; return t.replace(/<<<TOOL>>>[\s\S]{1,12000}?<<<END>>>/g, '').trim(); },

  executeAll: async function(list) {
    const out = [];
    for (let i = 0; i < list.length; i++) out.push(await this.executeOne(list[i]));
    return out;
  },

  executeOne: async function(raw) {
    let p; try { p = JSON.parse(raw); } catch (e) { this._incFail('JSON 解析失败'); return { ok: false, reason: 'JSON 解析失败' }; }
    const name = p.name; const args = p.args || {};
    if (!name || !this.WHITELIST[name]) {
      console.warn('[ToolExecutor] 未知工具：', name);
      this._incFail('未知工具：' + name);
      return { ok: false, reason: '未知工具：' + name };
    }
    try {
      const r = this.WHITELIST[name].run(args);
      if (r && r.__async && r.promise) {
        const resolved = await r.promise;
        if (resolved && resolved.ok) { this._failCount = 0; return resolved; }
        return resolved || { ok: false, reason: '执行失败' };
      }
      if (r && r.ok) { this._failCount = 0; return r; }
      return r || { ok: false, reason: '执行失败' };
    } catch (e) { return { ok: false, reason: '执行异常：' + e.message }; }
  },

  _incFail: function(msg) {
    // ★ 现在只被"格式错误"调用（JSON 解析失败 / 未知工具）
    //   业务失败不再计数——业务失败由 story.js 循环显示 hint
    this._failCount++;
    try {
      if (typeof ErrorLog !== 'undefined' && ErrorLog.action) {
        ErrorLog.action('TOOL', '⚠ 工具格式错误：' + msg + '（连续 ' + this._failCount + '）');
      }
    } catch (e) {}
    // 连续 3 次格式错误 → 弹提示 + 清零
    if (this._failCount >= 3) {
      this._failCount = 0;
      try { Platform.ui.appendHint('⚠ AI 工具调用格式持续错误：' + msg); } catch (e) {}
    }
  },

  _modifyStat: function(scope, panelId, key, delta) {
    delta = Number(delta);
    if (!key || typeof delta !== 'number' || isNaN(delta)) return { ok: false, reason: '参数缺失' };
    const st = GameState.currentState;
    if (!st) return { ok: false, reason: '未在游戏中' };
    // 定位规则：先精确匹配 key，找不到再按 name 兜底
    // （AI 生成的卡带里数值项/货币项可能没有 key，商店货币 id 传的是 name）
    function _findIn(list) {
      if (!Array.isArray(list)) return null;
      var byKey = list.find(function(x) { return x && x.key === key; });
      if (byKey) return byKey;
      return list.find(function(x) { return x && x.name === key; }) || null;
    }
    let item = null;
    if (scope === 'hud') item = _findIn(st.hud);
    else if (scope === 'sidebar') item = _findIn(st.sidebar);
    else if (scope === 'entry') { const p = st.panels[panelId]; if (!p) return { ok: false, reason: '面板不存在' }; item = _findIn(p.entries); }
    if (!item) return { ok: false, reason: '找不到：' + key };
    if (item.type === 'switch' || item.type === 'list') {
      return { ok: false, reason: '该条目类型不支持数值修改（type=' + item.type + '）' };
    }
    // current / min / max 必须按数值运算：卡带或存档里它们可能是字符串（AI 生成卡带常见），
    // 若不转 Number，oldVal + delta 会变成字符串拼接（"100" + -50 = "100-50"），
    // clamp 后变 NaN，表现为金币被扣到 0
    const oldVal = item.current != null ? Number(item.current) : 0;
    if (isNaN(oldVal)) return { ok: false, reason: '当前值不是数字：' + (item.name || key) };
    let newVal = oldVal + delta;
    const minVal = item.min != null ? Number(item.min) : null;
    const maxVal = item.max != null ? Number(item.max) : null;
    if (minVal != null && !isNaN(minVal)) newVal = Math.max(newVal, minVal);
    if (maxVal != null && !isNaN(maxVal)) newVal = Math.min(newVal, maxVal);
    let sc = null;
    if (item.segments && item.segments.length) {
      const a = this._findSeg(item.segments, oldVal);
      const b = this._findSeg(item.segments, newVal);
      if (a !== b && b && b.trigger) sc = b;
    }
    item.current = newVal;
    return { ok: true, type: scope, key: item.key || key, panelId: panelId, oldVal: oldVal, newVal: newVal, delta: newVal - oldVal, segmentCrossed: sc ? { text: sc.text } : null, label: item.name || key };
  },
  _modifyRelation: function(from, to, delta) {
    delta = Number(delta);
    if (!from || !to || typeof delta !== 'number' || isNaN(delta)) return { ok: false, reason: '参数缺失' };
    const st = GameState.currentState;
    if (!st) return { ok: false, reason: '未在游戏中' };
    let found = null;
    Object.keys(st.panels).forEach(pid => {
      (st.panels[pid].entries || []).forEach(e => {
        if (e.type === 'relation' && e.from === from && e.to === to && !found) found = e;
      });
    });
    if (!found) return { ok: false, reason: '关系不存在' };
    const e = found;
    const oldVal = e.current != null ? e.current : 0;
    let newVal = oldVal + delta;
    if (e.lockDown && delta < 0) return { ok: false, reason: '已锁定' };
    if (e.lockUp && delta > 0) return { ok: false, reason: '已锁定' };
    const min = e.min != null ? e.min : -100;
    const max = e.max != null ? e.max : 100;
    newVal = Math.min(newVal, max); newVal = Math.max(newVal, min);
    e.current = newVal;
    return { ok: true, type: 'relation', from: from, to: to, oldVal: oldVal, newVal: newVal, delta: newVal - oldVal, label: e.name || '关系' };
  },
  _addItem: function(cat, name, desc) {
    const valid = ['bar', 'common', 'story', 'rare'];
    const c = valid.includes(cat) ? cat : 'bar';
    if (!name) return { ok: false, reason: '物品名为空' };
    if (!GameState.playerData.inventory) GameState.playerData.inventory = { bar: [], common: [], story: [], rare: [] };
    const inv = GameState.playerData.inventory;
    if (!inv[c]) inv[c] = [];
    if (inv[c].some(i => i.name === name)) return { ok: false, reason: '已拥有' };
    inv[c].push({ name: name, desc: desc || '' });
    return { ok: true, type: 'item', action: 'add', category: c, name: name };
  },
  _removeItem: function(name) {
    if (!name) return { ok: false, reason: '物品名为空' };
    const inv = GameState.playerData.inventory;
    if (!inv) return { ok: false, reason: '背包为空' };
    for (const c of ['bar', 'common', 'story', 'rare']) {
      const i = (inv[c] || []).findIndex(x => x.name === name);
      if (i >= 0) { inv[c].splice(i, 1); return { ok: true, type: 'item', action: 'remove', category: c, name: name }; }
    }
    return { ok: false, reason: '未找到' };
  },
  _findSeg: function(segs, v) { for (let i = 0; i < segs.length; i++) { const s = segs[i]; if (v >= s.min && v <= s.max) return s; } return null; },

  // ============================================================
  // formatForHistory：处理所有类型
  // ============================================================
  // P10·B3：query_player 的 data 是整个 playerData（含 portrait 总述 / inventory /
  //   _openingPrompt）。旧写法 JSON.stringify(...).slice(0,800) 常把 JSON 切成半截
  //   ⇒ AI 读到非法 JSON；且 _openingPrompt（玩家私下的开场设定）属无意泄漏。
  //   修法：① query_player 回显剔除 portrait 与 _openingPrompt（人设详情指路
  //   query_avatar）；② 仍超 800 字符时改用结构化截断 {truncated, preview, note}，
  //   保证 AI 拿到的是合法 JSON。
  _QUERY_DATA_MAX: 800,
  _formatQueryData: function(r) {
    let data = r.data;
    if (r.queryType === 'player' && data && typeof data === 'object' && !Array.isArray(data)) {
      data = Object.assign({}, data);
      if (Object.prototype.hasOwnProperty.call(data, 'portrait')) delete data.portrait;
      if (Object.prototype.hasOwnProperty.call(data, '_openingPrompt')) delete data._openingPrompt;
      data._hint = '人设总述与特质详情请调 query_avatar';
    }
    let json;
    try { json = JSON.stringify(data); } catch (e) { return '（数据无法序列化）'; }
    if (json == null) return '（空）';
    if (json.length <= this._QUERY_DATA_MAX) return json;
    return JSON.stringify({
      truncated: true,
      preview: json.slice(0, this._QUERY_DATA_MAX - 120),
      note: '原始 JSON 长度 ' + json.length + '，已截断；需要完整详情请分项查询'
    });
  },
  formatForHistory: function(results) {
    const oks = results.filter(r => r.ok), fails = results.filter(r => !r.ok), lines = [];
    if (oks.length) {
      lines.push('【系统 · 工具执行结果】');
      oks.forEach(r => {
        // 查询
        if (r.type === 'query') {
          lines.push('· ' + r.queryType + ' 查询结果：');
          lines.push('  ' + this._formatQueryData(r));
        }
        // 联网搜索
        else if (r.type === 'search') {
          lines.push('· 🔍 联网搜索「' + (r.keyword || '') + '」');
          if (r.searchMeta && r.searchMeta.results) {
            r.searchMeta.results.slice(0, 3).forEach((it, i) => {
              lines.push('  ' + (i+1) + '. ' + it.title);
              if (it.url) lines.push('     ' + it.url);
              if (it.snippet) lines.push('     ' + String(it.snippet).slice(0, 200).replace(/\n/g, ' '));
            });
          }
        }
        // 物品
        else if (r.type === 'item') lines.push('· ' + (r.action === 'add' ? '获得' : '失去') + '物品【' + r.category + '】' + r.name);
        // 关系
        else if (r.type === 'relation') lines.push('· 关系 ' + r.from + '→' + r.to + '（' + r.label + '）：' + r.oldVal + ' → ' + r.newVal + '（' + (r.delta >= 0 ? '+' : '') + r.delta + '）');
        // 骰子
        else if (r.type2 === 'dice') {
          if (r.type === 'check') {
            lines.push('· 🎲 ' + (r.label ? ('【' + r.label + '】') : '') + ' 掷出 ' + r.total + ' / 目标 ' + r.target + ' → ' + r.check.level);
          } else if (r.type === 'sc') {
            lines.push('· 🎲 ' + (r.label || '理智检定') + ' 掷出 ' + r.total + ' / 理智 ' + r.target + ' → ' + r.check.level + '，扣 ' + r.loss + (r.oldSan != null ? '（' + r.oldSan + ' → ' + r.newSan + '）' : ''));
          } else if (r.type === 'luck') {
            lines.push('· 🍀 ' + (r.label || '消耗幸运') + ' -' + r.spent + '（' + r.oldLuck + ' → ' + r.newLuck + '）' + (r.reason ? '：' + r.reason : ''));
          } else if (r.type === 'bonus') {
            const modeStr = r.mode === 'bonus' ? '奖励骰×' + r.bonusCount : '惩罚骰×' + r.bonusCount;
            lines.push('· 🎲 ' + (r.label ? ('【' + r.label + '】') : '') + ' ' + modeStr + ' → ' + r.total);
          } else if (r.type === 'normal') {
            const modStr = r.mod ? (r.mod > 0 ? '+' + r.mod : String(r.mod)) : '';
            lines.push('· 🎲 ' + (r.label ? ('【' + r.label + '】') : '') + ' ' + r.dice.join('+') + modStr + ' → ' + r.total);
          } else if (r.type === 'opposed') {
            lines.push('· 🎲 对抗 ' + r.a.label + '(' + r.a.total + '/' + r.a.target + ' ' + r.a.check.level + ') vs ' + r.b.label + '(' + r.b.total + '/' + r.b.target + ' ' + r.b.check.level + ') → ' + (r.winner === 'A' ? r.a.label + ' 胜' : r.winner === 'B' ? r.b.label + ' 胜' : '平手'));
          }
        }
        // 商店
        else if (r.type === 'shop') {
          if (r.action === 'open') lines.push('· 🏪 打开商店【' + r.shopName + '】');
          else if (r.action === 'buy') lines.push('· 🏪 在【' + r.shopName + '】购买 ' + r.item + '×' + r.count + '，花 ' + r.paid + ' ' + r.currency + '（余 ' + r.remainCurrency + '）');
          else if (r.action === 'sell') lines.push('· 🏪 在【' + r.shopName + '】出售 ' + r.item + '，得 ' + r.earned + ' ' + r.currency);
        }
        // 状态卡
        else if (r.type === 'status') {
          if (r.action === 'update') lines.push('· 📱 ' + r.label + '：' + (r.oldValue || '（空）') + ' → ' + r.newValue);
          else if (r.action === 'bulk') {
            r.changes.forEach(function(c) { lines.push('· 📱 状态卡·' + c.key + '：' + (c.oldValue || '（空）') + ' → ' + c.newValue); });
          }
          else if (r.action === 'voice') lines.push('· 🗣 ' + r.npcId + ' 心声：' + r.newValue);
        }
        // 天气
        else if (r.type === 'weather') lines.push('· 🌤 天气变化：' + r.weatherType + ' ' + (r.icon || ''));
        // 事件
        else if (r.type === 'event') {
          if (r.action === 'trigger') {
            lines.push('· ⚡ 事件「' + r.eventName + '」已触发');
            (r.applied || []).forEach(function(x) { lines.push('    ' + x); });
          } else if (r.action === 'cancel') {
            lines.push('· ⚡ 事件「' + r.eventId + '」已取消');
          } else if (r.action === 'ban') {
            lines.push('· ⚡ 事件「' + r.eventId + '」已封禁（' + r.status + '）');
          } else if (r.action === 'unban') {
            lines.push('· ⚡ 事件「' + r.eventId + '」已解封');
          } else if (r.action === 'propose') {
            lines.push('· ✉ 提议新事件「' + (r.eventName || r.eventId) + '」');
          }
        }
        // 任务
        else if (r.type === 'task') {
          if (r.action === 'add') lines.push('· 📋 新增任务【' + r.taskName + '】');
          else if (r.action === 'step') lines.push('· 📋 任务步骤完成：' + r.taskId + '/' + r.stepId + (r.taskCompleted ? '（任务完成）' : ''));
          else if (r.action === 'complete') {
            lines.push('· ✓ 完成任务【' + r.taskName + '】');
            (r.rewardApplied || []).forEach(function(x) { lines.push('    ' + x); });
          }
          else if (r.action === 'fail') lines.push('· ✗ 任务失败【' + r.taskName + '】' + (r.reason ? '：' + r.reason : ''));
          else if (r.action === 'abandon') lines.push('· ⊘ 放弃任务【' + r.taskName + '】');
        }
        // 成就
        else if (r.type === 'achievement') {
          if (r.action === 'unlock') {
            lines.push('· ' + (r.icon || '🏆') + ' 成就解锁【' + r.achievementName + '】');
            (r.rewardApplied || []).forEach(function(x) { lines.push('    ' + x); });
          } else if (r.action === 'add') {
            lines.push('· 🏆 新增成就【' + r.achievementName + '】');
          }
        }
        // NPC 状态
        else if (r.type === 'npc_state') {
          if (r.action === 'enter' || r.action === 'focus') lines.push('· 🎬 NPC ' + r.npcId + ' 登场');
          else if (r.action === 'leave' || r.action === 'unfocus') lines.push('· 💤 NPC ' + r.npcId + ' 离场（回现场舞台）');
          else if (r.action === 'offstage' || r.action === 'scene_leave') lines.push('· 💭 NPC ' + r.npcId + ' 退场（后台）');
          else if (r.action === 'scene_enter') lines.push('· 🎬 NPC ' + r.npcId + ' 进入现场舞台');
          else if (r.action === 'follow') lines.push('· 👣 NPC ' + r.npcId + ' 开始跟随玩家');
          else if (r.action === 'unfollow') lines.push('· 👣 NPC ' + r.npcId + ' 取消跟随');
          else if (r.action === 'reveal') lines.push('· 🎭 NPC ' + r.npcId + ' 揭示真实身份：' + (r.name || r.npcId));
        }
        // 关键词
        else if (r.type === 'keyword') {
          if (r.action === 'add') lines.push('· 🔑 NPC ' + r.npcId + ' 添加关键词「' + r.keyword + '」');
        }
        // 结局
        else if (r.type === 'ending') {
          if (r.action === 'trigger') lines.push('· 🏁 触发结局【' + r.endingName + '】' + (r.endingType ? '（' + r.endingType + '）' : '') + (r.locked ? ' [锁定]' : ''));
          else if (r.action === 'extend') lines.push('· 📝 续写后日谈·' + r.endingId);
        }
        // 节点
        else if (r.type === 'node') {
          if (r.action === 'enter') lines.push('· 🚪 进入节点【' + r.nodeName + '】');
          else if (r.action === 'complete') lines.push('· ✓ 完成节点【' + r.nodeName + '】');
        }
        // 伏笔
        else if (r.type === 'foreshadow') {
          if (r.action === 'bury') lines.push('· 🌱 埋伏笔【' + r.foreshadowName + '】');
          else if (r.action === 'reveal') lines.push('· 💡 揭示伏笔【' + r.foreshadowName + '】');
        }
        // 提议
        else if (r.type === 'proposal') {
          if (r.action === 'create') lines.push('· 📌 提议变更【' + r.proposalType + '】 #' + r.proposalId);
        }
        // NPC 推演受理
        else if (r.type === 'npc_deduction') {
          if (r.action === 'request') lines.push('· 🧠 已受理 NPC 推演请求【' + (r.npcName || r.npcId || '') + '】：' + (r.factText || ''));
        }
        // NPC 知识登记
        else if (r.type === 'npc_knowledge') {
          if (r.action === 'add') lines.push('· 🧠 NPC ' + (r.npcId || '') + ' 登记知识「' + (r.text || '') + '」');
        }
        // 剧情外信息层（手机）
        else if (r.type === 'info') {
          if (r.action === 'send') lines.push('· 📱 讯息 → ' + (r.toName || r.to || '') + '「' + String(r.text || '').slice(0, 40) + '…」');
          else if (r.action === 'broadcast') lines.push('· 📡 广播「' + (r.title || '') + '」');
        }
        // 通用数值
        else if (r.label && r.oldVal != null && r.newVal != null) {
          lines.push('· ' + r.label + '：' + r.oldVal + ' → ' + r.newVal + '（' + (r.delta >= 0 ? '+' : '') + r.delta + '）');
        }

        if (r.segmentCrossed) lines.push('  ⚠ 已跨段：' + r.segmentCrossed.text);
      });
    }
    if (fails.length) { lines.push('【系统 · 工具失败】'); fails.forEach(r => lines.push('· ' + r.reason)); }
    return lines.join('\n');
  },

  formatDiceForUI: function(r) {
    if (!r || !r.ok || r.type2 !== 'dice') return null;
    if (r.type === 'check') return '🎲 ' + (r.label || '检定') + ' ' + r.total + '/' + r.target + ' → ' + r.check.level;
    if (r.type === 'sc') return '🎲 ' + (r.label || '理智检定') + ' ' + r.total + '/' + r.target + ' → ' + r.check.level + '（扣 ' + r.loss + '）';
    if (r.type === 'luck') return '🍀 ' + (r.label || '消耗幸运') + ' -' + r.spent;
    if (r.type === 'bonus') {
      const modeStr = r.mode === 'bonus' ? '奖励骰×' + r.bonusCount : '惩罚骰×' + r.bonusCount;
      return '🎲 ' + (r.label || modeStr) + ' 十位[' + r.tens.join(',') + '] 个位' + r.unit + ' → ' + r.total;
    }
    if (r.type === 'normal') {
      const modStr = r.mod ? (r.mod > 0 ? '+' + r.mod : String(r.mod)) : '';
      return '🎲 ' + (r.label || '') + ' ' + r.dice.join('+') + modStr + ' → ' + r.total;
    }
    if (r.type === 'opposed') {
      return '🎲 对抗 ' + r.a.label + '(' + r.a.total + ' ' + r.a.check.level + ') vs ' + r.b.label + '(' + r.b.total + ' ' + r.b.check.level + ') → ' + (r.winner === 'A' ? r.a.label + ' 胜' : r.winner === 'B' ? r.b.label + ' 胜' : '平手');
    }
    return null;
  }
  };
  if (typeof window !== 'undefined') window.ToolExecutor = ToolExecutor;
  if (typeof module !== 'undefined' && module.exports) module.exports = ToolExecutor;
})();
