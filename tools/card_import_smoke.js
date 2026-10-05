// ============================================================
// P35 · 卡带导入解析 smoke（纯 Node，零 RN 运行时）
// 背景（真机报错）：卡带 JSON 本身没问题，但手机导入报
//   「JSON解析失败: JSON Parse error: Unexpected character: 出
//     (第0字符附近: { "schemaVersion": "1.2", "cardId": )」
// 两个根因：
//   1. H2-R4 的粘贴清洗把「所有」弯引号 “ ” 一律换成 " —— 卡带字符串**内容**里
//      本来就会有中文引号（例："desc": "喊了一声“出发”"），一换就把字符串提前闭合，
//      于是剩余中文落到结构位置 ⇒ Hermes 报 Unexpected character: 出。桌面没有这道清洗，
//      所以同一份卡带在桌面导得进。正确做法：先原样解析，失败才把弯引号当「结构引号」兜底。
//   2. Hermes 的 JSON.parse 不带 position，界面只能贴开头 40 字 ⇒ 报「第 0 字符附近」，
//      定位不到真凶；改为自己扫描出真实偏移 + 上下文 + 可能原因 + 末尾片段。
// 用法：node tools/card_import_smoke.js（cwd = RN 仓根）
// ============================================================

'use strict';

var path = require('path');
var fs = require('fs');
var root = path.resolve(__dirname, '..');

var ok = 0;
var fail = 0;
function check(name, cond, detail) {
  if (cond) { ok++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' <<< ' + detail : '')); }
}
function eq(name, actual, expected) {
  check(name + '（actual=' + JSON.stringify(actual) + '）', actual === expected);
}
function section(t) { console.log('---- ' + t + ' ----'); }

// ---------- 模块：rn/json_locate.js（纯 JS，可 Node 直 require） ----------
var JsonLocate = null;
try { JsonLocate = require(path.join(root, 'rn', 'json_locate.js')); } catch (e) { JsonLocate = null; }

section('V-1 模块存在与导出');
check('V-1a rn/json_locate.js 存在且导出 parseCardJson', !!(JsonLocate && typeof JsonLocate.parseCardJson === 'function'));
check('V-1b 导出 locateJsonError', !!(JsonLocate && typeof JsonLocate.locateJsonError === 'function'));
if (!JsonLocate || typeof JsonLocate.parseCardJson !== 'function') {
  console.log('\nCARD_IMPORT_SMOKE: ' + ok + ' ok, ' + (fail + 20) + ' failed（模块缺失，后续断言计为失败）');
  process.exit(1);
}

// ---------- V-2 字符串内容里的中文引号不能被当成结构引号 ----------
section('V-2 中文引号在字符串内容里（真机真凶）');
var cardWithCnQuotes = '{"schemaVersion":"1.2","cardId":"cn_q","cardName":"引号测试",' +
  '"worldbook":{"npcs":[{"id":"npc_a","name":"阿甲","desc":"喊了一声“出发”，就上了船"}]}}';
var r1 = JsonLocate.parseCardJson(cardWithCnQuotes);
check('V-2a 含中文引号的卡带能导入', !!(r1 && r1.ok), r1 && r1.message);
eq('V-2b 且没有动用弯引号兜底', r1 && r1.usedFallback, false);
eq('V-2c 解析出的描述原样保留中文引号',
  r1 && r1.ok ? r1.card.worldbook.npcs[0].desc : '', '喊了一声“出发”，就上了船');

var cardWithCnSingle = '{"cardId":"cn_s","desc":"他说‘走吧’然后离开"}';
var r1b = JsonLocate.parseCardJson(cardWithCnSingle);
check('V-2d 中文单引号同样不影响解析', !!(r1b && r1b.ok), r1b && r1b.message);
eq('V-2e 中文单引号内容原样保留', r1b && r1b.ok ? r1b.card.desc : '', '他说‘走吧’然后离开');

// ---------- V-3 结构引号被粘贴改写成弯引号时仍能兜底 ----------
section('V-3 结构引号被改成弯引号的兜底');
var structuralCurly = '{“schemaVersion”:“1.2”,“cardId”:“curly”,“desc”:“正常文本”}';
var r2 = JsonLocate.parseCardJson(structuralCurly);
check('V-3a 结构引号全被改成弯引号时仍能导入', !!(r2 && r2.ok), r2 && r2.message);
eq('V-3b 标记走了兜底分支', r2 && r2.usedFallback, true);
eq('V-3c 兜底解析出的 cardId', r2 && r2.ok ? r2.card.cardId : '', 'curly');

// ---------- V-4 真坏 JSON 要指到真实位置 ----------
section('V-4 出错定位');
var broken = '{"cardId":"bad","desc":"他说"出发"了","x":1}';
var r3 = JsonLocate.parseCardJson(broken);
check('V-4a 坏 JSON 判定为失败', !!(r3 && r3.ok === false));
check('V-4b 给出了定位对象', !!(r3 && r3.loc && typeof r3.loc.pos === 'number'));
var posOk = r3 && r3.loc && r3.loc.pos > 0 && r3.loc.pos < broken.length;
check('V-4c 偏移不再是 0（Hermes 拿不到 position 的老毛病）', !!posOk, r3 && r3.loc && ('pos=' + r3.loc.pos));
check('V-4d 上下文片段里能看到出错处附近的内容', !!(r3 && r3.loc && r3.loc.around && r3.loc.around.indexOf('出') >= 0), r3 && r3.loc && r3.loc.around);
check('V-4e 给出可能原因（提到引号未转义/提前闭合）', !!(r3 && r3.loc && r3.loc.hint && (r3.loc.hint.indexOf('引号') >= 0 || r3.loc.hint.indexOf('转义') >= 0)), r3 && r3.loc && r3.loc.hint);
eq('V-4f 报出全文长度', r3 && r3.loc ? r3.loc.length : -1, broken.length);

var truncated = '{"cardId":"cut","npcs":[{"id":"a","name":"甲"},{"id":"b"';
var r4 = JsonLocate.parseCardJson(truncated);
check('V-4g 截断文本判定为失败', !!(r4 && r4.ok === false));
check('V-4h 原因提示里提到截断/不完整', !!(r4 && r4.loc && r4.loc.hint && (r4.loc.hint.indexOf('截断') >= 0 || r4.loc.hint.indexOf('不完整') >= 0 || r4.loc.hint.indexOf('闭合') >= 0)), r4 && r4.loc && r4.loc.hint);

var withNewline = '{"cardId":"nl","desc":"第一行\n第二行"}';
var r5 = JsonLocate.parseCardJson(withNewline);
check('V-5a 字符串里裸换行判定为失败', !!(r5 && r5.ok === false));
check('V-5b 原因提示里提到换行/控制字符', !!(r5 && r5.loc && r5.loc.hint && (r5.loc.hint.indexOf('换行') >= 0 || r5.loc.hint.indexOf('控制字符') >= 0)), r5 && r5.loc && r5.loc.hint);

// ---------- V-6 BOM / 零宽字符仍然要清掉 ----------
section('V-6 既有清洗口径保留');
var bomCard = '\uFEFF{"cardId":"bom","desc":"a\u200Bb"}';
var r6 = JsonLocate.parseCardJson(bomCard);
check('V-6a BOM + 零宽字符仍能导入', !!(r6 && r6.ok), r6 && r6.message);
eq('V-6b 零宽字符被去掉', r6 && r6.ok ? r6.card.desc : '', 'ab');

// ---------- V-7 屏幕接线 ----------
section('V-7 CardsScreen 接线（源码级）');
var cs = fs.readFileSync(path.join(root, 'rn', 'screens', 'CardsScreen.js'), 'utf8');
check('V-7a 屏幕走 parseCardJson（不再是裸 JSON.parse + 只贴开头 40 字）',
  cs.indexOf('parseCardJson') >= 0 && cs.indexOf('JSON.parse(text)') < 0);
check('V-7b 失败文案带真实偏移与可能原因', cs.indexOf('loc.pos') >= 0 && cs.indexOf('loc.hint') >= 0);
check('V-7c 卡带行按钮容器允许换行（删除卡带不再被挤出屏）',
  /btnRow: \{[^}]*flexWrap/.test(cs), (cs.match(/btnRow: \{[^}]*\}/) || [''])[0]);

console.log('\nCARD_IMPORT_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
if (fail > 0) process.exit(1);
