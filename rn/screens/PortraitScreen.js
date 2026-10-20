// ============================================================
// H6 G9 · 人设屏（B 类，RN 组件）
// P71 阶段 2：三动作分流（发送讨论 / 审核并生成 / 整理成人设）+ 流式 + 撤回
// 纪律：颜色/字号只取自 useTheme() tokens，无字面量色值/字号；
//   零 document./window.；引擎模块由 bootstrap 挂全局。
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
var BackgroundLayer = require('../components/BackgroundLayer.js').BackgroundLayer;

function PortraitScreen() {
  var themeApi = useTheme();
  var tk = themeApi.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;
  var fonts = tk.fonts;
  var nav = useNavigation();
  var insets = SafeArea.useSafeAreaInsets();

  var initPortrait = null;
  var initText = '';
  var initOpening = '';
  try {
    initPortrait = UI_Portrait.getCurrentPortrait() || null;
    if (initPortrait && initPortrait.summary) initText = String(initPortrait.summary);
    initOpening = UI_Portrait.getOpeningPrompt ? String(UI_Portrait.getOpeningPrompt() || '') : '';
  } catch (e) { /* */ }

  var textState = React.useState(initText);
  var text = textState[0];
  var setText = textState[1];

  var openingState = React.useState(initOpening);
  var opening = openingState[0];
  var setOpening = openingState[1];

  // 讨论区（含流式中的 AI 气泡）
  var discState = React.useState([]);
  var disc = discState[0];
  var setDisc = discState[1];

  var discInputState = React.useState('');
  var discInput = discInputState[0];
  var setDiscInput = discInputState[1];

  var portraitState = React.useState(initPortrait);
  var portrait = portraitState[0];
  var setPortrait = portraitState[1];

  var auditState = React.useState(null);
  var audit = auditState[0];
  var setAudit = auditState[1];

  var busyState = React.useState(false);
  var busy = busyState[0];
  var setBusy = busyState[1];

  var errState = React.useState('');
  var err = errState[0];
  var setErr = errState[1];

  // 最近改动（撤回列表）
  var undoListState = React.useState([]);
  var undoList = undoListState[0];
  var setUndoList = undoListState[1];

  function refreshUndo() {
    try { setUndoList(UI_Portrait.listUndo() || []); } catch (e) { setUndoList([]); }
  }

  React.useEffect(function () { refreshUndo(); }, []);

  function failToast(msg) {
    setErr(msg);
    Platform.ui.toast(msg, { type: 'error' });
  }

  function appendMsg(role, content) {
    setDisc(function (prev) {
      return prev.concat([{ role: role, content: String(content == null ? '' : content) }]);
    });
  }

  // 更新最后一条 AI 消息的内容（流式用）
  function updateLastAi(content) {
    setDisc(function (prev) {
      if (!prev.length) return prev;
      var out = prev.slice();
      var last = out[out.length - 1];
      if (last && last.role === 'ai') {
        out[out.length - 1] = { role: 'ai', content: String(content == null ? '' : content) };
      }
      return out;
    });
  }

  function handleGenResult(result) {
    if (!result) { setBusy(false); return; }
    var a = result.audit;
    var p = result.portrait;
    setAudit(a || null);
    if (a && a.verdict === 'conflict') {
      var issueText = '⚠️ 人设存在以下问题，请先与 AI 沟通修改：\n';
      (a.issues || []).forEach(function (iss) {
        issueText += '· [' + iss.field + '] ' + iss.reason + (iss.suggestion ? '\n  → 建议：' + iss.suggestion : '') + '\n';
      });
      appendMsg('ai', issueText);
      setErr('人设存在冲突，请先沟通修改后再确认。');
      setBusy(false);
      return;
    }
    if (a && a.verdict === 'concern' && a.issues && a.issues.length) {
      var concernText = '人设基本合理，但有以下小建议：\n';
      a.issues.forEach(function (iss) {
        concernText += '· [' + iss.field + '] ' + iss.reason + '\n';
      });
      appendMsg('ai', concernText);
    }
    if (p) {
      setPortrait(p);
      setText(String(p.summary || ''));
      appendMsg('ai', '已生成人设总述，可以在下方直接修改。\n\n' + String(p.summary || ''));
    }
    setBusy(false);
  }

  // ② 审核并生成
  function onAudit() {
    if (busy) return;
    setBusy(true);
    setErr('');
    var profile = ApiManager.getActive();
    if (!profile) {
      failToast('请先在设置 → AI 添加并启用一个 API 配置。');
      setBusy(false);
      return;
    }
    UI_Portrait.audit()
      .then(handleGenResult)
      .catch(function (e) {
        failToast('生成失败：' + (e && e.message ? e.message : String(e)));
        setBusy(false);
      });
  }

  // ① 发送（讨论，流式）
  function onSend() {
    if (busy) return;
    var t = String(discInput || '').trim();
    if (!t) return;
    setDiscInput('');
    appendMsg('user', t);
    appendMsg('ai', ''); // 流式占位
    setBusy(true);
    setErr('');
    var profile = ApiManager.getActive();
    if (!profile) {
      failToast('请先在设置 → AI 添加并启用一个 API 配置。');
      setBusy(false);
      return;
    }
    UI_Portrait.sendStream(t, {
      onContent: function (delta, full) { updateLastAi(full); },
      onDone: function (full) { updateLastAi(full); setBusy(false); },
      onError: function (msg) {
        updateLastAi('（出错：' + msg + '）');
        failToast('讨论失败：' + msg);
        setBusy(false);
      }
    }).catch(function (e) {
      updateLastAi('（出错：' + (e && e.message ? e.message : String(e)) + '）');
      failToast('讨论失败：' + (e && e.message ? e.message : String(e)));
      setBusy(false);
    });
  }

  // ③ 整理成人设
  function onExtract() {
    if (busy) return;
    setBusy(true);
    setErr('');
    UI_Portrait.extract()
      .then(function (result) {
        setBusy(false);
        if (!result || !result.ok) {
          failToast('整理失败：' + (result && result.error ? result.error : '未知错误'));
          return;
        }
        Platform.ui.toast('已整理：' + result.label, { type: 'success' });
        appendMsg('ai', '已整理成人设：' + result.label);
        refreshUndo();
      })
      .catch(function (e) {
        setBusy(false);
        failToast('整理失败：' + (e && e.message ? e.message : String(e)));
      });
  }

  // ④ 撤回（二次确认）
  function onUndo(entry) {
    if (busy) return;
    var label = entry && entry.label ? entry.label : '该改动';
    Platform.ui.confirmAsync('确定撤回「' + label + '」吗？').then(function (ok) {
      if (!ok) return;
      var r = UI_Portrait.undo(entry.id);
      if (!r || !r.ok) {
        Platform.ui.toast('撤回失败：' + (r && r.error ? r.error : '未知错误'), { type: 'warn' });
        return;
      }
      var msg = '已撤回：' + r.label;
      if (r.cascaded > 0) msg += '（连带回退了 ' + r.cascaded + ' 条后续改动）';
      Platform.ui.toast(msg, { type: 'success' });
      refreshUndo();
    });
  }

  function onConfirm() {
    if (busy) return;
    if (audit && audit.verdict === 'conflict') {
      failToast('人设存在冲突，请先在讨论区与 AI 沟通修改后再确认。');
      return;
    }
    var p = portrait;
    var trimmed = String(text || '').trim();
    if (!p) {
      if (!trimmed) {
        failToast('请先让 AI 生成或手填人设总述，或点「跳过」。');
        return;
      }
      p = { summary: trimmed, traits: [], lockedAt: new Date().toISOString(), aiVersion: 1 };
    } else {
      if (trimmed && trimmed !== p.summary) {
        p = Object.assign({}, p, { summary: trimmed });
      }
    }
    try {
      UI_Portrait.confirm(p, opening);
    } catch (e) {
      failToast('保存失败：' + (e && e.message ? e.message : String(e)));
    }
  }

  function onSkip() {
    if (busy) return;
    try { UI_Portrait.skip(opening); } catch (e) {
      failToast('跳过失败：' + (e && e.message ? e.message : String(e)));
    }
  }

  function onCancel() {
    if (busy) return;
    try { UI_Portrait.cancel(); } catch (e) { /* cancel 不得卡屏 */ }
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
      stepLine: { fontSize: f.xs, color: c.muted, letterSpacing: 2, marginBottom: 2 },
      stepTitle: { fontFamily: fonts.kai, fontSize: f.xl, color: c.ink, marginTop: 8, marginBottom: 6 },
      guide: { fontSize: f.sm, color: c.muted, lineHeight: Math.round(f.sm * 1.7), marginBottom: 14 },
      fieldLabel: { fontSize: f.sm, color: c.ink2, marginBottom: 6 },
      input: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        backgroundColor: c.panel, color: c.text, fontSize: f.base,
        paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14,
        minHeight: 120, textAlignVertical: 'top'
      },
      err: { fontSize: f.sm, color: c.danger, marginBottom: 10 },
      auditBox: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        backgroundColor: c.panel, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 12
      },
      auditTitle: { fontSize: f.sm, color: c.ink, fontWeight: '600', marginBottom: 4 },
      auditBody: { fontSize: f.xs, color: c.muted, lineHeight: Math.round(f.xs * 1.7), marginBottom: 4 },
      auditIssue: { fontSize: f.xs, color: c.danger, lineHeight: Math.round(f.xs * 1.7) },
      discBox: {
        borderWidth: 1, borderColor: c.hair, borderRadius: tk.radius.sm,
        backgroundColor: c.panel, paddingHorizontal: 10, paddingVertical: 8,
        marginBottom: 10, minHeight: 64
      },
      discEmpty: { fontSize: f.sm, color: c.faint, paddingVertical: 12, textAlign: 'center' },
      discMsg: { marginBottom: 8 },
      discRole: { fontSize: f.xs, color: c.muted, marginBottom: 2 },
      discContent: { fontSize: f.sm, color: c.text, lineHeight: Math.round(f.sm * 1.6) },
      inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 14 },
      smallInput: {
        flex: 1, borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        backgroundColor: c.panel, color: c.text, fontSize: f.sm,
        paddingHorizontal: 10, paddingVertical: 7
      },
      sendBtn: {
        borderWidth: 1, borderColor: c.seal, backgroundColor: c.seal,
        borderRadius: tk.radius.sm, paddingHorizontal: 14, paddingVertical: 8
      },
      sendBtnText: { fontSize: f.sm, color: c.card, letterSpacing: 1, fontWeight: '600' },
      sectionTitle: { fontFamily: fonts.kai, fontSize: f.lg, color: c.ink, marginTop: 14, marginBottom: 6 },
      hint: { fontSize: f.xs, color: c.muted, lineHeight: Math.round(f.xs * 1.7), marginBottom: 6 },
      openingInput: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        backgroundColor: c.panel, color: c.text, fontSize: f.sm,
        paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14,
        minHeight: 60, textAlignVertical: 'top'
      },
      btnRow: { flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' },
      primaryBtn: {
        borderWidth: 1, borderColor: c.seal, backgroundColor: c.seal,
        borderRadius: tk.radius.sm, paddingHorizontal: 18, paddingVertical: 9
      },
      primaryBtnText: { fontSize: f.sm, color: c.card, letterSpacing: 2, fontWeight: '600' },
      ghostBtn: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        paddingHorizontal: 14, paddingVertical: 9
      },
      ghostBtnText: { fontSize: f.sm, color: c.muted, letterSpacing: 2 },
      extractBtn: {
        borderWidth: 1, borderColor: c.accent, backgroundColor: c.accent,
        borderRadius: tk.radius.sm, paddingHorizontal: 14, paddingVertical: 9
      },
      extractBtnText: { fontSize: f.sm, color: c.card, letterSpacing: 1, fontWeight: '600' },
      btnDisabled: { opacity: 0.45 },
      busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 },
      busyText: { fontSize: f.sm, color: c.muted, letterSpacing: 1 },
      note: { fontSize: f.xs, color: c.faint, lineHeight: Math.round(f.xs * 1.7), marginBottom: 10, marginTop: 6 },
      // 最近改动
      undoBox: {
        borderWidth: 1, borderColor: c.hair, borderRadius: tk.radius.sm,
        backgroundColor: c.panel, paddingHorizontal: 10, paddingVertical: 8,
        marginBottom: 14, maxHeight: 180
      },
      undoTitle: { fontSize: f.xs, color: c.muted, marginBottom: 6, letterSpacing: 1 },
      undoEmpty: { fontSize: f.sm, color: c.faint, paddingVertical: 8, textAlign: 'center' },
      undoRow: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.hair
      },
      undoLabel: { flex: 1, fontSize: f.sm, color: c.text },
      undoBtn: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        paddingHorizontal: 10, paddingVertical: 4
      },
      undoBtnText: { fontSize: f.xs, color: c.muted }
    });
  }, [tk, insets]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <BackgroundLayer />
      <View style={styles.headerRow}>
        <Text style={styles.back} onPress={onCancel}>{'← 返回'}</Text>
        <Text style={styles.title}>{'人设'}</Text>
        <View style={styles.headerPad} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.stepLine}>{'人设总述 · 可手填或让 AI 生成'}</Text>
        <Text style={styles.stepTitle}>{'重审人设'}</Text>
        <Text style={styles.guide}>
          {'先和 AI 讨论角色细节，满意后点「整理成人设」把讨论结果写进字段。'}
        </Text>

        {/* 讨论区 + 流式 */}
        <View style={styles.discBox}>
          {disc.length ? disc.map(function (m, i) {
            return (
              <View key={'d' + i} style={styles.discMsg}>
                <Text style={styles.discRole}>{m.role === 'user' ? '你' : 'AI'}</Text>
                <Text style={styles.discContent}>{m.content || (m.role === 'ai' && busy ? '…' : '')}</Text>
              </View>
            );
          }) : (
            <Text style={styles.discEmpty}>{'点下方按钮开始，或直接输入想让 AI 注意的点。'}</Text>
          )}
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.smallInput}
            value={discInput}
            onChangeText={function (v) { setDiscInput(v); }}
            placeholder={'例：我希望这个角色说话很冷淡，但对朋友会突然温柔'}
            placeholderTextColor={c.faint}
            editable={!busy}
            onSubmitEditing={onSend}
          />
          <TouchableOpacity
            style={[styles.sendBtn, busy ? styles.btnDisabled : null]}
            activeOpacity={0.6} disabled={busy}
            onPress={onSend}
          >
            <Text style={styles.sendBtnText}>{'发送'}</Text>
          </TouchableOpacity>
        </View>

        {audit ? (
          <View style={styles.auditBox}>
            <Text style={styles.auditTitle}>
              {audit.verdict === 'conflict'
                ? '⚠️ 审核未通过：人设存在冲突'
                : (audit.verdict === 'concern' ? '审核通过（有建议）' : '✓ 审核通过')}
            </Text>
            {audit.comment ? <Text style={styles.auditBody}>{String(audit.comment)}</Text> : null}
            {(audit.issues && audit.issues.length) ? audit.issues.map(function (iss, i) {
              return (
                <Text key={'au' + i} style={styles.auditIssue}>
                  {'· [' + iss.field + '] ' + iss.reason}
                </Text>
              );
            }) : null}
          </View>
        ) : null}

        <Text style={styles.fieldLabel}>{'人设总述'}</Text>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={function (v) { setText(v); }}
          placeholder={'150-250 字的人设总述…'}
          placeholderTextColor={c.faint}
          multiline={true}
          editable={!busy}
        />

        {err ? <Text style={styles.err}>{err}</Text> : null}

        <Text style={styles.sectionTitle}>{'开场白（可选）'}</Text>
        <Text style={styles.hint}>{'游戏开始时给 AI 的第一句指令。留空则使用卡带默认或通用默认。'}</Text>
        <TextInput
          style={styles.openingInput}
          value={opening}
          onChangeText={function (v) { setOpening(v); }}
          placeholder={'例：我从一个陌生的港口醒来，身上只有一部手机和一把匕首。'}
          placeholderTextColor={c.faint}
          multiline={true}
          editable={!busy}
        />

        {/* 最近改动（撤回） */}
        <View style={styles.undoBox}>
          <Text style={styles.undoTitle}>{'最近改动'}</Text>
          {undoList.length ? undoList.map(function (e, i) {
            return (
              <View key={'u' + i} style={styles.undoRow}>
                <Text style={styles.undoLabel} numberOfLines={1}>{e.label || '（无标签）'}</Text>
                <TouchableOpacity
                  style={styles.undoBtn}
                  activeOpacity={0.6}
                  onPress={function () { onUndo(e); }}
                >
                  <Text style={styles.undoBtnText}>{'撤回'}</Text>
                </TouchableOpacity>
              </View>
            );
          }) : (
            <Text style={styles.undoEmpty}>{'还没有改动记录'}</Text>
          )}
        </View>

        {busy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator size="small" color={c.accent} />
            <Text style={styles.busyText}>{'AI 处理中…'}</Text>
          </View>
        ) : null}

        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.ghostBtn, busy ? styles.btnDisabled : null]}
            activeOpacity={0.6} disabled={busy}
            onPress={onAudit}
          >
            <Text style={styles.ghostBtnText}>{'审核并生成'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.extractBtn, busy ? styles.btnDisabled : null]}
            activeOpacity={0.6} disabled={busy}
            onPress={onExtract}
          >
            <Text style={styles.extractBtnText}>{'整理成人设'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, busy ? styles.btnDisabled : null]}
            activeOpacity={0.6} disabled={busy}
            onPress={onConfirm}
          >
            <Text style={styles.primaryBtnText}>{'确认'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ghostBtn, busy ? styles.btnDisabled : null]}
            activeOpacity={0.6} disabled={busy}
            onPress={onSkip}
          >
            <Text style={styles.ghostBtnText}>{'跳过'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ghostBtn, busy ? styles.btnDisabled : null]}
            activeOpacity={0.6} disabled={busy}
            onPress={onCancel}
          >
            <Text style={styles.ghostBtnText}>{'取消'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.note}>
          {'「确认」写入存档并回叙事页；「跳过」用原始字段兜底；「取消」不写档直接返回。'}
        </Text>
      </ScrollView>
    </View>
  );
}

module.exports = { PortraitScreen: PortraitScreen };
