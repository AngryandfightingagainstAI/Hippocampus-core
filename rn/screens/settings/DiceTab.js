// ============================================================
// 战役 4 · 批次 4-5a：设置页 · 骰子规则 tab（B 类）
// grounding：ui_dice_settings.js（render/saveFromUI/reset 逐字语义）
//   - 总开关 + 功能细项 9 + 行为 5（字段清单在 settings_model）
//   - 总开关关闭 → 两卡半透明禁用（render L108-114 联动）
//   - 保存 → saveDiceConfig；恢复默认 → confirmAsync（OverlayHost 承接）
// 数据层：settings_model.getDiceConfig/saveDiceConfig（A 类，Node 可测）
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var ScrollView = RN.ScrollView;

var useTheme = require('../../use_theme.js').useTheme;
var Model = require('../../settings_model.js');
var Controls = require('../../components/settings/controls.js');

function DiceTab() {
  var tk = useTheme().tokens;
  var c = tk.colors;

  var st = React.useState(function () { return Model.getDiceConfig(); });
  var cfg = st[0];
  var setCfg = st[1];

  function setField(key, v) {
    setCfg(function (prev) {
      var next = Object.assign({}, prev);
      next[key] = v;
      return next;
    });
  }

  function save() {
    Model.saveDiceConfig(cfg);
    try { Platform.ui.toast('已保存', { type: 'success' }); } catch (e) {}
  }

  function reset() {
    Platform.ui.confirmAsync('恢复默认？').then(function (ok) {
      if (!ok) return;
      Model.saveDiceConfig(Model.DICE_DEFAULTS);
      setCfg(Model.getDiceConfig());
    });
  }

  var dim = !cfg.enabled ? { opacity: 0.5 } : null;

  return React.createElement(
    ScrollView,
    { style: { flex: 1 } },
    React.createElement(
      View,
      { style: { paddingBottom: 24 } },
      React.createElement(
        Controls.SetCard,
        { title: '骰子系统' },
        React.createElement(Controls.SetSwitchRow, {
          label: '启用骰子系统',
          desc: '关闭后 AI 完全看不到骰子相关内容，输入框也不解析 /ra50。',
          value: cfg.enabled,
          onValueChange: function (v) { setField('enabled', v); }
        })
      ),
      React.createElement(
        View,
        { style: dim },
        React.createElement(
          Controls.SetCard,
          { title: '功能细项' },
          Model.DICE_FEATURE_FIELDS.map(function (f) {
            return React.createElement(Controls.SetSwitchRow, {
              key: f.key,
              label: f.label,
              desc: f.desc,
              value: cfg[f.key],
              onValueChange: function (v) { setField(f.key, v); }
            });
          })
        ),
        React.createElement(
          Controls.SetCard,
          { title: '行为' },
          Model.DICE_BEHAVIOR_FIELDS.map(function (f) {
            return React.createElement(Controls.SetSwitchRow, {
              key: f.key,
              label: f.label,
              desc: f.desc,
              value: cfg[f.key],
              onValueChange: function (v) { setField(f.key, v); }
            });
          })
        )
      ),
      React.createElement(
        View,
        { style: { flexDirection: 'row', gap: 10, marginTop: 4 } },
        React.createElement(Controls.SetButton, { label: '保存', onPress: save, kind: 'primary' }),
        React.createElement(Controls.SetButton, { label: '↺ 恢复默认', onPress: reset })
      )
    )
  );
}

module.exports = { DiceTab: DiceTab };
