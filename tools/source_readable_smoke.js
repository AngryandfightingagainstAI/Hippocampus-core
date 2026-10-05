// ============================================================
// source_readable_smoke.js — P26 守卫：导入的资料 AI 必须读得到
//
// 病灶（改前）：engine/import/draft.js 只把正文前 900 字塞进 card.game.background，
//   提示词又只渲染这一段，于是导入资料里后半段的人物/地名/事件原文 AI 永远看不见
//   （玩家还能导出原件看，AI 不行）。
// 断言：
//   S-1 草稿侧：背景不再是 900 字死线，并记录了原文总量与截断标记
//   S-2 提示词侧：后半段独有句子进了 buildStatic()，且指路 query_source（老存档同样指路）
//   S-3 工具侧：query_source 存在，无导入资料时安全失败
//   S-4 检索侧：内存 VFS + 真保管库，按关键词/分页能取回后半段原文，单次结果自带分页不超 800 字
//   S-5 源码守卫：draft.js 不再有 `|| 900`，工具协议查询行已声明 query_source
// 跑法：node tools/source_readable_smoke.js   （cwd 随意，仓库根由 __dirname 推）
// ============================================================
'use strict';

var path = require('path');
var fs = require('fs');

var ROOT = path.join(__dirname, '..');

var okN = 0, failN = 0;
function ok(name, cond, detail) {
  if (cond) { okN++; console.log('  ok   ' + name); }
  else { failN++; console.log('  FAIL ' + name + (detail ? ('  <<< ' + detail) : '')); }
}
function includes(name, hay, needle) {
  ok(name, String(hay).indexOf(needle) >= 0, 'missing=' + JSON.stringify(needle));
}
function section(t) { console.log('\n### ' + t); }

// ---------------- 内存 VFS（顶替真 VFS；照 tools/import_smoke.js IM-10）----------------
var store = {};
globalThis.VFS = {
  writeFile: function (p, s) { store[p] = s; return true; },
  readFile: function (p) { return store[p] === undefined ? null : store[p]; },
  readJSON: function (p) { try { return JSON.parse(store[p]); } catch (e) { return null; } },
  writeJSON: function (p, o) { store[p] = JSON.stringify(o); return true; },
  listAll: function (prefix) {
    var pre = 'vfs:/' + String(prefix).replace(/^vfs:\//, '').replace(/^\//, '');
    if (pre.charAt(pre.length - 1) !== '/') pre += '/';
    var out = [];
    for (var k in store) if (Object.prototype.hasOwnProperty.call(store, k) && k.indexOf(pre) === 0) out.push(k.slice(5));
    return out;
  },
  deleteFile: function (p) { delete store[p]; }
};

// ---------------- 平台脚手架（照 tools/tool_ready_smoke.js TR-4）----------------
var LS = (function () {
  var mm = Object.create(null);
  return {
    getItem: function (k) { return mm[k] != null ? mm[k] : null; },
    setItem: function (k, v) { mm[k] = String(v); },
    removeItem: function (k) { delete mm[k]; },
    key: function (i) { return Object.keys(mm)[i] || null; },
    get length() { return Object.keys(mm).length; }
  };
})();
globalThis.localStorage = LS;
globalThis.window = globalThis;

var Platform = require(path.join(ROOT, 'platform/platform_adapter.js'));
globalThis.Platform = Platform;
Platform.ui = {};
Platform.dialog = { alert: function () { }, confirm: function () { return true; } };
Platform.http = { request: function () { return Promise.resolve({ ok: false, error: 'no-http' }); } };

var mem = Object.create(null), keys = [];
var SA = require(path.join(ROOT, 'vfs/storage_adapter.js'));
['getItem', 'setItem', 'removeItem', 'key', 'clear', 'estimateBytes'].forEach(function (k) {
  SA[k] = k === 'getItem' ? function (x) { return mem[x] != null ? mem[x] : null; }
    : k === 'setItem' ? function (x, v) { if (keys.indexOf(x) < 0) keys.push(x); mem[x] = String(v); }
      : k === 'removeItem' ? function (x) { delete mem[x]; var i = keys.indexOf(x); if (i >= 0) keys.splice(i, 1); }
        : k === 'key' ? function (i) { return keys[i] != null ? keys[i] : null; }
          : k === 'clear' ? function () { keys.length = 0; Object.keys(mem).forEach(function (x) { delete mem[x]; }); }
            : function () { return 0; };
});

// ---------------- 导入层（依赖顺序照 tools/import_smoke.js）----------------
function load(rel, globalName) {
  var m = require(path.join(ROOT, rel));
  if (globalName) globalThis[globalName] = m;
  return m;
}
load('engine/import/decode.js', 'ImportDecode');
load('engine/import/unzip.js', 'ImportUnzip');
load('engine/import/middle.js', 'ImportMiddle');
load('engine/import/formats.js', 'ImportFormats');
load('engine/import/report.js', 'ImportReport');
var TEXTLIKE = load('engine/import/parsers/textlike.js', 'ImportParseTextlike');
globalThis.ImportHtml = TEXTLIKE.ImportHtml;
load('engine/import/parsers/archive.js', 'ImportParseArchive');
var PDFMOD = load('engine/import/parsers/pdf.js', 'ImportParsePdfGo');
globalThis.ImportParsePdf = PDFMOD;
load('engine/import/pipeline.js', 'ImportPipeline');
load('engine/import/vault.js', 'ImportVault');
var ImportDraft = load('engine/import/draft.js', 'ImportDraft');
var Import = load('engine/import/index.js', 'Import');
globalThis.CardValidator = require(path.join(ROOT, 'engine/core/card_validator.js'));
Import.init();

// ---------------- 提示词/工具层（stub 照 tools/prompt_budget_smoke.js）----------------
globalThis.Storage = require(path.join(ROOT, 'engine/core/storage.js'));
globalThis.ToolExecutor = require(path.join(ROOT, 'engine/core/tool_executor.js'));
globalThis.PromptBuilder = require(path.join(ROOT, 'engine/core/prompt_builder.js'));

function fakeLines(tag, n) {
  var a = [];
  for (var i = 0; i < n; i++) a.push('· ' + tag + i);
  return a.join('\n');
}
function installFakes(card) {
  globalThis.GameState = {
    currentCard: card,
    playerData: {},
    chatHistory: [],
    currentCardId: 'demo_source',
    currentSaveId: 's1',
    _gameTime: { year: 2000, month: 10, day: 20, hour: 8, minute: 0 },
    _pendingSystemNotices: [],
    _cachedStatic: null,
    _cachedStaticDynamic: null,
    currentState: { hud: [], sidebar: [], panels: {} },
    formatGameTime: function () { return '2000-10-20 08:00'; },
    computeAge: function () { return null; },
    getSegmentText: function () { return ''; },
    getEntrySegmentText: function () { return ''; },
    invalidateCache: function () { }
  };
  globalThis.Alias = { get: function (o, k) { return o ? o[k] : undefined; } };
  globalThis.Realtime = { formatForPrompt: function () { return null; } };
  globalThis.Weather = { formatForPrompt: function () { return null; } };
  globalThis.StatusCard = {
    isEnabled: function () { return false; },
    formatForPrompt: function () { return null; },
    getField: function () { return null; }
  };
  globalThis.Logger = {
    getRecentSummaries: function () { return [{ date: '2000-10-10', title: '前情', summary: '摘要' }]; },
    getActiveEntities: function () { return { npcs: [], places: [], items: [], factions: [], unresolved: [] }; }
  };
  globalThis.NpcRuntime = {
    formatFocusBrief: function () { return null; },
    formatSceneBrief: function () { return null; },
    formatFollowBrief: function () { return null; },
    formatActiveForPrompt: function () { return null; }
  };
  globalThis.StoryNodes = { formatForPrompt: function () { return null; } };
  globalThis.Endings = { formatForPrompt: function () { return null; } };
  globalThis.Events = {
    formatPendingForPrompt: function () { return null; },
    formatLocalForPrompt: function () { return null; },
    formatProposalsForPrompt: function () { return null; }
  };
  globalThis.InfoFeed = { formatForPrompt: function () { return null; } };
  globalThis.Tasks = { formatForPrompt: function () { return null; } };
  globalThis.Achievements = { formatRecentForPrompt: function () { return null; } };
  globalThis.Proposals = { formatForPrompt: function () { return null; } };
  globalThis.DiceHistory = { formatRecentForPrompt: function () { return null; } };
  globalThis.Outputs = { formatForPrompt: function () { return null; } };
  globalThis.Shop = { formatShopsForPrompt: function () { return null; } };
}

// ---------------- 夹具：一份「长短文」，独有句子压在旧 900 字线之后、新 2600 字线以内 ----------------
var UNIQ = '蓝砂矿脉的钥匙藏在无光钟楼的地基里，这句话只出现在导入资料的后半段。';
function buildDoc() {
  var filler = '';
  while (filler.length < 88) filler += '填充';
  var lines = ['# 无光之城', '', '## 第一章 序', ''];
  for (var i = 1; i <= 40; i++) {
    // 第 15 段处累计约 1500 字：> 旧上限 900（旧代码必丢），< 新上限 2600（新代码必收）
    if (i === 15) lines.push(UNIQ, '');
    lines.push('第' + i + '段：' + filler.slice(0, 88) + '（编号' + i + '）', '');
  }
  return lines.join('\n');
}

// ============================================================
section('S-1 草稿侧：背景不再是 900 字死线');
// ============================================================
var r = Import.run({ name: '无光之城.md', text: buildDoc() }, { vault: true });
ok('S-1a 导入成功且出了草稿卡带', !!(r && r.draft && r.draft.card), 'r=' + (r && Object.keys(r)));
var card = r.draft.card;
var sc = card._import && card._import.sourceChars;
ok('S-1b 记下了原文总量与截断标记（_import.sourceChars）',
  !!(sc && sc.total >= 2500 && sc.truncated === true), JSON.stringify(sc));
ok('S-1c 背景长度不再是 900 字档（>=2400）', card.game.background.length >= 2400, 'len=' + card.game.background.length);
includes('S-1d 背景里含旧 900 字线之后的独有句子', card.game.background, UNIQ);
includes('S-1e 背景里写清了「全文共 N 字 / 用 query_source 检索」', card.game.background, 'query_source');
ok('S-1f 自检：独有句子在原文里的偏移确实 > 900（否则本断言无意义）',
  buildDoc().indexOf(UNIQ) > 900, 'off=' + buildDoc().indexOf(UNIQ));
// S-1g 反证（防守卫变空转）：把上限显式调回 900（= 改前行为）时，那段句子必须**取不到**
var d900 = ImportDraft.build(r.imd, { backgroundChars: 900 });
ok('S-1g 反证：上限调回 900 时独有句子必须丢失（证明 S-1d 不是空转）',
  !!(d900 && d900.card && d900.card.game.background.indexOf(UNIQ) < 0 &&
     d900.card._import.sourceChars.truncated === true && d900.card._import.sourceChars.total >= 2500),
  'len=' + (d900 && d900.card ? d900.card.game.background.length : 'n/a'));

// ============================================================
section('S-2 提示词侧：AI 看得到，且知道去哪要全文');
// ============================================================
installFakes(card);
var stat = String(globalThis.PromptBuilder.buildStatic());
includes('S-2a 静态提示词含后半段的独有句子', stat, UNIQ);
includes('S-2b 静态提示词指路 query_source', stat, 'query_source');
// 老存档：有 importId、没有 sourceChars（改前导入的卡带）也必须指路
var oldCard = JSON.parse(JSON.stringify(card));
delete oldCard._import.sourceChars;
oldCard.game.background = '开头的一段背景。';
installFakes(oldCard);
var stat2 = String(globalThis.PromptBuilder.buildStatic());
includes('S-2c 老卡带（无 sourceChars）也指路 query_source', stat2, 'query_source');

// ============================================================
section('S-3 工具侧：query_source 存在且会安全失败');
// ============================================================
var TE = globalThis.ToolExecutor;
var QS = TE && TE.WHITELIST ? TE.WHITELIST.query_source : null;
ok('S-3a WHITELIST.query_source 已注册且可调用', !!(QS && typeof QS.run === 'function'),
  'keys=' + (TE && TE.WHITELIST ? Object.keys(TE.WHITELIST).length : 'n/a'));
installFakes({ game: {}, worldbook: {} });
var n1 = QS ? QS.run({}) : null;
ok('S-3b 卡带没有导入资料时安全失败且说清原因',
  !!(n1 && n1.ok === false && /没有导入资料/.test(String(n1.reason))), JSON.stringify(n1));

// ============================================================
section('S-4 检索侧：按关键词/分页取回后半段原文');
// ============================================================
installFakes(card);
var sum = QS ? QS.run({}) : null;
ok('S-4a 无参概览：报出块数与总字数',
  !!(sum && sum.ok === true && sum.data.source.blocks > 0 && sum.data.source.chars > 2500),
  JSON.stringify(sum).slice(0, 240));
includes('S-4b 概览指路「用关键词检索」', JSON.stringify(sum), 'query_source');
var hit = QS ? QS.run({ keyword: '蓝砂矿脉' }) : null;
ok('S-4c 关键词命中后半段原文',
  !!(hit && hit.ok === true && JSON.stringify(hit.data.items).indexOf('蓝砂矿脉') >= 0),
  JSON.stringify(hit).slice(0, 300));
var miss = QS ? QS.run({ keyword: '不存在的词xyzq' }) : null;
ok('S-4d 关键词没命中时不假装成功', !!(miss && miss.ok === true && miss.data.items.length === 0), JSON.stringify(miss).slice(0, 200));
var p1 = QS ? QS.run({ offset: 0, limit: 3 }) : null;
ok('S-4e 分页读：返回 3 段且给出 nextOffset',
  !!(p1 && p1.ok === true && p1.data.items.length === 3 && p1.data.nextOffset === 3),
  JSON.stringify(p1).slice(0, 240));
var off = 0, guard = 0, seen = false, maxLen = 0, pageErr = '';
if (QS) {
  while (off !== null && off !== undefined && guard < 400) {
    var pg = QS.run({ offset: off, limit: 3 });
    if (!pg || pg.ok !== true || !pg.data) { pageErr = 'off=' + off + ' → ' + JSON.stringify(pg).slice(0, 160); break; }
    maxLen = Math.max(maxLen, JSON.stringify(pg).length);
    if (JSON.stringify(pg).indexOf('蓝砂矿脉') >= 0) seen = true;
    off = pg.data.nextOffset;
    guard++;
  }
}
ok('S-4f 逐页可穷尽全文且能取到后半段句子',
  !!QS && pageErr === '' && seen && (off === null || off === undefined),
  pageErr || ('pages=' + guard + ' off=' + off));
ok('S-4g 单次结果自带分页（JSON <= 800 字，不靠引擎截断）', maxLen > 0 && maxLen <= 800, 'maxLen=' + maxLen);

// ============================================================
section('S-5 源码守卫：不许回退');
// ============================================================
var draftSrc = fs.readFileSync(path.join(ROOT, 'engine/import/draft.js'), 'utf8');
ok('S-5a draft.js 里不再有 `backgroundChars || 900` 死线', !/backgroundChars\s*\|\|\s*900/.test(draftSrc));
ok('S-5b draft.js 里记了 sourceChars', draftSrc.indexOf('sourceChars') >= 0);
var pbSrc = fs.readFileSync(path.join(ROOT, 'engine/core/prompt_builder.js'), 'utf8');
var protoLine = pbSrc.split('\n').filter(function (l) { return l.indexOf('查询：query_player()') >= 0; }).join('\n');
includes('S-5c 工具协议查询行声明了 query_source', protoLine, 'query_source');
var teSrc = fs.readFileSync(path.join(ROOT, 'engine/core/tool_executor.js'), 'utf8');
ok('S-5d tool_executor.js 里有 query_source 实作', teSrc.indexOf('query_source:') >= 0);

console.log('');
console.log('SOURCE_READABLE_SMOKE: ' + okN + ' ok, ' + failN + ' failed');
if (failN > 0) process.exit(1);
