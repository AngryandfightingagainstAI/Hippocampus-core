// ============================================================
// P1-I · I-1（G7-b）：NPC 状态更新浮层（B 类，RN 组件）
// 桌面锚点：engine/ui_npc.js _renderUpdateModal :254-301
//   标题 :297「🔄 更新 NPC 状态」；字段 label :281-286 逐字：
//     存活 / 情绪 / 位置（地图节点 id）/ 对玩家态度 /
//     已知事实（每行一条）/ 最近事件（每行一条）
//   数据态引语 :280「AI 建议的更新如下，每条可手动修改。」
//   解释块 :288「AI 解释：」；按钮行 :290-294
//     确认写入(primary) / 重新生成 / 取消
// 三态（桌面 _renderUpdateModal 三种入参折叠到本组件）：
//   loading（居中显示 loadingText，默认「正在请求 AI 更新…」）
//   errMsg（danger 色只读块，逐字照 :262 的 deep-error 样式语义）
//   data（表单；存活用两段式按钮表示 true/false，不引入 Picker 新依赖）
// 视觉：颜色/字号只取自 props.tokens（useTheme 产物），零字面量色值。
// 纪律：零 document./window./FileReader/Blob；'use strict'。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var TextInput = RN.TextInput;
var Modal = RN.Modal;
var ScrollView = RN.ScrollView;
var TouchableOpacity = RN.TouchableOpacity;
var TouchableWithoutFeedback = RN.TouchableWithoutFeedback;

var DEFAULT_LOADING_TEXT = '正在请求 AI 更新…';

function NpcUpdateModal(props) {
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;
  var data = props.data || null;

  // ---- 可编辑字段（data 就位时初始化；data 变化时重填）----
  var aliveState = React.useState(true);
  var alive = aliveState[0]; var setAlive = aliveState[1];
  var moodState = React.useState('');
  var mood = moodState[0]; var setMood = moodState[1];
  var locState = React.useState('');
  var locationId = locState[0]; var setLocationId = locState[1];
  var relState = React.useState('');
  var playerRelation = relState[0]; var setPlayerRelation = relState[1];
  var kfState = React.useState('');
  var knownFactsText = kfState[0]; var setKnownFactsText = kfState[1];
  var reState = React.useState('');
  var recentEventsText = reState[0]; var setRecentEventsText = reState[1];

  React.useEffect(function () {
    if (!data) return;
    setAlive(data.alive !== false);
    setMood(data.mood || '');
    setLocationId(data.locationId || '');
    setPlayerRelation(data.playerRelation || '');
    setKnownFactsText(data.knownFactsText || '');
    setRecentEventsText(data.recentEventsText || '');
  }, [data]);

  var styles = RN.StyleSheet.create({
    mask: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
      justifyContent: 'center', padding: 12
    },
    inner: {
      backgroundColor: c.bgPanel || c.bg,
      borderRadius: tk.radius.lg || tk.radius.md || 6,
      width: '100%', maxWidth: 640, maxHeight: '92%',
      alignSelf: 'center', overflow: 'hidden'
    },
    header: {
      paddingHorizontal: 18, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.border,
      flexDirection: 'row', alignItems: 'center'
    },
    title: { flex: 1, fontSize: f.lg, color: c.text },
    closeBtn: {
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: tk.radius.sm || 4, backgroundColor: c.borderStrong
    },
    closeBtnText: { color: c.text, fontSize: f.base },
    body: { paddingHorizontal: 18, paddingVertical: 14 },
    npcName: { fontSize: f.md, color: c.text, marginBottom: 10 },
    loading: { color: c.textMuted || c.muted, fontSize: f.base, textAlign: 'center', paddingVertical: 20 },
    errBlock: {
      backgroundColor: c.deepErrorBg, borderLeftWidth: 3, borderLeftColor: c.danger,
      borderRadius: tk.radius.sm || 4, paddingHorizontal: 12, paddingVertical: 10
    },
    errText: { color: c.deepErrorText, fontSize: f.sm },
    hint: { color: c.textMuted || c.muted, fontSize: f.sm, marginBottom: 8 },
    field: { marginBottom: 10 },
    label: { color: c.textMuted2 || c.faint, fontSize: f.sm, marginBottom: 4 },
    input: {
      borderWidth: 1, borderColor: c.borderStrong, borderRadius: tk.radius.sm || 4,
      paddingHorizontal: 10, paddingVertical: 8,
      color: c.text, fontSize: f.base, backgroundColor: c.bg
    },
    area: { minHeight: 72, textAlignVertical: 'top' },
    segRow: { flexDirection: 'row' },
    seg: {
      flex: 1, paddingVertical: 8, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: c.borderStrong,
      borderRadius: tk.radius.sm || 4, marginRight: 8
    },
    segLast: { marginRight: 0 },
    segOn: { backgroundColor: c.primary, borderColor: c.primary },
    segText: { color: c.text, fontSize: f.sm },
    segTextOn: { color: c.bgWhite },
    explainBlock: {
      marginTop: 10, paddingHorizontal: 12, paddingVertical: 10,
      backgroundColor: c.bg, borderLeftWidth: 3, borderLeftColor: c.infoBg || c.accent,
      borderRadius: tk.radius.sm || 4
    },
    explainText: { color: c.textMuted || c.muted, fontSize: f.sm },
    btnRow: { flexDirection: 'row', marginTop: 16 },
    btn: {
      flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center',
      borderRadius: tk.radius.sm || 4, marginRight: 8, backgroundColor: c.borderStrong
    },
    btnPrimary: { backgroundColor: c.primary },
    btnLast: { marginRight: 0 },
    btnText: { color: c.text, fontSize: f.base },
    btnTextPrimary: { color: c.bgWhite, fontSize: f.base }
  });

  function onConfirmPress() {
    if (typeof props.onConfirm === 'function') {
      props.onConfirm({
        alive: alive,
        mood: mood,
        locationId: locationId,
        playerRelation: playerRelation,
        knownFactsText: knownFactsText,
        recentEventsText: recentEventsText
      });
    }
  }

  var body = null;
  if (props.loading) {
    body = (
      <Text style={styles.loading}>{props.loadingText || DEFAULT_LOADING_TEXT}</Text>
    );
  } else if (props.errMsg) {
    body = (
      <View style={styles.errBlock}>
        <Text style={styles.errText}>{props.errMsg}</Text>
      </View>
    );
  } else if (data) {
    body = (
      <View>
        <Text style={styles.hint}>{'AI 建议的更新如下，每条可手动修改。'}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{'存活'}</Text>
          <View style={styles.segRow}>
            <TouchableOpacity
              style={[styles.seg, alive ? styles.segOn : null]}
              activeOpacity={0.7}
              onPress={function () { setAlive(true); }}
            >
              <Text style={[styles.segText, alive ? styles.segTextOn : null]}>{'存活'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.seg, styles.segLast, !alive ? styles.segOn : null]}
              activeOpacity={0.7}
              onPress={function () { setAlive(false); }}
            >
              <Text style={[styles.segText, !alive ? styles.segTextOn : null]}>{'已死亡'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{'情绪'}</Text>
          <TextInput
            style={styles.input}
            value={mood}
            onChangeText={setMood}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{'位置（地图节点 id）'}</Text>
          <TextInput
            style={styles.input}
            value={locationId}
            onChangeText={setLocationId}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{'对玩家态度'}</Text>
          <TextInput
            style={styles.input}
            value={playerRelation}
            onChangeText={setPlayerRelation}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{'已知事实（每行一条）'}</Text>
          <TextInput
            style={[styles.input, styles.area]}
            value={knownFactsText}
            onChangeText={setKnownFactsText}
            multiline
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{'最近事件（每行一条）'}</Text>
          <TextInput
            style={[styles.input, styles.area]}
            value={recentEventsText}
            onChangeText={setRecentEventsText}
            multiline
          />
        </View>

        {data.explain ? (
          <View style={styles.explainBlock}>
            <Text style={styles.explainText}>{'AI 解释：' + data.explain}</Text>
          </View>
        ) : null}

        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            activeOpacity={0.7}
            onPress={onConfirmPress}
          >
            <Text style={styles.btnTextPrimary}>{'确认写入'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btn}
            activeOpacity={0.7}
            onPress={function () { if (typeof props.onRegenerate === 'function') props.onRegenerate(); }}
          >
            <Text style={styles.btnText}>{'重新生成'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnLast]}
            activeOpacity={0.7}
            onPress={function () { if (typeof props.onCancel === 'function') props.onCancel(); }}
          >
            <Text style={styles.btnText}>{'取消'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <Modal visible={!!props.visible} transparent animationType="fade" onRequestClose={function () { if (typeof props.onCancel === 'function') props.onCancel(); }}>
      <TouchableWithoutFeedback onPress={function () { /* 遮罩点击不关框（平移桌面） */ }}>
        <View style={styles.mask}>
          <TouchableWithoutFeedback onPress={function () { /* 吞内容点击 */ }}>
            <View style={styles.inner}>
              <View style={styles.header}>
                <Text style={styles.title}>{'🔄 更新 NPC 状态'}</Text>
                <TouchableOpacity
                  style={styles.closeBtn}
                  activeOpacity={0.85}
                  onPress={function () { if (typeof props.onCancel === 'function') props.onCancel(); }}
                >
                  <Text style={styles.closeBtnText}>{'✕'}</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.body}>
                <Text style={styles.npcName}>{props.npcName || ''}</Text>
                {body}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

module.exports = { NpcUpdateModal: NpcUpdateModal };