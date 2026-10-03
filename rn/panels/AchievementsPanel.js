// ============================================================
// 批次 H6 · 成就面板（B 类，RN 组件）
// 桌面锚点：engine/ui_panels.js:135-172 renderAchievementsPanel
// 数据源：Achievements.listAll() = GameState.currentCard.worldbook.achievements
// 空态逐字照桌面：「成就模块未加载。」（其余：读取成就失败：/这个卡带还没有成就。）
// hidden 且未解锁：panel_data.js 已把 name 改为「神秘成就」、desc 清空，组件直接渲染。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;

var PanelData = require('./panel_data.js');

function AchievementsPanel(props) {
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;
  var view = PanelData.computeAchievements();

  var styles = RN.StyleSheet.create({
    empty: { color: c.muted, fontSize: f.base, textAlign: 'center', paddingVertical: 20 },
    card: {
      backgroundColor: c.bgPanel || c.bg,
      borderRadius: tk.radius.md || 6,
      paddingHorizontal: 14, paddingVertical: 12,
      marginBottom: 10
    },
    headRow: { flexDirection: 'row', alignItems: 'center' },
    icon: { fontSize: f.md, color: c.accent, marginRight: 6 },
    title: { fontSize: f.md, color: c.text, fontWeight: '500', flexShrink: 1 },
    category: { fontSize: f.xs, color: c.textMuted2 || c.faint, marginTop: 4 },
    desc: { fontSize: f.sm, color: c.textMuted || c.muted, marginTop: 4 },
    status: { fontSize: f.xs, marginTop: 4 },
    unlockedAt: { fontSize: f.xs, color: c.textMuted2 || c.faint, marginTop: 2 }
  });

  if (!view.achievements.length) {
    return <Text style={styles.empty}>{view.emptyText}</Text>;
  }

  return (
    <View>
      {view.achievements.map(function (a, i) {
        var statusText = a.unlocked ? '已解锁' : '未解锁';
        var statusColor = a.unlocked ? c.success : c.muted;
        return (
          <View key={i} style={styles.card}>
            <View style={styles.headRow}>
              {a.icon ? <Text style={styles.icon}>{a.icon}</Text> : null}
              <Text style={styles.title}>{a.name}</Text>
            </View>
            {a.category ? <Text style={styles.category}>{'分类：' + a.category}</Text> : null}
            {a.desc ? <Text style={styles.desc}>{a.desc}</Text> : null}
            <Text style={[styles.status, { color: statusColor }]}>{statusText}</Text>
            {a.unlocked && a.unlockedAt ? <Text style={styles.unlockedAt}>{'解锁于 ' + a.unlockedAt}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

module.exports = AchievementsPanel;
