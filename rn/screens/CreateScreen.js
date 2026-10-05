// ============================================================
// 战役 P5 · 新建存档（创角）屏（B 类，RN 组件）
// RN 独有。与桌面 engine/story.js CreateFlow 同契约：
//   逻辑/数据全在 A 类模块 rn/create_flow_model.js（池、跳过、草稿、
//   校验、汇总、finish 数据段），本文件只做「渲染 + 玩家可见文案」。
//   步骤类型：form（text / number / choice / 未知兜底按 text，对齐 :785）、
//   select（含 renderMode==='quiz'）、multi-select（含 quiz）、summary；
//   真正未知的 step.type 才显示「（未知步骤类型：X）」（对齐 :738）。
//   不再有「本批未支持」——已知类型必须实现（红线：不许静默跳过）。
//
// 建档时机：与桌面 ui_cards.js:109-133 一致——进入创角屏即建卡并装载；
//   finish()（对齐 :1035-1046）不再建卡。返回创角屏时若存在「未完成 + 有
//   未过期草稿」的同卡带存档，则续跑该档（对齐 continueSave）。
//
// 完成动作契约九步（create_smoke C8/C9，P9·S7 更新）：默认档名 → 建档 → 装载
//   → 回写玩家名 → 游戏时钟 → 落盘 → 进人设屏 → 落人设 → 进叙事页；前三锚点在前置
//   effect，其余在 finish。人设兜底/落人设已下沉 UI_Portrait（跳过 ⇒ skip() 走
//   Portrait.fallback；确认 ⇒ confirm() 用 AI/手填结果），锚点串按序出现在下方源码。
// 契约禁令：不调 Platform.ui.showScreen('screen-game')（改用 nav.navigate 进叙事页）。
//
// 纪律：颜色/字号只取自 useTheme() tokens，无字面量色值/字号；
//   布局度量为 RN 必要数值；Saves/GameState/Portrait/Alias/Platform 为
//   bootstrap 挂载全局，裸用同 engine 风格。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var ScrollView = RN.ScrollView;
var TextInput = RN.TextInput;
var TouchableOpacity = RN.TouchableOpacity;
var StatusBar = RN.StatusBar;
var SafeArea = require('react-native-safe-area-context');

var useTheme = require('../use_theme.js').useTheme;
var useNavigation = require('../navigation.js').useNavigation;
var Model = require('../home_model.js');
var CF = require('../create_flow_model.js');
// P10·A2：建档前起名走 promptOpen（OverlayHost.PromptModal，根层已挂；Promise<string|null>）
var StoryStore = require('../story_store.js');
// P10·A7：空态文案单一来源（逐字照桌面 ui_cards.js:38）
var EmptyTexts = require('../empty_texts.js');

// 无 steps 卡带的默认两步：确认姓名 → 完成
var DEFAULT_STEPS = [
  { id: 'name', type: 'form', title: '姓名', guide: '输入你的角色名。',
    fields: [{ key: 'name', type: 'text', label: '姓名', required: true }] },
  { id: 'confirm', type: 'summary', title: '确认' }
];

// 错误码 → 玩家可见文案（逐字照桌面 validateCurrent:987-1022 / toggleMulti:983）
function msgOf(res) {
  switch (res && res.code) {
    case 'REQUIRED': return '请填写：' + res.label;
    case 'POOL_OVER': return '属性点超出上限：已分配 ' + res.a + ' / ' + res.total + '\n请减少一些属性';
    case 'POOL_UNDER': return '属性点还没用完（已分配 ' + res.a + ' / ' + res.total + '），确定继续？';
    case 'SELECT_REQUIRED': return '请选择一个选项';
    case 'MULTI_MIN': return '至少选 ' + res.min + ' 项';
    case 'MULTI_MAX': return '最多选 ' + res.max + ' 项';
    default: return '';
  }
}

function shallowEqObj(a, b) {
  var ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (var i = 0; i < ka.length; i++) {
    if (a[ka[i]] !== b[ka[i]]) return false;
  }
  return true;
}

function CreateScreen() {
  var themeApi = useTheme();
  var tk = themeApi.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;
  var fonts = tk.fonts;
  var nav = useNavigation();
  var insets = SafeArea.useSafeAreaInsets();

  // 数据源：当前主页卡（rn/home_model.js:19/51 的 setHomeCardId 链）
  var picked = Model.getHomePicked();
  var cardId = picked ? picked.id : null;
  var card = picked ? picked.card : null;
  var rawSteps = (card && Array.isArray(card.steps) && card.steps.length) ? card.steps : DEFAULT_STEPS;

  var idxState = React.useState(0);
  var stepIdx = idxState[0];
  var setStepIdx = idxState[1];
  var dataState = React.useState({});
  var data = dataState[0];
  var setData = dataState[1];
  var stepsState = React.useState(rawSteps);
  var steps = stepsState[0];
  var setSteps = stepsState[1];
  var saveState = React.useState(null);
  var saveId = saveState[0];
  var setSaveId = saveState[1];
  var readyState = React.useState(false);
  var ready = readyState[0];
  var setReady = readyState[1];
  var errState = React.useState('');
  var err = errState[0];
  var setErr = errState[1];
  var creatingState = React.useState(false);
  var creating = creatingState[0];
  var setCreating = creatingState[1];

  var step = steps[stepIdx] || null;
  var isLast = stepIdx >= steps.length - 1;

  // ---------- 建档 + 续草稿（等价 ui_cards.js:109-133 + continueSave）----------
  // P10·A2：新建档先照桌面 :110 起名（promptOpen 文案逐字）；
  //   取消 / 空串 ⇒ 用默认名继续（偏离桌面「取消即中止」，理由是移动端不许卡住建档，
  //   已入报告【改动】自报）。
  React.useEffect(function () {
    if (!cardId || !card) return;
    var cancelled = false;
    (async function () {
      try {
        var resume = CF.findResumable(cardId, Saves.listByCard(cardId), Saves.load);
        var sid = null;
        var draft = null;
        if (resume) { sid = resume.saveId; draft = resume.draft; }
        else {
          var displayName = Saves.getNextDefaultName(cardId);
          var name = await StoryStore.promptOpen('给这个存档起个名字：', displayName);
          if (cancelled) return;
          var finalName = (name == null || String(name).trim() === '') ? displayName : String(name).trim();
          sid = Saves.create(cardId, finalName);
        }
        if (cancelled) return;
        if (!sid) { setErr('建档失败：卡带不存在'); return; }
        if (!GameState.loadFromSave(cardId, sid)) { setErr('装载新档失败'); return; }
        var draftData = (draft && draft.data) ? draft.data : {};
        var st = CF.filterSteps(
          (card && Array.isArray(card.steps) && card.steps.length) ? card : { steps: DEFAULT_STEPS },
          draftData
        );
        if (!st.length) st = DEFAULT_STEPS;
        setSteps(st);
        setData(draftData);
        if (draft) setStepIdx(Math.max(0, Math.min(draft.index || 0, st.length - 1)));
        setSaveId(sid);
        setReady(true);
      } catch (e) {
        if (!cancelled) setErr('创建失败：' + (e && e.message ? e.message : String(e)));
      }
    })();
    return function () { cancelled = true; };
    // 依赖只用 cardId：导入卡的 card 对象每次渲染都是新引用（getAllCards 深拷贝出口），
    // 若把 card 放进依赖会让本 effect 每帧重跑、反复建档。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  // 表单默认值同步（对齐 renderForm:756-763）：fallback 落到 data，摘要/落档才带得上
  React.useEffect(function () {
    if (!ready) return;
    var s = steps[stepIdx];
    if (!s || s.type !== 'form') return;
    var pool = CF.poolOf(card, s);
    setData(function (prev) {
      var next = Object.assign({}, prev);
      CF.syncDefaults(s, next, !!pool);
      return shallowEqObj(next, prev) ? prev : next;
    });
  }, [ready, stepIdx, steps]);

  function setField(key, v) {
    setData(function (prev) {
      var next = Object.assign({}, prev);
      next[key] = v;
      return next;
    });
  }

  // 数值输入（对齐 onNumberInput:792-799）
  function onNumberChange(key, raw) {
    if (raw === '' || raw === '-' || raw === '.') { setField(key, ''); return; }
    var v = Number(raw);
    if (!isNaN(v)) setField(key, v);
  }
  // 失焦归一（对齐 onNumberBlur:800-817）
  function onNumberBlur(key, fd) {
    var v = data[key];
    if (v === '' || v == null) { setField(key, ''); return; }
    var num = Number(v);
    if (isNaN(num)) { setField(key, ''); return; }
    setField(key, CF.clampNumber(num, fd.min, fd.max));
  }
  // 多选（对齐 toggleMulti:980-986）
  function onToggleMulti(stepObj, id) {
    var key = stepObj.key || stepObj.id;
    var min = stepObj.min != null ? stepObj.min : 0;
    var max = stepObj.max != null ? stepObj.max : 99;
    var next = Object.assign({}, data);
    var res = CF.toggleMulti(next, key, id, min, max);
    if (!res.ok) { Platform.ui.toast(msgOf(res), { type: 'warn' }); return; }
    setData(next);
    CF.saveDraft(cardId, saveId, stepIdx, next, steps.length);
  }
  function onSelect(stepObj, oid) {
    setField(stepObj.key || stepObj.id, oid);
    CF.saveDraft(cardId, saveId, stepIdx, Object.assign({}, data, keyPatch(stepObj, oid)), steps.length);
  }
  function keyPatch(stepObj, oid) {
    var p = {};
    p[stepObj.key || stepObj.id] = oid;
    return p;
  }

  function prev() {
    if (stepIdx <= 0) return;
    setErr('');
    var ni = stepIdx - 1;
    setStepIdx(ni);
    CF.saveDraft(cardId, saveId, ni, data, steps.length);
  }

  // 下一步 / 完成（对齐 next:1023-1031 + validateCurrent）
  function next() {
    if (!step || creating) return;
    setErr('');
    var res = CF.validateStep(card, step, data);
    if (!res.ok) {
      if (res.code === 'POOL_UNDER') {
        Platform.ui.confirmAsync(msgOf(res)).then(function (ok) { if (ok) advance(); });
        return;
      }
      Platform.ui.toast(msgOf(res), { type: 'warn' });
      return;
    }
    advance();
  }
  function advance() {
    var ni = CF.nextIndex(steps, stepIdx, data);
    if (ni === 'finish') { finish(); return; }
    CF.saveDraft(cardId, saveId, ni, data, steps.length);
    setStepIdx(ni);
  }

  // 完成（对齐 finish:1035-1046；P9·S7 起先进人设屏再进游戏）
  function finish() {
    if (creating || !saveId) return;
    setCreating(true);
    setErr('');
    try {
      GameState.playerData = CF.buildPlayerData(data);
      var pname = (typeof Alias !== 'undefined' && Alias.get) ? Alias.get(GameState.playerData, 'name') : GameState.playerData.name;
      if (pname && GameState.currentSaveId) Saves.setPlayerName(cardId, saveId, String(pname));
      GameState._gameTime = GameState._buildInitialGameTime(GameState.currentCard, GameState.playerData);
      CF.clearDraft(cardId, saveId);
      GameState.persist();
      // P9·S7：先进人设屏（对齐桌面 engine/story.js _enterPortrait:663-677），确认或
      //   跳过后在 cb 里进游戏起回合。「跳过」分支在 UI_Portrait.skip（Portrait.fallback
      //   兜底，未删）；确认分支在 UI_Portrait.confirm。旧「直接 fallback + 进游戏」路径移除。
      UI_Portrait.start(GameState.playerData, function (result) {
        var portrait = (result && result.portrait) ? result.portrait : result;
        GameState.playerData.portrait = portrait;
        try { Portrait.save(portrait); } catch (e) { /* */ }
        try { GameState.invalidateCache(); } catch (e) { /* */ }
        try { GameState.persist(); } catch (e) { /* */ }
        try { if (typeof Snapshots !== 'undefined') Snapshots.push('init'); } catch (e) { /* */ }
        // H3-R2：换档先清掉上一档残留叙事流再进叙事页（StoryScreen 挂载效应见 :71-86）
        try { Platform.ui.clearStory(); } catch (e) {}
        try { Platform.ui.renderGame(); } catch (e) {}
        nav.navigate('story');
        if (!GameState.chatHistory.length && typeof StoryLoop !== 'undefined') {
          try { StoryLoop.start(); } catch (e) {}
        }
      });
    } catch (e) {
      setErr('创建失败：' + (e && e.message ? e.message : String(e)));
      setCreating(false);
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
      cardLine: { fontSize: f.xs, color: c.faint, letterSpacing: 2, marginBottom: 4 },
      stepLine: { fontSize: f.xs, color: c.muted, letterSpacing: 2, marginBottom: 2 },
      stepTitle: { fontFamily: fonts.kai, fontSize: f.xl, color: c.ink, marginTop: 8, marginBottom: 6 },
      guide: { fontSize: f.sm, color: c.muted, lineHeight: Math.round(f.sm * 1.7), marginBottom: 14 },
      fieldLabel: { fontSize: f.sm, color: c.ink2, marginBottom: 6 },
      input: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        backgroundColor: c.panel, color: c.text, fontSize: f.base,
        paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14
      },
      fieldWrap: { marginBottom: 14 },
      poolBar: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        backgroundColor: c.panel, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12
      },
      poolLabel: { fontSize: f.sm, color: c.ink2 },
      poolNum: { color: c.ink, fontWeight: '600' },
      poolNumOver: { color: c.danger, fontWeight: '600' },
      poolRemain: { color: c.faint, fontSize: f.xs },
      poolBase: { fontSize: f.xs, color: c.faint, marginTop: 2 },
      option: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        backgroundColor: c.panel, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8
      },
      optionSelected: { borderColor: c.seal, backgroundColor: c.card },
      optionName: { fontSize: f.base, color: c.text },
      optionNameSelected: { color: c.seal, fontWeight: '600' },
      optionDesc: { fontSize: f.xs, color: c.muted, marginTop: 4, lineHeight: Math.round(f.xs * 1.6) },
      quizHint: { fontSize: f.sm, color: c.muted, textAlign: 'center', letterSpacing: 2, marginBottom: 12 },
      multiHint: { fontSize: f.xs, color: c.muted, marginBottom: 10 },
      summaryBox: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.md,
        backgroundColor: c.panel, padding: 14, marginBottom: 14
      },
      summaryLine: { fontSize: f.sm, color: c.text, lineHeight: Math.round(f.sm * 1.8) },
      summaryKey: { color: c.muted },
      // P6·S5：时间线参考块（对齐桌面 index.html:528-534 的 .cf-calendar-*）
      calWrap: {
        marginTop: 20, backgroundColor: c.panel, borderWidth: 1, borderColor: c.hairStrong,
        borderRadius: tk.radius.md, paddingHorizontal: 16, paddingVertical: 14
      },
      calTitle: {
        fontSize: f.sm, color: c.muted, marginBottom: 12, paddingBottom: 8,
        borderBottomWidth: 1, borderBottomColor: c.hairStrong
      },
      calSection: { marginBottom: 14 },
      calLabel: { fontSize: f.xs, color: c.faint, letterSpacing: 1, marginBottom: 6 },
      calLine: { fontSize: f.sm, color: c.ink2, lineHeight: Math.round(f.sm * 1.7) },
      calStrong: { color: c.ink, fontWeight: '600' },
      calTime: { color: c.muted },
      calMuted: { fontSize: f.sm, color: c.muted, lineHeight: Math.round(f.sm * 1.7) },
      unknown: { fontSize: f.sm, color: c.danger, lineHeight: Math.round(f.sm * 1.7), marginVertical: 12 },
      err: { fontSize: f.sm, color: c.danger, marginBottom: 10 },
      btnRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
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
      empty: { fontSize: f.sm, color: c.muted, lineHeight: Math.round(f.sm * 1.7), paddingVertical: 20 }
    });
  }, [tk, insets]);

  // ---------- 渲染：步骤 ----------

  function renderForm(s) {
    var pool = CF.poolOf(card, s);
    var isAttr = !!pool;
    var allocated = pool ? CF.calcAllocated(s, data, pool) : 0;
    var remain = pool ? pool.total - allocated : 0;
    return (
      <View>
        {pool ? (
          <View style={styles.poolBar}>
            <Text style={styles.poolLabel}>
              {'已分配：'}
              <Text style={allocated > pool.total ? styles.poolNumOver : styles.poolNum}>{String(allocated)}</Text>
              {' / ' + pool.total + ' '}
              <Text style={styles.poolRemain}>{'（剩余 ' + remain + '）'}</Text>
            </Text>
            <Text style={styles.poolBase}>{'每项基础 ' + (pool.base != null ? pool.base : 0) + ' 点'}</Text>
          </View>
        ) : null}
        {(s.fields || []).map(function (fd) {
          var key = fd.key;
          var val = data[key];
          // P23·①：显式清空（''）不回填默认值，否则删掉默认数字后没法重输
          var shown = CF.shownValue(fd, val, isAttr);
          return (
            <View key={key} style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>{(fd.label || key) + (fd.required ? '（必填）' : '')}</Text>
              {fd.type === 'number' ? (
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={shown === '' || shown == null ? '' : String(shown)}
                  onChangeText={function (v) { onNumberChange(key, v); }}
                  onBlur={function () { onNumberBlur(key, fd); }}
                  placeholder={fd.placeholder || fd.label || key}
                  placeholderTextColor={c.faint}
                />
              ) : fd.type === 'choice' ? (
                <View>
                  {(fd.options || []).map(function (o) {
                    var sel = (val != null && val !== '') ? (val === o.id) : (shown === o.id);
                    return (
                      <TouchableOpacity
                        key={String(o.id)}
                        style={[styles.option, sel ? styles.optionSelected : null]}
                        activeOpacity={0.6}
                        onPress={function () { setField(key, o.id); CF.saveDraft(cardId, saveId, stepIdx, Object.assign({}, data, keyPatch({ key: key }, o.id)), steps.length); }}
                      >
                        <Text style={[styles.optionName, sel ? styles.optionNameSelected : null]}>
                          {(o.label || o.name || o.id)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <TextInput
                  style={styles.input}
                  value={shown === '' || shown == null ? '' : String(shown)}
                  onChangeText={function (v) { setField(key, v); }}
                  placeholder={fd.placeholder || fd.label || key}
                  placeholderTextColor={c.faint}
                />
              )}
            </View>
          );
        })}
      </View>
    );
  }

  // ---------- 渲染：时间线参考（form 步 showCalendar，桌面 story.js:838-893）----------
  // 出生年判定对齐桌面 updateCalendar:882-893（字段 key/label 命中，或
  // 任意落在 1800-2200 的数值）；随 data 变更自动重渲染（等价桌面
  // updateCalendar 的输入联动）。
  function calBirthYear(s) {
    var by = null;
    (s.fields || []).forEach(function (fd) {
      var v = data[fd.key];
      if (v === undefined || v === null || v === '') return;
      if (fd.key === 'birth_year' || fd.key === 'birthYear' || fd.label === '出生年份') by = v;
      else if (typeof v === 'number' && v >= 1800 && v <= 2200) by = v;
    });
    return by;
  }

  function renderCalendar(s) {
    var by = calBirthYear(s);
    var wb = (card && card.worldbook) || {};
    var events = (wb.timeline && wb.timeline.official) || [];
    var npcs = (wb.npcs || []).filter(function (n) { return n && n.born; });
    var era = (card && card.game) ? card.game.eraRange : null;
    var eS = (Array.isArray(era) && era.length) ? (Array.isArray(era[0]) ? era[0][0] : era[0]) : 1990;
    var eE = (Array.isArray(era) && era.length) ? (Array.isArray(era[era.length - 1]) ? era[era.length - 1][1] : (era[1] != null ? era[1] : era[0])) : 2000;

    var sections = [];

    // 你的情况（对齐 calendarBodyHtml:851-864）
    var mine = [];
    if (by) {
      var byNum = parseInt(by, 10) || 0;
      var same = [], near = [];
      npcs.forEach(function (n) {
        var d = parseInt(n.born, 10) - byNum;
        if (d === 0) same.push(n.name);
        else if (Math.abs(d) <= 2) near.push(n.name + '（' + (d > 0 ? '小' + d + '届' : '大' + (-d) + '届') + '）');
      });
      mine.push(
        <Text key="my" style={styles.calLine}>
          {'出生年：'}<Text style={styles.calStrong}>{String(by)}</Text>
          {'，11 岁入学约在 '}<Text style={styles.calStrong}>{String(byNum + 11)}</Text>{' 年'}
        </Text>
      );
      if (same.length) mine.push(<Text key="sg" style={styles.calLine}>{'同届：' + same.join('、')}</Text>);
      if (near.length) mine.push(<Text key="nr" style={styles.calLine}>{'同期：' + near.join('、')}</Text>);
    } else {
      mine.push(<Text key="no" style={styles.calMuted}>{'填写出生年份后，这里会显示你和哪些人物同届。'}</Text>);
    }
    sections.push(
      <View key="mine" style={styles.calSection}>
        <Text style={styles.calLabel}>{'你的情况'}</Text>
        {mine}
      </View>
    );

    // 时代范围（:865）
    sections.push(
      <View key="era" style={styles.calSection}>
        <Text style={styles.calLabel}>{'时代范围'}</Text>
        <Text style={styles.calLine}>{eS + ' — ' + eE}</Text>
      </View>
    );

    // 关键事件（:866-872，按 time 内首位四位年份升序）
    if (events.length) {
      var evs = events.slice().sort(function (a, b) {
        var am = String(a.time || '').match(/\d{4}/);
        var bm = String(b.time || '').match(/\d{4}/);
        return (parseInt(am && am[0], 10) || 0) - (parseInt(bm && bm[0], 10) || 0);
      });
      sections.push(
        <View key="ev" style={styles.calSection}>
          <Text style={styles.calLabel}>{'关键事件'}</Text>
          {evs.map(function (ev, i) {
            return (
              <Text key={i} style={styles.calLine}>
                <Text style={styles.calTime}>{ev.time || '?'}</Text>{' · ' + (ev.event || '')}
              </Text>
            );
          })}
        </View>
      );
    }

    // 人物出生年（:873-879，按 born 升序取前 20）
    if (npcs.length) {
      var ns = npcs.slice().sort(function (a, b) { return (a.born || 0) - (b.born || 0); }).slice(0, 20);
      sections.push(
        <View key="npcs" style={styles.calSection}>
          <Text style={styles.calLabel}>{'人物出生年'}</Text>
          {ns.map(function (n, i) {
            return (
              <Text key={i} style={styles.calLine}>
                <Text style={styles.calTime}>{String(n.born)}</Text>{' · ' + (n.name || '')}
              </Text>
            );
          })}
        </View>
      );
    }

    return (
      <View style={styles.calWrap}>
        <Text style={styles.calTitle}>{'📅 时间线参考'}</Text>
        {sections}
      </View>
    );
  }

  function renderOptions(s, quiz, multi) {
    var key = s.key || s.id;
    var val = data[key];
    var cur = multi ? (val || []) : null;
    var min = s.min != null ? s.min : 0;
    var max = s.max != null ? s.max : 99;
    return (
      <View>
        {multi ? (
          <Text style={quiz ? styles.quizHint : styles.multiHint}>
            {'已选 ' + cur.length + ' / 最多 ' + max + (min ? ' · 至少 ' + min : '')}
          </Text>
        ) : null}
        {(s.options || []).map(function (o) {
          var sel = multi ? (cur.indexOf(o.id) >= 0) : (val === o.id);
          return (
            <TouchableOpacity
              key={String(o.id)}
              style={[styles.option, sel ? styles.optionSelected : null]}
              activeOpacity={0.6}
              onPress={function () {
                if (multi) onToggleMulti(s, o.id);
                else onSelect(s, o.id);
              }}
            >
              <Text style={[styles.optionName, sel ? styles.optionNameSelected : null]}>
                {(o.name || o.label || o.id)}
              </Text>
              {o.desc ? <Text style={styles.optionDesc}>{o.desc}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  function renderSummary() {
    var entries = CF.summaryEntries(card, data);
    if (!entries.length) {
      return <Text style={styles.summaryLine}>{'（没有填写任何内容）'}</Text>;
    }
    return (
      <View style={styles.summaryBox}>
        {entries.map(function (e, i) {
          return (
            <Text key={i} style={styles.summaryLine}>
              <Text style={styles.summaryKey}>{e.k + '：'}</Text>
              {e.v}
            </Text>
          );
        })}
      </View>
    );
  }

  function renderBody() {
    if (!step) return null;
    switch (step.type) {
      case 'form':
        // P6·S5：form 步可带 showCalendar（桌面 story.js:728 先 renderForm
        // 再按 showCalendar 追加 renderCalendar），补时间线参考块。
        return (
          <View>
            {renderForm(step)}
            {step.showCalendar ? renderCalendar(step) : null}
          </View>
        );
      case 'select':
        return step.renderMode === 'quiz'
          ? (
            <View>
              <Text style={styles.quizHint}>{'— 请凭直觉选择 —'}</Text>
              {renderOptions(step, true, false)}
            </View>
          )
          : renderOptions(step, false, false);
      case 'multi-select':
        return step.renderMode === 'quiz'
          ? (
            <View>
              <Text style={styles.quizHint}>{'— 请凭直觉选择 —'}</Text>
              {renderOptions(step, true, true)}
            </View>
          )
          : renderOptions(step, false, true);
      case 'summary': return renderSummary();
      default:
        return <Text style={styles.unknown}>{'（未知步骤类型：' + String(step.type) + '）'}</Text>;
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.headerRow}>
        <Text style={styles.back} onPress={function () { nav.goBack(); }}>{'← 返回'}</Text>
        <Text style={styles.title}>{'新建存档'}</Text>
        <View style={styles.headerPad} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {!card ? (
          <Text style={styles.empty}>{EmptyTexts.NO_CARDS}</Text>
        ) : (
          <View>
            <Text style={styles.cardLine}>{'卡带 · ' + (card.cardName || cardId)}</Text>
            <Text style={styles.stepLine}>{'第 ' + (stepIdx + 1) + ' / ' + steps.length + ' 步'}</Text>
            {step ? <Text style={styles.stepTitle}>{step.title || step.id || ''}</Text> : null}
            {step && step.guide ? <Text style={styles.guide}>{step.guide}</Text> : null}

            {ready ? renderBody() : null}

            {err ? <Text style={styles.err}>{err}</Text> : null}

            <View style={styles.btnRow}>
              {stepIdx > 0 ? (
                <TouchableOpacity style={styles.ghostBtn} activeOpacity={0.6} onPress={prev}>
                  <Text style={styles.ghostBtnText}>{'上一步'}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.primaryBtn, (creating || !ready) ? styles.btnDisabled : null]}
                activeOpacity={0.6} disabled={creating || !ready}
                onPress={next}
              >
                <Text style={styles.primaryBtnText}>{isLast ? (creating ? '创建中…' : '完成') : '下一步'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

module.exports = { CreateScreen: CreateScreen };
