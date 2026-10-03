// ============================================================
// 天气系统
// 三种模式：off / card（卡带自定义）/ real（同步现实）
// v3：set_weather / query_weather 加模式检查（关了就拒绝）
// 数据：
//   全局配置  ai_tg_global.weather = { mode, realSource, manualCity, cacheRefresh, ipCache }
//   存档运行时 /saves/{cardId}/{saveId}/weather.json
//   卡带配置  card.worldbook.weather
// ============================================================

(function() {
  var REAL_UPDATE_MINUTES = 30;
  var IP_CACHE_DEFAULT = 'weekly';

  var WWO_MAP = {
    '113': { type: '晴', icon: 'sun' },
    '116': { type: '多云', icon: 'cloud-sun' },
    '119': { type: '阴', icon: 'cloud' },
    '122': { type: '阴', icon: 'cloud' },
    '143': { type: '薄雾', icon: 'cloud-fog' },
    '176': { type: '阵雨', icon: 'cloud-rain' },
    '179': { type: '阵雪', icon: 'cloud-snow' },
    '182': { type: '雨夹雪', icon: 'cloud-snow' },
    '185': { type: '冻雨', icon: 'cloud-rain' },
    '200': { type: '雷阵雨', icon: 'cloud-lightning' },
    '227': { type: '风吹雪', icon: 'cloud-snow' },
    '230': { type: '暴风雪', icon: 'snowflake' },
    '248': { type: '雾', icon: 'cloud-fog' },
    '260': { type: '冻雾', icon: 'cloud-fog' },
    '263': { type: '小雨', icon: 'cloud-rain' },
    '266': { type: '小雨', icon: 'cloud-rain' },
    '281': { type: '冻雨', icon: 'cloud-rain' },
    '284': { type: '冻雨', icon: 'cloud-rain' },
    '293': { type: '小雨', icon: 'cloud-rain' },
    '296': { type: '小雨', icon: 'cloud-rain' },
    '299': { type: '中雨', icon: 'cloud-rain' },
    '302': { type: '中雨', icon: 'cloud-rain' },
    '305': { type: '大雨', icon: 'cloud-rain' },
    '308': { type: '大雨', icon: 'cloud-rain' },
    '311': { type: '冻雨', icon: 'cloud-rain' },
    '314': { type: '冻雨', icon: 'cloud-rain' },
    '317': { type: '雨夹雪', icon: 'cloud-snow' },
    '320': { type: '小雪', icon: 'cloud-snow' },
    '323': { type: '小雪', icon: 'cloud-snow' },
    '326': { type: '小雪', icon: 'cloud-snow' },
    '329': { type: '中雪', icon: 'snowflake' },
    '332': { type: '中雪', icon: 'snowflake' },
    '335': { type: '大雪', icon: 'snowflake' },
    '338': { type: '大雪', icon: 'snowflake' },
    '350': { type: '冰粒', icon: 'cloud-snow' },
    '353': { type: '阵雨', icon: 'cloud-rain' },
    '356': { type: '大雨', icon: 'cloud-rain' },
    '359': { type: '暴雨', icon: 'cloud-rain' },
    '362': { type: '雨夹雪', icon: 'cloud-snow' },
    '365': { type: '雨夹雪', icon: 'cloud-snow' },
    '368': { type: '小雪', icon: 'cloud-snow' },
    '371': { type: '大雪', icon: 'snowflake' },
    '374': { type: '冰粒', icon: 'cloud-snow' },
    '377': { type: '冰粒', icon: 'cloud-snow' },
    '386': { type: '雷阵雨', icon: 'cloud-lightning' },
    '389': { type: '雷暴雨', icon: 'cloud-lightning' },
    '392': { type: '雷雪', icon: 'snowflake' },
    '395': { type: '雷雪', icon: 'snowflake' }
  };

  function getConfig() {
    var g = Storage.getGlobal();
    var d = {
      mode: 'off',
      realSource: 'ip',
      manualCity: '',
      cacheRefresh: 'weekly',
      ipCache: null
    };
    var cur = g.weather || {};
    var out = Object.assign(d, cur);
    if (!out.ipCache) out.ipCache = null;
    return out;
  }

  function setConfig(patch) {
    var g = Storage.getGlobal();
    g.weather = Object.assign(getConfig(), patch);
    Storage.setGlobal(g);
  }

  // 计算当前生效的天气模式（卡带 > 全局）
  function getEffectiveMode() {
    var cfg = getConfig();
    var card = GameState.currentCard;
    var cardCfg = card && card.worldbook && card.worldbook.weather || null;
    return (cardCfg && cardCfg.mode) || cfg.mode || 'off';
  }

  // ============================================================
  // 存档运行时
  // ============================================================
  var runtime = {
    _data: null,

    _path: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/weather.json';
    },

    load: function() {
      var p = this._path();
      if (!p) { this._data = null; return; }
      this._data = VFS.readJSON(p) || null;
    },

    save: function() {
      var p = this._path();
      if (!p || !this._data) return;
      VFS.writeJSON(p, this._data);
    },

    get: function() {
      if (!this._data) this.load();
      return this._data;
    },

    set: function(obj) {
      if (!this._data) this.load();
      this._data = obj;
      this.save();
    }
  };

  // ============================================================
  // 卡带天气池
  // ============================================================
  function getCardWeatherConfig() {
    var card = GameState.currentCard;
    if (!card) return null;
    return card.worldbook && card.worldbook.weather || null;
  }

  function pickCardWeather(cardCfg, gameDate) {
    var month = (gameDate && gameDate.month) || 1;
    var season = month >= 3 && month <= 5 ? '春' :
                 month >= 6 && month <= 8 ? '夏' :
                 month >= 9 && month <= 11 ? '秋' : '冬';
    var pool = (cardCfg.pool || []).filter(function(p) {
      if (!p.seasons || !p.seasons.length) return true;
      return p.seasons.indexOf(season) >= 0;
    });
    if (!pool.length) pool = cardCfg.pool || [];
    if (!pool.length) return null;

    var total = 0;
    pool.forEach(function(p) { total += (p.weight || 1); });
    var r = Math.random() * total;
    var acc = 0;
    for (var i = 0; i < pool.length; i++) {
      acc += (pool[i].weight || 1);
      if (r <= acc) return pool[i];
    }
    return pool[pool.length - 1];
  }

  // ============================================================
  // 现实天气
  // ============================================================
  async function fetchIpCity(cfg) {
    var now = Date.now();
    if (cfg.ipCache && cfg.ipCache.city && cfg.cacheRefresh !== 'never') {
      var maxAge = cfg.cacheRefresh === 'daily' ? 24 * 3600 * 1000 : 7 * 24 * 3600 * 1000;
      if (now - (cfg.ipCache.fetchedAt || 0) < maxAge) {
        return cfg.ipCache;
      }
    }
    if (cfg.cacheRefresh === 'never' && cfg.ipCache && cfg.ipCache.city) {
      return cfg.ipCache;
    }
    try {
      var r = await Platform.http('https://ipapi.co/json/');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var d = await r.json();
      var city = d.city || d.region || d.country_name || '';
      if (!city) throw new Error('未返回城市');
      var cache = { city: city, country: d.country_code || '', lat: d.latitude, lon: d.longitude, fetchedAt: now };
      setConfig({ ipCache: cache });
      return cache;
    } catch (e) {
      console.warn('[Weather] IP 定位失败：', e.message);
      if (cfg.ipCache && cfg.ipCache.city) return cfg.ipCache;
      return null;
    }
  }

  async function fetchRealWeather(city) {
    if (!city) return null;
    try {
      var url = 'https://wttr.in/' + encodeURIComponent(city) + '?format=j1';
      var r = await Platform.http(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var d = await r.json();
      var cur = d.current_condition && d.current_condition[0];
      if (!cur) throw new Error('无当前天气数据');
      var code = cur.weatherCode;
      var mapped = WWO_MAP[code] || { type: cur.weatherDesc && cur.weatherDesc[0] && cur.weatherDesc[0].value || '未知', icon: 'cloud-sun' };
      return {
        type: mapped.type,
        icon: mapped.icon,
        raw: cur,
        city: city,
        fetchedAt: Date.now()
      };
    } catch (e) {
      console.warn('[Weather] 获取现实天气失败：', e.message);
      return null;
    }
  }

  // ============================================================
  // 主对象
  // ============================================================
  var Weather = {
    getConfig: getConfig,
    setConfig: setConfig,
    getEffectiveMode: getEffectiveMode,

    // ============ 快照接口 ============
    getRuntime: function() {
      if (!runtime._data) runtime.load();
      return runtime._data ? JSON.parse(JSON.stringify(runtime._data)) : null;
    },
    setRuntime: function(data) {
      runtime._data = data ? JSON.parse(JSON.stringify(data)) : null;
      runtime.save();
    },

    // ============ 初始化/刷新 ============
    init: async function() {
      var cfg = getConfig();
      var card = GameState.currentCard;
      var cardCfg = card && card.worldbook && card.worldbook.weather || null;
      var mode = (cardCfg && cardCfg.mode) || cfg.mode || 'off';
      if (mode === 'off') return;

      var rt = runtime.get() || {};
      if (rt.mode === mode && rt.current) return;

      if (mode === 'card') {
        if (!cardCfg || !cardCfg.pool || !cardCfg.pool.length) {
          runtime.set({ mode: 'card', current: null });
          return;
        }
        var picked = pickCardWeather(cardCfg, GameState._gameTime);
        runtime.set({
          mode: 'card',
          current: {
            type: picked.type,
            icon: picked.icon,
            since: GameState.formatGameTime(),
            effects: picked.effects || null
          }
        });
        return;
      }

      if (mode === 'real') {
        var city = null;
        if (cfg.realSource === 'manual' && cfg.manualCity) {
          city = cfg.manualCity;
        } else {
          var ipInfo = await fetchIpCity(cfg);
          if (ipInfo) city = ipInfo.city;
        }
        if (!city) {
          runtime.set({ mode: 'real', current: null });
          return;
        }
        var w = await fetchRealWeather(city);
        if (w) {
          runtime.set({
            mode: 'real',
            city: city,
            current: {
              type: w.type,
              icon: w.icon,
              since: GameState.formatGameTime(),
              fetchedAt: w.fetchedAt
            }
          });
        }
      }
    },

    tick: async function() {
      var cfg = getConfig();
      var card = GameState.currentCard;
      var cardCfg = card && card.worldbook && card.worldbook.weather || null;
      var mode = (cardCfg && cardCfg.mode) || cfg.mode || 'off';
      if (mode === 'off') return;

      var rt = runtime.get() || {};

      if (mode === 'card') {
        var interval = cardCfg.changeEvery || 'daily';
        if (!rt.current) { await this.init(); return; }
        var since = rt.current.since;
        if (!since) return;
        var elapsedMinutes = this._minutesBetween(since, GameState.formatGameTime());
        var threshold = 0;
        if (interval === '6h') threshold = 6 * 60;
        else if (interval === '12h') threshold = 12 * 60;
        else if (interval === 'daily') threshold = 24 * 60;
        else threshold = 24 * 60;
        if (elapsedMinutes >= threshold) {
          var picked = pickCardWeather(cardCfg, GameState._gameTime);
          if (picked) {
            rt.current = {
              type: picked.type,
              icon: picked.icon,
              since: GameState.formatGameTime(),
              effects: picked.effects || null
            };
            runtime.set(rt);
            this._applyEffects(picked.effects);
          }
        }
        return;
      }

      if (mode === 'real') {
        var lastFetch = rt.current && rt.current.fetchedAt || 0;
        if (Date.now() - lastFetch < REAL_UPDATE_MINUTES * 60 * 1000) return;
        await this.refreshNow();
      }
    },

    refreshNow: async function() {
      var cfg = getConfig();
      if (getEffectiveMode() !== 'real') {
        return { ok: false, reason: '当前不是现实天气模式' };
      }
      var city = null;
      if (cfg.realSource === 'manual' && cfg.manualCity) city = cfg.manualCity;
      else {
        var ipInfo = await fetchIpCity(cfg);
        if (ipInfo) city = ipInfo.city;
      }
      if (!city) return { ok: false, reason: '无法确定城市' };
      var w = await fetchRealWeather(city);
      if (!w) return { ok: false, reason: '获取天气失败' };
      runtime.set({
        mode: 'real',
        city: city,
        current: {
          type: w.type,
          icon: w.icon,
          since: GameState.formatGameTime(),
          fetchedAt: w.fetchedAt
        }
      });
      return { ok: true, city: city, type: w.type, icon: w.icon };
    },

    refreshIpCache: async function() {
      setConfig({ ipCache: null });
      var cfg = getConfig();
      var r = await fetchIpCity(cfg);
      return r ? { ok: true, city: r.city } : { ok: false, reason: 'IP 定位失败' };
    },

    _applyEffects: function(effects) {
      if (!effects || typeof effects !== 'object') return [];
      var st = GameState.currentState;
      if (!st) return [];
      var applied = [];
      Object.keys(effects).forEach(function(key) {
        var delta = Number(effects[key]);
        if (!delta) return;
        var scope = null, panelId = null, item = null;
        item = (st.hud || []).find(function(x) { return x.key === key; });
        if (item) scope = 'hud';
        if (!item) {
          item = (st.sidebar || []).find(function(x) { return x.key === key; });
          if (item) scope = 'sidebar';
        }
        if (!item) {
          Object.keys(st.panels || {}).forEach(function(pid) {
            (st.panels[pid].entries || []).forEach(function(e) {
              if (e.key === key && !item) { item = e; scope = 'entry'; panelId = pid; }
            });
          });
        }
        if (item && scope) {
          var r = ToolExecutor._modifyStat(scope, panelId, key, delta);
          if (r.ok) applied.push({ key: key, oldVal: r.oldVal, newVal: r.newVal, delta: r.delta, label: r.label });
        }
      });
      return applied;
    },

    _minutesBetween: function(t1, t2) {
      function parse(s) {
        if (!s) return null;
        var m = s.match(/^(\d+)-(\d+)-(\d+)\s+(\d+):(\d+)$/);
        if (!m) return null;
        var y = parseInt(m[1], 10);
        var mo = parseInt(m[2], 10);
        var d = parseInt(m[3], 10);
        var h = parseInt(m[4], 10);
        var mi = parseInt(m[5], 10);
        return ((y * 12 + mo) * 30 + d) * 24 * 60 + h * 60 + mi;
      }
      var a = parse(t1), b = parse(t2);
      if (a == null || b == null) return 0;
      return Math.max(0, b - a);
    },

    formatForPrompt: function() {
      var rt = runtime.get();
      if (!rt || !rt.current) return '';
      var c = rt.current;
      var extra = rt.mode === 'real' && rt.city ? '（现实·' + rt.city + '）' : '';
      return '>>> 当前天气：' + c.icon + ' ' + c.type + extra + '（' + c.since + ' 起）';
    },

    getCurrent: function() {
      var rt = runtime.get();
      return rt ? rt.current : null;
    },

    forceSet: function(type, icon) {
      var rt = runtime.get() || {};
      rt.current = {
        type: type,
        icon: icon || 'cloud-sun',
        since: GameState.formatGameTime(),
        manual: true
      };
      runtime.set(rt);
      // 按 type 查池取效果
      var cardCfg = getCardWeatherConfig();
      var applied = [];
      if (cardCfg && Array.isArray(cardCfg.pool)) {
        var matched = null;
        cardCfg.pool.forEach(function(p) { if (!matched && p.type === type) matched = p; });
        if (matched && matched.effects) {
          applied = this._applyEffects(matched.effects);
        }
      }
      rt.current.applied = applied;
      runtime.set(rt);
      return rt.current;
    },

    clear: function() {
      runtime.set({ mode: 'off', current: null });
    }
  };

  // ============ 工具注册 ============
  function registerTools() {
    if (typeof ToolExecutor === 'undefined' || !ToolExecutor.WHITELIST) {
      if (typeof ErrorLog !== 'undefined' && ErrorLog.action) {
        ErrorLog.action('BOOT', 'Weather 工具注册失败：ToolExecutor 未就绪');
      }
      if (typeof console !== 'undefined') console.error('[Weather] 工具注册失败：ToolExecutor 未就绪');
      return;
    }

    ToolExecutor.WHITELIST.set_weather = {
      run: function(a) {
        if (!a.type) return { ok: false, reason: '缺少 type' };
        // ★ 模式检查：关了天气就不许改
        if (getEffectiveMode() === 'off') {
          return { ok: false, reason: '天气系统未启用' };
        }
        var icon = a.icon || 'cloud-sun';
        var r = Weather.forceSet(a.type, icon);
        return {
          ok: true,
          type: 'weather',
          action: 'set',
          weatherType: r.type,
          icon: r.icon,
          label: '天气·' + r.type
        };
      }
    };

    ToolExecutor.WHITELIST.query_weather = {
      run: function() {
        // ★ 模式检查：关了天气就返回空
        if (getEffectiveMode() === 'off') {
          return { ok: true, type: 'query', queryType: 'weather', data: { current: null } };
        }
        var cur = Weather.getCurrent();
        if (!cur) return { ok: true, type: 'query', queryType: 'weather', data: { current: null } };
        return { ok: true, type: 'query', queryType: 'weather', data: cur };
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
  if (typeof window !== 'undefined') window.Weather = Weather;
  if (typeof module !== 'undefined' && module.exports) module.exports = Weather;
})();