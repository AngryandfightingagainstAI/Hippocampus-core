// ============================================================
// 批次 H4 · 面板 smoke（纯 Node 断言）
// 范围：
//   A. 源码结构：六面板文件存在 + 导出名 + 被 PanelHost 引用 + SidebarDrawer 含「面板」区
//      + App.tsx 根层挂载 PanelHost（P9·S6；StoryScreen 已移除）
//   B. @babel/core + 仓内 babel.config.js transform 每个新文件
//   C. 数据形状：用假 GameState（空 / 正常 / 缺字段三种）喂 panel_data 六个 compute，
//      断言不抛且出空态/正常态（裁定 2：抛一次即不合格）
//   D. 无字面量色值：!/#(?:[0-9a-fA-F]{6})\b/
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

// ============================================================
// A. 源码结构断言
// ============================================================
var PANEL_FILES = [
  'rn/panels/panel_data.js',
  'rn/panels/StatusCardPanel.js',
  'rn/panels/LogPanel.js',
  'rn/panels/DiceHistoryPanel.js',
  'rn/panels/CharacterPanel.js',
  'rn/panels/EntriesPanel.js',
  'rn/panels/ShopIndexPanel.js',
  'rn/components/PanelHost.js'
];

PANEL_FILES.forEach(function (rel, i) {
  check('A' + (i + 1) + ' 文件存在 ' + rel,
    fs.existsSync(path.join(root, rel)));
});

// 导出名断言
var pd = require(path.join(root, 'rn', 'panels', 'panel_data.js'));
check('A9 panel_data 导出 computeStatusCard', typeof pd.computeStatusCard === 'function');
check('A10 panel_data 导出 computeLog', typeof pd.computeLog === 'function');
check('A11 panel_data 导出 computeDiceHistory', typeof pd.computeDiceHistory === 'function');
check('A12 panel_data 导出 computeCharacter', typeof pd.computeCharacter === 'function');
check('A13 panel_data 导出 computeEntries', typeof pd.computeEntries === 'function');
check('A14 panel_data 导出 computePanelList', typeof pd.computePanelList === 'function');
check('A15 panel_data 导出 computeShopIndex', typeof pd.computeShopIndex === 'function');

// PanelHost 引用六面板
var phSrc = fs.readFileSync(path.join(root, 'rn', 'components', 'PanelHost.js'), 'utf8');
check('A16 PanelHost require StatusCardPanel', phSrc.indexOf("require('../panels/StatusCardPanel.js')") >= 0);
check('A17 PanelHost require LogPanel', phSrc.indexOf("require('../panels/LogPanel.js')") >= 0);
check('A18 PanelHost require DiceHistoryPanel', phSrc.indexOf("require('../panels/DiceHistoryPanel.js')") >= 0);
check('A19 PanelHost require CharacterPanel', phSrc.indexOf("require('../panels/CharacterPanel.js')") >= 0);
check('A20 PanelHost require EntriesPanel', phSrc.indexOf("require('../panels/EntriesPanel.js')") >= 0);
check('A21 PanelHost require ShopIndexPanel', phSrc.indexOf("require('../panels/ShopIndexPanel.js')") >= 0);

// SidebarDrawer 含「面板」区 + 六入口
var sdSrc = fs.readFileSync(path.join(root, 'rn', 'components', 'SidebarDrawer.js'), 'utf8');
check('A22 SidebarDrawer 含「面板」区标题', sdSrc.indexOf("'面板'") >= 0);
check('A23 SidebarDrawer 含 statusCard 入口', sdSrc.indexOf("panelRow('statusCard'") >= 0);
check('A24 SidebarDrawer 含 log 入口', sdSrc.indexOf("panelRow('log'") >= 0);
check('A25 SidebarDrawer 含 diceHistory 入口', sdSrc.indexOf("panelRow('diceHistory'") >= 0);
check('A26 SidebarDrawer 含 character 入口', sdSrc.indexOf("panelRow('character'") >= 0);
check('A27 SidebarDrawer 含 shop 入口', sdSrc.indexOf("panelRow('shop'") >= 0);
check('A28 SidebarDrawer 含卡带自定义 panels 路由', sdSrc.indexOf("'entries:'") >= 0);

// PanelHost 挂载点：P9·S6 提到 App.tsx 根层（原仅挂 StoryScreen ⇒ 设置屏
//   DataTab「报错日志」点按无反应且残留 panelId）。断言随之改指 App.tsx，
//   并加「StoryScreen 已移除」防回退（理由：挂载点变了，非放宽）。
var ssSrc = fs.readFileSync(path.join(root, 'rn', 'screens', 'StoryScreen.js'), 'utf8');
var appSrcPH = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
check('A29 App.tsx require PanelHost', appSrcPH.indexOf("require('./rn/components/PanelHost')") >= 0);
check('A30 App.tsx 挂载 <PanelHostModule.PanelHost />', appSrcPH.indexOf('<PanelHostModule.PanelHost />') >= 0);
check('A30b StoryScreen 已移除 PanelHost（挂载点唯一）', ssSrc.indexOf('PanelHost') < 0);

// story_store 含 panelId/openPanel/closePanel
var stSrc = fs.readFileSync(path.join(root, 'rn', 'story_store.js'), 'utf8');
check('A31 story_store 含 panelId 状态', stSrc.indexOf('panelId: null') >= 0);
check('A32 story_store 导出 openPanel', stSrc.indexOf('openPanel: openPanel') >= 0);
check('A33 story_store 导出 closePanel', stSrc.indexOf('closePanel: closePanel') >= 0);

// ============================================================
// B. babel transform 每个新文件
// ============================================================
var babel = require(path.join(root, 'node_modules', '@babel', 'core'));
var BABEL_FILES = PANEL_FILES.concat([]);
BABEL_FILES.forEach(function (rel, i) {
  try {
    babel.transformFileSync(path.join(root, rel), {
      cwd: root,
      configFile: path.join(root, 'babel.config.js')
    });
    ok++; console.log('PASS: B' + (i + 1) + ' babel transform ' + rel);
  } catch (e) {
    fail++; console.log('FAIL: B' + (i + 1) + ' babel transform ' + rel + ' :: ' + e.message);
  }
});

// ============================================================
// C. 数据形状：假 GameState 三态喂 panel_data，断言不抛
// ============================================================

// 三态定义：空 / 正常 / 缺字段
var STATES = {
  // 空：无任何模块
  empty: function () {
    delete globalThis.StatusCard;
    delete globalThis.Logger;
    delete globalThis.DiceHistory;
    delete globalThis.Alias;
    delete globalThis.Shop;
    delete globalThis.GameState;
  },
  // 正常：全模块齐，有数据
  normal: function () {
    globalThis.StatusCard = {
      isEnabled: function () { return true; },
      getConfig: function () {
        return {
          enabled: true,
          sections: [
            { type: 'time', showWeather: false },
            { type: 'fields', keys: ['mood'], labels: { mood: '心情' } }
          ]
        };
      },
      getAllFields: function () { return { mood: '平静' }; },
      getInnerVoice: function () { return ''; }
    };
    globalThis.Logger = {
      listLogs: function () {
        return [
          { id: 'l1', gameDate: { year: 2000, month: 6, day: 28 }, title: '第一天', summary: '摘要1' },
          { id: 'l2', gameDate: { year: 2000, month: 6, day: 27 }, title: '第二天', summary: '摘要2' }
        ];
      }
    };
    globalThis.DiceHistory = {
      listAll: function () {
        return [
          { gameTime: '2000-06-28 10:00', round: 1, label: '力量', detail: '1d100 → 45 / 目标 60 → 成功' },
          { gameTime: '2000-06-28 10:01', round: 1, label: '', detail: '2d6 → 8' }
        ];
      },
      getStats: function () { return { total: 2, success: 1, fail: 1 }; }
    };
    globalThis.Alias = {
      get: function (pd, k) { return pd[k] || ''; }
    };
    globalThis.Shop = {
      listShops: function () {
        return [
          { id: 'shop1', name: '杂货铺', desc: '卖杂货', items: [{}, {}], locationId: 'street', npcId: 'npc1' }
        ];
      }
    };
    globalThis.GameState = {
      currentCardId: 'demo',
      currentSaveId: 'save1',
      currentCard: { attributes: [{ key: 'str', name: '力量', max: 20 }] },
      playerData: { name: '测试者', gender: '男', age: 25, money: 100, inventory: { bar: [], common: [], story: [], rare: [] } },
      currentState: {
        panels: {
          attrs: {
            id: 'attrs', num: 2, name: '属性',
            entries: [
              { type: 'number', name: '体力', current: 80, max: 100, desc: 'HP' },
              { type: 'switch', name: '中毒', value: false }
            ]
          }
        }
      },
      computeAge: function () { return 25; },
      formatGameTime: function () { return '2000-06-28 10:00'; },
      getEntrySegmentText: function () { return ''; }
    };
  },
  // 缺字段：currentState.panels 为 undefined、字段缺失
  missing: function () {
    globalThis.StatusCard = {
      isEnabled: function () { return true; },
      getConfig: function () { return null; },  // 缺 sections
      getAllFields: function () { return {}; }
    };
    globalThis.Logger = {
      listLogs: function () { return null; }  // 返回 null
    };
    globalThis.DiceHistory = {
      listAll: function () { throw new Error('vfs 未就绪'); },
      getStats: function () { throw new Error('vfs 未就绪'); }
    };
    delete globalThis.Alias;
    globalThis.Shop = {
      listShops: function () { return null; }
    };
    globalThis.GameState = {
      currentCardId: 'demo',
      currentSaveId: 'save1',
      currentCard: {},  // 无 attributes
      playerData: {},   // 全空
      currentState: undefined,  // panels 为 undefined
      computeAge: function () { return null; },
      formatGameTime: function () { return ''; },
      getEntrySegmentText: function () { return ''; }
    };
  }
};

// 工具：每态跑六个 compute，断言不抛 + 返回对象
function runCompute(name, fn) {
  var stateNames = ['empty', 'normal', 'missing'];
  for (var i = 0; i < stateNames.length; i++) {
    var sn = stateNames[i];
    STATES[sn]();
    try {
      var r = fn();
      check('C-' + name + '-' + sn + ' 不抛异常且返回对象',
        r !== null && typeof r === 'object');
    } catch (e) {
      fail++;
      console.log('FAIL: C-' + name + '-' + sn + ' 抛出异常：' + e.message);
    }
  }
}

runCompute('statusCard', function () { return pd.computeStatusCard(); });
runCompute('log', function () { return pd.computeLog(); });
runCompute('diceHistory', function () { return pd.computeDiceHistory(); });
runCompute('character', function () { return pd.computeCharacter(); });
runCompute('entries', function () { return pd.computeEntries('attrs'); });
runCompute('panelList', function () { return pd.computePanelList(); });
runCompute('shopIndex', function () { return pd.computeShopIndex(); });

// 正常态内容断言
STATES.normal();
var sc = pd.computeStatusCard();
check('C-normal statusCard.enabled = true', sc.enabled === true);
check('C-normal statusCard.sections 有 time', sc.sections.some(function (s) { return s.type === 'time'; }));
check('C-normal statusCard.sections 有 fields', sc.sections.some(function (s) { return s.type === 'fields'; }));

var lg = pd.computeLog();
check('C-normal log.logs 2 条', lg.logs.length === 2);
check('C-normal log 日期格式', lg.logs[0].date === '2000-6-28');

var dh = pd.computeDiceHistory();
check('C-normal diceHistory.stats.total = 2', dh.stats && dh.stats.total === 2);
check('C-normal diceHistory.list 2 条', dh.list.length === 2);

var ch = pd.computeCharacter();
check('C-normal character.name', ch.name === '测试者');
check('C-normal character.age', ch.age === '25');
check('C-normal character.attrs 1 条', ch.attrs.length === 1);
check('C-normal character.attrs[0].pct', ch.attrs[0].pct === 0);

var ent = pd.computeEntries('attrs');
check('C-normal entries.name = 属性', ent.name === '属性');
check('C-normal entries.entries 2 条', ent.entries.length === 2);
check('C-normal entries[0].type = number', ent.entries[0].type === 'number');
check('C-normal entries[1].type = switch', ent.entries[1].type === 'switch');

var pl = pd.computePanelList();
check('C-normal panelList 1 条', pl.length === 1);
check('C-normal panelList[0].id = attrs', pl[0].id === 'attrs');

var si = pd.computeShopIndex();
check('C-normal shopIndex.shops 1 条', si.shops.length === 1);
check('C-normal shopIndex[0].name = 杂货铺', si.shops[0].name === '杂货铺');

// 空态文案断言（裁定 4：逐字照桌面）
STATES.empty();
check('C-empty statusCard 空态文案', pd.computeStatusCard().emptyText === '本卡带未启用状态卡系统。');
check('C-empty log 空态文案', pd.computeLog().emptyText === '还没有日志。');
check('C-empty diceHistory 空态文案', pd.computeDiceHistory().emptyText === '还没有骰子记录。');
check('C-empty shopIndex 空态文案', pd.computeShopIndex().emptyText === '这个卡带没有商店。');

// 缺字段态不抛
STATES.missing();
try { pd.computeStatusCard(); ok++; console.log('PASS: C-missing statusCard 不抛'); }
catch (e) { fail++; console.log('FAIL: C-missing statusCard 抛：' + e.message); }
try { pd.computeLog(); ok++; console.log('PASS: C-missing log 不抛'); }
catch (e) { fail++; console.log('FAIL: C-missing log 抛：' + e.message); }
try { pd.computeDiceHistory(); ok++; console.log('PASS: C-missing diceHistory 不抛'); }
catch (e) { fail++; console.log('FAIL: C-missing diceHistory 抛：' + e.message); }
try { pd.computeCharacter(); ok++; console.log('PASS: C-missing character 不抛'); }
catch (e) { fail++; console.log('FAIL: C-missing character 抛：' + e.message); }
try { pd.computeEntries('attrs'); ok++; console.log('PASS: C-missing entries 不抛'); }
catch (e) { fail++; console.log('FAIL: C-missing entries 抛：' + e.message); }
try { pd.computePanelList(); ok++; console.log('PASS: C-missing panelList 不抛'); }
catch (e) { fail++; console.log('FAIL: C-missing panelList 抛：' + e.message); }
try { pd.computeShopIndex(); ok++; console.log('PASS: C-missing shopIndex 不抛'); }
catch (e) { fail++; console.log('FAIL: C-missing shopIndex 抛：' + e.message); }

// ============================================================
// D. 无字面量色值（六面板 + PanelHost + SidebarDrawer）
// ============================================================
var HEX_RE = /#(?:[0-9a-fA-F]{6})\b/;
PANEL_FILES.concat(['rn/components/SidebarDrawer.js']).forEach(function (rel, i) {
  var src = fs.readFileSync(path.join(root, rel), 'utf8');
  var stripped = src.replace(/require\([^)]*\)/g, '');
  check('D' + (i + 1) + ' 无 hex 色值 ' + rel, !HEX_RE.test(stripped));
});

console.log('PANELS_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
if (fail > 0) process.exit(1);
