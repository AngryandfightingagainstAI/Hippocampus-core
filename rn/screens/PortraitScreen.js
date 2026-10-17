// ============================================================
// H6 G9 · 人设屏（B 类，RN 组件）
// RN 独有。承载 UI_Portrait 的 RN 侧交互：
//   - TextInput 让用户手填人设总述（或编辑 AI 生成结果）
//   - 「让 AI 生成」→ ApiManager.getActive + UI_Portrait.generate（两阶段审核：
//     先 audit 后 generate；conflict 阻断确认，concern 提示后放行）
//   - P47·1：讨论发送 → UI_Portrait.sendAndGenerate（同两阶段）
//   - 「确认」→ Portrait.save + UI_Portrait.complete（回叙事页 + appendHint）
//   - 「跳过」→ UI_Portrait.skip（Portrait.fallback 兜底）
//   - 「取消」→ UI_Portrait.cancel（回叙事页，不写档）
//   P10·A5：补「讨论输入行（发送 = 多轮迭代）」与「开场白 opening」两项，
//     文案/交互照桌面 ui_portrait.js:86-102；opening 随 confirm/skip 落
//     playerData._openingPrompt（UI_Portrait.applyOpening，空则删）。
//
// 两条入口（由 UI_Portrait 模块状态区分，本屏不判）：
//   A. 创角流程：UI_Portrait.start(playerData, cb) 已设 _cb，complete 调 cb
//   B. 重审人设：CharacterPanel 直触发屏，无 cb，complete 回叙事页 + 提示
//
// 纪律：颜色/字号只取自 useTheme() tokens，无字面量色值/字号；
//   零 document./window.；引擎模块（Portrait/ApiClient/ApiManager/
//   Platform/GameState）与 UI_Portrait 由 bootstrap 挂全局，裸用同 engine 风格。
// 参照 CreateScreen.js 结构（headerRow/scroll/btnRow/primaryBtn/ghostBtn）。
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
// P57-B：全局背景渲染层统一挂载（用户裁决：其余屏一起挂上；同 HomeScreen/StoryScreen 挂法）
var BackgroundLayer = require('../components/BackgroundLayer.js').BackgroundLayer;

function PortraitScreen() {
  var themeApi = useTheme();
  var tk = themeApi.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;
  var fonts = tk.fonts;
  var nav = useNavigation();
  var insets = SafeArea.useSafeAreaInsets();

  // 初始 portrait：从 UI_Portrait 拿已有（重审场景预填）；无则空
  var initPortrait = null;
  var initText = '';
  var initOpening = '';
  try {
    initPortrait = UI_Portrait.getCurrentPortrait() || null;
    if (initPortrait && initPortrait.summary) initText = String(initPortrait.summary);
    // P10·A5：开场白预填（桌面 ui_portrait.js:77 existingOpening = playerData._openingPrompt）
    initOpening = UI_Portrait.getOpeningPrompt ? String(UI_Portrait.getOpeningPrompt() || '') : '';
  } catch (e) { /* */ }

  var textState = React.useState(initText);
  var text = textState[0];
  var setText = textState[1];

  // P10·A5：开场白（可空）与讨论多轮
  var openingState = React.useState(initOpening);
  var opening = openingState[0];
  var setOpening = openingState[1];
  var discState = React.useState([]);
  var disc = discState[0];
  var setDisc = discState[1];
  var discInputState = React.useState('');
  var discInput = discInputState[0];
  var setDiscInput = discInputState[1];

  var portraitState = React.useState(initPortrait);
  var portrait = portraitState[0];
  var setPortrait = portraitState[1];

  // P47·1.4：最近一次审核结果（{ verdict, issues, comment } | null）
  //   conflict → onConfirm 阻断；concern → 展示建议但放行；ok → 正常
  var auditState = React.useState(null);
  var audit = auditState[0];
  var setAudit = auditState[1];

  var busyState = React.useState(false);
  var busy = busyState[0];
  var setBusy = busyState[1];

  var errState = React.useState('');
  var err = errState[0];
  var setErr = errState[1];

  function failToast(msg) {
    setErr(msg);
    Platform.ui.toast(msg, { type: 'error' });
  }

  function appendMsg(role, content) {
    setDisc(function (prev) {
      return prev.concat([{ role: role, content: String(content == null ? '' : content) }]);
    });
  }

  // P47·1.2/1.3：两阶段审核结果的统一处理
  //   result = { audit, portrait }
  //   conflict → 讨论区列出问题、不填 portrait、阻断确认
  //   concern  → 讨论区列出建议 + 填 portrait（允许确认）
  //   ok       → 直接填 portrait
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
      return; // conflict → 不填 portrait
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

  // 让 AI 生成（P47·1.2：改走 UI_Portrait.generate 两阶段审核）
  function onGenerate() {
    if (busy) return;
    setBusy(true);
    setErr('');
    var profile = ApiManager.getActive();
    if (!profile) {
      failToast('请先在设置 → AI 添加并启用一个 API 配置。');
      setBusy(false);
      return;
    }
    UI_Portrait.generate()
      .then(handleGenResult)
      .catch(function (e) {
        failToast('生成失败：' + (e && e.message ? e.message : String(e)));
        setBusy(false);
      });
  }

  // P10·A5 · 讨论发送：多轮迭代（P47·1.3：改走 UI_Portrait.sendAndGenerate 两阶段审核）
  function onSend() {
    if (busy) return;
    var t = String(discInput || '').trim();
    if (!t) return;
    setDiscInput('');
    appendMsg('user', t);
    setBusy(true);
    setErr('');
    var profile = ApiManager.getActive();
    if (!profile) {
      failToast('请先在设置 → AI 添加并启用一个 API 配置。');
      setBusy(false);
      return;
    }
    UI_Portrait.sendAndGenerate(t)
      .then(handleGenResult)
      .catch(function (e) {
        appendMsg('ai', '（出错：' + (e && e.message ? e.message : String(e)) + '）');
        failToast('生成失败：' + (e && e.message ? e.message : String(e)));
        setBusy(false);
      });
  }

  // 确认：用 AI 生成的 portrait，或手填文本构造；Portrait.save + complete
  function onConfirm() {
    if (busy) return;
    // P47·1.4：审核 conflict 时阻断确认（先沟通修改）
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
      p = {
        summary: trimmed,
        traits: [],
        lockedAt: new Date().toISOString(),
        aiVersion: 1
      };
    } else {
      // AI 生成后用户可能编辑过文本 → 以最新文本为准
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
      // P47·1.4：审核状态块（颜色走 tokens，无字面量色值字号）
      auditBox: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        backgroundColor: c.panel, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 12
      },
      auditTitle: { fontSize: f.sm, color: c.ink, fontWeight: '600', marginBottom: 4 },
      auditBody: { fontSize: f.xs, color: c.muted, lineHeight: Math.round(f.xs * 1.7), marginBottom: 4 },
      auditIssue: { fontSize: f.xs, color: c.danger, lineHeight: Math.round(f.xs * 1.7) },
      // P10·A5：讨论区 / 输入行 / 开场白（样式走 tokens，无字面量色值字号）
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
      btnDisabled: { opacity: 0.45 },
      busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 },
      busyText: { fontSize: f.sm, color: c.muted, letterSpacing: 1 },
      note: { fontSize: f.xs, color: c.faint, lineHeight: Math.round(f.xs * 1.7), marginBottom: 10, marginTop: 6 }
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
          {'写一段让 GM 快速理解这个角色的人设总述（性格、气质、说话方式、行为倾向）。可点「让 AI 生成」自动起草，再编辑确认。'}
        </Text>

        {/* P10·A5：多轮讨论区（桌面 ui_portrait.js:86-93 portrait-disc + 输入行） */}
        <View style={styles.discBox}>
          {disc.length ? disc.map(function (m, i) {
            return (
              <View key={'d' + i} style={styles.discMsg}>
                <Text style={styles.discRole}>{m.role === 'user' ? '你' : 'AI'}</Text>
                <Text style={styles.discContent}>{m.content}</Text>
              </View>
            );
          }) : (
            <Text style={styles.discEmpty}>{'点下方"让 AI 生成"开始，或直接输入想让 AI 注意的点。'}</Text>
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

        {/* P47·1.4：当前审核状态（conflict 红 / concern 提示 / ok 通过） */}
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

        {/* P10·A5：开场白（可选）——文案逐字照桌面 ui_portrait.js:100-102 */}
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

        {busy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator size="small" color={c.accent} />
            <Text style={styles.busyText}>{'AI 生成中…'}</Text>
          </View>
        ) : null}

        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.ghostBtn, busy ? styles.btnDisabled : null]}
            activeOpacity={0.6} disabled={busy}
            onPress={onGenerate}
          >
            <Text style={styles.ghostBtnText}>{'让 AI 生成'}</Text>
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
          {'「确认」写入存档并回叙事页；「跳过」用原始字段兜底（不进 AI 提示词）；「取消」不写档直接返回。'}
        </Text>
      </ScrollView>
    </View>
  );
}

module.exports = { PortraitScreen: PortraitScreen };
