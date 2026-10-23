// ============================================================
// AI API 多配置管理
// v4：PRESETS 加 models 数组（供 UI 下拉）
// 平台依赖：Platform.dialog.alert（删除最后一个配置时的阻止弹窗）
// ============================================================

(function() {
  function uid() { return 'p_' + Date.now() + '_' + Math.floor(Math.random() * 1000); }

  var PRESETS = [
    { name: 'DeepSeek',   baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      note: '国内直连；chat 便宜，reasoner 带思维链' },
    { name: '豆包',       baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      model: 'doubao-seed-1.6-250615',
      models: ['doubao-seed-1.6-250615', 'doubao-seed-1.6-flash-250815', 'doubao-1.5-pro-32k', 'doubao-1.5-pro-256k'],
      note: '国内直连，豆包系列' },
    { name: '千问',       baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
      models: ['qwen-plus', 'qwen-max', 'qwen3-max', 'qwen-plus-latest', 'qwen-turbo', 'qwen-long'],
      note: '国内直连，通义千问' },
    { name: 'Kimi',       baseUrl: 'https://api.moonshot.cn/v1',
      model: 'kimi-latest',
      models: ['kimi-latest', 'kimi-k2-0711-preview', 'kimi-k2-turbo-preview', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
      note: '国内直连，长上下文' },
    { name: '智谱 GLM',   baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4-flash',
      models: ['glm-4.6', 'glm-4.5', 'glm-4.5-air', 'glm-4.5-flash', 'glm-4-flash', 'glm-4-plus'],
      note: '国内直连，flash 免费' },
    { name: 'API 中转站', baseUrl: 'https://your-relay.example/v1',
      model: 'claude-sonnet-4-5-20250929',
      models: ['claude-sonnet-4-5-20250929', 'claude-opus-4-1-20250805', 'claude-haiku-4-5-20251001', 'claude-3-5-sonnet-20241022', 'gpt-5', 'gpt-4o', 'gpt-4.1-mini', 'glm-4.6', 'deepseek-chat', 'deepseek-reasoner'],
      note: '中转站：填你的中转地址；模型名可手动输入任意值' },
    { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1',
      model: 'anthropic/claude-sonnet-4.5',
      models: ['anthropic/claude-sonnet-4.5', 'anthropic/claude-3.5-sonnet', 'openai/gpt-5', 'openai/gpt-4o', 'openai/gpt-4o-mini', 'google/gemini-2.5-flash', 'google/gemini-2.0-flash-exp:free', 'deepseek/deepseek-chat'],
      note: '聚合平台，模型多' },
    { name: 'OpenAI',     baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini', 'o4-mini'],
      note: '需代理' },
    { name: 'Ollama 本地', baseUrl: 'http://localhost:11434/v1',
      model: 'qwen2.5:7b',
      models: ['qwen2.5:7b', 'qwen3:8b', 'qwen2.5:14b', 'llama3.2', 'deepseek-r1:7b'],
      note: '本机跑，不用 key' },
    { name: 'Gemini',     baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-2.5-flash',
      models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-pro'],
      note: 'Google；兼容 OpenAI 格式' },
    { name: 'Groq',       baseUrl: 'https://api.groq.com/openai/v1',
      model: 'llama-3.3-70b-versatile',
      models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
      note: '极速推理' },
    { name: 'Together',   baseUrl: 'https://api.together.xyz/v1',
      model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'meta-llama/Llama-3.1-8B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct'],
      note: '开源模型聚合' },
    { name: 'Mistral',    baseUrl: 'https://api.mistral.ai/v1',
      model: 'mistral-small-latest',
      models: ['mistral-small-latest', 'mistral-large-latest', 'open-mistral-nemo', 'codestral-latest'],
      note: '欧洲直连' },
    { name: '零一万物',   baseUrl: 'https://api.lingyiwanwu.com/v1',
      model: 'yi-large',
      models: ['yi-large', 'yi-large-turbo', 'yi-medium', 'yi-spark'],
      note: '国内直连' },
    { name: '百川',       baseUrl: 'https://api.baichuan-ai.com/v1',
      model: 'Baichuan4',
      models: ['Baichuan4', 'Baichuan3-Turbo', 'Baichuan3-Turbo-128k'],
      note: '国内直连' },
    { name: '讯飞星火',   baseUrl: 'https://spark-api-open.xf-yun.com/v1',
      model: 'generalv3.5',
      models: ['generalv3.5', 'generalv3', '4.0Ultra'],
      note: '国内直连' },
    { name: 'MiniMax',    baseUrl: 'https://api.minimax.chat/v1',
      model: 'MiniMax-Text-01',
      models: ['MiniMax-Text-01', 'abab6.5s-chat', 'abab6.5-chat'],
      note: '国内直连' },
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
      a.profiles.forEach(function (p) {
        // 2026-10-23：最大输出不设上限。缺字段补 16384（只是一个默认值）；
        // 显式 0 / 空 / 负数 = 0，表示不限制（请求里不发送 max_tokens）；>0 原样保留。
        if (p.max_tokens == null || p.max_tokens === '') {
          p.max_tokens = 16384; changed = true;
        } else {
          var rawMt = Number(p.max_tokens);
          var mt = isFinite(rawMt) ? Math.round(rawMt) : 0;
          if (!(mt > 0)) mt = 0;
          if (p.max_tokens !== mt) { p.max_tokens = mt; changed = true; }
        }
      });
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