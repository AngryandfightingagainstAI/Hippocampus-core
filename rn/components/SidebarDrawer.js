// ============================================================
// 战役 4 · 批次 4-3c：状态侧栏抽屉（B 类，RN 组件）
// RN 独有。Electron 侧栏在桌面端常显（◀▶ 折叠/展开）；移动端改为顶栏
// 入口唤起的右侧抽屉（开关态在 story_store.sidebarOpen，RN 新增）。
//
// 范围（R3 用户裁决）：只做 Electron renderSidebarExpanded 的「状态」区：
//   · GameState.currentState.sidebar 状态条（ui_core L312-322）
//     icon 一律文字降级「◇」；current/max；进度条 pct clamp 0-100；
//     条色：显式 s.color（green/yellow/red/warn/danger，blue 视为未指定）
//     或 pct≤20 danger / ≤50 warn(orange) / 其余 accent（index.html L586-593）；
//     描述 getSegmentText(s) || s.desc。
//   · 本轮 prompt 估算（ui_core L324-342）：≈N tok + X KB 副文案，
//     >8000 danger / >4000 warning / 否则 success。
// 「面板」区（H4 子集：角色卡/日志/状态卡/骰子历史/商店索引/卡带自定义面板；
// H6 追加：人物/任务/成就/事件提议/变更提议/结局/剧情节点；
// P1-E 追加：报错（诊断日志）；P1-I 追加：调试（桌面叙事屏报头 UI.openModal('debug') 的等价入口）；
// P1-H 追加：手机（剧情外信息层，桌面 allPanels 的 infoPhone 入口）；
// P6·S3 追加：设置（切设置屏 nav.navigate('settings')，桌面 ui_core L57/:256/:365 三入口）。
//
// 纪律：颜色/字号只取自 useTheme tokens。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var Modal = RN.Modal;
var ScrollView = RN.ScrollView;
var TouchableWithoutFeedback = RN.TouchableWithoutFeedback;
var TouchableOpacity = RN.TouchableOpacity;

var useTheme = require('../use_theme.js').useTheme;
var StoryStore = require('../story_store.js');
var NavStore = require('../nav_store.js');
// P33·②：卡带自定义面板的合并规则（人物卡 / 个人素质 / 属性 / 素质）在数据层单一来源。
var PanelData = require('../panels/panel_data.js');

// Electron 进度条类名 → token 色键（index.html L587-592）
var EXPLICIT_BAR = {
  green: 'success',
  yellow: 'yellow',
  red: 'danger',
  danger: 'danger',
  warn: 'orange'
};

function readSidebar() {
  try {
    var st = GameState.currentState;
    return (st && Array.isArray(st.sidebar)) ? st.sidebar : [];
  } catch (e) { return []; }
}

function readPrompt() {
  try {
    // P9·S14：口径 = 第四部分（状态快照），与预算刹车同一口径；
    //   整条 prompt（含静态规则 + 实体索引）另读 _lastPromptFull*。
    var est = GameState._lastPromptEstimate || 0;
    var chars = GameState._lastPromptChars || 0;
    var full = GameState._lastPromptFullEstimate || 0;
    if (!(est > 0)) return null;
    var level = GameState._lastTrimmedLevel || 0;
    return {
      est: est,
      kb: (chars / 1024).toFixed(1),
      full: full,
      level: level,
      trimmed: level > 0
    };
  } catch (e) { return null; }
}

// P33·①：原叙事屏顶栏的横滑状态条（HUD / 天气 / 节日 / 游戏时间 / 累计 token）
//   整条下线，数据改由本抽屉「数值」区显示；读数逻辑从 StoryScreen 原样搬来。
function readHud() {
  try {
    var st = GameState.currentState;
    var hud = (st && Array.isArray(st.hud)) ? st.hud : [];
    return hud.map(function (h) {
      var hasBoth = (h.max != null && h.current != null);
      var pct = hasBoth ? Math.max(0, Math.min(100, (h.current / h.max) * 100)) : null;
      return { name: h.name || '', val: hasBoth ? (h.current + '/' + h.max) : '—', pct: pct, color: h.color };
    });
  } catch (e) { return []; }
}

function readHudInfo() {
  var parts = [];
  try { parts.push(GameState.formatGameTime() || ''); } catch (e) { parts.push(''); }
  try {
    if (typeof Weather !== 'undefined' && Weather.getCurrent) {
      var w = Weather.getCurrent();
      if (w && w.type) parts.push(w.type);
    }
  } catch (e) {}
  try {
    if (typeof Calendar !== 'undefined' && Calendar.isDisplayEnabled && Calendar.isDisplayEnabled()) {
      var hs = Calendar.getTodayHolidays() || [];
      if (hs.length) parts.push(hs.map(function (h) { return h.name; }).join('、'));
    }
  } catch (e) {}
  var t = 0;
  try { t = GameState._totalTokens || 0; } catch (e) { t = 0; }
  var tok = (t < 1000) ? String(t) : (t < 1000000 ? (t / 1000).toFixed(1) + 'k' : (t / 1000000).toFixed(2) + 'M');
  parts.push('⟡ ' + tok);
  return parts.filter(function (x) { return !!x; }).join(' · ');
}

function SidebarDrawer() {
  var themeApi = useTheme();
  var tk = themeApi.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;
  var fonts = tk.fonts;

  // 订阅 store：sidebarOpen 控开关，sidebarSeq 由 renderSidebarExpanded
  // 壳递增（工具执行/接受提议后刷新数据）
  var snap = React.useSyncExternalStore(StoryStore.subscribe, StoryStore.getSnapshot, StoryStore.getSnapshot);
  if (!snap.sidebarOpen) return null;

  var sidebar = readSidebar();
  var prompt = readPrompt();

  function barColor(s, pct) {
    if (s.color && s.color !== 'blue') {
      var key = EXPLICIT_BAR[s.color];
      return (key && c[key]) || c.accent;
    }
    if (pct <= 20) return c.danger;
    if (pct <= 50) return c.orange || c.warning;
    return c.accent;
  }

  function descOf(s) {
    var seg = '';
    try { seg = GameState.getSegmentText(s); } catch (e) { seg = ''; }
    return seg || s.desc || '';
  }

  var styles = RN.StyleSheet.create({
    mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-start' },
    panel: {
      alignSelf: 'flex-end', width: '82%', height: '100%',
      backgroundColor: c.bgCard, borderLeftWidth: 1, borderLeftColor: c.hairStrong
    },
    head: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 14, paddingTop: 16, paddingBottom: 10,
      borderBottomWidth: 1, borderBottomColor: c.hair
    },
    title: { fontSize: f.xs, color: c.faint, letterSpacing: 2 },
    close: { fontSize: f.lg, color: c.muted, paddingHorizontal: 6, paddingVertical: 2 },
    section: { fontSize: f.xs, color: c.faint, letterSpacing: 1, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
    item: {
      flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 8,
      borderBottomWidth: 1, borderBottomColor: c.bgPanel
    },
    itemPrompt: {
      flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 8,
      borderBottomWidth: 1, borderBottomColor: c.bgPanel, backgroundColor: c.bgPanel
    },
    icon: { width: 22, fontSize: f.md, lineHeight: Math.round(f.md * 1.25), color: c.textMuted2 || c.muted, textAlign: 'center' },
    body: { flex: 1, minWidth: 0 },
    itemHead: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 4 },
    name: { flex: 1, fontSize: f.sm, color: c.ink2 },
    val: { fontSize: f.xs, color: c.muted },
    track: { height: 3, backgroundColor: c.hair, marginBottom: 4, overflow: 'hidden' },
    desc: { fontSize: f.xs, color: c.faint, lineHeight: Math.round(f.xs * 1.6) },
    empty: { fontSize: f.sm, color: c.faint, paddingHorizontal: 14, paddingVertical: 18 },
    info: { fontSize: f.xs, color: c.faint, paddingHorizontal: 14, paddingVertical: 6, lineHeight: Math.round(f.xs * 1.6) },
    panelItem: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 14, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: c.bgPanel
    },
    panelName: { fontSize: f.sm, color: c.ink2 },
    panelTail: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    panelBadge: {
      minWidth: 18, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 9,
      backgroundColor: c.danger
    },
    panelBadgeText: { fontSize: f.xs, color: c.bgCard || c.text, textAlign: 'center' },
    panelArrow: { fontSize: f.md, color: c.faint }
  });

  function renderItem(s, i, promptItem) {
    var pct = (s.max != null && s.max > 0)
      ? Math.max(0, Math.min(100, (s.current / s.max) * 100))
      : 0;
    var fill = barColor(s, pct);
    return (
      <View key={i} style={promptItem ? styles.itemPrompt : styles.item}>
        <Text style={styles.icon}>{'◇'}</Text>
        <View style={styles.body}>
          <View style={styles.itemHead}>
            <Text style={styles.name} numberOfLines={1}>{s.name}</Text>
            <Text style={styles.val}>{String(s.current) + (s.max != null ? '/' + s.max : '')}</Text>
          </View>
          {s.max != null ? (
            <View style={styles.track}>
              <View style={{ height: 3, width: pct + '%', backgroundColor: fill }} />
            </View>
          ) : null}
          {(() => {
            var d = descOf(s);
            return d ? <Text style={styles.desc}>{d}</Text> : null;
          })()}
        </View>
      </View>
    );
  }

  var promptColor = prompt
    ? (prompt.est > 8000 ? c.danger : (prompt.est > 4000 ? c.warning : c.success))
    : null;

  // P33·②：卡带自定义面板里属于「人物卡 / 个人素质 / 属性 / 素质」的那些并入「角色」
  //   面板，不再单列（用户裁决：人物素质与人物卡不要分开放）。
  var charMerge = PanelData.computeMergedCharPanels();
  var customPanels = charMerge.others;
  var hudItems = readHud();
  var hudInfo = readHudInfo();

  // H6：endings / storyNodes 条件渲染（两层判定之一：侧栏入口可见性）
  var endingsEnabled = false;
  try { if (typeof Endings !== 'undefined') endingsEnabled = Endings.isEnabled(); } catch (e) { endingsEnabled = false; }
  var storyNodesEnabled = false;
  try { if (typeof StoryNodes !== 'undefined') storyNodesEnabled = StoryNodes.isEnabled(); } catch (e) { storyNodesEnabled = false; }

  // P13·S1-a：手机未读徽标（真源只有一个：InfoFeed.unreadTotal()；显示口径 n>99 → 99+，
  //   不改 unreadTotal() 真实值，也不在本组件另存计数器）
  var infoUnread = 0;
  try { if (typeof InfoFeed !== 'undefined' && InfoFeed.unreadTotal) infoUnread = InfoFeed.unreadTotal() || 0; } catch (e) { infoUnread = 0; }

  // 面板入口行（名称 + 可选未读徽标 + ›）
  function panelRow(key, label, badge) {
    var showBadge = (typeof badge === 'number' && badge > 0);
    return (
      <TouchableOpacity
        key={key}
        style={styles.panelItem}
        activeOpacity={0.7}
        onPress={function () { StoryStore.closeSidebar(); StoryStore.openPanel(key); }}
      >
        <Text style={styles.panelName}>{label}</Text>
        <View style={styles.panelTail}>
          {showBadge ? (
            <View style={styles.panelBadge}>
              <Text style={styles.panelBadgeText}>{badge > 99 ? '99+' : String(badge)}</Text>
            </View>
          ) : null}
          <Text style={styles.panelArrow}>{'›'}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={function () { StoryStore.closeSidebar(); }}>
      <TouchableWithoutFeedback onPress={function () { StoryStore.closeSidebar(); }}>
        <View style={styles.mask}>
          <TouchableWithoutFeedback onPress={function () { /* 吞抽屉内点击，不关闭 */ }}>
            <View style={styles.panel}>
              <View style={styles.head}>
                <Text style={styles.title}>{'状态'}</Text>
                <TouchableOpacity onPress={function () { StoryStore.closeSidebar(); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={styles.close}>{'×'}</Text>
                </TouchableOpacity>
              </View>
              <ScrollView>
                <Text style={styles.section}>{'状态'}</Text>
                {prompt ? (
                  <View style={styles.itemPrompt}>
                    <Text style={styles.icon}>{'◇'}</Text>
                    <View style={styles.body}>
                      <View style={styles.itemHead}>
                        <Text style={styles.name}>{'状态快照'}</Text>
                        <Text style={[styles.val, { color: promptColor }]}>{'≈ ' + prompt.est + ' tok'}</Text>
                      </View>
                      <Text style={styles.desc}>
                        {prompt.kb + ' KB · 第四部分（状态快照）估算' +
                          (prompt.full > 0 ? ' · 整条 prompt ≈ ' + prompt.full + ' tok' : '')}
                      </Text>
                      {prompt.trimmed ? (
                        <Text style={[styles.desc, { color: c.warning || c.danger }]}>
                          {'⚠ 预算超限，已降级 ' + prompt.level + ' 档'}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}
                {sidebar.length ? sidebar.map(function (s, i) { return renderItem(s, i, false); })
                  : <Text style={styles.empty}>{'暂无状态条'}</Text>}

                {hudItems.length || hudInfo ? (
                  <View>
                    <Text style={styles.section}>{'数值'}</Text>
                    {hudItems.map(function (h, i) {
                      return (
                        <View key={'hud' + i} style={styles.item}>
                          <Text style={styles.icon}>{'◇'}</Text>
                          <View style={styles.body}>
                            <View style={styles.itemHead}>
                              <Text style={styles.name} numberOfLines={1}>{h.name}</Text>
                              <Text style={styles.val}>{h.val}</Text>
                            </View>
                            {h.pct != null ? (
                              <View style={styles.track}>
                                <View style={{ height: 3, width: h.pct + '%', backgroundColor: barColor(h, h.pct) }} />
                              </View>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                    {hudInfo ? <Text style={styles.info}>{hudInfo}</Text> : null}
                  </View>
                ) : null}

                <Text style={styles.section}>{'面板'}</Text>
                {panelRow('statusCard', '状态卡')}
                {panelRow('log', '日志')}
                {panelRow('diceHistory', '骰子历史')}
                {panelRow('character', charMerge.label || '角色')}
                {panelRow('shop', '商店')}
                {panelRow('infoPhone', '手机', infoUnread)}
                {panelRow('npc', '人物')}
                {panelRow('tasks', '任务')}
                {panelRow('achievements', '成就')}
                {panelRow('eventProposals', '事件提议')}
                {panelRow('changeProposals', '变更提议')}                {panelRow('outputs', '产出物')}

                {endingsEnabled ? panelRow('endings', '结局') : null}
                {storyNodesEnabled ? panelRow('storyNodes', '剧情节点') : null}
                {panelRow('errorLog', '报错')}
                {panelRow('debug', '调试')}
                <TouchableOpacity
                  key="settings"
                  style={styles.panelItem}
                  activeOpacity={0.7}
                  onPress={function () { StoryStore.closeSidebar(); NavStore.navigate('settings'); }}
                >
                  <Text style={styles.panelName}>{'设置'}</Text>
                  <Text style={styles.panelArrow}>{'›'}</Text>
                </TouchableOpacity>
                {customPanels.map(function (p) { return panelRow('entries:' + p.id, p.name); })}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

module.exports = { SidebarDrawer: SidebarDrawer };
