// ============================================================
// 卡带运行时自修复
// v3：checkPlayerFields 改用 Alias.ALIASES（不再重复硬编码别名表）
// ============================================================

(function() {
  var escapeHtmlLocal = (typeof Escape !== 'undefined' && Escape.html) ? Escape.html : function(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]; }); };

  // ============ 结构修复 ============

  function repairCardStructure(card) {
    var fixed = [];
    if (!card || typeof card !== 'object') return { card: card, fixed: fixed };

    (card.hud || []).forEach(function(h, i) {
      if (h.init == null) { h.init = 0; fixed.push('hud[' + i + '] 补 init=0'); }
      if (h.max == null) { h.max = 100; fixed.push('hud[' + i + '] 补 max=100'); }
    });

    (card.sidebar || []).forEach(function(s, i) {
      if (s.init == null) s.init = 0;
      if (s.max == null) s.max = 100;
    });

    (card.panels || []).forEach(function(p, i) {
      if (!Array.isArray(p.entries)) {
        p.entries = [];
        fixed.push('panels[' + i + '] entries 不是数组，已重置');
      }
      p.entries.forEach(function(e, ei) {
        if (!e.type) { e.type = 'number'; fixed.push('panel ' + p.id + ' entry[' + ei + '] 补 type=number'); }
        if (e.current == null && e.type === 'number') e.current = 0;
      });
    });

    (card.steps || []).forEach(function(s) {
      if (!Array.isArray(s.fields)) s.fields = [];
      s.fields.forEach(function(f) { if (!f.type) f.type = 'text'; });
    });

    if (!card.worldbook) card.worldbook = {};
    var wb = card.worldbook;
    if (!wb.worldSetting || typeof wb.worldSetting !== 'object') wb.worldSetting = {};
    if (!Array.isArray(wb.npcs)) wb.npcs = [];
    if (!Array.isArray(wb.factions)) wb.factions = [];
    if (!Array.isArray(wb.items)) wb.items = [];
    if (!Array.isArray(wb.skills)) wb.skills = [];
    if (!Array.isArray(wb.races)) wb.races = [];
    if (!Array.isArray(wb.occupations)) wb.occupations = [];
    if (!Array.isArray(wb.maps)) wb.maps = [];
    if (!wb.mapNodes || typeof wb.mapNodes !== 'object') wb.mapNodes = {};
    if (Array.isArray(wb.mapNodes)) {
      var obj = {};
      wb.mapNodes.forEach(function(n) { if (n && n.id) obj[n.id] = n; });
      wb.mapNodes = obj;
      fixed.push('mapNodes 是数组，已转对象');
    }
    if (!wb.timeline || typeof wb.timeline !== 'object') wb.timeline = { official: [], fanFuture: [], playerLine: [] };
    if (!Array.isArray(wb.timeline.official)) wb.timeline.official = [];
    if (!Array.isArray(wb.shops)) wb.shops = [];

    return { card: card, fixed: fixed };
  }

  function repairMapNodes(wb) {
    var fixed = [];
    var nodes = wb.mapNodes || {};
    if (!nodes || typeof nodes !== 'object') return fixed;

    Object.keys(nodes).forEach(function(k) {
      if (!nodes[k] || typeof nodes[k] !== 'object') { delete nodes[k]; fixed.push('mapNodes.' + k + ' 非对象，已删除'); }
    });

    Object.keys(nodes).forEach(function(k) {
      var n = nodes[k];
      if (!n.id) n.id = k;
      if (!Array.isArray(n.childrenIds)) n.childrenIds = [];
      if (n.parentId === undefined) n.parentId = null;
    });

    Object.keys(nodes).forEach(function(k) {
      var n = nodes[k];
      if (n.parentId && !nodes[n.parentId]) {
        n.parentId = null;
        fixed.push('地图 "' + (n.name || k) + '" 父节点无效，已转根节点');
      }
    });

    var childMap = {};
    Object.keys(nodes).forEach(function(k) {
      var n = nodes[k];
      if (n.parentId && nodes[n.parentId]) {
        if (!childMap[n.parentId]) childMap[n.parentId] = [];
        if (childMap[n.parentId].indexOf(k) === -1) childMap[n.parentId].push(k);
      }
    });
    Object.keys(nodes).forEach(function(k) {
      var n = nodes[k];
      var merged = (n.childrenIds || []).filter(function(c) { return nodes[c]; });
      (childMap[k] || []).forEach(function(c) { if (merged.indexOf(c) === -1) merged.push(c); });
      n.childrenIds = merged;
    });

    CardValidator.normalizeDefs(wb.maps).forEach(function(tree) {
      if (tree.rootId && nodes[tree.rootId]) return;
      var orphans = Object.keys(nodes).filter(function(k) { return !nodes[k].parentId; });
      if (orphans.length > 0) {
        tree.rootId = orphans[0];
        fixed.push('树「' + (tree.name || '?') + '」rootId 已重绑到「' + (nodes[orphans[0]].name || orphans[0]) + '」');
      }
    });

    return fixed;
  }

  // ============ v2 修复 ============

  function repairExistence(card) {
    var fixed = [];
    var ws = (card.worldbook && card.worldbook.worldSetting) || {};
    if (!ws.existence || typeof ws.existence !== 'object') {
      ws.existence = { has: [], hasNot: [] };
      fixed.push('补 worldSetting.existence（空）');
    }
    if (!Array.isArray(ws.existence.has)) ws.existence.has = [];
    if (!Array.isArray(ws.existence.hasNot)) ws.existence.hasNot = [];
    return fixed;
  }

  function repairEraProducts(card) {
    var fixed = [];
    var ws = (card.worldbook && card.worldbook.worldSetting) || {};
    if (!Array.isArray(ws.eraProducts)) {
      ws.eraProducts = [];
      fixed.push('补 worldSetting.eraProducts（空数组）');
      return fixed;
    }
    ws.eraProducts.forEach(function(seg, i) {
      if (!seg.id) seg.id = 'era_fix_' + Date.now() + '_' + i;
      if (!Array.isArray(seg.has)) seg.has = [];
      if (!Array.isArray(seg.hasNot)) seg.hasNot = [];
      if (seg.from != null && seg.to != null && seg.from > seg.to) {
        var tmp = seg.from; seg.from = seg.to; seg.to = tmp;
        fixed.push('eraProducts[' + i + '] from/to 颠倒，已交换');
      }
    });
    return fixed;
  }

  function repairShops(card) {
    var fixed = [];
    var wb = card.worldbook || {};
    if (!Array.isArray(wb.shops)) {
      wb.shops = [];
      return fixed;
    }
    var shopId = 0, itemId = 0;
    wb.shops.forEach(function(s, i) {
      if (!s.id) { s.id = 'shop_fix_' + Date.now() + '_' + (shopId++); fixed.push('商店[' + i + '] 补 id'); }
      if (!s.name) s.name = '商店' + (i + 1);
      if (!Array.isArray(s.items)) { s.items = []; fixed.push('商店「' + s.name + '」items 不是数组，已重置'); }
      s.items.forEach(function(it, ii) {
        if (!it.id) { it.id = 'si_fix_' + Date.now() + '_' + (itemId++); fixed.push('「' + s.name + '」第 ' + (ii+1) + ' 个商品补 id'); }
        if (!it.name) it.name = '商品' + (ii + 1);
        if (it.price == null) it.price = 0;
        if (it.stock == null) it.stock = -1;
        if (!it.category) it.category = 'common';
      });
    });
    return fixed;
  }

  function repairNpcWeights(card) {
    var fixed = [];
    var wb = card.worldbook || {};
    CardValidator.normalizeDefs(wb.npcs).forEach(function(n) {
      if (!n.id) return;
      if (n.weight == null) {
        n.weight = 5;
        fixed.push('NPC「' + (n.name || n.id) + '」补 weight=5');
      } else if (typeof n.weight !== 'number' || n.weight < 1) {
        n.weight = 1;
        fixed.push('NPC「' + (n.name || n.id) + '」weight 越界，修正为 1');
      } else if (n.weight > 10) {
        n.weight = 10;
        fixed.push('NPC「' + (n.name || n.id) + '」weight 越界，修正为 10');
      }
      if (!Array.isArray(n.keywords)) {
        var kws = [];
        if (n.name) kws.push(n.name);
        (n.tags || []).forEach(function(t) { if (kws.indexOf(t) < 0) kws.push(t); });
        n.keywords = kws.slice(0, 8);
        if (kws.length) fixed.push('NPC「' + (n.name || n.id) + '」自动补 keywords：' + kws.slice(0, 3).join('/') + (kws.length > 3 ? ' 等' : ''));
      }
    });
    return fixed;
  }

  // ============ 引用一致性检查 ============

  function checkReferences(wb) {
    var problems = [];
    var npcIds = {}, facIds = {}, mapIds = {}, itemIds = {};
    CardValidator.normalizeDefs(wb.npcs).forEach(function(n) { if (n.id) npcIds[n.id] = n.name || n.id; });
    CardValidator.normalizeDefs(wb.factions).forEach(function(f) { if (f.id) facIds[f.id] = f.name || f.id; });
    Object.keys(wb.mapNodes || {}).forEach(function(k) { mapIds[k] = (wb.mapNodes[k].name) || k; });
    CardValidator.normalizeDefs(wb.items).forEach(function(it) { if (it.id) itemIds[it.id] = it.name || it.id; });

    CardValidator.normalizeDefs(wb.npcs).forEach(function(n) {
      (n.factions || []).forEach(function(fa) {
        if (fa.factionId && !facIds[fa.factionId]) problems.push('NPC「' + (n.name || n.id) + '」引用不存在的势力 ' + fa.factionId);
      });
      (n.relations || []).forEach(function(r) {
        if (r.targetId && !npcIds[r.targetId]) problems.push('NPC「' + (n.name || n.id) + '」引用不存在的 NPC ' + r.targetId);
      });
    });

    CardValidator.normalizeDefs(wb.factions).forEach(function(f) {
      (f.linkedNPCs || []).forEach(function(nid) {
        if (!npcIds[nid]) problems.push('势力「' + (f.name || f.id) + '」引用不存在的 NPC ' + nid);
      });
      (f.relations || []).forEach(function(r) {
        if (r.targetId && !facIds[r.targetId]) problems.push('势力「' + (f.name || f.id) + '」引用不存在的势力 ' + r.targetId);
      });
    });

    Object.keys(wb.mapNodes || {}).forEach(function(id) {
      var n = wb.mapNodes[id];
      (n.linkedNPCs || []).forEach(function(nid) {
        if (!npcIds[nid]) problems.push('地图「' + (n.name || id) + '」引用不存在的 NPC ' + nid);
      });
      (n.linkedItems || []).forEach(function(iid) {
        if (!itemIds[iid]) problems.push('地图「' + (n.name || id) + '」引用不存在的物品 ' + iid);
      });
    });

    CardValidator.normalizeDefs(wb.shops).forEach(function(s) {
      if (s.npcId && !npcIds[s.npcId]) problems.push('商店「' + (s.name || s.id) + '」引用不存在的 NPC ' + s.npcId);
      if (s.locationId && !mapIds[s.locationId]) problems.push('商店「' + (s.name || s.id) + '」引用不存在的地图 ' + s.locationId);
    });

    return problems;
  }

  function checkPanelsEmpty(card) {
    var empties = [];
    (card.panels || []).forEach(function(p) {
      if (!p.entries || p.entries.length === 0) {
        empties.push('面板 ' + p.num + '「' + (p.name || '') + '」');
      }
    });
    return empties;
  }

  // ★ 改用 Alias.ALIASES，不再自己硬编码一份别名表
  function checkPlayerFields(card) {
    var missing = [];
    var checkKeys = ['name', 'gender', 'age'];

    // Alias 未加载时保守跳过，不误报
    if (typeof Alias === 'undefined' || !Alias.ALIASES || !Alias.hasAliasFor) {
      return missing;
    }

    var found = {};
    checkKeys.forEach(function(k) { found[k] = false; });

    (card.steps || []).forEach(function(s) {
      (s.fields || []).forEach(function(f) {
        if (!f.key) return;
        checkKeys.forEach(function(std) {
          if (found[std]) return;
          if (Alias.hasAliasFor(std, f.key)) found[std] = true;
        });
      });
    });

    checkKeys.forEach(function(k) { if (!found[k]) missing.push(k); });
    return missing;
  }

  // ============ 主流程 ============

  function repairCard(cardId) {
    // D-2：检修对原始畸形动手，走 raw 出口（消费咽喉会掩盖畸形）
    var card = Storage.getRawAllCards()[cardId];
    if (!card) return { ok: false, reason: '卡带不存在' };

    var cardCopy = JSON.parse(JSON.stringify(card));
    var report = { cardId: cardId, autoFixed: [], warnings: [], problems: [] };

    var r1 = repairCardStructure(cardCopy);
    report.autoFixed = report.autoFixed.concat(r1.fixed);

    var r2 = repairMapNodes(cardCopy.worldbook);
    report.autoFixed = report.autoFixed.concat(r2);

    var r3 = repairExistence(cardCopy);
    report.autoFixed = report.autoFixed.concat(r3);

    var r4 = repairEraProducts(cardCopy);
    report.autoFixed = report.autoFixed.concat(r4);

    var r5 = repairShops(cardCopy);
    report.autoFixed = report.autoFixed.concat(r5);

    var r6 = repairNpcWeights(cardCopy);
    report.autoFixed = report.autoFixed.concat(r6);

    var refProblems = checkReferences(cardCopy.worldbook);
    report.problems = report.problems.concat(refProblems);

    var emptyPanels = checkPanelsEmpty(cardCopy);
    emptyPanels.forEach(function(p) {
      report.warnings.push(p + ' 没有内容（卡带作者没填）');
    });

    var missingFields = checkPlayerFields(cardCopy);
    missingFields.forEach(function(f) {
      report.warnings.push('创建流程缺少「' + ({name:'姓名', gender:'性别', age:'年龄'})[f] + '」字段');
    });

    if (report.autoFixed.length > 0) {
      // D-2：回写亦走 raw 读线，未修复卡保持原始形态原样往返
      var imported = Storage.getRawImportedCards();
      imported[cardId] = cardCopy;
      Storage.setImportedCards(imported);
    }

    return { ok: true, report: report, card: cardCopy };
  }

  // ============ UI ============

  function showRepairPanel(result) {
    var r = result.report;
    if (!r.autoFixed.length && !r.warnings.length && !r.problems.length) {
      console.log('[RuntimeRepair] ✓ 卡带 ' + r.cardId + ' 无问题');
      Platform.ui.toast('卡带检查完毕，没有发现问题', { type: 'success' });
      return;
    }

    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:100003;display:flex;align-items:center;justify-content:center;padding:16px;';

    var inner = document.createElement('div');
    inner.style.cssText = 'background:var(--c-bg-panel);color:var(--c-text);border-radius:12px;width:100%;max-width:640px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;';

    var header = document.createElement('div');
    header.style.cssText = 'padding:14px 18px;border-bottom:1px solid var(--c-border);font-size:15px;color:var(--c-accent);flex-shrink:0;';
    header.textContent = '🛠 卡带运行时检查';

    var body = document.createElement('div');
    body.style.cssText = 'flex:1;overflow-y:auto;padding:16px 18px;font-size:13px;line-height:1.75;color:var(--c-text-2);';

    var html = '';
    if (r.autoFixed.length) {
      html += '<div style="color:var(--c-success);font-weight:500;margin-bottom:8px;"><span data-icon="check"></span> 已自动修复 ' + r.autoFixed.length + ' 项</div>';
      r.autoFixed.slice(0, 20).forEach(function(x) {
        html += '<div style="margin-left:12px;color:var(--c-text-muted);font-size:12.5px;">· ' + escapeHtmlLocal(x) + '</div>';
      });
      if (r.autoFixed.length > 20) html += '<div style="margin-left:12px;color:var(--c-text-muted2);font-size:12px;">… 还有 ' + (r.autoFixed.length - 20) + ' 项</div>';
      html += '<div style="height:12px;"></div>';
    }
    if (r.warnings.length) {
      html += '<div style="color:var(--c-warning);font-weight:500;margin-bottom:8px;"><span data-icon="warning"></span> 警告 ' + r.warnings.length + ' 项</div>';
      r.warnings.slice(0, 15).forEach(function(x) {
        html += '<div style="margin-left:12px;color:var(--c-text-faint);font-size:12.5px;">· ' + escapeHtmlLocal(x) + '</div>';
      });
      if (r.warnings.length > 15) html += '<div style="margin-left:12px;color:var(--c-text-muted2);font-size:12px;">… 还有 ' + (r.warnings.length - 15) + ' 项</div>';
      html += '<div style="height:12px;"></div>';
    }
    if (r.problems.length) {
      html += '<div style="color:var(--c-danger);font-weight:500;margin-bottom:8px;">❌ 断裂引用 ' + r.problems.length + ' 处</div>';
      r.problems.slice(0, 15).forEach(function(x) {
        html += '<div style="margin-left:12px;color:var(--c-deep-error-text);font-size:12.5px;">· ' + escapeHtmlLocal(x) + '</div>';
      });
      if (r.problems.length > 15) html += '<div style="margin-left:12px;color:var(--c-text-muted2);font-size:12px;">… 还有 ' + (r.problems.length - 15) + ' 项</div>';
    }

    body.innerHTML = html;

    var footer = document.createElement('div');
    footer.style.cssText = 'padding:12px 18px;border-top:1px solid var(--c-border);display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0;';

    if (r.problems.length || r.warnings.length) {
      var btnCopy = document.createElement('button');
      btnCopy.textContent = '📋 复制报告给 AI';
      btnCopy.style.cssText = 'flex:1;min-width:140px;padding:10px;border-radius:8px;background:var(--c-primary);color:var(--c-bg-white);border:none;cursor:pointer;font-size:13px;';
      btnCopy.onclick = function() { copyReport(r); };
      footer.appendChild(btnCopy);
    }

    var btnOk = document.createElement('button');
    btnOk.textContent = '关闭';
    btnOk.style.cssText = 'flex:0 0 auto;padding:10px 18px;border-radius:8px;background:var(--c-border-strong);color:var(--c-text);border:none;cursor:pointer;font-size:13px;';
    btnOk.onclick = function() { wrap.remove(); };
    footer.appendChild(btnOk);

    inner.appendChild(header);
    inner.appendChild(body);
    inner.appendChild(footer);
    wrap.appendChild(inner);
    document.body.appendChild(wrap);
    Platform.ui.fillIcons(wrap); // D-3：Platform.ui 契约双端保证，冗余守卫删除
  }

  

  function copyReport(r) {
    var lines = [];
    lines.push('=== 卡带运行时检查报告 ===');
    lines.push('卡带：' + r.cardId);
    lines.push('');
    if (r.autoFixed.length) {
      lines.push('--- 已自动修复 ---');
      r.autoFixed.forEach(function(x) { lines.push('· ' + x); });
      lines.push('');
    }
    if (r.warnings.length) {
      lines.push('--- 警告 ---');
      r.warnings.forEach(function(x) { lines.push('· ' + x); });
      lines.push('');
    }
    if (r.problems.length) {
      lines.push('--- 断裂引用 ---');
      r.problems.forEach(function(x) { lines.push('· ' + x); });
      lines.push('');
    }
    lines.push('请根据上述报告修复卡带 JSON。');
    var text = lines.join('\n');

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() { Platform.ui.toast('已复制', { type: 'success' }); }).catch(function() { fallbackCopy(text); });
        return;
      }
    } catch (e) {}
    fallbackCopy(text);
  }

  function fallbackCopy(text) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:100004;display:flex;align-items:center;justify-content:center;padding:16px;';
    var inner = document.createElement('div');
    inner.style.cssText = 'background:var(--c-bg-panel);color:var(--c-text);border-radius:12px;padding:16px;width:100%;max-width:720px;max-height:90vh;display:flex;flex-direction:column;';
    inner.innerHTML = '<div style="margin-bottom:10px;font-size:14px;">长按下方文本 → 全选 → 复制</div>';
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'flex:1;min-height:280px;background:var(--c-bg-panel);color:var(--c-text-2);border:1px solid var(--c-border);border-radius:6px;padding:10px;font-family:monospace;font-size:11px;resize:none;';
    var btn = document.createElement('button');
    btn.textContent = '关闭';
    btn.style.cssText = 'margin-top:10px;padding:10px;border-radius:8px;background:var(--c-border-strong);color:var(--c-text);border:none;cursor:pointer;';
    btn.onclick = function() { wrap.remove(); };
    inner.appendChild(ta);
    inner.appendChild(btn);
    wrap.appendChild(inner);
    document.body.appendChild(wrap);
    ta.focus();
    ta.select();
  }

  var RuntimeRepair = {
    repairCard: repairCard,
    showRepairPanel: showRepairPanel,
    runAndShow: function(cardId) {
      var r = this.repairCard(cardId || (typeof GameState !== 'undefined' ? GameState.currentCardId : null));
      if (!r.ok) { Platform.ui.toast(r.reason, { type: 'error' }); return; }
      this.showRepairPanel(r);
      return r;
    }
  };
  if (typeof window !== 'undefined') window.RuntimeRepair = RuntimeRepair;
  if (typeof module !== 'undefined' && module.exports) module.exports = RuntimeRepair;
})();
