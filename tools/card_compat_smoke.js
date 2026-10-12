// ============================================================
// P43 · 卡带兼容归一 + 产出物默认定论规则 smoke（纯 Node，零 RN 运行时）
//
// 背景（用户 m09490 问「卡带格式指令不需要更新吗，你要不要提醒一下生成卡带的 AI 什么」）：
//   查证发现模板里有两条「承诺了、引擎没做」的口径，照着写会**静默失效**：
//   1. 模板：「只有 worldbook.npcs 缺失时，引擎才读顶层 npcs。」
//      实际：运行期读取口全是 wb.npcs（npc_runtime.js:337、info_feed.js:226、events.js:697、
//      proposal_validator.js:37、npc_deduction_ai.js:129、audit.js:172、prompt_builder.js:855、
//      tool_executor.js:24、npc_deduction.js:296、ui_npc.js:59/260、story.js:870、ui_core.js:571-573），
//      只有卡片编辑器 editor.js:36 读顶层 ⇒ 只写顶层 npcs 的卡带「编辑器里看得到人物、游戏里一个都没有」。
//   2. 模板：「填 "outputs": {} → 用引擎默认池」。
//      实际：getCardConfig() 原样返回 wb.outputs，没有默认定论规则，而 _checkSettleRule() 只认
//      settleRules.when ⇒ 产出物永远停在「发酵中」。
//   P43 的修法：导入/读档时把顶层 npcs 并入 worldbook.npcs（并在 warnings 里给出中文提示），
//   getCardConfig() 在没写 settleRules 时补 progress-full 默认规则。本文件把这两条钉住。
// 用法：node tools/card_compat_smoke.js（cwd = RN 仓根）
// ============================================================

'use strict';

var path = require('path');
var fs = require('fs');
var root = path.resolve(__dirname, '..');
var PC_ROOT = process.env.HIPPOCAMPUS_PC || 'D:\\AI文游\\神秘小引擎测试版\\神秘小引擎测试版';

var ok = 0;
var fail = 0;
function check(name, cond, detail) {
  if (cond) { ok++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' <<< ' + detail : '')); }
}

// P53：CI 只有一个仓 —— 跨仓（两仓同源）断言在「另一仓不可见」时降级为 SKIP，不再是 FAIL。
//   本机两仓同在时行为与以前逐字一致（断言数不变）；换机器可用 HIPPOCAMPUS_PC 指定桌面仓。
var HAVE_OTHER = fs.existsSync(path.join(PC_ROOT, 'package.json'));
var skipN = 0;
function skip(name, why) { skipN++; console.log('  SKIP ' + name + (why ? ' <<< ' + why : '')); }
function eq(name, actual, expected) {
  check(name + '（actual=' + JSON.stringify(actual) + '）', actual === expected);
}
function section(t) { console.log('---- ' + t + ' ----'); }
function readIf(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } }
function norm(t) { return t === null ? null : t.split('\r\n').join('\n'); }

var CV_PATH = path.join(root, 'engine', 'core', 'card_validator.js');
var GS_PATH = path.join(root, 'engine', 'core', 'gamestate.js');
var OUT_PATH = path.join(root, 'engine', 'outputs.js');
var TPL_PATH = path.join(root, 'rn', 'instruction_templates.js');
var CV_PC = path.join(PC_ROOT, 'engine', 'core', 'card_validator.js');
var OUT_PC = path.join(PC_ROOT, 'engine', 'outputs.js');

var CardValidator = null;
try { CardValidator = require(CV_PATH); } catch (e) { CardValidator = null; }

function makeCard(extra) {
  var base = {
    schemaVersion: '1.2', cardId: 'p43rn', cardName: 'P43 手机端测试卡',
    game: { title: '测试' },
    hud: [], sidebar: [], attributes: [],
    panels: [{ num: 2 }, { num: 3 }, { num: 4 }, { num: 5 }]
  };
  var k;
  for (k in (extra || {})) base[k] = extra[k];
  return base;
}

// ---------- W-1 源码形态 ----------
section('W-1 源码形态');
var cvSrc = readIf(CV_PATH) || '';
var gsSrc = readIf(GS_PATH) || '';
var outSrc = readIf(OUT_PATH) || '';
check('W-1a card_validator.js 有 normalizeCard', /normalizeCard\(card\)\s*\{/.test(cvSrc));
check('W-1b validate() 里调用归一', /const moved = this\.normalizeCard\(card\);/.test(cvSrc));
check('W-1c 归一的提示进了 warnings', /for \(const m of moved\) warnings\.push\(m\)/.test(cvSrc));
check('W-1d 读档后也归一（gamestate）',
  /this\.currentCard = data\.card;[\s\S]{0,400}CardValidator\.normalizeCard\(this\.currentCard\)/.test(gsSrc));
check('W-1e getCardConfig 有默认 settleRules 兜底', /settleRules: \{ when: \{ type: 'progress-full' \} \}/.test(outSrc));

// ---------- W-2 行为：顶层 npcs 并入 ----------
section('W-2 顶层 npcs 并入 worldbook.npcs');
if (!CardValidator || typeof CardValidator.normalizeCard !== 'function') {
  check('W-2 模块缺失，后续 8 条计为失败', false, 'card_validator.js 缺 normalizeCard');
  for (var i = 0; i < 7; i++) check('W-2 模块缺失（占位 ' + i + '）', false);
} else {
  var c1 = makeCard({ npcs: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }] });
  var r1 = CardValidator.validate(c1);
  check('W-2a 只写顶层 npcs 的卡带仍能导入（不拦）', r1.ok === true, JSON.stringify(r1));
  eq('W-2b 顶层 npcs 已并入 worldbook.npcs', (c1.worldbook && c1.worldbook.npcs || []).length, 2);
  check('W-2c 给出可见中文提醒（不静默）',
    Array.isArray(r1.warnings) && r1.warnings.some(function (w) { return /顶层 npcs/.test(w) && /worldbook\.npcs/.test(w); }),
    JSON.stringify(r1.warnings || []));

  var c2 = makeCard({ worldbook: { npcs: [{ id: 'keep', name: '原有' }] }, npcs: [{ id: 'x', name: '顶层' }] });
  CardValidator.validate(c2);
  eq('W-2d worldbook.npcs 非空时不被顶层覆盖', c2.worldbook.npcs[0].id, 'keep');

  var c3 = makeCard({ worldbook: { npcs: [] }, npcs: [{ id: 'y', name: '顶层' }] });
  CardValidator.validate(c3);
  eq('W-2e worldbook.npcs 为空数组时并入', c3.worldbook.npcs.length, 1);

  var c4 = makeCard({ worldbook: { npcs: null, events: null, storyNodes: 'x' } });
  CardValidator.validate(c4);
  check('W-2f worldbook 三个集合字段非数组时归一成数组',
    Array.isArray(c4.worldbook.npcs) && Array.isArray(c4.worldbook.events) && Array.isArray(c4.worldbook.storyNodes));

  eq('W-2g 非对象入参不抛错', CardValidator.normalizeCard(null).length, 0);

  var c5 = makeCard({ worldbook: { npcs: [{ id: 'z', name: '正常' }] } });
  var r5 = CardValidator.validate(c5);
  check('W-2h 正常卡带不误报 npcs 警告',
    r5.ok === true && !(r5.warnings || []).some(function (w) { return /顶层 npcs/.test(w); }),
    JSON.stringify(r5.warnings || []));
}

// ---------- W-3 产出物默认定论规则（从源码抠 getCardConfig 真跑） ----------
section('W-3 产出物默认定论规则');
var mk = null;
(function () {
  var m = outSrc.match(/getCardConfig: function\(\) \{[\s\S]*?\n    \},/);
  if (m) { try { mk = new Function('GameState', 'return ({' + m[0] + '});'); } catch (e) { mk = null; } }
})();
function cfgOf(card) {
  if (!mk) return null;
  var cfg = mk({ currentCard: card }).getCardConfig();
  return cfg;
}
if (!mk) { check('W-3 抠不出 getCardConfig，后续 5 条计为失败', false); for (var j = 0; j < 4; j++) check('W-3 占位 ' + j, false); }
else {
  var g1 = cfgOf({ worldbook: { outputs: {} } });
  eq('W-3a 声明 "outputs": {} ⇒ 补默认 progress-full 定论',
    g1 && g1.settleRules && g1.settleRules.when && g1.settleRules.when.type, 'progress-full');
  check('W-3b 默认规则不带 affects（不擅自给属性）',
    !(g1 && g1.settleRules && g1.settleRules.affects && g1.settleRules.affects.length));
  eq('W-3c 作者写了 settleRules ⇒ 原样不覆盖',
    (cfgOf({ worldbook: { outputs: { settleRules: { when: { type: 'fixed-years', years: 3 } } } } }) || {}).settleRules.when.type,
    'fixed-years');
  var g3 = cfgOf({ worldbook: { outputs: { types: [{ id: 'book' }] } } });
  check('W-3d 补默认规则时保留作者其它字段（types）',
    !!(g3 && g3.types && g3.types.length === 1 && g3.types[0].id === 'book' && g3.settleRules.when.type === 'progress-full'));
  eq('W-3e 卡带没声明 outputs ⇒ 仍是 null（不凭空开启）', cfgOf({ worldbook: {} }), null);
}

// ---------- W-4 两仓同源件哨兵 ----------
section('W-4 两仓同源哨兵（行尾归一后逐字节一致）');
[['engine/outputs.js', OUT_PATH, OUT_PC], ['engine/core/card_validator.js', CV_PATH, CV_PC]].forEach(function (rel) {
  var a = norm(readIf(rel[1])), b = norm(readIf(rel[2]));
  if (a === null || b === null) {
    if (!HAVE_OTHER) skip('W-4 两仓同源 ' + rel[0], '另一仓不可见（' + PC_ROOT + '）');
    else check('W-4 两仓同源 ' + rel[0], false, '读不到文件（PC 仓路径 ' + PC_ROOT + '）');
  }
  else check('W-4 两仓同源 ' + rel[0] + '（' + a.length + ' 字符）', a === b, 'RN ' + a.length + ' vs PC ' + b.length);
});

// ---------- W-5 指令模板的提醒必须在 ----------
section('W-5 生成卡带指令里的 P43 提醒');
var tpl = readIf(TPL_PATH) || '';
[['顶层 npcs 兼容口径', '顶层 npcs 只是兼容写法'],
 ['settleRules 不写就不定论', '不写 settleRules.when'],
 ['产出物系统默认关', '产出物系统由玩家全局设置里的开关控制']].forEach(function (t) {
  check('W-5 手机模板含「' + t[0] + '」', tpl.indexOf(t[1]) >= 0);
});
check('W-5d 旧误导口径已移除', tpl.indexOf('不填 outputs → 系统对卡带不可用') < 0);

console.log('');
console.log('CARD_COMPAT_SMOKE: ' + ok + ' ok, ' + fail + ' failed' + (skipN ? ', ' + skipN + ' skipped' : ''));
if (fail > 0) process.exit(1);
