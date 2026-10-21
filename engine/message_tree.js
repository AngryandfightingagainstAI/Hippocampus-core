// ============================================================
// P72 · 消息树（Merklist）数据层 · A 类纯逻辑
// ------------------------------------------------------------
// 数据宿主：GameState.messageTree = {
//   v: 1, seq: <自增计数>, activeLeafId: <主线末节点 id>,
//   nodes: [ { id, parentId, kind, round, ts, msg } ]
// }
//   · kind: 'system' | 'action'（玩家输入）| 'story'（AI 回复）
//           | 'fb'（引擎反馈）| 'info'（手机混流讯息）
//   · msg 即消息对象本体（{role, content[, meta]}）——toChatHistory()
//     导出的就是 nodes 主线链上的 msg 引用数组，因此：
//     ① 迁移门禁「逐字一致」天然成立（msg 直接引用原对象）；
//     ② applyWindow 的 _windowAnchor 存的导出元素引用跨轮稳定；
//     ③ story.js 对导出元素直挂 meta（assistantMsgRef.meta=…）自动落到树节点。
//   · 沿 activeLeafId 向 parentId 回溯 = 主线；渲染与 prompt 只认主线导出。
//   · 分支：appendAt(parentId, …) 在任意节点下长出新分支并把 activeLeafId
//     切过去；切分支不删节点（setActiveLeaf 只挪 activeLeafId）。
//   · 快照对齐：Snapshots.push 记 activeLeafId 为 snap.messageId，
//     回退按 id 在主线上定位（_cutIndex 优先走 id，失配再退回指纹法）。
// 挂载：window.MessageTree / module.exports（两仓同源 mirror）。
// ============================================================

(function () {
  'use strict';

  var EDIT_WINDOW = 30;   // §3.5：距主线末 30 条内的玩家输入可编辑
  var INFO_PREFIX = '【系统 · 手机混流】';
  var SYS_PREFIX = '【系统 ·';

  function MessageTree() {}

  function isRealUserMsg(msg) {
    return !!msg && msg.role === 'user' && !String(msg.content || '').startsWith(SYS_PREFIX);
  }

  // 只读探测：树由 init（开局）/ migrateFromHistory（老档迁移，经 gamestate
  // 装载）显式建立；这里绝不自动建树——无树态下 append 若隐式建空树，
  // syncChatHistory 会用空树导出覆盖 chatHistory，老档历史整段丢失。
  function tree() {
    var t = GameState.messageTree;
    if (!t || !Array.isArray(t.nodes)) return null;
    return t;
  }

  // id → 节点 的懒索引缓存。为什么需要：nodeById 原本每次线性扫描 nodes，
  // 而 mainline() 每回溯一级就调一次 nodeById，appendUnder 里又要调两次
  // mainline()（算轮号 + 重导出 chatHistory）——长档下每次 append 是 O(n²)。
  // 实测 2200 条主线时单次 append 约 38ms，一回合 6 次 append 就是 ~230ms 纯记账。
  // 用「节点数量」当失效判据：所有改动 nodes 的入口（push/splice）都会改变长度。
  var _idxCache = { t: null, n: -1, map: null };

  function nodeById(id) {
    var t = tree();
    if (!t) return null;
    if (_idxCache.t !== t || _idxCache.n !== t.nodes.length) {
      var m = Object.create(null);
      for (var i = 0; i < t.nodes.length; i++) {
        var nd = t.nodes[i];
        if (nd && nd.id != null) m[nd.id] = nd;
      }
      _idxCache = { t: t, n: t.nodes.length, map: m };
    }
    return _idxCache.map[id] || null;
  }

  // 系统根节点（主线第 0 条 system 的宿主）。空树时返回 null。
  function systemNode() {
    var t = tree();
    if (!t) return null;
    for (var i = 0; i < t.nodes.length; i++) if (t.nodes[i].kind === 'system') return t.nodes[i];
    return null;
  }

  // 主线：activeLeafId 沿 parentId 回溯到根，反转成数组（含 system 根）。
  function mainline() {
    var t = tree();
    var out = [];
    if (!t) return out;
    var cur = t.activeLeafId ? nodeById(t.activeLeafId) : null;
    var guard = 0;
    while (cur && guard++ < 100000) {
      out.push(cur);
      cur = cur.parentId ? nodeById(cur.parentId) : null;
    }
    out.reverse();
    return out;
  }

  // —— 导出与同步 ——————————————————————————————

  // 主线导出 = 主线节点的 msg 引用数组（与 chatHistory 语义逐字一致）。
  MessageTree.toChatHistory = function () {
    return mainline().map(function (n) { return n.msg; });
  };

  MessageTree.syncChatHistory = function () {
    GameState.chatHistory = MessageTree.toChatHistory();
  };

  // —— 生命周期 ——————————————————————————————

  // 开局建树：system + 开场白。startGame 专用（重建整树）。
  MessageTree.init = function (systemContent, opening) {
    var t = { v: 1, seq: 0, nodes: [], activeLeafId: null };
    GameState.messageTree = t;
    var sysNode = {
      id: 'm' + (++t.seq), parentId: null, kind: 'system', round: 0, ts: 0,
      msg: { role: 'system', content: systemContent }
    };
    var openNode = {
      id: 'm' + (++t.seq), parentId: sysNode.id, kind: 'action', round: 1, ts: Date.now(),
      msg: { role: 'user', content: opening }
    };
    t.nodes.push(sysNode, openNode);
    t.activeLeafId = openNode.id;
    MessageTree.syncChatHistory();
    return t;
  };

  // 每轮刷新 system 头（callAI 重建静态提示词后）。
  MessageTree.updateSystem = function (content) {
    var sys = systemNode();
    if (sys) sys.msg.content = content;
  };

  // 当前轮号：主线上真实玩家发言数（与 Snapshots._currentRound 同源口径）。
  MessageTree.currentRound = function () {
    var n = 0;
    mainline().forEach(function (node) { if (isRealUserMsg(node.msg)) n++; });
    return n;
  };

  // —— 写入 ——————————————————————————————————

  function appendUnder(parentId, kind, msg, ts) {
    var t = tree();
    var parent = parentId ? nodeById(parentId) : null;
    if (!parent) {
      // 空树（或父节点不在树上）时挂到 system 根；根也没有则先造一个占位根。
      parent = systemNode();
      if (!parent) {
        parent = {
          id: 'm' + (++t.seq), parentId: null, kind: 'system', round: 0, ts: 0,
          msg: { role: 'system', content: '' }
        };
        t.nodes.push(parent);
      }
      parentId = parent.id;
    }
    var node = {
      id: 'm' + (++t.seq), parentId: parentId, kind: kind,
      round: 0, ts: ts || Date.now(), msg: msg
    };
    t.nodes.push(node);
    t.activeLeafId = node.id;
    // 挂载后算轮号：action 节点含自身（= 本轮轮号），fb/info 不带【系统 ·】
    // 前缀的普通 msg 也不会误推（isRealUserMsg 只认真玩家）
    node.round = MessageTree.currentRound();
    MessageTree.syncChatHistory();
    return node;
  }

  // 主线尾追加（story.js / info_feed.js 各 push 点）。
  // 无树态（老档迁移门禁未过 / 未建树的测试沙箱）：fail-open 退回旧口径
  // 直写 chatHistory，绝不建空树覆盖历史——与 P72 之前的行为逐字一致。
  MessageTree.append = function (kind, msg) {
    var t = GameState.messageTree;
    if (!t || !Array.isArray(t.nodes)) {
      GameState.chatHistory.push(msg);
      return null;
    }
    return appendUnder(t.activeLeafId, kind, msg, Date.now());
  };

  // 指定父节点下开新分支（doRegenerate 兄弟分支 / 切旧支续写），
  // activeLeafId 一并切到新节点。无树态同样 fail-open 直写旧口径。
  MessageTree.appendAt = function (parentId, kind, msg) {
    var t = GameState.messageTree;
    if (!t || !Array.isArray(t.nodes)) {
      GameState.chatHistory.push(msg);
      return null;
    }
    return appendUnder(parentId, kind, msg, Date.now());
  };

  // 删除节点（渲染失败回滚孤儿 assistant 专用）：只许删链尾无子节点，
  // 删后 activeLeafId 回退到其父。
  MessageTree.removeNode = function (id) {
    var t = tree();
    var node = nodeById(id);
    if (!node) return false;
    for (var i = 0; i < t.nodes.length; i++) {
      if (t.nodes[i].parentId === id) return false;   // 有子节点：拒绝，防断链
    }
    t.nodes.splice(t.nodes.indexOf(node), 1);
    if (t.activeLeafId === id) t.activeLeafId = node.parentId || null;
    MessageTree.syncChatHistory();
    return true;
  };

  // maybeCompress 砍头：丢弃主线 rest（不含 system）前 keepFrom 条，
  // 新主线首节点改挂 system 根；被丢弃节点删除（原文已进日志）。
  MessageTree.dropMainlineHead = function (keepFrom) {
    var t = tree();
    var line = mainline();
    if (line.length <= 1 || keepFrom <= 0) return line.length;
    var sys = line[0];
    var dropCount = Math.min(keepFrom, line.length - 1);
    for (var i = 1; i <= dropCount; i++) {
      var idx = t.nodes.indexOf(line[i]);
      if (idx >= 0) t.nodes.splice(idx, 1);
    }
    var newHead = nodeById(line[dropCount + 1] ? line[dropCount + 1].id : null);
    if (newHead) newHead.parentId = sys.id;
    if (!t.activeLeafId || !nodeById(t.activeLeafId)) t.activeLeafId = sys.id;
    MessageTree.syncChatHistory();
    return mainline().length;
  };

  // 快照回退截断：主线截到 count 条（与 chatHistory.slice(0, cut) 同口径）。
  MessageTree.truncateToCount = function (count) {
    var t = tree();
    var line = mainline();
    if (count >= line.length) return line.length;
    for (var i = line.length - 1; i >= Math.max(1, count); i--) {
      var idx = t.nodes.indexOf(line[i]);
      if (idx >= 0) t.nodes.splice(idx, 1);
    }
    t.activeLeafId = (count >= 1 && line[count - 1]) ? line[count - 1].id : null;
    MessageTree.syncChatHistory();
    return mainline().length;
  };

  // —— 分支 —————————————————————————————————

  // 切主线（↩ 回到这里）：只挪 activeLeafId，不删任何节点。
  MessageTree.setActiveLeaf = function (id) {
    var t = tree();
    if (!nodeById(id)) return false;
    t.activeLeafId = id;
    MessageTree.syncChatHistory();
    return true;
  };

  MessageTree.activeLeafId = function () {
    var t = tree();
    return t ? (t.activeLeafId || null) : null;
  };

  // P72·W0-b：主链节点 id 数组（根→叶）。供 story.js 压缩时取被归档消息的
  //   节点 id（chunk.msgIds）、snapshots.js rollbackTo 收集被切走分支的
  //   msgIds（Logger.archiveAfter 的定位键）。无树态返回 null。
  MessageTree.mainlineIds = function () {
    var t = tree();
    if (!t) return null;
    return mainline().map(function (n) { return n.id; });
  };

  // P72·W1：按 id 拿节点数据（UI 层定位父 / 兄弟用）。节点不在树上返回 null。
  MessageTree.byId = function (id) {
    return nodeById(id) || null;
  };

  MessageTree.children = function (id) {
    var t = tree();
    if (!t) return [];
    return t.nodes.filter(function (n) { return n.parentId === id; });
  };

  // 分叉点列表（children>1 的节点），按主线索引序返回。
  MessageTree.branchPoints = function () {
    var line = mainline();
    var t = tree();
    var out = [];
    line.forEach(function (n) {
      var kids = t.nodes.filter(function (x) { return x.parentId === n.id; });
      if (kids.length > 1) out.push({ id: n.id, branches: kids.length });
    });
    return out;
  };

  // —— 编辑窗口（§3.5）—————————————————————————

  // 距主线末 30 条内的玩家输入（kind='action'）可编辑；第 30 条可编辑、第 31 条只读。
  MessageTree.canEdit = function (id) {
    var node = nodeById(id);
    if (!node || node.kind !== 'action') return false;
    var line = mainline();
    var idx = -1;
    for (var i = 0; i < line.length; i++) if (line[i].id === id) { idx = i; break; }
    if (idx < 0) return false;          // 不在当前主线上（别的分支）：只读
    return (line.length - idx) <= EDIT_WINDOW;
  };

  // P72·W2：按 msg 引用反查树上 action 节点 id（导出与节点 msg 同引用，
  //   头注释①；一个 msg 引用至多落在一个节点上）。无树态 / 没命中返回
  //   null——planRounds 用它给每轮标 playerNodeId，渲染层据此挂「改这句」。
  function actionNodeIdOf(msg) {
    var t = tree();
    if (!t) return null;
    for (var i = 0; i < t.nodes.length; i++) {
      var nd = t.nodes[i];
      if (nd.kind === 'action' && nd.msg === msg) return nd.id;
    }
    return null;
  }

  // P72·W2：改这句——把 nodeId 这轮的行动换成 newText：在原 action 的父
  //   （= 上一轮 story 末尾）下挂新 action 分支并把 activeLeaf 切过去
  //   （appendAt 内部自动切）；原 action 及其后续整条旧分支全保留。
  //   同父已有同内容 action（含玩家改回原文复用自己）则切过去复用，
  //   不重复建分支。不做 canEdit 检查（渲染层只对窗内节点给入口；数据
  //   层保持通用，老分支上的节点也允许从那里长新支）。
  //   返回 { ok, reused, newNodeId, oldNodeId, parentId, reason }；失败不动树。
  MessageTree.editAction = function (nodeId, newText) {
    var node = nodeById(nodeId);
    if (!node || node.kind !== 'action') return { ok: false, reason: '该节点不是玩家行动' };
    var text = String(newText == null ? '' : newText);
    if (!text.trim()) return { ok: false, reason: '行动内容不能为空' };
    var kids = MessageTree.children(node.parentId);
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].kind === 'action' && kids[i].msg && String(kids[i].msg.content || '') === text) {
        if (!MessageTree.setActiveLeaf(kids[i].id)) return { ok: false, reason: '分支切换失败' };
        return { ok: true, reused: true, newNodeId: kids[i].id, oldNodeId: node.id, parentId: node.parentId };
      }
    }
    var nd = MessageTree.appendAt(node.parentId, 'action', { role: 'user', content: text });
    if (!nd) return { ok: false, reason: '建分支失败' };
    return { ok: true, reused: false, newNodeId: nd.id, oldNodeId: node.id, parentId: node.parentId };
  };

  // —— 迁移（§3.3）—————————————————————————

  // kind 推断（与运行时 push 点同源口径）：
  //   system → system；assistant → story；
  //   user + 「【系统 · 手机混流】」→ info；user + 「【系统 ·」→ fb；其余 user → action。
  MessageTree.inferKind = function (msg) {
    if (!msg) return 'fb';
    if (msg.role === 'system') return 'system';
    if (msg.role === 'assistant') return 'story';
    var c = String(msg.content || '');
    if (c.indexOf(INFO_PREFIX) === 0) return 'info';
    if (c.indexOf(SYS_PREFIX) === 0) return 'fb';
    return 'action';
  };

  // 老档迁移：按 chatHistory 逐条链式建树（不丢、不错位），msg 直接引用
  // 原消息对象。建好后过「导出与原文逐字一致」门禁，过门才返回树；
  // 不过门返回 {ok:false}，调用方保持无树态（loadFromSave 走旧口径）。
  MessageTree.migrateFromHistory = function (history) {
    if (!Array.isArray(history) || history.length === 0) {
      return { ok: false, reason: 'empty-history' };
    }
    // 防重入：树上已有节点就不再迁移。
    if (GameState.messageTree && Array.isArray(GameState.messageTree.nodes)
      && GameState.messageTree.nodes.length > 0) {
      return { ok: true, tree: GameState.messageTree, skipped: true };
    }
    var t = { v: 1, seq: 0, nodes: [], activeLeafId: null };
    var prevId = null;
    var round = 0;
    for (var i = 0; i < history.length; i++) {
      var msg = history[i];
      if (!msg || typeof msg !== 'object') return { ok: false, reason: 'bad-msg@' + i };
      if (isRealUserMsg(msg)) round++;
      var node = {
        id: 'm' + (++t.seq), parentId: prevId,
        kind: MessageTree.inferKind(msg),
        round: round, ts: 0, msg: msg
      };
      t.nodes.push(node);
      prevId = node.id;
      t.activeLeafId = node.id;
    }
    // 门禁：导出与原文逐字一致（同引用对象，JSON.stringify 必等；仍显式比对兜结构错位）。
    var exported = t.nodes.map(function (n) { return n.msg; });
    if (JSON.stringify(exported) !== JSON.stringify(history)) {
      return { ok: false, reason: 'gate-mismatch' };
    }
    return { ok: true, tree: t };
  };

  // —— 快照对齐辅助（Snapshots 用）—————————————————

  // messageId 在主线（导出口径）中的位置；不在主线返回 -1。
  MessageTree.mainlineIndexOf = function (id) {
    var line = mainline();
    for (var i = 0; i < line.length; i++) if (line[i].id === id) return i;
    return -1;
  };

  // —— 渲染配对（D6 修复）———————————————————————
  //
  // 老实现（ui_core.rebuildStoryFromHistory）是固定步长 `i += 2`：默认
  // [system, user, assistant, user, assistant, …] 严格两两成对。只要中间插进
  // 一条合成 user（工具反馈 / 事件通报 / 任务状态 / 成就 / 手机混流），后面
  // 整个配对就错位，表现为"回到上一条之后某一轮整段消失"。
  // 实测：4 轮 × 每轮 1 条反馈 → 只渲染 2 章（应为 4）；每轮 2 条反馈 → 4 章（巧合对上）。
  //
  // 正确口径：assistant 决定章数，最近一条"真玩家输入"决定本轮的提示行，
  // 合成 user（`【系统 ·` 开头）与 system 一律不占轮、不配对。
  var BODY_RE = /(?:【正文】|【故事】|正文[:：]|\[正文\])([\s\S]*?)(?=(?:【时间】|【选项】|【选项列表】|选项[:：]|\[选项\]|$))/;
  var OPT_RE = /(?:【选项】|【选项列表】|选项[:：]|\[选项\])([\s\S]*)$/;

  // 拆 AI 文本：{ story, optionsRaw, bodyHit, optHit }（story.js / ui_core.js 共用）
  MessageTree.splitAssistant = function (content) {
    var s = String(content == null ? '' : content);
    var bm = s.match(BODY_RE);
    var om = s.match(OPT_RE);
    return {
      story: bm ? bm[1].trim() : (s.trim()),
      optionsRaw: om ? om[1] : '',
      bodyHit: !!bm,
      optHit: !!om
    };
  };

  // 选项正文 → 字符串数组（去掉 "1. " / "A、" / "- " / "* " 这类前缀）
  MessageTree.parseOptions = function (raw) {
    return String(raw || '')
      .split('\n')
      .map(function (l) { return l.replace(/^\s*(?:\d+[\.、\)）]|[A-Za-z][\.、\)）]|[-*])[\s\.、\)）]*/, '').trim(); })
      .filter(function (l) { return l.length > 0; });
  };

  // 把 chatHistory 规划成渲染序列：
  //   [{ round, hint, content, meta, index, playerNodeId }] —— 一章一项，round 从 1 起连续。
  // hint：'（游戏开始）' / '（<玩家输入>）' / null（本轮没有对应玩家输入）
  // playerNodeId（P72·W2）：本轮玩家输入对应的 action 节点 id——导出与节点
  //   msg 同引用（头注释①），按引用反查；开场白轮（不是玩家行动，编辑它
  //   = 重写整个游戏且无快照可恢复）与无树态返回 null。渲染层据此挂
  //   「改这句」按钮（canEdit）或「超过 30 轮，只读」title。
  MessageTree.planRounds = function (history) {
    var msgs = Array.isArray(history) ? history : [];
    var out = [];
    var pendingUser = null;
    var pendingIsOpening = false;
    var pendingPlayerId = null;
    for (var i = 1; i < msgs.length; i++) {
      var m = msgs[i];
      if (!m || typeof m !== 'object') continue;
      if (m.role === 'system') continue;
      if (m.role === 'user') {
        var c = String(m.content == null ? '' : m.content);
        if (c.indexOf(SYS_PREFIX) === 0) continue;   // 合成反馈：不占轮
        pendingUser = c;
        pendingIsOpening = (i === 1);
        pendingPlayerId = pendingIsOpening ? null : actionNodeIdOf(m);
        continue;
      }
      if (m.role !== 'assistant') continue;
      var hint = null;
      if (pendingUser != null) hint = pendingIsOpening ? '（游戏开始）' : ('（' + pendingUser + '）');
      out.push({
        round: out.length + 1,
        hint: hint,
        content: m.content,
        meta: m.meta || null,
        index: i,
        playerNodeId: pendingPlayerId
      });
      pendingUser = null;   // 一条玩家输入只喂一章，避免重生成/重复 assistant 时提示串台
      pendingIsOpening = false;
      pendingPlayerId = null;
    }
    return out;
  };

  MessageTree.BODY_RE = BODY_RE;
  MessageTree.OPT_RE = OPT_RE;

  MessageTree.EDIT_WINDOW = EDIT_WINDOW;

  if (typeof window !== 'undefined') window.MessageTree = MessageTree;
  if (typeof module !== 'undefined' && module.exports) module.exports = MessageTree;
})();
