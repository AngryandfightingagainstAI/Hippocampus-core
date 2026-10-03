// ============================================================
// 战役 4 · 批次 4-5a：设置页 · GM 面板 tab（B 类）
// grounding：ui_settings.js renderGmInto（L487-507）/ saveGm（L509-522）
//   - 引擎层规则只读块（GM_DEFAULTS.engineRules，prompt_builder 双仓共享）
//   - 写作密度：五档分段（极简/精简/标准/丰富/极繁，用户裁决 4 用 SetChips）
//   - 卡带层风格 textarea + 禁用词表 textarea + 保存
// 数据层：settings_model.loadGmState/saveGmState（A 类）
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

function GmTab() {
  var tk = useTheme().tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var st = React.useState(function () { return Model.loadGmState(); });
  var gm = st[0];
  var setGm = st[1];

  function setField(key, v) {
    setGm(function (prev) {
      var next = Object.assign({}, prev);
      next[key] = v;
      return next;
    });
  }

  function save() {
    Model.saveGmState(gm);
    try { Platform.ui.toast('已保存', { type: 'success' }); } catch (e) {}
  }

  // 引擎层规则只读（GM_DEFAULTS 挂在 globalThis，PromptBuilder bootstrap 已载）
  var engineRules = [];
  try {
    engineRules = (globalThis.GM_DEFAULTS && globalThis.GM_DEFAULTS.engineRules) || [];
  } catch (e) { engineRules = []; }

  return React.createElement(
    ScrollView,
    { style: { flex: 1 } },
    React.createElement(
      View,
      { style: { paddingBottom: 24 } },
      React.createElement(
        Controls.SetCard,
        { title: '引擎层规则（只读）' },
        React.createElement(
          View,
          {
            style: {
              borderWidth: 1,
              borderColor: c.hair,
              borderRadius: tk.radius.sm,
              padding: 10,
              backgroundColor: c.bg
            }
          },
          engineRules.map(function (r, i) {
            return React.createElement(
              Text,
              {
                key: i,
                style: { fontSize: f.xs, color: c.muted, lineHeight: Math.round(f.xs * 1.8) }
              },
              '· ' + r
            );
          })
        )
      ),
      React.createElement(
        Controls.SetCard,
        { title: '写作密度' },
        React.createElement(
          Controls.SetNote,
          { first: true },
          '决定 AI 每轮写多少环境、意象、细节。左简右繁。'
        ),
        React.createElement(Controls.SetChips, {
          options: Model.DENSITY_STEPS.map(function (d) { return { value: d.value, label: d.label }; }),
          value: gm.density,
          onChange: function (v) { setField('density', v); }
        })
      ),
      React.createElement(
        Controls.SetCard,
        { title: '卡带层风格' },
        React.createElement(Controls.SetTextInput, {
          value: gm.cardStyle,
          onChangeText: function (v) { setField('cardStyle', v); },
          multiline: true,
          rows: 5
        })
      ),
      React.createElement(
        Controls.SetCard,
        { title: '禁用词表' },
        React.createElement(Controls.SetTextInput, {
          value: gm.bannedWords,
          onChangeText: function (v) { setField('bannedWords', v); },
          multiline: true,
          rows: 4
        }),
        React.createElement(
          View,
          { style: { marginTop: 10 } },
          React.createElement(Controls.SetButton, { label: '保存', onPress: save, kind: 'primary' })
        )
      )
    )
  );
}

module.exports = { GmTab: GmTab };
