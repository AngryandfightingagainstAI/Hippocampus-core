// ============================================================
// 批次 H6 · 事件提议面板（B 类，RN 组件）
// 桌面锚点：engine/ui_core.js:853-900
// 数据源：Events.getPendingProposals()
// 空态逐字照桌面：「事件模块未加载。」（其余：未在游戏中。/暂无待审核的事件提议。）
// 接受 → Events.confirmProposal(id)；拒绝 → Events.rejectProposal(id)。
// 引擎调用 try/catch 包裹，点击后本地 bump 刷新。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var TouchableOpacity = RN.TouchableOpacity;

var PanelData = require('./panel_data.js');
var StoryStore = require('../story_store.js');

function EventProposalsPanel(props) {
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var bump = React.useState(0)[1];
  var view = PanelData.computeEventProposals();

  var styles = RN.StyleSheet.create({
    empty: { color: c.muted, fontSize: f.base, textAlign: 'center', paddingVertical: 20 },
    hint: { fontSize: f.xs, color: c.faint, marginTop: 12, textAlign: 'center' },
    header: { fontSize: f.sm, color: c.textMuted || c.muted, marginBottom: 10 },
    card: {
      backgroundColor: c.bgPanel || c.bg,
      borderRadius: tk.radius.md || 6,
      paddingHorizontal: 14, paddingVertical: 12,
      marginBottom: 10
    },
    title: { fontSize: f.md, color: c.text, fontWeight: '500' },
    desc: { fontSize: f.sm, color: c.textMuted || c.muted, marginTop: 4 },
    reason: { fontSize: f.xs, color: c.textMuted2 || c.faint, marginTop: 4 },
    btnRow: { flexDirection: 'row', marginTop: 10 },
    btn: {
      flex: 1, paddingVertical: 8, borderRadius: tk.radius.sm || 4,
      alignItems: 'center', justifyContent: 'center', marginRight: 8
    },
    btnAccept: { backgroundColor: c.success },
    btnReject: { backgroundColor: c.danger, marginRight: 0 },
    btnText: { color: c.bg, fontSize: f.sm }
  });

  function onAccept(id) {
    try {
      Events.confirmProposal(id);
    } catch (e) {
      StoryStore.pushToast('接受异常：' + (e && e.message || e), { type: 'error' });
    }
    bump(function (v) { return v + 1; });
  }

  function onReject(id) {
    try {
      Events.rejectProposal(id);
    } catch (e) {
      StoryStore.pushToast('拒绝异常：' + (e && e.message || e), { type: 'error' });
    }
    bump(function (v) { return v + 1; });
  }

  if (!view.proposals.length) {
    return (
      <View>
        <Text style={styles.empty}>{view.emptyText}</Text>
        {view.subText ? <Text style={styles.hint}>{view.subText}</Text> : null}
      </View>
    );
  }

  return (
    <View>
      {view.header ? <Text style={styles.header}>{view.header}</Text> : null}
      {view.proposals.map(function (p, i) {
        return (
          <View key={i} style={styles.card}>
            <Text style={styles.title}>{p.title}</Text>
            {p.desc ? <Text style={styles.desc}>{p.desc}</Text> : null}
            {p.reason ? <Text style={styles.reason}>{'理由：' + p.reason}</Text> : null}
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnAccept]}
                activeOpacity={0.7}
                onPress={function () { onAccept(p.id); }}
              >
                <Text style={styles.btnText}>{'接受'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnReject]}
                activeOpacity={0.7}
                onPress={function () { onReject(p.id); }}
              >
                <Text style={styles.btnText}>{'拒绝'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

module.exports = EventProposalsPanel;
