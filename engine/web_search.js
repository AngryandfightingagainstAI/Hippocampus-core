// ============================================================
// 联网搜索 · 多后端
// 数据存 localStorage: ai_tg_global.search = { profiles: [...], activeId }
// 支持：博查 / Tavily / Serper / Google CSE / Bing / 自定义
// v2：修 update 保存 bug + 默认 endpoint 改 api.bocha.cn
// ============================================================
// 平台依赖：Platform.http

(function() {
  function uid() { return 's_' + Date.now() + '_' + Math.floor(Math.random() * 1000); }

  var PRESETS = [
    { name: '博查 Bocha',  backend: 'bocha',   endpoint: 'https://api.bocha.cn/v1/web-search', model: '', note: '国内直连，中文准' },
    { name: 'Tavily',      backend: 'tavily',  endpoint: 'https://api.tavily.com/search',         model: '', note: 'AI 优化，摘要好' },
    { name: 'Serper',      backend: 'serper',  endpoint: 'https://google.serper.dev/search',      model: '', note: 'Google 结果' },
    { name: 'Google CSE',  backend: 'google',  endpoint: 'https://www.googleapis.com/customsearch/v1', model: '', note: '需 apiKey + cx' },
    { name: 'Bing',        backend: 'bing',    endpoint: 'https://api.bing.microsoft.com/v7.0/search', model: '', note: '微软搜索' },
    { name: '自定义',      backend: 'custom',  endpoint: '',                                         model: '', note: '自己填' }
  ];

  function defaultProfile(name, backend, endpoint) {
    return {
      id: uid(),
      name: name || '新配置',
      backend: backend || 'bocha',
      endpoint: endpoint || '',
      apiKey: '',
      cx: '',
      count: 3,
      timeout: 15000,
      customHeaders: '',
      customBody: ''
    };
  }

  // ---------- 各后端适配器 ----------
  var adapters = {
    bocha: async function(profile, query, count) {
      var resp = await Platform.http(profile.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + profile.apiKey
        },
        body: JSON.stringify({
          query: query,
          count: count,
          summary: true,
          freshness: 'noLimit'
        })
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + (await resp.text()).slice(0, 200));
      var data = await resp.json();
      var pages = (data && data.data && data.data.webPages && data.data.webPages.value) || [];
      return pages.slice(0, count).map(function(p) {
        return { title: p.name || '', url: p.url || '', snippet: p.snippet || p.summary || '' };
      });
    },

    tavily: async function(profile, query, count) {
      var resp = await Platform.http(profile.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: profile.apiKey,
          query: query,
          max_results: count,
          include_answer: false
        })
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + (await resp.text()).slice(0, 200));
      var data = await resp.json();
      return (data.results || []).slice(0, count).map(function(r) {
        return { title: r.title || '', url: r.url || '', snippet: r.content || '' };
      });
    },

    serper: async function(profile, query, count) {
      var resp = await Platform.http(profile.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': profile.apiKey
        },
        body: JSON.stringify({ q: query, num: count })
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + (await resp.text()).slice(0, 200));
      var data = await resp.json();
      return (data.organic || []).slice(0, count).map(function(r) {
        return { title: r.title || '', url: r.link || '', snippet: r.snippet || '' };
      });
    },

    google: async function(profile, query, count) {
      var url = profile.endpoint + '?key=' + encodeURIComponent(profile.apiKey) +
                '&cx=' + encodeURIComponent(profile.cx) +
                '&q=' + encodeURIComponent(query) +
                '&num=' + count;
      var resp = await Platform.http(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + (await resp.text()).slice(0, 200));
      var data = await resp.json();
      return (data.items || []).slice(0, count).map(function(r) {
        return { title: r.title || '', url: r.link || '', snippet: r.snippet || '' };
      });
    },

    bing: async function(profile, query, count) {
      var url = profile.endpoint + '?q=' + encodeURIComponent(query) + '&count=' + count;
      var resp = await Platform.http(url, {
        headers: { 'Ocp-Apim-Subscription-Key': profile.apiKey }
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + (await resp.text()).slice(0, 200));
      var data = await resp.json();
      var pages = (data.webPages && data.webPages.value) || [];
      return pages.slice(0, count).map(function(p) {
        return { title: p.name || '', url: p.url || '', snippet: p.snippet || '' };
      });
    },

    custom: async function(profile, query, count) {
      var headers = { 'Content-Type': 'application/json' };
      if (profile.apiKey) headers['Authorization'] = 'Bearer ' + profile.apiKey;
      try {
        if (profile.customHeaders) Object.assign(headers, JSON.parse(profile.customHeaders));
      } catch (e) {}
      var body = profile.customBody
        ? profile.customBody.replace(/\{query\}/g, query).replace(/\{count\}/g, count)
        : JSON.stringify({ query: query, count: count });
      var resp = await Platform.http(profile.endpoint, { method: 'POST', headers: headers, body: body });
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + (await resp.text()).slice(0, 200));
      var data = await resp.json();
      var arr = data.results || data.items || data.organic ||
                (data.data && data.data.webPages && data.data.webPages.value) ||
                (data.webPages && data.webPages.value) || [];
      return arr.slice(0, count).map(function(r) {
        return { title: r.title || r.name || '', url: r.url || r.link || '', snippet: r.snippet || r.content || r.summary || '' };
      });
    }
  };

  var WebSearchManager = {
    PRESETS: PRESETS,
    defaultProfile: defaultProfile,

    getAll: function() {
      var g = Storage.getGlobal();
      var s = g.search || {};
      if (!Array.isArray(s.profiles)) {
        var p = defaultProfile('博查 Bocha', 'bocha', 'https://api.bocha.cn/v1/web-search');
        s = { profiles: [p], activeId: p.id, enabled: false };
        g.search = s;
        Storage.setGlobal(g);
      }
      if (!s.profiles.length) {
        var p2 = defaultProfile('博查 Bocha', 'bocha', 'https://api.bocha.cn/v1/web-search');
        s.profiles.push(p2);
        s.activeId = p2.id;
        Storage.setGlobal(g);
      }
      if (!s.activeId || !s.profiles.some(function(x) { return x.id === s.activeId; })) {
        s.activeId = s.profiles[0].id;
        Storage.setGlobal(g);
      }
      if (s.enabled == null) s.enabled = false;
      return s;
    },

    getActive: function() {
      var s = this.getAll();
      return s.profiles.find(function(p) { return p.id === s.activeId; }) || s.profiles[0];
    },

    isEnabled: function() {
      var s = this.getAll();
      return !!s.enabled;
    },

    setEnabled: function(b) {
      var g = Storage.getGlobal();
      this.getAll();
      g = Storage.getGlobal();
      if (!g.search) return;
      g.search.enabled = !!b;
      Storage.setGlobal(g);
    },

    setActive: function(id) {
      var g = Storage.getGlobal();
      this.getAll();
      g = Storage.getGlobal();
      if (!g.search || !g.search.profiles) return;
      if (g.search.profiles.some(function(p) { return p.id === id; })) {
        g.search.activeId = id;
        Storage.setGlobal(g);
      }
    },

    add: function(template) {
      var g = Storage.getGlobal();
      this.getAll();
      g = Storage.getGlobal();
      if (!g.search || !g.search.profiles) return null;
      var p = template ? defaultProfile(template.name, template.backend, template.endpoint) : defaultProfile();
      g.search.profiles.push(p);
      Storage.setGlobal(g);
      return p;
    },

    duplicate: function(id) {
      var g = Storage.getGlobal();
      this.getAll();
      g = Storage.getGlobal();
      if (!g.search || !g.search.profiles) return null;
      var src = g.search.profiles.find(function(p) { return p.id === id; });
      if (!src) return null;
      var c = JSON.parse(JSON.stringify(src));
      c.id = uid();
      c.name = (src.name || '配置') + ' 副本';
      g.search.profiles.push(c);
      Storage.setGlobal(g);
      return c;
    },

    remove: function(id) {
      var g = Storage.getGlobal();
      this.getAll();
      g = Storage.getGlobal();
      if (!g.search || !g.search.profiles) return;
      if (g.search.profiles.length <= 1) { UI.toast('至少保留一个配置', { type: 'warn' }); return; }
      g.search.profiles = g.search.profiles.filter(function(p) { return p.id !== id; });
      if (g.search.activeId === id) g.search.activeId = g.search.profiles[0].id;
      Storage.setGlobal(g);
    },

    // ★ 修复：直接操作 g.search.profiles 里的引用
    update: function(id, patch) {
      var g = Storage.getGlobal();
      this.getAll();
      g = Storage.getGlobal();
      if (!g.search || !g.search.profiles) return;
      var p = g.search.profiles.find(function(x) { return x.id === id; });
      if (!p) return;
      Object.assign(p, patch);
      Storage.setGlobal(g);
    },

    query: async function(keyword, opts) {
      opts = opts || {};
      if (!this.isEnabled()) return { ok: false, reason: '联网未开启' };
      var all = this.getAll();
      var profile = opts.profileId ? all.profiles.find(function(p) { return p.id === opts.profileId; }) : (all.profiles.find(function(p) { return p.id === all.activeId; }) || all.profiles[0]);
      if (!profile) return { ok: false, reason: '没有可用的搜索配置' };
      var count = opts.count || profile.count || 3;
      var adapter = adapters[profile.backend] || adapters.custom;
      var t0 = Date.now();
      try {
        var results = await adapter(profile, keyword, count);
        var duration = Date.now() - t0;
        return {
          ok: true,
          keyword: keyword,
          backend: profile.backend,
          profileName: profile.name,
          count: results.length,
          duration: duration,
          results: results
        };
      } catch (e) {
        return {
          ok: false,
          reason: e.message || '搜索失败',
          keyword: keyword,
          backend: profile.backend,
          profileName: profile.name,
          duration: Date.now() - t0
        };
      }
    },

    formatForAI: function(result) {
      if (!result) return '（搜索无结果）';
      if (!result.ok) return '【搜索失败】' + (result.reason || '未知错误');
      if (!result.results.length) return '【搜索 "' + result.keyword + '"】无结果';
      var lines = ['【搜索 "' + result.keyword + '" · ' + result.count + ' 条 · 耗时 ' + result.duration + 'ms】'];
      result.results.forEach(function(r, i) {
        lines.push((i + 1) + '. ' + r.title);
        lines.push('   ' + r.url);
        if (r.snippet) lines.push('   ' + r.snippet.slice(0, 200).replace(/\n/g, ' '));
      });
      return lines.join('\n');
    }
  };

  // RN 侧导出（同 theme.js 双态范式）：桌面靠 window 挂载，RN/Hermes 无 window，
  // 由 rn_bootstrap.js load('WebSearchManager', ...) 取 module.exports 挂 globalThis。
  if (typeof window !== 'undefined') window.WebSearchManager = WebSearchManager;
  if (typeof module !== 'undefined' && module.exports) module.exports = WebSearchManager;
})();