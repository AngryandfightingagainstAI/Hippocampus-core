// ============================================================
// 批次 H4 · 状态卡面板（B 类，RN 组件）
// 桌面锚点：engine/ui_panels.js:14 renderStatusCardPanel
// 数据源：StatusCard（engine/status_card.js:55 getConfig / :61 isEnabled）
// 空态逐字照桌面：「本卡带未启用状态卡系统。」
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;

var PanelData = require('./panel_data.js');

function StatusCardPanel(props) {
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;
  var view = PanelData.computeStatusCard();

  var styles = RN.StyleSheet.create({
    empty: { color: c.muted, fontSize: f.base, textAlign: 'center', paddingVertical: 20 },
    // P10·A9：副引导句（范式照 EventProposalsPanel.js:74 的 subText 行）
    hint: { fontSize: f.xs, color: c.faint, textAlign: 'center', marginTop: 6, paddingHorizontal: 12 },
    section: { marginBottom: 14 },
    secTitle: {
      fontSize: f.sm, color: c.muted, letterSpacing: 1,
      marginBottom: 6, borderBottomWidth: 1, borderBottomColor: c.hair, paddingBottom: 4
    },
    row: { flexDirection: 'row', marginBottom: 4 },
    k: { width: 80, fontSize: f.sm, color: c.faint },
    v: { flex: 1, fontSize: f.sm, color: c.text },
    body: { fontSize: f.sm, color: c.text2 || c.text, lineHeight: Math.round(f.sm * 1.6) },
    barTrack: { height: 4, backgroundColor: c.hair, borderRadius: 2, overflow: 'hidden', marginTop: 4, marginBottom: 2 },
    barFill: { height: 4, backgroundColor: c.accent },
    relRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    relName: { fontSize: f.sm, color: c.text2 || c.text, width: 90 },
    relPct: { fontSize: f.xs, color: c.muted }
  });

  if (!view.enabled) {
    return (
      <View>
        <Text style={styles.empty}>{view.emptyText}</Text>
        {view.subText ? <Text style={styles.hint}>{view.subText}</Text> : null}
      </View>
    );
  }
  if (view.emptyText) {
    return (
      <View>
        <Text style={styles.empty}>{view.emptyText}</Text>
        {view.subText ? <Text style={styles.hint}>{view.subText}</Text> : null}
      </View>
    );
  }

  return (
    <View>
      {view.sections.map(function (sec, i) {
        return (
          <View key={i} style={styles.section}>
            <Text style={styles.secTitle}>{sec.title}</Text>
            {sec.type === 'time' || sec.type === 'fields' ? (
              (sec.rows || []).map(function (r, j) {
                return (
                  <View key={j} style={styles.row}>
                    <Text style={styles.k}>{r.k}</Text>
                    <Text style={styles.v}>{r.v}</Text>
                  </View>
                );
              })
            ) : null}
            {sec.type === 'relation' ? (
              <View>
                <View style={styles.relRow}>
                  <Text style={styles.relName}>{sec.name}</Text>
                  <Text style={styles.relPct}>{String(sec.current)}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: sec.pct + '%' }]} />
                </View>
              </View>
            ) : null}
            {sec.type === 'innerVoice' || sec.type === 'custom' ? (
              <Text style={styles.body}>{sec.text}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

module.exports = StatusCardPanel;
