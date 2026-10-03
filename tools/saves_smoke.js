// ============================================================
// H2 · 存档管理屏 smoke（纯 Node 断言，手法照 home_smoke E 组 babel transform）
// 范围：
//   A. nav_store SCREENS 含 saves
//   B. SavesScreen.js 经仓内 babel 配置 transform 通过
//   C. SavesScreen.js 源码文本断言（listAll/打开/改名/删除）
//   D. App.tsx 含 saves 分派点
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

// ---------- A. nav_store SCREENS 含 saves ----------
var NavStore = require(path.join(root, 'rn', 'nav_store.js'));
check('A1 SCREENS 含 saves',
  NavStore.SCREENS.indexOf('saves') >= 0);
// H3：SCREENS 扩为 7 屏（新增 'create' 最小创角屏），join 期望值同步更新。
// P1-G：再扩为 9 屏（新增 'classify' 卡带分类审核屏），join 期望值同步更新。
check('A2 SCREENS 顺序 settings 后 cards saves create portrait classify __boot（P1-G 加 classify）',
  NavStore.SCREENS.join(',') === 'home,story,settings,cards,saves,create,portrait,classify,__boot');

// ---------- B. SavesScreen.js babel transform ----------
var babel = require(path.join(root, 'node_modules', '@babel', 'core'));
try {
  babel.transformFileSync(path.join(root, 'rn', 'screens', 'SavesScreen.js'), {
    cwd: root,
    configFile: path.join(root, 'babel.config.js')
  });
  ok++; console.log('PASS: B babel transform rn/screens/SavesScreen.js');
} catch (e) {
  fail++; console.log('FAIL: B babel transform rn/screens/SavesScreen.js :: ' + e.message);
}

// ---------- C. SavesScreen.js 源码文本断言 ----------
var src = fs.readFileSync(path.join(root, 'rn', 'screens', 'SavesScreen.js'), 'utf8');
// C2-C4 改指（P10·A1，理由：打开存档的装载 / 进叙事页 / 历史重放已抽公共到
//   rn/story_runtime.js 的 openSave（主页存档行 / 本屏 / 主页 01 三处共用，单一实现），
//   本屏只剩一行委托。原断言要求这三件事的源码串出现在本屏内联实现里，
//   若继续照旧断言，会把「收口」误判成「功能丢失」。
//   断言强度不变：仍逐条核对 装载→进叙事页→重放→未完成轮续接 四件事，
//   只是收口实现改在 story_runtime.js 里核对（新增读取 rtSrc）。
var rtSrc = fs.readFileSync(path.join(root, 'rn', 'story_runtime.js'), 'utf8');
check('C1 列表走 Saves.listAll',
  src.indexOf('Saves.listAll') >= 0);
check('C2 打开委托 StoryRuntime.openSave（装载走 GameState.loadFromSave）',
  src.indexOf('StoryRuntime.openSave') >= 0 && rtSrc.indexOf('GameState.loadFromSave') >= 0);
check('C3 进叙事页走 Platform.ui.showScreen（story_runtime.openSave 内）',
  rtSrc.indexOf("Platform.ui.showScreen('screen-game')") >= 0);
check('C4 历史重放 + 未完成轮续接走 story_runtime（replayHistory / resume-pending）',
  rtSrc.indexOf('replayHistory') >= 0 && rtSrc.indexOf('resume-pending') >= 0);
check('C5 改名走 Saves.rename',
  src.indexOf('Saves.rename') >= 0);
check('C6 删除走 Saves.delete',
  src.indexOf('Saves.delete') >= 0);
check('C7 删除确认走 confirmAsync',
  src.indexOf('Platform.ui.confirmAsync') >= 0);
check('C8 改名内联 TextInput 编辑态',
  src.indexOf('TextInput') >= 0 && src.indexOf('setEditingId') >= 0);
check('C9 成功文案',
  src.indexOf('已删除存档') >= 0 || src.indexOf('已改名') >= 0);
check('C10 失败/取消文案',
  src.indexOf('已取消') >= 0 || src.indexOf('失败') >= 0);
check('C11 tokens 限定（useTheme）',
  src.indexOf('useTheme') >= 0 && src.indexOf('tk.colors') >= 0);
check('C12 无字面量色值',
  !/#(?:[0-9a-fA-F]{6})\b/.test(src.replace(/require\([^)]*\)/g, '')));

// ---------- D. App.tsx 含 saves 分派 ----------
var appSrc = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
check('D1 App.tsx require SavesScreen',
  appSrc.indexOf("require('./rn/screens/SavesScreen')") >= 0);
check('D2 App.tsx saves 分派点',
  appSrc.indexOf("nav.currentScreen === 'saves'") >= 0);

console.log('SAVES_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
if (fail > 0) process.exit(1);
