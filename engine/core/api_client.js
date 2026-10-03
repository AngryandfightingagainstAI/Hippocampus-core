// ============================================================
// 核心层 · ApiClient
// AI 对话补全请求：ApiManager 取配置 → Platform.http 发请求 →
// 解析响应，并把 reasoning / usage / content 写回 GameState。
// 本地地址判断见 _isLocalUrl（URL 解析，非正则）。
// ============================================================

var ApiClient = {
  async chat(messages, options = {}) {
    let profile = null;
    if (options.profileId && typeof ApiManager !== 'undefined' && ApiManager.getById) {
      profile = ApiManager.getById(options.profileId);
    }
    if (!profile && typeof ApiManager !== 'undefined') {
      profile = ApiManager.getActive();
    }
    if (!profile) throw new Error('API 未配置。去设置 → 🤖 AI 添加配置。');
    const url = ApiManager.buildUrl(profile.baseUrl);
    const key = profile.apiKey || '';
    const model = profile.model;
    if (!url) throw new Error('API Base URL 为空');
    if (!model) throw new Error('模型名为空');
    if (!key && !this._isLocalUrl(profile.baseUrl)) {
      throw new Error('API Key 为空');
    }
    const maxTok = options.max_tokens != null ? options.max_tokens : (profile.max_tokens || 2048);
    const temp = options.temperature != null ? options.temperature : (profile.temperature != null ? profile.temperature : 0.8);
    const topP = options.top_p != null ? options.top_p : (profile.top_p != null ? profile.top_p : 0.95);

    let useJsonMode = false;
    if (options.jsonMode) {
      if (profile.jsonMode === 'on') useJsonMode = true;
      else if (profile.jsonMode === 'off') useJsonMode = false;
      else {
        const supports = /deepseek|gpt-4|gpt-3\.5|qwen|glm|moonshot|kimi|claude/i.test(model);
        useJsonMode = supports;
      }
    }

    let result;
    if (useJsonMode) {
      try { result = await this._request(profile, url, key, model, messages, maxTok, temp, topP, true); }
      catch (e) {
        if (e.code === 'JSON_MODE_NOT_SUPPORTED') result = await this._request(profile, url, key, model, messages, maxTok, temp, topP, false);
        else throw e;
      }
    } else {
      result = await this._request(profile, url, key, model, messages, maxTok, temp, topP, false);
    }

    if (result.usage) {
      GameState._lastUsage = result.usage;
      GameState._totalTokens += (result.usage.total_tokens || 0);
      // P17·A 缓存用量记账：命中读缓存 / 写入缓存的输入 token 分开累计，不并进 _totalTokens。
      var cacheUsage = ApiClient._cacheUsage(result.usage);
      GameState._lastCacheUsage = cacheUsage;
      GameState._totalCachedTokens += cacheUsage.cached;
      GameState._totalCacheWriteTokens += cacheUsage.creation;
    } else {
      GameState._lastUsage = null;
      GameState._lastCacheUsage = null;
    }
    GameState._lastReasoning = result.reasoning || '';
    GameState._lastContent = result.content || '';

    if (result.content) return result.content;
    if (result.reasoning) {
      const m = model || '当前模型';
      throw new Error('API 输出被截断（思考消耗了大部分 token）。建议去设置 → 🤖 AI → 把"最大输出"调到 8192 以上。当前模型：' + m);
    }
    throw new Error('API 返回内容为空。');
  },

  async _request(profile, url, key, model, messages, maxTokens, temperature, topP, jsonMode) {
    const body = { model, messages, temperature, max_tokens: maxTokens, stream: false };
    if (topP != null) body.top_p = topP;
    if (jsonMode) body.response_format = { type: 'json_object' };
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers['Authorization'] = 'Bearer ' + key;
    let resp;
    try {
      if (typeof Platform === 'undefined' || !Platform.http) throw new Error('Platform.http 不可用');
      resp = await Platform.http(url, { method: 'POST', headers, body: JSON.stringify(body) });
    }
    catch (e) { throw new Error('网络请求失败：' + e.message); }
    const rawText = await resp.text();
    if (!resp.ok) {
      let msg = 'HTTP ' + resp.status;
      try { const j = JSON.parse(rawText); msg += '：' + (j.error && j.error.message ? j.error.message : rawText.slice(0, 300)); } catch (e) { msg += '：' + rawText.slice(0, 300); }
      if (jsonMode && (msg.indexOf('response_format') >= 0 || msg.indexOf('json_object') >= 0)) { const err = new Error('JSON_MODE_NOT_SUPPORTED'); err.code = 'JSON_MODE_NOT_SUPPORTED'; throw err; }
      throw new Error(msg);
    }
    let data;
    try { data = JSON.parse(rawText); } catch (e) { throw new Error('API 返回不是 JSON。'); }
    if (!data.choices || !data.choices.length) {
      if (data.output) return { content: String(data.output), usage: data.usage };
      if (data.result) return { content: String(data.result), usage: data.usage };
      throw new Error('API 返回没有 choices 字段。');
    }
    const c = data.choices[0];
    const m = c.message || c;
    return { content: m.content || '', reasoning: m.reasoning_content || m.reasoning || '', finishReason: c.finish_reason, raw: rawText, usage: data.usage };
  },

  // P17·A 缓存用量归一化：各家 Provider 的字段名不同，这里统一成
  // { cached, creation }（cached = 命中缓存的输入 token，creation = 写入缓存的输入 token）。
  //   OpenAI 系      usage.prompt_tokens_details.cached_tokens
  //   Anthropic 系   usage.cache_read_input_tokens / usage.cache_creation_input_tokens
  //   DeepSeek 系    usage.prompt_cache_hit_tokens / usage.prompt_cache_miss_tokens
  // 只读不写：不改请求体，缺字段一律归 0，不抛错。
  _cacheUsage: function(usage) {
    var out = { cached: 0, creation: 0 };
    if (!usage) return out;
    var det = usage.prompt_tokens_details || usage.input_tokens_details || null;
    var c = (det && det.cached_tokens) || usage.cache_read_input_tokens || usage.prompt_cache_hit_tokens || 0;
    var w = (det && det.cache_creation_tokens) || usage.cache_creation_input_tokens || 0;
    if (typeof c === 'number' && c > 0) out.cached = c;
    if (typeof w === 'number' && w > 0) out.creation = w;
    return out;
  },

  // 判断 baseUrl 是不是本地地址（本地可免 API Key）
  // 用 URL 解析而非正则子串匹配，避免 api10.example.com 这类误判
  _isLocalUrl: function(u) {
    if (!u) return false;
    var parsed;
    try { parsed = new URL(u); }
    catch (e) {
      try { parsed = new URL('http://' + u); }
      catch (e2) { return false; }
    }
    var h = String(parsed.hostname || '').toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
    if (!h) return false;
    if (h === 'localhost') return true;
    if (h === '::1') return true;
    if (/^fe[89ab]/.test(h)) return true;
    if (/^f[cd]/.test(h)) return true;
    var parts = h.split('.').map(Number);
    if (parts.length === 4 && parts.every(function(n) { return !isNaN(n) && n >= 0 && n <= 255; })) {
      if (parts[0] === 127) return true;
      if (parts[0] === 10) return true;
      if (parts[0] === 192 && parts[1] === 168) return true;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      if (parts[0] === 0 && parts[1] === 0 && parts[2] === 0 && parts[3] === 0) return true;
    }
    return false;
  },
};

if (typeof window !== 'undefined') window.ApiClient = ApiClient;
if (typeof module !== 'undefined' && module.exports) module.exports = ApiClient;
