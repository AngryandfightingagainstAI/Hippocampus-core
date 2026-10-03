// ============================================================
// 战役 4 · 批次 H4：面板宿主壳（B 类，RN 组件）
// 全屏 Modal，按 story_store.panelId 分派六面板。
// 结构：遮罩 + 居中面板卡片（maxWidth 640）+ 标题栏 + ScrollView + 内容。
// 关闭：× 钮 + Android 返回键（onRequestClose）。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var Modal = RN.Modal;
var ScrollView = RN.ScrollView;
var TouchableOpacity = RN.TouchableOpacity;
var TouchableWithoutFeedback = RN.TouchableWithoutFeedback;

var useTheme = require('../use_theme.js').useTheme;
var StoryStore = require('../story_store.js');

var StatusCardPanel = require('../panels/StatusCardPanel.js');
var LogPanel = require('../panels/LogPanel.js');
var DiceHistoryPanel = require('../panels/DiceHistoryPanel.js');
var CharacterPanel = require('../panels/CharacterPanel.js');
var EntriesPanel = require('../panels/EntriesPanel.js');
var ShopIndexPanel = require('../panels/ShopIndexPanel.js');
var TasksPanel = require('../panels/TasksPanel.js');
var AchievementsPanel = require('../panels/AchievementsPanel.js');
var EndingsPanel = require('../panels/EndingsPanel.js');
var StoryNodesPanel = require('../panels/StoryNodesPanel.js');
var EventProposalsPanel = require('../panels/EventProposalsPanel.js');
var ChangeProposalsPanel = require('../panels/ChangeProposalsPanel.js');
var NpcPanel = require('../panels/NpcPanel.js');
var ErrorLogPanel = require('../panels/ErrorLogPanel.js');
var DebugPanel = require('../panels/DebugPanel.js');
var InfoPhonePanel = require('./InfoPhonePanel.js');

var TITLE_MAP = {
  statusCard: '状态卡',
  log: '日志',
  diceHistory: '骰子历史',
  character: '角色',
  shop: '商店',
  tasks: '任务',
  achievements: '成就',
  endings: '结局',
  storyNodes: '剧情节点',
  eventProposals: '事件提议',
  changeProposals: '变更提议',
  npc: '人物',
  errorLog: '报错',
  debug: '调试信息',
  infoPhone: '手机'
};

function PanelHost() {
  var themeApi = useTheme();
  var tk = themeApi.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var snap = React.useSyncExternalStore(StoryStore.subscribe, StoryStore.getSnapshot, StoryStore.getSnapshot);
  var panelId = snap.panelId;

  function close() { StoryStore.closePanel(); }

  if (panelId == null) return null;

  var title = TITLE_MAP[panelId] || '';
  var customId = '';
  if (!title && panelId && panelId.startsWith('entries:')) {
    customId = panelId.replace('entries:', '');
    try {
      var st = GameState.currentState;
      var panels = (st && st.panels) || {};
      title = (panels[customId] && panels[customId].name) || '面板';
    } catch (e) { title = '面板'; }
  }

  var styles = RN.StyleSheet.create({
    mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 12 },
    inner: {
      backgroundColor: c.bgCard || c.bgPanel || c.bg,
      borderRadius: tk.radius.lg || 8,
      width: '100%', maxWidth: 640, maxHeight: '92%',
      alignSelf: 'center', overflow: 'hidden'
    },
    header: {
      paddingHorizontal: 18, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.hair,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'
    },
    title: { fontSize: f.lg, color: c.text },
    closeBtn: {
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: tk.radius.sm || 4, backgroundColor: c.hair
    },
    closeText: { color: c.textMuted || c.muted, fontSize: f.base }
  });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <TouchableWithoutFeedback onPress={close}>
        <View style={styles.mask}>
          <TouchableWithoutFeedback onPress={function () { /* 吞面板内点击 */ }}>
            <View style={styles.inner}>
              <View style={styles.header}>
                <Text style={styles.title}>{title || '面板'}</Text>
                <TouchableOpacity style={styles.closeBtn} activeOpacity={0.7} onPress={close}>
                  <Text style={styles.closeText}>{'×'}</Text>
                </TouchableOpacity>
              </View>
              <ScrollView>
                <View style={{ padding: 14 }}>
                  {panelId === 'statusCard' ? <StatusCardPanel tokens={tk} /> : null}
                  {panelId === 'log' ? <LogPanel tokens={tk} /> : null}
                  {panelId === 'diceHistory' ? <DiceHistoryPanel tokens={tk} /> : null}
                  {panelId === 'character' ? <CharacterPanel tokens={tk} /> : null}
                  {panelId === 'shop' ? <ShopIndexPanel tokens={tk} /> : null}
                  {panelId === 'tasks' ? <TasksPanel tokens={tk} /> : null}
                  {panelId === 'achievements' ? <AchievementsPanel tokens={tk} /> : null}
                  {panelId === 'endings' ? <EndingsPanel tokens={tk} /> : null}
                  {panelId === 'storyNodes' ? <StoryNodesPanel tokens={tk} /> : null}
                  {panelId === 'eventProposals' ? <EventProposalsPanel tokens={tk} /> : null}
                  {panelId === 'changeProposals' ? <ChangeProposalsPanel tokens={tk} /> : null}
                  {panelId === 'npc' ? <NpcPanel tokens={tk} /> : null}
                  {panelId === 'errorLog' ? <ErrorLogPanel tokens={tk} /> : null}
                  {panelId === 'debug' ? <DebugPanel tokens={tk} /> : null}
                  {panelId === 'infoPhone' ? <InfoPhonePanel tokens={tk} /> : null}
                  {customId ? <EntriesPanel tokens={tk} panelId={customId} /> : null}
                </View>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

module.exports = { PanelHost: PanelHost };
