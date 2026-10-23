// ============================================================
// 人设审核 / 生成（两阶段流程）+ 共创讨论（P71）
// 阶段 1：AI 审核人设在世界观中的合理性 → 输出 verdict + issues
// 阶段 2：审核通过后，AI 生成 summary + traits
// 数据存：/saves/{cardId}/{saveId}/portrait.json（瘦身，只存人设）
//        /saves/{cardId}/{saveId}/portrait_chat.json（聊天 + 撤回，不进 playerData）
// 也同步一份到 playerData.portrait 供 prompt 注入
// ============================================================

(function() {
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
      lines.push('3. 数值要合理，不要超出属性范围。');
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
          lines.push('attributes 里不要包含这些键，任何改动都会被引擎整包拒绝；玩家若要换这组数值，只能回开局界面重掷天命。');
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

    // 属性元信息：attrKey → { min, max, poolKey }
    _attributeMeta: function(card) {
      var meta = {};
      (card && card.attributes || []).forEach(function(a) {
        if (!a || !a.key) return;
        meta[a.key] = { min: a.min, max: a.max };
        meta['attr_' + a.key] = { min: a.min, max: a.max };
      });
      return meta;
    },

    // 一行属性状态：力量 5/20 敏捷 8/20 · 剩余点数 5
    _attributeStatusLine: function(playerData) {
      var card = GameState.currentCard;
      if (!card || !card.attributes || !card.attributes.length) return '';
      var parts = [];
      card.attributes.forEach(function(a) {
        var v = playerData['attr_' + a.key];
        if (v == null) v = playerData[a.key];
        if (v == null) v = a.init != null ? a.init : 0;
        parts.push((a.name || a.key) + ' ' + v + '/' + (a.max != null ? a.max : '?'));
      });
      var remaining = this._remainingPoints(playerData);
      if (remaining != null) parts.push('剩余点数 ' + remaining);
      return parts.join(' ');
    },

    _remainingPoints: function(playerData) {
      var card = GameState.currentCard;
      if (!card || !card.attributePool || card.attributePool.total == null) return null;
      var pool = card.attributePool;
      var base = pool.base != null ? pool.base : 0;
      var allocated = 0;
      (card.attributes || []).forEach(function(a) {
        var v = playerData['attr_' + a.key];
        if (v == null) v = playerData[a.key];
        if (typeof v !== 'number' || isNaN(v)) return;
        var fb = a.min != null ? a.min : base;
        allocated += Math.max(0, v - fb);
      });
      return Math.max(0, pool.total - allocated);
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
      var d = this._destinyLock(playerData);
      if (!d) return [];
      var vals = d.values || {};
      return Object.keys(vals).map(function(k) { return k.indexOf('attr_') === 0 ? k : ('attr_' + k); });
    },

    // 校验属性 patch：单值 clamp min/max → 再算 allocated → 超 pool.total 整包拒绝
    // 键一律归一为 attr_<key>（裸 x 补前缀，attr_x 保持）；未声明键忽略并警告
    // 返回 { ok, clamped, warnings, error, code, lockedKeys }
    validateAttributes: function(attrPatch, playerData) {
      var card = GameState.currentCard;
      var meta = this._attributeMeta(card);
      var pool = (card && card.attributePool) ? card.attributePool : null;
      var base = (pool && pool.base != null) ? pool.base : 0;
      var clamped = {};   // 归一后的 attr_<key> → 值
      var warnings = [];

      // 先逐键归一 + clamp
      Object.keys(attrPatch || {}).forEach(function(k) {
        var m = meta[k];
        if (!m) {
          warnings.push(k + ' 不是卡带声明的属性，已忽略');
          return;
        }
        // 归一为 attr_<key>
        var normKey = (k.indexOf('attr_') === 0) ? k : ('attr_' + k);
        var v = Number(attrPatch[k]);
        if (isNaN(v)) { warnings.push(k + ' 不是有效数值，已忽略'); return; }
        if (m.min != null && v < m.min) { warnings.push(k + ' ' + v + ' 低于下限 ' + m.min + '，已收到 ' + m.min); v = m.min; }
        if (m.max != null && v > m.max) { warnings.push(k + ' ' + v + ' 超出上限 ' + m.max + '，已收到 ' + m.max); v = m.max; }
        clamped[normKey] = v;
      });

      // 天命锁：锁定属性不允许任何改动（含下调），先于池校验给出可解释的拒绝
      var lock = this._destinyLock(playerData);
      if (lock) {
        var attrNames = {};   // attr_<key> → 中文名
        (card && card.attributes || []).forEach(function(a) {
          if (a && a.key) attrNames['attr_' + a.key] = a.name || a.key;
        });
        var lockedKeys = [];
        var lockedParts = [];
        var lockedVals = lock.values || {};
        Object.keys(clamped).forEach(function(nk) {
          var bare = nk.indexOf('attr_') === 0 ? nk.slice(5) : nk;
          if (!(bare in lockedVals) && !(nk in lockedVals)) return;
          var before = (lockedVals[nk] != null) ? lockedVals[nk] : lockedVals[bare];
          if (clamped[nk] === before) return;   // 同值重写不算改
          lockedKeys.push(nk);
          lockedParts.push((attrNames[nk] || bare) + '（' + before + '）');
        });
        if (lockedKeys.length) {
          return {
            ok: false,
            code: 'DESTINY_LOCKED',
            lockedKeys: lockedKeys,
            clamped: clamped,
            error: '天命锁：' + lockedParts.join('、') + ' 已由天命固定，审核阶段不能修改。'
              + '想换这组数值只能回开局界面「重掷天命」；其余属性、技能、物品、人设字段仍可照常调整。'
          };
        }
      }

      // 再算 allocated（用 clamped 值替换原值），超 pool.total 整包拒绝。
      // 有天命锁时：锁定属性由天命分配，掷点结果可能本身就超过卡带池上限，
      // 所以池校验只约束「未锁定属性」的占用，headroom = total - 锁定属性占用（最低 0）。
      if (pool && pool.total != null) {
        var lockedSet = {};
        if (lock) {
          this._destinyLockedKeys(playerData).forEach(function(k) { lockedSet[k] = true; });
        }
        var allocatedBefore = 0, allocatedAfter = 0, lockedAlloc = 0;
        (card.attributes || []).forEach(function(a) {
          var key = 'attr_' + a.key;
          var vBefore = playerData[key] != null ? playerData[key] :
                        (playerData[a.key] != null ? playerData[a.key] : (a.init != null ? a.init : 0));
          var vAfter = (clamped[key] != null) ? clamped[key] : vBefore;
          var fb = a.min != null ? a.min : base;
          var cb = (typeof vBefore === 'number' && !isNaN(vBefore)) ? Math.max(0, vBefore - fb) : 0;
          var ca = (typeof vAfter === 'number' && !isNaN(vAfter)) ? Math.max(0, vAfter - fb) : 0;
          if (lockedSet[key]) { lockedAlloc += cb; return; }
          allocatedBefore += cb;
          allocatedAfter += ca;
        });
        var headroom = Math.max(0, pool.total - lockedAlloc);
        if (allocatedAfter > headroom) {
          var need = allocatedAfter - headroom;
          var remain = Math.max(0, headroom - allocatedBefore);
          return {
            ok: false,
            code: 'POOL_EXCEEDED',
            clamped: clamped,
            error: '属性点不够：这次改动要多 ' + need + ' 点，当前只剩 ' + remain + ' 点'
              + (lock ? '（天命锁定的属性不参与本次计算）' : '')
          };
        }
      }

      return { ok: true, clamped: clamped, warnings: warnings };
    },

    // 合并 patch 到 playerData + portrait，只覆盖 patch 里出现的键
    // 属性键归一为 attr_<key>，迁移历史裸键；before/after 记归一后键
    // 返回 { ok, before, after, label, error, attrWarnings }；失败时 ok=false 且不写任何字段
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

      // 2. 属性 clamp + 池校验（整包拒绝）；clamped 的键已归一为 attr_<key>
      // 2026-10-23 P0：属性被拒（天命锁 / 点数不够）不再连累整包——人设字段与其它属性照常落地，
      // 只把被拒的属性摘掉、把原因作为 attrRejected 回传。否则模型会反复重试同一处，
      // 玩家看到的是「一直在报错改数值」，而且人设永远进不了存档。
      var attrResult = this.validateAttributes(attrPatch, playerData);
      var attrRejected = null;
      if (!attrResult.ok) {
        var rejectCode = attrResult.code || '';
        var strippable = rejectCode === 'DESTINY_LOCKED';
        if (strippable) {
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
            attrResult = { ok: true, clamped: {}, warnings: (attrResult.warnings || []).concat(retry.warnings || []), dropped: true };
            attrRejected.code = retry.code || 'DESTINY_LOCKED';
          }
        } else {
          // 点数不够：属性一条都不写，但人设照常落地
          attrRejected = { code: rejectCode || 'POOL_EXCEEDED', error: attrResult.error, appliedAttr: false };
          attrResult = { ok: true, clamped: {}, warnings: attrResult.warnings || [], dropped: true };
        }
      }
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

      return {
        ok: true, before: before, after: after, label: label,
        attrWarnings: attrResult.warnings || [],
        attrRejected: attrRejected
      };
    },

    // 记录撤回条目（patch 级 diff，只记被改的键）
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
