// ============================================================
// CACHE_USAGE_SMOKE · P17·A 缓存用量记账与展示（RN 侧）
// ------------------------------------------------------------
// 桌面侧对应守卫是 tests/unit/test_p17_cache_usage.js；两仓产品代码语义相同但字节不同，
// 桌面测试读不到 RN 的文件，所以 RN 必须有自己的这一支。
//
// 口径：真加载 RN 的 engine/core/api_client.js（vm 沙箱注入 globalThis 依赖），
//       喂进各家 Provider 形态的 usage，断言「读得到、算得对」。
//       RN 的展示层 rn/components/ThinkingBlock.js 是 JSX，纯 Node 无法 require，
//       因此展示面走**源码断言**（明确标注 SRC），与桌面 test_p16_instruction.js 同法。
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const API_FILE = path.join(ROOT, 'engine', 'core', 'api_client.js');
const THINK_FILE = path.join(ROOT, 'rn', 'components', 'ThinkingBlock.js');

let ok = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    ok++;
    console.log('PASS: ' + name);
  } catch (e) {
    fail++;
    console.log('FAIL: ' + name + ' :: ' + (e && e.message ? e.message : e));
  }
}
const assert = require('assert');

// 假 ApiClient 运行环境：真 api_client.js + 假 Platform.http 返回指定 usage 的响应
function makeSandbox(usagePayload) {
  const gs = {
    _totalTokens: 0, _lastUsage: null,
    _totalCachedTokens: 0, _totalCacheWriteTokens: 0, _lastCacheUsage: null,
    _lastReasoning: '', _lastContent: ''
  };
  const body = {
    choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
    usage: usagePayload
  };
  const sandbox = {
    GameState: gs,
    ApiManager: { getActive: () => ({ baseUrl: 'http://x.local', apiKey: 'k', model: 'm' }), buildUrl: (b) => b },
    Platform: { http: () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) }) },
    URL: URL,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    module: { exports: {} }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(API_FILE, 'utf8'), sandbox, { filename: API_FILE });
  return { gs: gs, ApiClient: sandbox.module.exports };
}

// 注意：await 一旦抛错，下面的 check 就不会执行、fail 也不自增（会假绿）。
// 所以把「调用失败」本身也塞进 check 的 try 里算一条 FAIL。
async function chatCheck(name, usagePayload, verify) {
  let env = null, throwErr = null;
  try {
    env = makeSandbox(usagePayload);
    await env.ApiClient.chat([{ role: 'user', content: 'hi' }], {});
  } catch (e) { throwErr = e; }
  check(name, () => {
    if (throwErr) throw new Error('chat() 抛错：' + (throwErr.message || throwErr));
    verify(env);
  });
}

(async function main() {
  console.log('=== P17·A 缓存用量 smoke（RN）===');

  const srcApi = fs.readFileSync(API_FILE, 'utf8');
  const srcThink = fs.readFileSync(THINK_FILE, 'utf8');

  check('CU-R0 SRC 产品代码已实现 _cacheUsage', () => {
    assert.ok(srcApi.indexOf('_cacheUsage: function(usage)') >= 0, 'api_client.js 里找不到 _cacheUsage');
  });

  const AC = makeSandbox({ total_tokens: 10 }).ApiClient;

  check('CU-R1 OpenAI 系 prompt_tokens_details.cached_tokens 被读到', () => {
    const cu = AC._cacheUsage({ prompt_tokens_details: { cached_tokens: 1234 } });
    assert.strictEqual(cu.cached, 1234);
    assert.strictEqual(cu.creation, 0);
  });

  check('CU-R2 Anthropic 系 cache_read_input_tokens / cache_creation_input_tokens 被读到', () => {
    const cu = AC._cacheUsage({ cache_read_input_tokens: 900, cache_creation_input_tokens: 300 });
    assert.strictEqual(cu.cached, 900);
    assert.strictEqual(cu.creation, 300);
  });

  check('CU-R3 DeepSeek 系 prompt_cache_hit_tokens 被读到', () => {
    const cu = AC._cacheUsage({ prompt_cache_hit_tokens: 777, prompt_cache_miss_tokens: 23 });
    assert.strictEqual(cu.cached, 777);
    assert.strictEqual(cu.creation, 0);
  });

  check('CU-R4 无缓存字段 / null / undefined 一律归零且不抛错', () => {
    const a = AC._cacheUsage({ prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 });
    assert.deepStrictEqual({ c: a.cached, w: a.creation }, { c: 0, w: 0 });
    assert.deepStrictEqual({ c: AC._cacheUsage(null).cached, w: AC._cacheUsage(null).creation }, { c: 0, w: 0 });
    assert.deepStrictEqual({ c: AC._cacheUsage(undefined).cached, w: AC._cacheUsage(undefined).creation }, { c: 0, w: 0 });
  });

  check('CU-R5 非数字 / 0 不被当成命中（不污染统计）', () => {
    assert.strictEqual(AC._cacheUsage({ prompt_tokens_details: { cached_tokens: 0 } }).cached, 0);
    assert.strictEqual(AC._cacheUsage({ cache_read_input_tokens: '900' }).cached, 0, '字符串不应被当成命中数');
  });

  await chatCheck('CU-R6 缓存命中会写进 _lastCacheUsage 并累加 _totalCachedTokens',
    { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110, prompt_tokens_details: { cached_tokens: 64 } },
    (env) => {
      assert.ok(env.gs._lastCacheUsage, '_lastCacheUsage 为空 —— 没有记账');
      assert.strictEqual(env.gs._lastCacheUsage.cached, 64);
      assert.strictEqual(env.gs._totalCachedTokens, 64);
      assert.strictEqual(env.gs._totalCacheWriteTokens, 0);
    });

  await chatCheck('CU-R7 _totalTokens 仍是 total_tokens 口径（不与缓存字段重复计）',
    { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110, prompt_tokens_details: { cached_tokens: 64 } },
    (env) => { assert.strictEqual(env.gs._totalTokens, 110); });

  await chatCheck('CU-R8 写缓存被记到 _totalCacheWriteTokens，不算命中',
    { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110, cache_creation_input_tokens: 100 },
    (env) => {
      assert.strictEqual(env.gs._totalCacheWriteTokens, 100);
      assert.strictEqual(env.gs._totalCachedTokens, 0);
    });

  await chatCheck('CU-R9 没有缓存字段时 _lastCacheUsage 归零而不是 null',
    { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
    (env) => {
      assert.ok(env.gs._lastCacheUsage, '_lastCacheUsage 不应为 null');
      assert.strictEqual(env.gs._lastCacheUsage.cached, 0);
      assert.strictEqual(env.gs._lastCacheUsage.creation, 0);
      assert.strictEqual(env.gs._totalCachedTokens, 0);
    });

  check('CU-R10 SRC 面板按缓存字段渲染（缓存命中 / 写缓存）', () => {
    assert.ok(srcThink.indexOf('缓存命中 ') >= 0, 'ThinkingBlock.js 里找不到「缓存命中 」');
    assert.ok(srcThink.indexOf('写缓存 ') >= 0, 'ThinkingBlock.js 里找不到「写缓存 」');
    assert.ok(srcThink.indexOf('cacheInfo') >= 0, 'ThinkingBlock.js 里没有 cacheInfo');
  });

  check('CU-R11 SRC 只有缓存字段、没有 total 时面板也要出得来', () => {
    assert.ok(/hasUsage\s*=[^;]*cacheInfo/.test(srcThink),
      'hasUsage 没把 cacheInfo 算进去 ⇒ 只报缓存字段的 Provider 面板会被挡掉');
  });

  console.log('');
  console.log('CACHE_USAGE_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
