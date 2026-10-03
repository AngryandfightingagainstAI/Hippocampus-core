// ============================================================
// 批次 H4 · 卡带自定义面板（B 类，RN 组件）
// 桌面锚点：engine/ui_panels.js:579 renderEntries（fallback ui_core.js:844）
// 数据源：GameState.currentState.panels[panelId].entries
// 裁定 3：按任意 panelId 路由，不写死 attrs/fame/social/world；按 num 排序。
// 元素四型：number / relation / switch / list（ui_panels.js:582-602）。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;

var PanelData = require('./panel_data.js');

function EntriesPanel(props) {
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;
  var view = PanelData.computeEntries(props.panelId);

  var styles = RN.StyleSheet.create({
    empty: { color: c.muted, fontSize: f.base, textAlign: 'center', paddingVertical: 20 },
    card: {
      backgroundColor: c.bgPanel || c.bg,
      borderRadius: tk.radius.md || 6,
      paddingHorizontal: 14, paddingVertical: 12,
      marginBottom: 10
    },
    title: { fontSize: f.md, color: c.text, fontWeight: '500' },
    sub: { fontSize: f.sm, color: c.textMuted || c.muted, marginTop: 4 },
    barTrack: { height: 4, backgroundColor: c.hair, borderRadius: 2, overflow: 'hidden', marginTop: 4, marginBottom: 2 },
    barFill: { height: 4, backgroundColor: c.accent },
    listItem: { fontSize: f.sm, color: c.textMuted || c.muted, marginTop: 2 }
  });

  // P6·S4-5：无条目即显空态（桌面 ui_core.js:848-849 —— 面板不存在
  // ⇒「（面板不存在）」；面板在但无条目 ⇒「（暂无条目）」）。原条件
  // 带名无条目时 name 为真 ⇒ 落到空视图，现改为只看 entries。
  if (!view.entries.length) {
    return <Text style={styles.empty}>{view.emptyText || '（面板不存在）'}</Text>;
  }

  return (
    <View>
      {view.entries.map(function (e, i) {
        if (e.type === 'number') {
          return (
            <View key={i} style={styles.card}>
              <Text style={styles.title}>{e.name + ' · ' + e.current + (e.max != null ? '/' + e.max : '')}</Text>
              {e.max != null ? (
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: e.pct + '%' }]} />
                </View>
              ) : null}
              {e.desc ? <Text style={styles.sub}>{e.desc}</Text> : null}
            </View>
          );
        }
        if (e.type === 'relation') {
          return (
            <View key={i} style={styles.card}>
              <Text style={styles.title}>{e.name + ' · ' + e.from + ' → ' + e.to + ' · ' + e.current}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: e.pct + '%' }]} />
              </View>
              {e.desc ? <Text style={styles.sub}>{e.desc}</Text> : null}
            </View>
          );
        }
        if (e.type === 'switch') {
          return (
            <View key={i} style={styles.card}>
              <Text style={styles.title}>{e.name}</Text>
              <Text style={styles.sub}>{e.value ? '已开启' : '未开启'}</Text>
            </View>
          );
        }
        if (e.type === 'list') {
          return (
            <View key={i} style={styles.card}>
              <Text style={styles.title}>{e.name}</Text>
              {e.items.length ? (
                e.items.map(function (t, j) {
                  return <Text key={j} style={styles.listItem}>{'· ' + t}</Text>;
                })
              ) : (
                <Text style={styles.sub}>{'（空）'}</Text>
              )}
            </View>
          );
        }
        return (
          <View key={i} style={styles.card}>
            <Text style={styles.title}>{e.name || ''}</Text>
          </View>
        );
      })}
    </View>
  );
}

module.exports = EntriesPanel;
