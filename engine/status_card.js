// ============================================================
// 状态卡系统核心
// - 玩家/场景的动态字段（location / mood / outfit …）
// - NPC 心声缓存
// - 数据存：/saves/{cardId}/{saveId}/status_card.json
// - 工具：update_status / update_status_bulk / set_inner_voice
// ============================================================

(function() {
  var StatusCard = {
    _data: null,

    _path: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/status_card.json';
    },

    _ensureShape: function() {
      if (!this._data || typeof this._data !== 'object') {
        this._data = { fields: {}, innerVoices: {}, updatedAt: '' };
        return;
      }
      if (!this._data.fields) this._data.fields = {};
      if (!this._data.innerVoices) this._data.innerVoices = {};
      if (typeof this._data.updatedAt !== 'string') this._data.updatedAt = '';
    },

    load: function() {
      var p = this._path();
      if (!p) { this._data = { fields: {}, innerVoices: {}, updatedAt: '' }; return; }
      var d = VFS.readJSON(p);
      this._data = d && typeof d === 'object' ? d : { fields: {}, innerVoices: {}, updatedAt: '' };
      this._ensureShape();
    },

    save: function() {
      var p = this._path();
      if (!p || !this._data) return;
      this._data.updatedAt = GameState.formatGameTime();
      VFS.writeJSON(p, this._data);
    },

    getRuntime: function() {
      if (!this._data) this.load();
      if (this._ensureShape) this._ensureShape();
      return this._data ? JSON.parse(JSON.stringify(this._data)) : null;
    },
    setRuntime: function(data) {
      this._data = data ? JSON.parse(JSON.stringify(data)) : null;
      if (this._ensureShape) this._ensureShape();
      this.save();
    },

    // 卡带配置
    getConfig: function() {
      var card = GameState.currentCard;
      if (!card) return null;
      return card.statusCard || null;
    },

    isEnabled: function() {
      var cfg = this.getConfig();
      return !!(cfg && cfg.enabled);
    },

    // 取字段
    getField: function(key) {
      if (!this._data) this.load();
      return this._data.fields[key];
    },

    // 取所有字段
    getAllFields: function() {
      if (!this._data) this.load();
      return this._data.fields;
    },

    // 设置单条字段
    setField: function(key, value) {
      if (!this._data) this.load();
      if (!key) return { ok: false, reason: 'key 为空' };
      var old = this._data.fields[key];
      this._data.fields[key] = String(value == null ? '' : value);
      this.save();
      return { ok: true, key: key, oldValue: old, newValue: this._data.fields[key] };
    },

    // 批量
    setFields: function(obj) {
      if (!this._data) this.load();
      if (!obj || typeof obj !== 'object') return { ok: false, reason: '不是对象' };
      var changes = [];
      var self = this;
      Object.keys(obj).forEach(function(k) {
        var old = self._data.fields[k];
        self._data.fields[k] = String(obj[k] == null ? '' : obj[k]);
        changes.push({ key: k, oldValue: old, newValue: self._data.fields[k] });
      });
      this.save();
      return { ok: true, changes: changes };
    },

    // NPC 心声
    getInnerVoice: function(npcId) {
      if (!this._data) this.load();
      return this._data.innerVoices[npcId] || '';
    },

    setInnerVoice: function(npcId, text) {
      if (!this._data) this.load();
      if (!npcId) return { ok: false, reason: 'npcId 为空' };
      var old = this._data.innerVoices[npcId];
      this._data.innerVoices[npcId] = String(text == null ? '' : text);
      this.save();
      return { ok: true, npcId: npcId, oldValue: old, newValue: this._data.innerVoices[npcId] };
    },

    // ============ 给 prompt 用 ============
    // 只输出最近更新的字段 + 当前场景 NPC 心声
    formatForPrompt: function() {
      var cfg = this.getConfig();
      if (!cfg || !cfg.enabled) return '';
      if (!this._data) this.load();

      var lines = [];
      var fields = this._data.fields;
      var hasFields = false;

      // 字段部分
      var sectionFields = [];
      (cfg.sections || []).forEach(function(sec) {
        if (sec.type === 'fields' && Array.isArray(sec.keys)) {
          sec.keys.forEach(function(k) { if (sectionFields.indexOf(k) < 0) sectionFields.push(k); });
        }
      });
      if (sectionFields.length) {
        var pairs = [];
        sectionFields.forEach(function(k) {
          if (fields[k]) {
            var label = k;
            // 找 section 里的 labels
            (cfg.sections || []).forEach(function(sec) {
              if (sec.type === 'fields' && sec.labels && sec.labels[k]) label = sec.labels[k];
            });
            pairs.push(label + '=' + fields[k]);
            hasFields = true;
          }
        });
        if (pairs.length) lines.push('· 状态卡：' + pairs.join(' | '));
      }

      // 心声部分
      var voices = [];
      var self = this;
      (cfg.sections || []).forEach(function(sec) {
        if (sec.type === 'innerVoice' && sec.npcId) {
          var v = self._data.innerVoices[sec.npcId];
          if (v) voices.push('· ' + sec.npcId + '：' + v);
        }
      });
      if (voices.length) {
        lines.push('· NPC 心声：');
        voices.forEach(function(x) { lines.push('  ' + x); });
      }

      return lines.join('\n');
    },

    // 清理（比如回退时）
    clear: function() {
      this._data = { fields: {}, innerVoices: {}, updatedAt: '' };
      this.save();
    }
  };

  // ============ 工具注册 ============
  function registerTools() {
    if (typeof ToolExecutor === 'undefined' || !ToolExecutor.WHITELIST) {
      if (typeof ErrorLog !== 'undefined' && ErrorLog.action) {
        ErrorLog.action('BOOT', 'StatusCard 工具注册失败：ToolExecutor 未就绪');
      }
      if (typeof console !== 'undefined') console.error('[StatusCard] 工具注册失败：ToolExecutor 未就绪');
      return;
    }
    var SC = StatusCard;

    ToolExecutor.WHITELIST.update_status = {
      run: function(a) {
        if (!SC.isEnabled()) return { ok: false, reason: '状态卡未启用' };
        var key = a.key;
        if (!key) return { ok: false, reason: '缺少 key' };
        var r = SC.setField(key, a.value);
        if (!r.ok) return r;
        return {
          ok: true,
          type: 'status',
          action: 'update',
          key: r.key,
          oldValue: r.oldValue,
          newValue: r.newValue,
          label: '状态卡·' + key
        };
      }
    };

    ToolExecutor.WHITELIST.update_status_bulk = {
      run: function(a) {
        if (!SC.isEnabled()) return { ok: false, reason: '状态卡未启用' };
        var fields = a.fields;
        if (!fields || typeof fields !== 'object') return { ok: false, reason: '缺少 fields' };
        var r = SC.setFields(fields);
        if (!r.ok) return r;
        return {
          ok: true,
          type: 'status',
          action: 'bulk',
          changes: r.changes,
          label: '状态卡·更新 ' + r.changes.length + ' 项'
        };
      }
    };

    ToolExecutor.WHITELIST.set_inner_voice = {
      run: function(a) {
        if (!SC.isEnabled()) return { ok: false, reason: '状态卡未启用' };
        if (!a.npcId) return { ok: false, reason: '缺少 npcId' };
        var r = SC.setInnerVoice(a.npcId, a.text || '');
        if (!r.ok) return r;
        return {
          ok: true,
          type: 'status',
          action: 'voice',
          npcId: r.npcId,
          newValue: r.newValue,
          label: 'NPC 心声·' + r.npcId
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

  if (typeof window !== 'undefined') window.StatusCard = StatusCard;
  if (typeof module !== 'undefined' && module.exports) module.exports = StatusCard;
})();