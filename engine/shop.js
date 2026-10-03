// ============================================================
// 商店系统核心逻辑
// - 库存管理（按商店 id 存运行时）
// - 货币扣除（对接 character 的货币数值）
// - 商品购买 / 出售
// - 面板开关（供 UI 层调用）
// 数据存：/saves/{cardId}/{saveId}/shops_runtime.json
// ============================================================

(function() {
  // ---- M5b · 注入式防御 require（Electron 走 window，RN 走 require）----
  var Platform = (typeof require === 'function' && typeof window === 'undefined')
    ? require('../platform/platform_adapter.js')
    : (typeof window !== 'undefined' ? window.Platform : undefined);
  // ------------------------------------------------------------------
  var Shop = {
    _data: null,

    _path: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/shops_runtime.json';
    },

    load: function() {
      var p = this._path();
      if (!p) { this._data = {}; return; }
      var d = VFS.readJSON(p);
      this._data = d || {};
    },

    save: function() {
      var p = this._path();
      if (!p || !this._data) return;
      VFS.writeJSON(p, this._data);
    },

    getRuntime: function() {
      if (!this._data) this.load();
      return this._data ? JSON.parse(JSON.stringify(this._data)) : null;
    },
    setRuntime: function(data) {
      this._data = data ? JSON.parse(JSON.stringify(data)) : null;
      this.save();
    },

    // 找商店定义
    findShop: function(shopId) {
      var card = GameState.currentCard;
      if (!card) return null;
      var wb = card.worldbook || {};
      var shops = wb.shops || [];
      var found = null;
      shops.forEach(function(s) { if (s.id === shopId) found = s; });
      return found;
    },

    listShops: function() {
      var card = GameState.currentCard;
      if (!card) return [];
      var wb = card.worldbook || {};
      return wb.shops || [];
    },
    // 获取商店运行时（库存），首次访问时初始化
    _ensureRuntime: function(shopId) {
      if (!this._data) this.load();
      if (this._data[shopId]) return this._data[shopId];
      var shop = this.findShop(shopId);
      if (!shop) return null;
      var stock = {};
      (shop.items || []).forEach(function(it) {
        if (it.id) stock[it.id] = (it.stock != null ? it.stock : -1);
      });
      this._data[shopId] = {
        stock: stock,
        sold: {},
        lastRefreshAt: GameState.formatGameTime()
      };
      this.save();
      return this._data[shopId];
    },

    // 取商品当前库存
    getStock: function(shopId, itemId) {
      var rt = this._ensureRuntime(shopId);
      if (!rt) return 0;
      var v = rt.stock[itemId];
      return v != null ? v : 0;
    },

    // 读玩家身上某种货币的数量
    _getPlayerCurrency: function(currencyId) {
      var st = GameState.currentState;
      if (!st) return 0;
      // 匹配规则：先精确匹配 key，再按 name 兜底
      // （商店 currencyId 可能填的是 hud 项的 key，也可能是货币名）
      function _find(list) {
        if (!Array.isArray(list)) return null;
        var byKey = list.find(function(x) { return x && x.key === currencyId; });
        if (byKey) return byKey;
        return list.find(function(x) { return x && x.name === currencyId; }) || null;
      }
      var hudItem = _find(st.hud);
      if (hudItem) return Number(hudItem.current) || 0;
      var sbItem = _find(st.sidebar);
      if (sbItem) return Number(sbItem.current) || 0;
      var found = null;
      Object.keys(st.panels || {}).forEach(function(pid) {
        if (found) return;
        var e = _find(st.panels[pid].entries || []);
        if (e) found = e;
      });
      if (found) return Number(found.current) || 0;
      var pd = GameState.playerData;
      if (pd && pd[currencyId] != null) return Number(pd[currencyId]) || 0;
      return 0;
    },

    // 修改玩家货币（直接走 ToolExecutor 的 modify 逻辑，兼容上限）
    _changeCurrency: function(currencyId, delta) {
      var st = GameState.currentState;
      if (!st) return { ok: false, reason: '未在游戏中' };

      var item = null;
      var scope = null;
      var panelId = null;
      // 匹配规则：先精确匹配 key，再按 name 兜底（防止同名项抢匹配）
      function _find(list) {
        if (!Array.isArray(list)) return null;
        var byKey = list.find(function(x) { return x && x.key === currencyId; });
        if (byKey) return byKey;
        return list.find(function(x) { return x && x.name === currencyId; }) || null;
      }

      item = _find(st.hud);
      if (item) scope = 'hud';
      if (!item) {
        item = _find(st.sidebar);
        if (item) scope = 'sidebar';
      }
      if (!item) {
        Object.keys(st.panels || {}).forEach(function(pid) {
          if (item) return;
          var e = _find(st.panels[pid].entries || []);
          if (e) { item = e; scope = 'entry'; panelId = pid; }
        });
      }

      if (item && scope) {
        // 数值项可能没有 key（AI 生成卡带常见）：此时把货币 id（即它的 name）
        // 传给 _modifyStat，由后者按 name 兜底定位，避免 key=undefined 直接报“参数缺失”
        var targetKey = (item.key != null && item.key !== '') ? item.key : currencyId;
        return ToolExecutor._modifyStat(scope, panelId, targetKey, delta);
      }

      var pd = GameState.playerData;
      if (!pd) return { ok: false, reason: '玩家数据不存在' };
      var cur = Number(pd[currencyId]) || 0;
      pd[currencyId] = cur + delta;
      return { ok: true, oldVal: cur, newVal: pd[currencyId], delta: pd[currencyId] - cur };
    },

    // 购买
    buy: function(shopId, itemId, count) {
      count = Math.max(1, parseInt(count) || 1);
      var shop = this.findShop(shopId);
      if (!shop) return { ok: false, reason: '商店不存在' };
      var item = (shop.items || []).find(function(x) { return x.id === itemId; });
      if (!item) return { ok: false, reason: '商品不存在' };

      var rt = this._ensureRuntime(shopId);
      if (!rt) return { ok: false, reason: '商店初始化失败' };

      var stock = rt.stock[itemId] != null ? rt.stock[itemId] : 0;
      if (stock >= 0 && stock < count) return { ok: false, reason: '库存不足（剩 ' + stock + '）' };

      var price = (Number(item.price) || 0) * count;
      var currencyId = item.currencyId || (shop.currencyId) || '';
      if (!currencyId) {
        // 没指定货币 → 从卡带 currency 里取主货币
        var wb = GameState.currentCard.worldbook || {};
        var cur = wb.currency || {};
        var mains = (cur.currencies || []).filter(function(c) { return c.isMain; });
        if (mains.length) currencyId = mains[0].name || mains[0].id;
      }

      var playerHas = currencyId ? this._getPlayerCurrency(currencyId) : 0;
      if (price > 0 && playerHas < price) {
        return { ok: false, reason: '钱不够（需要 ' + price + ' ' + currencyId + '，你有 ' + playerHas + '）' };
      }

      // 扣钱
      var payResult = { ok: true };
      if (price > 0 && currencyId) {
        payResult = this._changeCurrency(currencyId, -price);
        if (!payResult.ok) return { ok: false, reason: '扣款失败：' + payResult.reason };
      }

      // 减库存
      if (stock >= 0) rt.stock[itemId] = stock - count;

      // 给物品（走 playerData.inventory）
      // 分类必须是 UI 物品栏渲染的四类之一，非法值（AI 卡带可能写 "consumable"/中文）
      // 一律归入 bar，规则与 ToolExecutor._addItem 保持一致，否则物品会 push 进一个
      // 界面永远不渲染的数组，玩家看起来就是“没进背包”
      var VALID_CATEGORIES = ['bar', 'common', 'story', 'rare'];
      var category = VALID_CATEGORIES.indexOf(item.category) >= 0 ? item.category : 'bar';
      if (!GameState.playerData) GameState.playerData = {};
      if (!GameState.playerData.inventory) {
        GameState.playerData.inventory = { bar: [], common: [], story: [], rare: [] };
      }
      var inv = GameState.playerData.inventory;
      if (!inv[category]) inv[category] = [];
      for (var i = 0; i < count; i++) {
        inv[category].push({ name: item.name, desc: item.desc || '' });
      }

      rt.sold[itemId] = (rt.sold[itemId] || 0) + count;
      this.save();
      // UI_Shop 直购不走 story.js 的工具执行链路，那里的 GameState.persist() 不会触发；
      // 必须在这里落盘，否则重进存档后金币和物品都会回滚
      try { if (GameState.persist) GameState.persist(); } catch (e) {}

      return {
        ok: true,
        action: 'buy',
        shop: shop.name,
        item: item.name,
        count: count,
        paid: price,
        currency: currencyId,
        remainCurrency: currencyId ? this._getPlayerCurrency(currencyId) : 0
      };
    },

    // 出售（玩家卖给商店）
    sell: function(shopId, invItemName) {
      var shop = this.findShop(shopId);
      if (!shop) return { ok: false, reason: '商店不存在' };

      // 从玩家背包里找这个物品
      var inv = GameState.playerData.inventory || {};
      var found = null, foundCat = null, foundIdx = -1;
      ['bar', 'common', 'story', 'rare'].forEach(function(cat) {
        if (found) return;
        (inv[cat] || []).forEach(function(it, idx) {
          if (!found && (it.name === invItemName || it === invItemName)) {
            found = it; foundCat = cat; foundIdx = idx;
          }
        });
      });
      if (!found) return { ok: false, reason: '背包里没有这个物品' };

      // 找商店里对应商品（按名字匹配），用它的 price × 0.5 作为收购价
      var itemDef = (shop.items || []).find(function(x) { return x.name === invItemName; });
      var basePrice = itemDef ? (itemDef.price || 0) : 10;
      var sellPrice = Math.floor(basePrice * 0.5);

      var currencyId = (itemDef && itemDef.currencyId) || (shop.currencyId) || '';
      if (!currencyId) {
        var wb = GameState.currentCard.worldbook || {};
        var mains = ((wb.currency || {}).currencies || []).filter(function(c) { return c.isMain; });
        if (mains.length) currencyId = mains[0].name || mains[0].id;
      }

      // 移除物品
      inv[foundCat].splice(foundIdx, 1);

      // 给钱
      if (sellPrice > 0 && currencyId) this._changeCurrency(currencyId, sellPrice);

      this.save();
      // 与 buy 同理：UI 直售路径不经过 story.js，需要手动落盘
      try { if (GameState.persist) GameState.persist(); } catch (e) {}

      return {
        ok: true,
        action: 'sell',
        shop: shop.name,
        item: invItemName,
        earned: sellPrice,
        currency: currencyId
      };
    },

    // 补货（按 refresh 规则）
    tryRefresh: function(shopId) {
      var shop = this.findShop(shopId);
      if (!shop) return;
      var rule = shop.refresh || 'none';
      if (rule === 'none') return;
      var rt = this._ensureRuntime(shopId);
      if (!rt) return;

      var now = GameState.formatGameTime();
      var last = rt.lastRefreshAt || '';

      var shouldRefresh = false;
      if (rule === 'daily') {
        // 简化：游戏内日期变了就刷新
        var nowDate = now.slice(0, 10);
        var lastDate = last.slice(0, 10);
        if (nowDate !== lastDate) shouldRefresh = true;
      } else if (rule === 'weekly') {
        // 游戏内 7 天一次
        var d1 = new Date(last.replace(/-/g, '/'));
        var d2 = new Date(now.replace(/-/g, '/'));
        if ((d2 - d1) / (1000 * 60 * 60 * 24) >= 7) shouldRefresh = true;
      } else if (rule === 'story') {
        // 剧情触发 → 由外部手动调 refresh
        return;
      }

      if (shouldRefresh) this.refresh(shopId);
    },

    // 强制补货
    refresh: function(shopId) {
      var shop = this.findShop(shopId);
      if (!shop) return;
      var rt = this._ensureRuntime(shopId);
      if (!rt) return;
      (shop.items || []).forEach(function(it) {
        if (it.id && it.stock != null && it.stock >= 0) {
          rt.stock[it.id] = it.stock;
        }
      });
      rt.lastRefreshAt = GameState.formatGameTime();
      this.save();
    },

    // 给 prompt 用：商店简报（AI 知道有哪些商店）
    formatShopsForPrompt: function() {
      var shops = this.listShops();
      if (!shops.length) return '';
      var lines = [];
      shops.forEach(function(s) {
        var loc = s.locationId ? (' @' + s.locationId) : '';
        var npc = s.npcId ? (' 由 ' + s.npcId + ' 经营') : '';
        lines.push('· ' + (s.name || s.id) + '(id=' + s.id + ')' + loc + npc);
      });
      return lines.join('\n');
    }
  };

  // ============ 工具注册 ============
  function registerTools() {
    if (typeof ToolExecutor === 'undefined' || !ToolExecutor.WHITELIST) {
      if (typeof ErrorLog !== 'undefined' && ErrorLog.action) {
        ErrorLog.action('BOOT', 'Shop 工具注册失败：ToolExecutor 未就绪');
      }
      if (typeof console !== 'undefined') console.error('[Shop] 工具注册失败：ToolExecutor 未就绪');
      return;
    }

    ToolExecutor.WHITELIST.open_shop = {
      run: function(a) {
        if (!a.id) return { ok: false, reason: '缺少商店 id' };
        var shop = Shop.findShop(a.id);
        if (!shop) return { ok: false, reason: '商店不存在：' + a.id };
        Shop.tryRefresh(a.id);
        // 面板由 UI 层异步弹出（通过 Platform.ui 抽象，跨层解耦）
        if (Platform && Platform.ui && typeof Platform.ui.openShop === 'function') {
          setTimeout(function() { Platform.ui.openShop(a.id); }, 50);
        }
        return {
          ok: true,
          type: 'shop',
          action: 'open',
          shopId: a.id,
          shopName: shop.name
        };
      }
    };

    ToolExecutor.WHITELIST.buy_item = {
      run: function(a) {
        if (!a.shopId || !a.itemId) return { ok: false, reason: '缺少 shopId 或 itemId' };
        var r = Shop.buy(a.shopId, a.itemId, a.count || 1);
        if (!r.ok) return r;
        return {
          ok: true,
          type: 'shop',
          action: 'buy',
          shopId: a.shopId,
          shopName: r.shop,
          item: r.item,
          count: r.count,
          paid: r.paid,
          currency: r.currency,
          remainCurrency: r.remainCurrency,
          label: '购买 ' + r.item + '×' + r.count
        };
      }
    };

    ToolExecutor.WHITELIST.sell_item = {
      run: function(a) {
        if (!a.shopId || !a.itemName) return { ok: false, reason: '缺少 shopId 或 itemName' };
        var r = Shop.sell(a.shopId, a.itemName);
        if (!r.ok) return r;
        return {
          ok: true,
          type: 'shop',
          action: 'sell',
          shopId: a.shopId,
          shopName: r.shop,
          item: r.item,
          earned: r.earned,
          currency: r.currency,
          label: '出售 ' + r.item
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

  if (typeof window !== 'undefined') window.Shop = Shop;
  if (typeof module !== 'undefined' && module.exports) module.exports = Shop;
})();