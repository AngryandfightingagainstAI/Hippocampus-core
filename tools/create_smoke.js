// ============================================================
// H3 · 最小创角屏 smoke（纯 Node 断言，手法照 cards_smoke）
// 范围：
//   A. nav_store SCREENS 含 create + 顺序 + screen-create 改指 create
//   B. CreateScreen.js 经仓内 babel 配置 transform 通过（语法可解析）
//   C. CreateScreen.js 源码文本断言（数据源/表单/校验/摘要/未支持分支/
//      九步契约锚点齐全且按序/契约禁令/tokens 限定/无字面量色值）
//   D. 接线：App.tsx 分派、HomeScreen 02 真入口、SavesScreen 顶栏按钮、
//      两屏死引用旧文案清空
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

function readSrc(rel) {
  try { return fs.readFileSync(path.join(root, rel), 'utf8'); }
  catch (e) { return null; }
}

// ---------- A. nav_store ----------
var NavStore = require(path.join(root, 'rn', 'nav_store.js'));
check('A1 SCREENS 含 create',
  NavStore.SCREENS.indexOf('create') >= 0);
check("A2 SCREENS 顺序 saves 后 create、__boot 前（H6 加 portrait、P1-G 加 classify）",
  NavStore.SCREENS.join(',') === 'home,story,settings,cards,saves,create,portrait,classify,__boot');
check("A3 screen-create 改指 create",
  NavStore.ELECTRON_SCREEN_MAP['screen-create'] === 'create');

// ---------- B. CreateScreen.js babel transform ----------
var createPath = path.join(root, 'rn', 'screens', 'CreateScreen.js');
try {
  var babel = require(path.join(root, 'node_modules', '@babel', 'core'));
  babel.transformFileSync(createPath, {
    cwd: root,
    configFile: path.join(root, 'babel.config.js')
  });
  ok++; console.log('PASS: B babel transform rn/screens/CreateScreen.js');
} catch (e) {
  fail++; console.log('FAIL: B babel transform rn/screens/CreateScreen.js :: ' + e.message);
}

// ---------- C. CreateScreen.js 源码文本断言 ----------
var src = readSrc('rn/screens/CreateScreen.js');
if (src === null) {
  for (var ci = 1; ci <= 14; ci++) fail++, console.log('FAIL: C' + ci + '（CreateScreen.js 不存在）');
} else {
  check('C1 数据源当前主页卡（Model.getHomePicked）',
    src.indexOf('Model.getHomePicked') >= 0 || src.indexOf('getHomePicked') >= 0);
  // C2（P10·A7 事实变化改指）：原断言找字面量「库里还没有卡带」（RN 自造句）。
  // A7 统一空态文案后，CreateScreen 无卡回退改走共享常量 EmptyTexts.NO_CARDS
  // （逐字照桌面 ui_cards.js:38「暂无卡带。」），字面量已不存在 ⇒ 改指为「引用共享常量」。
  check('C2 无卡回退文案（EmptyTexts.NO_CARDS，逐字照桌面「暂无卡带。」）',
    src.indexOf('EmptyTexts.NO_CARDS') >= 0);
  check('C3 读 card.steps + 无 steps 默认两步（DEFAULT_STEPS）',
    src.indexOf('.steps') >= 0 && src.indexOf('DEFAULT_STEPS') >= 0);
  check('C4 form 字段渲染 TextInput',
    src.indexOf('TextInput') >= 0);
  check('C5 required 空值就地报错（请填写）',
    src.indexOf('required') >= 0 && src.indexOf('请填写') >= 0);
  check('C6 summary 步「完成」',
    src.indexOf('summary') >= 0 && src.indexOf('完成') >= 0);
  // C7（P5 改）：原断言「本批未支持」已按任务书 S2 删除——已知类型必须实装，
  // 只有真正未知的 step.type 才显示桌面同款「（未知步骤类型：X）」（story.js:738）。
  check('C7 未知类型显式分支（未知步骤类型）',
    src.indexOf('未知步骤类型') >= 0);
  // C13/C14（P5 新增）：逻辑下沉 A 类模型 + 已知步骤类型全实装。
  check('C13 委派 A 类模型 create_flow_model',
    src.indexOf('create_flow_model') >= 0);
  check('C14 已知步骤类型全实装（select / multi-select / quiz / 池 / 草稿）',
    src.indexOf("'select'") >= 0 && src.indexOf("'multi-select'") >= 0 &&
    src.indexOf('quiz') >= 0 && src.indexOf('calcAllocated') >= 0 &&
    src.indexOf('saveDraft') >= 0 && src.indexOf('clearDraft') >= 0);

  // 契约第二节九步锚点：齐全 + 按序
  // P9·S7 更新：finish 改为先进人设屏（UI_Portrait.start）再进游戏；原「Portrait.fallback」
  //   锚点已下沉 UI_Portrait（跳过 ⇒ skip() 走 fallback），且该串现仅出现在注释中，
  //   会破坏「源码 indexOf 严格递增」，故从锚点数组移除，改为反映新链路。
  var CONTRACT = [
    'Saves.getNextDefaultName',
    'Saves.create',
    'GameState.loadFromSave',
    'Saves.setPlayerName',
    '_buildInitialGameTime',
    'GameState.persist',
    'UI_Portrait.start',
    'Portrait.save',
    "navigate('story')"
  ];
  var idx = CONTRACT.map(function (a) { return src.indexOf(a); });
  check('C8 契约九步锚点全部出现',
    idx.every(function (i) { return i >= 0; }));
  var inOrder = true;
  for (var k = 1; k < idx.length; k++) { if (!(idx[k] > idx[k - 1])) inOrder = false; }
  check('C9 契约九步按 1→9 顺序出现', inOrder);

  check("C10 契约禁令：不调 Platform.ui.showScreen('screen-game')",
    src.split('\n').filter(function (l) { return !/^\s*\/\//.test(l); }).join('\n').indexOf("showScreen('screen-game')") < 0 &&
    src.split('\n').filter(function (l) { return !/^\s*\/\//.test(l); }).join('\n').indexOf('showScreen("screen-game")') < 0);
  check('C11 tokens 限定（useTheme + tk.colors）',
    src.indexOf('useTheme') >= 0 && src.indexOf('tk.colors') >= 0);
  check('C12 无字面量色值（不含 # + 6位 hex）',
    !/#(?:[0-9a-fA-F]{6})\b/.test(src.replace(/require\([^)]*\)/g, '')));
}

// ---------- D. 接线 ----------
var appSrc = readSrc('App.tsx') || '';
check('D1 App.tsx require CreateScreen',
  appSrc.indexOf("require('./rn/screens/CreateScreen')") >= 0);
check("D2 App.tsx create 分派点",
  appSrc.indexOf("nav.currentScreen === 'create'") >= 0);

var homeSrc = readSrc('rn/screens/HomeScreen.js') || '';
check("D3 HomeScreen 02 行真入口（navigate('create')）",
  homeSrc.indexOf("navigate('create')") >= 0);

var savesSrc = readSrc('rn/screens/SavesScreen.js') || '';
check("D4 SavesScreen 顶栏「新建存档」按钮（navigate('create')）",
  savesSrc.indexOf('新建存档') >= 0 && savesSrc.indexOf("navigate('create')") >= 0);

check('D5 死引用旧文案清空（两屏旧串均不存在）',
  homeSrc.indexOf('这张卡带还没有存档，从 02 开始') < 0 &&
  savesSrc.indexOf('从主页 02 新游戏或 01 续玩开始') < 0);

console.log('CREATE_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
if (fail > 0) process.exit(1);
