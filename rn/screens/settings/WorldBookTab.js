// ============================================================
// P2 · S3：设置页 · 世界书 tab（B 类容器）
// grounding：桌面 engine/ui_core.js:170-207 renderWorldbookInto（卡带选择 +
//   12 个 wb-subtab 横条 + 分发到各 WB_*.html()）+ engine/editor.js:216-238
//   WB_WorldBook 容器（currentCardId / currentSubTab / switchSubTab /
//   pickCard / restoreLast）。
// 子页清单与顺序、中文名逐字照桌面 ui_core.js:174-179。
// 数据层：engine/wb_common.js（WB.DirtyGuard）+ 各 engine/wb/<name>.js
//   （RN 侧纯逻辑，A 类，零 DOM）；本组件只做「选卡带 + 选子页 + 渲染」。
// 交互适配：桌面 switchSubTab/pickCard 先 await DirtyGuard.checkAny()，
//   RN 同语义（Promise）；文案逐字。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var TouchableOpacity = RN.TouchableOpacity;

var useTheme = require('../../use_theme.js').useTheme;
var Controls = require('../../components/settings/controls.js');
var StoryStore = require('../../story_store.js');
var WB = require('../../../engine/wb_common.js');

var WorldSettingEditor = require('./worldbook/worldSettingEditor.js').WorldSettingEditor;
var MapEditor = require('./worldbook/mapEditor.js').MapEditor;
var TimelineEditor = require('./worldbook/timelineEditor.js').TimelineEditor;
var NpcEditor = require('./worldbook/npcEditor.js').NpcEditor;
var FactionEditor = require('./worldbook/factionEditor.js').FactionEditor;
var ItemEditor = require('./worldbook/itemEditor.js').ItemEditor;
var SkillEditor = require('./worldbook/skillEditor.js').SkillEditor;
var ShopEditor = require('./worldbook/shopEditor.js').ShopEditor;
var CurrencyEditor = require('./worldbook/currencyEditor.js').CurrencyEditor;
var RaceEditor = require('./worldbook/raceEditor.js').RaceEditor;
var OccupationEditor = require('./worldbook/occupationEditor.js').OccupationEditor;
var OutputsEditor = require('./worldbook/outputsEditor.js').OutputsEditor;

// 子页清单（桌面 ui_core.js:174-179 逐字：id / name / 顺序）
var SUB_TABS = [
  { id: 'worldSetting', name: '世界设定', Editor: WorldSettingEditor },
  { id: 'maps', name: '地图', Editor: MapEditor },
  { id: 'timeline', name: '时间线', Editor: TimelineEditor },
  { id: 'npcs', name: 'NPC', Editor: NpcEditor },
  { id: 'factions', name: '势力', Editor: FactionEditor },
  { id: 'items', name: '物品', Editor: ItemEditor },
  { id: 'skills', name: '法术', Editor: SkillEditor },
  { id: 'shops', name: '商店', Editor: ShopEditor },
  { id: 'currency', name: '货币', Editor: CurrencyEditor },
  { id: 'races', name: '种族', Editor: RaceEditor },
  { id: 'occupations', name: '职业', Editor: OccupationEditor },
  { id: 'outputs', name: '产出物', Editor: OutputsEditor }
];

function WorldBookTab() {
  var tk = useTheme().tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var cardState = React.useState(null);
  var cardId = cardState[0];
  var setCardId = cardState[1];

  var subState = React.useState('worldSetting');   // 桌面 WB_WorldBook.currentSubTab 默认 'worldSetting'
  var curSub = subState[0];
  var setCurSub = subState[1];

  // 卡带清单（桌面 :171-173 Storage.getAllCards()）
  var cards = {};
  try { cards = globalThis.Storage.getAllCards() || {}; } catch (e) { cards = {}; }
  var cardOptions = [{ value: '', label: '-- 选择卡带 --' }];
  Object.keys(cards).forEach(function (k) {
    var cd = cards[k] || {};
    cardOptions.push({ value: cd.cardId || k, label: cd.cardName || cd.cardId || k });
  });

  // 桌面 WB_WorldBook.restoreLast()：上次选过的卡带优先
  React.useEffect(function () {
    var last = null;
    try { if (globalThis.LocalStore) last = globalThis.LocalStore.getItem('wb_currentCardId'); } catch (e0) { last = null; }
    if (last && cards[last]) { setCardId(last); return; }
    var keys = Object.keys(cards);
    if (keys.length > 0) setCardId(cards[keys[0]].cardId || keys[0]);
  }, []);

  function switchSub(id) {
    if (id === curSub) return;
    // 桌面 :221-224：先过脏数据闸
    WB.DirtyGuard.checkAny().then(function (okGo) {
      if (!okGo) return;
      setCurSub(id);
    });
  }
  function pickCard(id) {
    // 桌面 :226-232：先过脏数据闸
    WB.DirtyGuard.checkAny().then(function (okGo) {
      if (!okGo) return;
      setCardId(id || null);
      setCurSub('worldSetting');
      try { if (globalThis.LocalStore) globalThis.LocalStore.setItem('wb_currentCardId', id || ''); } catch (e1) { /* 忽略 */ }
    });
  }

  var styles = React.useMemo(function () {
    return RN.StyleSheet.create({
      toolbar: { marginBottom: 10 },
      subbar: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
      subchip: {
        borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
        paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, marginBottom: 6,
        backgroundColor: c.bgCard
      },
      subchipActive: { borderColor: c.primary, backgroundColor: c.primary },
      subchipText: { fontSize: f.xs, color: c.ink },
      subchipTextActive: { color: c.bgCard }
    });
  }, [tk]);

  var active = null;
  for (var i = 0; i < SUB_TABS.length; i++) { if (SUB_TABS[i].id === curSub) active = SUB_TABS[i]; }

  return React.createElement(
    View,
    null,
    React.createElement(
      View,
      { style: styles.toolbar },
      React.createElement(Controls.SetSelect, {
        label: '卡带',
        value: cardId || '',
        options: cardOptions,
        onChange: pickCard
      })
    ),
    cardId ? React.createElement(
      View,
      { style: styles.subbar },
      SUB_TABS.map(function (t) {
        var on = t.id === curSub;
        return React.createElement(
          TouchableOpacity,
          { key: t.id, onPress: function () { switchSub(t.id); }, style: [styles.subchip, on ? styles.subchipActive : null] },
          React.createElement(Text, { style: [styles.subchipText, on ? styles.subchipTextActive : null] }, t.name)
        );
      })
    ) : null,
    cardId
      ? (active ? React.createElement(active.Editor, { cardId: cardId }) : null)
      : React.createElement(Controls.SetNote, null, '选择卡带开始编辑。')
  );
}

module.exports = { WorldBookTab: WorldBookTab };
