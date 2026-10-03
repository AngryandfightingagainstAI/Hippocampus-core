// ============================================================
// 战役 4 · 批次 4-5a：设置页 · 现实感知 tab（B 类）
// grounding：ui_panels.js renderRealtimeSettings（L350-397）+
//   _setRealtimeEnabled（L399-407，g.realtime.enabled 直写）+
//   _setRealtimePatch（L409-412，Realtime.setGlobalConfig 即时写）
//   - 总开关 + 4 个 aware 开关
//   - 卡带覆盖警告（card.realtime.enabled === true）
//   - 当前状态：Realtime.formatNow / getLastSeenAt / formatGap
// 数据层：engine/realtime.js 模块 API（RN 仓已有，bootstrap 已挂载）
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var ScrollView = RN.ScrollView;
var Text = RN.Text;

var useTheme = require('../../use_theme.js').useTheme;
var Model = require('../../settings_model.js');
var Controls = require('../../components/settings/controls.js');

function RealtimeTab() {
  var tk = useTheme().tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var st = React.useState(function () {
    var R = globalThis.Realtime;
    return {
      enabled: !!R.isEnabled(),
      cfg: R.getGlobalConfig() || {}
    };
  });
  var rt = st[0];
  var setRt = st[1];

  var cardEnabled = false;
  try {
    var card = globalThis.GameState.currentCard;
    cardEnabled = !!(card && card.realtime && card.realtime.enabled === true);
  } catch (e) { cardEnabled = false; }

  function setEnabled(v) {
    // _setRealtimeEnabled 语义：g.realtime.enabled 直写
    Model.updateGlobal(function (g) {
      g.realtime = g.realtime || {};
      g.realtime.enabled = !!v;
    });
    setRt(function (prev) { return { enabled: !!v, cfg: prev.cfg }; });
  }

  function patch(p) {
    globalThis.Realtime.setGlobalConfig(p);
    setRt(function (prev) { return { enabled: prev.enabled, cfg: globalThis.Realtime.getGlobalConfig() || {} }; });
  }

  var nowInfo = null;
  var lastSeen = null;
  try {
    nowInfo = globalThis.Realtime.formatNow();
    lastSeen = globalThis.Realtime.getLastSeenAt();
  } catch (e2) {}

  var gapText = '';
  if (lastSeen) {
    try { gapText = globalThis.Realtime.formatGap(Date.now() - lastSeen); } catch (e3) { gapText = ''; }
  }

  var AWARE_FIELDS = [
    { key: 'awareDate', label: '告诉 AI 年月日' },
    { key: 'awareTime', label: '告诉 AI 具体时间' },
    { key: 'awareWeekday', label: '告诉 AI 星期几' },
    { key: 'awareGap', label: '告诉 AI 距上次会话多久' }
  ];

  return React.createElement(
    ScrollView,
    { style: { flex: 1 } },
    React.createElement(
      View,
      { style: { paddingBottom: 24 } },
      React.createElement(
        Controls.SetCard,
        { title: '现实感知' },
        React.createElement(
          Controls.SetNote,
          { first: true },
          '把现实世界的时间 / 距上次会话的间隔告诉 AI。适合人机恋、长期陪伴类玩法。卡带也可以单独开启。'
        ),
        React.createElement(Controls.SetSwitchRow, {
          label: '启用现实感知',
          value: rt.enabled,
          onValueChange: setEnabled
        }),
        cardEnabled
          ? React.createElement(
              View,
              {
                style: {
                  borderLeftWidth: 3,
                  borderLeftColor: c.warning,
                  backgroundColor: c.bgPanel,
                  padding: 10,
                  borderRadius: tk.radius.sm,
                  marginTop: 6
                }
              },
              React.createElement(
                Text,
                { style: { fontSize: f.xs, color: c.warning, lineHeight: Math.round(f.xs * 1.7) } },
                '⚠ 当前卡带自身启用了现实感知，无论全局开关是否打开，AI 都会收到现实时间。'
              )
            )
          : null,
        React.createElement(
          View,
          { style: { borderTopWidth: 1, borderTopColor: c.hair, marginTop: 12, paddingTop: 8 } },
          AWARE_FIELDS.map(function (fdef) {
            return React.createElement(Controls.SetSwitchRow, {
              key: fdef.key,
              label: fdef.label,
              value: !!(rt.cfg && rt.cfg[fdef.key]),
              onValueChange: function (v) {
                var p = {};
                p[fdef.key] = v;
                patch(p);
              }
            });
          })
        )
      ),
      React.createElement(
        Controls.SetCard,
        { title: '当前状态' },
        nowInfo
          ? React.createElement(
              Controls.SetRow,
              { label: '现实时间' },
              React.createElement(
                Text,
                { style: { fontSize: f.sm, color: c.ink2 } },
                nowInfo.date + ' ' + nowInfo.weekday + ' ' + nowInfo.time
              )
            )
          : null,
        lastSeen
          ? React.createElement(
              View,
              null,
              React.createElement(
                Controls.SetRow,
                { label: '距上次会话' },
                React.createElement(Text, { style: { fontSize: f.sm, color: c.ink2 } }, gapText)
              ),
              React.createElement(
                Controls.SetNote,
                null,
                '上次记录于 ' + new Date(lastSeen).toLocaleString()
              )
            )
          : React.createElement(Controls.SetNote, { first: true }, '（还没有会话记录）'),
        React.createElement(
          Controls.SetNote,
          null,
          'AI 每轮都会收到这些信息（如果开启），用于自然处理"过了几天""现在几点"这类叙述。'
        )
      )
    )
  );
}

module.exports = { RealtimeTab: RealtimeTab };
