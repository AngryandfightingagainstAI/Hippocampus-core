// ============================================================
// 提议校验器 · A 层（纯代码，不烧 token）
// 在 Proposals.confirm 执行前，检查提议引用的实体是否还存在
// 只查存在性，不判断"能不能成功执行"（后者是 B 层 AI 校验）
// 分层：A 类 · 纯逻辑，不碰 UI / DOM / localStorage / alert
// ============================================================

(function() {
  var ProposalValidator = {

    // 入口：校验一条提议，返回 { ok: bool, reason?: string }
    validate: function(prop) {
      if (!prop || !prop.type) return { ok: false, reason: '提议无类型' };
      var type = prop.type;
      var pl = prop.payload || {};

      // 按类型分发
      var fn = this._handlers[type];
      if (typeof fn !== 'function') {
        // 没有校验规则的，默认通过（不阻塞）
        return { ok: true };
      }
      try {
        return fn.call(this, pl);
      } catch (e) {
        // 校验器自身出错时不阻塞，只记警告
        if (typeof console !== 'undefined') console.warn('[ProposalValidator] 校验异常：', e);
        return { ok: true };
      }
    },

    // ============ 通用查表 ============
    _hasNpc: function(id) {
      if (!id) return false;
      var card = GameState.currentCard;
      if (!card || !card.worldbook) return false;
      var npcs = card.worldbook.npcs || [];
      var found = false;
      npcs.forEach(function(n) { if (!found && (n.id === id || n.name === id)) found = true; });
      return found;
    },

    _hasMapNode: function(id) {
      if (!id) return false;
      var card = GameState.currentCard;
      if (!card || !card.worldbook) return false;
      var nodes = card.worldbook.mapNodes || {};
      return !!nodes[id];
    },

    _hasEvent: function(id) {
      if (!id) return false;
      try {
        if (typeof Events !== 'undefined' && Events.findDef) {
          return !!Events.findDef(id);
        }
      } catch (e) {}
      var card = GameState.currentCard;
      if (!card || !card.worldbook) return false;
      var list = card.worldbook.events || [];
      var found = false;
      list.forEach(function(x) { if (!found && x.id === id) found = true; });
      return found;
    },

    _hasTask: function(id) {
      if (!id) return false;
      try {
        if (typeof Tasks !== 'undefined' && Tasks._findDef) {
          return !!Tasks._findDef(id);
        }
      } catch (e) {}
      var card = GameState.currentCard;
      if (!card || !card.worldbook) return false;
      var list = card.worldbook.tasks || [];
      var found = false;
      list.forEach(function(x) { if (!found && x.id === id) found = true; });
      return found;
    },

    _hasAchievement: function(id) {
      if (!id) return false;
      var card = GameState.currentCard;
      if (!card || !card.worldbook) return false;
      var list = card.worldbook.achievements || [];
      var found = false;
      list.forEach(function(x) { if (!found && x.id === id) found = true; });
      return found;
    },

    _hasEnding: function(id) {
      if (!id) return false;
      var card = GameState.currentCard;
      if (!card || !card.worldbook) return false;
      var list = card.worldbook.endings || [];
      var found = false;
      list.forEach(function(x) { if (!found && x.id === id) found = true; });
      return found;
    },

    _hasNode: function(id) {
      if (!id) return false;
      try {
        if (typeof StoryNodes !== 'undefined' && StoryNodes.findNode) {
          return !!StoryNodes.findNode(id);
        }
      } catch (e) {}
      return false;
    },

    _hasForeshadow: function(id) {
      if (!id) return false;
      try {
        if (typeof StoryNodes !== 'undefined' && StoryNodes.findForeshadow) {
          return !!StoryNodes.findForeshadow(id);
        }
      } catch (e) {}
      return false;
    },

    _hasShop: function(id) {
      if (!id) return false;
      try {
        if (typeof Shop !== 'undefined' && Shop.findShop) {
          return !!Shop.findShop(id);
        }
      } catch (e) {}
      var card = GameState.currentCard;
      if (!card || !card.worldbook) return false;
      var list = card.worldbook.shops || [];
      var found = false;
      list.forEach(function(x) { if (!found && x.id === id) found = true; });
      return found;
    },

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

    // 从 currentState 里查数值项（hud / sidebar / panels）
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

    // ============ 各类型的校验规则 ============
    _handlers: {

      modify_hud: function(pl) {
        if (!pl.key) return { ok: false, reason: '提议缺少 key' };
        if (!this._findStat(pl.key)) return { ok: false, reason: '数值项「' + pl.key + '」已不存在' };
        return { ok: true };
      },

      modify_sidebar: function(pl) {
        if (!pl.key) return { ok: false, reason: '提议缺少 key' };
        if (!this._findStat(pl.key)) return { ok: false, reason: '数值项「' + pl.key + '」已不存在' };
        return { ok: true };
      },

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
