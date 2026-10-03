// ============================================================
// 战役 4 · 批次 4-2：主页（R4 首屏）· RN 组件（B 类）
// RN 独有。设计语言对齐 prototype-html/prototype-home-editorial.html
// 与 Electron engine/ui_home.js 的书封结构，但全部 RN 组件重写：
//   报头（brand + 主页/叙事/设置三 tab + token 徽章 + 时钟）
//   书封 mast（overline / 楷体题名 / 竖排朱印 / 题辞 / 01-06 动作行；
//   04 卡带库管理与导入入口 / 05 存档管理入口 当前禁用，H2 批实装，不做假跳转）
//   存档目录 + 三书票
//   换卡浮层（RN Modal 复刻 ui_home.openHomePicker 的 switch 模式）
//
// 纪律：
// - 颜色/字号只允许取自 useTheme() 的 tokens，无字面量色值/字号；
//   布局度量（padding/线宽/间距/字距）为 RN 必要数值，非主题变量。
// - 数据全部经 ../home_model.js（A 类）→ 共享 CardDisplay / Storage / Saves；
//   不复制 Electron DOM 行为。
// - 01 经 story_runtime.continueLast 真实续玩（4-3a 接通，失败按因 alert）；
//   02 经 nav.navigate('create') 进最小创角屏（H3 实装，无卡带时禁用不造假）；
//   存档行可点即续该档（P10·A1，走 story_runtime.openSave，与 01/存档屏同链）。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var ScrollView = RN.ScrollView;
var TouchableOpacity = RN.TouchableOpacity;
var TouchableWithoutFeedback = RN.TouchableWithoutFeedback;
var Modal = RN.Modal;
var StatusBar = RN.StatusBar;
var SafeArea = require('react-native-safe-area-context');

var Theme = require('../../engine/theme.js');
var useTheme = require('../use_theme.js').useTheme;
var useNavigation = require('../navigation.js').useNavigation;
var Model = require('../home_model.js');
var StoryRuntime = require('../story_runtime.js');
var BackgroundLayer = require('../components/BackgroundLayer.js').BackgroundLayer;
// P10·A7：空态文案单一来源（逐字照桌面 ui_home.js:120/125/171/213）
var EmptyTexts = require('../empty_texts.js');

function HomeScreen() {
  var themeApi = useTheme();
  var tk = themeApi.tokens;
  var nav = useNavigation();

  var revState = React.useState(0);
  var rev = revState[0];
  var bump = revState[1];
  var pickerState = React.useState(false);
  var pickerOpen = pickerState[0];
  var setPickerOpen = pickerState[1];
  var insets = SafeArea.useSafeAreaInsets();

  // 回主页（tab 切回/换卡/换书票）即重算；数据真源在 Storage，不本地缓存
  var model = React.useMemo(function () { return Model.buildHomeModel(); }, [rev, nav.currentScreen]);
  var display = model.display;
  var picked = model.picked;

  // 卡带身份色（display.accent）：RN 无 CSS 变量 inline 覆盖，按属性就近取——
  // 印章底色优先身份色，缺失回落 tokens.seal（与 Electron --seal 落地语义一致）
  var sealColor = display.accent || tk.colors.seal;
  var sealText = Array.from(String(display.seal || '')).join('\n');

  // 徽章/时钟：renderTopbar/updateTokenBadge 桥接信号驱动当前组件重渲染后现读，
  // 不复制业务数据
  var badge = Model.formatTokenBadge(Model.readTotalTokens());
  var clock = Model.buildClock();
  var skinNames = Model.HOME_SKIN_NAMES;

  function applySkin(id) {
    if (!picked) return;
    // 按卡覆盖 + 静默切到该书票（Electron syncHomeLook 的 RN 对应）
    Model.setSkinOverride(picked.id, id);
    themeApi.setTheme(id);
    bump(function (v) { return v + 1; });
  }

  // 01 续玩：走 story_runtime.continueLast（装载→分支→进叙事页），
  // 成功时 Platform.ui.showScreen 壳已切屏；失败按原因 alert（load 失败同引擎口径）
  function continueGame() {
    if (!model.lastSave) return;
    StoryRuntime.continueLast().then(function (res) {
      if (!res.ok && !res.routed) {
        try { Platform.dialog.alert(StoryRuntime.CONTINUE_REASONS[res.reason] || '续玩失败'); } catch (e) {}
      }
    });
  }

  // P6·S3：叙事 tab 守卫（照 ui_core.js:75-81）——无进行中存档 ⇒ toast 并留主页，
  // 不再无条件进叙事页留下空的「叙事流载入中…」。
  function openStoryTab() {
    var inGame = false;
    try { inGame = !!(GameState.currentCardId && GameState.currentSaveId); } catch (e) { inGame = false; }
    if (inGame) { nav.navigate('story'); return; }
    try { Platform.ui.toast('还没有正在进行的存档', { type: 'warn' }); }
    catch (e) { try { Platform.dialog.alert('还没有正在进行的存档'); } catch (e2) {} }
  }

  function openPicker() { setPickerOpen(true); }
  function closePicker() { setPickerOpen(false); }
  function pickCard(id) {
    Model.setHomeCardId(id);
    setPickerOpen(false);
    bump(function (v) { return v + 1; });
  }

  var c = tk.colors;
  var f = tk.fontSizes;
  var fonts = tk.fonts;

  var styles = React.useMemo(function () {
    return RN.StyleSheet.create({
      root: { flex: 1, backgroundColor: c.bg },
      body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 },
      headerRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: 8,
        borderBottomWidth: 2, borderBottomColor: c.ink
      },
      brand: { fontFamily: fonts.serif, fontSize: f.sm, color: c.ink, letterSpacing: 3, fontWeight: '600' },
      headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
      clock: { fontFamily: fonts.serif, fontSize: f.xs, color: c.muted, letterSpacing: 1 },
      badge: {
        fontFamily: fonts.mono, fontSize: f.xs, color: c.muted,
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        paddingHorizontal: 8, paddingVertical: 2
      },
      tabs: { flexDirection: 'row', gap: 24, paddingHorizontal: 16, paddingTop: 8 },
      tab: { fontSize: f.base, letterSpacing: 2, paddingBottom: 5, borderBottomWidth: 2 },
      overline: { fontSize: f.xs, color: c.muted, letterSpacing: 3, marginTop: 22 },
      titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginTop: 10 },
      title: { flexShrink: 1, fontFamily: fonts.kai, fontSize: f.xl, lineHeight: Math.round(f.xl * 1.15), color: c.ink },
      seal: {
        fontFamily: fonts.kai, fontSize: f.sm, color: c.card, backgroundColor: sealColor,
        textAlign: 'center', paddingHorizontal: 6, paddingVertical: 8,
        marginTop: 8, letterSpacing: 2
      },
      subtitle: { fontFamily: fonts.serif, fontStyle: 'italic', fontSize: f.md, color: c.ink2, marginTop: 4 },
      rule: { height: 1, backgroundColor: c.ink, marginTop: 18 },
      // H1：R 批分组装饰（Electron index.html:353-356 的 RN 等价形态）
      divider: { height: 1, backgroundColor: c.hairStrong, marginTop: 14 },
      sectionOverline: {
        fontSize: f.xs, color: c.faint, letterSpacing: 3,
        paddingTop: 14, paddingHorizontal: 4, paddingBottom: 6
      },
      action: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: c.hair
      },
      actionDisabled: { opacity: 0.45 },
      actionN: { width: 22, fontFamily: fonts.serif, fontSize: f.xs, color: c.seal, fontWeight: '700' },
      actionLb: { flex: 1, fontSize: f.lg, color: c.ink },
      actionMeta: { fontSize: f.xs, color: c.faint },
      // H1：04-06 次级层级（Electron .is-sec：n/meta 只变色不缩号故沿用 f.xs；
      // lb 主 f.lg(16)→次 15 只差 1px，取 f.md(14) 复刻步长，不用 f.base(13)）
      actionNsec: { width: 22, fontFamily: fonts.serif, fontSize: f.xs, color: c.faint, fontWeight: '700' },
      actionLbsec: { flex: 1, fontSize: f.md, color: c.ink2 },
      actionMetasec: { fontSize: f.xs, color: c.faint },
      arrow: { fontSize: f.md, color: c.muted },
      sideHead: { fontSize: f.xs, color: c.muted, letterSpacing: 3, fontWeight: '600', marginTop: 26, marginBottom: 6 },
      saveRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 9, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: c.hair
      },
      saveName: { flex: 1, fontSize: f.base, color: c.ink, marginRight: 10 },
      saveMeta: { fontSize: f.xs, color: c.faint, fontFamily: fonts.serif },
      empty: { fontSize: f.sm, color: c.faint, paddingVertical: 9, paddingHorizontal: 4 },
      chips: { flexDirection: 'row', gap: 10, marginTop: 4 },
      chip: {
        flex: 1, borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.md, padding: 5
      },
      chipOn: { borderWidth: 2, borderColor: c.seal },
      chipSwatch: { height: 44, borderWidth: 1, borderColor: c.hair, borderRadius: tk.radius.sm, overflow: 'hidden' },
      swHalf: { flex: 1 },
      chipName: { fontSize: f.xs, fontWeight: '600', color: c.ink, marginTop: 5, textAlign: 'center' },
      note: { fontSize: f.xs, color: c.faint, lineHeight: 17, marginTop: 8 },
      mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 24 },
      pickerBox: { backgroundColor: c.panel, borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.lg, padding: 18 },
      pickerTitle: { fontSize: f.xs, color: c.muted, letterSpacing: 3, marginBottom: 10 },
      pickerRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 10, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: c.hair
      },
      pickerGlyph: { width: 24, fontFamily: fonts.kai, fontSize: f.lg, color: c.seal, textAlign: 'center' },
      pickerCardTitle: { flex: 1, fontSize: f.base, color: c.ink },
      pickerKind: { fontSize: f.xs, color: c.faint, letterSpacing: 1 },
      closeBtn: {
        alignSelf: 'flex-end', marginTop: 12, borderWidth: 1, borderColor: c.hairStrong,
        borderRadius: tk.radius.sm, paddingHorizontal: 14, paddingVertical: 6
      },
      closeText: { fontSize: f.sm, color: c.muted, letterSpacing: 2 }
    });
  }, [tk, sealColor, insets]);

  function tabTextStyle(id) {
    return [styles.tab, {
      color: nav.currentScreen === id ? c.ink : c.muted,
      borderBottomColor: nav.currentScreen === id ? c.seal : 'transparent',
      fontWeight: nav.currentScreen === id ? '600' : '400'
    }];
  }

  // P10·A1：存档行可点 ⇒ 续该档（桌面 ui_cards.js renderSavesList「继续」同口径）。
  //   复用 story_runtime.openSave（含 routeMissingStep 接管与「未完成轮」续接）；
  //   失败按因 alert（不 routed 时），与 01 续玩同款。
  function openSaveRow(m) {
    StoryRuntime.openSave(m.cardId, m.saveId).then(function (res) {
      if (res && !res.ok && !res.routed) {
        try { Platform.dialog.alert(StoryRuntime.CONTINUE_REASONS[res.reason] || '打开存档失败'); } catch (e) {}
      }
    });
  }

  function renderSaveRow(m, i) {
    var name = m.displayName || '未命名';
    var md = (m.lastPlayedAt || '').slice(5, 10);
    var dur = Model.formatPlayTimeSafe(m.playTime);
    var right = md + (dur ? ' · ' + dur : '');
    return (
      <TouchableOpacity
        key={String(m.saveId) + String(i)}
        style={styles.saveRow}
        activeOpacity={0.6}
        onPress={function () { openSaveRow(m); }}
      >
        <Text style={styles.saveName} numberOfLines={1}>{name}</Text>
        <Text style={styles.saveMeta}>{right}</Text>
      </TouchableOpacity>
    );
  }

  function renderChip(id) {
    var builtin = Theme.getBuiltin(id);
    var bc = (builtin && builtin.colors) ? builtin.colors : null;
    var on = model.skin === id;
    // 书票预览色取该书票主题对象自身的 bg/bgPanel（数据驱动，非字面量）；
    // 上下两块纯色近似原型 CSS 渐变（RN 无 linear-gradient）。
    var swatch = bc
      ? <View style={styles.chipSwatch}>
          <View style={[styles.swHalf, { backgroundColor: bc.bg }]} />
          <View style={[styles.swHalf, { backgroundColor: bc.bgPanel }]} />
        </View>
      : <View style={[styles.chipSwatch, { backgroundColor: c.panel }]} />;
    return (
      <TouchableOpacity
        key={id}
        activeOpacity={picked ? 0.6 : 1}
        style={[styles.chip, on ? styles.chipOn : null, !picked ? styles.actionDisabled : null]}
        onPress={function () { applySkin(id); }}
      >
        {swatch}
        <Text style={styles.chipName}>{skinNames[id] || id}</Text>
      </TouchableOpacity>
    );
  }

  var lastLabel = model.lastSave
    ? ((model.lastSave.displayName || '未命名') + (model.lastSave.playerName ? ' · ' + model.lastSave.playerName : ''))
    : EmptyTexts.NO_SAVE_LABEL;
  var pickerItems = pickerOpen ? Model.listCardsForPicker() : [];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <BackgroundLayer />

      <View style={styles.headerRow}>
        <TouchableOpacity activeOpacity={0.7} onLongPress={function () { nav.navigate('__boot'); }}>
          <Text style={styles.brand}>HIPPOCAMPUS CORE</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <Text style={styles.badge}>{badge}</Text>
          <Text style={styles.clock}>{clock}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity onPress={function () { nav.navigate('home'); }}>
          <Text style={tabTextStyle('home')}>{'主 页'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={openStoryTab}>
          <Text style={tabTextStyle('story')}>{'叙 事'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={function () { nav.navigate('settings'); }}>
          <Text style={tabTextStyle('settings')}>{'设 置'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.overline}>{model.overline}</Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{display.title}</Text>
          <Text style={styles.seal}>{sealText}</Text>
        </View>
        {display.sub ? <Text style={styles.subtitle}>{display.sub}</Text> : null}
        <View style={styles.rule} />

        <TouchableOpacity
          activeOpacity={model.lastSave ? 0.6 : 1}
          style={[styles.action, !model.lastSave ? styles.actionDisabled : null]}
          onPress={continueGame}
        >
          <Text style={styles.actionN}>{'01'}</Text>
          <Text style={styles.actionLb}>{'继续上次会话'}</Text>
          <Text style={styles.actionMeta} numberOfLines={1}>{lastLabel}</Text>
          <Text style={styles.arrow}>{'\u2192'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={picked ? 0.6 : 1}
          style={[styles.action, !picked ? styles.actionDisabled : null]}
          onPress={function () { if (picked) nav.navigate('create'); }}
        >
          <Text style={styles.actionN}>{'02'}</Text>
          <Text style={styles.actionLb}>{'新建存档'}</Text>
          <Text style={styles.actionMeta}>{'最小创角 · 基于当前卡带'}</Text>
          <Text style={styles.arrow}>{'\u2192'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} onPress={openPicker}>
          <Text style={styles.actionN}>{'03'}</Text>
          <Text style={styles.actionLb}>{'换一张卡带'}</Text>
          <Text style={styles.actionMeta}>{model.cardCount + ' 张在库'}</Text>
          <Text style={styles.arrow}>{'→'}</Text>
        </TouchableOpacity>

        {/* H1：R 批分组线 + 「管理」overline + 04-06 次级行（对齐 index.html:816-830）。
            H2 实装：04 卡带库管理与导入 / 05 存档管理 已接跳转（nav.navigate）。 */}
        <View style={styles.divider} />
        <Text style={styles.sectionOverline}>{'管 理'}</Text>

        <TouchableOpacity style={styles.action} onPress={function () { nav.navigate('cards'); }}>
          <Text style={styles.actionNsec}>{'04'}</Text>
          <Text style={styles.actionLbsec}>{'管理卡带与导入'}</Text>
          <Text style={styles.actionMetasec}>{'卡带库 · 导入'}</Text>
          <Text style={styles.arrow}>{'→'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} onPress={function () { nav.navigate('saves'); }}>
          <Text style={styles.actionNsec}>{'05'}</Text>
          <Text style={styles.actionLbsec}>{'存档管理'}</Text>
          <Text style={styles.actionMetasec}>{'全部存档'}</Text>
          <Text style={styles.arrow}>{'→'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} onPress={function () { nav.navigate('settings'); }}>
          <Text style={styles.actionNsec}>{'06'}</Text>
          <Text style={styles.actionLbsec}>{'设置'}</Text>
          <Text style={styles.actionMetasec}>{'AI · 字号 · 备份'}</Text>
          <Text style={styles.arrow}>{'→'}</Text>
        </TouchableOpacity>

        <Text style={styles.sideHead}>{'目 录 · 存 档'}</Text>
        {!picked ? (
          <Text style={styles.empty}>{EmptyTexts.NO_CARDS_HOME}</Text>
        ) : !model.saves.length ? (
          <Text style={styles.empty}>{EmptyTexts.NO_SAVES_HOME}</Text>
        ) : model.saves.map(renderSaveRow)}

        <Text style={styles.sideHead}>{'书 票 · 主 题'}</Text>
        <View style={styles.chips}>
          {model.skinThemes.map(renderChip)}
        </View>
        <Text style={styles.note}>
          {'卡带带身份（题名 / 印章 / 题辞 / 身份色 / 默认书票），玩家主题带皮肤，两层叠加。自定义书票走主题包导入。'}
        </Text>
      </ScrollView>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={closePicker}>
        <TouchableWithoutFeedback onPress={closePicker}>
          <View style={styles.mask}>
            <TouchableWithoutFeedback onPress={function () { /* 吞掉浮层内点击，不冒泡关闭 */ }}>
              <View style={styles.pickerBox}>
                <Text style={styles.pickerTitle}>{'选 择 卡 带 · 主 页 随 卡 而 变'}</Text>
                {!model.cardIds.length ? (
                  <Text style={styles.empty}>{EmptyTexts.NO_CARDS_PICKER}</Text>
                ) : (
                  <ScrollView>
                    {pickerItems.map(function (item) {
                      var kind = item.display.genre + ' · ' + (skinNames[item.skin] || item.skin) + (item.current ? ' · 当前' : '');
                      return (
                        <TouchableOpacity key={item.id} style={styles.pickerRow} onPress={function () { pickCard(item.id); }}>
                          <Text style={styles.pickerGlyph}>{item.display.glyph}</Text>
                          <Text style={styles.pickerCardTitle}>{item.display.title}</Text>
                          <Text style={styles.pickerKind}>{kind}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
                <TouchableOpacity style={styles.closeBtn} onPress={closePicker}>
                  <Text style={styles.closeText}>{'关 闭'}</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

module.exports = { HomeScreen: HomeScreen };
