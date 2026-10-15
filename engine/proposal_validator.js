// ============================================================
// 提议校验器 · A 层（纯代码，不烧 token）
// 在 Proposals.confirm 执行前，检查提议引用的实体是否还存在
// 只查存在性，不判断"能不能成功执行"（后者是 B 层 AI 校验）
// 分层：A 类 · 纯逻辑，不碰 UI / DOM / localStorage / alert
// ============================================================

(function() {
  // 全局子系统探测（P54·第14条）：拿不到对象或没有该方法一律返回 null，交由调用方回落世界书
  function _probeGlobal(host, method, id) {
    if (host && typeof host[method] === 'function') return !!host[method](id);
    return null;
  }

  var ProposalValidator = {

    // 入口：校验一条提议，返回 { ok: bool, reason?: string }
    validate: function(prop) {
      if (!prop || !prop.type) return { ok: false, reason: '提议无类型' };
      var type = prop.type;
      var pl = prop.payload || {};

      // 按类型分发
      var fn = this._handlers[type];
      if (typeof fn !== 'function') {
        // 没有校验规则的，默认通过（不阻塞）——但放行要留痕（P53·③）
        this._audit('unknown_op', type, pl);
        return { ok: true };
      }
      try {
        return fn.call(this, pl);
      } catch (e) {
        // 校验器自身出错时不阻塞，只记警告——并留审计痕（P53·③）
        this._audit('crash', type, e);
        if (typeof console !== 'undefined') console.warn('[ProposalValidator] 校验异常：', e);
        return { ok: true };
      }
    },

    // 审计钩子（P53·③）：A 层是「静默 fail-open」的重灾区——未知类型与自身异常都直接放行，
    // 玩家和开发者都看不见。把这两条路径写进行为日志，事后可从诊断报告反查校验缺口。
    // 契约：ErrorLog 缺失（Node 单测 / 极早启动）时静默降级为 false，绝不因日志不可用而阻塞校验。
    _audit: function(kind, type, detail) {
      try {
        if (typeof ErrorLog === 'undefined' || !ErrorLog || typeof ErrorLog.audit !== 'function') return false;
        var tail = '';
        try {
          if (detail && typeof detail === 'object') {
            if (detail.message) tail = ' ' + String(detail.message).slice(0, 120);
            else {
              var keys = Object.keys(detail).slice(0, 3);
              if (keys.length) tail = ' keys=' + keys.join(',');
            }
          } else if (detail !== undefined && detail !== null) {
            tail = ' ' + String(detail).slice(0, 120);
          }
        } catch (e2) {}
        return !!ErrorLog.audit('proposal_validator', kind + ':' + type, tail || '（无详情）');
      } catch (e3) { return false; }
    },

    // ============ 通用查表（P54·第14条：表驱动）============
    // 原先 12 个 _has* 各自手写一遍「取 worldbook 集合 → 遍历找 id」，现收敛为一张声明表 +
    // 一个通用实现。对外函数名与返回语义不变，_handlers 的 34 处调用零改动。
    //   collection : worldbook 里的集合名（数组；map:true 表示以 id 为键的对象）
    //   matchName  : 数组元素额外按 name 命中（NPC 专用）
    //   find       : 可选，全局子系统探测（裸标识符 + try 捕获，与重构前同语义）；
    //                true/false 为定论，null 表示「本环境没有该子系统」→ 回落世界书
    //   onlyFind   : 为 true 时只认 find 的结论（节点 / 伏笔没有世界书回落）
    _hasSpecs: {
      npc:         { collection: 'npcs', matchName: true },
      mapNode:     { collection: 'mapNodes', map: true },
      event:       { collection: 'events', find: function(id) { try { return _probeGlobal(Events, 'findDef', id); } catch (e) { return null; } } },
      task:        { collection: 'tasks', find: function(id) { try { return _probeGlobal(Tasks, '_findDef', id); } catch (e) { return null; } } },
      achievement: { collection: 'achievements' },
      ending:      { collection: 'endings' },
      node:        { onlyFind: true, find: function(id) { try { return _probeGlobal(StoryNodes, 'findNode', id); } catch (e) { return null; } } },
      foreshadow:  { onlyFind: true, find: function(id) { try { return _probeGlobal(StoryNodes, 'findForeshadow', id); } catch (e) { return null; } } },
      shop:        { collection: 'shops', find: function(id) { try { return _probeGlobal(Shop, 'findShop', id); } catch (e) { return null; } } }
    },

    _hasIn: function(specName, id) {
      if (!id) return false;
      var spec = this._hasSpecs[specName];
      if (!spec) return false;
      if (spec.find) {
        var hit = spec.find(id);
        if (hit === true) return true;
        if (hit === false) return false;   // 全局子系统给了定论（含「没有」）
      }
      if (spec.onlyFind || !spec.collection) return false;
      var card = GameState.currentCard;
      if (!card || !card.worldbook) return false;
      var src = card.worldbook[spec.collection];
      if (spec.map) return !!(src && src[id]);
      var list = src || [];
      var found = false;
      list.forEach(function(x) {
        if (found) return;
        if (x.id === id || (spec.matchName && x.name === id)) found = true;
      });
      return found;
    },

    _hasNpc: function(id) { return this._hasIn('npc', id); },
    _hasMapNode: function(id) { return this._hasIn('mapNode', id); },
    _hasEvent: function(id) { return this._hasIn('event', id); },
    _hasTask: function(id) { return this._hasIn('task', id); },
    _hasAchievement: function(id) { return this._hasIn('achievement', id); },
    _hasEnding: function(id) { return this._hasIn('ending', id); },
    _hasNode: function(id) { return this._hasIn('node', id); },
    _hasForeshadow: function(id) { return this._hasIn('foreshadow', id); },
    _hasShop: function(id) { return this._hasIn('shop', id); },

    _hasShopItem: function(shopId, itemId) {
      if (!shopId || !itemId) return false;
      var card = GameState.currentCard;
      if (!card || !card.worldbook) return false;
      var shops = card.worldbook.shops || [];
      var shop = null;
      shops.forEach(function(s) { if (!shop && s.id === shopId) shop = s; });
      if (!shop) return false;
      var items = shop.items || [];
      var found = false;
      items.forEach(function(it) { if (!found && it.id === itemId) found = true; });
      return found;
    },

    _findStat: function(key) {
      if (!key) return null;
      var st = GameState.currentState;
      if (!st) return null;
      var item = (st.hud || []).find(function(x) { return x.key === key; });
      if (item) return item;
      item = (st.sidebar || []).find(function(x) { return x.key === key; });
      if (item) return item;
      var found = null;
      Object.keys(st.panels || {}).forEach(function(pid) {
        var panel = st.panels[pid];
        if (!panel || !Array.isArray(panel.entries)) return;
        panel.entries.forEach(function(e) {
          if (e.key === key && !found) found = e;
        });
      });
      return found;
    },

    _hasRelation: function(from, to) {
      if (!from || !to) return false;
      var st = GameState.currentState;
      if (!st) return false;
      var found = false;
      Object.keys(st.panels || {}).forEach(function(pid) {
        var panel = st.panels[pid];
        if (!panel || !Array.isArray(panel.entries)) return;
        panel.entries.forEach(function(e) {
          if (e.type === 'relation' && e.from === from && e.to === to) found = true;
        });
      });
      return found;
    },

    _hasInventoryItem: function(name) {
      if (!name) return false;
      var pd = GameState.playerData;
      if (!pd || !pd.inventory) return false;
      var inv = pd.inventory;
      var found = false;
      ['bar', 'common', 'story', 'rare'].forEach(function(cat) {
        (inv[cat] || []).forEach(function(it) {
          var n = typeof it === 'string' ? it : (it && it.name);
          if (n === name) found = true;
        });
      });
      return found;
    },

    // hud / sidebar 两条规则的规则体逐字相同（P54·第14条合并）
    _statRule: function(pl) {
      if (!pl.key) return { ok: false, reason: '提议缺少 key' };
      if (!this._findStat(pl.key)) return { ok: false, reason: '数值项「' + pl.key + '」已不存在' };
      return { ok: true };
    },

    // ============ 各类型的校验规则 ============
    _handlers: {

      modify_hud: function(pl) { return this._statRule(pl); },

      modify_sidebar: function(pl) { return this._statRule(pl); },

      modify_entry: function(pl) {
        if (!pl.panelId || !pl.key) return { ok: false, reason: '提议缺少 panelId 或 key' };
        var st = GameState.currentState;
        if (!st || !st.panels || !st.panels[pl.panelId]) {
          return { ok: false, reason: '面板「' + pl.panelId + '」已不存在' };
        }
        var p = st.panels[pl.panelId];
        var found = false;
        (p.entries || []).forEach(function(e) { if (!found && e.key === pl.key) found = true; });
        if (!found) return { ok: false, reason: '面板条目「' + pl.key + '」已不存在' };
        return { ok: true };
      },

      modify_relation: function(pl) {
        if (!pl.from || !pl.to) return { ok: false, reason: '提议缺少 from 或 to' };
        if (!this._hasRelation(pl.from, pl.to)) {
          return { ok: false, reason: '关系 ' + pl.from + ' → ' + pl.to + ' 已不存在' };
        }
        return { ok: true };
      },

      add_item: function(pl) {
        if (!pl.name) return { ok: false, reason: '提议缺少 name' };
        return { ok: true };
      },

      remove_item: function(pl) {
        if (!pl.name) return { ok: false, reason: '提议缺少 name' };
        if (!this._hasInventoryItem(pl.name)) {
          return { ok: false, reason: '背包里已经没有「' + pl.name + '」了' };
        }
        return { ok: true };
      },

      trigger_event: function(pl) {
        if (!pl.id) return { ok: false, reason: '提议缺少 id' };
        if (!this._hasEvent(pl.id)) return { ok: false, reason: '事件「' + pl.id + '」已不存在' };
        return { ok: true };
      },

      ban_event: function(pl) {
        if (!pl.id) return { ok: false, reason: '提议缺少 id' };
        if (!this._hasEvent(pl.id)) return { ok: false, reason: '事件「' + pl.id + '」已不存在' };
        return { ok: true };
      },

      unban_event: function(pl) {
        if (!pl.id) return { ok: false, reason: '提议缺少 id' };
        if (!this._hasEvent(pl.id)) return { ok: false, reason: '事件「' + pl.id + '」已不存在' };
        return { ok: true };
      },

      add_task: function(pl) {
        if (!pl.task || typeof pl.task !== 'object') return { ok: false, reason: '提议缺少 task 对象' };
        if (!pl.task.name) return { ok: false, reason: '提议 task 缺少 name' };
        return { ok: true };
      },

      complete_task: function(pl) {
        if (!pl.taskId) return { ok: false, reason: '提议缺少 taskId' };
        if (!this._hasTask(pl.taskId)) return { ok: false, reason: '任务「' + pl.taskId + '」已不存在' };
        return { ok: true };
      },

      fail_task: function(pl) {
        if (!pl.taskId) return { ok: false, reason: '提议缺少 taskId' };
        if (!this._hasTask(pl.taskId)) return { ok: false, reason: '任务「' + pl.taskId + '」已不存在' };
        return { ok: true };
      },

      abandon_task: function(pl) {
        if (!pl.taskId) return { ok: false, reason: '提议缺少 taskId' };
        if (!this._hasTask(pl.taskId)) return { ok: false, reason: '任务「' + pl.taskId + '」已不存在' };
        return { ok: true };
      },

      add_achievement: function(pl) {
        if (!pl.achievement || typeof pl.achievement !== 'object') return { ok: false, reason: '提议缺少 achievement 对象' };
        if (!pl.achievement.name) return { ok: false, reason: '提议 achievement 缺少 name' };
        return { ok: true };
      },

      unlock_achievement: function(pl) {
        if (!pl.id) return { ok: false, reason: '提议缺少 id' };
        if (!this._hasAchievement(pl.id)) return { ok: false, reason: '成就「' + pl.id + '」已不存在' };
        return { ok: true };
      },

      trigger_ending: function(pl) {
        if (!pl.id) return { ok: false, reason: '提议缺少 id' };
        if (!this._hasEnding(pl.id)) return { ok: false, reason: '结局「' + pl.id + '」已不存在' };
        return { ok: true };
      },

      enter_node: function(pl) {
        if (!pl.id) return { ok: false, reason: '提议缺少 id' };
        if (!this._hasNode(pl.id)) return { ok: false, reason: '节点「' + pl.id + '」已不存在' };
        return { ok: true };
      },

      complete_node: function(pl) {
        return { ok: true };
      },

      bury_foreshadow: function(pl) {
        if (!pl.id) return { ok: false, reason: '提议缺少 id' };
        if (!this._hasForeshadow(pl.id)) return { ok: false, reason: '伏笔「' + pl.id + '」已不存在' };
        return { ok: true };
      },

      reveal_foreshadow: function(pl) {
        if (!pl.id) return { ok: false, reason: '提议缺少 id' };
        if (!this._hasForeshadow(pl.id)) return { ok: false, reason: '伏笔「' + pl.id + '」已不存在' };
        return { ok: true };
      },

      add_keyword: function(pl) {
        if (!pl.id) return { ok: false, reason: '提议缺少 id' };
        if (!this._hasNpc(pl.id)) return { ok: false, reason: 'NPC「' + pl.id + '」已不存在' };
        if (!pl.keyword || !String(pl.keyword).trim()) return { ok: false, reason: '提议缺少 keyword' };
        return { ok: true };
      },

      npc_knows: function(pl) {
        if (!pl.id) return { ok: false, reason: '提议缺少 id' };
        if (!this._hasNpc(pl.id)) return { ok: false, reason: 'NPC「' + pl.id + '」已不存在' };
        if (!pl.text) return { ok: false, reason: '提议缺少 text' };
        return { ok: true };
      },

      npc_focus: function(pl) {
        if (!pl.id) return { ok: false, reason: '提议缺少 id' };
        if (!this._hasNpc(pl.id)) return { ok: false, reason: 'NPC「' + pl.id + '」已不存在' };
        return { ok: true };
      },

      npc_unfocus: function(pl) {
        if (!pl.id) return { ok: false, reason: '提议缺少 id' };
        if (!this._hasNpc(pl.id)) return { ok: false, reason: 'NPC「' + pl.id + '」已不存在' };
        return { ok: true };
      },

      npc_follow: function(pl) {
        if (!pl.id) return { ok: false, reason: '提议缺少 id' };
        if (!this._hasNpc(pl.id)) return { ok: false, reason: 'NPC「' + pl.id + '」已不存在' };
        return { ok: true };
      },

      npc_unfollow: function(pl) {
        if (!pl.id) return { ok: false, reason: '提议缺少 id' };
        if (!this._hasNpc(pl.id)) return { ok: false, reason: 'NPC「' + pl.id + '」已不存在' };
        return { ok: true };
      },

      npc_reveal: function(pl) {
        if (!pl.id) return { ok: false, reason: '提议缺少 id' };
        if (!this._hasNpc(pl.id)) return { ok: false, reason: 'NPC「' + pl.id + '」已不存在' };
        return { ok: true };
      },

      update_status: function(pl) {
        if (!pl.key) return { ok: false, reason: '提议缺少 key' };
        return { ok: true };
      },

      update_status_bulk: function(pl) {
        if (!pl.fields || typeof pl.fields !== 'object' || Array.isArray(pl.fields)) {
          return { ok: false, reason: '提议缺少 fields 对象' };
        }
        return { ok: true };
      },

      set_inner_voice: function(pl) {
        if (!pl.npcId) return { ok: false, reason: '提议缺少 npcId' };
        if (!this._hasNpc(pl.npcId)) return { ok: false, reason: 'NPC「' + pl.npcId + '」已不存在' };
        return { ok: true };
      },

      set_weather: function(pl) {
        if (!pl.type) return { ok: false, reason: '提议缺少 type' };
        return { ok: true };
      },

      open_shop: function(pl) {
        if (!pl.id) return { ok: false, reason: '提议缺少 id' };
        if (!this._hasShop(pl.id)) return { ok: false, reason: '商店「' + pl.id + '」已不存在' };
        return { ok: true };
      },

      buy_item: function(pl) {
        if (!pl.shopId || !pl.itemId) return { ok: false, reason: '提议缺少 shopId 或 itemId' };
        if (!this._hasShop(pl.shopId)) return { ok: false, reason: '商店「' + pl.shopId + '」已不存在' };
        if (!this._hasShopItem(pl.shopId, pl.itemId)) {
          return { ok: false, reason: '商品「' + pl.itemId + '」已不在商店里' };
        }
        return { ok: true };
      },

      sell_item: function(pl) {
        if (!pl.shopId || !pl.itemName) return { ok: false, reason: '提议缺少 shopId 或 itemName' };
        if (!this._hasShop(pl.shopId)) return { ok: false, reason: '商店「' + pl.shopId + '」已不存在' };
        return { ok: true };
      }

    }

  };

  if (typeof window !== 'undefined') window.ProposalValidator = ProposalValidator;
  if (typeof module !== 'undefined' && module.exports) module.exports = ProposalValidator;
})();
