// ============================================================
// 引擎自检 · 运行时数据/配置扫描
// v3：补全所有新系统模块 + 新系统健康检查
// 只读，不改任何东西。用户主动触发。
// ============================================================

(function() {
  var escapeHtmlLocal = (typeof Escape !== 'undefined' && Escape.html) ? Escape.html : function(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]; }); };
  var MODULES = (typeof window !== 'undefined' && window.ModuleRegistry && window.ModuleRegistry.LIST) ? window.ModuleRegistry.LIST : [];

  function checkModules() {
    var issues = [];
    MODULES.forEach(function(m) {
      if (typeof m === 'string') {
        // 兼容旧格式（如果哪里还传字符串）
        if (typeof window[m] === 'undefined') {
          issues.push({ level: 'error', group: '模块', text: '模块缺失：' + m });
        }
        return;
      }
      if (typeof window[m.name] === 'undefined') {
        var level = m.optional ? 'warn' : 'error';
        var text = '模块缺失：' + m.name + (m.optional ? '（可选）' : '');
        issues.push({ level: level, group: m.group || '模块', text: text });
      }
    });
    return issues;
  }

  function checkGlobalConfig() {
    var issues = [];
    try {
      var raw = LocalStore.getItem('ai_tg_global');
      if (!raw) return issues;
      var g = JSON.parse(raw);
      if (g.api && typeof g.api !== 'object') issues.push({ level: 'warn', group: '配置', text: 'global.api 不是对象' });
      if (g.settings && typeof g.settings !== 'object') issues.push({ level: 'warn', group: '配置', text: 'global.settings 不是对象' });
      if (g.search && typeof g.search !== 'object') issues.push({ level: 'warn', group: '配置', text: 'global.search 不是对象' });
      if (g.weather && typeof g.weather !== 'object') issues.push({ level: 'warn', group: '配置', text: 'global.weather 不是对象' });
      if (g.realtime && typeof g.realtime !== 'object') issues.push({ level: 'warn', group: '配置', text: 'global.realtime 不是对象' });
    } catch (e) {
      issues.push({ level: 'error', group: '配置', text: '全局配置 JSON 解析失败：' + e.message });
    }
    return issues;
  }

  function checkOrphanSaves() {
    var issues = [];
    try {
      var cards = Storage.getAllCards();
      var saves = Saves.listAll();
      saves.forEach(function(m) {
        if (!cards[m.cardId]) {
          issues.push({ level: 'warn', group: '存档', text: '孤儿存档：' + (m.displayName || m.saveId) + '（卡带 ' + m.cardId + ' 已不存在）' });
        }
      });
    } catch (e) {}
    return issues;
  }

  function checkCurrentSave() {
    var issues = [];
    if (!GameState.currentCardId) return issues;
    try {
      var st = GameState.currentState;
      if (!st) issues.push({ level: 'error', group: '存档', text: 'currentState 为空' });
      else {
        if (!Array.isArray(st.hud)) issues.push({ level: 'error', group: '存档', text: 'currentState.hud 不是数组' });
        if (!Array.isArray(st.sidebar)) issues.push({ level: 'error', group: '存档', text: 'currentState.sidebar 不是数组' });
        if (!st.panels) issues.push({ level: 'error', group: '存档', text: 'currentState.panels 缺失' });
      }
      var hist = GameState.chatHistory || [];
      var realUser = hist.filter(function(m) {
        return m.role === 'user' && !String(m.content || '').startsWith('【系统 ·');
      });
      if (hist.length > 0 && realUser.length === 0) {
        issues.push({ level: 'warn', group: '对话', text: 'chatHistory 里没有真实玩家输入，API 可能报"Empty input messages"' });
      }
      var last = hist[hist.length - 1];
      if (last && last.role === 'user' && !String(last.content || '').startsWith('【系统 ·')) {
        issues.push({ level: 'info', group: '对话', text: '最后一条是玩家输入（AI 未回复），继续游戏会自动续跑' });
      }
    } catch (e) {}
    return issues;
  }

  function checkApiConfig() {
    var issues = [];
    try {
      if (typeof ApiManager === 'undefined') return issues;
      var cur = ApiManager.getActive();
      if (!cur) {
        issues.push({ level: 'error', group: 'AI', text: '没有激活的 AI 配置' });
        return issues;
      }
      if (!cur.baseUrl) issues.push({ level: 'warn', group: 'AI', text: '配置「' + cur.name + '」缺少 Base URL' });
      if (!cur.apiKey) issues.push({ level: 'warn', group: 'AI', text: '配置「' + cur.name + '」缺少 API Key' });
      if (!cur.model) issues.push({ level: 'warn', group: 'AI', text: '配置「' + cur.name + '」缺少模型名' });
      if (cur.max_tokens && cur.max_tokens < 16384 && /reasoner|v4|thinking|o1|o3/i.test(cur.model || '')) {
        issues.push({ level: 'warn', group: 'AI', text: '当前是思考模型（' + cur.model + '），max_tokens=' + cur.max_tokens + '，建议 16384 以上' });
      }
    } catch (e) {}
    return issues;
  }

  function checkSearchConfig() {
    var issues = [];
    try {
      if (typeof WebSearchManager === 'undefined') return issues;
      if (!WebSearchManager.isEnabled()) return issues;
      var sc = WebSearchManager.getActive();
      if (!sc) {
        issues.push({ level: 'warn', group: '搜索', text: '搜索已启用但没激活配置' });
        return issues;
      }
      if (!sc.apiKey) issues.push({ level: 'warn', group: '搜索', text: '搜索已启用但配置「' + sc.name + '」没有 API Key' });
      if (sc.backend === 'bocha' && sc.endpoint && sc.endpoint.indexOf('bochaai.com') >= 0) {
        issues.push({ level: 'warn', group: '搜索', text: '搜索 endpoint 是 api.bochaai.com，如果你在 bocha.cn 申请的 key 会 401。建议改成 https://api.bocha.cn/v1/web-search' });
      }
    } catch (e) {}
    return issues;
  }

  function checkStorage() {
    var issues = [];
    try {
      var total = StorageAdapter.estimateBytes();
      var mb = total / 1024 / 1024;
      if (mb > 5) issues.push({ level: 'error', group: '存储', text: '已用 ' + mb.toFixed(1) + ' MB，接近上限。建议导出备份' });
      else if (mb > 4) issues.push({ level: 'warn', group: '存储', text: '已用 ' + mb.toFixed(1) + ' MB，建议清理' });
    } catch (e) {}
    return issues;
  }

  function checkCardIntegrity() {
    var issues = [];
    try {
      // D-2：检修视角必须看到原始形态（畸形要能被发现），走 raw 出口
      var cards = Storage.getRawAllCards();
      Object.keys(cards).forEach(function(id) {
        var c = cards[id];
        if (!c || typeof c !== 'object') { issues.push({ level: 'error', group: '卡带', text: '卡带 ' + id + ' 结构损坏' }); return; }
        if (!c.game || !c.game.title) issues.push({ level: 'warn', group: '卡带', text: '卡带「' + (c.cardName || id) + '」缺少 game.title' });
        if (!Array.isArray(c.hud) || !c.hud.length) issues.push({ level: 'info', group: '卡带', text: '卡带「' + (c.cardName || id) + '」hud 为空' });
        if (!Array.isArray(c.panels)) issues.push({ level: 'error', group: '卡带', text: '卡带「' + (c.cardName || id) + '」panels 不是数组' });
        else {
          var emptyPanels = c.panels.filter(function(p) { return !p.entries || !p.entries.length; });
          if (emptyPanels.length > 0) issues.push({ level: 'info', group: '卡带', text: '卡带「' + (c.cardName || id) + '」有 ' + emptyPanels.length + ' 个面板是空的' });
        }
        var wb = c.worldbook || {};
        var npcs = CardValidator.normalizeDefs(wb.npcs);
        if (npcs.length) {
          var noWeight = npcs.filter(function(n) { return n.weight == null; });
          if (noWeight.length) issues.push({ level: 'info', group: '卡带', text: '卡带「' + (c.cardName || id) + '」有 ' + noWeight.length + ' 个 NPC 未填 weight' });
          var noKw = npcs.filter(function(n) { return !Array.isArray(n.keywords) || !n.keywords.length; });
          if (noKw.length) issues.push({ level: 'info', group: '卡带', text: '卡带「' + (c.cardName || id) + '」有 ' + noKw.length + ' 个 NPC 未填 keywords' });
        }
      });
    } catch (e) {}
    return issues;
  }

  // ============ 新系统健康检查 ============
  function checkGameSystems() {
    var issues = [];
    if (!GameState.currentCardId) return issues;

    // NPC 运行时
    try {
      if (typeof NpcRuntime !== 'undefined' && GameState.currentCardId) {
        var wb = (GameState.currentCard || {}).worldbook || {};
        var defs = wb.npcs || [];
        if (defs.length) {
          var rt = NpcRuntime.getAll();
          var tracked = rt && rt.npcs ? Object.keys(rt.npcs).length : 0;
          issues.push({ level: 'info', group: 'NPC', text: '卡带 ' + defs.length + ' 个 NPC · 运行时已追踪 ' + tracked + ' 个' });
          var onstage = NpcRuntime.getOnstage();
          if (onstage.length > 3) {
            issues.push({ level: 'warn', group: 'NPC', text: '当前舞台上有 ' + onstage.length + ' 个 NPC（上限 3）' });
          }
        }
      }
    } catch (e) {
      issues.push({ level: 'error', group: 'NPC', text: 'NpcRuntime 检查异常：' + e.message });
    }

    // 事件
    try {
      if (typeof Events !== 'undefined') {
        var evDefs = Events.listDefs ? Events.listDefs() : [];
        var evTrig = Events.listTriggered ? Events.listTriggered() : [];
        if (evDefs.length) {
          issues.push({ level: 'info', group: '事件', text: '事件 ' + evDefs.length + ' 个 · 已触发 ' + evTrig.length + ' 个' });
        }
      }
    } catch (e) {}

    // 任务
    try {
      if (typeof Tasks !== 'undefined') {
        var all = Tasks.listAll ? Tasks.listAll() : [];
        if (all.length) {
          var active = all.filter(function(t) { return t.status === 'active'; }).length;
          issues.push({ level: 'info', group: '任务', text: '任务 ' + all.length + ' 个 · 进行中 ' + active + ' 个' });
        }
      }
    } catch (e) {}

    // 成就
    try {
      if (typeof Achievements !== 'undefined') {
        var achAll = Achievements.listAll ? Achievements.listAll() : [];
        if (achAll.length) {
          var unlocked = achAll.filter(function(a) { return a.unlocked; }).length;
          issues.push({ level: 'info', group: '成就', text: '成就 ' + achAll.length + ' 个 · 已解锁 ' + unlocked + ' 个' });
        }
      }
    } catch (e) {}

    // 天气
    try {
      if (typeof Weather !== 'undefined' && GameState.currentCardId) {
        var wCard = (GameState.currentCard && GameState.currentCard.worldbook && GameState.currentCard.worldbook.weather) || null;
        var wMode = (wCard && wCard.mode) || (Storage.getGlobal().weather || {}).mode || 'off';
        if (wMode !== 'off') {
          var cur = Weather.getCurrent();
          issues.push({ level: 'info', group: '天气', text: '模式=' + wMode + ' · 当前=' + (cur ? (cur.icon + ' ' + cur.type) : '未初始化') });
        }
      }
    } catch (e) {}

    // 状态卡
    try {
      if (typeof StatusCard !== 'undefined' && GameState.currentCardId) {
        if (StatusCard.isEnabled()) {
          var fields = StatusCard.getAllFields();
          var fc = Object.keys(fields).length;
          issues.push({ level: 'info', group: '状态卡', text: '已启用 · 已维护字段 ' + fc + ' 个' });
        }
      }
    } catch (e) {}

    // 商店
    try {
      if (typeof Shop !== 'undefined' && GameState.currentCardId) {
        var shops = Shop.listShops ? Shop.listShops() : [];
        if (shops.length) {
          issues.push({ level: 'info', group: '商店', text: '商店 ' + shops.length + ' 家' });
        }
      }
    } catch (e) {}

    // 骰子历史
    try {
      if (typeof DiceHistory !== 'undefined' && GameState.currentCardId) {
        var stats = DiceHistory.getStats ? DiceHistory.getStats() : null;
        if (stats && stats.total) {
          issues.push({ level: 'info', group: '骰子', text: '历史 ' + stats.total + ' 条（成功 ' + stats.success + ' / 失败 ' + stats.fail + '）' });
        }
      }
    } catch (e) {}

    // 快照
    try {
      if (typeof Snapshots !== 'undefined' && GameState.currentCardId) {
        var snaps = Snapshots.list ? Snapshots.list() : [];
        if (snaps.length === 0) {
          issues.push({ level: 'warn', group: '快照', text: '没有快照。每轮应压一次快照，否则撤销/重生成无法工作。' });
        } else if (snaps.length === 1 && snaps[0].reason === 'init') {
          issues.push({ level: 'info', group: '快照', text: '只有初始快照，说明还未进行过一次 AI 交互' });
        }
      }
    } catch (e) {}

    return issues;
  }

  function runAll() {
    var all = [];
    all = all.concat(checkModules());
    all = all.concat(checkGlobalConfig());
    all = all.concat(checkCardIntegrity());
    all = all.concat(checkOrphanSaves());
    all = all.concat(checkCurrentSave());
    all = all.concat(checkApiConfig());
    all = all.concat(checkSearchConfig());
    all = all.concat(checkStorage());
    all = all.concat(checkGameSystems());

    var byLevel = { error: [], warn: [], info: [] };
    all.forEach(function(i) { (byLevel[i.level] || byLevel.info).push(i); });
    return { all: all, byLevel: byLevel };
  }

  function generateReport(result) {
    var lines = [];
    lines.push('=== Hippocampus core · 自检报告 ===');
    lines.push('时间：' + new Date().toLocaleString());
    lines.push('UA：' + navigator.userAgent);
    lines.push('');
    var b = result.byLevel;
    lines.push('错误：' + b.error.length + ' · 警告：' + b.warn.length + ' · 提示：' + b.info.length);
    lines.push('');
    function section(title, list) {
      if (!list.length) return;
      lines.push('--- ' + title + ' ---');
      list.forEach(function(i) { lines.push('[' + i.group + '] ' + i.text); });
      lines.push('');
    }
    section('❌ 错误', b.error);
    section('⚠ 警告', b.warn);
    section('ℹ 提示', b.info);
    if (!result.all.length) lines.push('✓ 全部通过，未发现问题');
    lines.push('');
    lines.push('=== 报告结束 ===');
    return lines.join('\n');
  }

  

  function showPanel() {
    var result = runAll();
    var b = result.byLevel;

    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:100005;display:flex;align-items:center;justify-content:center;padding:16px;';
    var inner = document.createElement('div');
    inner.style.cssText = 'background:var(--c-bg-panel);color:var(--c-text);border-radius:12px;width:100%;max-width:720px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;';

    var header = document.createElement('div');
    header.style.cssText = 'padding:14px 18px;border-bottom:1px solid var(--c-border);display:flex;gap:8px;align-items:center;';
    header.innerHTML = '<div style="flex:1;font-size:15px;color:var(--c-accent);">🔍 引擎自检</div>' +
      '<button id="audit-copy" style="padding:6px 12px;border-radius:6px;background:var(--c-primary);color:var(--c-bg-white);border:none;cursor:pointer;">复制报告</button>' +
      '<button id="audit-close" style="padding:6px 12px;border-radius:6px;background:var(--c-border-strong);color:var(--c-text);border:none;cursor:pointer;"><span data-icon="x"></span></button>';

    var body = document.createElement('div');
    body.style.cssText = 'flex:1;overflow-y:auto;padding:14px 18px;font-size:13px;line-height:1.75;';

    var html = '';
    html += '<div style="background:var(--c-bg-panel);padding:10px 12px;border-radius:8px;margin-bottom:14px;">' +
      '错误：<b style="color:' + (b.error.length ? 'var(--c-danger)' : 'var(--c-success)') + ';">' + b.error.length + '</b> · ' +
      '警告：<b style="color:' + (b.warn.length ? 'var(--c-warning)' : 'var(--c-success)') + ';">' + b.warn.length + '</b> · ' +
      '提示：<b>' + b.info.length + '</b></div>';

    function sec(title, list, color) {
      if (!list.length) return '';
      var s = '<div style="color:' + color + ';font-weight:500;margin:12px 0 6px;">' + title + ' (' + list.length + ')</div>';
      list.forEach(function(i) {
        s += '<div style="margin-left:8px;color:var(--c-text-2);">· <span style="color:var(--c-text-muted2);">[' + escapeHtmlLocal(i.group) + ']</span> ' + escapeHtmlLocal(i.text) + '</div>';
      });
      return s;
    }
    html += sec('❌ 错误', b.error, 'var(--c-danger)');
    html += sec('<span data-icon="warning"></span> 警告', b.warn, 'var(--c-warning)');
    html += sec('ℹ 提示', b.info, 'var(--c-accent)');
    if (!result.all.length) html += '<div style="color:var(--c-success);padding:20px;text-align:center;"><span data-icon="check"></span> 全部通过</div>';

    body.innerHTML = html;
    inner.appendChild(header);
    inner.appendChild(body);
    wrap.appendChild(inner);
    document.body.appendChild(wrap);
    Platform.ui.fillIcons(wrap); // D-3：Platform.ui 契约双端保证，冗余守卫删除

    document.getElementById('audit-close').onclick = function() { wrap.remove(); };
    document.getElementById('audit-copy').onclick = function() {
      var rpt = generateReport(result);
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(rpt).then(function() { Platform.ui.toast('已复制', { type: 'success' }); }).catch(function() { fallbackCopy(rpt); });
          return;
        }
      } catch (e) {}
      fallbackCopy(rpt);
    };
  }

  function fallbackCopy(text) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:100006;display:flex;align-items:center;justify-content:center;padding:16px;';
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
    ta.focus(); ta.select();
  }

  var Audit = {
    run: runAll,
    show: showPanel,
    report: function() { return generateReport(runAll()); }
  };
  if (typeof window !== 'undefined') window.Audit = Audit;
  if (typeof module !== 'undefined' && module.exports) module.exports = Audit;
})();
