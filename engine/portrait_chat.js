// ============================================================
// 人设共创 · 会话层（P71）
// 纯逻辑，无 DOM，可单测。
// 职责：维护滚动聊天窗口（≤15 轮=30 条）、超窗压缩纪要到 chatArchive、
//       token 安全阀（超 12000 只带最近 10 轮）、落盘/恢复。
// 聊天数据走 Portrait.loadChat/saveChat（独立文件 portrait_chat.json，
// 不进 playerData、不进快照）。
// ============================================================

(function() {
  var MAX_ROUNDS = 15;       // 窗口 = 15 轮（user+assistant 各算一条）
  var MAX_MSGS = MAX_ROUNDS * 2;  // 30 条
  var MAX_ARCHIVE = 3;       // chatArchive 最多 3 条
  var TOKEN_SAFETY = 12000;  // 超此值只带最近 10 轮
  var SAFETY_ROUNDS = 10;
  var TOKEN_PER_CHAR = 1.4;  // 中文粗算

  var PortraitChat = {
    _chat: [],        // [{role, content, ts}]
    _archive: [],     // [{at, digest}]

    // —— 基本操作 ——
    list: function() { return this._chat.slice(); },

    reset: function() {
      this._chat = [];
      this._archive = [];
    },

    // 追加一条消息；超窗时挤最早两条成纪要
    append: function(role, content) {
      var msg = {
        role: (role === 'assistant') ? 'assistant' : 'user',
        content: String(content == null ? '' : content),
        ts: new Date().toISOString()
      };
      this._chat.push(msg);
      // 超窗：丢最早 2 条（一轮），压成 digest 进 archive
      while (this._chat.length > MAX_MSGS) {
        var dropped = this._chat.splice(0, 2);
        var digest = this.digestOf(dropped);
        this._archive.push({ at: new Date().toISOString(), digest: digest });
        if (this._archive.length > MAX_ARCHIVE) {
          this._archive = this._archive.slice(this._archive.length - MAX_ARCHIVE);
        }
      }
      return msg;
    },

    // 取最近 N 轮的消息（用于组装 prompt）
    windowed: function(rounds) {
      var n = (rounds && rounds > 0) ? rounds : MAX_ROUNDS;
      var msgs = n * 2;
      return this._chat.slice(-msgs);
    },

    // 被挤出消息的本地纪要：取每条前 40 字拼起来，≤150 字
    digestOf: function(messages) {
      var parts = [];
      (messages || []).forEach(function(m) {
        var c = String(m.content || '');
        if (c.length > 40) c = c.slice(0, 40) + '…';
        parts.push((m.role === 'user' ? '玩家' : 'AI') + '：' + c);
      });
      var s = parts.join('；');
      if (s.length > 150) s = s.slice(0, 150) + '…';
      return s;
    },

    // 估算 token（中文按 1.4/字）
    estimateTokens: function(messages) {
      var chars = 0;
      (messages || []).forEach(function(m) {
        chars += String(m.content || '').length;
      });
      return Math.ceil(chars * TOKEN_PER_CHAR);
    },

    // 组装给 API 的 messages 数组（system + 聊天）
    // 安全阀：若全量估算 > TOKEN_SAFETY，只带最近 SAFETY_ROUNDS 轮
    // chatArchive 纪要注入 system 顶部（【更早的讨论纪要】），让超窗轮次不丢
    buildMessages: function(systemPrompt) {
      var all = this._chat.slice();
      var sys = String(systemPrompt || '');
      // 把被挤出窗口的纪要拼到 system 顶部
      if (this._archive && this._archive.length) {
        var archiveLines = this._archive.map(function(a) { return a.digest; });
        sys = '【更早的讨论纪要】\n' + archiveLines.join('\n') + '\n\n' + sys;
      }
      var est = this.estimateTokens(all) + Math.ceil(sys.length * TOKEN_PER_CHAR);
      var useRounds = (est > TOKEN_SAFETY) ? SAFETY_ROUNDS : MAX_ROUNDS;
      var msgs = this.windowed(useRounds);
      var out = [];
      if (sys) out.push({ role: 'system', content: sys });
      msgs.forEach(function(m) {
        out.push({ role: m.role, content: m.content });
      });
      return { messages: out, truncated: (useRounds < MAX_ROUNDS), rounds: useRounds };
    },

    // —— 持久化（走 Portrait.loadChat/saveChat）——
    // 只覆盖 chat/chatArchive，undo 必须保留（聊天每发一句不能清空撤回栈）
    persist: function() {
      if (typeof Portrait === 'undefined' || !Portrait.saveChat) return false;
      var doc = Portrait.loadChat();
      return Portrait.saveChat({
        chat: this._chat,
        chatArchive: this._archive,
        undo: Array.isArray(doc.undo) ? doc.undo : []
      });
    },

    restore: function() {
      if (typeof Portrait === 'undefined' || !Portrait.loadChat) {
        this._chat = []; this._archive = [];
        return;
      }
      var doc = Portrait.loadChat();
      this._chat = Array.isArray(doc.chat) ? doc.chat : [];
      this._archive = Array.isArray(doc.chatArchive) ? doc.chatArchive : [];
    }
  };

  if (typeof window !== 'undefined') window.PortraitChat = PortraitChat;
  if (typeof module !== 'undefined' && module.exports) module.exports = PortraitChat;
})();
