// ============================================================
// 批次 H6 · 任务面板（B 类，RN 组件）
// 桌面锚点：engine/ui_panels.js:88-130 renderTasksPanel
// 数据源：Tasks.listAll() = GameState.currentState.tasks
// 空态逐字照桌面：「任务模块未加载。」（其余：读取任务失败：/暂无任务。）
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;

var PanelData = require('./panel_data.js');

var TYPE_LABEL = { main: '主线', side: '支线', daily: '日常' };
var TYPE_COLOR_KEY = { main: 'accent', side: 'info', daily: 'warning' };

function fmtReward(r) {
  if (!r) return '';
  if (typeof r === 'string') return r;
  return r.desc || r.name || r.label || '';
}

function TasksPanel(props) {
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;
  var view = PanelData.computeTasks();

  var styles = RN.StyleSheet.create({
    empty: { color: c.muted, fontSize: f.base, textAlign: 'center', paddingVertical: 20 },
    card: {
      backgroundColor: c.bgPanel || c.bg,
      borderRadius: tk.radius.md || 6,
      paddingHorizontal: 14, paddingVertical: 12,
      marginBottom: 10
    },
    headRow: { flexDirection: 'row', alignItems: 'center' },
    title: { fontSize: f.md, color: c.text, fontWeight: '500', flexShrink: 1 },
    tag: { fontSize: f.xs, marginLeft: 8, marginTop: 2 },
    desc: { fontSize: f.sm, color: c.textMuted || c.muted, marginTop: 4 },
    step: { fontSize: f.sm, color: c.textMuted || c.muted, marginTop: 2, marginLeft: 4 },
    stepDone: { color: c.success },
    reward: { fontSize: f.xs, color: c.textMuted2 || c.faint, marginTop: 6 }
  });

  if (!view.tasks.length) {
    return <Text style={styles.empty}>{view.emptyText}</Text>;
  }

  return (
    <View>
      {view.tasks.map(function (t, i) {
        var typeLabel = TYPE_LABEL[t.type] || '';
        var typeColor = c[TYPE_COLOR_KEY[t.type]] || c.accent;
        var rewardStr = fmtReward(t.reward);
        return (
          <View key={i} style={styles.card}>
            <View style={styles.headRow}>
              <Text style={styles.title}>{t.name}</Text>
              {typeLabel ? <Text style={[styles.tag, { color: typeColor }]}>{'· ' + typeLabel}</Text> : null}
            </View>
            {t.desc ? <Text style={styles.desc}>{t.desc}</Text> : null}
            {t.steps.length ? (
              <View>
                {t.steps.map(function (s, j) {
                  return (
                    <Text
                      key={j}
                      style={[styles.step, s.done ? styles.stepDone : null]}
                    >
                      {(s.done ? '✓ ' : '○ ') + s.desc + (s.done ? '（已完成）' : '')}
                    </Text>
                  );
                })}
              </View>
            ) : null}
            {rewardStr ? <Text style={styles.reward}>{'奖励：' + rewardStr}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

module.exports = TasksPanel;
