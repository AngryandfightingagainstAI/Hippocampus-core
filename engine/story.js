// ============================================================
// 剧情层 · StoryLoop + CreateFlow
// v6：挂 NpcRuntime.onLocationChange（换场景时重排舞台）
// ============================================================

var _nodeStuckShown = false;

var StoryLoop = {
  busy: false, currentOptions: [],
  _regenContext: null,
  _lastPlayerLocation: '',

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

    GameState.chatHistory = [
      { role: 'system', content: PromptBuilder.buildStatic() + '\n' + PromptBuilder.buildSemiStatic() },
      { role: 'user', content: opening }
    ];
    Platform.ui.clearStory();
    Platform.ui.appendHint('（游戏开始）');
    await this.callAI();
  },

  async sendAction(t) {
    if (this.busy) return;
    const diceResult = this.tryParsePlayerDice(t);
    if (diceResult) {
      Platform.ui.appendHint('（你的选择：' + t + '）');
      GameState.chatHistory.push({ role: 'user', content: t });
      const fb = ToolExecutor.formatForHistory([diceResult]);
      if (fb) GameState.chatHistory.push({ role: 'user', content: fb });
      const uiLine = ToolExecutor.formatDiceForUI(diceResult);
      if (uiLine) Platform.ui.appendDiceResult(uiLine);
      if (typeof DiceHistory !== 'undefined') DiceHistory.record(diceResult);
      await this.callAI();
      return;
    }
    const searchResult = await this.tryParsePlayerSearch(t);
    if (searchResult) {
      Platform.ui.appendHint('（你的选择：' + t + '）');
      GameState.chatHistory.push({ role: 'user', content: t });
      const fb = ToolExecutor.formatForHistory([searchResult]);
      if (fb) GameState.chatHistory.push({ role: 'user', content: fb });
      await this.callAI();
      return;
    }
    // 普通输入分支：检测元层意图
    Platform.ui.appendHint('（你的选择：' + t + '）');
    var _intent = (typeof Proposals !== 'undefined' && Proposals.detectIntent)
      ? Proposals.detectIntent(t)
      : { isMeta: false, keywords: [] };
    var _content = t;
    if (_intent.isMeta) {
      _content = t + '\n\n【系统提示】玩家本轮说的是元层指令，不是剧情动作（关键词：' + _intent.keywords.join('、') + '）。\n这是指令，不是请求。必须调 propose_change({type, payload, reason}) 提议变更。\n不允许只在叙事里口头答应。不允许直接调 add_achievement 等原工具。';
      Platform.ui.appendHint('（检测到元层意图：' + _intent.keywords.join('、') + '）');
    }
    GameState.chatHistory.push({ role: 'user', content: _content });
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
        GameState.chatHistory[0].content = PromptBuilder.buildStatic() + '\n' + PromptBuilder.buildSemiStatic();
      }
      const g = Storage.getGlobal();
      const windowRounds = (g.logging && g.logging.windowRounds) || 10;
      let toSend = this.applyWindow(GameState.chatHistory, windowRounds);

      let hasRealUser = toSend.some(function(m) {
        return m && m.role === 'user' && !String(m.content || '').startsWith('【系统 ·');
      });
      if (!hasRealUser) {
        toSend = toSend.concat([{ role: 'user', content: '请继续游戏。' }]);
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
      }

      // ★ 把 dynamic 内容拼接到最后一条 user message 前面
      //    不新增 system message，兼容所有 API（包括严格 chat_template）
      //    前面的 static+semiStatic + 历史消息全都不变，仍能吃前缀缓存
      var __dynamic = PromptBuilder.buildDynamic();
      if (toSend.length > 0 && toSend[toSend.length - 1].role === 'user') {
        var __lastUserMsg = toSend[toSend.length - 1];
        toSend[toSend.length - 1] = {
          role: 'user',
          content: '【系统状态快照 · 供参考，非玩家输入】\n' + __dynamic + '\n\n【玩家输入】\n' + __lastUserMsg.content
        };
      } else {
        toSend.push({
          role: 'user',
          content: '【系统状态快照 · 供参考，非玩家输入】\n' + __dynamic + '\n\n请根据以上状态继续推进剧情。'
        });
      }

      try { PromptBuilder.updateEstimate(toSend.map(function(m){return m.content || '';}).join('\n')); } catch (e) {}

      // P5 · S6-5：主调用显式带上当前配置的 max_tokens，不再吃 ApiClient 的 2048 兜底。
      // 思考模型的 reasoning_content 与正文共用同一个 completion 预算，
      // 故需用 profile.max_tokens（默认已抬到 16384），思考链才不会挤掉正文。
      var __activeProfile = (typeof ApiManager !== 'undefined' && ApiManager.getActive) ? ApiManager.getActive() : null;
      var __chatOpts = (__activeProfile && __activeProfile.max_tokens != null) ? { max_tokens: __activeProfile.max_tokens } : {};
      const content = await ApiClient.chat(toSend, __chatOpts);
      if (myToken !== GameState._sessionToken) return;

      const reasoning = GameState._lastReasoning || '';
      const usage = GameState._lastUsage || null;

      GameState.chatHistory.push({ role: 'assistant', content: content });
      const assistantMsgRef = GameState.chatHistory[GameState.chatHistory.length - 1];

      let toolResults = [];
      try {
        const toolsRaw = ToolExecutor.extract(content);
        toolResults = await ToolExecutor.executeAll(toolsRaw);
        if (toolResults.length) {
          toolResults.forEach(r => { if (r.ok && r.segmentCrossed) GameState._pendingSystemNotices.push('玩家 ' + r.label + ' 进入新状态：' + r.segmentCrossed.text); });
          const fb = ToolExecutor.formatForHistory(toolResults);
          if (fb) GameState.chatHistory.push({ role: 'user', content: fb });
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
          lastAssistant.meta = { reasoning: reasoning, searches: searches, usage: usage, ts: Date.now() };
        }

        const clean = ToolExecutor.strip(content);
        this.parseAndRender(clean, toolResults);
      toolResults.forEach(function(r) {
        if (r && r.ok && r.type === 'proposal' && r.action === 'create' && r.proposalId) {
          try { Platform.ui.appendProposalCard(r.proposalId); } catch (e) { console.warn('[ProposalCard]', e); }
        }
      });
      // 输出后置校验：检测 AI 正文提到的状态变化，但没调对应工具
      try {
        if (typeof WordFamilies !== 'undefined' && WordFamilies.checkMissing) {
          var __missing = WordFamilies.checkMissing(clean, toolResults);
          if (__missing.length > 0) {
            __missing.forEach(function(m) {
              GameState._pendingSystemNotices.push(
                'AI 上一轮正文提到了「' + m.label + '」（' + m.words.join('、') +
                '），但没有调用 ' + m.tool + '。如果剧情确实发生了这个变化，请补调工具。'
              );
            });
            Platform.ui.appendHint('（检测到可能的漏账：' + __missing.map(function(m) { return m.label; }).join('、') + '）');
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
              var _promises = _pendings.map(function(p) { return NpcDeductionAI.run(p.id); });
              Promise.all(_promises).then(function(_results) {
                var _okCount = 0;
                _results.forEach(function(r) {
                  if (r && r.ok && !r.rejected) _okCount++;
                });
                if (_okCount > 0) {
                  Platform.ui.appendHint('（' + _okCount + ' 位 NPC 好像知道了什么，去人物面板看看原因）');
                }
              }).catch(function(e) { console.warn('[NpcDeductionAI] 推演 Promise 失败：', e); });
            }
          }
        }
      } catch (_e) { console.warn('[NpcDeductionAI] 触发异常：', _e); }
        Platform.ui.updateTokenBadge();
        await this.maybeCompress();
      } catch (renderErr) {
        try {
          const idx = GameState.chatHistory.indexOf(assistantMsgRef);
          if (idx >= 0) GameState.chatHistory.splice(idx);
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
            if (evFb) GameState.chatHistory.push({ role: 'user', content: evFb });
          }
        } catch (e) { console.warn('[Events] tick 失败：', e); }
      }
      if (typeof Tasks !== 'undefined') {
        try {
          var taskResult = Tasks.tick();
          if (taskResult && taskResult.completed && taskResult.completed.length) {
            var taskFb = Tasks.formatForHistory(taskResult.completed);
            if (taskFb) GameState.chatHistory.push({ role: 'user', content: taskFb });
          }
        } catch (e) { console.warn('[Tasks] tick 失败：', e); }
      }
      if (typeof Achievements !== 'undefined') {
        try {
          var achResult = Achievements.tick();
          if (achResult && achResult.unlocked && achResult.unlocked.length) {
            var achFb = Achievements.formatForHistory(achResult.unlocked);
            if (achFb) GameState.chatHistory.push({ role: 'user', content: achFb });
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
    let userCount = 0, cutIndex = 0;
    for (let i = rest.length - 1; i >= 0; i--) {
      if (isRealUserMsg(rest[i])) { userCount++; if (userCount >= rounds) { cutIndex = i; break; } }
    }
    return [system].concat(rest.slice(cutIndex)).map(function(m) {
      return { role: m.role, content: m.content };
    });
  },

  async maybeCompress() {
    if (typeof Logger === 'undefined') return;
    if (!GameState.currentCardId || !GameState.currentSaveId) return;
    const g = Storage.getGlobal();
    const lg = g.logging || {};
    if (lg.enabled === false) return;

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

    Platform.ui.appendHint('（正在生成日志…）');

    const windowRounds = lg.windowRounds || 10;
    const keepCount = windowRounds * 2;
    const rest = GameState.chatHistory.slice(1);
    const toCompress = rest.slice(0, Math.max(0, rest.length - keepCount));
    if (toCompress.length < 4) return;

    // ★ P4：本批第一条消息的轮次号（定义与 Snapshots._currentRound 同源：
    //   当前 chatHistory 中真实玩家发言的累计条数），一并写进日志供按轮次回退。
    const isRealUserMsg = (m) => !!m && m.role === 'user' && !String(m.content || '').startsWith('【系统 ·');
    let batchMsgFrom = 0;
    for (let i = 0; i < GameState.chatHistory.length && i <= 1; i++) {
      if (isRealUserMsg(GameState.chatHistory[i])) batchMsgFrom++;
    }

    const logData = await Logger.compress({
        cardId: GameState.currentCardId,
        saveId: GameState.currentSaveId,
        gameDate: GameState._gameTime,
        startGameDate: GameState._lastCompressGameTime || null,
        msgFrom: batchMsgFrom,
        messages: toCompress
      });
    if (!logData) { Platform.ui.appendHint('（日志生成失败，保留原文）'); return; }

    GameState.chatHistory = [GameState.chatHistory[0]].concat(rest.slice(rest.length - keepCount));
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

    const bodyRe = /(?:【正文】|【故事】|正文[:：]|\[正文\])([\s\S]*?)(?=(?:【时间】|【选项】|【选项列表】|选项[:：]|\[选项\]|$))/;
    const optRe = /(?:【选项】|【选项列表】|选项[:：]|\[选项\])([\s\S]*)$/;
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
      case 'summary': html += this.renderSummary(); break;
      default: html += '<p>（未知步骤类型：' + escapeHtml(step.type) + '）</p>';
    }
    return html;
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
      const fallback = (f.default != null) ? f.default : (isAttr && f.min != null ? f.min : '');
      // 同步 fallback 到 this.data：用户没动过输入框时，data 里也应该是 fallback 的值
      if ((this.data[f.key] == null) && fallback !== '' && fallback != null) {
        this.data[f.key] = fallback;
      }
      const val = this.data[f.key] != null ? this.data[f.key] : fallback;
      const req = f.required ? '<span class="req"> *</span>' : '';
      let input = '';
      if (f.type === 'text') {
        input = '<input id="' + id + '" type="text" value="' + escapeAttr(val) + '" placeholder="' + escapeAttr(f.placeholder || '') + '" oninput="CreateFlow.onTextInput(\'' + f.key + '\', this.value, false)">';
      } else if (f.type === 'number') {
        const minAttr = f.min != null ? 'min="' + f.min + '"' : '';
        const maxAttr = f.max != null ? 'max="' + f.max + '"' : '';
        const minJs = f.min != null ? f.min : 'null';
        const maxJs = f.max != null ? f.max : 'null';
        input = '<input id="' + id + '" type="number" ' + minAttr + ' ' + maxAttr + ' value="' + escapeAttr(val) + '" ' +
          'oninput="CreateFlow.onNumberInput(\'' + f.key + '\', this, ' + minJs + ', ' + maxJs + ', ' + (isAttr ? 'true' : 'false') + ')" ' +
          'onblur="CreateFlow.onNumberBlur(\'' + f.key + '\', this, ' + minJs + ', ' + maxJs + ', ' + (isAttr ? 'true' : 'false') + ')">';
      } else if (f.type === 'choice') {
        input = '<div>';
        (f.options || []).forEach(o => {
          const sel = val === o.id ? 'selected' : '';
          input += '<button class="cf-option ' + sel + '" onclick="CreateFlow.setField(\'' + f.key + '\', \'' + escapeAttr(o.id) + '\'); CreateFlow.render();">' +
            '<div class="opt-name">' + escapeHtml(o.label || o.name || o.id) + '</div></button>';
        });
        input += '</div>';
      } else {
        input = '<input id="' + id + '" type="text" value="' + escapeAttr(val) + '" oninput="CreateFlow.onTextInput(\'' + f.key + '\', this.value, false)">';
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
      return '<button class="cf-option ' + sel + '" onclick="CreateFlow.setField(\'' + key + '\', \'' + escapeAttr(o.id) + '\'); CreateFlow.render();">' +
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
      return '<button class="cf-quiz-card ' + sel + '" onclick="CreateFlow.setField(\'' + key + '\', \'' + escapeAttr(o.id) + '\'); CreateFlow.render();">' +
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
      return '<button class="cf-option ' + sel + '" onclick="CreateFlow.toggleMulti(\'' + key + '\', \'' + escapeAttr(o.id) + '\', ' + min + ', ' + max + '); CreateFlow.render();">' +
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
      return '<button class="cf-quiz-card ' + sel + '" onclick="CreateFlow.toggleMulti(\'' + key + '\', \'' + escapeAttr(o.id) + '\', ' + min + ', ' + max + '); CreateFlow.render();">' +
        '<div class="opt-name">' + escapeHtml(o.name || o.label || o.id) + '</div>' +
        (o.desc ? '<div class="opt-desc">' + escapeHtml(o.desc) + '</div>' : '') + '</button>';
    }).join('');
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
    const entries = Object.keys(this.data).map(k => {
      let v = this.data[k];
      const l = lm[k] || k;
      if (Array.isArray(v)) v = v.map(x => om[k + '.' + x] || x).join('、');
      else if (typeof v === 'string' && om[k + '.' + v]) v = om[k + '.' + v];
      return '<div class="cf-summary-item"><span class="k">' + escapeHtml(l) + '</span><span class="v">' + escapeHtml(String(v)) + '</span></div>';
    }).join('');
    return entries || '<p class="muted">（没有填写任何内容）</p>';
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
    if (!GameState.playerData.inventory) GameState.playerData.inventory = { bar: [], common: [], story: [], rare: [] };
    if (typeof Alias !== 'undefined') Alias.normalize(GameState.playerData);

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
