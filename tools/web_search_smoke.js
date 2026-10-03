// ============================================================
// RN 联网搜索 smoke · 战役 P2 · S1
// 用法：node tools/web_search_smoke.js（cwd = RN 仓根）
//
// 口径：Node 侧注入内存 localStorage + 真 engine/core/storage.js +
//   假 Platform.http，engine/web_search.js 双态导出后 module.exports 直取
//   （同 theme.js 范式）。全程零真实网络，Platform.http 一律 mock。
//
// A. 模块形态 + PRESETS 逐字（6 项 name/backend）
// B. 配置读写往返（getAll 归一化 / add / duplicate / update /
//    setActive / setEnabled / Storage 落库 / activeId 失效归一化 /
//    remove 末位阻断）
// C. 三个 reason 文案逐字：联网未开启（web_search.js:249）/
//    查询关键词为空（tool_executor.js:137）/ 搜索模块未加载
//    （tool_executor.js:134）；另加 ToolExecutor 正常路径（async 包装）
// D. 六后端适配器字段映射 + URL / Header 构造（mock http，零真调用）
// E. formatForAI 四型文案
// ============================================================

'use strict';

var path = require('path');
var root = path.resolve(__dirname, '..');

var ok = 0, fail = 0;
function check(name, cond) {
  if (cond) { ok++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}
function eq(name, actual, expected) {
  check(name + '（actual=' + JSON.stringify(actual) + '）', actual === expected);
}

// ---------- 内存 localStorage（同 settings_smoke 口径）----------
var mem = {};
globalThis.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
  setItem: function (k, v) { mem[k] = String(v); },
  removeItem: function (k) { delete mem[k]; },
  clear: function () { mem = {}; }
};
globalThis.Storage = require(path.join(root, 'engine', 'core', 'storage.js'));
// web_search.remove 末位分支调 UI.toast（浏览器形态）；RN 无 UI，注入空壳。
globalThis.UI = { toast: function () {} };

// ---------- 假 Platform.http ----------
var calls = [];
var httpImpl = null;
globalThis.Platform = {
  http: function (url, opts) {
    calls.push({ url: url, opts: opts || null });
    if (!httpImpl) return Promise.reject(new Error('httpImpl 未设置'));
    return httpImpl(url, opts);
  }
};
function jsonResp(obj, status, okFlag) {
  return {
    ok: okFlag !== false,
    status: status || 200,
    text: function () { return Promise.resolve(JSON.stringify(obj)); },
    json: function () { return Promise.resolve(obj); }
  };
}

var WSM = require(path.join(root, 'engine', 'web_search.js'));
globalThis.WebSearchManager = WSM;
var ToolExecutor = require(path.join(root, 'engine', 'core', 'tool_executor.js'));

function readG() { return JSON.parse(globalThis.localStorage.getItem('ai_tg_global')); }

// ============ A 组：模块形态 + PRESETS ============
function runA() {
  ['getAll', 'getActive', 'isEnabled', 'setEnabled', 'setActive',
   'add', 'duplicate', 'remove', 'update', 'query', 'formatForAI'].forEach(function (m) {
    check('A1 web_search.' + m + ' 为函数', typeof WSM[m] === 'function');
  });
  check('A2 PRESETS / defaultProfile 导出', Array.isArray(WSM.PRESETS) && typeof WSM.defaultProfile === 'function');
  eq('A3 PRESETS = 6 项', WSM.PRESETS.length, 6);
  check('A4 PRESETS name 逐字',
    JSON.stringify(WSM.PRESETS.map(function (p) { return p.name; })) ===
    JSON.stringify(['博查 Bocha', 'Tavily', 'Serper', 'Google CSE', 'Bing', '自定义']));
  check('A5 PRESETS backend 逐字',
    JSON.stringify(WSM.PRESETS.map(function (p) { return p.backend; })) ===
    JSON.stringify(['bocha', 'tavily', 'serper', 'google', 'bing', 'custom']));
  check('A6 PRESETS[0] endpoint 逐字（api.bocha.cn）',
    WSM.PRESETS[0].endpoint === 'https://api.bocha.cn/v1/web-search');
  var dp = WSM.defaultProfile();
  check('A7 defaultProfile 默认字段（backend=bocha / count=3 / timeout=15000 / 名=新配置）',
    dp.backend === 'bocha' && dp.count === 3 && dp.timeout === 15000 &&
    dp.name === '新配置' && dp.apiKey === '' && dp.cx === '' &&
    typeof dp.id === 'string' && dp.id.indexOf('s_') === 0);
}

// ============ B 组：配置读写往返 ============
function runB() {
  // B1 空库归一化：建默认博查配置，enabled=false
  var s0 = WSM.getAll();
  check('B1 空库 getAll 归一化（1 配置 / 博查 / 未启用 / activeId 有效）',
    s0.profiles.length === 1 && s0.profiles[0].backend === 'bocha' &&
    s0.enabled === false && s0.profiles[0].id === s0.activeId);

  // B2 add(PRESETS[1]) = Tavily 预设解析
  var n0 = s0.profiles.length;
  var tav = WSM.add(WSM.PRESETS[1]);
  check('B2 add(预设) 解析 name/backend/endpoint 逐字 + 数量 +1',
    tav && tav.name === 'Tavily' && tav.backend === 'tavily' &&
    tav.endpoint === 'https://api.tavily.com/search' &&
    WSM.getAll().profiles.length === n0 + 1);

  // B3 duplicate：新 id + ' 副本' 后缀
  var dup = WSM.duplicate(tav.id);
  check('B3 duplicate 新 id + 「 副本」后缀',
    dup && dup.id !== tav.id && dup.name === 'Tavily 副本' &&
    WSM.getAll().profiles.length === n0 + 2);

  // B4 update 落库回读
  WSM.update(tav.id, { name: 'B组改', endpoint: 'https://example.test/q', apiKey: 'K1', count: 7 });
  var afterUpd = WSM.getAll().profiles.filter(function (p) { return p.id === tav.id; })[0];
  check('B4 update 落库回读（name/endpoint/apiKey/count）',
    afterUpd.name === 'B组改' && afterUpd.endpoint === 'https://example.test/q' &&
    afterUpd.apiKey === 'K1' && afterUpd.count === 7);

  // B5 setActive / getActive 往返
  WSM.setActive(dup.id);
  eq('B5a setActive 后 getActive 切换', WSM.getActive().id, dup.id);
  WSM.setActive('__no_such_id__');
  eq('B5b setActive 非法 id 不改动 activeId', WSM.getActive().id, dup.id);

  // B6 setEnabled 落库
  WSM.setEnabled(true);
  check('B6a setEnabled(true) → isEnabled 且落库',
    WSM.isEnabled() === true && readG().search.enabled === true);
  WSM.setEnabled(false);
  check('B6b setEnabled(false) 回落 && 落库',
    WSM.isEnabled() === false && readG().search.enabled === false);

  // B7 Storage 配置往返：profiles 数一致 + activeId 一致
  var g7 = readG();
  eq('B7 Storage 落库 profiles 数一致', g7.search.profiles.length, WSM.getAll().profiles.length);
  eq('B7 Storage 落库 activeId 一致', g7.search.activeId, WSM.getActive().id);

  // B8 activeId 指向已删配置 → getAll 归一化回 profiles[0]
  var g8 = readG();
  g8.search.activeId = '__gone__';
  globalThis.localStorage.setItem('ai_tg_global', JSON.stringify(g8));
  eq('B8 activeId 失效 → 归一化回 profiles[0]', WSM.getAll().activeId, WSM.getAll().profiles[0].id);

  // B9 remove 末位阻断（web_search.js:229，UI.toast 分支不抛）
  var g9 = readG();
  g9.search.profiles = [g9.search.profiles[0]];
  g9.search.activeId = g9.search.profiles[0].id;
  globalThis.localStorage.setItem('ai_tg_global', JSON.stringify(g9));
  WSM.remove(g9.search.profiles[0].id);
  eq('B9 末位阻断（仅剩 1 个时 remove 无效）', WSM.getAll().profiles.length, 1);

  // B10 remove 正常路径（>1 时删掉，activeId 回落）
  WSM.add(WSM.PRESETS[2]);
  var s10 = WSM.getAll();
  var keep = s10.profiles[0].id;
  var kill = s10.profiles[1].id;
  WSM.setActive(kill);
  WSM.remove(kill);
  check('B10 remove 正常路径（删除 + activeId 回落 profiles[0]）',
    WSM.getAll().profiles.length === 1 && WSM.getActive().id === keep);
}

// ============ C 组：三个 reason 文案逐字 + ToolExecutor 正常路径 ============
function runC() {
  // 归零：单配置、未启用
  var g = readG();
  g.search.profiles = [g.search.profiles[0]];
  g.search.activeId = g.search.profiles[0].id;
  g.search.enabled = false;
  globalThis.localStorage.setItem('ai_tg_global', JSON.stringify(g));

  // C1 web_search.query 未启用 → '联网未开启'（web_search.js:249 逐字）
  var pending = null;
  var p1 = WSM.query('海猫络合物', { count: 3 }).then(function (r) { pending = r; });
  return p1.then(function () {
    check('C1 未启用 reason 逐字「联网未开启」',
      pending && pending.ok === false && pending.reason === '联网未开启');

    // C2 ToolExecutor 空关键词 → '查询关键词为空'（tool_executor.js:137 逐字）
    WSM.setEnabled(true);
    var r2 = ToolExecutor.WHITELIST.web_search.run({ query: '   ' });
    check('C2 空关键词 reason 逐字「查询关键词为空」',
      r2 && r2.ok === false && r2.reason === '查询关键词为空' &&
      typeof r2.__async === 'undefined');

    // C3 ToolExecutor 模块未加载 → '搜索模块未加载'（tool_executor.js:134 逐字）
    var savedWsm = globalThis.WebSearchManager;
    delete globalThis.WebSearchManager;
    var r3 = ToolExecutor.WHITELIST.web_search.run({ query: 'x' });
    globalThis.WebSearchManager = savedWsm;
    check('C3 模块未加载 reason 逐字「搜索模块未加载」',
      r3 && r3.ok === false && r3.reason === '搜索模块未加载');

    // C4 ToolExecutor 正常路径（__async 包装 → ok:true / type=search）
    httpImpl = function () {
      return Promise.resolve(jsonResp({
        data: { webPages: { value: [{ name: '条目A', url: 'https://a.test', snippet: '摘要A' }] } }
      }));
    };
    var r4 = ToolExecutor.WHITELIST.web_search.run({ query: ' 空洞骑士 ', count: 3 });
    return r4.promise.then(function (res) {
      check('C4 ToolExecutor 正常路径（__async / ok / type=search / keyword 去空白）',
        r4.__async === true && res.ok === true && res.type === 'search' &&
        res.type2 === 'search' && res.keyword === '空洞骑士' &&
        res.searchMeta && res.searchMeta.count === 1);
    });
  });
}

// ============ D 组：六后端适配器（mock http，零真调用）============
function runD() {
  // 准备：单配置、已启用、activeId 指向它
  var g = readG();
  var id = g.search.profiles[0].id;
  g.search.profiles = [g.search.profiles[0]];
  g.search.activeId = id;
  g.search.enabled = true;
  globalThis.localStorage.setItem('ai_tg_global', JSON.stringify(g));
  WSM.update(id, { backend: 'bocha', endpoint: 'https://api.bocha.cn/v1/web-search', apiKey: 'BK', cx: '', count: 3, customBody: '', customHeaders: '' });

  // D1 bocha 成功：三字段清洗 + count 截断（返回 5 条，count=3）
  calls = [];
  httpImpl = function () {
    return Promise.resolve(jsonResp({
      data: { webPages: { value: [
        { name: 'T1', url: 'https://1.test', snippet: 'S1' },
        { name: 'T2', url: 'https://2.test', snippet: 'S2' },
        { name: 'T3', url: 'https://3.test', snippet: 'S3' },
        { name: 'T4', url: 'https://4.test', snippet: 'S4' },
        { name: 'T5', url: 'https://5.test', snippet: 'S5' }
      ] } }
    }));
  };
  var chain = WSM.query('qd', { count: 3 }).then(function (r) {
    check('D1 bocha 成功：ok / count 截断 3 / results 三字段',
      r.ok === true && r.count === 3 && r.results.length === 3 &&
      r.results[0].title === 'T1' && r.results[0].url === 'https://1.test' &&
      r.results[0].snippet === 'S1' && r.keyword === 'qd' && r.backend === 'bocha');
    check('D1b bocha 请求构造（POST / JSON / Bearer key）',
      calls.length === 1 && calls[0].opts.method === 'POST' &&
      calls[0].opts.headers['Content-Type'] === 'application/json' &&
      calls[0].opts.headers['Authorization'] === 'Bearer BK' &&
      JSON.parse(calls[0].opts.body).query === 'qd');

    // D2 缺字段兜底 ''
    httpImpl = function () {
      return Promise.resolve(jsonResp({ data: { webPages: { value: [{}, { name: 'B' }] } } }));
    };
    return WSM.query('q2', { count: 3 });
  }).then(function (r) {
    check('D2 bocha 缺字段兜底空串',
      r.ok === true && r.results.length === 2 &&
      r.results[0].title === '' && r.results[0].url === '' && r.results[0].snippet === '' &&
      r.results[1].title === 'B');

    // D3 HTTP 失败：不抛异常，reason 透传
    httpImpl = function () {
      return Promise.resolve({ ok: false, status: 401, text: function () { return Promise.resolve('bad key'); }, json: function () { return Promise.resolve({}); } });
    };
    return WSM.query('q3', { count: 3 });
  }).then(function (r) {
    check('D3 HTTP 401 不抛异常（ok=false / reason 透传 / duration 为 number）',
      r.ok === false && r.reason === 'HTTP 401 bad key' && typeof r.duration === 'number');

    // D4 网络异常（adapter 抛）同样被捕获
    httpImpl = function () { return Promise.reject(new Error('boom')); };
    return WSM.query('q4', { count: 3 });
  }).then(function (r) {
    check('D4 网络异常不抛异常（reason=boom）', r.ok === false && r.reason === 'boom');

    // D5 tavily：results[].content → snippet
    WSM.update(id, { backend: 'tavily', endpoint: 'https://api.tavily.com/search', apiKey: 'TK' });
    calls = [];
    httpImpl = function () {
      return Promise.resolve(jsonResp({ results: [{ title: 'V1', url: 'https://v.test', content: 'VC' }] }));
    };
    return WSM.query('q5', { count: 2 });
  }).then(function (r) {
    check('D5 tavily 字段映射（content→snippet / api_key 入 body）',
      r.ok === true && r.results[0].snippet === 'VC' &&
      JSON.parse(calls[0].opts.body).api_key === 'TK');

    // D6 serper：organic[].link → url + X-API-KEY 头
    WSM.update(id, { backend: 'serper', endpoint: 'https://google.serper.dev/search', apiKey: 'SK' });
    calls = [];
    httpImpl = function () {
      return Promise.resolve(jsonResp({ organic: [{ title: 'R1', link: 'https://r.test', snippet: 'RS' }] }));
    };
    return WSM.query('q6', { count: 2 });
  }).then(function (r) {
    check('D6 serper 字段映射（link→url / X-API-KEY 头）',
      r.ok === true && r.results[0].url === 'https://r.test' &&
      calls[0].opts.headers['X-API-KEY'] === 'SK');

    // D7 google：GET，URL 含 key/cx/q/num 且 encodeURIComponent
    WSM.update(id, { backend: 'google', endpoint: 'https://www.googleapis.com/customsearch/v1', apiKey: 'k&1', cx: 'c x' });
    calls = [];
    httpImpl = function () {
      return Promise.resolve(jsonResp({ items: [{ title: 'G1', link: 'https://g.test', snippet: 'GS' }] }));
    };
    return WSM.query('空 洞', { count: 4 });
  }).then(function (r) {
    check('D7 google URL 拼接 + 转义（key/cx/q/num）',
      r.ok === true && r.results[0].url === 'https://g.test' &&
      calls.length === 1 && calls[0].opts === null &&
      calls[0].url.indexOf('key=k%261') >= 0 &&
      calls[0].url.indexOf('cx=c%20x') >= 0 &&
      calls[0].url.indexOf('q=%E7%A9%BA%20%E6%B4%9E') >= 0 &&
      calls[0].url.indexOf('num=4') >= 0);

    // D8 bing：Ocp-Apim-Subscription-Key 头
    WSM.update(id, { backend: 'bing', endpoint: 'https://api.bing.microsoft.com/v7.0/search', apiKey: 'BINGK' });
    calls = [];
    httpImpl = function () {
      return Promise.resolve(jsonResp({ webPages: { value: [{ name: 'B1', url: 'https://b.test', snippet: 'BS' }] } }));
    };
    return WSM.query('q8', { count: 2 });
  }).then(function (r) {
    check('D8 bing 字段映射 + Ocp-Apim-Subscription-Key 头',
      r.ok === true && r.results[0].title === 'B1' &&
      calls[0].opts.headers['Ocp-Apim-Subscription-Key'] === 'BINGK');

    // D9 custom：customBody 占位替换 + items 兜底
    WSM.update(id, { backend: 'custom', endpoint: 'https://c.test/api', apiKey: 'CK', customBody: '{"q":"{query}","n":{count}}' });
    calls = [];
    httpImpl = function () {
      return Promise.resolve(jsonResp({ items: [{ name: 'C1', link: 'https://c1.test', summary: 'CS' }] }));
    };
    return WSM.query('q9', { count: 2 });
  }).then(function (r) {
    check('D9 custom 占位替换 + items 兜底（name/link/summary）',
      r.ok === true && r.results[0].title === 'C1' &&
      r.results[0].url === 'https://c1.test' && r.results[0].snippet === 'CS' &&
      calls[0].opts.body === '{"q":"q9","n":2}');

    // D10 custom 默认 body（未填 customBody）
    WSM.update(id, { backend: 'custom', customBody: '' });
    calls = [];
    httpImpl = function () {
      return Promise.resolve(jsonResp({ results: [{ title: 'C2', url: 'https://c2.test', content: 'CC' }] }));
    };
    return WSM.query('q10', { count: 5 });
  }).then(function (r) {
    check('D10 custom 默认 body = JSON.stringify({query,count})',
      r.ok === true && calls[0].opts.body === '{"query":"q10","count":5}');

    // D11 opts.count 覆盖 profile.count
    WSM.update(id, { backend: 'bocha', endpoint: 'https://api.bocha.cn/v1/web-search', apiKey: 'BK', count: 9 });
    httpImpl = function () {
      return Promise.resolve(jsonResp({ data: { webPages: { value: [
        { name: '1' }, { name: '2' }, { name: '3' }, { name: '4' }
      ] } } }));
    };
    return WSM.query('q11', { count: 2 });
  }).then(function (r) {
    check('D11 opts.count 覆盖 profile.count（2 而非 9）', r.ok === true && r.count === 2);
  });
  return chain;
}

// ============ E 组：formatForAI 四型 ============
function runE() {
  var f = WSM.formatForAI;
  eq('E1 formatForAI(null) 空结果文案逐字', f(null), '（搜索无结果）');
  eq('E2 formatForAI(失败) 文案逐字', f({ ok: false, reason: '联网未开启' }), '【搜索失败】联网未开启');
  eq('E3 formatForAI(零条) 文案逐字', f({ ok: true, keyword: 'x', count: 0, duration: 12, results: [] }), '【搜索 "x"】无结果');
  var txt = f({ ok: true, keyword: '空洞骑士', count: 1, duration: 5,
    results: [{ title: 'T', url: 'https://t.test', snippet: 'S\n换行' }] });
  check('E4 formatForAI 正常（头行含 条数/耗时，正文 序号+标题+URL+摘要压行）',
    txt === '【搜索 "空洞骑士" · 1 条 · 耗时 5ms】\n1. T\n   https://t.test\n   S 换行');
  var long = f({ ok: true, keyword: 'k', count: 1, duration: 1,
    results: [{ title: 'T', url: 'u', snippet: new Array(300).join('a') }] });
  check('E5 formatForAI 摘要截断 200 字', long.split('\n')[3].trim().length === 200);
}

// ============ 主流程 ============
runA();
runB();
runE();
runC().then(runD).then(function () {
  console.log('WEB_SEARCH_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
  if (fail > 0) process.exit(1);
}).catch(function (e) {
  console.log('SMOKE_CRASH: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
