// ============================================================
// 战役 4 · 批次 H2：卡带库管理屏（B 类，RN 组件）
// RN 独有。grounding：桌面 engine/ui_cards.js
//   renderCardPicker（:35-65 列表）/ deleteCard（:181-210 删除序列）/
//   openImportModal+_legacyImport（:343-389 粘贴 JSON 导入）/
//   openInstructionModal（:421-441 6 段模板浮层，实装 rn/components/InstructionModal.js）。
// 范围：
//   - 卡带列表（Storage.getAllCards）：cardName + description + 存档数 + cardId
//   - 行内「设为当前卡」：走 home_model.setHomeCardId（与主页 03 换卡浮层同口径）
//   - 行内「删除卡带」：按桌面 deleteCard 规范数据序列纯数据操作
//     （内置卡检查 → Saves.listByCard → confirmAsync → Saves.delete 逐个 →
//     VFS.deleteFile('/cards/'+id+'.json')；RN 侧无 WB_WorldBook/NumEditor 引用清理）
//   - 顶部「生成卡带指令」：本地 useState 控制 6 段模板浮层（P1-I · I-4）
//   - 底部「粘贴 JSON 导入」：多行 TextInput + 导入按钮，
//     走 CardValidator.validate + Storage.getImportedCards/setImportedCards；
//     成功/失败/警告都必须有可见文案，不许静默。
// 纪律：颜色/字号只取自 useTheme() tokens，无字面量色值/字号；
//   布局度量为 RN 必要数值；不引任何新依赖、不引任何 UI 库；
//   Storage/Saves/VFS/CardValidator 为 bootstrap 挂载的全局，与 engine 业务模块
//   同风格裸引用；Node smoke 通过 globalThis 注入内存假件。
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
// P35：导入解析/定位口径（纯 JS，可 Node 直测）
var JsonLocate = require('../json_locate.js');
var Model = require('../home_model.js');
var UiClassify = require('../ui_classify_rn.js');
var InstructionModal = require('../components/InstructionModal.js').InstructionModal;
var ExportUtil = require('../export_util.js');
// P20：系统选文件（Android SAF 原生模块 android/.../FilePickerModule.kt；
//   iOS 侧还没接，那时 available() 为 false，界面会给一句人话而不是静默失败）
var FilePicker = require('../file_picker.js');
// P10·A7：空态文案单一来源（同一场景同一句，逐字照桌面）
var EmptyTexts = require('../empty_texts.js');

function CardsScreen() {
  var themeApi = useTheme();
  var tk = themeApi.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;
  var fonts = tk.fonts;
  var nav = useNavigation();
  var insets = SafeArea.useSafeAreaInsets();

  var revState = React.useState(0);
  var rev = revState[0];
  var bump = revState[1];
  var importTextState = React.useState('');
  var importText = importTextState[0];
  var setImportText = importTextState[1];
  var importMsgState = React.useState(null);
  var importMsg = importMsgState[0];
  var setImportMsg = importMsgState[1];
  // P15：导入文游资料（engine/import/**，两仓同源的纯 JS 层）
  var matTextState = React.useState('');
  var matText = matTextState[0];
  var setMatText = matTextState[1];
  var matNameState = React.useState('');
  var matName = matNameState[0];
  var setMatName = matNameState[1];
  var matMsgState = React.useState(null);
  var matMsg = matMsgState[0];
  var setMatMsg = matMsgState[1];
  var matBusyState = React.useState(false);
  var matBusy = matBusyState[0];
  var setMatBusy = matBusyState[1];
  var matRes = React.useRef(null);
  var instrState = React.useState(false);
  var instrOpen = instrState[0];
  var setInstrOpen = instrState[1];

  // 数据真源在 Storage，不本地缓存（与 HomeScreen 同口径）
  var cards = React.useMemo(function () {
    try { return Storage.getAllCards(); } catch (e) { return {}; }
  }, [rev]);
  var cardIds = Object.keys(cards);
  var curHomeId = null;
  try { curHomeId = Model.getHomeCardId(); } catch (e) { curHomeId = null; }

  function refresh() { bump(function (v) { return v + 1; }); }

  function setCurrent(id) {
    Model.setHomeCardId(id);
    var name = cards[id] ? (cards[id].cardName || id) : id;
    setImportMsg({ type: 'success', text: '已设为主页卡带：' + name });
    refresh();
  }

  // 删除卡带：照桌面 ui_cards.js:181-210 规范数据序列
  // RN 侧无 WB_WorldBook/NumEditor 引用清理（步骤 7-8 不适用）
  function deleteCard(id) {
    var card = cards[id];
    var name = card ? (card.cardName || id) : id;
    // 内置卡检查（P1-F 起 RN 已挂 CARDS 注册表：rn_bootstrap 装载 cards_demo.js）
    var isBuiltin = false;
    try { isBuiltin = (typeof CARDS !== 'undefined') && CARDS && CARDS[id]; } catch (e) { isBuiltin = false; }
    if (isBuiltin) {
      setImportMsg({ type: 'error', text: '内置卡带不可删除' });
      return;
    }
    var saves = [];
    try { saves = Saves.listByCard(id); } catch (e) { saves = []; }
    var msg = '确定删除卡带「' + name + '」？';
    if (saves.length) {
      // P9·S9：逐字照桌面 ui_cards.js:187（含 ASCII 双引号与两句危险提示）
      msg += '\n\n注意：这个卡带有 ' + saves.length + ' 个存档。\n\n点"确定"会同时删除所有存档。\n如果只想删卡带保留存档，点"取消"，我告诉你怎么做。';
    }
    Platform.ui.confirmAsync(msg).then(function (ok) {
      if (!ok) {
        // P9·S9：逐字照桌面 ui_cards.js:190 取消后的 info toast
        if (saves.length) {
          try { Platform.ui.toast('已取消。想保留存档的话，目前请先导出卡带备份，再删除。', { type: 'info' }); } catch (e) {}
        }
        return;
      }
      // 逐存档删除
      saves.forEach(function (s) {
        try { Saves.delete(id, s.saveId); } catch (e) {}
      });
      // 删卡带文件
      try { VFS.deleteFile('/cards/' + id + '.json'); } catch (e) {}
      // 如删的是当前主页卡，清记忆让 getHomeCardId 回落（与桌面 renderCardPicker 重算同语义）
      if (id === curHomeId) {
        try { Model.setHomeCardId(''); } catch (e) {}
      }
      setImportMsg({ type: 'success', text: '已删除卡带：' + name });
      refresh();
    });
  }

  // P6·S3-6：卡带导出（桌面 ui_cards.js:213 exportCard）——卡对象原样 JSON，
  // 设备通道走 Share → 剪贴板降级（rn/export_util.js）
  function exportCard(id) {
    var r = ExportUtil.buildCardText(id);
    if (!r.ok) { setImportMsg({ type: 'error', text: r.reason }); return; }
    ExportUtil.shareOrCopy(r.text, '导出卡带').then(function (s) {
      if (s.shared) setImportMsg({ type: 'success', text: '已发送：' + r.filename });
      else if (s.copied) setImportMsg({ type: 'warn', text: '卡带 JSON 已复制到剪贴板（' + r.filename + '）' });
      else if (s.dismissed) setImportMsg({ type: 'warn', text: '已取消导出' });
      else setImportMsg({ type: 'error', text: '导出失败' });
    }).catch(function (e) {
      setImportMsg({ type: 'error', text: '导出失败：' + (e && e.message) });
    });
  }

  // P6·S3-6：卡带「+ 新游戏」（桌面 ui_cards.js:104 startNewSave）——
  // 桌面按 cardId 直接建档；RN 创角屏以主页卡带为基准（CreateScreen.js:81-83），
  // 故先设为主页卡再进创角（差异已入报告【改动】自报）。
  function newGame(id) {
    Model.setHomeCardId(id);
    var name = cards[id] ? (cards[id].cardName || id) : id;
    setImportMsg({ type: 'success', text: '新游戏：' + name });
    nav.navigate('create');
  }

  // 粘贴 JSON 导入：照桌面 _legacyImport（:377-389）口径
  // JSON.parse → CardValidator.validate → getImportedCards + 赋值 + setImportedCards
  // P35：解析口径在 rn/json_locate.js。两个真机结论：
  //   · 字符串**内容**里的中文引号是合法内容 —— H2-R4 那种「所有弯引号一律换成 "」
  //     会把 "喊了一声「出发」" 提前闭合，真机上正好报 Unexpected character: 出；
  //   · Hermes 的 JSON.parse 不带 position，只能贴开头 40 字（＝「第 0 字符附近」）
  //     ⇒ 两次都失败时自己扫描出真实偏移 + 上下文 + 可能原因。
  function doImport() {
    if (!String(importText || '').trim()) {
      setImportMsg({ type: 'warn', text: '内容为空' });
      return;
    }
    var parsed = JsonLocate.parseCardJson(importText);
    if (!parsed.ok) {
      var loc = parsed.loc;
      var detail = loc
        ? '（第 ' + loc.pos + ' 字符附近，全文 ' + loc.length + ' 字：…' + loc.around + '…）'
          + '\n可能原因：' + loc.hint
          + '\n末尾：…' + loc.tail + '…'
        : '';
      setImportMsg({ type: 'error', text: 'JSON 解析失败：' + parsed.message + detail });
      return;
    }
    var card = parsed.card;
    var importNote = parsed.usedFallback ? '（结构引号是中文弯引号，已自动还原）' : '';
    var v = CardValidator.validate(card);
    if (!v.ok) {
      setImportMsg({ type: 'error', text: '校验失败：' + v.msg });
      return;
    }
    try {
      var imported = Storage.getImportedCards();
      imported[card.cardId] = card;
      Storage.setImportedCards(imported);
      setImportMsg({ type: 'success', text: '已导入：' + (card.cardName || card.cardId) + importNote });
      setImportText('');
      refresh();
    } catch (e) {
      setImportMsg({ type: 'error', text: '写入失败：' + e.message });
    }
  }

  // ---- P15：导入文游资料 ----
  // 文件名决定解析器（.md/.csv/.html/...），留空则按内容嗅探。
  function guessMaterialName(text) {
    var t = String(text || '');
    if (/^\s*[\[{]/.test(t)) return '粘贴资料.json';
    if (/<\s*(html|body|div|p|h[1-6]|table)\b/i.test(t)) return '粘贴资料.html';
    if (/^#{1,6}\s+\S/m.test(t)) return '粘贴资料.md';
    if (t.indexOf('\t') >= 0 && t.indexOf('\n') >= 0) return '粘贴资料.tsv';
    if (/^[^\n,]*,[^\n]*\n[^\n,]*,[^\n]*/.test(t)) return '粘贴资料.csv';
    if (/^\s*<\?xml/.test(t) || /^\s*<[A-Za-z_][\w.-]*[\s>][\s\S]*<\/[A-Za-z_][\w.-]*>\s*$/.test(t)) return '粘贴资料.xml';
    if (/^\s*[\w.-]+:\s/m.test(t)) return '粘贴资料.yaml';
    return '粘贴资料.txt';
  }

  function matReport(r) {
    var lines;
    try { lines = String(Import.reportText(r) || '').split('\n'); }
    catch (e) { lines = ['（报告生成失败：' + e.message + '）']; }
    var gaps = (r && r.draft && r.draft.gaps) || [];
    if (gaps.length) {
      var names = gaps.map(function (g) { return g.field; });
      lines.push('缺口 ' + gaps.length + ' 项：' + names.slice(0, 6).join('、') + (names.length > 6 ? ' 等' : ''));
      lines.push('缺口不挡导入：草稿已带默认值，可以点「让 AI 补全」或自己填。');
    } else {
      lines.push('没有发现明显缺口。');
    }
    var card = r && r.draft && r.draft.card;
    if (card) lines.push('草稿卡带：' + (card.cardName || '（未命名）') + ' / cardId=' + card.cardId);
    return lines.join('\n');
  }

  // P20：解析入口只留一个 —— 粘贴（text）与选文件（bytes = 原生交回的 base64）
  //   走同一条路，避免两条路各修一半（选文件那条曾经根本不存在）。
  function parseMaterialInput(input) {
    if (typeof Import === 'undefined' || !Import || !Import.run) {
      setMatMsg({ type: 'error', text: '导入层未加载（Import 全局缺失；检查 rn_bootstrap.js 的 P15 段）' });
      return null;
    }
    var payload = { name: '' };
    payload.name = String((input && input.name) || '').trim();
    if (payload.name.indexOf('.') < 0) payload.name += '.txt';
    if (input && typeof input.bytes !== 'undefined' && input.bytes !== null && input.bytes !== '') payload.bytes = input.bytes;
    else payload.text = String((input && input.text) || '');
    try {
      var r = Import.run(payload, {});
      matRes.current = r;
      setMatMsg({ type: 'success', text: matReport(r) });
      return r;
    } catch (e) {
      setMatMsg({ type: 'error', text: '解析失败：' + (e && e.message ? e.message : String(e)) });
      return null;
    }
  }

  function doParseMaterial() {
    var raw = String(matText || '').trim();
    if (!raw) { setMatMsg({ type: 'warn', text: '资料内容为空' }); return; }
    var name = String(matName || '').trim() || guessMaterialName(raw);
    parseMaterialInput({ name: name, text: raw });
  }

  // P20：从手机里挑一个文件（系统 SAF）。原生把 文件名 + base64 交回来，
  //   交给上面同一条解析路径；docx / odt / epub / pdf / zip 从此进得来。
  function doPickMaterialFile() {
    if (!FilePicker.available()) {
      setMatMsg({ type: 'warn', text: '这个构建没有接上文件选择器（请用带文件选择器的安装包）' });
      return;
    }
    if (matBusy) return;
    setMatBusy(true);
    setMatMsg({ type: 'info', text: '正在等你在系统里挑一个文件…' });
    FilePicker.pickFile().then(function (picked) {
      setMatBusy(false);
      if (!picked) { setMatMsg(null); return; }
      if (!picked.base64) {
        setMatMsg({ type: 'warn', text: '这个文件没读到内容：' + picked.name });
        return;
      }
      setMatName(picked.name);
      parseMaterialInput({ name: picked.name, bytes: picked.base64 });
    }).catch(function (e) {
      setMatBusy(false);
      setMatMsg({ type: 'error', text: '选文件失败：' + (e && e.message ? e.message : String(e)) });
    });
  }

  function doAiEnrichMaterial() {
    var r = matRes.current;
    if (!r) { setMatMsg({ type: 'warn', text: '先点一次「解析资料」' }); return; }
    if (matBusy) return;
    if (typeof ApiClient === 'undefined' || !ApiClient || !ApiClient.chat) {
      setMatMsg({ type: 'error', text: 'ApiClient 未加载，无法让 AI 补全' });
      return;
    }
    setMatBusy(true);
    setMatMsg({ type: 'info', text: 'AI 处理中…（补缺口 → 过 CardValidator 校验，最多 3 轮）' });
    Import.enrich(r, {
      chat: function (msgs, opts) { return ApiClient.chat(msgs, opts); },
      maxRounds: 3,
      onRound: function (info) {
        setMatMsg({ type: 'info', text: '第 ' + (info && info.round) + ' 轮：' + ((info && info.phase) || '') });
      }
    }).then(function (out) {
      var res = (out && out.result) || r;
      matRes.current = res;
      setMatBusy(false);
      var head = (out && out.ok)
        ? 'AI 补全后已通过校验。'
        : 'AI 补全后仍未过校验：' + ((out && out.validation && out.validation.msg) || (out && out.reason) || '未知');
      setMatMsg({ type: (out && out.ok) ? 'success' : 'warn', text: head + '\n' + matReport(res) });
    }).catch(function (e) {
      setMatBusy(false);
      setMatMsg({ type: 'error', text: 'AI 处理失败：' + (e && e.message ? e.message : String(e)) });
    });
  }

  function doCommitMaterial() {
    var r = matRes.current;
    if (!r) { setMatMsg({ type: 'warn', text: '先点一次「解析资料」' }); return; }
    var res = Import.commit(r, {});
    if (!res || !res.ok) {
      setMatMsg({ type: 'error', text: '未落库：' + ((res && res.reason) || '未知原因') });
      return;
    }
    setMatMsg({ type: 'success', text: '已导入卡带：' + ((r.draft.card.cardName) || res.cardId) });
    matRes.current = null;
    setMatText('');
    setMatName('');
    refresh();
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
      count: { fontFamily: fonts.mono, fontSize: f.xs, color: c.muted },
      scroll: { flex: 1 },
      body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: insets.bottom + 24 },
      sectionOverline: {
        fontFamily: fonts.serif, fontSize: f.xs, color: c.muted,
        letterSpacing: 4, marginTop: 18, marginBottom: 8
      },
      hint: { fontSize: f.sm, color: c.muted, lineHeight: Math.round(f.sm * 1.7), marginBottom: 10 },
      empty: { fontSize: f.sm, color: c.muted, lineHeight: Math.round(f.sm * 1.7), paddingVertical: 20 },
      cardItem: {
        borderWidth: 1, borderColor: c.hair, borderRadius: tk.radius.md,
        padding: 14, marginBottom: 12, backgroundColor: c.card
      },
      cardName: { fontFamily: fonts.serif, fontSize: f.md, color: c.ink, fontWeight: '600', marginBottom: 4 },
      cardDesc: { fontSize: f.sm, color: c.muted, lineHeight: Math.round(f.sm * 1.6), marginBottom: 6 },
      cardMeta: { fontFamily: fonts.mono, fontSize: f.xs, color: c.faint, marginBottom: 10 },
      btnRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
      primaryBtn: {
        borderWidth: 1, borderColor: c.accent, borderRadius: tk.radius.sm,
        paddingHorizontal: 14, paddingVertical: 8, backgroundColor: c.accent
      },
      primaryBtnText: { fontFamily: fonts.sans, fontSize: f.sm, color: c.bgWhite, letterSpacing: 1 },
      curBtn: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        paddingHorizontal: 14, paddingVertical: 8, backgroundColor: c.panel
      },
      curBtnText: { fontFamily: fonts.sans, fontSize: f.sm, color: c.muted, letterSpacing: 1 },
      dangerBtn: {
        borderWidth: 1, borderColor: c.danger, borderRadius: tk.radius.sm,
        paddingHorizontal: 14, paddingVertical: 8
      },
      dangerBtnText: { fontFamily: fonts.sans, fontSize: f.sm, color: c.danger, letterSpacing: 1 },
      divider: { height: 1, backgroundColor: c.hair, marginVertical: 14 },
      topAction: { flexDirection: 'row', marginBottom: 12 },
      textarea: {
        borderWidth: 1, borderColor: c.hair, borderRadius: tk.radius.sm,
        padding: 12, minHeight: 140, fontSize: f.sm, color: c.text,
        fontFamily: fonts.mono, textAlignVertical: 'top', marginBottom: 10
      },
      msgOk: { fontSize: f.sm, color: c.success, lineHeight: Math.round(f.sm * 1.6), marginTop: 8 },
      msgWarn: { fontSize: f.sm, color: c.warning, lineHeight: Math.round(f.sm * 1.6), marginTop: 8 },
      msgErr: { fontSize: f.sm, color: c.danger, lineHeight: Math.round(f.sm * 1.6), marginTop: 8 },
      msgInfo: { fontSize: f.sm, color: c.muted, lineHeight: Math.round(f.sm * 1.6), marginTop: 8 },
      nameInput: {
        borderWidth: 1, borderColor: c.hair, borderRadius: tk.radius.sm,
        paddingHorizontal: 12, paddingVertical: 8, fontSize: f.sm, color: c.text,
        fontFamily: fonts.mono, marginBottom: 10
      }
    });
  }, [tk, insets]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.headerRow}>
        <Text style={styles.back} onPress={function () { nav.goBack(); }}>{'← 返回'}</Text>
        <Text style={styles.title}>{'卡 带 库'}</Text>
        <Text style={styles.count}>{cardIds.length + ' 张'}</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        <View style={styles.topAction}>
          <TouchableOpacity style={styles.primaryBtn} onPress={function () { setInstrOpen(true); }}>
            <Text style={styles.primaryBtnText}>{'生成卡带指令'}</Text>
          </TouchableOpacity>
        </View>
        {!cardIds.length ? (
          <Text style={styles.empty}>{EmptyTexts.NO_CARDS}</Text>
        ) : (
          cardIds.map(function (id) {
            var card = cards[id];
            var name = card.cardName || id;
            var desc = card.description || '';
            var saves = [];
            try { saves = Saves.listByCard(id); } catch (e) { saves = []; }
            var isCur = id === curHomeId;
            return (
              <View key={id} style={styles.cardItem}>
                <Text style={styles.cardName}>{name}</Text>
                {desc ? <Text style={styles.cardDesc}>{desc}</Text> : null}
                <Text style={styles.cardMeta}>{saves.length + ' 个存档 · cardId=' + id}</Text>
                <View style={styles.btnRow}>
                  <TouchableOpacity style={isCur ? styles.curBtn : styles.primaryBtn} onPress={function () { setCurrent(id); }}>
                    <Text style={isCur ? styles.curBtnText : styles.primaryBtnText}>{isCur ? '当前主页卡' : '设为当前卡'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryBtn} onPress={function () { newGame(id); }}>
                    <Text style={styles.primaryBtnText}>{'+ 新游戏'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.curBtn} onPress={function () { exportCard(id); }}>
                    <Text style={styles.curBtnText}>{'导出'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.curBtn} onPress={function () { UiClassify.start(id); }}>
                    <Text style={styles.curBtnText}>{'分类审核'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dangerBtn} onPress={function () { deleteCard(id); }}>
                    <Text style={styles.dangerBtnText}>{'删除卡带'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        <View style={styles.divider} />
        <Text style={styles.sectionOverline}>{'导 入'}</Text>
        <Text style={styles.hint}>{'粘贴卡带 JSON（exportCard 导出格式）。导入前会 CardValidator.validate 校验必填字段、panels num 完整性。'}</Text>
        <TextInput
          style={styles.textarea}
          multiline
          placeholder="粘贴卡带 JSON..."
          placeholderTextColor={c.faint}
          value={importText}
          onChangeText={setImportText}
        />
        <TouchableOpacity style={styles.primaryBtn} onPress={doImport}>
          <Text style={styles.primaryBtnText}>{'诊断并导入'}</Text>
        </TouchableOpacity>
        {importMsg ? (
          <Text style={importMsg.type === 'success' ? styles.msgOk : (importMsg.type === 'warn' ? styles.msgWarn : styles.msgErr)}>
            {importMsg.text}
          </Text>
        ) : null}

        <View style={styles.divider} />
        <Text style={styles.sectionOverline}>{'导 入 文 游 资 料'}</Text>
        <Text style={styles.hint}>{'把写好的设定资料直接变成卡带：粘贴 txt / md / csv / tsv / html / json / yaml / xml / rtf 的正文，引擎先解析成中间格式，再按世界书结构生成草稿并列出缺口。docx / odt / epub / pdf / zip 这类二进制资料点下面的「选择文件…」直接从手机里挑。'}</Text>
        <TextInput
          style={styles.textarea}
          multiline
          placeholder="粘贴设定资料正文..."
          placeholderTextColor={c.faint}
          value={matText}
          onChangeText={setMatText}
        />
        <TextInput
          style={styles.nameInput}
          placeholder="文件名（决定按什么格式解析，如 设定.md / 人物.csv；留空按内容猜）"
          placeholderTextColor={c.faint}
          value={matName}
          onChangeText={setMatName}
        />
        <Text style={styles.sectionOverline}>{'或 从 手 机 选 文 件'}</Text>
        <Text style={styles.hint}>{'二进制资料（docx / odt / epub / pdf / zip）点这个按钮从手机里挑，挑好后再回到下面的「解析资料」。'}</Text>
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.curBtn} onPress={doPickMaterialFile} disabled={matBusy}>
            <Text style={styles.curBtnText}>{'选择文件…'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.divider} />
        <Text style={styles.sectionOverline}>{'解 析 与 落 库'}</Text>
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.primaryBtn} onPress={doParseMaterial}>
            <Text style={styles.primaryBtnText}>{'解析资料'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.curBtn} onPress={doAiEnrichMaterial}>
            <Text style={styles.curBtnText}>{matBusy ? 'AI 处理中…' : '让 AI 补全'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.curBtn} onPress={doCommitMaterial}>
            <Text style={styles.curBtnText}>{'落库为卡带'}</Text>
          </TouchableOpacity>
        </View>
        {matMsg ? (
          <Text style={matMsg.type === 'success' ? styles.msgOk : (matMsg.type === 'warn' ? styles.msgWarn : (matMsg.type === 'info' ? styles.msgInfo : styles.msgErr))}>
            {matMsg.text}
          </Text>
        ) : null}
      </ScrollView>
      <InstructionModal visible={instrOpen} onClose={function () { setInstrOpen(false); }} />
    </View>
  );
}

module.exports = { CardsScreen: CardsScreen };
