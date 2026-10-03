// ============================================================
// P1-G · 卡带分类审核屏（B 类，RN 组件）
// RN 独有。桌面 grounding：engine/classify.js 的 open()/requestAI()/
// applyAndSave() + renderPanel 的勾选交互（DOM 判不搬，本屏承接）。
//
// 链路（照桌面 requestAI:227-254 / applyAndSave:423-444）：
//   读卡（UiClassify.loadCard）→ CardClassifyPure.extractAllNumbers
//   → buildPrompt → ApiManager.getActive + ApiClient.chat（max_tokens 4000 /
//   temperature 0.3，同 :230-232）→ parseSuggestions → 玩家勾选
//   → applyMovements → UiClassify.saveClassified → toast → 返回
//
// 文案逐字照桌面：
//   :425「卡带不存在」 :240「AI 返回无法解析，请重试。原始内容（开头 400 字）：」
//   :251「出错：」     :442「已应用分类，移动了 N 条数值。\n\n卡带已标记为"已分类"。」
// 无 key 时的说明文案为 RN 新增（照已存在的 PortraitScreen:84 同句）。
//
// 纪律：颜色/字号只取自 useTheme() tokens；零 document./window.。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var ScrollView = RN.ScrollView;
var TouchableOpacity = RN.TouchableOpacity;
var ActivityIndicator = RN.ActivityIndicator;
var StatusBar = RN.StatusBar;
var SafeArea = require('react-native-safe-area-context');

var useTheme = require('../use_theme.js').useTheme;
var useNavigation = require('../navigation.js').useNavigation;
var UiClassify = require('../ui_classify_rn.js');

var WHERE_LABEL = {
  'hud': '顶栏',
  'sidebar': '侧栏',
  'panel.2': '面板2·个人素质',
  'panel.3': '面板3·声望名誉',
  'panel.4': '面板4·社交关系',
  'panel.5': '面板5·世界百科'
};

function labelOf(where) { return WHERE_LABEL[where] || where; }

function ClassifyScreen() {
  var themeApi = useTheme();
  var tk = themeApi.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;
  var fonts = tk.fonts;
  var nav = useNavigation();
  var insets = SafeArea.useSafeAreaInsets();

  var cardId = UiClassify.getPendingCardId();
  var card = UiClassify.loadCard(cardId);
  var hasKey = UiClassify.hasApiKey();

  var itemsState = React.useState(null);
  var items = itemsState[0];
  var setItems = itemsState[1];

  var sgState = React.useState(null);
  var suggestions = sgState[0];
  var setSuggestions = sgState[1];

  var accState = React.useState({});
  var accepted = accState[0];
  var setAccepted = accState[1];

  var busyState = React.useState(false);
  var busy = busyState[0];
  var setBusy = busyState[1];

  var errState = React.useState('');
  var err = errState[0];
  var setErr = errState[1];

  function finish() {
    UiClassify.clearPending();
    try { nav.goBack(); } catch (e) { /* 返回失败不得卡屏 */ }
  }

  // 开始分析：照 requestAI:227-254
  function onAnalyze() {
    if (busy) return;
    if (!card) { setErr('卡带不存在'); return; }
    if (!hasKey) return;
    setBusy(true);
    setErr('');
    setSuggestions(null);
    try {
      var its = CardClassifyPure.extractAllNumbers(card);
      var prompt = CardClassifyPure.buildPrompt(card, its);
      ApiClient.chat([{ role: 'user', content: prompt }], { max_tokens: 4000, temperature: 0.3 })
        .then(function (content) {
          if (typeof content === 'object' && content && content.content) content = content.content;
          if (typeof content !== 'string') content = String(content == null ? '' : content);
          var sgs = CardClassifyPure.parseSuggestions(content, its);
          if (!sgs) {
            setErr('AI 返回无法解析，请重试。原始内容（开头 400 字）：\n\n' + content.slice(0, 400));
            setBusy(false);
            return;
          }
          var acc = {};
          for (var i = 0; i < sgs.length; i++) acc[sgs[i].key] = true;  // 默认全部勾选（:246）
          setItems(its);
          setSuggestions(sgs);
          setAccepted(acc);
          setBusy(false);
        })
        .catch(function (e) {
          setErr('出错：' + (e && e.message ? e.message : String(e)));
          setBusy(false);
        });
    } catch (e) {
      setErr('出错：' + (e && e.message ? e.message : String(e)));
      setBusy(false);
    }
  }

  function onToggle(key) {
    setAccepted(function (prev) {
      var next = Object.assign({}, prev);
      next[key] = !next[key];
      return next;
    });
  }

  // 应用并保存：照 applyAndSave:423-444
  function onApply() {
    if (busy || !suggestions) return;
    try {
      var r = CardClassifyPure.applyMovements(card, suggestions, accepted);
      UiClassify.saveClassified(cardId, r.card);
      try {
        Platform.ui.toast('已应用分类，移动了 ' + r.movedCount + ' 条数值。\n\n卡带已标记为"已分类"。', { type: 'success' });
      } catch (e) { /* toast 失败不得阻断返回 */ }
      finish();
    } catch (e) {
      setErr('出错：' + (e && e.message ? e.message : String(e)));
    }
  }

  var styles = React.useMemo(function () {
    return RN.StyleSheet.create({
      root: { flex: 1, backgroundColor: c.bg },
      headerRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: 10,
        borderBottomWidth: 2, borderBottomColor: c.ink
      },
      back: { fontFamily: fonts.serif, fontSize: f.sm, color: c.muted, letterSpacing: 1 },
      title: { fontFamily: fonts.serif, fontSize: f.lg, color: c.ink, letterSpacing: 4, fontWeight: '600' },
      headerPad: { width: 48 },
      scroll: { flex: 1 },
      body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: insets.bottom + 24 },
      overline: { fontFamily: fonts.serif, fontSize: f.xs, color: c.muted, letterSpacing: 4, marginBottom: 8 },
      cardName: { fontFamily: fonts.serif, fontSize: f.md, color: c.ink, fontWeight: '600', marginBottom: 4 },
      guide: { fontSize: f.sm, color: c.muted, lineHeight: Math.round(f.sm * 1.7), marginBottom: 12 },
      notice: { fontSize: f.sm, color: c.warning, lineHeight: Math.round(f.sm * 1.7), marginBottom: 12 },
      err: { fontSize: f.sm, color: c.danger, lineHeight: Math.round(f.sm * 1.7), marginBottom: 12 },
      row: {
        borderWidth: 1, borderColor: c.hair, borderRadius: tk.radius.sm,
        paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, backgroundColor: c.card
      },
      rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
      mark: { fontFamily: fonts.mono, fontSize: f.md, color: c.accent, width: 20 },
      markOff: { fontFamily: fonts.mono, fontSize: f.md, color: c.faint, width: 20 },
      rowName: { flex: 1, fontSize: f.sm, color: c.ink2, fontWeight: '600' },
      rowType: { fontFamily: fonts.mono, fontSize: f.xs, color: c.faint },
      move: { fontFamily: fonts.mono, fontSize: f.xs, color: c.muted, marginBottom: 3 },
      reason: { fontSize: f.sm, color: c.muted, lineHeight: Math.round(f.sm * 1.6) },
      btnRow: { flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' },
      primaryBtn: {
        borderWidth: 1, borderColor: c.seal, backgroundColor: c.seal,
        borderRadius: tk.radius.sm, paddingHorizontal: 18, paddingVertical: 9
      },
      primaryBtnText: { fontFamily: fonts.sans, fontSize: f.sm, color: c.card, letterSpacing: 2, fontWeight: '600' },
      ghostBtn: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        paddingHorizontal: 14, paddingVertical: 9
      },
      ghostBtnText: { fontFamily: fonts.sans, fontSize: f.sm, color: c.muted, letterSpacing: 2 },
      btnDisabled: { opacity: 0.45 },
      busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 },
      busyText: { fontSize: f.sm, color: c.muted, letterSpacing: 1 }
    });
  }, [tk, insets]);

  var changedCount = 0;
  if (suggestions) {
    for (var i = 0; i < suggestions.length; i++) { if (suggestions[i].changed) changedCount++; }
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.headerRow}>
        <Text style={styles.back} onPress={finish}>{'← 返回'}</Text>
        <Text style={styles.title}>{'分类审核'}</Text>
        <View style={styles.headerPad} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        {!card ? (
          <Text style={styles.guide}>{'卡带不存在'}</Text>
        ) : (
          <View>
            <Text style={styles.overline}>{'审 核'}</Text>
            <Text style={styles.cardName}>{card.cardName || cardId}</Text>
            <Text style={styles.guide}>
              {'让 AI 判断每个数值该放哪个容器（顶栏 / 侧栏 / 面板），你逐条勾选后应用。位置正确的会被保留，只移动你勾选的项。'}
            </Text>

            {!hasKey ? (
              <Text style={styles.notice}>{'请先在设置 → AI 添加并启用一个 API 配置。'}</Text>
            ) : null}

            {err ? <Text style={styles.err}>{err}</Text> : null}

            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator size="small" color={c.accent} />
                <Text style={styles.busyText}>{'AI 分析中…'}</Text>
              </View>
            ) : null}

            {suggestions ? (
              <View>
                <Text style={styles.overline}>{'建 议（' + changedCount + ' 条需移动）'}</Text>
                {suggestions.map(function (sg) {
                  var on = !!accepted[sg.key];
                  return (
                    <TouchableOpacity key={sg.key} style={styles.row} activeOpacity={0.7} onPress={function () { onToggle(sg.key); }}>
                      <View style={styles.rowHead}>
                        <Text style={on ? styles.mark : styles.markOff}>{on ? '✓' : '○'}</Text>
                        <Text style={styles.rowName}>{sg.name || sg.key}</Text>
                        <Text style={styles.rowType}>{sg.type}</Text>
                      </View>
                      <Text style={styles.move}>
                        {sg.changed ? (labelOf(sg.from) + ' → ' + labelOf(sg.to)) : (labelOf(sg.to) + '（原位）')}
                      </Text>
                      <Text style={styles.reason}>{sg.reason || ''}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.ghostBtn, (busy || !hasKey) ? styles.btnDisabled : null]}
                activeOpacity={0.6} disabled={busy || !hasKey}
                onPress={onAnalyze}
              >
                <Text style={styles.ghostBtnText}>{suggestions ? '重新分析' : '开始分析'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, (busy || !suggestions) ? styles.btnDisabled : null]}
                activeOpacity={0.6} disabled={busy || !suggestions}
                onPress={onApply}
              >
                <Text style={styles.primaryBtnText}>{'应用'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

module.exports = { ClassifyScreen: ClassifyScreen };