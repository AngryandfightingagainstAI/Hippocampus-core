// ============================================================
// 批次 H6 · 剧情节点面板（B 类，RN 组件）
// 桌面锚点：engine/ui_core.js:1211-1283 renderStoryNodesPanel
// 数据源：StoryNodes.getSummary()
// 空态逐字照桌面：「节点模块未加载。」（其余：未在游戏中。/本卡带未启用节点系统。/（还没有进入任何节点））
// 可进入区点击 → StoryNodes.enterNode(id, 'player')，成功后本地 bump 刷新。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var TouchableOpacity = RN.TouchableOpacity;

var PanelData = require('./panel_data.js');
var StoryStore = require('../story_store.js');

function StoryNodesPanel(props) {
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var bump = React.useState(0)[1];
  var view = PanelData.computeStoryNodes();

  var styles = RN.StyleSheet.create({
    empty: { color: c.muted, fontSize: f.base, textAlign: 'center', paddingVertical: 20 },
    hint: { fontSize: f.xs, color: c.faint, marginTop: 12, textAlign: 'center' },
    sectionHead: { fontSize: f.sm, color: c.accent, marginTop: 12, marginBottom: 6, fontWeight: '500' },
    card: {
      backgroundColor: c.bgPanel || c.bg,
      borderRadius: tk.radius.md || 6,
      paddingHorizontal: 14, paddingVertical: 12,
      marginBottom: 10
    },
    title: { fontSize: f.md, color: c.text, fontWeight: '500' },
    type: { fontSize: f.xs, color: c.textMuted2 || c.faint, marginTop: 2 },
    meta: { fontSize: f.sm, color: c.textMuted || c.muted, marginTop: 4 },
    entryRow: {
      backgroundColor: c.bgPanel || c.bg,
      borderRadius: tk.radius.sm || 4,
      paddingHorizontal: 14, paddingVertical: 10,
      marginBottom: 6
    },
    entryText: { fontSize: f.sm, color: c.text },
    doneText: { fontSize: f.sm, color: c.textMuted || c.muted, marginLeft: 4, marginTop: 2 }
  });

  function onEnter(id) {
    try {
      var r = StoryNodes.enterNode(id, 'player');
      if (r && r.ok) {
        bump(function (v) { return v + 1; });
      } else {
        StoryStore.pushToast((r && r.reason) || '进入节点失败', { type: 'warn' });
      }
    } catch (e) {
      StoryStore.pushToast('进入节点异常：' + (e && e.message || e), { type: 'error' });
    }
  }

  if (view.emptyText) {
    return (
      <View>
        <Text style={styles.empty}>{view.emptyText}</Text>
        {view.subText ? <Text style={styles.hint}>{view.subText}</Text> : null}
      </View>
    );
  }

  var cur = view.currentNode;

  return (
    <View>
      {cur ? (
        <View>
          <Text style={styles.sectionHead}>{'当前节点'}</Text>
          <View style={styles.card}>
            <Text style={styles.title}>{cur.name}</Text>
            {cur.type ? <Text style={styles.type}>{'类型：' + cur.type}</Text> : null}
            {cur.hint ? <Text style={styles.meta}>{'提示：' + cur.hint}</Text> : null}
            {cur.exitHint ? <Text style={styles.meta}>{'退出提示：' + cur.exitHint}</Text> : null}
          </View>
        </View>
      ) : null}

      {view.completed.length ? (
        <View>
          <Text style={styles.sectionHead}>{'已完成节点'}</Text>
          {view.completed.map(function (n, i) {
            return <Text key={i} style={styles.doneText}>{'✓ ' + n.name}</Text>;
          })}
        </View>
      ) : null}

      {view.available.length ? (
        <View>
          <Text style={styles.sectionHead}>{'可进入节点'}</Text>
          {view.available.map(function (n, i) {
            return (
              <TouchableOpacity
                key={i}
                style={styles.entryRow}
                activeOpacity={0.7}
                onPress={function () { onEnter(n.id); }}
              >
                <Text style={styles.entryText}>{'→ ' + n.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {view.subText ? <Text style={styles.hint}>{view.subText}</Text> : null}
    </View>
  );
}

module.exports = StoryNodesPanel;
