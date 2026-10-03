// ============================================================
// 存档层
// 卡带层：/cards/{cardId}.json        只读模板
// 存档层：/saves/{cardId}/{saveId}/   每份独立副本
// v2：新增 snapshots / npc_runtime / portrait 路径接口
// ============================================================

(function() {
  // D-2 · 卡带形态归一化第二咽喉（存档载入）。
  // Saves.load 的 card 来自 readJSON 全新解析对象，原地归一化不污染源文件；
  // 键表与 engine/core/storage.js 的 NORMALIZE_DEF_KEYS 保持一致；
  // mapNodes 不动；timeline.official 嵌套处理。
  var SAVE_NORMALIZE_DEF_KEYS = ['npcs', 'factions', 'items', 'maps', 'shops', 'events', 'tasks', 'achievements', 'endings', 'storyNodes', 'foreshadows'];

  function normalizeLoadedCard(card) {
    if (!card || typeof card !== 'object' || !card.worldbook || typeof card.worldbook !== 'object') return card;
    var wb = card.worldbook;
    SAVE_NORMALIZE_DEF_KEYS.forEach(function(k) {
      if (wb[k] && typeof wb[k] === 'object' && !Array.isArray(wb[k])) {
        wb[k] = CardValidator.normalizeDefs(wb[k]);
      }
    });
    if (wb.timeline && wb.timeline.official && typeof wb.timeline.official === 'object' && !Array.isArray(wb.timeline.official)) {
      wb.timeline.official = CardValidator.normalizeDefs(wb.timeline.official);
    }
    return card;
  }

  var Saves = {
    basePath(cardId, saveId) { return '/saves/' + cardId + '/' + saveId; },
    metaPath(cardId, saveId)   { return this.basePath(cardId, saveId) + '/meta.json'; },
    cardPath(cardId, saveId)   { return this.basePath(cardId, saveId) + '/card.json'; },
    playerPath(cardId, saveId) { return this.basePath(cardId, saveId) + '/player.json'; },
    chatDir(cardId, saveId)    { return this.basePath(cardId, saveId) + '/chat'; },
    chatChunkPath(cardId, saveId, i) {
      return this.chatDir(cardId, saveId) + '/' + String(i).padStart(3, '0') + '.json';
    },
    chatIndexPath(cardId, saveId) {
      return this.chatDir(cardId, saveId) + '/index.json';
    },

    // ---- v2 新增 ----
    snapshotsDir(cardId, saveId)   { return this.basePath(cardId, saveId) + '/snapshots'; },
    snapshotPath(cardId, saveId, round) {
      return this.snapshotsDir(cardId, saveId) + '/r' + String(round).padStart(4, '0') + '.json';
    },
    npcRuntimePath(cardId, saveId) { return this.basePath(cardId, saveId) + '/npc_runtime.json'; },
    portraitPath(cardId, saveId)   { return this.basePath(cardId, saveId) + '/portrait.json'; },

    loadNpcRuntime(cardId, saveId) {
      return VFS.readJSON(this.npcRuntimePath(cardId, saveId)) || {};
    },
    saveNpcRuntime(cardId, saveId, data) {
      VFS.writeJSON(this.npcRuntimePath(cardId, saveId), data || {});
    },
    loadPortrait(cardId, saveId) {
      return VFS.readJSON(this.portraitPath(cardId, saveId)) || null;
    },
    savePortrait(cardId, saveId, data) {
      VFS.writeJSON(this.portraitPath(cardId, saveId), data || null);
    },
    // ---- v2 新增结束 ----

    listAll() {
      const out = [];
      VFS.listAll('/saves').forEach(p => {
        if (p.endsWith('/meta.json')) {
          const m = VFS.readJSON(p);
          if (m && m.saveId) out.push(m);
        }
      });
      out.sort((a, b) => (b.lastPlayedAt || '').localeCompare(a.lastPlayedAt || ''));
      return out;
    },

    listByCard(cardId) {
      return this.listAll().filter(m => m.cardId === cardId);
    },

    getNextDefaultName(cardId) {
      const card = Storage.getAllCards()[cardId];
      const base = card ? (card.cardName || cardId) : cardId;
      const nameSet = new Set();
      this.listByCard(cardId).forEach(m => {
        if (m.displayName) nameSet.add(m.displayName);
      });
      for (let i = 1; i < 1000; i++) {
        const n = base + String(i).padStart(2, '0');
        if (!nameSet.has(n)) return n;
      }
      return base + '_' + Date.now();
    },

    // 读分片，自动迁移老格式
    _loadChat(cardId, saveId) {
      var dir = this.chatDir(cardId, saveId);
      var index = VFS.readJSON(this.chatIndexPath(cardId, saveId));

      // 分片格式
      if (index && typeof index.totalMessages === 'number') {
        var messages = [];
        var chunkSize = index.chunkSize || 30;
        var chunkCount = Math.ceil(index.totalMessages / chunkSize);
        for (var i = 0; i < chunkCount; i++) {
          var chunk = VFS.readJSON(this.chatChunkPath(cardId, saveId, i));
          if (chunk && Array.isArray(chunk.messages)) {
            messages = messages.concat(chunk.messages);
          }
        }
        return { messages: messages };
      }

      // 迁移老格式 chat.json
      var legacyPath = this.basePath(cardId, saveId) + '/chat.json';
      var legacy = VFS.readJSON(legacyPath);
      if (legacy && Array.isArray(legacy.messages)) {
        try {
          this.saveChat(cardId, saveId, legacy.messages);
          VFS.deleteFile(legacyPath);
        } catch (e) {
          console.warn('[Saves] chat.json 迁移失败，保留老文件：', e);
          return legacy;
        }
        return legacy;
      }

      // 全新存档
      return { messages: [] };
    },

    create(cardId, displayName) {
      const card = Storage.getAllCards()[cardId];
      if (!card) { Platform.dialog.alert('卡带不存在'); return null; }
      const saveId = 'save_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      const now = new Date().toISOString();
      const meta = {
        saveId: saveId,
        cardId: cardId,
        cardName: card.cardName || cardId,
        displayName: displayName || this.getNextDefaultName(cardId),
        createdAt: now,
        lastPlayedAt: now,
        playTime: 0,
        playerName: ''
      };
      VFS.mkdir(this.basePath(cardId, saveId));
      VFS.writeJSON(this.metaPath(cardId, saveId), meta);
      VFS.writeJSON(this.cardPath(cardId, saveId), card);
      VFS.writeJSON(this.playerPath(cardId, saveId), { playerData: {}, currentState: null });
      VFS.mkdir(this.chatDir(cardId, saveId));
      VFS.writeJSON(this.chatIndexPath(cardId, saveId), { chunkSize: 30, totalMessages: 0 });
      // v2：初始化新结构
      VFS.mkdir(this.snapshotsDir(cardId, saveId));
      VFS.writeJSON(this.npcRuntimePath(cardId, saveId), {});
      return saveId;
    },

    load(cardId, saveId) {
      const meta = VFS.readJSON(this.metaPath(cardId, saveId));
      const card = normalizeLoadedCard(VFS.readJSON(this.cardPath(cardId, saveId)));
      const player = VFS.readJSON(this.playerPath(cardId, saveId)) || { playerData: {}, currentState: null };
      const chat = this._loadChat(cardId, saveId);
      if (!meta || !card) return null;
      return { meta: meta, card: card, player: player, chat: chat };
    },

    savePlayer(cardId, saveId, playerData, currentState, gameTime) {
      VFS.writeJSON(this.playerPath(cardId, saveId), {
        playerData: playerData,
        currentState: currentState,
        gameTime: gameTime || null
      });
    },
    saveChat(cardId, saveId, messages) {
      messages = messages || [];
      var dir = this.chatDir(cardId, saveId);
      VFS.mkdir(dir);

      var CHUNK = 30;
      var index = VFS.readJSON(this.chatIndexPath(cardId, saveId)) || { chunkSize: CHUNK, totalMessages: 0 };
      var prevTotal = index.totalMessages || 0;
      var newTotal = messages.length;
      var newChunkCount = Math.ceil(newTotal / CHUNK);
      var newLastIdx = newChunkCount - 1;

      if (newTotal === 0) {
        // 空：删全部分片
        VFS.listAll(dir).forEach(function(p) {
          if (/\/(\d+)\.json$/.test(p)) VFS.deleteFile(p);
        });
      } else if (prevTotal > 0 && newTotal > prevTotal) {
        // append：只重写最后一个分片
        var lastStart = newLastIdx * CHUNK;
        var lastChunk = messages.slice(lastStart, lastStart + CHUNK);
        VFS.writeJSON(this.chatChunkPath(cardId, saveId, newLastIdx), { messages: lastChunk });
      } else {
        // 首次 / 截断 / 长度不变：全量重写
        VFS.listAll(dir).forEach(function(p) {
          if (/\/(\d+)\.json$/.test(p)) VFS.deleteFile(p);
        });
        for (var i = 0; i < newChunkCount; i++) {
          var chunk = messages.slice(i * CHUNK, (i + 1) * CHUNK);
          VFS.writeJSON(this.chatChunkPath(cardId, saveId, i), { messages: chunk });
        }
      }

      VFS.writeJSON(this.chatIndexPath(cardId, saveId), {
        chunkSize: CHUNK,
        totalMessages: newTotal
      });
    },
    saveCard(cardId, saveId, card) {
      VFS.writeJSON(this.cardPath(cardId, saveId), card);
    },

    touch(cardId, saveId, playTimeDelta) {
      const m = VFS.readJSON(this.metaPath(cardId, saveId));
      if (!m) return;
      m.lastPlayedAt = new Date().toISOString();
      if (playTimeDelta) m.playTime = (m.playTime || 0) + playTimeDelta;
      VFS.writeJSON(this.metaPath(cardId, saveId), m);
    },

    rename(cardId, saveId, newName) {
      const m = VFS.readJSON(this.metaPath(cardId, saveId));
      if (!m) return;
      m.displayName = newName;
      VFS.writeJSON(this.metaPath(cardId, saveId), m);
    },

    setPlayerName(cardId, saveId, playerName) {
      const m = VFS.readJSON(this.metaPath(cardId, saveId));
      if (!m) return;
      m.playerName = playerName;
      VFS.writeJSON(this.metaPath(cardId, saveId), m);
    },

    delete(cardId, saveId) {
      VFS.rmdir(this.basePath(cardId, saveId), true);
    },

    formatPlayTime(sec) {
      sec = sec || 0;
      if (sec < 60) return sec + ' 秒';
      if (sec < 3600) return Math.floor(sec / 60) + ' 分钟';
      return (sec / 3600).toFixed(1) + ' 小时';
    },

    formatDate(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      const p = n => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
  };
  if (typeof window !== 'undefined') window.Saves = Saves;
  if (typeof module !== 'undefined' && module.exports) module.exports = Saves;
})();