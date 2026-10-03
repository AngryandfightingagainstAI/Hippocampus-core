// ============================================================
// 头像系统
// - 数据层：玩家头像 + NPC 头像
// - 存储：优先 base64（压缩后 ≤ 64KB），也可用外链 URL
// - 玩家头像：存存档 /saves/{cardId}/{saveId}/avatars/player.json
// - NPC 头像：存存档 /saves/{cardId}/{saveId}/avatars/npcs.json
// - 上传：由 Platform.image.compressFile 压缩到 256×256 JPEG
// ============================================================

(function() {
  var MAX_SIZE = 256;          // 压缩到 256×256
  var JPEG_QUALITY = 0.8;      // JPEG 质量
  var MAX_BYTES = 80 * 1024;   // 单张最大 80KB

  var Avatar = {
    _playerData: null,
    _npcsData: null,

    _playerPath: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/avatars/player.json';
    },
    _npcsPath: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/avatars/npcs.json';
    },

    load: function() {
      var pp = this._playerPath();
      var np = this._npcsPath();
      if (!pp || !np) { this._playerData = null; this._npcsData = {}; return; }
      this._playerData = VFS.readJSON(pp) || null;
      this._npcsData = VFS.readJSON(np) || {};
    },

    save: function() {
      var pp = this._playerPath();
      var np = this._npcsPath();
      if (!pp || !np) return;
      if (this._playerData) VFS.writeJSON(pp, this._playerData);
      VFS.writeJSON(np, this._npcsData || {});
    },

    // ============ 玩家头像 ============
    getPlayer: function() {
      if (this._playerData === null) this.load();
      return this._playerData;
    },

    setPlayer: function(dataUrlOrUrl) {
      if (this._playerData === null) this.load();
      if (!dataUrlOrUrl) { this._playerData = null; this.save(); return { ok: true, cleared: true }; }
      this._playerData = {
        src: String(dataUrlOrUrl),
        updatedAt: GameState.formatGameTime()
      };
      this.save();
      return { ok: true, src: this._playerData.src };
    },

    clearPlayer: function() {
      this._playerData = null;
      this.save();
    },

    // ============ NPC 头像 ============
    getNpc: function(npcId) {
      if (this._npcsData === null) this.load();
      return this._npcsData[npcId] || null;
    },

    setNpc: function(npcId, dataUrlOrUrl) {
      if (this._npcsData === null) this.load();
      if (!npcId) return { ok: false, reason: '缺少 npcId' };
      if (!dataUrlOrUrl) {
        delete this._npcsData[npcId];
        this.save();
        return { ok: true, cleared: true };
      }
      this._npcsData[npcId] = {
        src: String(dataUrlOrUrl),
        updatedAt: GameState.formatGameTime()
      };
      this.save();
      return { ok: true, npcId: npcId, src: this._npcsData[npcId].src };
    },

    clearNpc: function(npcId) {
      if (this._npcsData === null) this.load();
      delete this._npcsData[npcId];
      this.save();
    },

    getAllNpcs: function() {
      if (this._npcsData === null) this.load();
      return this._npcsData;
    },

    // ============ 图片处理工具 ============
    // 从 File 对象压缩到 base64（平台适配层实现，见 Platform.image.compressFile）
    compressFile: function(file) {
      return Platform.image.compressFile(file, {
        maxSize: MAX_SIZE,
        quality: JPEG_QUALITY,
        fallbackQuality: 0.6,
        maxBytes: MAX_BYTES
      });
    },

    // 从 URL 加载（外链）
    setFromUrl: function(url) {
      if (!/^https?:\/\//i.test(url)) return { ok: false, reason: 'URL 格式不对' };
      return { ok: true, src: url };
    },

    // ============ 导出/导入（备份） ============
    exportAll: function() {
      if (this._playerData === null) this.load();
      return {
        player: this._playerData,
        npcs: this._npcsData || {}
      };
    },

    importAll: function(data) {
      if (!data) return;
      this._playerData = data.player || null;
      this._npcsData = data.npcs || {};
      this.save();
    },

    // ============ 清理 ============
    clear: function() {
      this._playerData = null;
      this._npcsData = {};
      this.save();
    }
  };

  // ============ 工具注册 ============
  // 头像一般不是 AI 主动设的，但允许 AI 查询/建议
  function registerTools() {
    if (typeof ToolExecutor === 'undefined' || !ToolExecutor.WHITELIST) {
      if (typeof ErrorLog !== 'undefined' && ErrorLog.action) {
        ErrorLog.action('BOOT', 'Avatar 工具注册失败：ToolExecutor 未就绪');
      }
      if (typeof console !== 'undefined') console.error('[Avatar] 工具注册失败：ToolExecutor 未就绪');
      return;
    }
    var A = Avatar;

    ToolExecutor.WHITELIST.query_avatar = {
      run: function(a) {
        if (a.npcId) {
          var v = A.getNpc(a.npcId);
          return { ok: true, type: 'query', queryType: 'avatar', npcId: a.npcId, data: v };
        }
        return {
          ok: true,
          type: 'query',
          queryType: 'avatar',
          data: {
            player: !!A.getPlayer(),
            npcs: Object.keys(A.getAllNpcs())
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
  if (typeof window !== 'undefined') window.Avatar = Avatar;
  if (typeof module !== 'undefined' && module.exports) module.exports = Avatar;
})();