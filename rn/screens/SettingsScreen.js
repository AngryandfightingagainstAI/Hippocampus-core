// ============================================================
// 战役 4 · 批次 4-5a：设置页主组件（B 类，RN 组件）
// RN 独有，不回写 Electron。Electron 侧 showSettingsTab 业务层零
// Platform.ui 调用（UI 内聚），本页零桥接壳、纯 RN 直驱数据层。
//
// 布局（用户裁决 1）：Electron ≤760px 移动响应式 grounding =
//   横滑编号 chips + 内容区独立滚（index.html L276-286）；两栏
//   留作后续大屏适配。顶部返回 → nav.navigate('home')。
//
// tab 分发（数据层全部 RN 仓就绪，grounding 见各 tab 文件头）：
//   api       4-5b 实装（ApiManager/ApiClient 直驱）
//   search    P2·S1 实装（WebSearchManager 直驱）
//   editor    P2·S2 实装（NumEditor 直驱）
//   worldbook P2+P3 轮实装（WB_* 12 个数据层 + 12 个子编辑器）
//   general/dice/weather/realtime/gm  4-5a 实装
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var ScrollView = RN.ScrollView;
var TouchableOpacity = RN.TouchableOpacity;
var StatusBar = RN.StatusBar;
var SafeArea = require('react-native-safe-area-context');

var useTheme = require('../use_theme.js').useTheme;
var useNavigation = require('../navigation.js').useNavigation;
var Model = require('../settings_model.js');
// P13·S2：切 tab 脏守卫用（WB.DirtyGuard.checkAny，定义在 engine/wb_common.js）
var WB = require('../../engine/wb_common.js');

var DiceTab = require('./settings/DiceTab.js').DiceTab;
var GeneralTab = require('./settings/GeneralTab.js').GeneralTab;
var GmTab = require('./settings/GmTab.js').GmTab;
var WeatherTab = require('./settings/WeatherTab.js').WeatherTab;
var RealtimeTab = require('./settings/RealtimeTab.js').RealtimeTab;
// 4-5b：AI 配置 tab（ApiManager/ApiClient 数据层 bootstrap 已挂载）
var ApiTab = require('./settings/ApiTab.js').ApiTab;
// P2·S1：联网搜索 tab（WebSearchManager 数据层 bootstrap 已挂载）
var SearchTab = require('./settings/SearchTab.js').SearchTab;
// P2·S2：数值编辑器 tab（NumEditor 数据层 bootstrap 已挂载）
var NumEditorTab = require('./settings/NumEditorTab.js').NumEditorTab;
// P2+P3：世界书 tab（engine/wb_common.js + engine/wb/*.js 数据层）
var WorldBookTab = require('./settings/WorldBookTab.js').WorldBookTab;
// P1-A：数据与备份 tab
var DataTab = require('./settings/DataTab.js').DataTab;

function SettingsScreen() {
  var themeApi = useTheme();
  var tk = themeApi.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;
  var fonts = tk.fonts;
  var insets = SafeArea.useSafeAreaInsets();
  var nav = useNavigation();

  var tabState = React.useState('api');
  var curTab = tabState[0];
  var setCurTab = tabState[1];

  // P13·S2：切 tab 脏守卫 —— 进入 worldbook、或「离开正在编辑的 worldbook tab 去别处」都要过闸。
  //   闸门点 = WB.DirtyGuard.checkAny()（Promise）。异步竞态处理：
  //   pendingGuard 保证同一时刻只有一个确认框；desiredTab 记录最新目标 ⇒ 连点两个 tab
  //   时以最后一次点击为准，且不会出现「确认框还在、tab 已经切了」。
  var pendingGuard = React.useRef(false);
  var desiredTab = React.useRef(null);
  function switchTab(id) {
    if (id === curTab) return;
    var needGuard = (id === 'worldbook' || curTab === 'worldbook');
    if (!needGuard) { desiredTab.current = null; setCurTab(id); return; }
    desiredTab.current = id;
    if (pendingGuard.current) return; // 已有确认框在途：只更新目标，回来时按最新目标切
    pendingGuard.current = true;
    Promise.resolve(WB.DirtyGuard.checkAny()).then(function (okGo) {
      pendingGuard.current = false;
      var want = desiredTab.current;
      desiredTab.current = null;
      if (okGo && want) setCurTab(want); // 取消/被拦 → 保持当前 tab 不变（不弹假提示）
    })['catch'](function () {
      pendingGuard.current = false;
      desiredTab.current = null;
    });
  }

  function renderTab(id) {
    if (id === 'api') return React.createElement(ApiTab, null);
    if (id === 'search') return React.createElement(SearchTab, null);
    if (id === 'editor') return React.createElement(NumEditorTab, null);
    if (id === 'worldbook') return React.createElement(WorldBookTab, null);
    if (id === 'dice') return React.createElement(DiceTab, null);
    if (id === 'general') return React.createElement(GeneralTab, null);
    if (id === 'gm') return React.createElement(GmTab, null);
    if (id === 'weather') return React.createElement(WeatherTab, null);
    if (id === 'realtime') return React.createElement(RealtimeTab, null);
    if (id === 'data') return React.createElement(DataTab, null);
    return null;
  }

  var styles = React.useMemo(function () {
    return RN.StyleSheet.create({
      root: { flex: 1, backgroundColor: c.bg },
      topbar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + 8, paddingBottom: 8, paddingHorizontal: 14,
        borderBottomWidth: 1, borderBottomColor: c.hair
      },
      backBtn: { fontSize: f.sm, color: c.muted, letterSpacing: 1 },
      topTitle: { fontFamily: fonts.kai, fontSize: f.md, color: c.ink, letterSpacing: 2 },
      topRight: { minWidth: 52 },
      chips: {
        flexGrow: 0, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10,
        borderBottomWidth: 1, borderBottomColor: c.hair
      },
      chip: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        paddingHorizontal: 12, paddingVertical: 6, marginRight: 8,
        backgroundColor: c.bgCard
      },
      chipActive: { borderColor: c.primary, backgroundColor: c.primary },
      chipNum: { fontSize: f.xs, color: c.seal, fontWeight: '700' },
      chipNumActive: { color: c.bgCard },
      chipTitle: { fontSize: f.sm, color: c.ink },
      chipTitleActive: { color: c.bgCard },
      body: { flex: 1 },
      bodyInner: { paddingHorizontal: 16, paddingTop: 14 }
    });
  }, [tk, insets.top]);

  return React.createElement(
    View,
    { style: styles.root },
    React.createElement(StatusBar, { barStyle: 'dark-content' }),
    React.createElement(
      View,
      { style: styles.topbar },
      React.createElement(
        TouchableOpacity,
        { onPress: function () { nav.navigate('home'); } },
        React.createElement(Text, { style: styles.backBtn }, '← 返回')
      ),
      React.createElement(Text, { style: styles.topTitle }, '设 置'),
      React.createElement(View, { style: styles.topRight })
    ),
    React.createElement(
      ScrollView,
      { horizontal: true, showsHorizontalScrollIndicator: false, style: styles.chips, contentContainerStyle: { alignItems: 'center' } },
      Model.SETTINGS_TABS.map(function (t) {
        var active = t.id === curTab;
        return React.createElement(
          TouchableOpacity,
          {
            key: t.id,
            onPress: function () { switchTab(t.id); },
            style: [styles.chip, active ? styles.chipActive : null]
          },
          React.createElement(
            Text,
            { style: [styles.chipNum, active ? styles.chipNumActive : null] },
            t.num
          ),
          React.createElement(
            Text,
            { style: [styles.chipTitle, active ? styles.chipTitleActive : null] },
            t.title
          )
        );
      })
    ),
    React.createElement(
      View,
      { style: styles.body },
      React.createElement(
        ScrollView,
        { style: { flex: 1 }, contentContainerStyle: styles.bodyInner },
        renderTab(curTab)
      )
    )
  );
}

module.exports = { SettingsScreen: SettingsScreen };
