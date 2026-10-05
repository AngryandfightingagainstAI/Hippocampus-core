// ============================================================
// P33 · 手机版体验 smoke（纯 Node 断言，零 RN 运行时）
// 用户 m07904 四条裁决的守卫：
//   ① 叙事屏菜单入口放大带字 + 顶部横滑状态条下线（数值搬进侧栏抽屉）
//   ② 侧栏把「人物卡 / 个人素质 / 属性 / 素质」并成一条（不再分开放）
//   ③ Android 返回键优先「返回上一屏」，栈空才交还系统
//   ④ 导入卡带界面「选择文件…」与「解析资料」分开成组
// 用法：node tools/mobile_ux_smoke.js（cwd = RN 仓根）
// 纪律：纯 Node；源码级断言 + 数据层/路由层行为级断言；不引新依赖。
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

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

// ============================================================
// ① 叙事屏：菜单入口 / 状态条下线
// ============================================================
section('U-1 叙事屏菜单入口（①）');
var story = read('rn/screens/StoryScreen.js');
check('U-1a 菜单按钮有独立样式（menuBtn）', story.indexOf('styles.menuBtn') >= 0);
check('U-1b 菜单按钮带文字「☰ 菜单」', story.indexOf("'☰ 菜单'") >= 0);
check('U-1c 旧的单一 ◇ 字形入口已移除',
  story.indexOf('sbGlyph') < 0 && story.indexOf('sbBtn') < 0);
check('U-1d 菜单按钮有内边距（点得到的体量）',
  /menuBtn: \{[\s\S]{0,160}paddingHorizontal: 12, paddingVertical: 6/.test(story));

section('U-2 顶部横滑状态条下线（①）');
check('U-2a 叙事屏不再有 hudBar/hudRow',
  story.indexOf('hudBar') < 0 && story.indexOf('hudRow') < 0);
check('U-2b 叙事屏不再自算 hudItems()',
  story.indexOf('hudItems(') < 0 && story.indexOf('hudColorOf') < 0);
check('U-2c 叙事屏不再自读天气/节日/token',
  story.indexOf('Weather.getCurrent') < 0 &&
  story.indexOf('Calendar.getTodayHolidays') < 0 &&
  story.indexOf('_totalTokens') < 0);

section('U-3 侧栏抽屉「数值」区接管（①）');
var drawer = read('rn/components/SidebarDrawer.js');
check('U-3a 抽屉有「数值」小节', drawer.indexOf("'数值'") >= 0);
check('U-3b 抽屉读数走 readHud()/readHudInfo()',
  drawer.indexOf('readHud()') >= 0 && drawer.indexOf('readHudInfo()') >= 0);
check('U-3c 抽屉显示 天气 / 节日 / 游戏时间 / 累计 token',
  drawer.indexOf('Weather.getCurrent') >= 0 &&
  drawer.indexOf('Calendar.getTodayHolidays') >= 0 &&
  drawer.indexOf('formatGameTime') >= 0 &&
  drawer.indexOf("'⟡ '") >= 0);
check('U-3d 数值进度色复用同一条 barColor 规则',
  /barColor\(h, h\.pct\)/.test(drawer));
check('U-3e 抽屉不再自己扫面板（改走数据层规则）',
  drawer.indexOf('function readCustomPanels') < 0);

// ============================================================
// ② 人物卡 / 个人素质面板合并
// ============================================================
section('U-4 面板合并（②）');
var panelDataSrc = read('rn/panels/panel_data.js');
check('U-4a 合并规则在数据层单一来源',
  panelDataSrc.indexOf('function computeMergedCharPanels()') >= 0 &&
  panelDataSrc.indexOf('computeMergedCharPanels: computeMergedCharPanels') >= 0);
check('U-4b 抽屉用合并结果列面板 + 角色行改名',
  drawer.indexOf('PanelData.computeMergedCharPanels()') >= 0 &&
  drawer.indexOf('charMerge.others') >= 0 &&
  /panelRow\('character', charMerge\.label \|\| '角色'\)/.test(drawer));
var charSrc = read('rn/panels/CharacterPanel.js');
check('U-4c 角色面板承载被并入面板的条目',
  charSrc.indexOf("require('./EntriesPanel.js')") >= 0 &&
  charSrc.indexOf('<EntriesPanel panelId={mv.id} tokens={tk} />') >= 0 &&
  charSrc.indexOf('computeMergedCharPanels().ids') >= 0);

// 行为级：喂假 GameState 跑真实 computeMergedCharPanels
var pd = require(path.join(root, 'rn', 'panels', 'panel_data.js'));
function setPanels(panels) {
  global.GameState = {
    currentState: { panels: panels },
    getEntrySegmentText: function () { return ''; }
  };
}
setPanels({
  sheet: { num: 1, name: '人物卡', entries: [{ type: 'switch', name: '觉醒', value: true }] },
  attrs: { num: 2, name: '个人素质', entries: [{ type: 'number', name: '力量', current: 10, max: 20 }] },
  fame: { num: 3, name: '声望与名誉', entries: [] },
  world: { num: 5, name: '世界百科', entries: [] }
});
// 老代码上没有这个函数 ⇒ 包一层，让守卫红而不是崩
function mergedCall(mod) {
  try { return mod.computeMergedCharPanels(); }
  catch (e) { return { label: '<missing>', ids: ['<missing>'], others: ['<missing>'], err: String(e && e.message || e) }; }
}
var m1 = mergedCall(pd);
eq('U-4d 人物卡 + 个人素质 并成一条（按 num 序）', m1.ids.join(','), 'sheet,attrs');
eq('U-4e 合并行显示名取第一个匹配面板名', m1.label, '人物卡');
eq('U-4f 无关面板仍单列（声望与名誉 / 世界百科）', m1.others.map(function (p) { return p.name; }).join(','), '声望与名誉,世界百科');
var mvAttrs = pd.computeEntries('attrs');
eq('U-4g 被并入面板的条目仍可取到（力量）', mvAttrs.entries.length, 1);
eq('U-4h 被并入面板条目名', mvAttrs.entries[0].name, '力量');

setPanels({
  attrs: { num: 2, name: '个人素质', entries: [] },
  fame: { num: 3, name: '声望与名誉', entries: [] }
});
var m2 = mergedCall(pd);
eq('U-4i 名「属性」也并入', m2.ids.join(','), 'attrs');
eq('U-4j 被并入的「个人素质」不接管行名（调用方仍显示「角色」）', m2.label, '');

setPanels({ fame: { num: 3, name: '声望与名誉', entries: [] } });
var m3 = mergedCall(pd);
eq('U-4k 无匹配面板时不吞任何面板', m3.ids.length, 0);
eq('U-4l 无匹配时自定义面板原样单列', m3.others.length, 1);
eq('U-4m 无匹配面板时合并行名回落空串（调用方显示「角色」）', m3.label, '');

// ============================================================
// ③ Android 返回键
// ============================================================
section('U-5 返回键（③）');
var appSrc = read('App.tsx');
check('U-5a App.tsx 订阅硬件返回键',
  appSrc.indexOf("BackHandler.addEventListener('hardwareBackPress'") >= 0);
check('U-5b 返回键走路由栈 goBack（不是退出应用）',
  appSrc.indexOf('NavStoreModule.goBack()') >= 0);
var nav = require(path.join(root, 'rn', 'nav_store.js'));
nav.reset();
eq('U-5c 栈空 goBack 返回 false（交还系统 ⇒ 主页才退出应用）', nav.goBack(), false);
nav.navigate('story');
eq('U-5d 有上一屏时 goBack 返回 true', nav.goBack(), true);
eq('U-5e 回退后停在 home', nav.getSnapshot().screen, 'home');
nav.reset();

// ============================================================
// ④ 导入卡带界面按钮分离
// ============================================================
section('U-6 导入界面按钮分离（④）');
var cards = read('rn/screens/CardsScreen.js');
check('U-6a 「或 从 手 机 选 文 件」独立小标题已就位',
  cards.indexOf("'或 从 手 机 选 文 件'") >= 0);
check('U-6b 选文件与解析分属两组（中间有分隔与小标题）',
  /或 从 手 机 选 文 件[\s\S]{0,700}doParseMaterial/.test(cards) &&
  cards.indexOf("'解 析 与 落 库'") >= 0);
check('U-6c 选文件按钮保留原入口与文案',
  cards.indexOf('onPress={doPickMaterialFile}') >= 0 && cards.indexOf("'选择文件…'") >= 0);
check('U-6d 解析 / AI 补全 / 落库三按钮仍在',
  cards.indexOf("'解析资料'") >= 0 && cards.indexOf("'让 AI 补全'") >= 0 &&
  cards.indexOf("'落库为卡带'") >= 0);

console.log('\nMOBILE_UX_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
if (fail > 0) process.exit(1);
