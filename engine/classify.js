// ============================================================
// 卡带分类审核
// v2：不重建面板（只更新状态）；加实时统计 + 按钮反馈
// ============================================================

(function() {
  var escapeHtmlLocal = (typeof Escape !== 'undefined' && Escape.html) ? Escape.html : function(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]; }); };
  var WHERE_LABEL = {
    'hud': '顶栏',
    'sidebar': '侧栏',
    'panel.2': '面板2·个人素质',
    'panel.3': '面板3·声望名誉',
    'panel.4': '面板4·社交关系',
    'panel.5': '面板5·世界百科'
  };

  function extractAllNumbers(card) {
    var out = [];
    (card.hud || []).forEach(function(x) { out.push(normItem(x, 'hud', x.type || 'number')); });
    (card.sidebar || []).forEach(function(x) { out.push(normItem(x, 'sidebar', x.type || 'number')); });
    (card.panels || []).forEach(function(p) {
      (p.entries || []).forEach(function(e) { out.push(normItem(e, 'panel.' + p.num, e.type || 'number')); });
    });
    return out.filter(function(x) { return x.key; });
  }

  function normItem(x, where, type) {
    return {
      key: x.key,
      name: x.name || x.label || x.key,
      type: type,
      where: where,
      min: x.min,
      max: x.max,
      current: x.current != null ? x.current : x.init,
      desc: x.desc || ''
    };
  }

  function buildPrompt(card, items) {
    var wb = card.worldbook || {};
    var ws = wb.worldSetting || {};
    var lines = [];

    lines.push('你是卡带数值分类助手。玩家/卡带作者已经填好了数值，但有些放错了位置。');
    lines.push('请根据每个数值的性质，判断它应该在哪个容器里。');
    lines.push('');
    lines.push('【输出格式】只输出一个 JSON 对象，不要解释、不要 markdown 代码块：');
    lines.push('{');
    lines.push('  "suggestions": [');
    lines.push('    { "key": "hp", "to": "hud", "reason": "核心值，位置正确" },');
    lines.push('    { "key": "fame_port", "to": "panel.3", "reason": "声望应在声望面板" }');
    lines.push('  ]');
    lines.push('}');
    lines.push('');
    lines.push('【可选位置】');
    lines.push('  hud      → 玩家时刻盯着的核心值（HP/MP/金钱/当前时间）');
    lines.push('  sidebar  → 玩家的"状态"（疲劳/饥饿/心情/生理）');
    lines.push('  panel.2  → 个人素质（力量/敏捷/智略/学识）');
    lines.push('  panel.3  → 声望名誉（各势力声望/通缉等级）');
    lines.push('  panel.4  → 社交关系（玩家↔NPC 关系）');
    lines.push('  panel.5  → 世界百科（已知地点/已知物品/已学技能）');
    lines.push('');
    lines.push('【硬性规则】');
    lines.push('1. type=relation 的必须放 panel.4');
    lines.push('2. type=list 的必须放 panel.5');
    lines.push('3. type=number 可以放任意位置，按性质判断');
    lines.push('4. 位置正确的也写出来（to 和当前位置一样），reason 写"位置正确"');
    lines.push('5. 每条都要出现在 suggestions 里，不要漏');
    lines.push('');
    lines.push('【世界设定】');
    lines.push('游戏：' + (card.game && card.game.title || ''));
    if (ws.worldName) lines.push('世界名：' + ws.worldName);
    if (ws.mainStage) lines.push('主要舞台：' + ws.mainStage);
    if (ws.description) lines.push('简介：' + ws.description);
    if (ws.powerSystem) lines.push('能力体系：' + ws.powerSystem);
    lines.push('');
    lines.push('【现有数值（' + items.length + ' 条）】');
    items.forEach(function(it, i) {
      lines.push('  ' + (i + 1) + '. key="' + it.key + '" name="' + it.name + '" type=' + it.type + ' 当前位置=' + it.where + (it.desc ? ' desc="' + it.desc + '"' : ''));
    });
    lines.push('');
    lines.push('现在输出 suggestions JSON。');
    return lines.join('\n');
  }

  function parseSuggestions(text, items) {
    if (!text) return null;
    var s = String(text).trim();
    var m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) s = m[1].trim();
    var start = s.indexOf('{');
    var end = s.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    s = s.slice(start, end + 1);
    var parsed;
    try { parsed = JSON.parse(s); }
    catch (e) {
      if (typeof CardDiagnose !== 'undefined' && CardDiagnose.fixJSONText) {
        try {
          var fixed = CardDiagnose.fixJSONText(s);
          parsed = JSON.parse(fixed.result);
        } catch (e2) { return null; }
      } else return null;
    }
    if (!parsed || !Array.isArray(parsed.suggestions)) return null;

    var validWhere = { 'hud': 1, 'sidebar': 1, 'panel.2': 1, 'panel.3': 1, 'panel.4': 1, 'panel.5': 1 };
    var itemMap = {};
    items.forEach(function(it) { itemMap[it.key] = it; });

    var out = [];
    parsed.suggestions.forEach(function(sg) {
      if (!sg || !sg.key) return;
      var it = itemMap[sg.key];
      if (!it) return;
      var to = sg.to || it.where;
      if (!validWhere[to]) to = it.where;
      if (it.type === 'relation') to = 'panel.4';
      if (it.type === 'list') to = 'panel.5';
      out.push({
        key: it.key,
        name: it.name,
        type: it.type,
        from: it.where,
        to: to,
        reason: sg.reason || '',
        changed: it.where !== to
      });
    });

    items.forEach(function(it) {
      if (!out.some(function(x) { return x.key === it.key; })) {
        out.push({
          key: it.key, name: it.name, type: it.type,
          from: it.where, to: it.where,
          reason: '（AI 未提及，保留原位）',
          changed: false
        });
      }
    });

    return out;
  }

  function applyMovements(card, suggestions, acceptedMap) {
    var cardCopy = JSON.parse(JSON.stringify(card));

    var allByKey = {};
    (cardCopy.hud || []).forEach(function(x) { if (x.key) allByKey[x.key] = { item: x, where: 'hud' }; });
    (cardCopy.sidebar || []).forEach(function(x) { if (x.key) allByKey[x.key] = { item: x, where: 'sidebar' }; });
    (cardCopy.panels || []).forEach(function(p) {
      (p.entries || []).forEach(function(e) {
        if (e.key) allByKey[e.key] = { item: e, where: 'panel.' + p.num };
      });
    });

    var toMove = [];
    suggestions.forEach(function(sg) {
      if (!acceptedMap[sg.key]) return;
      var found = allByKey[sg.key];
      if (!found) return;
      if (found.where === sg.to) return;
      toMove.push({ item: found.item, target: sg.to, from: found.where });
    });

    toMove.forEach(function(mv) {
      var from = mv.from;
      if (from === 'hud') cardCopy.hud = (cardCopy.hud || []).filter(function(x) { return x !== mv.item; });
      else if (from === 'sidebar') cardCopy.sidebar = (cardCopy.sidebar || []).filter(function(x) { return x !== mv.item; });
      else if (from.indexOf('panel.') === 0) {
        var num = parseInt(from.replace('panel.', ''), 10);
        var p = (cardCopy.panels || []).find(function(x) { return x.num === num; });
        if (p) p.entries = (p.entries || []).filter(function(x) { return x !== mv.item; });
      }
    });

    toMove.forEach(function(mv) {
      var to = mv.target;
      if (to === 'hud') {
        if (!cardCopy.hud) cardCopy.hud = [];
        cardCopy.hud.push(mv.item);
      } else if (to === 'sidebar') {
        if (!cardCopy.sidebar) cardCopy.sidebar = [];
        cardCopy.sidebar.push(mv.item);
      } else if (to.indexOf('panel.') === 0) {
        var num = parseInt(to.replace('panel.', ''), 10);
        var p = (cardCopy.panels || []).find(function(x) { return x.num === num; });
        if (p) {
          if (!p.entries) p.entries = [];
          p.entries.push(mv.item);
        }
      }
    });

    return { card: cardCopy, movedCount: toMove.length };
  }

  var state = {
    cardId: null,
    items: [],
    suggestions: [],
    accepted: {},
    loading: false,
    errMsg: null
  };

  async function open(cardId) {
    if (typeof ApiClient === 'undefined' || typeof ApiManager === 'undefined') {
      UI.toast('引擎模块未加载', { type: 'error' });
      return;
    }
    var card = Storage.getAllCards()[cardId];
    if (!card) { UI.toast('卡带不存在', { type: 'error' }); return; }

    state.cardId = cardId;
    state.items = extractAllNumbers(card);
    state.suggestions = [];
    state.accepted = {};
    state.loading = true;
    state.errMsg = null;

    renderPanel(card);
    await requestAI(card);
  }

  async function requestAI(card) {
    try {
      var prompt = buildPrompt(card, state.items);
      var content = await ApiClient.chat([
        { role: 'user', content: prompt }
      ], { max_tokens: 4000, temperature: 0.3 });

      if (typeof content === 'object' && content && content.content) content = content.content;
      if (typeof content !== 'string') content = String(content || '');

      var suggestions = parseSuggestions(content, state.items);
      if (!suggestions) {
        state.loading = false;
        state.errMsg = 'AI 返回无法解析，请重试。原始内容（开头 400 字）：\n\n' + content.slice(0, 400);
        renderPanel(card);
        return;
      }
      state.suggestions = suggestions;
      // 默认全部勾选
      suggestions.forEach(function(sg) { state.accepted[sg.key] = true; });
      state.loading = false;
      renderPanel(card);
    } catch (e) {
      state.loading = false;
      state.errMsg = '出错：' + e.message;
      renderPanel(card);
    }
  }

  function renderPanel(card) {
    var existing = document.getElementById('classify-panel');
    if (existing) existing.remove();

    var wrap = document.createElement('div');
    wrap.id = 'classify-panel';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:100005;display:flex;align-items:center;justify-content:center;padding:12px;';

    var inner = document.createElement('div');
    inner.style.cssText = 'background:var(--c-bg-panel);color:var(--c-text);border-radius:12px;width:100%;max-width:720px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;';

    var header = document.createElement('div');
    header.style.cssText = 'padding:14px 18px;border-bottom:1px solid var(--c-border);flex-shrink:0;';
    header.innerHTML = '<div style="font-size:15px;color:var(--c-accent);">🎯 分类审核 · ' + escapeHtmlLocal(card.cardName || card.cardId) + '</div>';

    var body = document.createElement('div');
    body.id = 'cls-body';
    body.style.cssText = 'flex:1;overflow-y:auto;padding:14px 18px;font-size:13px;line-height:1.75;';

    var html = '';
    if (state.errMsg) {
      html += '<div style="background:var(--c-deep-error-bg);border-left:3px solid var(--c-danger);padding:10px 12px;border-radius:4px;color:var(--c-deep-error-text);white-space:pre-wrap;font-size:12.5px;">' + escapeHtmlLocal(state.errMsg) + '</div>';
    } else if (state.loading) {
      html += '<div style="padding:30px;text-align:center;color:var(--c-accent);">（AI 正在分析 ' + state.items.length + ' 条数值…）</div>';
    } else {
      html += '<div id="cls-stats" style="background:var(--c-bg-panel);padding:10px 12px;border-radius:8px;margin-bottom:14px;font-size:12.5px;line-height:1.7;"></div>';
      html += renderSuggestions();
    }
    body.innerHTML = html;

    var footer = document.createElement('div');
    footer.id = 'cls-footer';
    footer.style.cssText = 'padding:12px 18px;border-top:1px solid var(--c-border);display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0;';

    if (!state.loading && state.suggestions.length) {
      footer.innerHTML =
        '<button id="cls-all-yes" style="flex:1;min-width:100px;padding:10px;border-radius:8px;background:var(--c-border);color:var(--c-accent);border:1px solid var(--c-border-strong);cursor:pointer;font-size:13px;"><span data-icon="check"></span> 全部接受</button>' +
        '<button id="cls-all-no" style="flex:1;min-width:100px;padding:10px;border-radius:8px;background:var(--c-border-strong);color:var(--c-text);border:none;cursor:pointer;font-size:13px;"><span data-icon="x"></span> 全部拒绝</button>' +
        '<button id="cls-apply" style="flex:1;min-width:140px;padding:10px;border-radius:8px;background:var(--c-primary);color:var(--c-bg-white);border:none;cursor:pointer;font-size:13px;"><span data-icon="check"></span> 写入卡带</button>' +
        '<button id="cls-cancel" style="flex:0 0 auto;padding:10px 14px;border-radius:8px;background:var(--c-border-strong);color:var(--c-text);border:none;cursor:pointer;font-size:13px;">取消</button>';
    } else {
      footer.innerHTML = '<button id="cls-cancel" style="flex:1;padding:10px;border-radius:8px;background:var(--c-border-strong);color:var(--c-text);border:none;cursor:pointer;font-size:13px;">关闭</button>';
    }

    inner.appendChild(header);
    inner.appendChild(body);
    inner.appendChild(footer);
    wrap.appendChild(inner);
    document.body.appendChild(wrap);
    if (typeof UI !== 'undefined' && UI.fillIcons) UI.fillIcons(wrap);

    // 首次渲染后立即更新一次统计
    updateStats();
    bindEvents();
  }

  function renderSuggestions() {
    var html = '';
    var changedCount = state.suggestions.filter(function(s) { return s.changed; }).length;
    if (!changedCount) {
      html += '<div style="color:var(--c-success);padding:10px 0;"><span data-icon="check"></span> AI 认为所有数值都在合适的位置。</div>';
    }
    state.suggestions.forEach(function(s) {
      var isChanged = s.changed;
      var accepted = state.accepted[s.key];
      var borderColor = !isChanged ? 'var(--c-border)' : (accepted ? 'var(--c-primary)' : 'var(--c-danger)');
      var bgColor = !isChanged ? 'var(--c-bg-panel)' : (accepted ? 'var(--c-info-bg)' : 'var(--c-deep-rejected-bg)');
      html += '<div data-cls-card="' + escapeHtmlLocal(s.key) + '" style="background:' + bgColor + ';border-left:3px solid ' + borderColor + ';padding:10px 12px;border-radius:6px;margin-bottom:8px;transition:background 0.15s, border-color 0.15s;">';
      html += '<div style="display:flex;align-items:flex-start;gap:8px;">';
      if (isChanged) {
        html += '<input type="checkbox" data-cls-key="' + escapeHtmlLocal(s.key) + '" ' + (accepted ? 'checked' : '') + ' style="width:auto;margin-top:4px;flex-shrink:0;cursor:pointer;">';
      } else {
        html += '<span style="width:16px;flex-shrink:0;"></span>';
      }
      html += '<div style="flex:1;min-width:0;">';
      html += '<div style="color:var(--c-text);"><b>' + escapeHtmlLocal(s.name || s.key) + '</b>';
      if (isChanged) {
        html += ' <span style="color:var(--c-text-muted2);">·</span> ';
        html += '<span style="color:var(--c-warning);">' + escapeHtmlLocal(WHERE_LABEL[s.from] || s.from) + '</span>';
        html += ' <span style="color:var(--c-text-muted2);">→</span> ';
        html += '<span style="color:var(--c-success);">' + escapeHtmlLocal(WHERE_LABEL[s.to] || s.to) + '</span>';
      } else {
        html += ' <span style="color:var(--c-text-muted2);">（位置正确）</span>';
      }
      html += '</div>';
      if (s.reason) {
        html += '<div style="color:var(--c-text-muted2);font-size:12px;margin-top:4px;">' + escapeHtmlLocal(s.reason) + '</div>';
      }
      html += '</div></div></div>';
    });
    return html;
  }

  function updateStats() {
    var el = document.getElementById('cls-stats');
    if (!el) return;
    var changedCount = state.suggestions.filter(function(s) { return s.changed; }).length;
    var acceptedCount = state.suggestions.filter(function(s) { return state.accepted[s.key] && s.changed; }).length;
    var color = acceptedCount === changedCount ? 'var(--c-success)' : (acceptedCount === 0 ? 'var(--c-danger)' : 'var(--c-warning)');
    el.innerHTML = '共 <b>' + state.items.length + '</b> 条数值 · AI 建议改动 <b style="color:' + (changedCount ? 'var(--c-warning)' : 'var(--c-success)') + ';">' + changedCount + '</b> 条 · 已选中接受 <b style="color:' + color + ';">' + acceptedCount + '</b> 条';
  }

  function applyAcceptedVisual() {
    // 更新所有 checkbox 状态
    var boxes = document.querySelectorAll('#classify-panel input[data-cls-key]');
    boxes.forEach(function(b) {
      b.checked = !!state.accepted[b.getAttribute('data-cls-key')];
    });
    // 更新所有卡片边框和背景
    state.suggestions.forEach(function(s) {
      if (!s.changed) return;
      var cardEl = document.querySelector('[data-cls-card="' + s.key + '"]');
      if (!cardEl) return;
      if (state.accepted[s.key]) {
        cardEl.style.background = 'var(--c-info-bg)';
        cardEl.style.borderLeftColor = 'var(--c-primary)';
      } else {
        cardEl.style.background = 'var(--c-deep-rejected-bg)';
        cardEl.style.borderLeftColor = 'var(--c-danger)';
      }
    });
    updateStats();
  }

  function bindEvents() {
    var cancelBtn = document.getElementById('cls-cancel');
    if (cancelBtn) cancelBtn.onclick = closePanel;

    var allYes = document.getElementById('cls-all-yes');
    if (allYes) allYes.onclick = function() {
      state.suggestions.forEach(function(s) { state.accepted[s.key] = true; });
      applyAcceptedVisual();
    };
    var allNo = document.getElementById('cls-all-no');
    if (allNo) allNo.onclick = function() {
      state.suggestions.forEach(function(s) { state.accepted[s.key] = false; });
      applyAcceptedVisual();
    };
    var applyBtn = document.getElementById('cls-apply');
    if (applyBtn) applyBtn.onclick = applyAndSave;

    // 单个 checkbox
    document.querySelectorAll('#classify-panel input[data-cls-key]').forEach(function(box) {
      box.onchange = function() {
        var key = box.getAttribute('data-cls-key');
        state.accepted[key] = box.checked;
        // 只更新这一个卡片的样式，不重建面板
        var cardEl = document.querySelector('[data-cls-card="' + key + '"]');
        if (cardEl) {
          if (box.checked) {
            cardEl.style.background = 'var(--c-info-bg)';
            cardEl.style.borderLeftColor = 'var(--c-primary)';
          } else {
            cardEl.style.background = 'var(--c-deep-rejected-bg)';
            cardEl.style.borderLeftColor = 'var(--c-danger)';
          }
        }
        updateStats();
      };
    });
  }

  function closePanel() {
    var existing = document.getElementById('classify-panel');
    if (existing) existing.remove();
  }

  function applyAndSave() {
    var card = Storage.getAllCards()[state.cardId];
    if (!card) { UI.toast('卡带不存在', { type: 'error' }); return; }

    var r = applyMovements(card, state.suggestions, state.accepted);
    var cardCopy = r.card;

    if (!cardCopy.meta) cardCopy.meta = {};
    cardCopy.meta.classified = true;
    cardCopy.meta.classifiedAt = new Date().toISOString();
    var snapshot = JSON.parse(JSON.stringify(cardCopy));
    if (snapshot.meta) delete snapshot.meta;
    cardCopy.meta.classifiedSnapshot = snapshot;

    var imported = Storage.getImportedCards();
    imported[state.cardId] = cardCopy;
    Storage.setImportedCards(imported);

    closePanel();
    UI.toast('已应用分类，移动了 ' + r.movedCount + ' 条数值。\n\n卡带已标记为"已分类"。', { type: 'success' });
    if (typeof UI !== 'undefined' && UI.renderCardPicker) UI.renderCardPicker();
  }

  

  globalThis.CardClassify = {
    open: open,
    close: closePanel,
    isLoaded: function() { return true; }
  };

  // P1-G：RN 副本专属导出口（闭包内变量外部不可见，故必须在 })(); 之前）。
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { extractAllNumbers: extractAllNumbers, normItem: normItem,
      buildPrompt: buildPrompt, parseSuggestions: parseSuggestions, applyMovements: applyMovements };
  }
})();
