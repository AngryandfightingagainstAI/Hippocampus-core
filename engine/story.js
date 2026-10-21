// ============================================================
// 剧情层 · StoryLoop + CreateFlow
// v6：挂 NpcRuntime.onLocationChange（换场景时重排舞台）
// ============================================================

var _nodeStuckShown = false;

// ============ P70·T1 辅助函数（纯逻辑，供工具漏调自动登记用） ============

// P70·T1 返工（P0-1）：NPC 名只从卡带声明里取，不再从正文猜。
//   在正文中做最长匹配，返回命中的卡带 NPC def 列表（去重）。
function _findDeclaredNpcsInText(text) {
  var out = [];
  try {
    var wb = (GameState.currentCard && GameState.currentCard.worldbook) || {};
    var defs = wb.npcs || [];
    var t = String(text || '');
    var matches = [];
    defs.forEach(function(def) {
      if (!def) return;
      var names = [];
      if (def.name) names.push(String(def.name));
      if (Array.isArray(def.aliases)) def.aliases.forEach(function(a) { if (a) names.push(String(a)); });
      names.forEach(function(n) {
        if (n && t.indexOf(n) >= 0) matches.push({ def: def, len: n.length });
      });
    });
    // 最长匹配优先，同 def 只取一次
    matches.sort(function(a, b) { return b.len - a.len; });
    var seen = {};
    matches.forEach(function(m) {
      var id = m.def.id || m.def.name;
      if (!seen[id]) { seen[id] = true; out.push(m.def); }
    });
  } catch (e) {}
  return out;
}

// NPC 黑名单：泛称/景物，不建档也不提示
var NPC_BLACKLIST = [
  '一个', '那个', '这个', '两人', '众人', '男人', '女人', '老人', '孩子',
  '门', '窗', '他', '她', '它', '他们', '她们', '它们',
  '有人', '某人', '对方', '那人', '此人', '旁人', '路人', '过客'
];

// P70·T1 返工二：黑名单要拿「候选名」比，不能拿整段正文比。
//   之前 `NPC_BLACKLIST.some(b => clean.indexOf(b) >= 0)` 只要正文里出现「他/她/门/窗」就整轮静默，
//   而叙事正文几乎必然含这些字 ⇒ "未声明角色出场"的提示在真实正文里永远不出现。
//   这里只在**提示判定**时做一次轻量候选名猜测（不参与建档），命中黑名单才静默。
function _guessNameCandidate(text, hit) {
  if (!text || !hit || !hit.length) return '';
  var t = String(text);
  for (var i = 0; i < hit.length; i++) {
    var w = hit[i];
    var idx = t.indexOf(w);
    if (idx < 0) continue;
    var before = t.slice(Math.max(0, idx - 6), idx);
    before = before.replace(/[，。！？、；：""''（）\s,.!?;:]/g, '').replace(/(的|了|着|过|和|与|跟|向|朝|往)$/, '');
    if (before.length >= 2 && before.length <= 6) return before;
  }
  return '';
}

// 从正文中提取物品名：acquire 取命中词之后的 2-6 字，loss 取之前的。
function _extractItemName(text, hit, kind) {
  if (!text || !hit || !hit.length) return '';
  var t = String(text);
  for (var i = 0; i < hit.length; i++) {
    var w = hit[i];
    var idx = t.indexOf(w);
    if (idx < 0) continue;
    var frag = '';
    if (kind === 'acquire') {
      frag = t.slice(idx + w.length, idx + w.length + 8);
    } else {
      frag = t.slice(Math.max(0, idx - 8), idx);
    }
    frag = frag.replace(/[，。！？、；：""''（）\s,.!?;:]/g, '').replace(/^(的|了|着|过|把|将|给|被)/, '').replace(/(的|了|着|过)$/, '');
    if (frag.length >= 2 && frag.length <= 8) return frag;
  }
  return '';
}

// P70·T1 返工（P0-2）：时间词拆两张表。
//   DURATION = 经过的时长（推进 gameTime）；CLOCK = 时刻（本轮不推进，只记 coverage）。
var TIME_DURATION = {
  '第二天': 1440, '第三天': 2880, '三天后': 4320, '两天后': 2880, '一天后': 1440,
  '次日': 1440, '翌日': 1440, '隔日': 1440, '次日清晨': 1440,
  '一周后': 10080, '一个月后': 43200, '一年后': 525600,
  '过了一会': 30, '过了一会儿': 30, '不久': 30, '片刻后': 15,
  '一个时辰后': 120, '几个时辰后': 240,
  '时间流逝': 60, '时光飞逝': 60,
  '斗转星移': 60, '物换星移': 60, '春去秋来': 60, '寒来暑往': 60
};
var TIME_CLOCK = {
  '清晨': 1, '黎明': 1, '拂晓': 1, '入夜': 1, '黄昏': 1, '傍晚': 1,
  '午夜': 1, '深夜': 1, '半夜': 1, '三更': 1
};

// 取时间词命中里最大的 DURATION 分钟数；CLOCK 词返回 0（不推进）。
function _maxDurationMinutes(hit) {
  if (!hit || !hit.length) return 0;
  var max = 0;
  for (var i = 0; i < hit.length; i++) {
    var v = TIME_DURATION[hit[i]];
    if (v > max) max = v;
  }
  return max;
}

var StoryLoop = {
  busy: false, currentOptions: [],
  _regenContext: null,
  _lastPlayerLocation: '',
  _windowAnchor: null,

  // P70·T1：工具漏调自动登记（level 3 主体，纯逻辑可单测）
  // 输入：正文 clean、WordFamilies.analyze 输出的 missing 列表、当前轮次 round
  // 输出：{ repaired: [成功登记文案], notices: [未登记提醒文案] }
  _autoRegisterMissing: function(clean, missing, round) {
    var repaired = [];
    var notices = [];
    var seenKeys = {};
    if (!missing || !missing.length) return { repaired: repaired, notices: notices };

    missing.forEach(function(m) {
      // P1-4：去重键 round + kind + 首个命中词，同轮同键只记一次
      var key = round + '|' + m.kind + '|' + (m.hit && m.hit[0] ? m.hit[0] : '');
      if (seenKeys[key]) return;
      seenKeys[key] = true;

      if (m.kind === 'npc') {
        // P0-1：只登记卡带已声明的 NPC，未声明的只 notice，黑名单直接跳过
        var declaredNpcs = _findDeclaredNpcsInText(clean);
        if (declaredNpcs.length > 0) {
          declaredNpcs.forEach(function(def) {
            try {
              if (typeof NpcRuntime !== 'undefined' && NpcRuntime.get) {
                var npcKey = def.id || def.name;
                if (!npcKey) return;
                var rt = NpcRuntime.get(npcKey);
                if (rt) {
                  rt.lastSeenRound = round;
                  rt.source = 'engine:auto';
                  repaired.push('NPC「' + (def.name || npcKey) + '」出场登记');
                }
              }
            } catch (e) {}
          });
        } else {
          // 候选名只用于"要不要提示"的判定，绝不拿来建档
          var cand = _guessNameCandidate(clean, m.hit);
          var blacklisted = !cand || NPC_BLACKLIST.some(function(b) { return cand.indexOf(b) >= 0; });
          if (!blacklisted) {
            notices.push('正文出现角色登场信号（' + (m.hit ? m.hit.slice(0, 2).join('、') : '') +
              '），候选名「' + cand + '」未在卡带声明里，未登记。请在人物面板手动添加或确认。');
          }
        }
      } else if (m.kind === 'acquire' || m.kind === 'loss') {
        // 物品：提取名字后必须命中卡带 worldbook.items 声明才登记，否则 notice
        var itemName = _extractItemName(clean, m.hit, m.kind);
        var itemDeclared = false;
        try {
          var items = ((GameState.currentCard && GameState.currentCard.worldbook) || {}).items || [];
          for (var j = 0; j < items.length; j++) {
            if (items[j].name === itemName) { itemDeclared = true; break; }
          }
        } catch (e) {}
        if (itemDeclared) {
          if (m.kind === 'acquire') {
            var r = ToolExecutor._addItem('story', itemName, 'engine:auto 自动登记');
            if (r && r.ok) repaired.push('获得物品「' + itemName + '」');
            else notices.push('正文提到获得物品「' + itemName + '」，但自动登记失败，请手动确认。');
          } else {
            var r2 = ToolExecutor._removeItem(itemName);
            if (r2 && r2.ok) repaired.push('失去物品「' + itemName + '」');
            else notices.push('正文提到失去物品「' + itemName + '」，但背包中未找到，请手动确认。');
          }
        } else {
          notices.push('正文提到' + (m.kind === 'acquire' ? '获得' : '失去') +
            '物品（' + (m.hit ? m.hit.slice(0, 2).join('、') : '') + '），但未匹配到卡带声明的物品，未登记。');
        }
      } else if (m.kind === 'time') {
        // P0-2：DURATION 取最大值只推一次；CLOCK（清晨/入夜…）本轮不推进
        var mins = _maxDurationMinutes(m.hit);
        if (mins > 0 && GameState.advanceTime) {
          GameState.advanceTime(mins);
          repaired.push('时间推进 ' + mins + ' 分钟');
        }
        // CLOCK 词不推进，自然落入 coverage，不提示
      } else if (m.kind === 'relation') {
        // P0-3：不建 proposal（to/delta 无法唯一确定），只 notice 提醒手动调整
        // 返工二：同一关系词 10 轮内只提醒一次，避免每轮往 pendingSystemNotices 里塞同样的话
        var relKey = (m.hit && m.hit[0]) ? String(m.hit[0]) : '';
        if (!StoryLoop._relNoticeAt) StoryLoop._relNoticeAt = {};
        var lastRelRound = StoryLoop._relNoticeAt[relKey];
        if (relKey && lastRelRound != null && (round - lastRelRound) < 10) return;
        if (relKey) StoryLoop._relNoticeAt[relKey] = round;
        notices.push('正文提到关系变化（' + (m.hit ? m.hit.slice(0, 2).join('、') : '') +
          '），AI 未调 modify_relation。请在人物面板确认后手动调整关系值。');
      } else {
        // injury/money/fatigue/hunger/skill/weather/event/task/ending/node/foreshadow/shop/status/info/achievement：
        // 不猜数值，一律 notice 提醒补调
        notices.push('上一轮正文提到了「' + m.label + '」（' + (m.hit ? m.hit.slice(0, 2).join('、') : '') +
          '），但没有调用 ' + m.expectedTool + '。该类数值不自动猜测，请人工补调。');
      }
    });

    return { repaired: repaired, notices: notices };
  },

  async start() {
    var card = GameState.currentCard;
    var opening = (GameState.playerData && GameState.playerData._openingPrompt)
      || (card && card.game && card.game.openingPrompt)
      || '游戏开始。请描写我的角色刚进入游戏世界的那一刻。';

    if (typeof Weather !== 'undefined') {
      try { await Weather.init(); } catch (e) { console.warn('[Weather] init 失败：', e); }
    }
    if (typeof Realtime !== 'undefined' && Realtime.autoTouch) {
      try { Realtime.autoTouch(); } catch (e) {}
    }
    // ★ 初始化"当前场景位置"
    this._lastPlayerLocation = this._getPlayerLocation();

    // P72：开局建消息树（system 根 + 开场白），chatHistory 由主线导出
    MessageTree.init(
      PromptBuilder.buildStatic() + '\n' + PromptBuilder.buildSemiStatic(),
      opening
    );
    Platform.ui.clearStory();
    Platform.ui.appendHint('（游戏开始）');
    // P72·§15.4-2：开局快照（固定 round 0，reason='start'）——开场白之后、
    //   callAI 之前压，记的就是 [system, 开场白] 这个"刚开局"状态。
    //   不加这条的话，第一轮行动的 push 也落在 round 1，把开局那份遮住。
    if (typeof Snapshots !== 'undefined') {
      try { Snapshots.push('start'); } catch (e) { console.warn('[Snapshots] 开局快照失败：', e); }
    }
    await this.callAI();
  },

  async sendAction(t) {
    if (this.busy) return;
    const diceResult = this.tryParsePlayerDice(t);
    if (diceResult) {
      Platform.ui.appendHint('（你的选择：' + t + '）');
      MessageTree.append('action', { role: 'user', content: t });
      GameState._roundSeq++;   // P72·W0-a：骰子轮也是玩家真行动，快照轴 +1（fb/info 不加）
      const fb = ToolExecutor.formatForHistory([diceResult]);
      if (fb) MessageTree.append('fb', { role: 'user', content: fb });
      const uiLine = ToolExecutor.formatDiceForUI(diceResult);
      if (uiLine) Platform.ui.appendDiceResult(uiLine);
      if (typeof DiceHistory !== 'undefined') DiceHistory.record(diceResult);
      // P65：玩家自己掷的骰也算工具调用痕迹（否则模型会以为「没人查过」）
      if (typeof ToolTrace !== 'undefined') {
        try {
          ToolTrace.record(null, [{
            name: '掷骰（玩家发起）',
            args: diceResult.expression || t,
            ok: true,
            note: diceResult.total != null ? ('总数 ' + diceResult.total) : (diceResult.check ? diceResult.check.level : '')
          }]);
        } catch (e) {}
      }
      await this.callAI();
      return;
    }
    const searchResult = await this.tryParsePlayerSearch(t);
    if (searchResult) {
      Platform.ui.appendHint('（你的选择：' + t + '）');
      MessageTree.append('action', { role: 'user', content: t });
      GameState._roundSeq++;   // P72·W0-a：搜索轮也是玩家真行动，快照轴 +1（fb/info 不加）
      const fb = ToolExecutor.formatForHistory([searchResult]);
      if (fb) MessageTree.append('fb', { role: 'user', content: fb });
      if (typeof ToolTrace !== 'undefined') {
        try {
          ToolTrace.record(null, [{
            name: '联网搜索（玩家发起）',
            args: searchResult.query || t,
            ok: searchResult.ok !== false,
            note: searchResult.ok === false ? (searchResult.reason || '') : ''
          }]);
        } catch (e) {}
      }
      await this.callAI();
      return;
    }
    // 普通输入分支：检测元层意图
    Platform.ui.appendHint('（你的选择：' + t + '）');
    var _intent = (typeof Proposals !== 'undefined' && Proposals.detectIntent)
      ? Proposals.detectIntent(t)
      : { isMeta: false, keywords: [] };
    var _content = t;
    // ★ 关键词线索附加：检测玩家输入中的词族命中，附加给 AI
    var _kwHits = (typeof WordFamilies !== 'undefined' && WordFamilies.detect) ? WordFamilies.detect(t) : [];
    if (_kwHits && _kwHits.length > 0) {
      var _kwLabels = _kwHits.map(function(h) { return h.label + '(' + (h.matched || []).slice(0, 3).join('/') + ')'; });
      _content = _content + '\n\n【系统 · 关键词线索】' + _kwLabels.join('、');
    }
    if (_intent.isMeta) {
      _content = t + '\n\n【系统提示】玩家本轮说的是元层指令，不是剧情动作（关键词：' + _intent.keywords.join('、') + '）。\n这是指令，不是请求。必须调 propose_change({type, payload, reason}) 提议变更。\n不允许只在叙事里口头答应。不允许直接调 add_achievement 等原工具。';
      Platform.ui.appendHint('（检测到元层意图：' + _intent.keywords.join('、') + '）');
    }
    MessageTree.append('action', { role: 'user', content: _content });
    GameState._roundSeq++;   // P72·W0-a：玩家真行动入队后快照轴 +1（唯一递增类点；
                              //   不进 message_tree.js 的 append——那里 info/fb 也会走）
    await this.callAI();
  },

  // ★ 读取玩家当前位置（StatusCard 优先，其次 playerData）
  _getPlayerLocation() {
    try {
      if (typeof StatusCard !== 'undefined' && StatusCard.isEnabled()) {
        var v = StatusCard.getField('location');
        if (v) return String(v);
      }
    } catch (e) {}
    var pd = GameState.playerData || {};
    return String(pd.locationId || pd.location || '');
  },

  // ★ 检测到玩家换场景 → 通知 NpcRuntime 重排
  _checkLocationChange() {
    if (typeof NpcRuntime === 'undefined' || !NpcRuntime.onLocationChange) return;
    var nowLoc = this._getPlayerLocation();
    if (nowLoc === this._lastPlayerLocation) return;
    var prev = this._lastPlayerLocation;
    this._lastPlayerLocation = nowLoc;
    try {
      var r = NpcRuntime.onLocationChange(nowLoc);
      if (r && r.changed && r.focus) {
        // 提示玩家：场景变了
        var names = [];
        r.focus.forEach(function(id) {
          var def = NpcRuntime._findDef(id);
          if (def) names.push(def.name || def.id);
        });
        if (names.length) {
          Platform.ui.appendHint('（场景切换：镜头内 ' + names.join('、') + '）');
        } else {
          Platform.ui.appendHint('（场景切换）');
        }
      }
    } catch (e) {
      console.warn('[NpcRuntime] onLocationChange 失败：', e);
    }
  },

  tryParsePlayerDice(text) {
    const cfg = getDiceConfig();
    if (!cfg.enabled || !cfg.playerInitiate) return null;
    const t = String(text || '').trim();
    if (!t) return null;

    // ★ 斜杠可以出现在任意位置
    var slashIdx = t.indexOf('/');
    if (slashIdx < 0) return null;

    var before = t.slice(0, slashIdx).trim();
    var after = t.slice(slashIdx + 1).trim();
    if (!after) return null;

    // 斜杠后第一段（空格分隔）是骰子表达式
    var expr = after;
    var intentFromAfter = '';
    var sp = after.indexOf(' ');
    if (sp > 0) {
      expr = after.slice(0, sp).trim();
      intentFromAfter = after.slice(sp + 1).trim();
    }

    if (!expr) return null;
    if (typeof DiceEngine === 'undefined') return null;
    const parsed = DiceEngine.parse(expr);
    if (!parsed) return null;
    if (parsed.type === 'check' && !cfg.cocCheck) return null;
    if (parsed.type === 'bonus' && !cfg.bonusPenalty) return null;
    if (parsed.type === 'normal' && !cfg.basic) return null;

    // 意图：优先"斜杠前的内容"，其次"斜杠后的剩余"
    var intent = before || intentFromAfter || '玩家主动';

    const r = DiceEngine.roll(expr, intent);
    if (r.ok) {
      if (!cfg.criticalFumble && r.check) {
        if (r.check.level === '大成功') r.check = { level: '成功', class: 'success' };
        if (r.check.level === '大失败') r.check = { level: '失败', class: 'fail' };
      }
      if (!cfg.successLevel && r.check) {
        if (r.check.level === '极难成功' || r.check.level === '困难成功') r.check = { level: '成功', class: 'success' };
      }
      r.type2 = 'dice';
      r.intent = intent;
    }
    return r.ok ? r : null;
  },

  async tryParsePlayerSearch(text) {
    if (typeof WebSearchManager === 'undefined') return null;
    if (!WebSearchManager.isEnabled()) return null;
    const t = String(text || '').trim();
    if (!t.startsWith('/search ')) return null;
    const kw = t.slice(8).trim();
    if (!kw) return null;
    const r = await WebSearchManager.query(kw, {});
    if (!r.ok) return { ok: false, reason: r.reason || '搜索失败', searchMeta: r };
    return { ok: true, type: 'search', type2: 'search', searchMeta: r, keyword: kw };
  },

  async retryLast() {
    if (this.busy) return;
    await this.callAI();
  },

  // P54·第10条（可测缝）：把「通道裁决」与「外部回复归一化」抽成两个小函数。
  //   动机：这条路径最容易静默回归 —— 老档没有 storyChannel 键时行为必须与改动前逐字一致，
  //   而 callAI 整体太大、单测喂不动。抽出来后 test_story_channel_unit.js 直接夹这几条边界。
  _channelKind() {
    try {
      const g = Storage.getGlobal();
      if (g && g.storyChannel === 'external' &&
          Platform.ui && typeof Platform.ui.requestExternalReply === 'function') {
        return 'external';
      }
    } catch (e) { /* fail-open：读设置失败一律按直连，绝不因为读不出设置就换通道 */ }
    return 'direct';
  },

  async _externalReply(toSend) {
    const r = await Platform.ui.requestExternalReply(toSend);
    // 取消 / 空回复 / 纯空白 ⇒ null：调用方据此提示并跳过本轮（不写历史、不推进时间）
    if (r === null || r === undefined || String(r).trim() === '') return null;
    return String(r);
  },

  async callAI() {
    // ★ 结局锁死检查
    if (typeof Endings !== 'undefined' && Endings.isLocked()) {
      Platform.ui.appendHint('（已进入结局，主循环停止。可在"🎬 结局"面板查看后日谈）');
      this.busy = false; Platform.ui.setBusy(false);
      return;
    }
    const myToken = GameState._sessionToken;
    this.busy = true; Platform.ui.setBusy(true); Platform.ui.showStoryLoading();
    try {
      if (typeof Snapshots !== 'undefined' && GameState.currentCardId && GameState.currentSaveId) {
        Snapshots.push('round');
      }
    } catch (e) { console.warn('[Snapshots] push 失败：', e); }
    try {
      if (GameState.chatHistory.length > 0 && GameState.chatHistory[0].role === 'system') {
        // P72：chatHistory[0] 即树根 msg 的同引用——这行改完树也同步了，无需再调树
        GameState.chatHistory[0].content = PromptBuilder.buildStatic() + '\n' + PromptBuilder.buildSemiStatic();
      }
      const g = Storage.getGlobal();
      const windowRounds = (g.logging && g.logging.windowRounds) || 10;
      let toSend = this.applyWindow(GameState.chatHistory, windowRounds);

      let hasRealUser = toSend.some(function(m) {
        return m && m.role === 'user' && !String(m.content || '').startsWith('【系统 ·');
      });
      // P70-T2：本轮引擎附加文本（extra 块口径），history 块不含这些
      var __extraParts = [];
      if (!hasRealUser) {
        toSend = toSend.concat([{ role: 'user', content: '请继续游戏。' }]);
        __extraParts.push('请继续游戏。');
      }

      if (this._regenContext) {
        const rc = this._regenContext;
        let tmp = '【系统提示 · 仅本次生效】\n';
        tmp += '玩家否决了你上一版的输出，请你重写这一轮。\n\n';
        if (rc.rejected) tmp += '=== 你上一版写的（被否决）===\n' + rc.rejected.slice(0, 3000) + '\n=== 上一版结束 ===\n\n';
        if (rc.comment) tmp += '=== 玩家的不满意之处 ===\n' + rc.comment + '\n=== 结束 ===\n\n';
        tmp += '请重新输出【正文】+【时间】+【选项】，避开上面提到的问题。\n';
        toSend = toSend.concat([{ role: 'user', content: tmp }]);
        this._regenContext = null;
        __extraParts.push(tmp);
      }

      // ★ 把 dynamic 内容拼接到最后一条 user message 前面
      //    不新增 system message，兼容所有 API（包括严格 chat_template）
      //    前面的 static+semiStatic + 历史消息全都不变，仍能吃前缀缓存
      var __dynamic = PromptBuilder.buildDynamic();
      // P70-T2：拼接前先留最后一条 user 的原文引用（history 块按原文计，避免与 dynamic 双算）
      var __lastUserRaw = null;
      if (toSend.length > 0 && toSend[toSend.length - 1].role === 'user') {
        var __lastUserMsg = toSend[toSend.length - 1];
        __lastUserRaw = __lastUserMsg.content;
        toSend[toSend.length - 1] = {
          role: 'user',
          content: '【系统状态快照 · 供参考，非玩家输入】\n' + __dynamic + '\n\n【玩家输入】\n' + __lastUserMsg.content
        };
      } else {
        toSend.push({
          role: 'user',
          content: '【系统状态快照 · 供参考，非玩家输入】\n' + __dynamic + '\n\n请根据以上状态继续推进剧情。'
        });
        __extraParts.push('请根据以上状态继续推进剧情。');
      }

      // P72·W8：作者注（叙述要求）——放在最后一条 user 的尾部，是「最近最强位」，
      //   与头部的 dynamic 不冲突。空 / 非字符串 ⇒ 一个字符都不加（prompt 逐字不变）。
      var __authorNote = '';
      try {
        var __gNote = (typeof Storage !== 'undefined' && Storage.getGlobal) ? (Storage.getGlobal() || {}) : {};
        var __noteRaw = (__gNote.settings && __gNote.settings.story && __gNote.settings.story.authorNote) || '';
        __authorNote = PromptBuilder._clipText(__noteRaw, 300);
      } catch (e) {}
      if (__authorNote) {
        var __tail = '\n\n【作者注 · 叙述要求】\n' + __authorNote;
        if (toSend.length > 0 && toSend[toSend.length - 1].role === 'user') {
          toSend[toSend.length - 1] = {
            role: 'user',
            content: toSend[toSend.length - 1].content + __tail
          };
        } else {
          toSend.push({ role: 'user', content: '请继续游戏。' + __tail });
        }
        __extraParts.push('【作者注 · 叙述要求】' + __authorNote);
      }

      try { PromptBuilder.updateEstimate(toSend.map(function(m){return m.content || '';}).join('\n')); } catch (e) {}

      // ---------- P70-T2 · 上下文查看器采集（纯内存态，不进存档/prompt） ----------
      // 口径（阶段 0 已核实）：system 消息 = static+semiStatic（dynamic 在最后一条 user 里），
      // blocks 一律取 prompt_builder 记下的引用，不在采集点重调 buildDynamic()/buildSystem()（有副作用）。
      try {
        GameState._lastPromptMessages = toSend;
        GameState._lastPromptExtraText = __extraParts.join('\n');
        if (typeof PromptInspect !== 'undefined' && PromptInspect && typeof PromptInspect.build === 'function') {
          var __isExtraText = function (c) {
            c = String(c == null ? '' : c);
            return c === '请继续游戏。' || c === '请根据以上状态继续推进剧情。' || c.indexOf('【系统提示 · 仅本次生效】') === 0;
          };
          var __hist = [];
          for (var __i = 1; __i < toSend.length - 1; __i++) {
            if (__isExtraText(toSend[__i].content)) continue;
            __hist.push(toSend[__i].content || '');
          }
          if (__lastUserRaw !== null && !__isExtraText(__lastUserRaw)) {
            __hist.push(__lastUserRaw);
          }
          var __pb = GameState._lastPromptBlocks || {};
          var __round = null;
          try { __round = (typeof Platform !== 'undefined' && Platform.ui && Platform.ui._currentRoundNum) ? Platform.ui._currentRoundNum() : null; } catch (e2) {}
          GameState._lastPromptInspect = PromptInspect.build({
            round: (typeof __round === 'number' && isFinite(__round)) ? __round : null,
            blocks: [
              { id: 'static', label: '系统骨架', text: __pb.static || '' },
              { id: 'semiStatic', label: '卡带设定', text: __pb.semiStatic || '' },
              { id: 'entity', label: '世界书索引', text: __pb.entity || '' },
              { id: 'essentials', label: '剧情要点', text: __pb.essentials || '' },
              { id: 'summary', label: '前情摘要', text: __pb.summary || '' },
              { id: 'style', label: '文风要求', text: __pb.style || '' },
              { id: 'dynamic', label: '状态快照', text: __pb.dynamic || '' },
              { id: 'history', label: '历史对话', text: __hist.join('\n') },
              { id: 'extra', label: '本次附加', text: GameState._lastPromptExtraText || '' }
            ],
            messages: toSend,
            entityHits: GameState._lastEntityHits || [],
            entityClipped: GameState._lastEntityClipped || {},
            trimLog: GameState._lastTrimLog || [],
            level: GameState._lastTrimmedLevel || 0,
            budget: (GameState._lastPromptBudget || {}),
            estimateTokens: function (s) { return PromptBuilder.estimateTokens(s); }
          });
          // P70-T2：RN 探针（_audit/tools/probe_t2_rn.js）从 logcat 抓这行验证面板数字
          try { console.log('[T2] inspect blocks=' + GameState._lastPromptInspect.blocks.length + ' total=' + GameState._lastPromptInspect.total.tokens); } catch (e2) {}
        }
      } catch (e) { try { console.warn('[PromptInspect] 采集失败：', e); } catch (e2) {} }

      // P31（补齐 RN 的 P5·S6-5）：主调用显式带上当前配置的 max_tokens，不再吃 ApiClient 的 2048 兜底。
      // 思考模型的 reasoning_content 与正文共用同一个 completion 预算，
      // 所以要用 profile.max_tokens（默认已抬到 16384），思考链才不会挤掉正文。
      const __activeProfile = (typeof ApiManager !== 'undefined' && ApiManager.getActive) ? ApiManager.getActive() : null;
      const __chatOpts = (__activeProfile && __activeProfile.max_tokens != null) ? { max_tokens: __activeProfile.max_tokens } : {};
      
      // ★ 流式 API 支持：检查 profile.stream 标志
      let content = '';
      const useStream = __activeProfile && __activeProfile.stream === true;

      // P54·第10条：可选「外部 AI 通道」—— 把这一轮的提示词交给用户复制，再把 AI 回的正文粘回来。
      //   默认 direct（= 现状，直连 API）。只有 Storage.getGlobal().storyChannel === 'external'
      //   且平台实装了外部回复契约（requestExternalReply）才切走，其余情况一律照旧（fail-open：
      //   老档没有这个键 ⇒ 行为与改动前逐字一致）。裁决本身在 _channelKind()（可单测）。
      const __channel = this._channelKind();

      if (__channel === 'external') {
        // 外部通道：整轮提示词交给 UI（用户复制给任意 AI），等他把回复粘回来。
        //   取消 / 空回复 ⇒ 本轮跳过（不写历史、不推进时间）；busy 由外层 finally 收（story.js:494）。
        const __manual = await this._externalReply(toSend);
        if (myToken !== GameState._sessionToken) return;
        if (__manual === null) {
          Platform.ui.appendHint('（这一轮没拿到外部 AI 的回复，已跳过）');
          return;
        }
        content = __manual;
      } else if (useStream && typeof ApiClient.chatStream === 'function') {
        // 流式模式：实时渲染思考链
        Platform.ui.showStoryLoading(false);
        Platform.ui.streamStartLive();
        
        const streamResult = await ApiClient.chatStream(toSend, __chatOpts, {
          onReasoning: function(chunk) {
            Platform.ui.streamAppendReasoning(chunk);
          },
          onContent: function(chunk) {
            // 可选：实时显示正文（暂未实现，保持与原逻辑一致）
          },
          onDone: function(result) {
            // 流结束回调（可选）
          }
        });
        
        content = streamResult.content;
        
        // 流结束后，用最终的 meta 替换实时面板
        const reasoning = streamResult.reasoning || '';
        const usage = streamResult.usage || null;
        Platform.ui.streamFinishLive({ reasoning: reasoning, usage: usage, ts: Date.now() });
      } else {
        // 非流式模式（原有逻辑）
        content = await ApiClient.chat(toSend, __chatOpts);
      }
      
      if (myToken !== GameState._sessionToken) return;

      const reasoning = GameState._lastReasoning || '';
      const usage = GameState._lastUsage || null;

      // P72：AI 回复入树（node.msg 即导出元素，assistantMsgRef 引用不变）
      const assistantNode = MessageTree.append('story', { role: 'assistant', content: content });
      const assistantMsgRef = assistantNode.msg;

      let toolResults = [];
      try {
        const toolsRaw = ToolExecutor.extract(content);
        // P66：工具执行前给关键数值拍快照，执行后逐项 diff。
        // 唯一硬规则在 StateGuard.verdict 里：状态变了却一个工具都没成功 ⇒ 回滚。
        const __stateBefore = (typeof StateGuard !== 'undefined' && StateGuard.snapshot) ? StateGuard.snapshot() : null;
        toolResults = await ToolExecutor.executeAll(toolsRaw);
        if (__stateBefore && typeof StateGuard !== 'undefined' && StateGuard.verdict) {
          try {
            const __sv = StateGuard.verdict(__stateBefore, StateGuard.snapshot(), toolResults);
            if (__sv.rollback) {
              StateGuard.restore(__stateBefore);
              Platform.ui.appendHint('（引擎回滚：' + __sv.reason + '。已还原到执行前的数值）');
              GameState._pendingSystemNotices.push(
                '引擎检测到：本回合 ' + __sv.reason + '，状态已回滚。'
                + '如果剧情里确实发生了数值变化，请**重新**调用对应工具（一次一个，确认成功再下一个）。'
              );
              try { Platform.ui.renderTopbar(); Platform.ui.renderSidebarExpanded(); } catch (eR) {}
            }
            if (typeof ToolTrace !== 'undefined' && ToolTrace.recordStateFacts) ToolTrace.recordStateFacts(__sv);
          } catch (eSG) { console.warn('[StateGuard]', eSG); }
        }
        // P65：留痕（10 轮 TTL）。只记「真的执行过」的调用 —— 没有调用就没有痕迹。
        if (toolResults.length && typeof ToolTrace !== 'undefined') {
          try { ToolTrace.record(null, ToolTrace.callsFromResults(toolsRaw, toolResults)); } catch (e) {}
        }
        if (toolResults.length) {
          toolResults.forEach(r => { if (r.ok && r.segmentCrossed) GameState._pendingSystemNotices.push('玩家 ' + r.label + ' 进入新状态：' + r.segmentCrossed.text); });
          const fb = ToolExecutor.formatForHistory(toolResults);
          if (fb) MessageTree.append('fb', { role: 'user', content: fb });
          Platform.ui.renderTopbar(); Platform.ui.renderSidebarExpanded();
      var __toolFails = toolResults.filter(function(r) { return r && !r.ok && r.reason; });
      if (__toolFails.length === 1) {
        Platform.ui.appendHint('（工具失败：' + __toolFails[0].reason + '）');
      } else if (__toolFails.length > 1) {
        Platform.ui.appendHint('（本轮 ' + __toolFails.length + ' 个工具失败：' + __toolFails.map(function(r) { return r.reason; }).join('；') + '）');
      }
        }

        const searches = [];
        toolResults.forEach(r => {
          if (r && r.type2 === 'search' && r.searchMeta) searches.push(r.searchMeta);
        });

        const lastAssistant = [...GameState.chatHistory].reverse().find(m => m.role === 'assistant');
        if (lastAssistant) {
          // P72·W0-a：meta 随身带本轮快照轴 roundSeq——renderRowActions 的回退实参用它
          //   （显示轴标签照旧用 roundNum；老档旧章无 meta 时回落显示轴，口径同旧版）
          // P72·W1：再带树节点 id——四件套「‹i/n› 兄弟版本 / 重新生成（仅 activeLeaf 章）」
          //   的定位键。老章 meta 被剥时分支控件不渲染（回落旧显示）。
          lastAssistant.meta = { reasoning: reasoning, searches: searches, usage: usage, ts: Date.now(), roundSeq: (typeof GameState._roundSeq === 'number' ? GameState._roundSeq : 0), nodeId: (assistantNode && assistantNode.id) ? assistantNode.id : null };
        }

        const clean = ToolExecutor.strip(content);
        this.parseAndRender(clean, toolResults);
      toolResults.forEach(function(r) {
        if (r && r.ok && r.type === 'proposal' && r.action === 'create' && r.proposalId) {
          try { Platform.ui.appendProposalCard(r.proposalId); } catch (e) { console.warn('[ProposalCard]', e); }
        }
      });
      // 输出后置校验：检测 AI 正文提到的状态变化，但没调对应工具
      // P70·T1：按 toolGuard 档位执行（0关 / 1提示 / 2提醒 / 3自动登记 / 4留TODO）
      try {
        if (typeof WordFamilies !== 'undefined' && WordFamilies.analyze) {
          var __g = null;
          try { __g = Storage.getGlobal(); } catch (__e2) {}
          var __level = 3;
          try { __level = (__g && __g.toolGuard && __g.toolGuard.level != null) ? Number(__g.toolGuard.level) : 3; } catch (__e3) {}
          if (!isFinite(__level) || __level < 0) __level = 3;
          // 兼容旧 devHints：开了 devHints 至少按 1 档（提示）处理
          var __devHints = false;
          try { __devHints = !!(__g && __g.devHints); } catch (__e4) {}
          if (__devHints && __level < 1) __level = 1;

          var __hasTimeBlock = /【时间】/.test(content);
          var __analysis = WordFamilies.analyze(clean, toolResults, { hasTimeBlock: __hasTimeBlock });
          var __missing = __analysis.filter(function(a) { return !a.exempt && !a.toolCalled; });

          if (__missing.length > 0) {
            var __missingLabels = __missing.map(function(m) {
              return m.label + '（' + m.hit.slice(0, 2).join('、') + '）';
            });

            // coverage 留痕（先记 missing，自动登记后再补 repaired）
            if (typeof ToolTrace !== 'undefined' && ToolTrace.recordCoverage) {
              try {
                ToolTrace.recordCoverage(null, {
                  missing: __missing.map(function(m) { return { kind: m.kind, expectedTool: m.expectedTool, hit: m.hit, snippet: m.snippet }; }),
                  repaired: []
                });
              } catch (__e5) {}
            }

            if (__level === 0) {
              console.info('[WordFamilies] 检测到可能的漏账：' + __missingLabels.join('、'));
            } else if (__level === 1) {
              Platform.ui.appendHint('（检测到可能漏调工具：' + __missingLabels.join('、') + '）');
            } else if (__level === 2) {
              __missing.forEach(function(m) {
                GameState._pendingSystemNotices.push(
                  '上一轮正文提到了「' + m.label + '」（' + m.hit.slice(0, 2).join('、') +
                  '），但没有调用 ' + m.expectedTool + '。如果剧情确实发生了这个变化，请补调工具。'
                );
              });
            } else if (__level >= 3) {
              var __round = 0;
              try {
                __round = ((GameState.chatHistory || []).filter(function(mm) {
                  return mm && mm.role === 'user' && !String(mm.content || '').startsWith('【系统 ·');
                })).length;
              } catch (__e6) {}

              var __reg = StoryLoop._autoRegisterMissing(clean, __missing, __round);
              var __repaired = __reg.repaired;
              var __notices = __reg.notices;

              // P1-4：每轮最多 1 条 appendHint，合并成"已自动登记 N 项：…"
              if (__repaired.length) {
                Platform.ui.appendHint('（已自动登记 ' + __repaired.length + ' 项：' + __repaired.join('、') + '）');
              }

              // 凡进自动档但未登记成功的，必须落一条 notice，不许静默
              __notices.forEach(function(n) {
                GameState._pendingSystemNotices.push(n);
              });

              // 更新 coverage 的 repaired
              if (typeof ToolTrace !== 'undefined' && ToolTrace.recordCoverage) {
                try {
                  ToolTrace.recordCoverage(null, {
                    missing: __missing.map(function(m) { return { kind: m.kind, expectedTool: m.expectedTool, hit: m.hit, snippet: m.snippet }; }),
                    repaired: __repaired.map(function(r) { return { action: r }; })
                  });
                } catch (__e9) {}
              }
            }
            // level 4：自动登记 + 补调（本轮留 TODO，不实现）
          }
        }
      } catch (__e) { console.warn('[WordFamilies] 后置校验失败：', __e); }
      // 批 2 后置校验：检测 NPC 可能获得新知识但未调 npc_knows
      try {
        if (typeof NpcRuntime !== 'undefined' && NpcRuntime.checkMissingKnowledge) {
          var __missingK = NpcRuntime.checkMissingKnowledge(clean, toolResults);
          if (__missingK.length > 0) {
            __missingK.forEach(function(m) {
              GameState._pendingSystemNotices.push(
                'AI 上一轮正文提到「' + m.npcName + '」可能获得了新知识（信号：「' + m.signal +
                '」），但没有调 npc_knows。如果它确实从新途径得知了什么，请补调 npc_knows 登记。'
              );
            });
            Platform.ui.appendHint('（检测到 ' + __missingK.length + ' 位 NPC 可能获得知识但未登记）');
          }
        }
      } catch (__e2) { console.warn('[NpcRuntime] 知识后置校验失败：', __e2); }

      // ★ 推演 AI 触发（3-2 + 3-3）：工具执行后扫 pending，异步跑推演，不阻塞主循环
      try {
        if (typeof NpcDeductionAI !== 'undefined' && typeof NpcDeduction !== 'undefined') {
          var _dCfg = NpcDeductionAI._getConfig();
          if (_dCfg.enabled && _dCfg.autoTrigger) {
            var _pendings = NpcDeduction.listPending().filter(function(p) {
              return p && !p.deductionNote && !p.failReason;
            });
            if (_pendings.length > 0) {
              Platform.ui.appendHint('（引擎正在推演 ' + _pendings.length + ' 条 NPC 知识…）');
              // P54·P1：并发闸 2 —— 原先一次性 Promise.all 全部 pending（最坏 10 路同时打模型）
              var _dQueue = _pendings.slice();
              var _okCount = 0;
              var _dStep = function() {
                var _wave = _dQueue.splice(0, 2);
                if (_wave.length === 0) {
                  if (_okCount > 0) {
                    Platform.ui.appendHint('（' + _okCount + ' 位 NPC 好像知道了什么，去人物面板看看原因）');
                  }
                  return;
                }
                Promise.all(_wave.map(function(p) { return NpcDeductionAI.run(p.id); })).then(function(_results) {
                  _results.forEach(function(r) {
                    if (r && r.ok && !r.rejected) _okCount++;
                  });
                  _dStep();
                }).catch(function(e) {
                  console.warn('[NpcDeductionAI] 推演 Promise 失败：', e);
                  _dStep();
                });
              };
              _dStep();
            }
          }
        }
      } catch (_e) { console.warn('[NpcDeductionAI] 触发异常：', _e); }
        Platform.ui.updateTokenBadge();
        await this.maybeCompress(__channel);
      } catch (renderErr) {
        try {
          const idx = GameState.chatHistory.indexOf(assistantMsgRef);
          if (idx >= 0) GameState.chatHistory.splice(idx);
          // P72：孤儿回滚同步删树节点（链尾无子，删后 activeLeafId 回退到其父）
          if (idx >= 0 && GameState.messageTree) MessageTree.removeNode(assistantNode.id);
        } catch (e) { console.warn('[StoryLoop] 孤儿消息回滚失败：', e); }
        throw renderErr;
      }

      // ============ 各系统 tick ============
      if (typeof NpcRuntime !== 'undefined') {
        try { NpcRuntime.tick(); NpcRuntime.rollForScene(); }
        catch (e) { console.warn('[NpcRuntime] tick 失败：', e); }
      }
      if (typeof Weather !== 'undefined') {
        try { await Weather.tick(); } catch (e) { console.warn('[Weather] tick 失败：', e); }
      }
      if (typeof Endings !== 'undefined') {
        try {
          var endResult = Endings.tick();
          if (endResult && endResult.triggered && endResult.triggered.length) {
            endResult.triggered.forEach(function(t) {
              GameState._pendingSystemNotices.push('🎬 结局达成：' + t.name);
              Platform.ui.appendHint('（🎬 结局达成：' + t.name + '）');
            });
          }
        } catch (e) { console.warn('[Endings] tick 失败：', e); }
      }
      if (typeof StoryNodes !== 'undefined') {
        try {
          var nodeResult = StoryNodes.tick();
          if (nodeResult && nodeResult.events && nodeResult.events.length) {
            nodeResult.events.forEach(function(ev) {
              if (ev.type === 'warning' && ev.kind === 'foreshadow') {
                Platform.ui.appendHint('（⚠ 本节点还有伏笔没埋）');
              } else if (ev.label) {
                Platform.ui.appendHint('（' + ev.label + '）');
              }
            });
          }
          if (nodeResult && nodeResult.stuck && !_nodeStuckShown) {
            _nodeStuckShown = true;
            Platform.ui.appendHint('（' + nodeResult.stuck.hint + '）');
          }
          if (!nodeResult || !nodeResult.stuck) {
            _nodeStuckShown = false;
          }
        } catch (e) { console.warn('[StoryNodes] tick 失败：', e); }
      }
      if (typeof Events !== 'undefined') {
        try {
          var evResult = Events.tick();
          if (evResult && evResult.triggered && evResult.triggered.length) {
            var evFb = Events.formatForHistory(evResult.triggered);
            if (evFb) MessageTree.append('fb', { role: 'user', content: evFb });
          }
        } catch (e) { console.warn('[Events] tick 失败：', e); }
      }
      if (typeof Tasks !== 'undefined') {
        try {
          var taskResult = Tasks.tick();
          if (taskResult && taskResult.completed && taskResult.completed.length) {
            var taskFb = Tasks.formatForHistory(taskResult.completed);
            if (taskFb) MessageTree.append('fb', { role: 'user', content: taskFb });
          }
        } catch (e) { console.warn('[Tasks] tick 失败：', e); }
      }
      if (typeof Achievements !== 'undefined') {
        try {
          var achResult = Achievements.tick();
          if (achResult && achResult.unlocked && achResult.unlocked.length) {
            var achFb = Achievements.formatForHistory(achResult.unlocked);
            if (achFb) MessageTree.append('fb', { role: 'user', content: achFb });
          }
        } catch (e) { console.warn('[Achievements] tick 失败：', e); }
      }
      if (typeof Outputs !== 'undefined') {
        try { Outputs.tick(); }
        catch (e) { console.warn('[Outputs] tick 失败：', e); }
      }

        if (typeof Background !== 'undefined') {
          try { Background.tick(); }
          catch (e) { console.warn('[Background] tick 失败：', e); }
        }
      if (typeof Realtime !== 'undefined' && Realtime.autoTouch) {
        try { Realtime.autoTouch(); } catch (e) {}
      }

      // ★ 检测玩家换场景 → 重排 NPC 舞台
      this._checkLocationChange();

      GameState.persist();
    } catch (e) {
      if (myToken !== GameState._sessionToken) return;
      try { GameState.persist(); } catch (_) {}
      var isApiError = /HTTP 4\d\d|HTTP 5\d\d|API|Key|key|模型|model|Base URL|截断|token/i.test(e.message);
      var isModelError = /模型|model|reasoning|思维链|截断|token/i.test(e.message);
      Platform.ui.showStoryError(e.message, {
        canRetry: true,
        canGoSettings: isApiError || isModelError
      });
    } finally {
      if (myToken === GameState._sessionToken) { this.busy = false; Platform.ui.setBusy(false); }
    }
  },

  applyWindow(history, rounds) {
    if (!history || history.length === 0) return history;
    const system = history[0];
    const rest = history.slice(1);
    if (rest.length === 0) return [system];
    const isRealUserMsg = function(m) {
      if (!m || m.role !== 'user') return false;
      return !String(m.content || '').startsWith('【系统 ·');
    };
    // ★ Prompt Cache 前缀稳定（2026-10-17 批）：滑动窗口 → 锚定滞回窗口。
    //   旧语义「每轮保持最近 N 轮」⇒ cutIndex 随轮次每轮后移，历史段在相邻两次
    //   请求里没有公共前缀，OpenAI 兼容系（DeepSeek / OpenAI / Kimi 等，本项目
    //   全部预设统一走 /chat/completions 的自动前缀缓存）只能命中 system 头。
    //   新语义（有状态锚点 _windowAnchor）：窗口起点一经确定就固定 —— 后续轮次
    //   只在尾部追加，相邻请求的公共前缀覆盖全部携带历史；从锚点起真实轮数
    //   超过 2N 才把锚点跳到「最近 N 轮」（裁法与旧版逐字一致），之后重新生长。
    //   ⇒ 前缀失配只发生在锚点跳动的轮（每 N+1 轮一次），不再是每轮。
    //   锚点为 null（进程首次请求 / 换档 / 压缩把锚点清出）时按旧语义冷启动：
    //   真实轮数 > N 即裁回 N 轮，与旧版首请行为一致（K1 契约口径）。
    //   maybeCompress 的保留窗口与裁剪窗口同口径（都留最近 N 轮）：裁剪后锚点
    //   恰好落在保留区内，跨压缩的请求前缀不变（日志压缩不吃缓存）。
    //   代价：窗口峰值 N~2N 轮，绝对量由 windowRounds 设置控制。
    let anchorIdx = 0;
    if (this._windowAnchor) {
      const ai = rest.indexOf(this._windowAnchor);
      if (ai >= 0) anchorIdx = ai;
      else this._windowAnchor = null;   // 已被压缩/换档清出 ⇒ 冷启动重置
    }
    let userCount = 0;
    for (let i = rest.length - 1; i >= anchorIdx; i--) if (isRealUserMsg(rest[i])) userCount++;
    const limit = this._windowAnchor ? rounds * 2 : rounds;
    if (userCount > limit) {
      let c = 0;
      for (let i = rest.length - 1; i >= anchorIdx; i--) {
        if (isRealUserMsg(rest[i])) { c++; if (c >= rounds) { anchorIdx = i; break; } }
      }
    }
    this._windowAnchor = rest[anchorIdx] || null;
    return [system].concat(rest.slice(anchorIdx)).map(function(m) {
      return { role: m.role, content: m.content };
    });
  },

  async maybeCompress(channel) {
    if (typeof Logger === 'undefined') return;
    if (!GameState.currentCardId || !GameState.currentSaveId) return;
    const g = Storage.getGlobal();
    const lg = g.logging || {};
    if (lg.enabled === false) return;

    // ★ P63·②：没有可用 API 就不该尝试压缩。
    //   外部 AI 通道（storyChannel === 'external'）与「没配 baseUrl」两种情况下，
    //   Logger.compress 必然失败，而失败会往叙事流里打两条提示
    //   （「（正在生成日志…）」「（日志生成失败，保留原文）」）；又因为永远生成不出 lastLog，
    //   从第 20 条消息起每回合都会重来一次 —— 日志功能等于不存在，还刷屏。
    //   这里整段跳过：不提示、不发请求、历史不缩（真正的窗口裁剪由 applyWindow 负责）。
    //   通道由调用点传入（本轮已在 :280 裁决过一次，结果存 __channel），
    //   这里不再二次取通道，保持「通道裁决只有在 :280 那一处」。
    if (channel === 'external') return;
    if (typeof Logger.canCompress !== 'function' || !Logger.canCompress()) return;
    // 连续失败退让：API 配了但报错（key 失效/服务不可用）时，别每回合都重试并刷提示。
    // 成功一次即清零；连续失败 2 次后静默停到下次加载存档。
    if ((GameState._logCompressFailStreak || 0) >= 2) return;

    // ★ 快照当前游戏时间，防止压缩失败重试时日期漂移
    var snapTime = GameState._gameTime ? { year: GameState._gameTime.year, month: GameState._gameTime.month, day: GameState._gameTime.day, hour: GameState._gameTime.hour, minute: GameState._gameTime.minute } : null;

    const totalMsgs = GameState.chatHistory.filter(m => m.role !== 'system').length;
    const lastCount = GameState._lastCompressMsgCount || 0;
    const accumulated = Math.max(0, totalMsgs - lastCount);

    const logs = Logger.listLogs(GameState.currentCardId, GameState.currentSaveId);
    const lastLog = logs.length > 0 ? logs[0] : null;

    const decision = Logger.shouldCompress(
      lastLog ? lastLog.gameDate : null,
      GameState._gameTime,
      accumulated
    );
    if (!decision.yes) return;

    const windowRounds = lg.windowRounds || 10;
    // ★ P4：真实玩家发言判定（定义与 Snapshots._currentRound 同源：
    //   排除系统注入的「【系统 ·」条目），一并写进日志供按轮次回退。
    const isRealUserMsg = (m) => !!m && m.role === 'user' && !String(m.content || '').startsWith('【系统 ·');
    const rest = GameState.chatHistory.slice(1);
    // ★ P54·§四：保留窗口按「轮」计，与 applyWindow 同口径（排除【系统 · 条目）。
    //   旧实现 keepCount = windowRounds * 2 是「条」，系统消息也占配额
    //   ⇒ 压缩后真实轮数可能只剩 5-7 轮，applyWindow 承诺的窗口名不副实。
    let keepFrom = 0, roundsKept = 0;
    for (let i = rest.length - 1; i >= 0; i--) {
      if (isRealUserMsg(rest[i])) { roundsKept++; if (roundsKept > windowRounds) { keepFrom = i + 1; break; } }
    }
    const toCompress = rest.slice(0, keepFrom);
    // ★ P54·§四：先判「有没有活要干」，再发进度提示 —— 否则提前返回会把
    //   「（正在生成日志…）」永久挂在界面上（成功/失败提示都到不了）。
    if (toCompress.length < 4) return;

    Platform.ui.appendHint('（正在生成日志…）');

    // F1b·B（口径修正）：只数「批次开始前」已经发生的真实玩家发言 —— 本批从 chatHistory[batchHead]
    //   之后开始（第 0 条是系统/开篇），批次之前的玩家发言属于上一批、已在各自批次里记过轮号，
    //   所以这里的典型值是 0，与变量名和 msgFrom 的语义对齐（旧写法按「前两条」计数，会把开篇后
    //   第 1 条也算进来，且随 chatHistory 增长而语义漂移）—— 那正是本修正要拿掉的口径。
    //   注意：`msgFrom: batchMsgFrom` 表达式与变量名被 tools/log_query_smoke.js F4 钉住，不要改。
    const batchHead = 1;
    let batchMsgFrom = 0;
    for (let i = 0; i < batchHead; i++) {
      if (isRealUserMsg(GameState.chatHistory[i])) batchMsgFrom++;
    }

    // P72·W0-a：本批的快照轴参考区间。seqTo=压缩当时的 _roundSeq（最新轮）；
    //   本批覆盖轮 = seqTo − 保留段真玩家数 − 本批真玩家数 + 1 … seqTo − 保留段真玩家数。
    //   切分支/回退后为估算参考值——归档精确对齐走 W0-b 的 msgIds，这里只给日志页参考。
    const seqTo = (typeof GameState._roundSeq === 'number') ? GameState._roundSeq : 0;
    const batchRealUsers = toCompress.filter(isRealUserMsg).length;
    const keepRealUsers = rest.slice(keepFrom).filter(isRealUserMsg).length;
    const seqFrom = Math.max(0, seqTo - keepRealUsers - batchRealUsers + 1);
    // P72·W0-b：被压缩消息的树节点 id（与 toCompress 对齐 = 主线下标 1..keepFrom；
    //   落进 chunk.msgIds，W0-b 起 archiveAfter 按它定位归档块）。无树档传 null。
    let compressIds = null;
    if (GameState.messageTree && typeof MessageTree !== 'undefined' && typeof MessageTree.mainlineIds === 'function') {
      const ids = MessageTree.mainlineIds();
      if (ids && ids.length > 1) compressIds = ids.slice(1, keepFrom + 1);
    }
    const logData = await Logger.compress({
        cardId: GameState.currentCardId,
        saveId: GameState.currentSaveId,
        gameDate: GameState._gameTime,
        startGameDate: GameState._lastCompressGameTime || snapTime,
        msgFrom: batchMsgFrom,
        roundSeqFrom: seqFrom,
        roundSeqTo: seqTo,
        msgIds: compressIds,
        messages: toCompress
      });
    if (!logData) {
      // P63·②：失败提示保留（API 配好却失败时该让玩家知道），但连续失败要退让，
      //   否则每回合两条提示 + 两次请求，叙事流会被埋掉。
      GameState._logCompressFailStreak = (GameState._logCompressFailStreak || 0) + 1;
      Platform.ui.appendHint('（日志生成失败，保留原文' +
        (GameState._logCompressFailStreak >= 2 ? '；本档不再尝试，重新进入存档后再试' : '') + '）');
      return;
    }
    GameState._logCompressFailStreak = 0;

    GameState.chatHistory = [GameState.chatHistory[0]].concat(rest.slice(keepFrom));
    // P72：压缩砍头同步删树（被归档节点从主线摘除删除，新主线首节点改挂 system 根），
    //   dropMainlineHead 内部会重导出 chatHistory——与上一行结果逐元素一致（同 msg 引用）
    if (GameState.messageTree) MessageTree.dropMainlineHead(keepFrom);
    GameState._lastCompressMsgCount = GameState.chatHistory.filter(m => m.role !== 'system').length;
    if (GameState._gameTime) {
      GameState._lastCompressGameTime = {
        year: GameState._gameTime.year,
        month: GameState._gameTime.month,
        day: GameState._gameTime.day,
        hour: GameState._gameTime.hour,
        minute: GameState._gameTime.minute
      };
    }
    Platform.ui.appendHint('（日志已生成：' + logData.title + '）');
  },

  parseAndRender(content, toolResults) {
    let story = '', options = [], timeDelta = 0;

    // P65：先把【自检】块摘掉（玩家不该看到机器自检），结论留给下轮提示词用。
    //   自检是被要求的时候才记；没要求却输出了也照记（说明模型在自查，无害）。
    if (typeof ToolTrace !== 'undefined' && ToolTrace.stripSelfCheck) {
      try {
        const sc = ToolTrace.stripSelfCheck(content);
        if (sc.selfCheck != null) {
          content = sc.text;
          ToolTrace.recordSelfCheck(null, sc.selfCheck);
        }
      } catch (e) {}
    }

    const tMatch = content.match(/【时间】\s*([+\-]?\d+(?:\.\d+)?)\s*([分时天日周月年]?)/);
    let timeMarkerFound = false;
    if (tMatch) {
      timeMarkerFound = true;
      const n = parseFloat(tMatch[1]) || 0;
      const u = tMatch[2] || '分';
      if (u === '分') timeDelta = n;
      else if (u === '时' || u === '小时') timeDelta = n * 60;
      else if (u === '天' || u === '日') timeDelta = n * 60 * 24;
      else if (u === '周') timeDelta = n * 60 * 24 * 7;
      else if (u === '月') timeDelta = n * 60 * 24 * 30;
      else if (u === '年') timeDelta = n * 60 * 24 * 360;
      else timeDelta = n;
    }
    if (!timeMarkerFound) timeDelta = 15;

    // P72·D3：正文/选项正则与 ui_core 的渲染拆句共用一份（engine/message_tree.js），
    // 避免两处口径漂移（此前 ui_core 少了【时间】前的截断、story 少了【选项列表】等变体）。
    const bodyRe = (typeof MessageTree !== 'undefined' && MessageTree.BODY_RE) ? MessageTree.BODY_RE
      : /(?:【正文】|【故事】|正文[:：]|\[正文\])([\s\S]*?)(?=(?:【时间】|【选项】|【选项列表】|选项[:：]|\[选项\]|$))/;
    const optRe = (typeof MessageTree !== 'undefined' && MessageTree.OPT_RE) ? MessageTree.OPT_RE
      : /(?:【选项】|【选项列表】|选项[:：]|\[选项\])([\s\S]*)$/;
    const bm = content.match(bodyRe), om = content.match(optRe);
    if (bm) story = bm[1].trim();
    else if (om) { const i = content.indexOf(om[0]); story = content.slice(0, i).trim(); }
    else {
      const ls = content.split('\n');
      let lastN = -1;
      for (let i = ls.length - 1; i >= 0; i--) {
        const l = ls[i];
        if (l.trim() === '') continue;
        if (/^\s*\d+[\.、\)）]\s*\S/.test(l) || /^\s*[-*]\s*\S/.test(l)) lastN = i;
        else break;
      }
      if (lastN >= 0) {
        let start = lastN;
        for (let i = lastN - 1; i >= 0; i--) {
          const l = ls[i];
          if (/^\s*\d+[\.、\)）]\s*\S/.test(l) || /^\s*[-*]\s*\S/.test(l)) start = i;
          else break;
        }
        story = ls.slice(0, start).join('\n').trim();
        options = ls.slice(start, lastN + 1).map(l => l.replace(/^\s*\d+[\.、\)）]\s*/, '').replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean);
      } else story = content;
    }
    if (om && story) {
      options = om[1].split('\n').map(l => l.replace(/^\s*\d+[\.、\)）]\s*/, '').replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean);
    }
    options = options.filter(o => !/^[>\[]/.test(o.trim()));
    GameState.advanceTime(timeDelta);

    // 剧情外信息层：空闲期让世界主动找玩家说话（无 key / 网络错 / JSON 坏 → tick 内部静默）
    // P13·S1-c：tick 真生成新讯息时在叙事流末尾留一条被动页边注（appendHint 不改轮次/token 计数）
    if (typeof InfoFeed !== 'undefined' && typeof InfoFeed.tick === 'function') {
      let __unreadBefore = 0;
      try { __unreadBefore = InfoFeed.unreadTotal() || 0; } catch (e) { __unreadBefore = 0; }
      let __tickRet = null;
      try { __tickRet = InfoFeed.tick({ round: GameState.currentRound, locationId: GameState.playerData.locationId }); } catch (e) { __tickRet = null; }
      if (__tickRet && typeof __tickRet.then === 'function') {
        __tickRet.then(function () {
          let __unreadAfter = 0;
          try { __unreadAfter = InfoFeed.unreadTotal() || 0; } catch (e) { __unreadAfter = 0; }
          if (__unreadAfter <= __unreadBefore) return;
          Platform.ui.appendHint('📱 手机收到了新讯息');
          Platform.ui.renderTopbar();
          Platform.ui.renderSidebarExpanded();
        })["catch"](function () {});
      }
    }
    this.currentOptions = options;

    const roundNum = Platform.ui._currentRoundNum();
    let meta = null;
    for (let i = GameState.chatHistory.length - 1; i >= 0; i--) {
      if (GameState.chatHistory[i].role === 'assistant') { meta = GameState.chatHistory[i].meta || null; break; }
    }
    Platform.ui.renderChapterHead(roundNum);
    Platform.ui.appendStory(story, options, timeDelta, toolResults, roundNum, meta);
    Platform.ui.renderTopbar();
    Platform.ui.renderSidebarExpanded();
    this._styleCheckAfterRender(story, roundNum);
    this._maybeUpdateSummary(roundNum);
  },

  /**
   * P72·W8：长程记忆的自动摘要（Story Summary）。
   *
   * 每 settings.story.summaryEvery 轮（默认 8）在一轮**回复完成后**发一次独立小请求，
   * 把最近若干轮压成 150-250 字，写回 playerData.storySummary / storySummaryAt。
   * 失败只 appendHint，不打断这一轮；开关 settings.story.summaryOff=true 时整段跳过。
   *
   * @returns {Promise<boolean>} 是否真的更新了（便于测试断言；不关心时可不 await）
   */
  async _maybeUpdateSummary(roundNum) {
    try {
      var g = (typeof Storage !== 'undefined' && Storage.getGlobal) ? (Storage.getGlobal() || {}) : {};
      var st = (g.settings && g.settings.story) || {};
      if (st.summaryOff) return false;
      var every = (typeof st.summaryEvery === 'number' && st.summaryEvery >= 2) ? Math.floor(st.summaryEvery) : 8;
      var pd = GameState.playerData || {};
      var lastAt = (typeof pd.storySummaryAt === 'number') ? pd.storySummaryAt : 0;
      if (!(roundNum > 0) || roundNum - lastAt < every) return false;
      if (typeof ApiClient === 'undefined' || !ApiClient || typeof ApiClient.chat !== 'function') return false;

      // 只喂最近的对话文本（不含 system）：太长的历史对「摘要」没帮助，还烧 token
      var tailLines = [];
      var hist = GameState.chatHistory || [];
      for (var i = Math.max(0, hist.length - every * 2); i < hist.length; i++) {
        var m = hist[i];
        if (!m || m.role === 'system') continue;
        var c = String(m.content || '').slice(0, 1200);
        tailLines.push((m.role === 'assistant' ? 'GM：' : '玩家：') + c);
      }
      if (tailLines.length < 2) return false;
      var prev = (typeof pd.storySummary === 'string') ? pd.storySummary : '';
      var sys = '你是剧情摘要器。把下面这段跑团记录压成简洁的前情摘要。'
        + '只输出摘要正文（150-250 字，中文），不要标题、不要解释、不要 markdown。'
        + '保留：玩家是谁、当前在哪、正在做什么、未解决的悬念、与哪些人建立了关系。'
        + (prev ? ' 旧的摘要可以合并进来（不要丢掉仍然有效的信息）。' : '');
      var user = (prev ? '=== 旧摘要 ===\n' + prev + '\n\n' : '') + '=== 最近的记录 ===\n' + tailLines.join('\n');
      var resp = await ApiClient.chat(
        [{ role: 'system', content: sys }, { role: 'user', content: user }],
        { max_tokens: 400, temperature: 0.2 }
      );
      var txt = (typeof resp === 'string') ? resp : ((resp && (resp.content || resp.text)) || '');
      txt = String(txt || '').replace(/\s+/g, ' ').trim();
      if (!txt) { if (Platform.ui && Platform.ui.appendHint) Platform.ui.appendHint('（摘要没更新，不影响继续）'); return false; }
      if (txt.length > 400) txt = txt.slice(0, 399) + '…';
      GameState.playerData = GameState.playerData || {};
      GameState.playerData.storySummary = txt;
      GameState.playerData.storySummaryAt = roundNum;
      if (typeof Platform !== 'undefined' && Platform.ui && Platform.ui.renderSidebarExpanded) {
        try { Platform.ui.renderSidebarExpanded(); } catch (e2) {}
      }
      return true;
    } catch (e) {
      try { if (Platform.ui && Platform.ui.appendHint) Platform.ui.appendHint('（摘要没更新，不影响继续）'); } catch (e2) {}
      return false;
    }
  },

  /**
   * P72·W3：反说教闸门的渲染后检查（抽成独立方法是为了能被单测直接夹住——
   * parseAndRender 太大，喂不动一整套假件）。
   *
   * 命中 fail 且本轮还没重写过 ⇒ 自动重写一次（走「重新生成」同一条路径：
   * 有树切分支、无树截断 + 非破坏归档，旧版本不会凭空消失）。
   * 每轮只重试一次：GameState._styleRetriedRound 记账，避免模型不改就被无限重跑。
   * 不往 prompt 里注入文风指令：P70-T2 的「prompt 逐字不变」门禁会直接红。
   *
   * @returns {{verdict:string, retried:boolean, hint:string}} 便于测试断言
   */
  _styleCheckAfterRender(story, roundNum) {
    var out = { verdict: 'ok', retried: false, hint: '' };
    try {
      if (typeof StyleGuard === 'undefined' || !StyleGuard || typeof StyleGuard.analyze !== 'function') return out;
      if (typeof StyleGuard.shouldAutoRewrite === 'function' && StyleGuard.shouldAutoRewrite(story)) {
        var res = StyleGuard.analyze(story);
        out.verdict = res.verdict;
        var key = 'r' + roundNum;
        if (GameState._styleRetriedRound !== key) {
          GameState._styleRetriedRound = key;
          var comment = StyleGuard.buildRetryComment(res.hits);
          var did = false;
          if (typeof UI_Snapshot !== 'undefined' && UI_Snapshot && typeof UI_Snapshot.autoRegenerate === 'function') {
            did = UI_Snapshot.autoRegenerate(comment) === true;
          } else if (typeof SnapshotActions !== 'undefined' && SnapshotActions && typeof SnapshotActions.autoRegenerate === 'function') {
            did = SnapshotActions.autoRegenerate(comment) === true;
          }
          out.retried = did;
          out.hint = did ? '（这段说教味偏重，已自动重写一次）'
                         : '（这段说教味偏重，可点「重新生成」让它重写）';
        } else {
          // 本轮已经重写过一次但判分还是 fail —— 不再自动重跑，交给玩家决定
          out.hint = '（这段仍有点说教味，可点「重新生成」或「改这句」调整）';
        }
        if (out.hint) Platform.ui.appendHint(out.hint);
        return out;
      }
      if (typeof StyleGuard.mode === 'function' && StyleGuard.mode() === 'warn') {
        var res2 = StyleGuard.analyze(story);
        out.verdict = res2.verdict;
        out.hint = StyleGuard.hintText(res2.verdict) || '';
        if (out.hint) Platform.ui.appendHint(out.hint);
      }
    } catch (e) { console.warn('[StyleGuard] 检查失败：', e); }
    return out;
  }
};

// ============================================================
// CreateFlow（断点续传版）
// ============================================================
var CreateFlow = {
  card: null, steps: [], index: 0, data: {},

  _draftKey(cardId, saveId) {
    var cid = cardId || (this.card && this.card.cardId) || '';
    var sid = saveId || (typeof GameState !== 'undefined' ? GameState.currentSaveId : '') || '';
    if (!cid || !sid) return null;
    return '/saves/' + cid + '/' + sid + '/draft.json';
  },

  _peekDraft(cardId, saveId) {
    try {
      var path = this._draftKey(cardId, saveId);
      if (!path) return null;
      var d = VFS.readJSON(path);
      if (!d || !d.data) return null;
      if (d.ts && Date.now() - d.ts > 7 * 24 * 3600 * 1000) { this._clearDraft(cardId, saveId); return null; }
      return d;
    } catch (e) { return null; }
  },

  _saveDraft() {
    if (!this.card) return;
    if (!GameState.currentSaveId) return;
    try {
      var path = this._draftKey(this.card.cardId, GameState.currentSaveId);
      if (!path) return;
      var d = {
        cardId: this.card.cardId,
        saveId: GameState.currentSaveId,
        index: this.index,
        data: this.data,
        totalSteps: this.steps.length,
        ts: Date.now()
      };
      VFS.writeJSON(path, d);
    } catch (e) {}
  },

  _clearDraft(cardId, saveId) {
    try {
      var path = this._draftKey(cardId, saveId);
      if (!path) return;
      VFS.deleteFile(path);
    } catch (e) {}
  },

  start(card, draft) {
    this.card = card;
    this.steps = (card.steps || []).filter(s => !this.isSkipped(s));
    // P47·批次2：换卡带创角时清空上一轮天命结果
    this._destinySets = null;
    this._destinyPicked = null;

    if (draft && draft.data) {
      this.index = Math.max(0, Math.min(draft.index || 0, this.steps.length - 1));
      this.data = draft.data || {};
      while (this.index < this.steps.length && this.isSkipped(this.steps[this.index])) this.index++;
      if (this.index >= this.steps.length) this.index = 0;
      Platform.ui.showScreen('screen-create');
      this.render();
      Platform.ui.appendHint('（从上次未完成的创建继续）');
      return;
    }

    if (!this.steps.length) {
      GameState.playerData = {};
      GameState.playerData.inventory = { bar: [], common: [], story: [], rare: [] };
      this._enterPortrait();
      return;
    }
    this.index = 0;
    this.data = {};
    Platform.ui.showScreen('screen-create');
    this.render();
  },

  _enterPortrait() {
    UI_Portrait.start(GameState.playerData, function(result) {
      var portrait = (result && result.portrait) ? result.portrait : result;
      var opening = (result && result.openingPrompt != null) ? result.openingPrompt : '';
      GameState.playerData.portrait = portrait;
      Portrait.save(portrait);
      if (opening) GameState.playerData._openingPrompt = opening;
      else delete GameState.playerData._openingPrompt;
      GameState.invalidateCache();
      if (typeof Snapshots !== 'undefined') Snapshots.push('init');
      Platform.ui.showScreen('screen-game');
      Platform.ui.renderGame();
      StoryLoop.start();
    });
  },

  getPool(step) {
    if (step.pool && step.pool.total != null) return step.pool;
    if (this.card.attributePool && this.card.attributePool.total != null) return this.card.attributePool;
    return null;
  },
  isAttrStep(step) {
    if (!step.fields || !step.fields.length) return false;
    const allNumber = step.fields.every(f => f.type === 'number');
    const allAttrKey = step.fields.every(f => f.key && String(f.key).indexOf('attr_') === 0);
    return allNumber || allAttrKey;
  },
  calcAllocated(step) {
    const pool = this.getPool(step);
    if (!pool) return 0;
    const base = pool.base != null ? pool.base : 0;
    let total = 0;
    (step.fields || []).forEach(f => {
      const v = this.data[f.key];
      if (typeof v !== 'number' || isNaN(v)) return;
      const fb = f.min != null ? f.min : base;
      total += Math.max(0, v - fb);
    });
    return total;
  },
  isSkipped(step) {
    if (!step.skipWhen) return false;
    const m = step.skipWhen.match(/^(\w+)\s*!=\s*null$/);
    if (m) return this.data[m[1]] != null;
    return false;
  },
  current() { return this.steps[this.index]; },

  render() {
    const step = this.current();
    if (!step) return;
    document.getElementById('cf-title').textContent = step.title || '创建角色';
    document.getElementById('cf-step-count').textContent = (this.index + 1) + ' / ' + this.steps.length;
    document.getElementById('cf-progress-fill').style.width = ((this.index) / this.steps.length * 100) + '%';
    document.getElementById('cf-prev').disabled = this.index === 0;
    document.getElementById('cf-next').textContent = (this.index === this.steps.length - 1) ? '完成' : '下一步';
    document.getElementById('cf-body').innerHTML = this.renderStep(step);
    document.getElementById('cf-body').scrollTop = 0;
    this._saveDraft();
  },

  renderStep(step) {
    let html = '';
    html += this.renderDestiny();
    if (step.guide) html += '<div class="guide">' + escapeHtml(step.guide) + '</div>';
    switch (step.type) {
      case 'form': html += this.renderForm(step); if (step.showCalendar) html += this.renderCalendar(step); break;
      case 'select':
        if (step.renderMode === 'quiz') html += '<div class="cf-quiz-wrap"><div class="cf-quiz-hint">— 请凭直觉选择 —</div>' + this.renderSelectQuiz(step) + '</div>';
        else html += this.renderSelect(step);
        break;
      case 'multi-select':
        if (step.renderMode === 'quiz') html += '<div class="cf-quiz-wrap"><div class="cf-quiz-hint">— 请凭直觉选择 —</div>' + this.renderMultiSelectQuiz(step) + '</div>';
        else html += this.renderMultiSelect(step);
        break;
      case 'quiz': html += this.renderQuizSet(step); break;
      case 'summary': html += this.renderSummary(); break;
      default: html += '<p>（未知步骤类型：' + escapeHtml(step.type) + '）</p>';
    }
    return html;
  },

  // P47·批次2：天命面板（CoC 属性 N 选一）。逻辑与 RN CreateScreen 同源
  //   （都走 engine/destiny.js）；未选=列 N 组供选，已选=折叠显示最终属性 + 重掷。
  //   卡带未启用 worldbook.destiny 时返回空串，创角流程零变化。
  renderDestiny() {
    if (typeof Destiny === 'undefined' || !Destiny || !Destiny.enabled(this.card)) return '';
    const attrs = Destiny.attributes(this.card);
    let html = '<div class="cf-destiny-box"><div class="cf-destiny-title">🎲 天命</div>';
    if (this._destinyPicked) {
      html += '<div class="cf-destiny-hint">已采用这组属性（可在下方步骤里继续手改）。</div>';
      attrs.forEach(a => {
        const v = this._destinyPicked.values[a.key];
        html += '<div class="cf-destiny-line"><span class="k">' + escapeHtml(a.name || a.key) + '：</span>' + String(v == null ? '—' : v) + '</div>';
      });
      html += '<div class="cf-destiny-line"><span class="k">总和：</span>' + String(this._destinyPicked.total) + '</div>';
      html += '<button class="cf-destiny-btn" onclick="CreateFlow.rollDestiny()">重掷天命</button>';
    } else {
      html += '<div class="cf-destiny-hint">掷 ' + Destiny.defaultSets(this.card) + ' 组属性，挑一组作为你的天命。</div>';
      html += '<button class="cf-destiny-btn" onclick="CreateFlow.rollDestiny()">掷天命</button>';
      if (this._destinySets) {
        this._destinySets.forEach((set, i) => {
          const parts = attrs.map(a => escapeHtml(a.name || a.key) + ' ' + String(set.values[a.key] == null ? '—' : set.values[a.key]));
          html += '<button class="cf-destiny-row" onclick="CreateFlow.pickDestiny(' + i + ')">' +
            '<div class="cf-destiny-row-text">' + parts.join('  ·  ') + '</div>' +
            '<div class="cf-destiny-row-total">总和 ' + String(set.total) + '</div></button>';
        });
      }
    }
    html += '</div>';
    return html;
  },

  rollDestiny() {
    if (typeof Destiny === 'undefined' || !Destiny) return;
    this._destinyPicked = null;
    this._destinySets = Destiny.rollBatch(Destiny.attributes(this.card), Destiny.defaultSets(this.card));
    this.render();
  },

  pickDestiny(i) {
    const set = (this._destinySets || [])[i];
    if (!set) return;
    this._destinyPicked = set;
    Destiny.attributes(this.card).forEach(a => {
      if (a && a.key && typeof set.values[a.key] === 'number') this.data[a.key] = set.values[a.key];
    });
    this.render();
  },

  renderForm(step) {
    const pool = this.getPool(step);
    const isAttr = this.isAttrStep(step) && pool;
    let html = '';
    if (isAttr) {
      const allocated = this.calcAllocated(step);
      const remain = pool.total - allocated;
      const cls = remain < 0 ? 'over' : '';
      html += '<div class="cf-pool-bar" id="cf-pool-bar">' +
        '<div class="cf-pool-label">已分配：<span class="cf-pool-num ' + cls + '" id="cf-pool-num">' + allocated + '</span> / ' + pool.total +
        ' <span class="cf-pool-remain" style="color:var(--c-text-faint); font-size:12px;">（剩余 ' + remain + '）</span></div>' +
        '<div class="muted">每项基础 ' + (pool.base != null ? pool.base : 0) + ' 点</div></div>';
    }
    html += (step.fields || []).map(f => {
      const id = 'cf-f-' + f.key;
      const idAttr = escapeAttr(id);                                  // ★ 安全：f.key 来自卡带，不能直接拼进 id 属性
      const fallback = (f.default != null) ? f.default : (isAttr && f.min != null ? f.min : '');
      // 同步 fallback 到 this.data：用户没动过输入框时，data 里也应该是 fallback 的值
      if ((this.data[f.key] == null) && fallback !== '' && fallback != null) {
        this.data[f.key] = fallback;
      }
      const val = this.data[f.key] != null ? this.data[f.key] : fallback;
      const req = f.required ? '<span class="req"> *</span>' : '';
      let input = '';
      if (f.type === 'text') {
        input = '<input id="' + idAttr + '" type="text" value="' + escapeAttr(val) + '" placeholder="' + escapeAttr(f.placeholder || '') + '" oninput="CreateFlow.onTextInput(' + jsAttr(f.key) + ', this.value, false)">';
      } else if (f.type === 'number') {
        // ★ 安全：min/max 来自卡带，先归一成数字再拼（既防属性注入，也防 jsArg 位置注入）
        const minNum = (f.min != null && isFinite(Number(f.min))) ? Number(f.min) : null;
        const maxNum = (f.max != null && isFinite(Number(f.max))) ? Number(f.max) : null;
        const minAttr = minNum != null ? 'min="' + minNum + '"' : '';
        const maxAttr = maxNum != null ? 'max="' + maxNum + '"' : '';
        const minJs = minNum != null ? String(minNum) : 'null';
        const maxJs = maxNum != null ? String(maxNum) : 'null';
        input = '<input id="' + idAttr + '" type="number" ' + minAttr + ' ' + maxAttr + ' value="' + escapeAttr(val) + '" ' +
          'oninput="CreateFlow.onNumberInput(' + jsAttr(f.key) + ', this, ' + minJs + ', ' + maxJs + ', ' + (isAttr ? 'true' : 'false') + ')" ' +
          'onblur="CreateFlow.onNumberBlur(' + jsAttr(f.key) + ', this, ' + minJs + ', ' + maxJs + ', ' + (isAttr ? 'true' : 'false') + ')">';
      } else if (f.type === 'choice') {
        input = '<div>';
        (f.options || []).forEach(o => {
          const sel = val === o.id ? 'selected' : '';
          input += '<button class="cf-option ' + sel + '" onclick="CreateFlow.setField(' + jsAttr(f.key) + ', ' + jsAttr(o.id) + '); CreateFlow.render();">' +
            '<div class="opt-name">' + escapeHtml(o.label || o.name || o.id) + '</div></button>';
        });
        input += '</div>';
      } else {
        input = '<input id="' + idAttr + '" type="text" value="' + escapeAttr(val) + '" oninput="CreateFlow.onTextInput(' + jsAttr(f.key) + ', this.value, false)">';
      }
      return '<div class="field"><label>' + escapeHtml(f.label) + req + '</label>' + input + '</div>';
    }).join('');
    return html;
  },

  onNumberInput(key, inputEl, min, max, isAttr) {
    const raw = inputEl.value;
    if (raw === '' || raw === '-' || raw === '.') { this.data[key] = ''; }
    else { const v = Number(raw); if (!isNaN(v)) this.data[key] = v; }
    if (isAttr) this.updatePool();
    else this.updateCalendar();
    this._saveDraft();
  },
  onNumberBlur(key, inputEl, min, max, isAttr) {
    const raw = inputEl.value;
    if (raw === '') { this.data[key] = ''; }
    else {
      let v = Number(raw);
      if (isNaN(v)) { inputEl.value = ''; this.data[key] = ''; }
      else {
        let c = v;
        if (min != null && c < min) c = min;
        if (max != null && c > max) c = max;
        if (c !== v) inputEl.value = c;
        this.data[key] = c;
      }
    }
    if (isAttr) this.updatePool();
    else this.updateCalendar();
    this._saveDraft();
  },
  onTextInput(key, value, isAttr) {
    this.data[key] = value;
    if (isAttr) this.updatePool();
    this._saveDraft();
  },
  updatePool() {
    const el = document.getElementById('cf-pool-num');
    if (!el) return;
    const step = this.current();
    if (!step) return;
    const pool = this.getPool(step);
    if (!pool) return;
    const allocated = this.calcAllocated(step);
    const remain = pool.total - allocated;
    el.textContent = allocated;
    if (allocated > pool.total) el.classList.add('over'); else el.classList.remove('over');
    const bar = document.getElementById('cf-pool-bar');
    if (bar) { const r = bar.querySelector('.cf-pool-remain'); if (r) r.textContent = '（剩余 ' + remain + '）'; }
  },

  renderCalendar(step) {
    return '<div class="cf-calendar-wrap"><div class="cf-calendar-title">📅 时间线参考</div>' +
      '<div class="cf-calendar-body" id="cf-calendar-body">' + this.calendarBodyHtml(null) + '</div></div>';
  },
  calendarBodyHtml(pby) {
    const card = this.card;
    const wb = card.worldbook || {};
    const events = (wb.timeline && wb.timeline.official) || [];
    const npcs = (wb.npcs || []).filter(n => n.born);
    const era = card.game.eraRange;
    const eS = Array.isArray(era) && era.length ? (Array.isArray(era[0]) ? era[0][0] : era[0]) : 1990;
    const eE = Array.isArray(era) && era.length ? (Array.isArray(era[era.length - 1]) ? era[era.length - 1][1] : (era[1] != null ? era[1] : era[0])) : 2000;
    let s = '';
    if (pby) {
      const sy = parseInt(pby, 10) + 11;
      s += '<div class="cf-cal-section"><div class="cf-cal-label">你的情况</div>';
      s += '<div class="cf-cal-line">出生年：<b>' + pby + '</b>，11 岁入学约在 <b>' + sy + '</b> 年</div>';
      const sg = [], nr = [];
      npcs.forEach(n => {
        const d = parseInt(n.born, 10) - parseInt(pby, 10);
        if (d === 0) sg.push(n.name);
        else if (Math.abs(d) <= 2) nr.push(n.name + '（' + (d > 0 ? '小' + d + '届' : '大' + (-d) + '届') + '）');
      });
      if (sg.length) s += '<div class="cf-cal-line">同届：' + sg.map(escapeHtml).join('、') + '</div>';
      if (nr.length) s += '<div class="cf-cal-line">同期：' + nr.map(escapeHtml).join('、') + '</div>';
      s += '</div>';
    } else s += '<div class="cf-cal-line muted">填写出生年份后，这里会显示你和哪些人物同届。</div>';
    s += '<div class="cf-cal-section"><div class="cf-cal-label">时代范围</div><div class="cf-cal-line">' + eS + ' — ' + eE + '</div></div>';
    if (events.length) {
      s += '<div class="cf-cal-section"><div class="cf-cal-label">关键事件</div>';
      events.slice().sort((a, b) => (parseInt(String(a.time || '').match(/\d{4}/), 10) || 0) - (parseInt(String(b.time || '').match(/\d{4}/), 10) || 0)).forEach(ev => {
        s += '<div class="cf-cal-line"><span class="cf-cal-time">' + escapeHtml(ev.time || '?') + '</span> · ' + escapeHtml(ev.event || '') + '</div>';
      });
      s += '</div>';
    }
    if (npcs.length) {
      s += '<div class="cf-cal-section"><div class="cf-cal-label">人物出生年</div>';
      npcs.slice().sort((a, b) => (a.born || 0) - (b.born || 0)).slice(0, 20).forEach(n => {
        s += '<div class="cf-cal-line"><span class="cf-cal-time">' + n.born + '</span> · ' + escapeHtml(n.name) + '</div>';
      });
      s += '</div>';
    }
    return s;
  },
  updateCalendar() {
    const body = document.getElementById('cf-calendar-body');
    if (!body) return;
    const step = this.current();
    if (!step || !step.fields) return;
    let by = null;
    (step.fields || []).forEach(f => {
      const v = this.data[f.key];
      if (v && (f.key === 'birth_year' || f.key === 'birthYear' || f.label === '出生年份' || (typeof v === 'number' && v >= 1800 && v <= 2200))) by = v;
    });
    body.innerHTML = this.calendarBodyHtml(by);
  },

  renderSelect(step) {
    const key = step.key || step.id;
    const val = this.data[key];
    return (step.options || []).map(o => {
      const sel = val === o.id ? 'selected' : '';
      let tags = '';
      if (o.tags) {
        const p = (o.tags.pros || []).map(t => '<span class="pro">+ ' + escapeHtml(t) + '</span>').join('');
        const c = (o.tags.cons || []).map(t => '<span class="con">− ' + escapeHtml(t) + '</span>').join('');
        if (p || c) tags = '<div class="opt-tags">' + p + c + '</div>';
      }
      let ph = '';
      if (o.period && Array.isArray(o.period) && o.period.length === 2) ph = '<div class="opt-period">📅 ' + o.period[0] + ' - ' + o.period[1] + '</div>';
      let eh = '';
      if (o.events && o.events.length) eh = '<div class="opt-events">' + o.events.map(e => '· ' + escapeHtml(e)).join('<br>') + '</div>';
      let fh = '';
      if (o.figures && o.figures.length) fh = '<div class="opt-figures">活跃：' + o.figures.map(escapeHtml).join('、') + '</div>';
      return '<button class="cf-option ' + sel + '" onclick="CreateFlow.setField(' + jsAttr(key) + ', ' + jsAttr(o.id) + '); CreateFlow.render();">' +
        '<div class="opt-name">' + escapeHtml(o.name || o.label || o.id) + '</div>' +
        (o.desc ? '<div class="opt-desc">' + escapeHtml(o.desc) + '</div>' : '') +
        ph + eh + fh + tags + '</button>';
    }).join('');
  },
  renderSelectQuiz(step) {
    const key = step.key || step.id;
    const val = this.data[key];
    return (step.options || []).map(o => {
      const sel = val === o.id ? 'selected' : '';
      return '<button class="cf-quiz-card ' + sel + '" onclick="CreateFlow.setField(' + jsAttr(key) + ', ' + jsAttr(o.id) + '); CreateFlow.render();">' +
        '<div class="opt-name">' + escapeHtml(o.name || o.label || o.id) + '</div>' +
        (o.desc ? '<div class="opt-desc">' + escapeHtml(o.desc) + '</div>' : '') + '</button>';
    }).join('');
  },
  renderMultiSelect(step) {
    const key = step.key || step.id;
    const cur = this.data[key] || [];
    const min = step.min != null ? step.min : 0;
    const max = step.max != null ? step.max : 99;
    let html = '<div class="muted" style="margin-bottom:10px;">已选 ' + cur.length + ' / 最多 ' + max + (min ? ' · 至少 ' + min : '') + '</div>';
    html += (step.options || []).map(o => {
      const sel = cur.includes(o.id) ? 'selected' : '';
      return '<button class="cf-option ' + sel + '" onclick="CreateFlow.toggleMulti(' + jsAttr(key) + ', ' + jsAttr(o.id) + ', ' + min + ', ' + max + '); CreateFlow.render();">' +
        '<div class="opt-name">' + escapeHtml(o.name || o.label || o.id) + '</div>' +
        (o.desc ? '<div class="opt-desc">' + escapeHtml(o.desc) + '</div>' : '') + '</button>';
    }).join('');
    return html;
  },
  renderMultiSelectQuiz(step) {
    const key = step.key || step.id;
    const cur = this.data[key] || [];
    const min = step.min != null ? step.min : 0;
    const max = step.max != null ? step.max : 99;
    let html = '<div class="cf-quiz-hint" style="margin-bottom:14px;">已选 ' + cur.length + ' / 最多 ' + max + (min ? ' · 至少 ' + min : '') + '</div>';
    html += (step.options || []).map(o => {
      const sel = cur.includes(o.id) ? 'selected' : '';
      return '<button class="cf-quiz-card ' + sel + '" onclick="CreateFlow.toggleMulti(' + jsAttr(key) + ', ' + jsAttr(o.id) + ', ' + min + ', ' + max + '); CreateFlow.render();">' +
        '<div class="opt-name">' + escapeHtml(o.name || o.label || o.id) + '</div>' +
        (o.desc ? '<div class="opt-desc">' + escapeHtml(o.desc) + '</div>' : '') + '</button>';
    }).join('');
    return html;
  },
  // P67 开局问卷：答案存 this.data['__picks_' + quizId]（不落进 playerData），判卷由
  //   engine/creation_quiz.js 做——选项直指结论、平票取先声明者，纯确定性。
  quizDefs(step) {
    if (this._quizCache && this._quizCacheStep === step) return this._quizCache;
    const defs = (typeof CreationQuiz !== 'undefined' && CreationQuiz) ? CreationQuiz.normalize(step.quizzes) : [];
    this._quizCache = defs;
    this._quizCacheStep = step;
    return defs;
  },
  quizPicks(quizId) {
    const v = this.data['__picks_' + quizId];
    return Array.isArray(v) ? v : [];
  },
  pickQuizOption(quizId, qi, outcome) {
    const arr = this.quizPicks(quizId).slice();
    while (arr.length < qi) arr.push('');
    arr[qi] = outcome;
    this.data['__picks_' + quizId] = arr;
    this._saveDraft();
    this.render();
  },
  quizResults(step) {
    if (typeof CreationQuiz === 'undefined' || !CreationQuiz) return [];
    const defs = this.quizDefs(step);
    const picks = {};
    defs.forEach(q => { picks[q.id] = this.quizPicks(q.id); });
    return CreationQuiz.scoreAll(defs, picks);
  },

  // ===== P72·W5：都不像我 → 自己写 =====
  // 口径：本地词表先映射（确定、可解释、永远同一答案同一结论）；本地没把握才允许
  //   一次 AI 归类（8 秒超时）；两者都失败 ⇒ 这条不算作答（不投票、不影响结论）。
  //   原文一律留在 this.data['__custom_<qid>'] 里，摘要页/结果页要显示"我写了什么"。
  quizCustoms(quizId) {
    const v = this.data['__custom_' + quizId];
    return (v && typeof v === 'object') ? v : {};
  },
  async pickQuizCustom(quizId, qi) {
    const defs = this.quizDefs(this.current());
    const q = defs.filter(d => d.id === quizId)[0];
    if (!q) return;
    let text = null;
    try {
      text = await Platform.ui.promptAsync('都不像我？用你自己的话说一句',
        { placeholder: '例：我不太会说话，但答应的事一定做到', okText: '就这样', maxLength: 120 });
    } catch (e) { text = null; }
    if (text == null) return;
    const t = String(text).trim();
    if (!t) return;
    const bag = this.quizCustoms(quizId);
    bag[qi] = t;
    this.data['__custom_' + quizId] = bag;

    // ① 本地确定性映射（与手点选项等价）
    let outcome = null;
    if (typeof CreationQuiz !== 'undefined' && CreationQuiz && typeof CreationQuiz.mapCustom === 'function') {
      outcome = CreationQuiz.mapCustom(t, q.outcomes);
    }
    // ② 本地没命中才问 AI（问不到就当中性：不投票）
    if (!outcome) outcome = await this._classifyQuizCustomByAI(t, q);
    if (outcome) {
      const arr = this.quizPicks(quizId).slice();
      while (arr.length < qi) arr.push('');
      arr[qi] = outcome;
      this.data['__picks_' + quizId] = arr;
      Platform.ui.toast('按你的说法，这条算「' + (CreationQuiz.suggestLabel(t, q.outcomes) || outcome) + '」', { type: 'success' });
    } else {
      Platform.ui.toast('这句没有被识别成某个结论：不参与判卷（不影响结果）', { type: 'warn' });
    }
    this._saveDraft();
    this.render();
  },
  // 让 AI 只做「翻译」：把玩家的一句话翻译成作者声明的某个结论 id。
  // 返回值一定是 outcomes 里真实存在的 id 或 null —— 模型乱答/超时/没 Key 一律 null。
  async _classifyQuizCustomByAI(text, q) {
    try {
      if (typeof ApiClient === 'undefined' || !ApiClient || typeof ApiClient.chat !== 'function') return null;
      const outs = (q.outcomes || []).map(o => ({ id: o.id, name: o.name, desc: o.desc || '' }));
      if (!outs.length) return null;
      const sys = '你是「开局问卷」的归类器。玩家用一句话描述自己，你要判断这最接近下面哪一个结论。'
        + '只能从给定 id 里挑一个，不许发明。只输出一行 JSON：{"outcome":"<id>"}。\n'
        + '可选结论：\n' + outs.map(o => '- ' + o.id + '：' + o.name + (o.desc ? '（' + o.desc + '）' : '')).join('\n');
      const call = ApiClient.chat([
        { role: 'system', content: sys },
        { role: 'user', content: '玩家说：' + text }
      ], { temperature: 0, maxTokens: 60 });
      const timeout = new Promise(res => setTimeout(() => res(null), 8000));
      const resp = await Promise.race([call, timeout]);
      if (!resp) return null;
      let content = '';
      if (typeof resp === 'string') content = resp;
      else if (resp.content) content = resp.content;
      else if (resp.choices && resp.choices[0] && resp.choices[0].message) content = resp.choices[0].message.content;
      const m = String(content || '').match(/"outcome"\s*:\s*"([^"]+)"/);
      const id = m ? m[1] : '';
      return (outs.filter(o => o.id === id)[0]) ? id : null;
    } catch (e) { return null; }
  },
  renderQuizSet(step) {
    const defs = this.quizDefs(step);
    if (!defs.length) return '<p class="muted">（这份问卷没有可用题目：检查卡带 steps[].quizzes 的 outcomes / questions）</p>';
    const results = this.quizResults(step);
    const byId = {};
    results.forEach(r => { byId[r.quizId] = r; });
    let html = '';
    defs.forEach(q => {
      const picks = this.quizPicks(q.id);
      const res = byId[q.id];
      html += '<div class="cf-quiz-set">';
      html += '<div class="cf-quiz-set-title">' + escapeHtml(q.title) + '</div>';
      if (q.prompt) html += '<div class="cf-quiz-set-prompt">' + escapeHtml(q.prompt) + '</div>';
      q.questions.forEach((item, qi) => {
        html += '<div class="cf-quiz-q"><div class="cf-quiz-qtext">' + (qi + 1) + '. ' + escapeHtml(item.q) + '</div><div class="cf-quiz-opts">';
        item.opts.forEach(o => {
          const sel = picks[qi] === o.outcome ? ' selected' : '';
          html += '<button class="cf-option cf-quiz-opt' + sel + '" onclick="CreateFlow.pickQuizOption(' + jsAttr(q.id) + ',' + qi + ',' + jsAttr(o.outcome) + ')">' +
            '<div class="opt-name">' + escapeHtml(o.text) + '</div></button>';
        });
        // P72·W5：都不像我 → 自己写（写的话先本地映射，映射不上才问一次 AI）
        const customTxt = this.quizCustoms(q.id)[qi];
        html += '<button class="cf-option cf-quiz-opt cf-quiz-custom" onclick="CreateFlow.pickQuizCustom(' + jsAttr(q.id) + ',' + qi + ')">' +
          '<div class="opt-name">都不像我 → 自己写</div></button>';
        if (customTxt) {
          const sug = (typeof CreationQuiz !== 'undefined' && CreationQuiz && typeof CreationQuiz.suggestLabel === 'function')
            ? CreationQuiz.suggestLabel(customTxt, q.outcomes) : '';
          html += '<div class="cf-quiz-custom-note">你写的是：' + escapeHtml(customTxt) +
            (sug ? '（→ ' + escapeHtml(sug) + '）' : '（没识别成某个结论，不参与判卷）') + '</div>';
        }
        html += '</div></div>';
      });
      if (res && res.answered === res.total) {
        html += '<div class="cf-quiz-result"><span class="k">' + escapeHtml(res.resultName) + '：</span>' +
          '<span class="v">' + escapeHtml(res.name) + '</span>' +
          (res.desc ? '<div class="cf-quiz-result-desc">' + escapeHtml(res.desc) + '</div>' : '') + '</div>';
      } else if (res) {
        html += '<div class="cf-quiz-result muted">（还差 ' + (res.total - res.answered) + ' 题）</div>';
      }
      // 自写答案汇总（只说"你写了什么 → 被认成什么"，不参与算分）
      const customs = this.quizCustoms(q.id);
      const cKeys = Object.keys(customs);
      if (cKeys.length) {
        html += '<div class="cf-quiz-custom-sum">你自写的 ' + cKeys.length + ' 条：' +
          cKeys.map(k => {
            const txt = customs[k];
            const sug = (typeof CreationQuiz !== 'undefined' && CreationQuiz && typeof CreationQuiz.suggestLabel === 'function')
              ? CreationQuiz.suggestLabel(txt, q.outcomes) : '';
            return '<span class="cf-quiz-custom-item">' + escapeHtml(txt) + ' → ' + (sug ? escapeHtml(sug) : '未识别') + '</span>';
          }).join(' ') + '</div>';
      }
      html += '</div>';
    });
    return html;
  },
  renderSummary() {
    const lm = {}, om = {};
    (this.card.attributes || []).forEach(a => { lm['attr_' + a.key] = a.name || a.key; lm[a.key] = a.name || a.key; });
    (this.card.steps || []).forEach(step => {
      (step.fields || []).forEach(f => {
        lm[f.key] = f.label || f.key;
        if (f.type === 'choice') (f.options || []).forEach(o => { om[f.key + '.' + o.id] = o.label || o.name || o.id; });
      });
      const key = step.key || step.id;
      if (step.options) {
        if (!lm[key]) lm[key] = step.title || key;
        (step.options || []).forEach(o => { om[key + '.' + o.id] = o.name || o.label || o.id; });
      }
    });
    const quizLines = [];
    ((this.card && this.card.steps) || []).forEach(st => {
      if (!st || st.type !== 'quiz') return;
      this.quizResults(st).forEach(r => {
        if (r.answered !== r.total) return;
        quizLines.push('<div class="cf-summary-item"><span class="k">' + escapeHtml(r.resultName) + '</span><span class="v">' + escapeHtml(r.name) + '</span></div>');
      });
    });
    const entries = Object.keys(this.data).filter(k => k.indexOf('__') !== 0).map(k => {
      let v = this.data[k];
      const l = lm[k] || k;
      if (Array.isArray(v)) v = v.map(x => om[k + '.' + x] || x).join('、');
      else if (typeof v === 'string' && om[k + '.' + v]) v = om[k + '.' + v];
      return '<div class="cf-summary-item"><span class="k">' + escapeHtml(l) + '</span><span class="v">' + escapeHtml(String(v)) + '</span></div>';
    }).join('');
    const all = quizLines.join('') + entries;
    return all || '<p class="muted">（没有填写任何内容）</p>';
  },
  setField(k, v) { this.data[k] = v; this._saveDraft(); },
  toggleMulti(k, id, min, max) {
    let arr = this.data[k] || [];
    if (arr.includes(id)) arr = arr.filter(x => x !== id);
    else { if (arr.length >= max) { Platform.ui.toast('最多选 ' + max + ' 项', { type: 'warn' }); return; } arr = arr.concat([id]); }
    this.data[k] = arr;
    this._saveDraft();
  },
  async validateCurrent() {
    const step = this.current();
    if (step.type === 'form') {
      (step.fields || []).forEach(f => {
        if (f.type === 'number') {
          const v = this.data[f.key];
          if (typeof v === 'number' && !isNaN(v)) {
            let c = v;
            if (f.min != null && c < f.min) c = f.min;
            if (f.max != null && c > f.max) c = f.max;
            this.data[f.key] = c;
          }
        }
      });
      for (const f of (step.fields || [])) {
        if (f.required && (this.data[f.key] == null || this.data[f.key] === '')) { Platform.ui.toast('请填写：' + f.label, { type: 'warn' }); return false; }
      }
      const pool = this.getPool(step);
      if (pool && this.isAttrStep(step)) {
        const a = this.calcAllocated(step);
        if (a > pool.total) { Platform.ui.toast('属性点超出上限：已分配 ' + a + ' / ' + pool.total + '\n请减少一些属性', { type: 'warn' }); return false; }
        if (a < pool.total) {
          if (!await Platform.ui.confirmAsync('属性点还没用完（已分配 ' + a + ' / ' + pool.total + '），确定继续？')) return false;
        }
      }
    } else if (step.type === 'quiz') {
      const defs = this.quizDefs(step);
      let miss = 0;
      defs.forEach(q => {
        const picks = this.quizPicks(q.id);
        q.questions.forEach((item, qi) => { if (!picks[qi]) miss++; });
      });
      if (miss) { Platform.ui.toast('还有 ' + miss + ' 道题没选', { type: 'warn' }); return false; }
    } else if (step.type === 'select') {
      const k = step.key || step.id;
      if (!this.data[k]) { Platform.ui.toast('请选择一个选项', { type: 'warn' }); return false; }
    } else if (step.type === 'multi-select') {
      const k = step.key || step.id;
      const cur = this.data[k] || [];
      const min = step.min != null ? step.min : 0;
      if (cur.length < min) { Platform.ui.toast('至少选 ' + min + ' 项', { type: 'warn' }); return false; }
    }
    return true;
  },
  async next() {
    if (!await this.validateCurrent()) return;
    if (this.index === this.steps.length - 1) { this.finish(); return; }
    this.index++;
    while (this.index < this.steps.length && this.isSkipped(this.steps[this.index])) this.index++;
    if (this.index >= this.steps.length) { this.finish(); return; }
    this.render();
    this._saveDraft();
  },
  prev() { if (this.index === 0) return; this.index--; this.render(); this._saveDraft(); },
  async cancel() { if (await Platform.ui.confirmAsync('取消创建？\n（你的进度已保存，下次可以继续）')) Platform.ui.showHome(); },

  finish() {
    GameState.playerData = JSON.parse(JSON.stringify(this.data));
    // 问卷答案只是过程数据，不进存档
    Object.keys(GameState.playerData).forEach(k => { if (k.indexOf('__picks_') === 0) delete GameState.playerData[k]; });
    if (!GameState.playerData.inventory) GameState.playerData.inventory = { bar: [], common: [], story: [], rare: [] };
    if (typeof Alias !== 'undefined') Alias.normalize(GameState.playerData);
    // P67：问卷结论写进角色（quiz_<id> / __quiz / __quizFacts），并按 grants 叠加开局属性
    try {
      if (typeof CreationQuiz !== 'undefined' && CreationQuiz && this.card) {
        const qStep = (this.card.steps || []).filter(s => s && s.type === 'quiz')[0];
        if (qStep) {
          const defs = CreationQuiz.normalize(qStep.quizzes);
          const picks = {};
          defs.forEach(q => { picks[q.id] = this.quizPicks(q.id); });
          const results = CreationQuiz.scoreAll(defs, picks);
          if (results.length) {
            const bonus = CreationQuiz.apply(GameState.playerData, results);
            CreationQuiz.applyGrants(GameState.playerData, bonus, this.card.attributes);
            GameState.playerData.__quizFacts = CreationQuiz.facts(results);
          }
        }
      }
    } catch (e) {}

    let pname = Alias.get(GameState.playerData, 'name');
    if (pname && GameState.currentSaveId) Saves.setPlayerName(GameState.currentCardId, GameState.currentSaveId, String(pname));

    GameState._gameTime = GameState._buildInitialGameTime(this.card, GameState.playerData);
    this._clearDraft();
    GameState.persist();
    this._enterPortrait();
  }
};

if (typeof window !== 'undefined') {
  window.StoryLoop = StoryLoop;
  window.CreateFlow = CreateFlow;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StoryLoop;
  module.exports.CreateFlow = CreateFlow;
}
