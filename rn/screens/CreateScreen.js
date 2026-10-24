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
// P77b：创角页的输入框也要避开输入法（与人设页同一套做法）。
//   症状：填姓名/属性的数字框在页面下半部时，键盘一弹就把框整块盖住，
//   页面也不上移（targetSdk 36 edge-to-edge 后 windowSoftInputMode 不再缩窗口，
//   判据见 rn/use_keyboard_inset.js 的注释）。
var useKeyboardInset = require('../use_keyboard_inset.js').useKeyboardInset;
var Model = require('../home_model.js');
var CF = require('../create_flow_model.js');
// C4：技能分配的唯一计算入口（UI 只渲染，不自行算预算/上限）
var SF = null;
try { SF = require('../../engine/core/skill_flow.js'); } catch (e) { SF = null; }
// P10·A2：建档前起名走 promptOpen（OverlayHost.PromptModal，根层已挂；Promise<string|null>）
var StoryStore = require('../story_store.js');
// P10·A7：空态文案单一来源（逐字照桌面 ui_cards.js:38）
var EmptyTexts = require('../empty_texts.js');
// P57-B：全局背景渲染层统一挂载（用户裁决：其余屏一起挂上；同 HomeScreen/StoryScreen 挂法）
var BackgroundLayer = require('../components/BackgroundLayer.js').BackgroundLayer;

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
    case 'QUIZ_MISS': return '还有 ' + res.miss + ' 道题没选';
    case 'MULTI_MAX': return '最多选 ' + res.max + ' 项';
    default: return (res && res.message) ? res.message : '';
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

  // P77b：键盘高度 + 聚焦即滚进可视区（判据与做法同 rn/screens/PortraitScreen.js）
  var kbInset = useKeyboardInset();
  var scrollRef = React.useRef(null);
  var fieldY = React.useRef({});
  function rememberY(key) {
    return function (e) {
      var y = e && e.nativeEvent && e.nativeEvent.layout ? e.nativeEvent.layout.y : 0;
      if (y > 0) fieldY.current[key] = y;
    };
  }
  function revealField(key) {
    var y = fieldY.current[key];
    var sv = scrollRef.current;
    if (y == null || !sv || !sv.scrollTo) return;
    try { sv.scrollTo({ y: Math.max(0, y - 12), animated: true }); } catch (e1) { /* */ }
  }
  function focusTo(key) {
    return function () {
      revealField(key);
      setTimeout(function () { revealField(key); }, 260);
    };
  }

  // 数据源：当前主页卡（rn/home_model.js:19/51 的 setHomeCardId 链）
  var picked = Model.getHomePicked();
  var cardId = picked ? picked.id : null;
  var card = picked ? picked.card : null;
  var rawSteps = (card && Array.isArray(card.steps) && card.steps.length)
    ? ((CF.prepareSteps(card).steps) || card.steps)
    : DEFAULT_STEPS;

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
        var prep = (card && Array.isArray(card.steps) && card.steps.length)
          ? CF.prepareSteps(card)
          : { steps: DEFAULT_STEPS };
        var st = CF.filterSteps(
          { steps: prep.steps || DEFAULT_STEPS },
          draftData
        );
        if (!st.length) st = DEFAULT_STEPS;
        setSteps(st);
        setData(draftData);
        if (draft) {
          // C4：卡带步骤增删后旧草稿的 index 可能对不上；形状变了就从头走，但保留已填内容
          var sameShape = (draft.totalSteps == null) || (draft.totalSteps === st.length);
          setStepIdx(sameShape ? Math.max(0, Math.min(draft.index || 0, st.length - 1)) : 0);
        }
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
    // A2：默认值也按统一定义（card.attributes 优先）算，避免显示值与点数口径不一致
    var dmap = CF.isAttrStep(s) ? CF.defMapOf(card, s) : null;
    setData(function (prev) {
      var next = Object.assign({}, prev);
      CF.syncDefaults(s, next, !!pool, dmap);
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
  //   A2：属性步的上下限取统一定义（card.attributes 权威），字段值只兜底
  function onNumberBlur(key, fd) {
    var v = data[key];
    if (v === '' || v == null) { setField(key, ''); return; }
    var num = Number(v);
    if (isNaN(num)) { setField(key, ''); return; }
    var d = null;
    if (fd && fd.key && CF.isAttrStep(steps[stepIdx])) {
      var dm = CF.defMapOf(card, steps[stepIdx]);
      var bk = String(fd.key).replace(/^(attr_)+/, '');
      d = dm ? (dm[fd.key] || (bk ? dm[bk] : null) || null) : null;
    }
    var mn = (d && d.min != null) ? d.min : (fd ? fd.min : null);
    var mx = (d && d.max != null) ? d.max : (fd ? fd.max : null);
    setField(key, CF.clampNumber(num, mn, mx));
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
  // P67 问卷：答案存 data['__picks_' + quizId]，判卷在 engine/creation_quiz.js
  function onPickQuiz(stepObj, quizId, qi, outcome) {
    var next = Object.assign({}, data);
    CF.setQuizPick(next, quizId, qi, outcome);
    setData(next);
    CF.saveDraft(cardId, saveId, stepIdx, next, steps.length);
  }
  // P72·W5：都不像我 → 自己写（和桌面 CreateFlow.pickQuizCustom 同口径：
  //   先本地词表映射（确定性）；映射不上再问一次 AI（允许回答「都不像」）；
  //   都归不到 ⇒ 这一题记为「自定义作答」：算答过、但不投票，
  //   并且**清掉这一题之前点过的选项**，否则旧选项会替玩家投一票 = 强行归类）
  function classifyQuizCustomByAI(text, quiz, outs) {
    var api = (typeof ApiClient !== 'undefined' && ApiClient) ? ApiClient
      : ((typeof globalThis !== 'undefined' && globalThis.ApiClient) ? globalThis.ApiClient : null);
    if (!api || typeof api.chat !== 'function' || !outs.length) return Promise.resolve(null);
    var sys = '你是「开局问卷」的归类器，任务是判断玩家的一句话在**语义上实质等同于**下面哪一档。'
      + '只有当这句话讲的正是某一档在做的事，才回答该档 id；'
      + '如果只是情绪、气氛或处境相近，或者需要你替玩家解释一层才能挂上，就回答 none。'
      + '宁可回答 none，也不要为了给答案而类比。只输出一行 JSON：{"outcome":"<id 或 none>"}。\n'
      + '可选结论：\n' + outs.map(function (o) { return '- ' + o.id + '：' + o.name + (o.desc ? '（' + o.desc + '）' : ''); }).join('\n');
    var call = api.chat([
      { role: 'system', content: sys },
      { role: 'user', content: '玩家说：' + text }
    ], { temperature: 0, max_tokens: 60 });
    var timeout = new Promise(function (res) { setTimeout(function () { res(null); }, 8000); });
    return Promise.race([call, timeout]).then(function (resp) {
      if (!resp) return null;
      var content = '';
      if (typeof resp === 'string') content = resp;
      else if (resp.content) content = resp.content;
      else if (resp.choices && resp.choices[0] && resp.choices[0].message) content = resp.choices[0].message.content;
      var m = String(content || '').match(/"outcome"\s*:\s*"?([^",}\s]+)"?/);
      var id = m ? m[1] : '';
      if (!id || /^(none|null|unknown|其他|无)$/i.test(id)) return null;
      return outs.filter(function (o) { return o.id === id; })[0] ? id : null;
    }).catch(function () { return null; });
  }

  function onCustomQuiz(stepObj, quiz, qi) {
    var Q = (typeof CreationQuiz !== 'undefined' && CreationQuiz) ? CreationQuiz : null;
    if (!Q) return;
    Platform.ui.promptAsync('都不像我？用你自己的话说一句', '', {
      placeholder: '例：我不太会说话，但答应的事一定做到',
      okText: '就这样',
      maxLength: 120
    }).then(function (text) {
      var t = (text == null) ? '' : String(text).trim();
      if (!t) return;
      var bag = Object.assign({}, (data && data['__custom_' + quiz.id]) || {});
      bag[qi] = t;
      var local = Q.mapCustom ? Q.mapCustom(t, quiz.outcomes) : null;
      return classifyQuizCustomByAI(t, quiz, quiz.outcomes || []).then(function (aiId) {
        var next = Object.assign({}, data);
        next['__custom_' + quiz.id] = bag;
        function applyOutcome(outcome) {
          if (outcome) {
            CF.setQuizPick(next, quiz.id, qi, outcome);
            var hit = (quiz.outcomes || []).filter(function (o) { return o && o.id === outcome; })[0];
            var label = (hit && hit.name) || Q.suggestLabel(t, quiz.outcomes) || outcome;
            setData(next);
            CF.saveDraft(cardId, saveId, stepIdx, next, steps.length);
            Platform.ui.toast('按你的说法，这条算「' + label + '」', { type: 'success' });
          } else {
            CF.setQuizPick(next, quiz.id, qi, ''); // 清掉旧选项：不能替玩家认下
            setData(next);
            CF.saveDraft(cardId, saveId, stepIdx, next, steps.length);
            Platform.ui.toast('这句归不到任何结论：这一题记为「自定义作答」，不投票、也不算成别的选项', { type: 'warn' });
          }
        }
        if (local) { applyOutcome(local); return; }
        // AI 的理解只是「一种理解」，要玩家自己确认；否则模型把「我想吃面」解释成
        // 「制造混乱」也会被硬记成投票——那还是强行归类，只是换了执行者。
        if (!aiId) { applyOutcome(null); return; }
        var aiHit = (quiz.outcomes || []).filter(function (o) { return o && o.id === aiId; })[0];
        var aiName = (aiHit && aiHit.name) || aiId;
        return Platform.ui.confirmAsync(
          'AI 把你这句理解为「' + aiName + '」。要按这个记吗？\n（选「不归类」就记为自定义作答：算答过，但不投票）',
          { okText: '按这个记', cancelText: '不归类' }
        ).then(function (ok) {
          applyOutcome(ok ? aiId : null);
        }).catch(function () { applyOutcome(null); });
      });
    }).catch(function () { /* 取消/异常：什么都不动 */ });
  }
  function keyPatch(stepObj, oid) {
    var p = {};
    p[stepObj.key || stepObj.id] = oid;
    return p;
  }

  // ---------- P47·批次2 / P75：天命系统（属性 N 选一 + 让 AI 现定）----------
  //   卡带 worldbook.destiny 启用时，创角页顶部出现「掷天命」面板：
  //   点一次 → Destiny.rollBatch 生成 N 组 → 选一组 → 属性写进创角 data
  //   （buildPlayerData 深拷贝 data ⇒ 落进 playerData）；选完面板折叠显示最终属性。
  //   P75：卡带没配天命时，玩家也能点「让 AI 定天命」现场生成一套（只活在本次创角）。
  var destinySetsState = React.useState(null);
  var destinySets = destinySetsState[0];
  var setDestinySets = destinySetsState[1];
  var destinyPickState = React.useState(null);
  var destinyPicked = destinyPickState[0];
  var setDestinyPicked = destinyPickState[1];
  var destinyDefState = React.useState(null);
  var destinyDef = destinyDefState[0];
  var setDestinyDef = destinyDefState[1];
  var destinyAIState = React.useState('idle');
  var destinyAI = destinyAIState[0];
  var setDestinyAI = destinyAIState[1];

  var destinyOn = false;
  var destinyCardAttrs = [];
  try {
    if (typeof Destiny !== 'undefined' && Destiny) {
      destinyCardAttrs = Destiny.attributes(card);
      var dcfg = (typeof Destiny.config === 'function') ? Destiny.config(card) : null;
      var dOff = !!(dcfg && dcfg.enabled === false);
      var attrStep = !!(step && step.fields && step.fields.length && step.fields.every(function (f) {
        return f && (f.type === 'number' || String(f.key || '').indexOf('attr_') === 0);
      }));
      destinyOn = !dOff && !!(Destiny.enabled(card) || destinyDef || attrStep);
    }
  } catch (e) { destinyOn = false; }
  var destinyAttrs = destinyDef ? destinyDef.attributes : destinyCardAttrs;

  function destinySetCount() {
    if (destinyDef) return destinyDef.sets;
    try { return Destiny.defaultSets(card); } catch (e) { return 5; }
  }

  function onRollDestiny() {
    if (creating) return;
    try {
      setDestinyPicked(null);
      setDestinySets(Destiny.rollBatch(destinyAttrs, destinySetCount()));
    } catch (e) {
      Platform.ui.toast('掷天命失败：' + (e && e.message ? e.message : String(e)), { type: 'error' });
    }
  }

  function onPickDestiny(set, i) {
    if (creating || !set || !set.values) return;
    setDestinyPicked(set);
    // 阶段 A 补充：与桌面 pickDestiny 同口径落 _destiny 锁（此前只写属性值，
    // 导致 Android 天命锁、提示词「（天命）」标注、池排除全部失效）。
    var next = CF.applyDestinyPick(data, destinyAttrs, set, i);
    setData(next);
    CF.saveDraft(cardId, saveId, stepIdx, next, steps.length);
  }

  // P75：让 AI 按题材现定一套属性表（返回 JSON 走 Destiny.normalizeDefinition 校验）
  function buildDestinyPrompt() {
    var wb = (card && card.worldbook) || {};
    var fields = (step && step.fields && step.fields.length) ? step.fields : [];
    var lines = [];
    lines.push('你在为一个中文文字冒险游戏设计「创角属性表」（天命系统：一次掷多组，玩家挑一组）。');
    lines.push('题材：' + ((card && (card.title || card.name)) || '未命名') + (wb.desc ? '｜' + String(wb.desc).slice(0, 200) : ''));
    if (fields.length) {
      lines.push('这个卡带的创角属性步骤已有这些字段，尽量沿用同名 key（也可补新的）：');
      lines.push(fields.map(function (f) { return (f.key || '') + '=' + (f.name || f.label || ''); }).join(', '));
    }
    lines.push('');
    lines.push('规则：');
    lines.push('- 属性项数自定：3-8 项都合理，按题材决定，不要硬套「六维」');
    lines.push('- 每项给 key（字母开头，只含字母数字下划线）、name（中文名）、formula（掷骰公式）、可选 min/max');
    lines.push('- formula 支持：3d6 / 4d6kh3（掷4取高3）/ 4d6dl1 / 4d6r1 / d20 / (2d6+6)*5 / 3d6*5，可组合 + - * 与括号');
    lines.push('- sets：一次掷几组供玩家挑，按属性波动给 3-10 组');
    lines.push('');
    lines.push('只输出一个 JSON 对象，不要解释、不要代码块：');
    lines.push('{"sets":5,"attributes":[{"key":"str","name":"力量","formula":"4d6kh3","min":3,"max":18}]}');
    return lines.join('\n');
  }

  function parseDestinyDef(content) {
    var s = String(content == null ? '' : content).trim();
    s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return { ok: false, reason: '没找到 JSON' };
    var obj;
    try { obj = JSON.parse(s.slice(a, b + 1)); } catch (e) { return { ok: false, reason: 'JSON 解析失败' }; }
    if (typeof Destiny === 'undefined' || !Destiny || typeof Destiny.normalizeDefinition !== 'function') {
      return { ok: false, reason: 'Destiny 未加载' };
    }
    return Destiny.normalizeDefinition(obj);
  }

  function onAIDestiny() {
    if (creating || destinyAI === 'loading') return;
    var api = (typeof ApiClient !== 'undefined' && ApiClient) ? ApiClient
      : ((typeof globalThis !== 'undefined' && globalThis.ApiClient) ? globalThis.ApiClient : null);
    if (!api || typeof api.chat !== 'function') {
      Platform.ui.toast('没有可用的 AI 接口，无法让 AI 定天命', { type: 'warn' });
      return;
    }
    setDestinyAI('loading');
    var timeout = new Promise(function (res) { setTimeout(function () { res(null); }, 30000); });
    Promise.race([
      api.chat([{ role: 'user', content: buildDestinyPrompt() }], { max_tokens: 900, temperature: 0.7 }),
      timeout
    ]).then(function (resp) {
      setDestinyAI('idle');
      if (!resp) { Platform.ui.toast('AI 没在 30 秒内回来，稍后再试', { type: 'warn' }); return; }
      var content = (typeof resp === 'string') ? resp : (resp.content || '');
      var def = parseDestinyDef(content);
      if (!def || !def.ok) {
        Platform.ui.toast('AI 给的属性表不可用：' + ((def && def.reason) || '解析失败'), { type: 'warn' });
        return;
      }
      setDestinyDef({ attributes: def.attributes, sets: def.sets });
      setDestinySets(null);
      setDestinyPicked(null);
      Platform.ui.toast('天命已由 AI 现定：' + def.attributes.length + ' 项 × ' + def.sets + ' 组', { type: 'success' });
    }).catch(function (e) {
      setDestinyAI('idle');
      Platform.ui.toast('让 AI 定天命失败：' + (e && e.message ? e.message : String(e)), { type: 'error' });
    });
  }

  function onClearAIDestiny() {
    setDestinyDef(null);
    setDestinySets(null);
    setDestinyPicked(null);
  }

  function destinyLabel(key) {
    for (var i = 0; i < destinyAttrs.length; i++) {
      if (destinyAttrs[i] && destinyAttrs[i].key === key) return destinyAttrs[i].name || key;
    }
    return key;
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
      GameState.playerData = CF.buildPlayerData(data, card);
      // C4：技能初始化（问卷加成已在 buildPlayerData 内完成，这里拿到的就是最终属性）
      var skillStep = null, skillIdx = -1;
      if (SF && SF.hasRules(card)) {
        for (var si = 0; si < steps.length; si++) {
          if (steps[si] && steps[si].type === 'skills') { skillStep = steps[si]; skillIdx = si; break; }
        }
        var sattrs = SF.attrsOf(card, GameState.playerData);
        var scommit = SF.commit(card, sattrs, data.__skillAlloc || {}, skillStep);
        if (!scommit.ok) {
          var ce = (scommit.errors || [])[0];
          Platform.ui.toast(ce ? (ce.message + (ce.path ? '（' + ce.path + '）' : '')) : '技能分配未通过校验', { type: 'warn' });
          if (skillIdx >= 0) {
            CF.saveDraft(cardId, saveId, skillIdx, data, steps.length);
            setStepIdx(skillIdx);
          }
          setCreating(false);
          return;
        }
        if (scommit.skillStats) GameState.playerData.skillStats = scommit.skillStats;
      }
      var pname = (typeof Alias !== 'undefined' && Alias.get) ? Alias.get(GameState.playerData, 'name') : GameState.playerData.name;
      if (pname && GameState.currentSaveId) Saves.setPlayerName(cardId, saveId, String(pname));
      GameState._gameTime = GameState._buildInitialGameTime(GameState.currentCard, GameState.playerData);
      CF.clearDraft(cardId, saveId);
      GameState.persist();
      // C4：人设确认前的技能校验。属性被改过 ⇒ 重算 bonus；不合法则阻止确认，
      //   并把「回到技能步骤」注册给人设屏，避免玩家卡在人设页。
      function validateSkills() {
        if (!SF || !GameState.playerData || !GameState.playerData.skillStats) return { ok: true };
        var a2 = SF.attrsOf(GameState.currentCard, GameState.playerData);
        var r = SF.recalc(GameState.currentCard, a2, GameState.playerData.skillStats, skillStep);
        if (!r.ok) {
          var e = (r.errors || [])[0];
          return {
            ok: false,
            message: (e ? e.message : '技能数值需要调整') + (e && e.path ? '（' + e.path + '）' : '')
              + '\n属性变化后技能加成需要重算，当前分配不再合法。'
          };
        }
        if (r.changed) GameState.playerData.skillStats = r.skillStats;
        return { ok: true };
      }
      if (UI_Portrait && typeof UI_Portrait.setSkillReturn === 'function') {
        UI_Portrait.setSkillReturn(function () {
          CF.saveDraft(cardId, saveId, skillIdx >= 0 ? skillIdx : stepIdx, data, steps.length);
          if (skillIdx >= 0) setStepIdx(skillIdx);
          nav.navigate('create');
        });
      }
      // P9·S7：先进人设屏（对齐桌面 engine/story.js _enterPortrait:663-677），确认或
      //   跳过后在 cb 里进游戏起回合。「跳过」分支在 UI_Portrait.skip（Portrait.fallback
      //   兜底，未删）；确认分支在 UI_Portrait.confirm。旧「直接 fallback + 进游戏」路径移除。
      UI_Portrait.start(GameState.playerData, function (result) {
        var portrait = (result && result.portrait) ? result.portrait : result;
        GameState.playerData.portrait = portrait;
        try { Portrait.save(portrait); } catch (e) { Platform.ui.toast('人设保存失败：' + (e && e.message ? e.message : String(e)), { type: 'warn' }); }
        try { GameState.invalidateCache(); } catch (e) { Platform.ui.toast('缓存刷新失败：' + (e && e.message ? e.message : String(e)), { type: 'warn' }); }
        try { GameState.persist(); } catch (e) { Platform.ui.toast('存档落盘失败：' + (e && e.message ? e.message : String(e)), { type: 'warn' }); }
        if (typeof Snapshots !== 'undefined') Snapshots.push('init');
        // H3-R2：换档先清掉上一档残留叙事流再进叙事页（StoryScreen 挂载效应见 :71-86）
        Platform.ui.clearStory();
        Platform.ui.renderGame();
        nav.navigate('story');
        if (!GameState.chatHistory.length && typeof StoryLoop !== 'undefined') {
          StoryLoop.start();
        }
      }, validateSkills);
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
      // C4：技能分配行
      skillRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
        borderTopWidth: 1, borderTopColor: c.hair
      },
      skillBtn: {
        minWidth: 34, paddingHorizontal: 8, paddingVertical: 4, marginHorizontal: 4,
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm, alignItems: 'center'
      },
      skillBtnTxt: { fontSize: f.sm, color: c.ink },
      skillAlloc: { minWidth: 26, textAlign: 'center', fontSize: f.sm, color: c.ink, fontWeight: '600' },
      skillValue: { minWidth: 44, textAlign: 'right', fontSize: f.xs, color: c.muted },
      skillErr: { fontSize: f.xs, color: c.danger, marginTop: 4 },
      option: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        backgroundColor: c.panel, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8
      },
      optionSelected: { borderColor: c.seal, backgroundColor: c.card },
      optionName: { fontSize: f.base, color: c.text },
      optionNameSelected: { color: c.seal, fontWeight: '600' },
      optionDesc: { fontSize: f.xs, color: c.muted, marginTop: 4, lineHeight: Math.round(f.xs * 1.6) },
      quizHint: { fontSize: f.sm, color: c.muted, textAlign: 'center', letterSpacing: 2, marginBottom: 12 },
    // P72·W5：自写答案的按钮（虚线感用浅底 + 斜体文案替代）与回显
    optionCustom: { borderStyle: 'dashed', backgroundColor: c.bg },
    customNote: { fontSize: f.xs, color: c.muted, lineHeight: Math.round(f.xs * 1.6), marginTop: 6, marginBottom: 2 },
  // P67 开局问卷：一套问卷一块，题与选项纵向排，结论在块底
  quizSet: { marginBottom: 22 },
  quizSetTitle: { fontSize: f.md, color: c.text, letterSpacing: 1, marginBottom: 6 },
  quizSetPrompt: { fontSize: f.sm, color: c.muted, lineHeight: Math.round(f.sm * 1.6), marginBottom: 12 },
  quizQ: { marginBottom: 14 },
  quizQText: { fontSize: f.sm, color: c.text, lineHeight: Math.round(f.sm * 1.7), marginBottom: 8 },
  quizResult: { borderLeftWidth: 3, borderLeftColor: c.primary, backgroundColor: c.bgCard, paddingVertical: 10, paddingHorizontal: 12, marginTop: 6 },
  quizResultLine: { fontSize: f.sm, color: c.text },
  quizResultKey: { color: c.muted },
  quizResultDesc: { fontSize: f.xs, color: c.muted, lineHeight: Math.round(f.xs * 1.6), marginTop: 4 },
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
      empty: { fontSize: f.sm, color: c.muted, lineHeight: Math.round(f.sm * 1.7), paddingVertical: 20 },
      // P47·批次2：天命面板（颜色/字号只走 tokens）
      destinyBox: {
        borderWidth: 1, borderColor: c.seal, borderRadius: tk.radius.md,
        backgroundColor: c.panel, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14
      },
      destinyTitle: { fontFamily: fonts.kai, fontSize: f.lg, color: c.ink, marginBottom: 6 },
      destinyHint: { fontSize: f.xs, color: c.muted, lineHeight: Math.round(f.xs * 1.7), marginBottom: 8 },
      destinyBtn: {
        borderWidth: 1, borderColor: c.seal, backgroundColor: c.seal, borderRadius: tk.radius.sm,
        paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start', marginBottom: 8
      },
      destinyBtnText: { fontSize: f.sm, color: c.card, letterSpacing: 1, fontWeight: '600' },
      destinyRow: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        backgroundColor: c.card, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6
      },
      destinyRowText: { fontSize: f.sm, color: c.text, lineHeight: Math.round(f.sm * 1.6) },
      destinyRowTotal: { fontSize: f.xs, color: c.seal, marginTop: 3, fontWeight: '600' },
      destinyLine: { fontSize: f.sm, color: c.text, lineHeight: Math.round(f.sm * 1.8) },
      destinyName: { color: c.muted }
    });
  }, [tk, insets]);

  // ---------- 渲染：步骤 ----------

  function renderForm(s) {
    var pool = CF.poolOf(card, s);
    var isAttr = !!pool;
    // A2：属性步每一行的名称 / min / max / 默认值都取统一定义（card.attributes 权威）
    var dmap = CF.isAttrStep(s) ? CF.defMapOf(card, s) : null;
    var allocated = pool ? CF.calcAllocated(card, s, data, pool) : 0;
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
          // A2：单字段定义（attributes 优先，未声明键退回字段自身）；defMap 里 canon 键与裸键都命中
          var bareKey = String(key == null ? '' : key).replace(/^(attr_)+/, '');
          var def = dmap ? (dmap[key] || (bareKey ? dmap[bareKey] : null)) : null;
          var effLabel = (def && def.name) ? def.name : (fd.label || key);
          // P23·①：显式清空（''）不回填默认值，否则删掉默认数字后没法重输
          var shown = CF.shownValue(fd, val, isAttr, def);
          return (
            <View key={key} style={styles.fieldWrap} onLayout={rememberY(key)}>
              <Text style={styles.fieldLabel}>{effLabel + (fd.required ? '（必填）' : '')}</Text>
              {fd.type === 'number' ? (
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={shown === '' || shown == null ? '' : String(shown)}
                  onChangeText={function (v) { onNumberChange(key, v); }}
                  onBlur={function () { onNumberBlur(key, fd); }}
                  onFocus={focusTo(key)}
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
                  onFocus={focusTo(key)}
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

  // P47·批次2 / P75：天命面板（未选=列 N 组供选；已选=折叠显示最终属性 + 重掷）
  function renderDestiny() {
    if (!destinyOn) return null;
    var aiBtns = (
      <View>
        <TouchableOpacity style={styles.destinyBtn} activeOpacity={0.6} disabled={destinyAI === 'loading'} onPress={onAIDestiny}>
          <Text style={styles.destinyBtnText}>{destinyAI === 'loading' ? '让 AI 想想…' : (destinyDef ? '重新让 AI 定' : '让 AI 定天命')}</Text>
        </TouchableOpacity>
        {destinyDef ? (
          <TouchableOpacity style={styles.destinyBtn} activeOpacity={0.6} onPress={onClearAIDestiny}>
            <Text style={styles.destinyBtnText}>{'用卡带自带的'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
    if (destinyPicked) {
      return (
        <View style={styles.destinyBox}>
          <Text style={styles.destinyTitle}>{'🎲 天命' + (destinyDef ? '（AI 现定）' : '')}</Text>
          <Text style={styles.destinyHint}>{'已采用这组属性（可在下方步骤里继续手改）。'}</Text>
          {destinyAttrs.map(function (a) {
            var v = destinyPicked.values[a.key];
            return (
              <Text key={String(a.key)} style={styles.destinyLine}>
                <Text style={styles.destinyName}>{(a.name || a.key) + '：'}</Text>
                {String(v == null ? '—' : v)}
              </Text>
            );
          })}
          <Text style={styles.destinyLine}>
            <Text style={styles.destinyName}>{'总和：'}</Text>
            {String(destinyPicked.total)}
          </Text>
          <TouchableOpacity style={styles.destinyBtn} activeOpacity={0.6} onPress={onRollDestiny}>
            <Text style={styles.destinyBtnText}>{'重掷天命'}</Text>
          </TouchableOpacity>
          {aiBtns}
        </View>
      );
    }
    return (
      <View style={styles.destinyBox}>
        <Text style={styles.destinyTitle}>{'🎲 天命' + (destinyDef ? '（AI 现定）' : '')}</Text>
        {destinyDef ? (
          <Text style={styles.destinyHint}>{'AI 现定：' + destinyAttrs.length + ' 项 × ' + destinyDef.sets + ' 组。'}</Text>
        ) : null}
        {destinyAttrs.length ? (
          <Text style={styles.destinyHint}>
            {'掷 ' + destinySetCount() + ' 组属性，挑一组作为你的天命。'}
          </Text>
        ) : (
          <Text style={styles.destinyHint}>{'这个卡带没有预设天命属性，可以让 AI 按题材现定一套。'}</Text>
        )}
        {destinyAttrs.length ? (
          <TouchableOpacity style={styles.destinyBtn} activeOpacity={0.6} onPress={onRollDestiny}>
            <Text style={styles.destinyBtnText}>{'掷天命'}</Text>
          </TouchableOpacity>
        ) : null}
        {destinySets ? destinySets.map(function (set, i) {
          return (
            <TouchableOpacity
              key={'ds' + i}
              style={styles.destinyRow}
              activeOpacity={0.6}
              onPress={function () { onPickDestiny(set, i); }}
            >
              <Text style={styles.destinyRowText}>
                {destinyAttrs.map(function (a) {
                  return destinyLabel(a.key) + ' ' + String(set.values[a.key] == null ? '—' : set.values[a.key]);
                }).join('  ·  ')}
              </Text>
              <Text style={styles.destinyRowTotal}>{'总和 ' + set.total}</Text>
            </TouchableOpacity>
          );
        }) : null}
        {aiBtns}
      </View>
    );
  }

  // P67 开局问卷（分院 / 灯杖 / 守灯兽 这一类）：多套问卷纵向排，
  //   每题点选即存（onPickQuiz），选满即在该套底部显示引擎判出的结论。
  function renderQuizSet(s) {
    var defs = CF.quizDefs(s);
    if (!defs.length) {
      return <Text style={styles.unknown}>{'（这份问卷没有可用题目：检查卡带 steps[].quizzes）'}</Text>;
    }
    // P72·W5：自写答案的读取与建议标签
    function customOf(quizId, qi) {
      var bag = (data && data['__custom_' + quizId]) || {};
      return bag[qi] || '';
    }
    function suggestOf(quiz, qi) {
      var t = customOf(quiz.id, qi);
      if (!t) return '';
      // 已经落到某个结论（本地词表或 AI 归类）就以真正的 pick 为准，
      // 免得出现「已算成某档，但旁注还写着归不到」的自相矛盾。
      var pick = CF.quizPicks(data, quiz.id)[qi];
      if (pick) {
        var hit = (quiz.outcomes || []).filter(function (o) { return o.id === pick; })[0];
        if (hit) return hit.name;
      }
      var Q = (typeof CreationQuiz !== 'undefined' && CreationQuiz) ? CreationQuiz : null;
      return (Q && Q.suggestLabel) ? Q.suggestLabel(t, quiz.outcomes) : '';
    }
    var results = CF.quizResults(s, data);
    var byId = {};
    results.forEach(function (r) { byId[r.quizId] = r; });
    return (
      <View>
        {s.guide ? <Text style={styles.guide}>{s.guide}</Text> : null}
        {defs.map(function (q) {
          var picks = CF.quizPicks(data, q.id);
          var res = byId[q.id];
          return (
            <View key={q.id} style={styles.quizSet}>
              <Text style={styles.quizSetTitle}>{q.title}</Text>
              {q.prompt ? <Text style={styles.quizSetPrompt}>{q.prompt}</Text> : null}
              {q.questions.map(function (item, qi) {
                return (
                  <View key={String(qi)} style={styles.quizQ}>
                    <Text style={styles.quizQText}>{(qi + 1) + '. ' + item.q}</Text>
                    {item.opts.map(function (o) {
                      var sel = picks[qi] === o.outcome;
                      return (
                        <TouchableOpacity
                          key={String(qi) + '_' + o.outcome}
                          style={[styles.option, sel ? styles.optionSelected : null]}
                          activeOpacity={0.6}
                          onPress={function () { onPickQuiz(s, q.id, qi, o.outcome); }}
                        >
                          <Text style={[styles.optionName, sel ? styles.optionNameSelected : null]}>{o.text}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {/* P72·W5：都不像我 → 自己写 */}
                    <TouchableOpacity
                      style={[styles.option, styles.optionCustom]}
                      activeOpacity={0.6}
                      onPress={function () { onCustomQuiz(s, q, qi); }}
                    >
                      <Text style={styles.optionName}>{'都不像我 → 自己写'}</Text>
                    </TouchableOpacity>
                    {customOf(q.id, qi) ? (
                      <Text style={styles.customNote}>
                        {'你写的是：' + customOf(q.id, qi) + (suggestOf(q, qi) ? '（→ ' + suggestOf(q, qi) + '）' : '（归不到任何结论：记为自定义作答，不投票）')}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
              {res && res.answered === res.total ? (
                <View style={styles.quizResult}>
                  <Text style={styles.quizResultLine}>
                    <Text style={styles.quizResultKey}>{res.resultName + '：'}</Text>
                    {res.name}
                  </Text>
                  {res.desc ? <Text style={styles.quizResultDesc}>{res.desc}</Text> : null}
                </View>
              ) : (
                <Text style={styles.quizHint}>
                  {res
                    ? ('（还差 ' + (res.total - res.answered) + ' 题）')
                    : (CF.quizMissing({ quizzes: [s] }, data) > 0
                      ? ('（还差 ' + CF.quizMissing({ quizzes: [s] }, data) + ' 题）')
                      : '（本卷没有可计入的结论：你的回答不属于已声明的任何一档，不强行归类）')}
                </Text>
              )}
            </View>
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

  // ---------- C4：技能分配步骤（渲染与加减；所有计算走 SkillFlow，UI 不自算） ----------
  function skillPlan(stepObj) {
    if (!SF) return null;
    try { return SF.planStep(card, stepObj, SF.attrsOf(card, data), data.__skillAlloc || {}); }
    catch (e) { return null; }
  }
  function skillAdjust(id, delta) {
    if (!step || !SF) return;
    var plan = skillPlan(step);
    if (!plan) return;
    var mode = plan.budget ? plan.budget.mode : 'block';
    var cur = (data.__skillAlloc && data.__skillAlloc[id]) || 0;
    var r = SF.stepApply(card, step, SF.attrsOf(card, data), data.__skillAlloc || {}, id, cur + delta, { mode: mode });
    if (!r || !r.ok) {
      var e = (r && r.errors) ? r.errors[0] : null;
      Platform.ui.toast(e ? (e.message + (e.path ? '（' + e.path + '）' : '')) : '技能分配失败', { type: 'warn' });
      return;
    }
    var next = Object.assign({}, data, { __skillAlloc: r.alloc || {} });
    setData(next);
    CF.saveDraft(cardId, saveId, stepIdx, next, steps.length);
    if (r.clamped) Platform.ui.toast('已按卡带规则调整为 ' + r.actual + ' 点', { type: 'info' });
  }
  function skillDropOrphan(id) {
    if (!SF) return;
    var alloc = Object.assign({}, data.__skillAlloc || {});
    delete alloc[id];
    var next = Object.assign({}, data, { __skillAlloc: alloc });
    setData(next);
    CF.saveDraft(cardId, saveId, stepIdx, next, steps.length);
  }
  function renderSkills(stepObj) {
    var plan = skillPlan(stepObj);
    if (!plan) return <Text style={styles.unknown}>{'技能数值模块未加载（engine/core/skill_flow.js）'}</Text>;
    var alloc = plan.alloc || {};
    var st = plan.status || { allocated: 0, remaining: null };
    var total = plan.budget ? plan.budget.total : null;
    return (
      <View>
        {total != null ? (
          <View style={styles.poolBar}>
            <Text style={styles.poolLabel}>
              {'技能点 已分配 '}
              <Text style={st.allocated > total ? styles.poolNumOver : styles.poolNum}>{String(st.allocated)}</Text>
              {' / ' + total + '（剩余 ' + (st.remaining == null ? '-' : st.remaining) + '）'}
            </Text>
            {plan.budget.requireSpend ? <Text style={styles.poolBase}>{'这张卡带要求把技能点花完'}</Text> : null}
            {plan.capacity && plan.capacity.bounded === false ? <Text style={styles.poolBase}>{'存在无上限技能：可以继续加点'}</Text> : null}
          </View>
        ) : null}
        {(plan.errors || []).slice(0, 4).map(function (e, i) {
          return <Text key={'e' + i} style={styles.skillErr}>{'[' + e.code + '] ' + (e.path ? e.path + ' — ' : '') + e.message}</Text>;
        })}
        {(plan.items || []).map(function (it) {
          var a = alloc[it.id] || 0;
          var minReq = plan.minRequired ? plan.minRequired[it.id] : 0;
          return (
            <View key={it.id} style={styles.skillRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{it.name + '（' + it.id + '）'}</Text>
                <Text style={styles.poolBase}>
                  {'基础 ' + it.init + ' + 加成 ' + it.bonus + ' = ' + (it.init + it.bonus)
                    + (it.max == null ? '（无上限）' : '（上限 ' + it.max + '）')}
                </Text>
                {minReq > 0 ? <Text style={styles.skillErr}>{'还需分配 ' + Math.ceil(minReq) + ' 点'}</Text> : null}
              </View>
              <TouchableOpacity style={styles.skillBtn} onPress={function () { skillAdjust(it.id, -1); }}>
                <Text style={styles.skillBtnTxt}>{'−'}</Text>
              </TouchableOpacity>
              <Text style={styles.skillAlloc}>{String(a)}</Text>
              <TouchableOpacity style={styles.skillBtn} onPress={function () { skillAdjust(it.id, 1); }}>
                <Text style={styles.skillBtnTxt}>{'+'}</Text>
              </TouchableOpacity>
              <Text style={styles.skillValue}>{'=' + (it.init + it.bonus + a)}</Text>
            </View>
          );
        })}
        {(plan.orphans || []).length ? (
          <View style={{ marginTop: 10 }}>
            <Text style={styles.skillErr}>{'失效技能（已不在当前卡带中，必须移除才能继续）'}</Text>
            {(plan.orphans || []).map(function (o) {
              return (
                <View key={o.id} style={styles.skillRow}>
                  <Text style={styles.fieldLabel}>{o.id + '（' + (o.alloc || 0) + ' 点）'}</Text>
                  <TouchableOpacity style={styles.skillBtn} onPress={function () { skillDropOrphan(o.id); }}>
                    <Text style={styles.skillBtnTxt}>{'移除'}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : null}
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
      case 'quiz':
        return renderQuizSet(step);
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
      case 'skills': return renderSkills(step);
      default:
        return <Text style={styles.unknown}>{'（未知步骤类型：' + String(step.type) + '）'}</Text>;
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <BackgroundLayer />
      <View style={styles.headerRow}>
        <Text style={styles.back} onPress={function () { nav.goBack(); }}>{'← 返回'}</Text>
        <Text style={styles.title}>{'新建存档'}</Text>
        <View style={styles.headerPad} />
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 + kbInset }]}
        keyboardShouldPersistTaps="handled"
      >
        {!card ? (
          <Text style={styles.empty}>{EmptyTexts.NO_CARDS}</Text>
        ) : (
          <View>
            <Text style={styles.cardLine}>{'卡带 · ' + (card.cardName || cardId)}</Text>
            <Text style={styles.stepLine}>{'第 ' + (stepIdx + 1) + ' / ' + steps.length + ' 步'}</Text>
            {step ? <Text style={styles.stepTitle}>{step.title || step.id || ''}</Text> : null}
            {step && step.guide ? <Text style={styles.guide}>{step.guide}</Text> : null}

            {ready ? renderDestiny() : null}

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

