// ============================================================
// 战役 H7 / P1-H · 剧情外信息层「手机」面板（B 类，RN 组件）
// 桌面锚点：engine/ui_panels.js renderInfoFeedPanel()（§9.2）
// 数据源：panel_data.computeInfoPhone（内部读 InfoFeed，本组件不直接读引擎）
// 结构（设计稿 §9.1）：手机状态条（游戏内时间 + 未读）→ tab「讯息」/「广播」，
//   讯息：线程列表 → 点入线程（气泡 + 输入框 + 发送 + ← 讯息，进入即 markRead）
//   广播：列表（来源名 · 时间 · 标题）→ 详情（标题 / 来源 / 公开度 · 范围 / 正文）
//   每条右下「跟进正文」（已混流置灰「已跟进」）；actionable 加小圆点。
//   工具栏「写讯息」（选收件人 → 输入 → 发送，只进信息层）；不提供「发广播」。
// 文案逐字（设计稿 §9.1/§9.2）：还没有收到任何讯息。/ 还没有广播。/ 手机模块未加载。/
//   说点什么… / 发送 / ← 讯息 / 写讯息 / 跟进正文 / 已跟进
// 纪律：颜色/字号只取自 useTheme tokens（经 PanelHost 传入）。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var ScrollView = RN.ScrollView;
var TextInput = RN.TextInput;
var TouchableOpacity = RN.TouchableOpacity;

var PanelData = require('../panels/panel_data.js');
var StoryStore = require('../story_store.js');

function InfoPhonePanel(props) {
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var tabState = React.useState('msg');
  var tab = tabState[0], setTab = tabState[1];
  var threadState = React.useState(null);
  var openThread = threadState[0], setOpenThread = threadState[1];
  var bcState = React.useState(null);
  var openBc = bcState[0], setOpenBc = bcState[1];
  var draftState = React.useState('');
  var draft = draftState[0], setDraft = draftState[1];
  var compState = React.useState(false);
  var composer = compState[0], setComposer = compState[1];
  var compToState = React.useState('');
  var compTo = compToState[0], setCompTo = compToState[1];
  var newDraftState = React.useState('');
  var newDraft = newDraftState[0], setNewDraft = newDraftState[1];
  var seqState = React.useState(0);
  var seq = seqState[0], setSeq = seqState[1];

  var view = PanelData.computeInfoPhone(openThread);

  var styles = RN.StyleSheet.create({
    empty: { color: c.muted, fontSize: f.base, textAlign: 'center', paddingVertical: 20 },
    statusBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.bgPanel, borderRadius: tk.radius.sm || 4,
      paddingHorizontal: 12, paddingVertical: 8
    },
    statusTime: { fontSize: f.sm, color: c.ink2, fontFamily: tk.fonts.mono },
    statusUnread: { fontSize: f.xs, color: c.danger },
    tabs: { flexDirection: 'row', marginTop: 10, marginBottom: 8 },
    tabText: {
      fontSize: f.sm, color: c.muted, paddingHorizontal: 12, paddingVertical: 6,
      borderBottomWidth: 2, borderBottomColor: 'transparent'
    },
    tabActive: { color: c.text, borderBottomColor: c.primary || c.accent },
    toolbar: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
    toolBtn: {
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: tk.radius.sm || 4, backgroundColor: c.hair
    },
    toolBtnText: { fontSize: f.sm, color: c.text },
    row: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.bgPanel || c.bg, borderRadius: tk.radius.md || 6,
      paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8
    },
    rowBody: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: f.md, color: c.text },
    rowSub: { fontSize: f.xs, color: c.muted, marginTop: 3 },
    rowMeta: { fontSize: f.xs, color: c.faint, marginTop: 3 },
    badge: {
      minWidth: 18, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 9,
      backgroundColor: c.danger, marginLeft: 8
    },
    badgeText: { fontSize: f.xs, color: c.bgCard || c.text, textAlign: 'center' },
    dot: {
      width: 6, height: 6, borderRadius: 3, backgroundColor: c.seal || c.danger,
      marginLeft: 8
    },
    threadHead: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      borderBottomWidth: 1, borderBottomColor: c.hair, paddingBottom: 8, marginBottom: 8
    },
    back: { fontSize: f.sm, color: c.muted, paddingVertical: 4, paddingRight: 10 },
    threadTitle: { flex: 1, fontSize: f.sm, color: c.ink2, textAlign: 'right' },
    bubbleWrapLeft: { alignItems: 'flex-start', marginBottom: 8 },
    bubbleWrapRight: { alignItems: 'flex-end', marginBottom: 8 },
    bubble: {
      maxWidth: '86%', borderRadius: tk.radius.md || 6,
      paddingHorizontal: 10, paddingVertical: 8
    },
    bubbleLeft: { backgroundColor: c.bgPanel || c.bg },
    bubbleRight: { backgroundColor: c.hair },
    bubbleName: { fontSize: f.xs, color: c.faint, marginBottom: 2 },
    bubbleText: { fontSize: f.sm, color: c.text, lineHeight: Math.round(f.sm * 1.6) },
    bubbleMeta: { fontSize: f.xs, color: c.faint, marginTop: 3 },
    followBtn: { paddingVertical: 4, paddingLeft: 10 },
    followText: { fontSize: f.xs, color: c.primary || c.accent },
    followedText: { fontSize: f.xs, color: c.faint },
    inputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    input: {
      flex: 1, minHeight: 36, borderRadius: tk.radius.sm || 4,
      borderWidth: 1, borderColor: c.hair, paddingHorizontal: 10, paddingVertical: 6,
      color: c.text, fontSize: f.sm
    },
    sendBtn: {
      marginLeft: 8, paddingHorizontal: 14, paddingVertical: 8,
      borderRadius: tk.radius.sm || 4, backgroundColor: c.primary || c.accent
    },
    sendText: { fontSize: f.sm, color: c.bgCard || c.text },
    detailCard: {
      backgroundColor: c.bgPanel || c.bg, borderRadius: tk.radius.md || 6,
      paddingHorizontal: 12, paddingVertical: 12
    },
    detailTitle: { fontSize: f.md, color: c.text },
    detailMeta: { fontSize: f.xs, color: c.faint, marginTop: 4 },
    detailBody: { fontSize: f.sm, color: c.ink2, lineHeight: Math.round(f.sm * 1.7), marginTop: 8 },
    detailFoot: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
    chip: {
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: tk.radius.sm || 4,
      backgroundColor: c.bgPanel || c.bg, marginRight: 6, marginBottom: 6
    },
    chipActive: { backgroundColor: c.primary || c.accent },
    chipText: { fontSize: f.xs, color: c.ink2 },
    chipTextActive: { color: c.bgCard || c.text }
  });

  // 进入线程即 markRead
  function enterThread(threadId) {
    PanelData.infoMarkRead(threadId);
    setDraft('');
    setOpenThread(threadId);
  }

  function sendToThread() {
    if (!openThread) return;
    var t = String(draft || '').trim();
    if (!t) return;
    if (PanelData.infoSend(openThread, t)) { setDraft(''); setSeq(seq + 1); }
  }

  function sendNew() {
    var t = String(newDraft || '').trim();
    if (!compTo || !t) return;
    if (PanelData.infoSendNew(compTo, t)) {
      setNewDraft('');
      setComposer(false);
      setTab('msg');
      setSeq(seq + 1);
    }
  }

  // 「跟进正文」⇒ 升级 + 关面板（升级内已触发一次正常回合）
  function follow(id) {
    var r = PanelData.infoPromote(id);
    if (r && r.ok) {
      try { StoryStore.closePanel(); } catch (e) { /* 关面板异常不向上抛 */ }
    } else {
      setSeq(seq + 1);
    }
  }

  if (!view.loaded) {
    return <Text style={styles.empty}>{view.emptyText}</Text>;
  }

  function renderFollow(item) {
    if (item.followed) return <Text style={styles.followedText}>{'已跟进'}</Text>;
    return (
      <TouchableOpacity style={styles.followBtn} activeOpacity={0.7} onPress={function () { follow(item.id); }}>
        <Text style={styles.followText}>{'跟进正文'}</Text>
      </TouchableOpacity>
    );
  }

  // ---------- 线程视图 ----------
  function renderThread() {
    return (
      <View>
        <View style={styles.threadHead}>
          <TouchableOpacity activeOpacity={0.7} onPress={function () { setOpenThread(null); }}>
            <Text style={styles.back}>{'← 讯息'}</Text>
          </TouchableOpacity>
          <Text style={styles.threadTitle} numberOfLines={1}>{view.threadTitle}</Text>
        </View>
        <View>
          {view.messages.map(function (m) {
            return (
              <View key={m.id} style={m.mine ? styles.bubbleWrapRight : styles.bubbleWrapLeft}>
                <View style={[styles.bubble, m.mine ? styles.bubbleRight : styles.bubbleLeft]}>
                  <Text style={styles.bubbleName}>{m.mine ? '你' : m.fromName}</Text>
                  <Text style={styles.bubbleText}>{m.text}</Text>
                  <Text style={styles.bubbleMeta}>{m.at}</Text>
                </View>
                {!m.mine ? renderFollow(m) : null}
              </View>
            );
          })}
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={draft}
            placeholder={'说点什么…'}
            placeholderTextColor={c.faint}
            onChangeText={setDraft}
            multiline={false}
          />
          <TouchableOpacity style={styles.sendBtn} activeOpacity={0.7} onPress={sendToThread}>
            <Text style={styles.sendText}>{'发送'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ---------- 讯息列表 ----------
  function renderMsgList() {
    return (
      <View>
        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.toolBtn} activeOpacity={0.7} onPress={function () { setComposer(!composer); }}>
            <Text style={styles.toolBtnText}>{'写讯息'}</Text>
          </TouchableOpacity>
        </View>
        {composer ? (
          <View style={styles.detailCard}>
            <View style={styles.chipRow}>
              {view.recipients.map(function (r) {
                var on = (compTo === r.id);
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.chip, on ? styles.chipActive : null]}
                    activeOpacity={0.7}
                    onPress={function () { setCompTo(r.id); }}
                  >
                    <Text style={[styles.chipText, on ? styles.chipTextActive : null]}>{r.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={newDraft}
                placeholder={'说点什么…'}
                placeholderTextColor={c.faint}
                onChangeText={setNewDraft}
                multiline={false}
              />
              <TouchableOpacity style={styles.sendBtn} activeOpacity={0.7} onPress={sendNew}>
                <Text style={styles.sendText}>{'发送'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        {view.threads.length ? view.threads.map(function (t) {
          return (
            <TouchableOpacity
              key={t.id}
              style={styles.row}
              activeOpacity={0.7}
              onPress={function () { enterThread(t.id); }}
            >
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>{t.title}</Text>
                {t.preview ? <Text style={styles.rowSub} numberOfLines={1}>{t.preview}</Text> : null}
                <Text style={styles.rowMeta}>{t.lastAt}</Text>
              </View>
              {t.actionable ? <View style={styles.dot} /> : null}
              {t.unread > 0 ? (
                <View style={styles.badge}><Text style={styles.badgeText}>{String(t.unread)}</Text></View>
              ) : null}
            </TouchableOpacity>
          );
        }) : <Text style={styles.empty}>{'还没有收到任何讯息。'}</Text>}
      </View>
    );
  }

  // ---------- 广播详情 / 列表 ----------
  function renderBroadcast() {
    if (openBc) {
      var b = null;
      for (var i = 0; i < view.broadcasts.length; i++) {
        if (view.broadcasts[i].id === openBc) { b = view.broadcasts[i]; break; }
      }
      if (!b) {
        return (
          <View>
            <TouchableOpacity activeOpacity={0.7} onPress={function () { setOpenBc(null); }}>
              <Text style={styles.back}>{'← 广播'}</Text>
            </TouchableOpacity>
            <Text style={styles.empty}>{'还没有广播。'}</Text>
          </View>
        );
      }
      return (
        <View>
          <TouchableOpacity activeOpacity={0.7} onPress={function () { setOpenBc(null); }}>
            <Text style={styles.back}>{'← 广播'}</Text>
          </TouchableOpacity>
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>{b.title}</Text>
            <Text style={styles.detailMeta}>{b.sourceName + ' · ' + b.at}</Text>
            <Text style={styles.detailMeta}>{b.publicity + ' · ' + b.scope}</Text>
            <Text style={styles.detailBody}>{b.body}</Text>
            <View style={styles.detailFoot}>{renderFollow(b)}</View>
          </View>
        </View>
      );
    }
    return (
      <View>
        {view.broadcasts.length ? view.broadcasts.map(function (b) {
          return (
            <TouchableOpacity
              key={b.id}
              style={styles.row}
              activeOpacity={0.7}
              onPress={function () { setOpenBc(b.id); }}
            >
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>{b.title}</Text>
                <Text style={styles.rowMeta}>{(b.sourceName || '') + ' · ' + (b.at || '')}</Text>
              </View>
              {b.actionable ? <View style={styles.dot} /> : null}
            </TouchableOpacity>
          );
        }) : <Text style={styles.empty}>{'还没有广播。'}</Text>}
      </View>
    );
  }

  return (
    <View>
      <View style={styles.statusBar}>
        <Text style={styles.statusTime}>{view.time || '—'}</Text>
        <Text style={styles.statusUnread}>{'未读 ' + view.unread}</Text>
      </View>
      <View style={styles.tabs}>
        <TouchableOpacity activeOpacity={0.7} onPress={function () { setTab('msg'); setOpenBc(null); setComposer(false); }}>
          <Text style={[styles.tabText, tab === 'msg' ? styles.tabActive : null]}>{'讯息'}</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.7} onPress={function () { setTab('bc'); setOpenThread(null); setComposer(false); }}>
          <Text style={[styles.tabText, tab === 'bc' ? styles.tabActive : null]}>{'广播'}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView>
        {tab === 'bc' ? renderBroadcast() : (openThread ? renderThread() : renderMsgList())}
      </ScrollView>
    </View>
  );
}

module.exports = InfoPhonePanel;