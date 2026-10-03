// ============================================================
// 报错 & 行为日志系统 v3 · 核心层（A 类，纯逻辑零 DOM）
// 双挂载：浏览器挂 window.ErrorLog（由 error_log_dom.js 重建六键契约），
//         Node/RN 走 module.exports（rn_bootstrap 挂载名仍为 ErrorLog）。
// DOM 能力（高亮按钮/Toast/当前屏幕）经 hooks 槽由 dom 层 _bind 注入。
// ============================================================

(function() {
  var MAX_ERRORS = 100;
  var MAX_ACTIONS = 200;
  var STORAGE_KEY = 'ai_tg_error_log';

  var state = {
    errors: [],
    actions: [],
    lastCrash: null,
    _capturing: false
  };

  // DOM 注入槽：null 表示运行在无 DOM 环境（Node/RN），core 自身不做环境守卫
  var hooks = {
    screen: null,    // function() -> 当前屏幕 id 字符串
    onRecord: null,  // function(item) 新错误落库后触发（高亮+Toast）
    onButton: null   // function(hasError) 清除后灭灯
  };

  function now() {
    var d = new Date();
    var p = function(n) { return String(n).padStart(2, '0'); };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function nowFull() {
    var d = new Date();
    var p = function(n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + ' ' +
           p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function snapshotContext() {
    var ctx = { screen: '?', cardId: '?', saveId: '?', round: '?', gameTime: '?' };
    try {
      if (hooks.screen) ctx.screen = hooks.screen() || '?';
      if (typeof GameState !== 'undefined') {
        ctx.cardId = GameState.currentCardId || '?';
        ctx.saveId = GameState.currentSaveId || '?';
        ctx.gameTime = GameState.formatGameTime ? GameState.formatGameTime() : '?';
        if (GameState.chatHistory) {
          ctx.round = GameState.chatHistory.filter(function(m) {
            return m.role === 'user' && !String(m.content || '').startsWith('【系统 ·');
          }).length;
        }
      }
    } catch (e) {}
    return ctx;
  }

  function reDiagnose(errorItem) {
    var msg = errorItem.message || '';
    var m1 = msg.match(/^(\w+) is not defined/);
    if (m1) {
      var name = m1[1];
      try {
        return { resolved: typeof window[name] !== 'undefined', reason: '模块 ' + name + (typeof window[name] !== 'undefined' ? ' 已加载' : ' 仍缺失') };
      } catch (e) {
        return { resolved: false, reason: '无法检测' };
      }
    }
    var m2 = msg.match(/Cannot read (?:properties|property) ['"]([^'"]+)['"] of (undefined|null)/);
    if (m2) {
      return { resolved: false, reason: '无法自动判断（依赖运行时数据）' };
    }
    if (msg.indexOf('API 未配置') >= 0 || msg.indexOf('ApiManager') >= 0) {
      try {
        if (typeof ApiManager !== 'undefined') {
          var p = ApiManager.getActive();
          return { resolved: !!(p && p.baseUrl && p.model), reason: (p && p.baseUrl && p.model) ? 'API 配置已就绪' : 'API 仍未配置' };
        }
      } catch (e) {}
      return { resolved: false, reason: '无法检测' };
    }
    return { resolved: null, reason: '无法自动判断' };
  }

  function recordError(err) {
    if (state._capturing) return;
    state._capturing = true;
    try {
      var ctx = snapshotContext();
      var item = {
        time: now(),
        timeFull: nowFull(),
        type: err.type || 'Error',
        message: String(err.message || err).slice(0, 2000),
        stack: String(err.stack || '').slice(0, 4000),
        context: ctx,
        recentActions: state.actions.slice(-20)
      };
      state.errors.push(item);
      if (state.errors.length > MAX_ERRORS) state.errors.shift();
      state.lastCrash = item;
      persistToStorage();
      if (hooks.onRecord) { try { hooks.onRecord(item); } catch (hookErr) {} }
      console.error('[ErrorLog]', item.type + ': ' + item.message, '\ncontext:', ctx);
    } catch (e) {
      try { console.error('[ErrorLog] 记录错误时自身出错:', e); } catch (_) {}
    } finally {
      state._capturing = false;
    }
  }

  function recordAction(kind, detail) {
    try {
      state.actions.push({ time: now(), kind: kind, detail: String(detail || '').slice(0, 500) });
      if (state.actions.length > MAX_ACTIONS) state.actions.shift();
    } catch (e) {}
  }

  function persistToStorage() {
    try {
      var data = {
        errors: state.errors.slice(-30),
        actions: state.actions.slice(-50),
        lastCrash: state.lastCrash,
        updatedAt: nowFull()
      };
      LocalStore.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }
  function loadFromStorage() {
    try {
      var raw = LocalStore.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data.errors) state.errors = data.errors;
      if (data.actions) state.actions = data.actions;
      if (data.lastCrash) state.lastCrash = data.lastCrash;
    } catch (e) {}
  }
  function clearStorage() {
    try { LocalStore.removeItem(STORAGE_KEY); } catch (e) {}
    state.errors = [];
    state.actions = [];
    state.lastCrash = null;
    if (hooks.onButton) { try { hooks.onButton(false); } catch (hookErr) {} }
  }

  function estimateBytes() {
    try { return StorageAdapter.estimateBytes(); }
    catch (e) { return 0; }
  }

  function generateReport() {
    var lines = [];
    var ctx = snapshotContext();
    lines.push('=== Hippocampus core · 诊断报告 v3 ===');
    lines.push('时间: ' + nowFull());
    lines.push('屏幕: ' + ctx.screen);
    lines.push('卡带: ' + ctx.cardId);
    lines.push('存档: ' + ctx.saveId);
    lines.push('游戏内时间: ' + ctx.gameTime);
    lines.push('轮次: ' + ctx.round);
    lines.push('UA: ' + (typeof navigator !== 'undefined' ? (navigator.userAgent || 'unknown') : 'unknown'));
    lines.push('屏幕尺寸: ' + (typeof window !== 'undefined' ? window.innerWidth + 'x' + window.innerHeight : '0x0'));
    lines.push('存储占用: ' + (estimateBytes() / 1024 / 1024).toFixed(2) + ' MB');
    lines.push('');

    var active = state.errors.filter(function(e) { return e._resolved !== true; });
    var resolved = state.errors.filter(function(e) { return e._resolved === true; });

    lines.push('--- 活跃错误 (' + active.length + ') ---');
    if (!active.length) lines.push('（无）');
    else {
      active.reverse().forEach(function(e, i) {
        lines.push('');
        lines.push('[' + (active.length - i) + '] ' + e.timeFull + ' · ' + e.type + (e._reason ? ' · ' + e._reason : ''));
        lines.push('  消息: ' + e.message);
        if (e.stack) {
          lines.push('  堆栈:');
          e.stack.split('\n').slice(0, 8).forEach(function(l) { lines.push('    ' + l.trim()); });
        }
        var c = e.context || {};
        lines.push('  现场: 屏幕=' + c.screen + ' 卡带=' + c.cardId + ' 存档=' + c.saveId + ' 轮次=' + c.round);
        if (e.recentActions && e.recentActions.length) {
          lines.push('  出错前 20 条行为:');
          e.recentActions.forEach(function(a) {
            lines.push('    ' + a.time + ' [' + a.kind + '] ' + a.detail);
          });
        }
      });
    }

    if (resolved.length) {
      lines.push('');
      lines.push('--- 已解决的错误 (' + resolved.length + ') ---');
      resolved.forEach(function(e) {
        lines.push('· ' + e.timeFull + ' · ' + e.message + ' → ' + (e._reason || ''));
      });
    }

    lines.push('');
    lines.push('--- 最近 50 条行为日志 ---');
    state.actions.slice(-50).forEach(function(a) {
      lines.push(a.time + ' [' + a.kind + '] ' + a.detail);
    });
    lines.push('');
    lines.push('=== 报告结束 ===');
    return lines.join('\n');
  }

  function bindHooks(h) {
    h = h || {};
    if (h.screen) hooks.screen = h.screen;
    if (h.onRecord) hooks.onRecord = h.onRecord;
    if (h.onButton) hooks.onButton = h.onButton;
  }

  var api = {
    record: recordError,
    action: recordAction,
    getReport: generateReport,
    clear: clearStorage,
    dump: function() { console.log(generateReport()); },
    // —— 以下划线装配槽仅供 error_log_dom.js 闭包内使用，不进 window.ErrorLog 六键契约 ——
    _bind: bindHooks,
    _load: function() { loadFromStorage(); return state.errors.length; },
    _rediagnose: reDiagnose,
    _context: snapshotContext,
    _estimateBytes: estimateBytes,
    _state: state
  };

  if (typeof window !== 'undefined') window.ErrorLog = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
