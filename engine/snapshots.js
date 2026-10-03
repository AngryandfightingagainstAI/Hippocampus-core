// ============================================================
// 快照栈 · 多轮撤销
// v2：快照包含所有系统的运行时状态，回退时一并恢复
//     覆盖：NPC 运行时 / 事件 / 任务 / 成就 / 天气 / 状态卡 / 商店 / 骰子历史
// 每轮 AI 调用前压快照，回退时恢复数据 + 截断历史 + 删后续快照
// 保留最近 MAX 轮
// ============================================================

(function() {
  var MAX = 30;

  var Snapshots = {
    MAX: MAX,
    _dirEnsured: null,

    _dir: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/snapshots';
    },

    _path: function(round) {
      var d = this._dir();
      if (!d) return null;
      return d + '/r' + String(round).padStart(4, '0') + '.json';
    },

    _currentRound: function() {
      return (GameState.chatHistory || []).filter(function(m) {
        return m.role === 'user' && !String(m.content || '').startsWith('【系统 ·');
      }).length;
    },

    // ============ 系统运行时抓取 ============
    _grabSystemData: function() {
      var out = {};
      // 全部走各系统的公开 getRuntime()（内部会 load + 深拷贝）
      // 不再触碰任何模块的私有字段 _data
      function grab(key, mod) {
        try {
          if (typeof mod !== 'undefined' && mod && typeof mod.getRuntime === 'function') {
            var v = mod.getRuntime();
            if (v !== undefined && v !== null) out[key] = v;
          }
        } catch (e) {
          console.warn('[Snapshots] 抓取 ' + key + ' 失败：', e);
        }
      }
      grab('npcRuntime', typeof NpcRuntime !== 'undefined' ? NpcRuntime : null);
      grab('events', typeof Events !== 'undefined' ? Events : null);
      grab('tasks', typeof Tasks !== 'undefined' ? Tasks : null);
      grab('achievements', typeof Achievements !== 'undefined' ? Achievements : null);
      grab('weather', typeof Weather !== 'undefined' ? Weather : null);
      grab('statusCard', typeof StatusCard !== 'undefined' ? StatusCard : null);
      grab('shop', typeof Shop !== 'undefined' ? Shop : null);
      grab('diceHistory', typeof DiceHistory !== 'undefined' ? DiceHistory : null);
      grab('proposals', typeof Proposals !== 'undefined' ? Proposals : null);
      grab('outputs', typeof Outputs !== 'undefined' ? Outputs : null);
      grab('npcDeduction', typeof NpcDeduction !== 'undefined' ? NpcDeduction : null);
      return out;
    },

    // ============ 系统运行时恢复 ============
    _putSystemData: function(sys) {
      if (!sys || typeof sys !== 'object') return;
      // 全部走各系统的公开 setRuntime()（内部会 _ensureShape + save）
      function put(key, mod) {
        try {
          if (typeof mod === 'undefined' || !mod || typeof mod.setRuntime !== 'function') return;
          if (sys[key] !== undefined) {
            mod.setRuntime(sys[key]);
            return;
          }
          // 旧快照没有这些键时按空状态恢复，否则回滚后会残留回滚前的新数据（与其余系统不一致）
          if ((key === 'proposals' || key === 'outputs' || key === 'npcDeduction') &&
              typeof mod.clear === 'function') {
            mod.clear();
          }
        } catch (e) {
          console.warn('[Snapshots] 恢复 ' + key + ' 失败：', e);
        }
      }
      put('npcRuntime', typeof NpcRuntime !== 'undefined' ? NpcRuntime : null);
      put('events', typeof Events !== 'undefined' ? Events : null);
      put('tasks', typeof Tasks !== 'undefined' ? Tasks : null);
      put('achievements', typeof Achievements !== 'undefined' ? Achievements : null);
      put('weather', typeof Weather !== 'undefined' ? Weather : null);
      put('statusCard', typeof StatusCard !== 'undefined' ? StatusCard : null);
      put('shop', typeof Shop !== 'undefined' ? Shop : null);
      put('diceHistory', typeof DiceHistory !== 'undefined' ? DiceHistory : null);
      put('proposals', typeof Proposals !== 'undefined' ? Proposals : null);
      put('outputs', typeof Outputs !== 'undefined' ? Outputs : null);
      put('npcDeduction', typeof NpcDeduction !== 'undefined' ? NpcDeduction : null);
    },

    // ============ 压快照（每轮 AI 调用前调用） ============
    push: function(reason) {
      var d = this._dir();
      if (!d) return false;
      var round = this._currentRound();
      if (round === 0) return false;
      if (this._dirEnsured !== d) {
        VFS.mkdir(d);
        this._dirEnsured = d;
      }

      var snap = {
        round: round,
        timestamp: Date.now(),
        reason: reason || '',
        chatLength: GameState.chatHistory.length,
        playerData: JSON.parse(JSON.stringify(GameState.playerData || {})),
        currentState: JSON.parse(JSON.stringify(GameState.currentState || {})),
        gameTime: GameState._gameTime ? JSON.parse(JSON.stringify(GameState._gameTime)) : null,
        pendingNotices: JSON.parse(JSON.stringify(GameState._pendingSystemNotices || [])),
        systems: this._grabSystemData()
      };
      VFS.writeJSON(this._path(round), snap);
      this._cleanup();
      return true;
    },

    // ============ 列出所有快照（按轮次升序） ============
    list: function() {
      var d = this._dir();
      if (!d) return [];
      var files = VFS.listAll(d).filter(function(p) { return p.endsWith('.json'); });
      var snaps = [];
      files.forEach(function(p) {
        var s = VFS.readJSON(p);
        if (s) snaps.push({ round: s.round, timestamp: s.timestamp, reason: s.reason });
      });
      snaps.sort(function(a, b) { return a.round - b.round; });
      return snaps;
    },

    // ============ 回退到某轮开始前 ============
    rollbackTo: function(round) {
      var snap = VFS.readJSON(this._path(round));
      if (!snap) return { ok: false, reason: '快照不存在' };

      // 1. 恢复基础数据
      GameState.playerData = snap.playerData || {};
      GameState.currentState = snap.currentState || null;
      GameState._gameTime = snap.gameTime || null;
      GameState._pendingSystemNotices = snap.pendingNotices || [];

      // 2. 截断历史
      GameState.chatHistory = (GameState.chatHistory || []).slice(0, snap.chatLength);

      // 3. 恢复各系统运行时状态
      if (snap.systems) {
        this._putSystemData(snap.systems);
      } else if (snap.npcRuntime && typeof NpcRuntime !== 'undefined' && NpcRuntime.setRuntime) {
        // 兼容旧快照：只有 npcRuntime 字段、没有 systems 字段
        NpcRuntime.setRuntime(snap.npcRuntime);
      }

      // 4. 删除之后的所有快照
      var self = this;
      this.list().forEach(function(s) {
        if (s.round > round) VFS.deleteFile(self._path(s.round));
      });

      // 5. 换 session token 阻断挂起请求
      GameState._sessionToken = Date.now();

      // 6. 静态缓存失效（玩家数据变了）
      try { GameState.invalidateCache(); } catch (e) {}

      return { ok: true, round: round, snap: snap };
    },

    rollbackLast: function() {
      var snaps = this.list();
      if (!snaps.length) return { ok: false, reason: '没有快照' };
      return this.rollbackTo(snaps[snaps.length - 1].round);
    },

    peek: function(round) {
      return VFS.readJSON(this._path(round));
    },

    clear: function() {
      var d = this._dir();
      if (!d) return;
      VFS.rmdir(d, true);
    },

    _cleanup: function() {
      var snaps = this.list();
      if (snaps.length <= MAX) return;
      var self = this;
      snaps.slice(0, snaps.length - MAX).forEach(function(s) {
        VFS.deleteFile(self._path(s.round));
      });
    }
  };

  if (typeof window !== 'undefined') window.Snapshots = Snapshots;
  if (typeof module !== 'undefined' && module.exports) module.exports = Snapshots;
})();