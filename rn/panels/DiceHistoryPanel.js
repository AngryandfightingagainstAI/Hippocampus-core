// ============================================================
// 批次 H4 · 骰子历史面板（B 类，RN 组件）
// 桌面锚点：engine/ui_panels.js:184 renderDiceHistoryPanel
// 数据源：DiceHistory.listAll() / getStats()（engine/dice_history.js:102/127）
// 空态逐字照桌面：「还没有骰子记录。」
// P6·S3-7：补「清空历史」按钮（桌面 ui_panels.js:177-182 clearDiceHistory /
//   :206-207 按钮），confirmAsync「清空所有骰子历史？」→ DiceHistory.clear()。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var TouchableOpacity = RN.TouchableOpacity;

var PanelData = require('./panel_data.js');

function DiceHistoryPanel(props) {
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;
  var bump = React.useState(0)[1];
  var view = PanelData.computeDiceHistory();

  // P6·S3-7：清空历史（桌面 ui_panels.js:177-182）
  function doClear() {
    Platform.ui.confirmAsync('清空所有骰子历史？').then(function (ok) {
      if (!ok) return;
      try { DiceHistory.clear(); } catch (e) { /* 清空失败保持面板（同桌面静默） */ }
      bump(function (v) { return v + 1; });
    });
  }

  var styles = RN.StyleSheet.create({
    empty: { color: c.muted, fontSize: f.base, textAlign: 'center', paddingVertical: 20 },
    btnRow: { flexDirection: 'row', marginBottom: 12 },
    dangerBtn: {
      borderWidth: 1, borderColor: c.danger, borderRadius: tk.radius.sm || 4,
      paddingHorizontal: 14, paddingVertical: 8
    },
    dangerBtnText: { fontSize: f.sm, color: c.danger },
    stats: {
      backgroundColor: c.bgPanel || c.bg,
      borderRadius: tk.radius.md || 6,
      paddingHorizontal: 12, paddingVertical: 10,
      marginBottom: 14, fontSize: f.base, color: c.text
    },
    secTitle: {
      fontSize: f.sm, color: c.muted, letterSpacing: 1,
      marginBottom: 6, borderBottomWidth: 1, borderBottomColor: c.hair, paddingBottom: 4
    },
    row: {
      paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border || c.hair
    },
    meta: { fontSize: f.xs, color: c.textMuted2 || c.faint, marginBottom: 2 },
    detail: { fontSize: f.sm, color: c.text2 || c.text, fontFamily: 'monospace' }
  });

  if (!view.list.length) {
    return (
      <View>
        {view.stats ? (
          <Text style={styles.stats}>
            {'总计 ' + view.stats.total + ' 条 · 成功 ' + view.stats.success + ' · 失败 ' + view.stats.fail}
          </Text>
        ) : null}
        <Text style={styles.empty}>{view.emptyText}</Text>
      </View>
    );
  }

  return (
    <View>
      {view.stats ? (
        <Text style={styles.stats}>
          {'总计 ' + view.stats.total + ' 条 · 成功 ' + view.stats.success + ' · 失败 ' + view.stats.fail}
        </Text>
      ) : null}
      <Text style={styles.secTitle}>{'最近 ' + Math.min(view.list.length, 50) + ' 条'}</Text>
      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.dangerBtn} activeOpacity={0.7} onPress={doClear}>
          <Text style={styles.dangerBtnText}>{'清空历史'}</Text>
        </TouchableOpacity>
      </View>
      {view.list.map(function (x, i) {
        var label = x.label ? '【' + x.label + '】' : '';
        return (
          <View key={i} style={styles.row}>
            <Text style={styles.meta}>{(x.gameTime || '') + ' · 第 ' + x.round + ' 轮'}</Text>
            <Text style={styles.detail}>{label + ' ' + x.detail}</Text>
          </View>
        );
      })}
    </View>
  );
}

module.exports = DiceHistoryPanel;
