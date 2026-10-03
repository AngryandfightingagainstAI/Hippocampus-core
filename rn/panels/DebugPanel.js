// ============================================================
// P1-I · I-3 调试面板（B 类，RN 组件）
// 桌面锚点：engine/ui_panels.js:417 renderDebugPanel（入口 ui_core.js:62
//   叙事屏报头「调 试」文字链 → UI.openModal('debug')）；
// 四段只读：游戏时间 / playerData / 快照 / NPC 运行时。
// P10·A11：补第五、六段「预算配置」+「最近降级账本」，口径同 P9·S14 侧栏
//   SidebarDrawer.readPrompt()（不造第二口径）。
// 数据层：panel_data.computeDebug（A 类，JSON 字符串在此组装）。
// 纪律：颜色/字号只取自 useTheme() tokens。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;

var useTheme = require('../use_theme.js').useTheme;
var PanelData = require('./panel_data.js');

function DebugPanel() {
  var themeApi = useTheme();
  var tk = themeApi.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var view = PanelData.computeDebug();

  var styles = RN.StyleSheet.create({
    section: { marginBottom: 16 },
    title: { fontSize: f.sm, color: c.accent, marginBottom: 6, fontWeight: '500' },
    pre: {
      fontSize: f.xs,
      color: c.textMuted || c.muted,
      fontFamily: tk.fonts && tk.fonts.mono ? tk.fonts.mono : 'monospace',
      lineHeight: Math.round(f.xs * 1.6)
    }
  });

  function section(title, text) {
    return (
      <View style={styles.section}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.pre}>{text}</Text>
      </View>
    );
  }

  return (
    <View>
      {section('游戏时间', view.gameTime)}
      {section('playerData', view.playerData)}
      {section('快照', view.snapText)}
      {section('NPC 运行时', view.npcRuntime)}
      {section('预算配置', view.budgetText)}
      {section('最近降级账本', view.trimText)}
    </View>
  );
}

module.exports = DebugPanel;