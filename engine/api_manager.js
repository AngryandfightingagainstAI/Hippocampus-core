// ============================================================
// AI API 多配置管理
// v4：PRESETS 加 models 数组（供 UI 下拉）
// 平台依赖：Platform.dialog.alert（删除最后一个配置时的阻止弹窗）
// ============================================================

(function() {
  function uid() { return 'p_' + Date.now() + '_' + Math.floor(Math.random() * 1000); }

  var PRESETS = [
    { name: 'DeepSeek',   baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash',
      models: ['deepseek-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'],
      note: '国内直连；flash 便宜，v4-pro 带思维链' },
    { name: '豆包',       baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      model: 'doubao-pro-32k',
      models: ['doubao-pro-32k', 'doubao-pro-128k', 'doubao-lite-32k', 'doubao-lite-128k'],
      note: '国内直连，豆包系列' },
    { name: '千问',       baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
      models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long'],
      note: '国内直连，通义千问' },
    { name: 'Kimi',       baseUrl: 'https://api.moonshot.cn/v1',
      model: 'moonshot-v1-8k',
      models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-latest'],
      note: '国内直连，长上下文' },
    { name: '智谱 GLM',   baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4-flash',
      models: ['glm-4-flash', 'glm-4-plus', 'glm-4-air', 'glm-4-long'],
      note: '国内直连，便宜' },
    { name: 'Claude 中转', baseUrl: 'https://your-relay.example/v1',
      model: 'claude-3-5-sonnet-20241022',
      models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
      note: '中转站，自己填地址' },
    { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1',
      model: 'anthropic/claude-3.5-sonnet',
      models: ['anthropic/claude-3.5-sonnet', 'anthropic/claude-3.5-haiku', 'openai/gpt-4o', 'openai/gpt-4o-mini', 'google/gemini-2.0-flash-exp:free', 'deepseek/deepseek-chat'],
      note: '聚合平台，模型多' },
    { name: 'OpenAI',     baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'o1-mini', 'o3-mini'],
      note: '需代理' },
    { name: 'Ollama 本地', baseUrl: 'http://localhost:11434/v1',
      model: 'qwen2.5:7b',
      models: ['qwen2.5:7b', 'qwen2.5:14b', 'llama3.2', 'deepseek-r1:7b'],
      note: '本机跑，不用 key' },
    { name: '自定义',     baseUrl: '', model: '', models: [],
      note: '自己填' }
  ];

  function isThinkingModel(model) {
    return /reasoner|thinking|v4-pro|o1|o3|qwq|claude.*thinking/i.test(String(model || ''));
  }

  function defaultProfile(name, baseUrl, model) {
    var mt = 16384;
    if (isThinkingModel(model)) mt = 16384;
    return {
      id: uid(),
      name: name || '新配置',
      baseUrl: baseUrl || '',
      apiKey: '',
      model: model || '',
      temperature: 0.8,
      top_p: 0.95,
      max_tokens: mt,
      jsonMode: 'auto',
      reasoning: 'auto',
      stream: false
    };
  }

  var ApiManager = {
    PRESETS: PRESETS,
    defaultProfile: defaultProfile,
    isThinkingModel: isThinkingModel,

    getAll: function() {
      var g = Storage.getGlobal();
      var a = g.api || {};
      if (!Array.isArray(a.profiles)) {
        var legacy = { baseUrl: a.baseUrl || '', apiKey: a.apiKey || '', model: a.model || '' };
        var p = defaultProfile('默认配置', legacy.baseUrl, legacy.model);
        p.apiKey = legacy.apiKey;
        if (a.temperature != null) p.temperature = a.temperature;
        if (a.top_p != null) p.top_p = a.top_p;
        if (a.max_tokens != null) p.max_tokens = a.max_tokens;
        a = { profiles: [p], activeId: p.id };
        g.api = a;
        Storage.setGlobal(g);
      }
      if (!a.profiles.length) {
        a.profiles.push(defaultProfile('新配置'));
        a.activeId = a.profiles[0].id;
        Storage.setGlobal(g);
      }
      if (!a.activeId || !a.profiles.some(function(x) { return x.id === a.activeId; })) {
        a.activeId = a.profiles[0].id;
        Storage.setGlobal(g);
      }
      var changed = false;
      a.profiles.forEach(function(p) {
        if (isThinkingModel(p.model) && p.max_tokens && p.max_tokens < 16384) {
          p.max_tokens = 16384;
          changed = true;
        }
      });
      // 一次性存量迁移（口径照 storage.js 的 dice_enabled_migrated_v1）：
      // P5 只把「新配置默认值」与「思考模型」抬到 16384，老落盘配置不动，
      // 用户机上那条历史默认配置仍是 2048（表现为起始输出上限过小）。
      // 只认 ==2048（当年默认值，即用户从未动过）；用户显式设过的其它值一律不动。
      // 迁移只写一次：落盘 + 版本标记；之后用户手动改回 2048 也不再自动抬升。
      try {
        if (!localStorage.getItem('max_tokens_migrated_v2')) {
          a.profiles.forEach(function(p) {
            if (p.max_tokens === 2048) { p.max_tokens = 16384; changed = true; }
          });
          localStorage.setItem('max_tokens_migrated_v2', '1');
        }
      } catch (e) {}
      if (changed) Storage.setGlobal(g);
      return a;
    },

    getActive: function() {
      var a = this.getAll();
      return a.profiles.find(function(p) { return p.id === a.activeId; }) || a.profiles[0];
    },

    getById: function(id) {
      if (!id) return null;
      var a = this.getAll();
      return a.profiles.find(function(p) { return p.id === id; }) || null;
    },

    setActive: function(id) {
      var g = Storage.getGlobal();
      this.getAll();
      g = Storage.getGlobal();
      if (!g.api || !g.api.profiles) return;
      if (g.api.profiles.some(function(p) { return p.id === id; })) {
        g.api.activeId = id;
        Storage.setGlobal(g);
      }
    },

    add: function(template) {
      var g = Storage.getGlobal();
      this.getAll();
      g = Storage.getGlobal();
      if (!g.api || !g.api.profiles) return null;
      var p = template ? defaultProfile(template.name, template.baseUrl, template.model) : defaultProfile();
      g.api.profiles.push(p);
      Storage.setGlobal(g);
      return p;
    },

    duplicate: function(id) {
      var g = Storage.getGlobal();
      this.getAll();
      g = Storage.getGlobal();
      if (!g.api || !g.api.profiles) return null;
      var src = g.api.profiles.find(function(p) { return p.id === id; });
      if (!src) return null;
      var c = JSON.parse(JSON.stringify(src));
      c.id = uid();
      c.name = (src.name || '配置') + ' 副本';
      g.api.profiles.push(c);
      Storage.setGlobal(g);
      return c;
    },

    remove: function(id) {
      var g = Storage.getGlobal();
      this.getAll();
      g = Storage.getGlobal();
      if (!g.api || !g.api.profiles) return;
      if (g.api.profiles.length <= 1) { Platform.dialog.alert('至少保留一个配置'); return; }
      g.api.profiles = g.api.profiles.filter(function(p) { return p.id !== id; });
      if (g.api.activeId === id) g.api.activeId = g.api.profiles[0].id;
      Storage.setGlobal(g);
    },

    update: function(id, patch) {
      var g = Storage.getGlobal();
      this.getAll();
      g = Storage.getGlobal();
      if (!g.api || !g.api.profiles) return;
      var p = g.api.profiles.find(function(x) { return x.id === id; });
      if (!p) return;
      Object.assign(p, patch);
      Storage.setGlobal(g);
    },

    buildUrl: function(baseUrl) {
      var u = String(baseUrl || '').trim().replace(/\/+$/, '');
      if (!u) return '';
      if (!u.endsWith('/chat/completions')) u += '/chat/completions';
      return u;
    }
  };
  if (typeof window !== 'undefined') window.ApiManager = ApiManager;
  if (typeof module !== 'undefined' && module.exports) module.exports = ApiManager;
})();