// ============================================================
// 战役 4 · 批次 H2：存档管理屏（B 类，RN 组件）
// RN 独有。grounding：桌面 engine/ui_cards.js
//   renderSavesList（:67-90 列表）/ continueSave（:119-156 打开）/
//   renameSave（:92-102 改名）/ deleteSave（:172-180 删除）。
// 范围：
//   - Saves.listAll() 列表（按 lastPlayedAt 降序，meta 含 cardName/displayName/...）
//   - 行内「打开」：复刻 continueSave 但参数化（GameState.loadFromSave →
//     判定 playerData/portrait/history 分支 → showScreen('screen-game') +
//     renderGame + StoryLoop.start/replayHistory）；不新增 A 类纯逻辑文件，
//     组件内函数复刻 story_runtime.continueLast 的装载链
//   - 行内「改名」：内联 TextInput 编辑态（不依赖 promptAsync 壳）→
//     Saves.rename(cardId, saveId, newName)
//   - 行内「删除」：confirmAsync → Saves.delete(cardId, saveId)
// 纪律：颜色/字号只取自 useTheme() tokens，无字面量色值/字号；
//   布局度量为 RN 必要数值；不引任何新依赖、不引任何 UI 库；
//   Saves/GameState/StoryLoop/Platform 为 bootstrap 挂载全局；
//   replayHistory 复用 story_runtime 导出口（与 continueLast 同源）。
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
var StoryRuntime = require('../story_runtime.js');
var ExportUtil = require('../export_util.js');
// P10·A7：空态文案单一来源（逐字照桌面 ui_cards.js:70）
var EmptyTexts = require('../empty_texts.js');

function SavesScreen() {
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
  var editingIdState = React.useState(null);
  var editingId = editingIdState[0];
  var setEditingId = editingIdState[1];
  var editNameState = React.useState('');
  var editName = editNameState[0];
  var setEditName = editNameState[1];
  var toastState = React.useState(null);
  var toast = toastState[0];
  var setToast = toastState[1];

  var all = React.useMemo(function () {
    try { return Saves.listAll(); } catch (e) { return []; }
  }, [rev]);

  function refresh() { bump(function (v) { return v + 1; }); }

  function showToast(text, type) {
    setToast({ text: text, type: type || 'info' });
  }

  // 打开存档：统一走 story_runtime.openSave（P10·A1 抽公共，与主页存档行 / 01 同链）。
  // 含 routeMissingStep 接管与「未完成轮」续接（resume-pending），不再各写一遍。
  function openSave(cardId, saveId) {
    StoryRuntime.openSave(cardId, saveId).then(function (res) {
      if (res && !res.ok && !res.routed) {
        showToast(StoryRuntime.CONTINUE_REASONS[res.reason] || '打开存档失败', 'error');
      }
    });
  }

  function startRename(saveId, currentName) {
    setEditingId(saveId);
    setEditName(currentName || '');
  }
  function cancelRename() {
    setEditingId(null);
    setEditName('');
  }
  function confirmRename(cardId, saveId) {
    var name = String(editName || '').trim();
    if (!name) { showToast('名字不能为空', 'warn'); return; }
    try {
      Saves.rename(cardId, saveId, name);
      showToast('已改名：' + name, 'success');
    } catch (e) {
      showToast('改名失败：' + e.message, 'error');
    }
    setEditingId(null);
    setEditName('');
    refresh();
  }

  function deleteSave(cardId, saveId, displayName) {
    var name = displayName || saveId;
    Platform.ui.confirmAsync('确定删除存档「' + name + '」？\n\n删除后无法恢复。').then(function (ok) {
      if (!ok) { showToast('已取消删除', 'warn'); return; }
      try {
        Saves.delete(cardId, saveId);
        showToast('已删除存档：' + name, 'success');
      } catch (e) {
        showToast('删除失败：' + e.message, 'error');
      }
      refresh();
    });
  }

  // P6·S3-6：存档导出（桌面 ui_cards.js:227 exportSave）——
  // 载荷形状照桌面，设备通道走 Share → 剪贴板降级（rn/export_util.js）
  function exportSave(cardId, saveId) {
    var r = ExportUtil.buildSaveText(cardId, saveId);
    if (!r.ok) { showToast(r.reason, 'warn'); return; }
    ExportUtil.shareOrCopy(r.text, '导出存档').then(function (s) {
      if (s.shared) showToast('已发送：' + r.filename, 'success');
      else if (s.copied) showToast('导出内容已复制到剪贴板（' + r.filename + '）', 'info');
      else if (s.dismissed) showToast('已取消导出', 'warn');
      else showToast('导出失败', 'error');
    }).catch(function (e) {
      showToast('导出失败：' + (e && e.message || e), 'error');
    });
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
      headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
      count: { fontFamily: fonts.mono, fontSize: f.xs, color: c.muted },
      scroll: { flex: 1 },
      body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: insets.bottom + 24 },
      empty: { fontSize: f.sm, color: c.muted, lineHeight: Math.round(f.sm * 1.7), paddingVertical: 20 },
      cardGroup: { marginBottom: 16 },
      cardTitle: { fontFamily: fonts.serif, fontSize: f.md, color: c.ink, fontWeight: '600', marginBottom: 8 },
      saveRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.hair
      },
      saveInfo: { flex: 1, marginRight: 10 },
      saveName: { fontFamily: fonts.serif, fontSize: f.sm, color: c.text, marginBottom: 2 },
      saveMeta: { fontFamily: fonts.mono, fontSize: f.xs, color: c.faint },
      btnRow: { flexDirection: 'row', gap: 8 },
      primaryBtn: {
        borderWidth: 1, borderColor: c.accent, borderRadius: tk.radius.sm,
        paddingHorizontal: 10, paddingVertical: 6, backgroundColor: c.accent
      },
      primaryBtnText: { fontFamily: fonts.sans, fontSize: f.xs, color: c.bgWhite, letterSpacing: 1 },
      ghostBtn: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        paddingHorizontal: 10, paddingVertical: 6
      },
      ghostBtnText: { fontFamily: fonts.sans, fontSize: f.xs, color: c.muted, letterSpacing: 1 },
      dangerBtn: {
        borderWidth: 1, borderColor: c.danger, borderRadius: tk.radius.sm,
        paddingHorizontal: 10, paddingVertical: 6
      },
      dangerBtnText: { fontFamily: fonts.sans, fontSize: f.xs, color: c.danger, letterSpacing: 1 },
      editRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.hair },
      editInput: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        padding: 8, fontSize: f.sm, color: c.text, marginBottom: 8
      },
      editBtnRow: { flexDirection: 'row', gap: 8 },
      toastOk: { fontSize: f.sm, color: c.success, marginTop: 10 },
      toastWarn: { fontSize: f.sm, color: c.warning, marginTop: 10 },
      toastErr: { fontSize: f.sm, color: c.danger, marginTop: 10 }
    });
  }, [tk, insets]);

  // 按 cardId 分组（与桌面 renderSavesList 同口径）
  var byCard = {};
  all.forEach(function (m) {
    if (!byCard[m.cardId]) byCard[m.cardId] = [];
    byCard[m.cardId].push(m);
  });
  var cardIds = Object.keys(byCard);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.headerRow}>
        <Text style={styles.back} onPress={function () { nav.goBack(); }}>{'← 返回'}</Text>
        <Text style={styles.title}>{'存 档'}</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.ghostBtn} onPress={function () { nav.navigate('create'); }}>
            <Text style={styles.ghostBtnText}>{'新建存档'}</Text>
          </TouchableOpacity>
          <Text style={styles.count}>{all.length + ' 份'}</Text>
        </View>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        {!all.length ? (
          <Text style={styles.empty}>{EmptyTexts.NO_SAVES}</Text>
        ) : (
          cardIds.map(function (cardId) {
            var saves = byCard[cardId];
            var cardName = saves[0].cardName || cardId;
            return (
              <View key={cardId} style={styles.cardGroup}>
                <Text style={styles.cardTitle}>{cardName}</Text>
                {saves.map(function (s) {
                  var isEditing = editingId === s.saveId;
                  var label = (s.displayName || '未命名') + (s.playerName ? ' · ' + s.playerName : '');
                  var meta = '玩过 ' + Saves.formatPlayTime(s.playTime) + ' · 上次 ' + Saves.formatDate(s.lastPlayedAt);
                  if (isEditing) {
                    return (
                      <View key={s.saveId} style={styles.editRow}>
                        <TextInput
                          style={styles.editInput}
                          value={editName}
                          onChangeText={setEditName}
                          placeholder="新名字"
                          placeholderTextColor={c.faint}
                          autoFocus
                        />
                        <View style={styles.editBtnRow}>
                          <TouchableOpacity style={styles.primaryBtn} onPress={function () { confirmRename(cardId, s.saveId); }}>
                            <Text style={styles.primaryBtnText}>{'确认'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.ghostBtn} onPress={cancelRename}>
                            <Text style={styles.ghostBtnText}>{'取消'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  }
                  return (
                    <View key={s.saveId} style={styles.saveRow}>
                      <View style={styles.saveInfo}>
                        <Text style={styles.saveName}>{label}</Text>
                        <Text style={styles.saveMeta}>{meta}</Text>
                      </View>
                      <View style={styles.btnRow}>
                        <TouchableOpacity style={styles.primaryBtn} onPress={function () { openSave(s.cardId, s.saveId); }}>
                          <Text style={styles.primaryBtnText}>{'打开'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.ghostBtn} onPress={function () { startRename(s.saveId, s.displayName); }}>
                          <Text style={styles.ghostBtnText}>{'改名'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.ghostBtn} onPress={function () { exportSave(s.cardId, s.saveId); }}>
                          <Text style={styles.ghostBtnText}>{'导出'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.dangerBtn} onPress={function () { deleteSave(s.cardId, s.saveId, s.displayName); }}>
                          <Text style={styles.dangerBtnText}>{'删除'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })
        )}
        {toast ? (
          <Text style={toast.type === 'success' ? styles.toastOk : (toast.type === 'warn' ? styles.toastWarn : styles.toastErr)}>
            {toast.text}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

module.exports = { SavesScreen: SavesScreen };
