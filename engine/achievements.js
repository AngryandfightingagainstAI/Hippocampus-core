// ============================================================
// 成就系统
// 数据：
//   卡带定义  card.worldbook.achievements
//   运行时    /saves/{cardId}/{saveId}/achievements_runtime.json
// 逻辑：成就 = 一次性条件判定 + 解锁提示 + 可选奖励
//       条件判定复用 Events._checkTrigger
// ============================================================

(function() {
  var Achievements = {
    _data: null,

    _path: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/achievements_runtime.json';
    },

    load: function() {
      var p = this._path();
      if (!p) { this._data = { unlocked: {} }; return; }
      var d = VFS.readJSON(p);
      this._data = d && d.unlocked ? d : { unlocked: {} };
    },

    save: function() {
      var p = this._path();
      if (!p || !this._data) return;
      VFS.writeJSON(p, this._data);
    },

    getRuntime: function() {
      if (!this._data) this.load();
      return this._data ? JSON.parse(JSON.stringify(this._data)) : null;
    },
    setRuntime: function(data) {
      this._data = data ? JSON.parse(JSON.stringify(data)) : null;
      this.save();
    },

    // ============ 卡带定义 ============
    listDefs: function() {
      var card = GameState.currentCard;
      if (!card) return [];
      var wb = card.worldbook || {};
      return wb.achievements || [];
    },

    _findDef: function(id) {
      if (!this._data) this.load();
      var defs = this.listDefs();
      var found = defs.find(function(d) { return d.id === id; });
      if (found) return found;
      var rt = this._data.unlocked[id];
      return rt && rt._def ? rt._def : null;
    },

    // 全部成就（含运行时）
    listAll: function() {
      if (!this._data) this.load();
      var defs = this.listDefs();
      var out = [];
      var self = this;

      defs.forEach(function(def) {
        var rt = self._data.unlocked[def.id] || null;
        out.push(self._merge(def, rt));
      });

      // AI 临时加的
      Object.keys(this._data.unlocked).forEach(function(id) {
        if (defs.some(function(d) { return d.id === id; })) return;
        var rt = self._data.unlocked[id];
        if (rt._def) out.push(self._merge(rt._def, rt));
      });

      return out;
    },

    _merge: function(def, rt) {
      return {
        id: def.id,
        name: def.name,
        desc: def.desc || '',
        hidden: !!def.hidden,
        icon: def.icon || '🏆',
        category: def.category || 'general',
        unlocked: !!(rt && rt.unlockedAt),
        unlockedAt: rt ? rt.unlockedAt : '',
        reward: def.reward || null
      };
    },

    // ============ AI 临时加成就 ============
    addTemp: function(def) {
      if (!this._data) this.load();
      if (!def || !def.name) return { ok: false, reason: '缺少 name' };
      if (!def.id) def.id = 'ach_temp_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      var cardDefs = this.listDefs();
      var inCard = cardDefs.some(function(d) { return d.id === def.id; });
      if (inCard) {
        def.id = def.id + '_temp_' + Date.now();
      }
      if (this._data.unlocked[def.id]) {
        // 已存在则合并 _def
        this._data.unlocked[def.id]._def = def;
      } else {
        this._data.unlocked[def.id] = { _def: def, unlockedAt: '', pendingDef: true };
      }
      this.save();
      return { ok: true, id: def.id, name: def.name };
    },

    // ============ 解锁 ============
    unlock: function(id, reason) {
      if (!this._data) this.load();
      var def = this._findDef(id);
      if (!def) return { ok: false, reason: '成就不存在' };
      if (this._data.unlocked[id] && this._data.unlocked[id].unlockedAt) {
        return { ok: false, reason: '已解锁' };
      }
      if (!this._data.unlocked[id]) this._data.unlocked[id] = {};
      var old = this._data.unlocked[id];
      this._data.unlocked[id] = {
        _def: old._def || null,
        unlockedAt: GameState.formatGameTime(),
        unlockedRound: this._roundCount(),
        reason: reason || ''
      };
      this.save();

      // 发奖励
      var rewardApplied = [];
      if (def.reward) {
        if (Array.isArray(def.reward.hudChanges)) {
          def.reward.hudChanges.forEach(function(c) {
            var r = ToolExecutor._modifyStat('hud', null, c.key, c.delta);
            if (r.ok) rewardApplied.push('HUD·' + c.key + ' +' + c.delta);
          });
        }
        if (Array.isArray(def.reward.addItems)) {
          def.reward.addItems.forEach(function(c) {
            var r = ToolExecutor._addItem(c.category || 'common', c.name, c.desc);
            if (r.ok) rewardApplied.push('获得 ' + c.name);
          });
        }
      }

      return {
        ok: true,
        type: 'achievement',
        action: 'unlock',
        achievementId: id,
        achievementName: def.name,
        icon: def.icon || '🏆',
        rewardApplied: rewardApplied,
        label: '成就·' + def.name
      };
    },

    _roundCount: function() {
      return (GameState.chatHistory || []).filter(function(m) {
        return m.role === 'user' && !String(m.content || '').startsWith('【系统 ·');
      }).length;
    },

    // ============ 每轮检查 ============
    tick: function() {
      if (!this._data) this.load();
      var defs = this.listDefs();
      if (!defs.length) return { unlocked: [] };

      var unlocked = [];
      var self = this;

      defs.forEach(function(def) {
        if (!def.id) return;
        if (self._data.unlocked[def.id] && self._data.unlocked[def.id].unlockedAt) return;
        if (!def.trigger) return;
        if (typeof Events === 'undefined') return;
        var ck = Events._checkTrigger({ trigger: def.trigger });
        if (!ck.ok) return;
        var r = self.unlock(def.id, '条件命中');
        if (r.ok) unlocked.push(r);
      });

      return { unlocked: unlocked };
    },

    // ============ 给 prompt 用 ============
    // 成就一般不注入 prompt（AI 通过工具主动查看）
    // 但可以注入"最近解锁的"作为叙事提示
    formatRecentForPrompt: function() {
      if (!this._data) this.load();
      var all = this.listAll();
      var recent = all.filter(function(a) {
        return a.unlocked && a.unlockedAt;
      }).sort(function(a, b) {
        return (b.unlockedAt || '').localeCompare(a.unlockedAt || '');
      }).slice(0, 3);
      if (!recent.length) return '';
      var lines = ['>>> 【最近解锁的成就】'];
      recent.forEach(function(a) {
        lines.push('· ' + a.icon + ' ' + a.name + '（' + a.unlockedAt + '）');
      });
      return lines.join('\n');
    },

    formatForHistory: function(results) {
      if (!results || !results.length) return '';
      var lines = ['【系统 · 成就解锁】'];
      results.forEach(function(r) {
        lines.push('· ' + (r.icon || '🏆') + ' 解锁成就【' + r.achievementName + '】');
        (r.rewardApplied || []).forEach(function(x) { lines.push('   ' + x); });
      });
      return lines.join('\n');
    },

    // ============ 调试 ============
    clear: function() {
      this._data = { unlocked: {} };
      this.save();
    }
  };

  // ============ 工具注册 ============
  function registerTools() {
    if (typeof ToolExecutor === 'undefined' || !ToolExecutor.WHITELIST) {
      if (typeof ErrorLog !== 'undefined' && ErrorLog.action) {
        ErrorLog.action('BOOT', 'Achievements 工具注册失败：ToolExecutor 未就绪');
      }
      if (typeof console !== 'undefined') console.error('[Achievements] 工具注册失败：ToolExecutor 未就绪');
      return;
    }
    var A = Achievements;

    ToolExecutor.WHITELIST.add_achievement = {
      run: function(a) {
        if (!a.achievement) return { ok: false, reason: '缺少 achievement 对象' };
        var def = a.achievement;
        if (!def.id) def.id = 'ach_' + Date.now();
        var r = A.addTemp(def);
        if (!r.ok) return r;
        return {
          ok: true,
          type: 'achievement',
          action: 'add',
          achievementId: r.id,
          achievementName: r.name,
          label: '新增成就·' + r.name
        };
      }
    };

    ToolExecutor.WHITELIST.unlock_achievement = {
      run: function(a) {
        if (!a.id) return { ok: false, reason: '缺少 id' };
        return A.unlock(a.id, a.reason || '');
      }
    };

    ToolExecutor.WHITELIST.query_achievements = {
      run: function() {
        var all = A.listAll();
        return {
          ok: true,
          type: 'query',
          queryType: 'achievements',
          data: {
            total: all.length,
            unlocked: all.filter(function(a) { return a.unlocked; }).length,
            list: all.map(function(a) {
              return {
                id: a.id,
                name: a.name,
                unlocked: a.unlocked,
                unlockedAt: a.unlockedAt,
                hidden: a.hidden && !a.unlocked
              };
            })
          }
        };
      }
    };
  }

  // P16·B1：同步注册（原为 setTimeout(registerTools, 900~1900ms) 错峰注册）。
  //   错峰注册让冷启动后约 2 秒内 ToolExecutor.WHITELIST 只有内置的 15 个工具，AI 此时
  //   调用本模块的工具会拿到「未知工具：xxx」；而未知工具要连续失败 3 次才会提示 AI，
  //   中间它会反复重试同一个不存在的工具、白烧 token。ToolExecutor 在两仓的装载顺序里
  //   都排在本模块之前（index.html 的 <script> 顺序 / rn_bootstrap.js 的 load 顺序），
  //   所以这里可以直接同步注册。
  if (typeof ToolExecutor !== 'undefined' && ToolExecutor.WHITELIST) {
    registerTools();
  } else {
    // 顺序异常时的兜底：只退到下一轮事件循环（原实现要等 900~1900ms）。
    // registerTools 自己的就绪检查会写一条 BOOT 错误，不会静默少工具。
    setTimeout(registerTools, 0);
  }

  if (typeof window !== 'undefined') window.Achievements = Achievements;
  if (typeof module !== 'undefined' && module.exports) module.exports = Achievements;
})();