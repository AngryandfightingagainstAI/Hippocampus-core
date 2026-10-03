// ============================================================
// H2 · 卡带库屏 smoke（纯 Node 断言，手法照 home_smoke E 组 babel transform）
// 范围：
//   A. nav_store SCREENS 含 cards/saves（与 home_smoke A3 同口径）
//   B. CardsScreen.js 经仓内 babel 配置 transform 通过（语法可解析）
//   C. CardsScreen.js 源码文本断言（功能点齐全：列表/设为当前卡/删除/粘贴JSON导入）
//   D. App.tsx 含 cards 分派点
//   E. P15 导入文游资料：引擎 12 模块加载 + UI 三按钮接线（粘贴资料 → 解析 → AI 补全 → 落库）
// 纪律：纯 Node，零 RN 运行时；不引新依赖；不复制业务逻辑。
// ============================================================

'use strict';

var path = require('path');
var fs = require('fs');
var root = path.resolve(__dirname, '..');

var ok = 0;
var fail = 0;
function check(name, cond) {
  if (cond) { ok++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}

// ---------- A. nav_store SCREENS 含 cards/saves ----------
var NavStore = require(path.join(root, 'rn', 'nav_store.js'));
check('A1 SCREENS 含 cards',
  NavStore.SCREENS.indexOf('cards') >= 0);
check('A2 SCREENS 含 saves',
  NavStore.SCREENS.indexOf('saves') >= 0);
// H3：SCREENS 扩为 7 屏（新增 'create' 最小创角屏），join 期望值同步更新。
// P1-G：再扩为 9 屏（新增 'classify' 卡带分类审核屏），join 期望值同步更新。
check('A3 SCREENS 顺序 settings 后 cards saves create portrait classify __boot（P1-G 加 classify）',
  NavStore.SCREENS.join(',') === 'home,story,settings,cards,saves,create,portrait,classify,__boot');

// ---------- B. CardsScreen.js babel transform ----------
var babel = require(path.join(root, 'node_modules', '@babel', 'core'));
try {
  babel.transformFileSync(path.join(root, 'rn', 'screens', 'CardsScreen.js'), {
    cwd: root,
    configFile: path.join(root, 'babel.config.js')
  });
  ok++; console.log('PASS: B babel transform rn/screens/CardsScreen.js');
} catch (e) {
  fail++; console.log('FAIL: B babel transform rn/screens/CardsScreen.js :: ' + e.message);
}

// ---------- C. CardsScreen.js 源码文本断言 ----------
var src = fs.readFileSync(path.join(root, 'rn', 'screens', 'CardsScreen.js'), 'utf8');
check('C1 列表走 Storage.getAllCards',
  src.indexOf('Storage.getAllCards') >= 0);
check('C2 设为当前卡走 Model.setHomeCardId',
  src.indexOf('Model.setHomeCardId') >= 0);
check('C3 删除走 Saves.listByCard',
  src.indexOf('Saves.listByCard') >= 0);
check('C4 删除走 Saves.delete',
  src.indexOf('Saves.delete') >= 0);
check('C5 删除走 VFS.deleteFile',
  src.indexOf('VFS.deleteFile') >= 0);
check('C6 内置卡检查（CARDS 防御）',
  src.indexOf('CARDS') >= 0);
check('C7 导入走 CardValidator.validate',
  src.indexOf('CardValidator.validate') >= 0);
check('C8 导入走 Storage.getImportedCards',
  src.indexOf('Storage.getImportedCards') >= 0);
check('C9 导入走 Storage.setImportedCards',
  src.indexOf('Storage.setImportedCards') >= 0);
check('C10 粘贴 JSON 多行 TextInput',
  src.indexOf('TextInput') >= 0 && src.indexOf('multiline') >= 0);
check('C11 成功文案（已导入）',
  src.indexOf('已导入') >= 0);
check('C12 失败文案（校验失败）',
  src.indexOf('校验失败') >= 0);
check('C13 confirmAsync 删除确认',
  src.indexOf('Platform.ui.confirmAsync') >= 0);
check('C14 tokens 限定（useTheme）',
  src.indexOf('useTheme') >= 0 && src.indexOf('tk.colors') >= 0);
check('C15 无字面量色值（不含 # + 6位 hex）',
  !/#(?:[0-9a-fA-F]{6})\b/.test(src.replace(/require\([^)]*\)/g, '')));

// ---------- D. App.tsx 含 cards 分派 ----------
var appSrc = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
check('D1 App.tsx require CardsScreen',
  appSrc.indexOf("require('./rn/screens/CardsScreen')") >= 0);
check('D2 App.tsx cards 分派点',
  appSrc.indexOf("nav.currentScreen === 'cards'") >= 0);


// ---------- E. P15 导入文游资料 ----------
// E1~E3：引擎 12 模块都进了 rn_bootstrap（少一个真机就 Import.run 抛错）
var boot = fs.readFileSync(path.join(root, 'rn', 'rn_bootstrap.js'), 'utf8');
var IMP_MODS = ['ImportDecode', 'ImportFormats', 'ImportMiddle', 'ImportReport', 'ImportUnzip',
  'ImportParseTextlike', 'ImportParseArchive', 'ImportParsePdf', 'ImportPipeline', 'ImportVault',
  'ImportDraft', 'Import'];
var missingMods = IMP_MODS.filter(function (n) { return boot.indexOf("'" + n + "'") < 0; });
check('E1 rn_bootstrap 加载 12 个引擎模块（缺：' + missingMods.join(',') + '）', missingMods.length === 0);
check('E2 12 个 load 字面量 require（Metro 静态收集）',
  (boot.match(/require\('\.\.\/engine\/import\//g) || []).length === 12);
check('E3 ImportHtml 走 extra 挂到 globalThis（epub 分支要用）',
  boot.indexOf("'ImportParseTextlike'") >= 0 && boot.indexOf("'ImportHtml'") >= 0);
// E4：引擎文件真的在盘上（12 个模块 + 3 个解析器）
var impFiles = ['decode.js', 'formats.js', 'middle.js', 'report.js', 'unzip.js', 'pipeline.js',
  'vault.js', 'draft.js', 'index.js', path.join('parsers', 'textlike.js'),
  path.join('parsers', 'archive.js'), path.join('parsers', 'pdf.js')];
var missingFiles = impFiles.filter(function (f) { return !fs.existsSync(path.join(root, 'engine', 'import', f)); });
check('E4 engine/import 12 个模块在盘（缺：' + missingFiles.join(',') + '）', missingFiles.length === 0);
// E5~E10：UI 接线（源码文本断言）
check('E5 三个动作函数齐全',
  src.indexOf('function doParseMaterial()') >= 0 &&
  src.indexOf('function doAiEnrichMaterial()') >= 0 &&
  src.indexOf('function doCommitMaterial()') >= 0);
check('E6 走 Import.run / enrich / commit',
  src.indexOf('Import.run(') >= 0 && src.indexOf('Import.enrich(') >= 0 && src.indexOf('Import.commit(') >= 0);
check('E7 AI 补全把 ApiClient.chat 传进 Import.enrich',
  /Import\.enrich\([\s\S]{0,300}ApiClient\.chat/.test(src));
check('E8 小节标题逐字「导 入 文 游 资 料」', src.indexOf("'导 入 文 游 资 料'") >= 0);
check('E9 三按钮文案逐字',
  src.indexOf("'解析资料'") >= 0 && src.indexOf("'让 AI 补全'") >= 0 && src.indexOf("'落库为卡带'") >= 0);
// P20：这句以前断言「文件选择器还没接」——现在是假命题了（真接了系统选文件），
//   改成断言新的诚实文案：既点出二进制格式，又指向「选择文件…」。
check('E10 诚实声明：二进制格式要点「选择文件…」（旧「还没接」不再出现）',
  /docx[\s\S]{0,80}选择文件/.test(src) && /epub/.test(src) &&
  src.indexOf('文件选择器还没接') < 0);
check('E11 落库失败展示 reason（不吞错）',
  /!res\.ok[\s\S]{0,200}res\.reason/.test(src));
// E12：旧粘贴 JSON 入口一字未动（防「加功能顺手改坏老路」）
check('E12 旧粘贴 JSON 导入入口仍在',
  src.indexOf('function doImport()') >= 0 && src.indexOf('CardValidator.validate') >= 0 &&
  src.indexOf("'诊断并导入'") >= 0);
check('E13 文件名嗅探覆盖 json/html/md/csv',
  /guessMaterialName[\s\S]{0,900}\.json/.test(src) && /guessMaterialName[\s\S]{0,900}\.html/.test(src) &&
  /guessMaterialName[\s\S]{0,900}\.md/.test(src) && /guessMaterialName[\s\S]{0,900}\.csv/.test(src));
check('E14 新增样式只用 tokens（无字面量 hex）', !/#(?:[0-9a-fA-F]{6})\b/.test(src.replace(/require\([^)]*\)/g, '')));

console.log('CARDS_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
if (fail > 0) process.exit(1);
