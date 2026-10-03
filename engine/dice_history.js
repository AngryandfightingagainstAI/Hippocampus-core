// ============================================================
// 骰子历史
// 记录每轮所有 roll_* 的结果，供玩家查询
// 数据：/saves/{cardId}/{saveId}/dice_history.json
// 结构：[{ ts, gameTime, round, type, expr, label, total, detail, raw }]
// ============================================================

(function() {
  var MAX_RECORDS = 200;   // 最多保留 200 条

  var DiceHistory = {
    _data: null,

    _path: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/dice_history.json';
    },

    load: function() {
      var p = this._path();
      if (!p) { this._data = []; return; }
      var d = VFS.readJSON(p);
      this._data = Array.isArray(d) ? d : [];
    },

    save: function() {
      var p = this._path();
      if (!p || !this._data) return;
      // 截断到 MAX_RECORDS
      if (this._data.length > MAX_RECORDS) {
        this._data = this._data.slice(-MAX_RECORDS);
      }
      VFS.writeJSON(p, this._data);
    },

    getRuntime: function() {
      if (!this._data) this.load();
      return Array.isArray(this._data) ? JSON.parse(JSON.stringify(this._data)) : [];
    },
    setRuntime: function(data) {
      this._data = Array.isArray(data) ? JSON.parse(JSON.stringify(data)) : [];
      this.save();
    },

    // 记录一条骰子结果（在 ToolExecutor 里自动调）
    record: function(result) {
      if (!result || !result.ok) return;
      if (result.type2 !== 'dice') return;
      if (!this._data) this.load();

      var item = {
        ts: Date.now(),
        gameTime: GameState.formatGameTime(),
        round: this._roundCount(),
        type: result.type,           // check / bonus / normal / opposed / sc / luck
        expr: result.expression || '',
        label: result.label || '',
        total: result.total,
        target: result.target,
        check: result.check ? { level: result.check.level, class: result.check.class } : null,
        detail: this._makeDetail(result),
        raw: null
      };

      // opposed 特殊处理
      if (result.type === 'opposed') {
        item.detail = 'A:' + result.a.total + '(' + result.a.check.level + ') vs B:' + result.b.total + '(' + result.b.check.level + ') → ' + (result.winner === 'A' ? 'A 胜' : result.winner === 'B' ? 'B 胜' : '平手');
      }
      // sc
      if (result.type === 'sc') {
        item.detail = '理智检定 ' + result.total + '/' + result.target + ' → ' + result.check.level + '，扣 ' + result.loss;
      }
      // luck
      if (result.type === 'luck') {
        item.detail = '消耗幸运 ' + result.spent + '（' + result.oldLuck + ' → ' + result.newLuck + '）';
      }

      this._data.push(item);
      this.save();
    },

    _makeDetail: function(r) {
      if (r.type === 'check') return '1d100 → ' + r.total + ' / 目标 ' + r.target + ' → ' + r.check.level;
      if (r.type === 'bonus') {
        var modeStr = r.mode === 'bonus' ? '奖励骰×' + r.bonusCount : '惩罚骰×' + r.bonusCount;
        return modeStr + ' 十位[' + r.tens.join(',') + '] 个位' + r.unit + ' → ' + r.total;
      }
      if (r.type === 'normal') {
        var modStr = r.mod ? (r.mod > 0 ? '+' + r.mod : String(r.mod)) : '';
        return r.dice.join('+') + modStr + ' → ' + r.total;
      }
      return '';
    },

    _roundCount: function() {
      return (GameState.chatHistory || []).filter(function(m) {
        return m.role === 'user' && !String(m.content || '').startsWith('【系统 ·');
      }).length;
    },

    // ============ 查询 ============
    listAll: function() {
      if (!this._data) this.load();
      return this._data.slice();
    },

    listRecent: function(n) {
      if (!this._data) this.load();
      return this._data.slice(-(n || 20));
    },

    listByRound: function(round) {
      if (!this._data) this.load();
      return this._data.filter(function(x) { return x.round === round; });
    },

    listByLabel: function(keyword) {
      if (!this._data) this.load();
      if (!keyword) return [];
      var kw = String(keyword).toLowerCase();
      return this._data.filter(function(x) {
        return (x.label || '').toLowerCase().indexOf(kw) >= 0;
      });
    },

    // ============ 统计 ============
    getStats: function() {
      if (!this._data) this.load();
      var total = this._data.length;
      var success = 0, fail = 0;
      var byType = {};
      this._data.forEach(function(x) {
        if (x.check) {
          if (['大成功', '极难成功', '困难成功', '成功'].indexOf(x.check.level) >= 0) success++;
          else fail++;
        }
        byType[x.type] = (byType[x.type] || 0) + 1;
      });
      return { total: total, success: success, fail: fail, byType: byType };
    },

    clear: function() {
      this._data = [];
      this.save();
    },

    // 给 prompt 用：最近几轮的骰子（供 AI 参考）
    formatRecentForPrompt: function(n) {
      if (!this._data) this.load();
      var recent = this.listRecent(n || 3);
      if (!recent.length) return '';
      var lines = ['>>> 【最近骰子记录】'];
      recent.forEach(function(x) {
        var tag = x.label ? ('【' + x.label + '】') : '';
        lines.push('· ' + tag + x.detail);
      });
      return lines.join('\n');
    }
  };

  // ============ 自动挂接：从 ToolExecutor 结果里抓骰子 ============
  function hook() {
    if (typeof ToolExecutor === 'undefined') {
      if (typeof ErrorLog !== 'undefined' && ErrorLog.action) {
        ErrorLog.action('BOOT', 'DiceHistory 工具注册失败：ToolExecutor 未就绪');
      }
      if (typeof console !== 'undefined') console.error('[DiceHistory] 工具注册失败：ToolExecutor 未就绪');
      return;
    }
    if (ToolExecutor._diceHistoryHooked) return;
    ToolExecutor._diceHistoryHooked = true;

    var origFormat = ToolExecutor.formatForHistory;
    if (typeof origFormat !== 'function') return;

    // 更可靠的方式：拦截 executeAll
    var origExecAll = ToolExecutor.executeAll;
    ToolExecutor.executeAll = async function(list) {
      var results = await origExecAll.apply(this, arguments);
      try {
        results.forEach(function(r) {
          if (r && r.type2 === 'dice' && typeof DiceHistory !== 'undefined') {
            DiceHistory.record(r);
          }
        });
      } catch (e) { console.warn('[DiceHistory] 记录失败：', e); }
      return results;
    };

    // 工具查询
    ToolExecutor.WHITELIST.query_dice_history = {
      run: function(a) {
        var recent = a.recent ? DiceHistory.listRecent(a.recent) : DiceHistory.listAll();
        if (a.label) recent = DiceHistory.listByLabel(a.label);
        if (a.round != null) recent = DiceHistory.listByRound(a.round);
        var stats = DiceHistory.getStats();
        return {
          ok: true,
          type: 'query',
          queryType: 'dice_history',
          data: {
            stats: stats,
            list: recent.slice(-30).map(function(x) {
              return {
                gameTime: x.gameTime,
                round: x.round,
                label: x.label,
                type: x.type,
                detail: x.detail
              };
            })
          }
        };
      }
    };
  }

  // P16·B1：同步挂接（原为 setTimeout(hook, 1600ms) 错峰挂接）。
  //   hook 自带就绪检查与幂等标记（ToolExecutor._diceHistoryHooked），错峰的 1600ms 只会
  //   让冷启动窗口内 query_dice_history 不在白名单里、同时 executeAll 拦截尚未装上。
  hook();

  if (typeof window !== 'undefined') window.DiceHistory = DiceHistory;
  if (typeof module !== 'undefined' && module.exports) module.exports = DiceHistory;
})();