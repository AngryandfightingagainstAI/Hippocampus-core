// ============================================================
// 人设审核 / 生成（两阶段流程）+ 共创讨论（P71）
// 阶段 1：AI 审核人设在世界观中的合理性 → 输出 verdict + issues
// 阶段 2：审核通过后，AI 生成 summary + traits
// 数据存：/saves/{cardId}/{saveId}/portrait.json（瘦身，只存人设）
//        /saves/{cardId}/{saveId}/portrait_chat.json（聊天 + 撤回，不进 playerData）
// 也同步一份到 playerData.portrait 供 prompt 注入
// ============================================================

(function() {
  // 数值规则唯一实现（engine/core/stat_rules.js）：桌面由 index.html 先加载，RN 走 require。
  // 属性键一律经 StatRules 归一，禁止在调用点手拼 'attr_' + key（阶段 A 修的就是这个）。
  function _sr() {
    if (typeof StatRules !== 'undefined' && StatRules && typeof StatRules.remaining === 'function') return StatRules;
    if (typeof require === 'function') {
      try {
        var m = require('./core/stat_rules.js');
        if (m && typeof m.remaining === 'function') return m;
      } catch (e) {}
    }
    return null;
  }

  var Portrait = {
    _path: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/portrait.json';
    },

    // 聊天 + 撤回独立文件（不进 playerData、不进快照、不进 prompt）
    _chatPath: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/portrait_chat.json';
    },

    // 从存档读取（老档缺失字段归一为 []，调用方无需再写 || []）
    load: function() {
      var p = this._path();
      if (!p) return null;
      var raw = VFS.readJSON(p) || null;
      if (!raw) return null;
      if (!Array.isArray(raw.traits)) raw.traits = [];
      // chat/undo 不存于此文件，但为防老档残留，归一为空（绝不返回真实聊天数据）
      if (!Array.isArray(raw.chat)) raw.chat = [];
      if (!Array.isArray(raw.chatArchive)) raw.chatArchive = [];
      if (!Array.isArray(raw.undo)) raw.undo = [];
      return raw;
    },

    // 写入存档（瘦身：剔除 chat/chatArchive/undo，防快照背聊天记录）
    save: function(portrait) {
      var p = this._path();
      if (!p) return false;
      var slim = {};
      Object.keys(portrait || {}).forEach(function(k) {
        if (k === 'chat' || k === 'chatArchive' || k === 'undo') return;
        slim[k] = portrait[k];
      });
      VFS.writeJSON(p, slim);
      if (GameState.playerData) {
        GameState.playerData.portrait = slim;
      }
      return true;
    },

    // 专读专写聊天 + 撤回独立文件（不进 playerData）
    loadChat: function() {
      var p = this._chatPath();
      if (!p) return { chat: [], chatArchive: [], undo: [] };
      var raw = VFS.readJSON(p) || null;
      if (!raw) return { chat: [], chatArchive: [], undo: [] };
      if (!Array.isArray(raw.chat)) raw.chat = [];
      if (!Array.isArray(raw.chatArchive)) raw.chatArchive = [];
      if (!Array.isArray(raw.undo)) raw.undo = [];
      return raw;
    },

    saveChat: function(doc) {
      var p = this._chatPath();
      if (!p) return false;
      var clean = {
        chat: Array.isArray(doc.chat) ? doc.chat : [],
        chatArchive: Array.isArray(doc.chatArchive) ? doc.chatArchive : [],
        undo: Array.isArray(doc.undo) ? doc.undo : []
      };
      VFS.writeJSON(p, clean);
      return true;
    },

    // ============================================================
    // 动作一·讨论：buildDiscussPrompt（system + 玩家原始填写 + 聊天历史）
    // 正常回复自然语言，绝不输出 JSON、绝不写盘
    // ============================================================
    buildDiscussPrompt: function(playerData, chat) {
      var card = GameState.currentCard;
      var lines = [];
      lines.push('你是这个角色的创作搭档，不是审核员。');
      lines.push('');
      lines.push('硬规则：');
      lines.push('1. 正常回复用自然语言，不要输出 JSON、不要重写整份人设、不要要求玩家确认最终版。');
      lines.push('2. 可以提问、指出矛盾、给 2-3 个具体可选方向，一次最多问 1-2 个问题。');
      lines.push('3. 玩家说"整理/写进去/保存"时，不要自己写，只回一句"好，我来整理（点『整理成人设』）"。');
      lines.push('');
      lines.push('【游戏背景】');
      lines.push('标题：' + ((card && card.game && card.game.title) || ''));
      if (card && card.game && card.game.background) lines.push('背景：' + card.game.background);
      if (card && card.worldbook && card.worldbook.worldSetting) {
        var ws = card.worldbook.worldSetting;
        if (ws.description) lines.push('世界设定：' + ws.description);
      }
      lines.push('');
      lines.push('【玩家原始填写】');
      Object.keys(playerData || {}).forEach(function(k) {
        if (k === 'inventory' || k === 'portrait') return;
        var v = playerData[k];
        if (v == null || v === '') return;
        lines.push('  ' + k + '：' + (typeof v === 'object' ? JSON.stringify(v) : String(v)));
      });
      // 当前属性与剩余点数（一行，让 AI 少提不可行方案）
      var attrLine = this._attributeStatusLine(playerData);
      if (attrLine) {
        lines.push('');
        lines.push('【属性】' + attrLine);
      }
      lines.push('');
      // 讨论历史由 PortraitChat.buildMessages() 以真实 messages 传递，不在此重复拼接
      lines.push('请基于以上背景，继续与玩家共创这个角色。');
      return lines.join('\n');
    },

    // ============================================================
    // 动作三·整理：buildExtractPrompt → 输出 patch
    // ============================================================
    buildExtractPrompt: function(playerData, chat) {
      var card = GameState.currentCard;
      var lines = [];
      lines.push('你是角色人设整理助手。根据玩家的原始填写和讨论历史，把讨论结果整理成字段级 patch。');
      lines.push('');
      lines.push('输出格式（只输出 JSON，不要解释、不要 markdown 代码块）：');
      lines.push('{');
      lines.push('  "patch": {');
      lines.push('    "playerData": { "字段名": "新值" },');
      lines.push('    "portrait": { "summary": "...", "traits": ["..."] },');
      lines.push('    "attributes": { "attr_str": 12 }');
      lines.push('  },');
      lines.push('  "note": "一句说明改了什么、为什么"');
      lines.push('}');
      lines.push('');
      lines.push('硬规则：');
      lines.push('1. patch 里只列讨论中明确要改的字段，没提到的不要列。');
      lines.push('2. playerData 只改卡带声明过的字段；attributes 只能是卡带声明的属性键。');
      lines.push('3. 数值要合理，不要超出该项的最小/最大值。');
      lines.push('   （创角点数池只约束开局那一次分配，此时已经定下的属性可以按人设需要调整；超出池上限照样会写入，但要在 note 里写清为什么这样改。）');
      lines.push('4. 没有要改的内容时，patch 设为 {}，note 写"无需改动"。');
      lines.push('');
      lines.push('【游戏背景】');
      lines.push('标题：' + ((card && card.game && card.game.title) || ''));
      if (card && card.game && card.game.background) lines.push('背景：' + card.game.background);
      lines.push('');
      lines.push('【玩家原始填写】');
      Object.keys(playerData || {}).forEach(function(k) {
        if (k === 'inventory' || k === 'portrait') return;
        var v = playerData[k];
        if (v == null || v === '') return;
        lines.push('  ' + k + '：' + (typeof v === 'object' ? JSON.stringify(v) : String(v)));
      });
      var attrLine = this._attributeStatusLine(playerData);
      if (attrLine) {
        lines.push('');
        lines.push('【属性】' + attrLine);
      }
      // 阶段 1b：把天命锁写进提示词，模型先知道规则再动手，从源头减少无效 patch
      var lock = this._destinyLock(playerData);
      if (lock) {
        var lockNames = {};
        (card && card.attributes || []).forEach(function(a) {
          if (a && a.key) lockNames['attr_' + a.key] = a.name || a.key;
        });
        var lockLines = [];
        Object.keys(lock.values || {}).forEach(function(k) {
          var bare = (k.indexOf('attr_') === 0) ? k.slice(5) : k;
          lockLines.push((lockNames['attr_' + bare] || lockNames[k] || bare) + '=' + lock.values[k]);
        });
        if (lockLines.length) {
          lines.push('');
          lines.push('【天命锁】（规则层约束，不可协商）');
          lines.push('以下属性由开局天命固定：' + lockLines.join('、') + '。');
          lines.push('attributes 里不要包含这些键，写了也会被引擎丢掉（其余属性、人设字段照常写入）；玩家若要换这组数值，只能回开局界面重掷天命。');
          lines.push('其他属性、技能、物品、人设字段不受影响，正常整理即可。');
        }
      }
      lines.push('');
      lines.push('【讨论历史】');
      (chat || []).forEach(function(m) {
        lines.push((m.role === 'user' ? '玩家' : '你') + '：' + m.content);
      });
      return lines.join('\n');
    },

    parseExtractResponse: function(text) {
      if (!text) return null;
      var s = String(text).trim();
      var m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) s = m[1].trim();
      var ob = (typeof CardDiagnose !== 'undefined' && CardDiagnose.firstJsonObject) ? CardDiagnose.firstJsonObject(s) : null;
      if (ob) s = ob;
      try {
        var p = JSON.parse(s);
        if (!p || typeof p !== 'object') return null;
        var patch = p.patch && typeof p.patch === 'object' ? p.patch : {};
        return {
          patch: {
            playerData: (patch.playerData && typeof patch.playerData === 'object') ? patch.playerData : {},
            portrait: (patch.portrait && typeof patch.portrait === 'object') ? patch.portrait : {},
            attributes: (patch.attributes && typeof patch.attributes === 'object') ? patch.attributes : {}
          },
          note: String(p.note || '')
        };
      } catch (e) {
        return null;
      }
    },

    // ============================================================
    // 动作三·patch 合并 + 属性校验 + 撤回记录
    // ============================================================

    // 收集卡带声明过的 playerData 键（steps[].fields[].key + attributes[].key 派生）
    _allowedPlayerDataKeys: function(card) {
      var keys = {};
      (card && card.steps || []).forEach(function(step) {
        (step.fields || []).forEach(function(f) {
          if (f && f.key) keys[String(f.key)] = true;
        });
      });
      (card && card.attributes || []).forEach(function(a) {
        if (a && a.key) {
          keys[String(a.key)] = true;
          keys['attr_' + a.key] = true;
        }
      });
      return keys;
    },

    // 属性元信息：裸键与规范键都指向同一份 { min, max, name }（由 stat_rules 统一）
    _attributeMeta: function(card) {
      var meta = {};
      var SR = _sr();
      if (!SR) return meta;
      SR.defs(card, null).forEach(function(d) {
        var m = { min: d.min, max: d.max, name: d.name };
        meta[d.key] = m;
        meta[d.bare] = m;
      });
      return meta;
    },

    // 一行属性状态：力量 5/20 敏捷 8/20 · 剩余点数 5
    // 阶段 A 补充：显示也走 stat_rules（历史 attr_attr_str 归一后不再显示 init 兜底值）。
    _attributeStatusLine: function(playerData) {
      var card = GameState.currentCard;
      var SR = _sr();
      var defs = SR ? SR.defs(card, null) : [];
      if (!SR) {
        if (!card || !card.attributes || !card.attributes.length) return '';
        defs = card.attributes.map(function(a) {
          return { key: 'attr_' + String(a.key).replace(/^attr_/, ''), bare: String(a.key).replace(/^attr_/, ''), name: a.name, min: a.min, max: a.max, init: a.init };
        });
      }
      if (!defs.length) return '';
      var parts = [];
      defs.forEach(function(d) {
        var v = SR ? SR.valueOf(playerData, d.key) : playerData[d.key];
        if (v == null) v = d.init != null ? d.init : 0;
        parts.push((d.name || d.bare) + ' ' + v + '/' + (d.max != null ? d.max : '?'));
      });
      var remaining = this._remainingPoints(playerData);
      if (remaining != null) parts.push('剩余点数 ' + remaining);
      var dAlloc = this._destinyAlloc(playerData);
      if (dAlloc > 0) parts.push('天命已占 ' + dAlloc + ' 点（不计入池）');
      return parts.join(' ');
    },

    // 2026-10-23 P76·B（用户选 B）：创角点数池只约束「创角分配」，天命掷出来的值不计入池。
    //   旧算法把锁定属性也算进占用，CoC 一类 3d6*5 掷出 200+ 而 pool.total 只有 30 时，
    //   AI 在 prompt 里看到的「剩余点数」永远是 0（_attributeStatusLine），于是它反复提
    //   不可行的属性方案、反复被拒 —— 用户看到的「一直超点数」其实是这个死循环。
    _remainingPoints: function(playerData) {
      var SR = _sr();
      if (!SR) return null;
      return SR.remaining(GameState.currentCard, playerData);
    },

    // 天命锁定属性的裸键集合 { str: true, ... }（展示/兼容用；内部判定用规范键）
    _destinyLockedBare: function(playerData) {
      var set = {};
      var SR = _sr();
      if (!SR) return set;
      var locked = SR.lockedValues(playerData);
      Object.keys(locked).forEach(function(k) { set[SR.bare(k)] = true; });
      return set;
    },

    // 天命锁定属性占用的点数（只用于展示「天命已占 N 点」，不进池计算）
    _destinyAlloc: function(playerData) {
      var SR = _sr();
      if (!SR) return 0;
      return SR.destinyAllocated(GameState.currentCard, playerData);
    },

    // 阶段 1b：天命锁。
    // 开局选天命时把已掷定值写进 playerData._destiny = {locked, values:{attr_x:n}, label}。
    // 之后审核阶段任何对锁定属性的改动都要给出「规则级」拒绝（code=DESTINY_LOCKED），
    // 让 UI 能把原因回灌给 AI，而不是让模型反复试、反复拿到同一句“属性点不够”。
    _destinyLock: function(playerData) {
      var d = playerData && playerData._destiny;
      if (!d || !d.locked) return null;
      return d;
    },

    _destinyLockedKeys: function(playerData) {
      var SR = _sr();
      if (!SR) return [];
      return Object.keys(SR.lockedValues(playerData));
    },

    // 校验属性 patch：归一 → clamp → 天命锁 → 池占用统计（P76·B：只统计不拒绝）
    // 键一律经 stat_rules 归一为 attr_<key>（裸 x / attr_x / 历史 attr_attr_x 等价）
    // 返回 { ok, clamped, warnings, error, code, lockedKeys, poolOver }
    //   poolOver = { total, before, after, need, remaining } | null
    validateAttributes: function(attrPatch, playerData) {
      var card = GameState.currentCard;
      var SR = _sr();
      if (!SR) {
        return { ok: true, clamped: {}, warnings: ['数值规则模块未加载（stat_rules.js），已跳过属性校验'], poolOver: null };
      }
      var defs = SR.defs(card, null);
      var norm = SR.normalizePatch(attrPatch, defs);
      var clamped = norm.values;
      var warnings = norm.warnings.slice();

      // 天命锁：锁定属性不允许任何改动（含下调），先于池校验给出可解释的拒绝
      var violations = SR.lockViolations(clamped, playerData);
      if (violations.length) {
        var names = {};
        defs.forEach(function(d) { names[d.key] = d.name; });
        var lockedKeys = violations.map(function(v) { return v.key; });
        var parts = violations.map(function(v) {
          return (names[v.key] || SR.bare(v.key)) + '（' + v.before + '）';
        });
        return {
          ok: false,
          code: 'DESTINY_LOCKED',
          lockedKeys: lockedKeys,
          clamped: clamped,
          error: '天命锁：' + parts.join('、') + ' 已由天命固定，审核阶段不能修改。'
            + '想换这组数值只能回开局界面「重掷天命」；其余属性、技能、物品、人设字段仍可照常调整。'
        };
      }

      // 2026-10-23 P76·B（用户选 B）：池只约束创角分配，人设/剧情阶段的属性成长不再被池拒绝，
      //   改为回传 poolOver（超了多少点），由调用方提示玩家并照常落盘 —— 用户原话「我不介意超标，
      //   但我要知道超了什么」。天命锁定项不计入池（与 _remainingPoints 同一口径）。
      //   单值 min/max 仍然硬 clamp（上面已做），这是数值合法性的底线。
      var poolOver = null;
      var pool = SR.poolOf(card, null);
      if (pool && pool.total != null) {
        var locked = SR.lockedValues(playerData);
        var before = SR.allocated(defs, playerData, pool.base, { excludeLocked: true, locked: locked });
        var after = SR.allocated(defs, playerData, pool.base, { excludeLocked: true, locked: locked, override: clamped });
        if (after > pool.total) {
          poolOver = {
            total: pool.total,
            before: before,
            after: after,
            need: after - pool.total,
            remaining: Math.max(0, pool.total - before)
          };
          warnings.push('属性点超出创角池 ' + poolOver.need + ' 点（已分配 ' + after + ' / 上限 ' + pool.total + '），已照常写入');
        }
      }

      return { ok: true, clamped: clamped, warnings: warnings, poolOver: poolOver };
    },

    // 合并 patch 到 playerData + portrait，只覆盖 patch 里出现的键
    // 属性键归一为 attr_<key>，迁移历史裸键；before/after 记归一后键
    // 返回 { ok, before, after, label, error, attrWarnings, attrRejected, attrPoolOver }；失败时 ok=false 且不写任何字段
    //   attrPoolOver：P76·B 起超创角池不再拒写，只回传占用情况让 UI 提示/确认
    mergePatch: function(patch, playerData) {
      var card = GameState.currentCard;
      var allowed = this._allowedPlayerDataKeys(card);
      var forbidden = { inventory: true, portrait: true, _openingPrompt: true };

      var pdPatch = (patch && patch.playerData) ? patch.playerData : {};
      var ptPatch = (patch && patch.portrait) ? patch.portrait : {};
      var attrPatch = (patch && patch.attributes) ? patch.attributes : {};

      // 1. playerData 键合法性
      var pdKeys = Object.keys(pdPatch);
      for (var i = 0; i < pdKeys.length; i++) {
        var k = pdKeys[i];
        if (forbidden[k] || k.indexOf('__') === 0) {
          return { ok: false, error: '字段 ' + k + ' 不允许修改' };
        }
        if (!allowed[k]) {
          return { ok: false, error: '字段 ' + k + ' 不在卡带声明里，已拒绝' };
        }
      }

      // 2. 属性 clamp + 天命锁 + 池占用统计（P76·B：池只提示不阻断）
      // 2026-10-23 P0：天命锁命中的属性不再连累整包——人设字段与其它属性照常落地，
      // 只把锁定的键摘掉、把原因作为 attrRejected 回传。
      // 2026-10-23 P76·B：超创角池不再「一条都不写」，属性照常落地，占用情况作为
      // attrPoolOver 回传，由 UI 先问玩家再采纳（见 ui_portrait.js extract）。
      var attrResult = this.validateAttributes(attrPatch, playerData);
      var attrRejected = null;
      if (!attrResult.ok) {
        // 现在只有 DESTINY_LOCKED 会走到这里（池超限已改成 warning + poolOver）
        // 天命锁：把锁定键从 patch 里摘掉，剩下的属性继续走正常校验
        var lockedMap = {};
        (attrResult.lockedKeys || []).forEach(function(k) { lockedMap[k] = true; lockedMap[k.replace(/^attr_/, '')] = true; });
        var restPatch = {};
        Object.keys(attrPatch || {}).forEach(function(k) {
          var nk = k.indexOf('attr_') === 0 ? k : ('attr_' + k);
          if (!lockedMap[nk]) restPatch[k] = attrPatch[k];
        });
        var retry = this.validateAttributes(restPatch, playerData);
        attrRejected = {
          code: 'DESTINY_LOCKED',
          lockedKeys: attrResult.lockedKeys || [],
          error: attrResult.error,
          appliedAttr: retry.ok
        };
        if (retry.ok) {
          attrResult = retry;
        } else {
          attrResult = { ok: true, clamped: {}, warnings: (attrResult.warnings || []).concat(retry.warnings || []), poolOver: null };
          attrRejected.appliedAttr = false;
        }
      }
      var attrPoolOver = attrResult.poolOver || null;
      var normAttrKeys = Object.keys(attrResult.clamped || {});

      // 3. 构造 before / after（只记被改的键，属性用归一后键）
      var beforePd = {}, afterPd = {};
      pdKeys.forEach(function(k) {
        beforePd[k] = playerData[k];
        afterPd[k] = pdPatch[k];
      });
      normAttrKeys.forEach(function(nk) {
        var bare = nk.indexOf('attr_') === 0 ? nk.slice(5) : nk;
        // before 取有效值（attr_ 优先，裸键兜底）
        var bv = (playerData[nk] != null) ? playerData[nk] : playerData[bare];
        beforePd[nk] = bv;
        afterPd[nk] = attrResult.clamped[nk];
      });

      var beforePt = {}, afterPt = {};
      Object.keys(ptPatch).forEach(function(k) {
        var cur = (GameState.playerData && GameState.playerData.portrait) ? GameState.playerData.portrait[k] : undefined;
        beforePt[k] = cur;
        afterPt[k] = ptPatch[k];
      });

      var before = { playerData: beforePd, portrait: beforePt };
      var after = { playerData: afterPd, portrait: afterPt };

      // 4. 应用到运行时
      pdKeys.forEach(function(k) { playerData[k] = pdPatch[k]; });
      // 属性：迁移裸键 → 写归一键 → 删裸键
      normAttrKeys.forEach(function(nk) {
        var bare = nk.indexOf('attr_') === 0 ? nk.slice(5) : nk;
        if (playerData[bare] != null && playerData[nk] == null) {
          playerData[nk] = playerData[bare];
        }
        delete playerData[bare];
        playerData[nk] = attrResult.clamped[nk];
      });
      if (Object.keys(ptPatch).length) {
        var curPt = (GameState.playerData && GameState.playerData.portrait) ? GameState.playerData.portrait : {};
        var newPt = {};
        Object.keys(curPt).forEach(function(k) { newPt[k] = curPt[k]; });
        Object.keys(ptPatch).forEach(function(k) { newPt[k] = ptPatch[k]; });
        this.save(newPt);
      }

      // 5. label + 通知文案（含属性忽略警告）
      var labels = [];
      pdKeys.forEach(function(k) { labels.push(k); });
      normAttrKeys.forEach(function(k) { labels.push(k); });
      Object.keys(ptPatch).forEach(function(k) { labels.push('人设.' + k); });
      var label = labels.length ? labels.join('、') : '无改动';
      if (attrRejected) {
        label += (label ? '（' : '') + '被拒的属性：' + (attrRejected.lockedKeys || []).join('、') + '）';
      }
      if (attrPoolOver) {
        label += (label ? '（' : '') + '超创角池 ' + attrPoolOver.need + ' 点）';
      }

      return {
        ok: true, before: before, after: after, label: label,
        attrWarnings: attrResult.warnings || [],
        attrRejected: attrRejected,
        attrPoolOver: attrPoolOver
      };
    },    // 记录撤回条目（patch 级 diff，只记被改的键）
    recordUndo: function(entry) {
      var doc = this.loadChat();
      doc.undo.push({
        id: entry.id || ('undo_' + Date.now() + '_' + Math.floor(Math.random() * 1000)),
        ts: entry.ts || new Date().toISOString(),
        label: entry.label || '',
        patchBefore: entry.patchBefore || {},
        patchAfter: entry.patchAfter || {}
      });
      if (doc.undo.length > 10) doc.undo = doc.undo.slice(doc.undo.length - 10);
      this.saveChat(doc);
      return doc.undo[doc.undo.length - 1].id;
    },

    // 撤回：entryId 省略时撤栈顶；指定非栈顶时级联撤回（从栈顶往下还原 idx+1..末尾，再撤 idx）
    // 返回 { ok, label, cascaded, error }；cascaded 为级联还原的中间改数
    undoLast: function(entryId) {
      var doc = this.loadChat();
      if (!doc.undo.length) return { ok: false, error: '没有可撤回的记录' };
      var idx = -1;
      if (entryId) {
        for (var i = doc.undo.length - 1; i >= 0; i--) {
          if (doc.undo[i].id === entryId) { idx = i; break; }
        }
      } else {
        idx = doc.undo.length - 1;
      }
      if (idx < 0) return { ok: false, error: '找不到该撤回记录' };

      var self = this;
      // 还原单条的 patchBefore
      function revertOne(entry) {
        if (entry.patchBefore && entry.patchBefore.playerData && GameState.playerData) {
          Object.keys(entry.patchBefore.playerData).forEach(function(k) {
            var v = entry.patchBefore.playerData[k];
            if (v === undefined) delete GameState.playerData[k];
            else GameState.playerData[k] = v;
          });
        }
        if (entry.patchBefore && entry.patchBefore.portrait && GameState.playerData) {
          var cur = GameState.playerData.portrait || {};
          var restored = {};
          Object.keys(cur).forEach(function(k) { restored[k] = cur[k]; });
          Object.keys(entry.patchBefore.portrait).forEach(function(k) {
            var v = entry.patchBefore.portrait[k];
            if (v === undefined) delete restored[k];
            else restored[k] = v;
          });
          self.save(restored);
        }
      }

      var cascaded = 0;
      var targetLabel = doc.undo[idx].label || '';
      // 级联：先还原 idx+1..末尾（从栈顶往下），再撤 idx
      for (var j = doc.undo.length - 1; j > idx; j--) {
        revertOne(doc.undo[j]);
        cascaded++;
      }
      // 撤 idx 本身
      revertOne(doc.undo[idx]);
      // 移除 idx..末尾（已全部还原）
      doc.undo.splice(idx, doc.undo.length - idx);
      this.saveChat(doc);

      return { ok: true, label: targetLabel, cascaded: cascaded };
    },

    // ============================================================
    // 以下为原有两阶段流程（verbatim 保留）
    // ============================================================

    // ★ 阶段 1：审核 prompt —— 只审核合理性，不生成 summary
    buildAuditPrompt: function(playerData, discussionHistory) {
      var card = GameState.currentCard;
      var lines = [];
      lines.push('你是人设合理性审核员。审核玩家填写的人设在当前世界观中是否合理。');
      lines.push('');
      lines.push('审核标准：字段是否与世界观/背景矛盾、是否自洽、是否有明显不合理之处。');
      lines.push('说明：玩家写长篇人生经历、家庭关系、性格形成过程是正常的，不要因为篇幅长就判问题；只审内容是否自洽、是否与世界矛盾。');
      lines.push('你只负责审核与提建议，不能修改属性数值；属性改动由引擎规则裁决。');
      lines.push('轻微瑕疵标 concern，严重矛盾标 conflict，都没问题标 ok。');
      lines.push('');
      lines.push('输出格式（只输出 JSON，不要解释、不要 markdown 代码块）：');
      lines.push('{');
      lines.push('  "verdict": "ok 或 concern 或 conflict",');
      lines.push('  "issues": [{"field":"字段名","severity":"concern或conflict","reason":"原因","suggestion":"修改建议"}],');
      lines.push('  "comment": "一句简短的审核总结（自然语言，给玩家看的）"');
      lines.push('}');
      lines.push('');
      lines.push('如果没有问题，issues 为空数组，verdict 为 "ok"，comment 为一句正面评价。');
      lines.push('');
      lines.push('【游戏背景】');
      lines.push('标题：' + ((card.game && card.game.title) || ''));
      if (card.game && card.game.background) lines.push('背景：' + card.game.background);
      if (card.worldbook && card.worldbook.worldSetting) {
        var ws = card.worldbook.worldSetting;
        if (ws.description) lines.push('世界设定：' + ws.description);
      }
      lines.push('');
      lines.push('【玩家原始填写】');
      Object.keys(playerData || {}).forEach(function(k) {
        if (k === 'inventory' || k === 'portrait') return;
        var v = playerData[k];
        if (v == null || v === '') return;
        var line = '  ' + k + '：' + (typeof v === 'object' ? JSON.stringify(v) : String(v));
        lines.push(line);
      });
      if (discussionHistory && discussionHistory.length) {
        lines.push('');
        lines.push('【之前的讨论】');
        discussionHistory.forEach(function(h) {
          lines.push((h.role === 'user' ? '玩家：' : 'AI：') + h.content);
        });
        lines.push('');
        lines.push('请结合玩家在讨论里提出的所有反馈，重新审核。');
      }
      return lines.join('\n');
    },

    // ★ 阶段 2：生成 prompt —— 审核通过后调用，生成 summary + fullBio + traits
    buildGeneratePrompt: function(playerData, auditResult) {
      var card = GameState.currentCard;
      var lines = [];
      lines.push('你是角色人设助手。根据玩家的原始填写资料和审核意见，生成 GM 需要的人设资料。');
      lines.push('');
      lines.push('输出格式（只输出 JSON，不要解释、不要 markdown 代码块）：');
      lines.push('{');
      lines.push('  "summary": "200-400 字的人设速览。第三人称。包含：性格、气质、说话方式、行为倾向、价值观、容易触发反应的点。不要复述属性数字。注意：这是给 GM 快速读取的索引，不是完整人设，不要为了压短而删掉玩家写过的关键经历。",');
      lines.push('  "fullBio": "完整人物经历（长文本）。把玩家原始填写里的人生经历、家庭关系、成长与转折、重要人与事按原意整理成通顺段落；玩家在讨论里补充、但原始字段没写进去的内容也放这里。600-2000 字按内容需要来，不设硬上限，宁长勿丢细节。原始字段里已经完整写过的部分可以概括提到，但不要删除。没有额外补充就输出空字符串。",');
      lines.push('  "traits": ["6-10 条关键特质，每条一句话，用于 GM 快速判断 NPC 互动时这个角色会怎么反应"]');
      lines.push('}');
      lines.push('');
      lines.push('【游戏背景】');
      lines.push('标题：' + ((card.game && card.game.title) || ''));
      if (card.game && card.game.background) lines.push('背景：' + card.game.background);
      lines.push('');
      lines.push('【玩家原始填写】');
      Object.keys(playerData || {}).forEach(function(k) {
        if (k === 'inventory' || k === 'portrait') return;
        var v = playerData[k];
        if (v == null || v === '') return;
        var line = '  ' + k + '：' + (typeof v === 'object' ? JSON.stringify(v) : String(v));
        lines.push(line);
      });
      if (auditResult && auditResult.comment) {
        lines.push('');
        lines.push('【审核意见】');
        lines.push(auditResult.comment);
      }
      return lines.join('\n');
    },

    // 兼容旧版单 prompt 接口（外部可能还在调）
    buildPrompt: function(playerData, discussionHistory) {
      return this.buildAuditPrompt(playerData, discussionHistory);
    },

    // ★ 解析审核结果（阶段 1）
    parseAuditResponse: function(text) {
      if (!text) return null;
      var s = String(text).trim();
      var m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) s = m[1].trim();
      var ob = (typeof CardDiagnose !== 'undefined' && CardDiagnose.firstJsonObject) ? CardDiagnose.firstJsonObject(s) : null;
      if (ob) s = ob;
      try {
        var p = JSON.parse(s);
        if (!p.verdict) p.verdict = 'ok';
        var verdict = (p.verdict === 'ok' || p.verdict === 'concern' || p.verdict === 'conflict') ? p.verdict : 'ok';
        var issues = Array.isArray(p.issues) ? p.issues.map(function(iss) {
          return {
            field: String(iss.field || ''),
            severity: (iss.severity === 'concern' || iss.severity === 'conflict') ? iss.severity : 'concern',
            reason: String(iss.reason || ''),
            suggestion: String(iss.suggestion || '')
          };
        }) : [];
        return {
          verdict: verdict,
          issues: issues,
          comment: String(p.comment || '')
        };
      } catch (e) {
        return null;
      }
    },

    // ★ 解析生成结果（阶段 2）—— 兼容新旧格式
    parseGenerateResponse: function(text) {
      if (!text) return null;
      var s = String(text).trim();
      var m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) s = m[1].trim();
      var ob = (typeof CardDiagnose !== 'undefined' && CardDiagnose.firstJsonObject) ? CardDiagnose.firstJsonObject(s) : null;
      if (ob) s = ob;
      try {
        var p = JSON.parse(s);
        if (!p.summary) return null;
        return {
          summary: String(p.summary),
          // 阶段 1（长度解耦）：完整经历单独存一份，摘要不再承担“代替完整人设”的职责
          fullBio: (p.fullBio && typeof p.fullBio === 'string') ? p.fullBio : '',
          traits: Array.isArray(p.traits) ? p.traits.map(String) : [],
          lockedAt: new Date().toISOString(),
          aiVersion: 1
        };
      } catch (e) {
        return null;
      }
    },

    // 兼容旧版单接口（外部可能还在调）
    parseResponse: function(text) {
      return this.parseGenerateResponse(text);
    },

    // 兜底：玩家没走审核流程
    fallback: function(playerData) {
      var traits = [];
      ['house', 'identity', 'race', 'bloodline', 'occupation', 'major'].forEach(function(k) {
        if (playerData[k]) traits.push(k + '：' + playerData[k]);
      });
      return {
        summary: '（未生成人设总述，使用原始字段）',
        traits: traits,
        lockedAt: new Date().toISOString(),
        aiVersion: 0
      };
    },

    // 给 prompt 用：格式化成一段文本
    formatForPrompt: function(portrait) {
      if (!portrait || !portrait.summary) return '';
      var lines = [];
      if (portrait.aiVersion === 0) return '';
      lines.push('【角色人设】');
      lines.push(portrait.summary);
      if (portrait.traits && portrait.traits.length) {
        lines.push('关键特质：');
        portrait.traits.forEach(function(t) { lines.push('· ' + t); });
      }
      return lines.join('\n');
    }
  };

  if (typeof window !== 'undefined') window.Portrait = Portrait;
  if (typeof module !== 'undefined' && module.exports) module.exports = Portrait;
})();
