// ============================================================
// 战役 4 · 批次 4-3：叙事页 StoryScreen（B 类，RN 组件）
// RN 独有。订阅 story_store（A 类）渲染叙事流，替代 Electron 侧
// ui_core 对 #story-area 的全部 DOM 拼装；engine/story.js 一行不改。
//
// 4-3a 渲染范围（P0+P1 数据）：
//   chapter 章头（卷次/第 N 轮/游戏时间） · hint 灰字行
//   dice 页边骰行（检定/掷骰 章） · segment 段落（「」“”对话嵌套着色、
//   meta 时间行、工具变更账块、选项按钮） · 底部自定义输入
// 4-3b：
//   setBusy(true) → 选项按钮禁用（同 DOM .opt-item:disabled），输入栏
//     遮断为「AI 思考中…」态（Electron 仅禁用发送钮；输入栏整体遮断为
//     RN 移动端增强，关账自报）；
//   showStoryLoading → 流尾「（AI 正在生成…）」灰字行（ui_core L714-721）；
//   showStoryError → 流内 gm-note 异常注（ui_core L725-745 + index.html
//     L619-634：竖发丝页边注形态，无红底，重试/去设置/返回排印描边钮）；
//   toast 在根层 OverlayHost.ToastBar 承接。
// 4-3c：侧栏抽屉/提议卡。
// P1-C：段内思考块（ThinkingBlock，meta 由 store 按三开关裁好，挂点对齐
//   ui_core L675-690：changes 之后、选项之前）。
// P1-D：段内行内动作区（🔁 重新生成仅最新轮 / ↩ 回到这里每轮，挂点对齐
//   ui_core L692-697：思考块之后、选项之前；编排在 snapshot_actions.js）。
// 交互：选项/输入 → 全局 StoryLoop.sendAction（busy 守卫在引擎内）；
//   退出 → story_runtime.exitGame（确认框走根层 OverlayHost）。
//
// 纪律：颜色/字号只取自 useTheme tokens；布局数值为 RN 必要度量。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var ScrollView = RN.ScrollView;
var TextInput = RN.TextInput;
var TouchableOpacity = RN.TouchableOpacity;
var ActivityIndicator = RN.ActivityIndicator;
var StatusBar = RN.StatusBar;
var SafeArea = require('react-native-safe-area-context');

var useTheme = require('../use_theme.js').useTheme;
var useNavigation = require('../navigation.js').useNavigation;
var StoryStore = require('../story_store.js');
var StoryRuntime = require('../story_runtime.js');
var StoryProposals = require('../story_proposals.js');
var SidebarDrawer = require('../components/SidebarDrawer.js').SidebarDrawer;
var BackgroundLayer = require('../components/BackgroundLayer.js').BackgroundLayer;
var ThinkingBlock = require('../components/ThinkingBlock.js').ThinkingBlock;
var SnapshotActions = require('../snapshot_actions.js');
var NavStore = require('../nav_store.js');

function StoryScreen() {
  var themeApi = useTheme();
  var tk = themeApi.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;
  var fonts = tk.fonts;
  var insets = SafeArea.useSafeAreaInsets();
  var nav = useNavigation();

  var snap = React.useSyncExternalStore(StoryStore.subscribe, StoryStore.getSnapshot, StoryStore.getSnapshot);
  var feed = snap.feed;
  var busy = snap.busy;
  var loading = snap.loading;

  var inputState = React.useState('');
  var input = inputState[0];
  var setInput = inputState[1];
  var noticeState = React.useState('');
  var notice = noticeState[0];
  var setNotice = noticeState[1];
  // P6·S3-4：掷骰翻滚态（桌面 rollStoryDice 的 520ms 翻滚行）
  var rollingState = React.useState(false);
  var rolling = rollingState[0];
  var setRolling = rollingState[1];

  var scrollRef = React.useRef(null);
  var bootedRef = React.useRef(false);

  // 挂载即续玩：进行中且 feed 空 → 原地重放；否则走主页 01 同一条 continueLast。
  React.useEffect(function () {
    if (bootedRef.current) return;
    bootedRef.current = true;
    var inGame = false;
    try { inGame = !!(GameState.currentCardId && GameState.currentSaveId); } catch (e) { inGame = false; }
    if (inGame && StoryStore.getSnapshot().feed.length === 0) {
      Platform.ui.renderGame();
      // P6·S4-1：已 load 存档但 chatHistory 为空的中间态不能只 replayHistory
      // （否则永久停在「叙事流载入中…」）——无历史即真正起首回合。
      // 对齐桌面 ui_cards.js:127-135 + :145-148 的 hasHistory 分支。
      var hasHistory = false;
      try { hasHistory = !!(GameState.chatHistory && GameState.chatHistory.length); } catch (e) { hasHistory = false; }
      if (hasHistory) {
        StoryRuntime.replayHistory();
      } else {
        try { StoryLoop.start(); } catch (e) {}
      }
      return;
    }
    if (!inGame) {
      StoryRuntime.continueLast().then(function (res) {
        if (!res.ok && !res.routed) setNotice(StoryRuntime.CONTINUE_REASONS[res.reason] || '续玩失败');
      });
    }
  }, []);

  // feed/loading 更新滚到底（同 Electron appendChild 后 scrollTop = scrollHeight）
  React.useEffect(function () {
    var sv = scrollRef.current;
    if (sv) requestAnimationFrame(function () { try { sv.scrollToEnd({ animated: false }); } catch (e) {} });
  }, [feed.length, loading]);

  function gameClock() {
    try { return GameState.formatGameTime() || ''; } catch (e) { return ''; }
  }
  function cardName() {
    try {
      var card = GameState.currentCard;
      if (!card) return '';
      var CardDisplay = require('../../engine/card_display.js');
      return CardDisplay.resolveCardDisplay(card).title || '';
    } catch (e) { return ''; }
  }

  // P6·S3：订阅 topbar 重渲染信号（renderTopbar 桥 → nav_store.notify('topbar')，
  // rn_platform L387 / nav_store L77-83）。数据真源仍在 GameState / Weather /
  // Calendar，store 只维护单调计数，组件收信号后现读（对齐 ui_core L214-259）。
  React.useSyncExternalStore(NavStore.subscribe, NavStore.getSnapshot, NavStore.getSnapshot);

  // P33·①：原顶栏横滑状态条（HUD / 天气 / 节日 / token）整条下线，读取逻辑
  //   搬进 SidebarDrawer「数值」区（用户裁决：状态不该靠顶部横滑看）。

  // P1-D：当前轮次（ui_core L693 isLast 判定用 _currentRoundNum）
  var curRound = 0;
  try { curRound = StoryStore.currentRoundNum(); } catch (e) { curRound = 0; }

  // P13·S1-b：手机未读信号（真源只有一个：InfoFeed.unreadTotal()；无未读时不占位、不占宽度）
  //   数据刷新沿用 L129 的 NavStore 'topbar' 信号：引擎 renderTopbar 后组件现读一次。
  var phoneUnread = 0;
  try { if (typeof InfoFeed !== 'undefined' && InfoFeed.unreadTotal) phoneUnread = InfoFeed.unreadTotal() || 0; } catch (e) { phoneUnread = 0; }

  function onRegenerate() { SnapshotActions.regenerate(); }
  function onRollback(round) { SnapshotActions.rollbackToRound(round); }

  function send(text) {
    if (busy) return;
    var v = String(text == null ? '' : text).trim();
    if (!v) return;
    try { StoryLoop.sendAction(v); } catch (e) {}
    setInput('');
  }

  // P6·S3-4：手动掷骰（桌面 ui_core.js:454-491 rollStoryDice）——
  // DiceEngine.roll('1d100') → 翻滚 520ms → story_store.appendDiceResult
  // （文案「🎲 d100 = N」逐字照桌面 :489），不经工具链。
  function onRollDice() {
    if (busy || rolling) return;
    try {
      if (typeof DiceEngine === 'undefined' || !DiceEngine) return;
      var r = DiceEngine.roll('1d100');
      if (!r || !r.ok) return;
      var n = r.total;
      setRolling(true);
      setTimeout(function () {
        setRolling(false);
        StoryStore.appendDiceResult('🎲 d100 = ' + n);
      }, 520);
    } catch (e) { setRolling(false); }
  }

  // 异常卡三动作（ui_core L747-751）
  function errRetry() { try { StoryLoop.retryLast(); } catch (e) {} }
  function errGoSettings() { nav.navigate('settings'); }
  function errBack() { StoryRuntime.exitGame(); }

  function onExit() {
    StoryRuntime.exitGame();
  }

  var styles = React.useMemo(function () {
    return RN.StyleSheet.create({
      root: { flex: 1, backgroundColor: c.bg },
      topbar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + 8, paddingBottom: 8, paddingHorizontal: 14,
        borderBottomWidth: 1, borderBottomColor: c.hair
      },
      exitBtn: { fontSize: f.sm, color: c.muted, letterSpacing: 1 },
      topTitle: { flex: 1, fontSize: f.xs, color: c.ink2, textAlign: 'center', letterSpacing: 2, marginHorizontal: 10 },
      topClock: { fontSize: f.xs, color: c.faint, fontFamily: fonts.mono, minWidth: 92, textAlign: 'right' },
      // P13·S1-b：顶栏手机未读（有未读才渲染；徽标显示口径 n>99 → 99+）
      topPhone: { flexDirection: 'row', alignItems: 'center', marginRight: 8 },
      topPhoneGlyph: { fontSize: f.md, color: c.textMuted2 || c.muted },
      topPhoneBadge: {
        minWidth: 16, paddingHorizontal: 4, borderRadius: 8,
        backgroundColor: c.danger, marginLeft: 3
      },
      topPhoneBadgeText: { fontSize: f.xs, color: c.bgCard || c.text, textAlign: 'center' },
      scroll: { flex: 1 },
      body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24 },
      chVolume: { fontFamily: fonts.kai, fontSize: f.lg, color: c.ink, marginTop: 14, marginBottom: 2 },
      chSub: { fontSize: f.xs, color: c.muted, letterSpacing: 2, marginBottom: 4 },
      hint: { fontSize: f.sm, color: c.muted, fontStyle: 'italic', lineHeight: Math.round(f.sm * 1.7), marginVertical: 6 },
      loadingLine: { fontSize: f.sm, color: c.muted, lineHeight: Math.round(f.sm * 1.7), paddingVertical: 12 },
      dice: {
        flexDirection: 'row', alignItems: 'flex-start', marginVertical: 5,
        borderLeftWidth: 2, borderLeftColor: c.hairStrong, paddingLeft: 8
      },
      diceTag: { fontSize: f.xs, color: c.seal, fontWeight: '700', marginRight: 6 },
      diceBody: { flex: 1, flexShrink: 1, fontSize: f.xs, color: c.muted, fontFamily: fonts.mono, lineHeight: Math.round(f.xs * 1.6) },
      para: { fontSize: f.base, color: c.text, lineHeight: Math.round(f.base * 1.85), marginVertical: 2 },
      say: { color: c.primary },
      meta: { fontSize: f.xs, color: c.faint, fontFamily: fonts.mono, marginTop: 3, marginBottom: 6 },
      changes: {
        borderLeftWidth: 2, borderLeftColor: c.primary, backgroundColor: c.panel,
        borderRadius: tk.radius.sm, paddingHorizontal: 10, paddingVertical: 6,
        marginVertical: 8
      },
      changeLine: { fontSize: f.xs, color: c.muted, lineHeight: Math.round(f.xs * 1.8) },
      // P1-D 行内动作区（ui_snapshot L117-126 .story-row-actions 同构）
      rowActions: {
        flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
        gap: 10, marginTop: 6, marginBottom: 2
      },
      rowLabel: { fontSize: f.xs, color: c.faint, letterSpacing: 1, marginRight: 2 },
      rowBtn: {
        borderWidth: 1, borderColor: c.hair, borderRadius: tk.radius.sm,
        paddingHorizontal: 10, paddingVertical: 4
      },
      rowBtnText: { fontSize: f.xs, color: c.muted },
      opts: { gap: 8, marginVertical: 8 },
      optBtn: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        paddingHorizontal: 12, paddingVertical: 9
      },
      optBtnDisabled: { borderColor: c.hair, opacity: 0.5 },
      optText: { fontSize: f.sm, color: c.ink, lineHeight: Math.round(f.sm * 1.5) },
      optNum: { color: c.seal, fontWeight: '700' },
      // 异常注：gm-note 页边注形态（index.html L619-634，U-3b 后无红底）
      // P10·A6：核对结论——桌面 .story-area .error-card（index.html:603 红底）被
      //   :625 `.error-card.gm-note { background: transparent; }` 覆盖，
      //   实际观感 = gm-note：透明底 / 左 2px hairStrong 竖发丝 / tag 印章色 /
      //   正文 ink2 斜体。RN 下面三条与之一致，故配色不改（改成红底反而偏离真实观感）。
      errNote: {
        borderLeftWidth: 2, borderLeftColor: c.hairStrong,
        paddingLeft: 12, marginVertical: 7
      },
      errHead: { fontSize: f.xs, lineHeight: Math.round(f.xs * 1.8), color: c.ink2, fontStyle: 'italic' },
      errTag: { color: c.seal, fontWeight: '700', letterSpacing: 1, marginRight: 8, fontStyle: 'normal' },
      errActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
      errBtnPrimary: {
        borderWidth: 1, borderColor: c.ink, borderRadius: tk.radius.md,
        paddingHorizontal: 16, paddingVertical: 6
      },
      errBtn: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.md,
        paddingHorizontal: 16, paddingVertical: 6
      },
      errBtnPrimaryText: { fontSize: f.sm, color: c.ink, letterSpacing: 2, fontFamily: fonts.serif },
      errBtnText: { fontSize: f.sm, color: c.muted, letterSpacing: 2, fontFamily: fonts.serif },
      // 提议卡：发丝线上下分隔（index.html L646-655，U-3d 排印形态）
      propCard: {
        borderTopWidth: 1, borderTopColor: c.hair, borderBottomWidth: 1, borderBottomColor: c.hair,
        paddingVertical: 14, paddingHorizontal: 4, marginVertical: 18
      },
      propTitle: { fontSize: f.sm, color: c.ink, lineHeight: Math.round(f.sm * 1.6), marginBottom: 4 },
      propReason: { fontSize: f.xs, color: c.muted, fontFamily: fonts.serif, lineHeight: Math.round(f.xs * 1.7), marginBottom: 10 },
      propActions: { flexDirection: 'row', gap: 10 },
      propAccept: {
        borderWidth: 1, borderColor: c.ink, borderRadius: tk.radius.md,
        paddingHorizontal: 22, paddingVertical: 7
      },
      propReject: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.md,
        paddingHorizontal: 22, paddingVertical: 7
      },
      propAcceptText: { fontSize: f.sm, color: c.ink, letterSpacing: 2, fontFamily: fonts.serif },
      propRejectText: { fontSize: f.sm, color: c.muted, letterSpacing: 2, fontFamily: fonts.serif },
      propStatus: { fontSize: f.xs, color: c.muted, fontFamily: fonts.serif, letterSpacing: 1 },
      // P33·①：菜单入口加边框与文字（原先只有一个小 ◇ 字形，用户反映找不到）
      menuBtn: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        paddingHorizontal: 12, paddingVertical: 6, marginLeft: 6
      },
      menuTxt: { fontSize: f.sm, color: c.ink2, letterSpacing: 1 },
      notice: { fontSize: f.sm, color: c.muted, fontStyle: 'italic', lineHeight: 22, marginVertical: 16 },
      inputBar: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 8,
        paddingHorizontal: 14, paddingTop: 8, paddingBottom: insets.bottom + 10,
        borderTopWidth: 1, borderTopColor: c.hair, backgroundColor: c.bg
      },
      busyBar: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        paddingVertical: 12
      },
      busyText: { fontSize: f.sm, color: c.muted, fontStyle: 'italic', letterSpacing: 2 },
      input: {
        flex: 1, borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        backgroundColor: c.bgCard, color: c.ink, fontSize: f.base,
        paddingHorizontal: 12, paddingVertical: 8, maxHeight: 96
      },
      sendBtn: {
        borderWidth: 1, borderColor: c.seal, backgroundColor: c.seal,
        borderRadius: tk.radius.sm, paddingHorizontal: 16, paddingVertical: 10
      },
      // P6·S3-4：掷骰钮（桌面 .roll-input-btn，ui_core :463 同款排印描边钮）
      rollBtn: {
        borderWidth: 1, borderColor: c.hairStrong,
        borderRadius: tk.radius.sm, paddingHorizontal: 12, paddingVertical: 10
      },
      rollText: { fontSize: f.sm, color: c.muted, letterSpacing: 1 },
      // P10·A10：输入提示行（桌面 .input-hint，index.html:961）
      inputHint: {
        fontSize: f.xs, color: c.muted, fontStyle: 'italic',
        paddingHorizontal: 14, paddingTop: 6, paddingBottom: 2
      },
      sendText: { fontSize: f.sm, color: c.card, letterSpacing: 2, fontWeight: '600' }
    });
  }, [tk, insets]);

  function renderEntry(e) {
    if (e.kind === 'chapter') {
      return (
        <View key={e.id}>
          {e.volume ? <Text style={styles.chVolume}>{e.volume}</Text> : null}
          <Text style={styles.chSub}>{e.sub}</Text>
        </View>
      );
    }
    if (e.kind === 'hint') {
      return <Text key={e.id} style={styles.hint}>{e.text}</Text>;
    }
    if (e.kind === 'dice') {
      return (
        <View key={e.id} style={styles.dice}>
          <Text style={styles.diceTag}>{e.tag}</Text>
          <Text style={styles.diceBody}>{e.body}</Text>
        </View>
      );
    }
    if (e.kind === 'error') {
      var hasActions = e.canRetry || e.canGoSettings;
      return (
        <View key={e.id} style={styles.errNote}>
          <Text style={styles.errHead}>
            <Text style={styles.errTag}>{e.title || '异常'}</Text>
            {'出错了：' + e.msg}
          </Text>
          {hasActions ? (
            <View style={styles.errActions}>
              {e.canRetry ? (
                <TouchableOpacity style={styles.errBtnPrimary} activeOpacity={0.6} onPress={errRetry}>
                  <Text style={styles.errBtnPrimaryText}>{'重试'}</Text>
                </TouchableOpacity>
              ) : null}
              {e.canGoSettings ? (
                <TouchableOpacity style={styles.errBtn} activeOpacity={0.6} onPress={errGoSettings}>
                  <Text style={styles.errBtnText}>{'去设置'}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.errBtn} activeOpacity={0.6} onPress={errBack}>
                <Text style={styles.errBtnText}>{'← 返回'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      );
    }
    if (e.kind === 'proposal') {
      var cardOpacity = e.status === 'accepted' ? 0.75 : (e.status === 'rejected' ? 0.6 : 1);
      return (
        <View key={e.id} style={[styles.propCard, { opacity: cardOpacity }]}>
          <Text style={styles.propTitle}>{'提议变更 · ' + e.title}</Text>
          {e.reason ? <Text style={styles.propReason}>{e.reason}</Text> : null}
          {e.status === 'pending' ? (
            <View style={styles.propActions}>
              <TouchableOpacity style={styles.propAccept} activeOpacity={0.6} disabled={!!e.accepting}
                onPress={function () { StoryProposals.accept(e.pid); }}>
                <Text style={styles.propAcceptText}>{'接受'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.propReject} activeOpacity={0.6} disabled={!!e.accepting}
                onPress={function () { StoryProposals.reject(e.pid); }}>
                <Text style={styles.propRejectText}>{'拒绝'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.propStatus}>{e.statusText}</Text>
          )}
        </View>
      );
    }
    // segment
    return (
      <View key={e.id}>
        {e.paras.map(function (runs, pi) {
          return (
            <Text key={pi} style={styles.para}>
              {runs.map(function (run, ri) {
                return run.say
                  ? <Text key={ri} style={styles.say}>{run.t}</Text>
                  : <Text key={ri}>{run.t}</Text>;
              })}
            </Text>
          );
        })}
        <Text style={styles.meta}>{e.metaLine}</Text>
        {e.changes.length ? (
          <View style={styles.changes}>
            {e.changes.map(function (line, li) {
              return <Text key={li} style={styles.changeLine}>{'· ' + line.text}</Text>;
            })}
          </View>
        ) : null}
        {e.thinking ? <ThinkingBlock tokens={tk} meta={e.thinking} /> : null}
        {e.round > 0 ? (
          <View style={styles.rowActions}>
            <Text style={styles.rowLabel}>{'第 ' + e.round + ' 轮'}</Text>
            {e.round === curRound ? (
              <TouchableOpacity style={styles.rowBtn} activeOpacity={0.6} onPress={onRegenerate}>
                <Text style={styles.rowBtnText}>{'🔁 重新生成'}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.rowBtn} activeOpacity={0.6}
              onPress={function () { onRollback(e.round); }}>
              <Text style={styles.rowBtnText}>{'↩ 回到这里'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {e.options.length ? (
          <View style={styles.opts}>
            {e.options.map(function (o, oi) {
              return (
                <TouchableOpacity key={oi} style={[styles.optBtn, busy ? styles.optBtnDisabled : null]}
                  activeOpacity={0.6} disabled={busy}
                  onPress={function () { send(o); }}>
                  <Text style={styles.optText}>
                    <Text style={styles.optNum}>{'(' + (oi + 1) + ' '}</Text>
                    {o}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <BackgroundLayer />
      <View style={styles.topbar}>
        <TouchableOpacity onPress={onExit} hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}>
          <Text style={styles.exitBtn}>{'← 退出'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuBtn} onPress={function () { StoryStore.openSidebar(); }}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}>
          <Text style={styles.menuTxt}>{'☰ 菜单'}</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{cardName()}</Text>
        {phoneUnread > 0 ? (
          <TouchableOpacity style={styles.topPhone} activeOpacity={0.7}
            onPress={function () { StoryStore.openPanel('infoPhone'); }}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
            <Text style={styles.topPhoneGlyph}>{'📱'}</Text>
            <View style={styles.topPhoneBadge}>
              <Text style={styles.topPhoneBadgeText}>{phoneUnread > 99 ? '99+' : String(phoneUnread)}</Text>
            </View>
          </TouchableOpacity>
        ) : null}
        <Text style={styles.topClock}>{gameClock()}</Text>
      </View>

      {/* P33·①：原顶部横滑状态条整条下线 —— 数值与天气/节日/时钟改在侧栏抽屉里看 */}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {!feed.length && !notice
          ? <Text style={styles.notice}>{'叙事流载入中…'}</Text>
          : null}
        {feed.map(renderEntry)}
        {/* P6·S3-4：掷骰翻滚行（桌面 ui_core :466-477 的 dice-row/.die.rolling） */}
        {rolling ? (
          <View style={styles.dice}>
            <Text style={styles.diceTag}>{'掷骰'}</Text>
            <Text style={styles.diceBody}>{'🎲 —  d100 翻滚中……'}</Text>
          </View>
        ) : null}
        {loading ? <Text style={styles.loadingLine}>{'（AI 正在生成…）'}</Text> : null}
      </ScrollView>

      {/* P10·A10：输入提示行（桌面 index.html:961 .input-hint 逐字） */}
      <Text style={styles.inputHint}>{'↑ 点选项继续剧情，也可以输入你想做的任何事（如"看向窗外""问她的名字"）'}</Text>

      {busy ? (
        <View style={styles.inputBar}>
          <View style={styles.busyBar}>
            <ActivityIndicator size="small" color={c.seal} />
            <Text style={styles.busyText}>{'AI 思考中…'}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.rollBtn} activeOpacity={0.6} onPress={onRollDice} disabled={rolling}>
            <Text style={styles.rollText}>{'掷骰'}</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="自定义行动…（/ra50 /1d100 /search 关键词）"
            placeholderTextColor={c.faint}
            multiline
          />
          <TouchableOpacity style={styles.sendBtn} activeOpacity={0.6} onPress={function () { send(input); }}>
          <Text style={styles.sendText}>{'发送'}</Text>
        </TouchableOpacity>
      </View>
      )}

      <SidebarDrawer />
    </View>
  );
}

module.exports = { StoryScreen: StoryScreen };
