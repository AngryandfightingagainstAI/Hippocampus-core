// ============================================================
// 卡带诊断终端
// v3：修注释剥离会吃掉字符串内容的 bug（字符串感知剥离）
// ============================================================

(function() {
  var escapeHtmlLocal = (typeof Escape !== 'undefined' && Escape.html) ? Escape.html : function(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]; }); };

  // ★ 字符串感知的注释剥离
  //   JSON 字符串内部的 "//" 和 "/*" 不会被删
  function stripCommentsAware(str) {
    var out = '';
    var inStr = false;
    var strChar = '';
    var escape = false;
    var inLine = false;
    var inBlock = false;
    var i = 0;
    while (i < str.length) {
      var c = str[i];
      var n = str[i + 1];
      if (escape) { out += c; escape = false; i++; continue; }
      if (inStr) {
        if (c === '\\') escape = true;
        else if (c === strChar) inStr = false;
        out += c;
        i++;
        continue;
      }
      if (inLine) {
        if (c === '\n') { inLine = false; out += c; }
        i++;
        continue;
      }
      if (inBlock) {
        if (c === '*' && n === '/') { inBlock = false; i += 2; continue; }
        i++;
        continue;
      }
      if (c === '"' || c === "'") { inStr = true; strChar = c; out += c; i++; continue; }
      if (c === '/' && n === '/') { inLine = true; i += 2; continue; }
      if (c === '/' && n === '*') { inBlock = true; i += 2; continue; }
      out += c;
      i++;
    }
    return out;
  }

  function fixJSONText(raw) {
    if (!raw) return { result: '', fixed: 0, changes: [] };
    var str = String(raw);
    var changes = [];

    var before = str;
    str = str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    if (str !== before) changes.push('去除 markdown 代码块包裹');

    before = str;
    str = str.replace(/^\uFEFF/, '');
    if (str !== before) changes.push('去除 BOM 头');

    // ★ 字符串感知的注释剥离（行注释 + 块注释一步搞定）
    before = str;
    str = stripCommentsAware(str);
    if (str !== before) changes.push('去除注释（字符串内的 // 和 /* 会保留）');

    before = str;
    str = str.replace(/,(\s*[}\]])/g, '$1');
    if (str !== before) changes.push('去除尾随逗号');

    var stack = [];
    var inStr = false;
    var strChar = '';
    var escape = false;
    var result = '';
    var bracketFixed = 0;
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      if (escape) { escape = false; result += c; continue; }
      if (inStr) {
        if (c === '\\') escape = true;
        else if (c === strChar) inStr = false;
        result += c;
        continue;
      }
      if (c === '"' || c === "'") { inStr = true; strChar = c; result += c; continue; }
      if (c === '{' || c === '[') { stack.push(c); result += c; continue; }
      if (c === '}' || c === ']') {
        var expected = c === '}' ? '{' : '[';
        while (stack.length && stack[stack.length - 1] !== expected) {
          var missing = stack[stack.length - 1] === '{' ? '}' : ']';
          result = result.replace(/,\s*$/, '');
          result += missing;
          bracketFixed++;
          stack.pop();
        }
        if (stack.length) stack.pop();
        result += c;
        continue;
      }
      result += c;
    }
    while (stack.length) {
      var last = stack.pop();
      result = result.replace(/,\s*$/, '');
      result += (last === '{' ? '}' : ']');
      bracketFixed++;
    }
    if (bracketFixed > 0) changes.push('补全 ' + bracketFixed + ' 个括号');

    return { result: result, fixed: changes.length, changes: changes };
  }

  // ============ 原有检查 ============

  function checkJSONSyntax(raw) {
    var fix = fixJSONText(raw);
    try {
      var obj = JSON.parse(fix.result);
      return {
        id: 'json_syntax', label: 'JSON 语法',
        status: fix.fixed > 0 ? 'fixed' : 'pass',
        detail: fix.fixed > 0 ? fix.changes.join('、') : '正常',
        obj: obj,
        fixedText: fix.result
      };
    } catch (e) {
      return {
        id: 'json_syntax', label: 'JSON 语法',
        status: 'fail',
        detail: '无法解析：' + e.message,
        obj: null
      };
    }
  }

  function checkRequiredFields(card) {
    var req = ['schemaVersion', 'cardId', 'cardName', 'game', 'hud', 'sidebar', 'panels', 'attributes'];
    var missing = [];
    req.forEach(function(k) { if (!(k in card)) missing.push(k); });
    if (!card.game || !card.game.title) missing.push('game.title');
    if (!Array.isArray(card.hud)) missing.push('hud (必须是数组)');
    if (!Array.isArray(card.sidebar)) missing.push('sidebar (必须是数组)');
    if (!Array.isArray(card.panels)) missing.push('panels (必须是数组)');
    if (!Array.isArray(card.attributes)) missing.push('attributes (必须是数组)');

    if (missing.length) {
      return { id: 'required', label: '必填字段', status: 'fail', detail: '缺少：' + missing.join('、') };
    }
    return { id: 'required', label: '必填字段', status: 'pass', detail: '齐全' };
  }

  function checkPanels(card) {
    if (!Array.isArray(card.panels)) {
      return { id: 'panels', label: 'panels 结构', status: 'fail', detail: 'panels 不是数组' };
    }
    var nums = card.panels.map(function(p) { return p.num; }).sort();
    var missing = [2, 3, 4, 5].filter(function(n) { return nums.indexOf(n) < 0; });
    var emptyEntries = [];
    card.panels.forEach(function(p) {
      if (!Array.isArray(p.entries) || p.entries.length === 0) {
        emptyEntries.push('num=' + p.num + '（' + (p.name || '') + '）');
      }
    });
    if (missing.length) {
      return { id: 'panels', label: 'panels 结构', status: 'fail', detail: '缺少 num=' + missing.join('/') };
    }
    if (emptyEntries.length) {
      return { id: 'panels', label: 'panels 结构', status: 'warn', detail: '这些面板是空的（卡带作者没填）：' + emptyEntries.join('、') };
    }
    return { id: 'panels', label: 'panels 结构', status: 'pass', detail: '4 项齐全且有内容' };
  }

  function checkFieldAlias(playerSteps) {
    var stdKeys = ['name', 'gender', 'age', 'birth_year', 'house', 'identity', 'race', 'occupation'];
    var aliasesSeen = [];
    var unknownKeys = [];

    (playerSteps || []).forEach(function(s) {
      (s.fields || []).forEach(function(f) {
        if (!f.key) return;
        var isStd = stdKeys.indexOf(f.key) >= 0;
        var hasAlias = /^player_|^char_|^character_/i.test(f.key);
        if (!isStd && hasAlias) {
          aliasesSeen.push(f.key + '（label: ' + (f.label || '') + '）');
        } else if (!isStd && f.type && f.type !== 'number' && !/^attr_|^ability_|^appearance_|^goal_|^start_|^background_/.test(f.key)) {
          unknownKeys.push(f.key + '（label: ' + (f.label || '') + '）');
        }
      });
    });

    if (aliasesSeen.length) {
      return {
        id: 'alias', label: '字段名归一化',
        status: 'fixed',
        detail: '发现 ' + aliasesSeen.length + ' 个非标准字段名，运行时通过别名表兼容：' + aliasesSeen.slice(0, 5).join('、') + (aliasesSeen.length > 5 ? ' 等' : '')
      };
    }
    if (unknownKeys.length > 0) {
      return {
        id: 'alias', label: '字段名归一化',
        status: 'warn',
        detail: '自定义字段：' + unknownKeys.slice(0, 5).join('、') + (unknownKeys.length > 5 ? ' 等' : '')
      };
    }
    return { id: 'alias', label: '字段名归一化', status: 'pass', detail: '全部标准命名' };
  }

  function checkReferences(card) {
    var wb = card.worldbook || {};
    var npcIds = {}, mapIds = {}, factionIds = {}, itemIds = {};
    CardValidator.normalizeDefs(wb.npcs).forEach(function(n) { if (n.id) npcIds[n.id] = n.name || n.id; });
    Object.keys(wb.mapNodes || {}).forEach(function(k) { mapIds[k] = (wb.mapNodes[k].name) || k; });
    CardValidator.normalizeDefs(wb.factions).forEach(function(f) { if (f.id) factionIds[f.id] = f.name || f.id; });
    CardValidator.normalizeDefs(wb.items).forEach(function(it) { if (it.id) itemIds[it.id] = it.name || it.id; });

    var problems = [];

    CardValidator.normalizeDefs(wb.maps).forEach(function(m, i) {
      if (m.rootId && !mapIds[m.rootId]) {
        problems.push('maps[' + i + '] 的 rootId ' + m.rootId + ' 不存在');
      }
    });

    Object.keys(wb.mapNodes || {}).forEach(function(id) {
      var n = wb.mapNodes[id];
      if (n.parentId && !mapIds[n.parentId]) problems.push('地图「' + (n.name || id) + '」parentId 无效');
      (n.linkedNPCs || []).forEach(function(nid) {
        if (!npcIds[nid]) problems.push('地图「' + (n.name || id) + '」引用不存在的 NPC ' + nid);
      });
    });

    CardValidator.normalizeDefs(wb.npcs).forEach(function(n) {
      (n.factions || []).forEach(function(fa) {
        if (fa.factionId && !factionIds[fa.factionId]) problems.push('NPC「' + (n.name || n.id) + '」引用不存在的势力 ' + fa.factionId);
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
        if (r.targetId && !factionIds[r.targetId]) problems.push('势力「' + (f.name || f.id) + '」引用不存在的势力 ' + r.targetId);
      });
    });

    if (problems.length) {
      return { id: 'refs', label: '引用一致性', status: 'fail', detail: problems.length + ' 处断裂引用', problems: problems.slice(0, 20) };
    }
    return { id: 'refs', label: '引用一致性', status: 'pass', detail: '无断裂引用' };
  }

  // ============ 新增检查 ============

  function checkExistence(card) {
    var ws = (card.worldbook && card.worldbook.worldSetting) || {};
    var ex = ws.existence;
    if (!ex || typeof ex !== 'object') {
      return { id: 'existence', label: '世界边界', status: 'warn', detail: '未填 existence（建议填，否则 AI 容易编出现代物品）' };
    }
    var has = Array.isArray(ex.has) ? ex.has : [];
    var hasNot = Array.isArray(ex.hasNot) ? ex.hasNot : [];
    if (!has.length && !hasNot.length) {
      return { id: 'existence', label: '世界边界', status: 'warn', detail: 'existence 为空' };
    }
    var game = card.game || {};
    var era = game.eraRange || [];
    var isModern = (Array.isArray(era) && era.length && (Array.isArray(era[0]) ? era[0][0] : era[0]) >= 1900);
    if (!isModern && hasNot.length === 0) {
      return { id: 'existence', label: '世界边界', status: 'warn', detail: '非现代世界但 hasNot 为空，AI 可能编出现代物品' };
    }
    return { id: 'existence', label: '世界边界', status: 'pass', detail: 'has ' + has.length + ' / hasNot ' + hasNot.length };
  }

  function checkEraProducts(card) {
    var ws = (card.worldbook && card.worldbook.worldSetting) || {};
    var segs = ws.eraProducts;
    if (!segs) return { id: 'eraProducts', label: '年代产物', status: 'warn', detail: '未填 eraProducts' };
    if (!Array.isArray(segs)) return { id: 'eraProducts', label: '年代产物', status: 'fail', detail: 'eraProducts 必须是数组' };
    if (!segs.length) return { id: 'eraProducts', label: '年代产物', status: 'warn', detail: 'eraProducts 为空' };

    var problems = [];
    segs.forEach(function(seg, i) {
      if (seg.from == null || seg.to == null) problems.push('第 ' + (i+1) + ' 段 from/to 缺失');
      else if (seg.from > seg.to) problems.push('第 ' + (i+1) + ' 段 from > to');
    });

    if (problems.length) {
      return { id: 'eraProducts', label: '年代产物', status: 'warn', detail: problems.join('；') };
    }
    return { id: 'eraProducts', label: '年代产物', status: 'pass', detail: segs.length + ' 段' };
  }

  function checkShops(card) {
    var wb = card.worldbook || {};
    var shops = wb.shops;
    if (!shops) return { id: 'shops', label: '商店', status: 'pass', detail: '未使用（可忽略）' };
    if (!Array.isArray(shops)) return { id: 'shops', label: '商店', status: 'fail', detail: 'shops 必须是数组' };
    if (!shops.length) return { id: 'shops', label: '商店', status: 'pass', detail: '空数组' };

    var problems = [];
    shops.forEach(function(s, i) {
      if (!s.id) problems.push('第 ' + (i+1) + ' 家缺 id');
      if (!s.name) problems.push('第 ' + (i+1) + ' 家缺 name');
      if (!Array.isArray(s.items)) { problems.push('「' + (s.name || s.id) + '」items 不是数组'); return; }
      s.items.forEach(function(it, ii) {
        if (!it.id) problems.push('「' + (s.name || s.id) + '」第 ' + (ii+1) + ' 个商品缺 id');
        if (!it.name) problems.push('「' + (s.name || s.id) + '」第 ' + (ii+1) + ' 个商品缺 name');
        if (it.price == null) problems.push('「' + (s.name || s.id) + '」' + (it.name || '商品' + (ii+1)) + ' 缺 price');
      });
    });

    if (problems.length) {
      return { id: 'shops', label: '商店', status: 'warn', detail: problems.slice(0, 5).join('；') + (problems.length > 5 ? ' 等' : ''), problems: problems };
    }
    var totalItems = 0;
    shops.forEach(function(s) { totalItems += (s.items || []).length; });
    return { id: 'shops', label: '商店', status: 'pass', detail: shops.length + ' 家店 · ' + totalItems + ' 件商品' };
  }

  function checkNpcWeights(card) {
    var wb = card.worldbook || {};
    var npcs = CardValidator.normalizeDefs(wb.npcs);
    if (!npcs.length) return { id: 'npc_weights', label: 'NPC 权重', status: 'pass', detail: '无 NPC' };

    var problems = [];
    var noWeight = 0, noKeywords = 0, badWeight = 0;
    npcs.forEach(function(n) {
      if (n.weight == null) noWeight++;
      else if (typeof n.weight !== 'number' || n.weight < 1 || n.weight > 10) badWeight++;
      if (!Array.isArray(n.keywords) || n.keywords.length === 0) noKeywords++;
    });

    if (badWeight) problems.push(badWeight + ' 个 NPC weight 超出 1-10 范围');
    if (noWeight) problems.push(noWeight + ' 个 NPC 未填 weight（默认用 5）');
    if (noKeywords) problems.push(noKeywords + ' 个 NPC 未填 keywords');

    if (problems.length) {
      return { id: 'npc_weights', label: 'NPC 权重', status: 'warn', detail: problems.join('；') };
    }
    return { id: 'npc_weights', label: 'NPC 权重', status: 'pass', detail: npcs.length + ' 个 NPC 都有 weight / keywords' };
  }

  function checkCompleteness(card) {
    var wb = card.worldbook || {};
    var ws = wb.worldSetting || {};
    var stats = {
      hud: (card.hud || []).length,
      sidebar: (card.sidebar || []).length,
      panelsWithEntries: (card.panels || []).filter(function(p) { return (p.entries || []).length > 0; }).length,
      attributes: (card.attributes || []).length,
      steps: (card.steps || []).length,
      npcs: CardValidator.normalizeDefs(wb.npcs).length,
      factions: CardValidator.normalizeDefs(wb.factions).length,
      mapNodes: Object.keys(wb.mapNodes || {}).length,
      shops: CardValidator.normalizeDefs(wb.shops).length,
      hasExistence: !!(ws.existence && ((ws.existence.has || []).length || (ws.existence.hasNot || []).length)),
      eraProductsSegs: (ws.eraProducts || []).length,
      timelineEvents: ((wb.timeline || {}).official || []).length
    };

    var score = 0;
    if (stats.hud >= 3) score += 10;
    if (stats.sidebar >= 3) score += 10;
    if (stats.panelsWithEntries >= 3) score += 15;
    if (stats.attributes >= 3) score += 10;
    if (stats.steps >= 4) score += 10;
    if (stats.npcs >= 3) score += 10;
    if (stats.factions >= 2) score += 5;
    if (stats.mapNodes >= 5) score += 10;
    if (stats.timelineEvents >= 2) score += 5;
    if (stats.hasExistence) score += 5;
    if (stats.eraProductsSegs >= 1) score += 5;
    if (stats.shops >= 1) score += 5;

    var level = score >= 85 ? 'excellent' : score >= 60 ? 'good' : score >= 35 ? 'fair' : 'poor';
    var levelText = { excellent: '优秀', good: '良好', fair: '及格', poor: '残缺' }[level];

    return {
      id: 'completeness', label: '完整性',
      status: score >= 60 ? 'pass' : (score >= 35 ? 'warn' : 'fail'),
      detail: score + '% (' + levelText + ')',
      score: score,
      stats: stats
    };
  }

  // ============ 主流程 ============

  function diagnose(rawText) {
    var checks = [];
    var warnings = [];
    var fails = [];

    var jsonCheck = checkJSONSyntax(rawText);
    checks.push(jsonCheck);

    if (jsonCheck.status === 'fail') {
      return {
        ok: false, checks: checks, card: null, fixedText: null,
        warnings: warnings, fails: ['JSON 无法解析，后面的检查跳过']
      };
    }

    var card = jsonCheck.obj;

    var reqCheck = checkRequiredFields(card);
    checks.push(reqCheck);
    if (reqCheck.status === 'fail') {
      fails.push(reqCheck.detail);
      if (reqCheck.detail.indexOf('panels') >= 0 || reqCheck.detail.indexOf('hud') >= 0) {
        return { ok: false, checks: checks, card: card, fixedText: jsonCheck.fixedText, warnings: warnings, fails: fails };
      }
    }

    var panelCheck = checkPanels(card);
    checks.push(panelCheck);
    if (panelCheck.status === 'fail') fails.push(panelCheck.detail);
    if (panelCheck.status === 'warn') warnings.push(panelCheck.detail);

    var stepsCheck = checkFieldAlias(card.steps || []);
    checks.push(stepsCheck);
    if (stepsCheck.status === 'warn') warnings.push(stepsCheck.detail);

    var refCheck = checkReferences(card);
    checks.push(refCheck);
    if (refCheck.status === 'fail') warnings.push(refCheck.detail);

    var exCheck = checkExistence(card);
    checks.push(exCheck);
    if (exCheck.status === 'warn') warnings.push('世界边界：' + exCheck.detail);

    var eraCheck = checkEraProducts(card);
    checks.push(eraCheck);
    if (eraCheck.status === 'warn') warnings.push('年代产物：' + eraCheck.detail);

    var shopCheck = checkShops(card);
    checks.push(shopCheck);
    if (shopCheck.status === 'warn') warnings.push('商店：' + shopCheck.detail);

    var npcWCheck = checkNpcWeights(card);
    checks.push(npcWCheck);
    if (npcWCheck.status === 'warn') warnings.push('NPC 权重：' + npcWCheck.detail);

    var compCheck = checkCompleteness(card);
    checks.push(compCheck);
    if (compCheck.status === 'warn') warnings.push('完整性：' + compCheck.detail);

    // 身份层 display 是可选段：无段（老卡）不产生检查项；
    // 有段但非法只报 warn 一条，绝不拦导入，主页由 CardDisplay 回退默认身份。
    var dispSeg = CardValidator.validateDisplaySeg(card.display);
    if (dispSeg.present) {
      checks.push({
        id: 'display', label: '身份段 display',
        status: dispSeg.valid ? 'pass' : 'warn',
        detail: dispSeg.valid ? '身份字段合法' : dispSeg.diag
      });
      if (!dispSeg.valid) warnings.push('身份段 display：' + dispSeg.diag + '（不影响导入，主页回退默认身份）');
    }

    return {
      ok: jsonCheck.status !== 'fail' && reqCheck.status !== 'fail',
      checks: checks,
      card: card,
      fixedText: jsonCheck.fixedText,
      warnings: warnings,
      fails: fails
    };
  }

  // ============ 报告 ============

  function generatePlayerReport(result) {
    var lines = [];
    lines.push('=== 卡带诊断结果 ===');
    result.checks.forEach(function(c) {
      var icon = c.status === 'pass' ? '✓' : c.status === 'fixed' ? '⊕' : c.status === 'warn' ? '⚠' : '✗';
      lines.push('[' + icon + '] ' + c.label + '：' + c.detail);
    });
    if (result.fails.length) {
      lines.push(''); lines.push('❌ 无法修复：');
      result.fails.forEach(function(f) { lines.push('  · ' + f); });
    }
    if (result.warnings.length) {
      lines.push(''); lines.push('⚠ 警告：');
      result.warnings.forEach(function(f) { lines.push('  · ' + f); });
    }
    return lines.join('\n');
  }

  function generateAIReport(rawText, result) {
    var lines = [];
    lines.push('=== 卡带诊断 · 给 AI 的修复请求 ===');
    lines.push('');
    lines.push('我尝试导入一份 AI 生成的卡带 JSON，引擎诊断发现以下问题，请你修复后重新输出完整 JSON。');
    lines.push('');
    lines.push('--- 诊断结果 ---');
    result.checks.forEach(function(c) {
      var icon = c.status === 'pass' ? '✓' : c.status === 'fixed' ? '⊕' : c.status === 'warn' ? '⚠' : '✗';
      lines.push('[' + icon + '] ' + c.label + '：' + c.detail);
      if (c.problems && c.problems.length) c.problems.forEach(function(p) { lines.push('    · ' + p); });
      if (c.stats) lines.push('    统计：' + JSON.stringify(c.stats));
    });
    if (result.fails.length) {
      lines.push(''); lines.push('--- 必须修复 ---');
      result.fails.forEach(function(f) { lines.push('· ' + f); });
    }
    if (result.warnings.length) {
      lines.push(''); lines.push('--- 建议修复 ---');
      result.warnings.forEach(function(f) { lines.push('· ' + f); });
    }
    lines.push(''); lines.push('--- 原始 JSON（可能被截断） ---');
    var raw = String(rawText || '');
    if (raw.length > 20000) {
      lines.push('（原始过长，只贴开头 10000 字）');
      lines.push(raw.slice(0, 10000));
    } else lines.push(raw);
    lines.push('');
    lines.push('--- 请输出修复后的完整 JSON，不要 markdown 代码块，不要解释 ---');
    return lines.join('\n');
  }

  // ============ UI ============

  function renderTerminal(result, rawText) {
    var existing = document.getElementById('diag-terminal');
    if (existing) existing.remove();

    var wrap = document.createElement('div');
    wrap.id = 'diag-terminal';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:100001;display:flex;align-items:center;justify-content:center;padding:12px;';

    var inner = document.createElement('div');
    inner.style.cssText = 'background:var(--c-bg-topbar);color:var(--c-text);border:1px solid var(--c-border);border-radius:12px;width:100%;max-width:720px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;';

    var header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--c-border);flex-shrink:0;';
    header.innerHTML = '<div style="flex:1;font-size:15px;color:var(--c-accent);font-family:monospace;">📋 卡带诊断终端</div>';
    inner.appendChild(header);

    var body = document.createElement('div');
    body.style.cssText = 'flex:1;overflow-y:auto;padding:14px 18px;font-family:monospace;font-size:12.5px;line-height:1.85;color:var(--c-text-2);';

    var html = '';
    result.checks.forEach(function(c, i) {
      var icon, color;
      if (c.status === 'pass') { icon = '✓'; color = 'var(--c-success)'; }
      else if (c.status === 'fixed') { icon = '⊕'; color = 'var(--c-accent)'; }
      else if (c.status === 'warn') { icon = '⚠'; color = 'var(--c-warning)'; }
      else { icon = '✗'; color = 'var(--c-danger)'; }

      html += '<div style="margin-bottom:10px;">';
      html += '<div style="color:' + color + ';">[' + (i + 1) + '/' + result.checks.length + '] ' + c.label + ' ' + icon + ' ' + c.status.toUpperCase() + '</div>';
      html += '<div style="color:var(--c-text-muted2);margin-left:16px;word-break:break-word;">' + escapeHtmlLocal(c.detail) + '</div>';
      if (c.problems && c.problems.length) {
        c.problems.slice(0, 10).forEach(function(p) {
          html += '<div style="color:var(--c-danger);margin-left:24px;font-size:11.5px;">· ' + escapeHtmlLocal(p) + '</div>';
        });
        if (c.problems.length > 10) {
          html += '<div style="color:var(--c-text-muted2);margin-left:24px;font-size:11.5px;">… 还有 ' + (c.problems.length - 10) + ' 条</div>';
        }
      }
      html += '</div>';
    });

    if (!result.ok) {
      html += '<div style="margin-top:14px;padding:10px;background:var(--c-deep-error-bg);border-radius:6px;color:var(--c-deep-error-text);"><span data-icon="x"></span> 卡带存在无法自动修复的问题</div>';
    } else if (result.warnings.length) {
      html += '<div style="margin-top:14px;padding:10px;background:var(--c-deep-warning-bg);border-radius:6px;color:var(--c-warning);"><span data-icon="warning"></span> 卡带可以导入，但有 ' + result.warnings.length + ' 条警告</div>';
    } else {
      html += '<div style="margin-top:14px;padding:10px;background:var(--c-deep-success-bg);border-radius:6px;color:var(--c-deep-success-text);"><span data-icon="check"></span> 卡带健康</div>';
    }

    body.innerHTML = html;
    inner.appendChild(body);

    var footer = document.createElement('div');
    footer.style.cssText = 'padding:12px 16px;border-top:1px solid var(--c-border);display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0;';

    var btnAI = document.createElement('button');
    btnAI.textContent = '📋 复制报告给 AI';
    btnAI.style.cssText = 'flex:1;min-width:140px;padding:10px;border-radius:8px;background:var(--c-primary);color:var(--c-bg-white);border:none;cursor:pointer;font-size:13px;';
    btnAI.onclick = function() { copyToClipboard(generateAIReport(rawText, result)); };
    footer.appendChild(btnAI);

    var btnPlayer = document.createElement('button');
    btnPlayer.textContent = '📄 通俗报告';
    btnPlayer.style.cssText = 'flex:0 0 auto;padding:10px 14px;border-radius:8px;background:var(--c-border);color:var(--c-accent);border:1px solid var(--c-border-strong);cursor:pointer;font-size:13px;';
    btnPlayer.onclick = function() { Platform.ui.toast(generatePlayerReport(result), { type: 'info', manual: true }); };
    footer.appendChild(btnPlayer);

    if (result.ok) {
      var btnImport = document.createElement('button');
      btnImport.innerHTML = '<span data-icon="check"></span> 带病导入';
      btnImport.style.cssText = 'flex:0 0 auto;padding:10px 14px;border-radius:8px;background:var(--c-primary);color:var(--c-bg-white);border:none;cursor:pointer;font-size:13px;';
      btnImport.onclick = async function() {
        wrap.remove();
        if (window.UI && window.UI._doImportWithText) {
          await window.UI._doImportWithText(result.fixedText || rawText, result.card, { fromDiagnose: true });
        } else { UI.toast('导入失败', { type: 'error' }); }
      };
      footer.appendChild(btnImport);
    }

    var btnCancel = document.createElement('button');
    btnCancel.textContent = '取消';
    btnCancel.style.cssText = 'flex:0 0 auto;padding:10px 14px;border-radius:8px;background:var(--c-border-strong);color:var(--c-text);border:none;cursor:pointer;font-size:13px;';
    btnCancel.onclick = function() { wrap.remove(); };
    footer.appendChild(btnCancel);

    inner.appendChild(footer);
    wrap.appendChild(inner);
    document.body.appendChild(wrap);
    Platform.ui.fillIcons(wrap); // D-3：Platform.ui 契约双端保证，冗余守卫删除
  }

  

  function copyToClipboard(text) {
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
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:100151;display:flex;align-items:center;justify-content:center;padding:16px;';
    var inner = document.createElement('div');
    inner.style.cssText = 'background:var(--c-bg-panel);color:var(--c-text);border-radius:12px;padding:16px;width:100%;max-width:720px;max-height:90vh;display:flex;flex-direction:column;';
    inner.innerHTML = '<div style="margin-bottom:10px;font-size:14px;">长按下方文本 → 全选 → 复制</div>';
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'flex:1;min-height:300px;background:var(--c-bg-panel);color:var(--c-text-2);border:1px solid var(--c-border);border-radius:6px;padding:10px;font-family:monospace;font-size:11px;resize:none;';
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

  var CardDiagnose = {
    diagnose: diagnose,
    renderTerminal: renderTerminal,
    generatePlayerReport: generatePlayerReport,
    generateAIReport: generateAIReport,
    fixJSONText: fixJSONText
  };
  if (typeof window !== 'undefined') window.CardDiagnose = CardDiagnose;
  if (typeof module !== 'undefined' && module.exports) module.exports = CardDiagnose;
})();
