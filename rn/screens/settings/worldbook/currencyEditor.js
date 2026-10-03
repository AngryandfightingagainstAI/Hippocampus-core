// ============================================================
// 世界书 · 货币编辑器（B 类，RN 组件）
// grounding：桌面 worldbook/currency_editor.js —— html() :16-78：
//   「货币列表」卡 :19-34 / :47-51（货币名 / 符号 / 图标 / 主 复选框 /
//   删除；空态 :49「（暂无）」；「+ 添加货币」）；「购买力」卡 :53-58
//   （描述 textarea rows=3，占位：「例：1 金币 ≈ 一顿丰盛晚餐」）；
//   「兑换关系」卡 :36-44 / :60-64（从 → 到 / 比率 / 删除；「+ 添加兑换」）；
//   「交易方式」卡 :66-70（支持以物换物 / 支持变卖道具）；toolbar :72-75
//   「保存货币」/「↺ 重新读取」。
// 数据层：engine/wb/currency.js（WB_Currency —— A 类纯逻辑，去 DOM）。
//   注意：本编辑器无「条目横条」，是单个对象（currencies / purchasingPower /
//   exchangeRates / allowBarter / allowSell），经 MOD.data() 取；:11 的默认
//   结构兜底已由引擎 init 处理。
// 适配点：桌面 reRender() 整块重绘，RN 仅结构性变更 bump 重渲染
//   （setCurrency / addCurrency / delCurrency / addRate / delRate / switch /
//   下拉不涉及），纯文本 set / setCurrency / setRate 不重绘；删除无桌面确认框；
//   WB.msg 内联提示改 StoryStore.pushToast；data-icon 舍弃只留文字。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var TouchableOpacity = RN.TouchableOpacity;

var useTheme = require('../../../use_theme.js').useTheme;
var Controls = require('../../../components/settings/controls.js');
var StoryStore = require('../../../story_store.js');
var MOD = require('../../../../engine/wb/currency.js');

function txt(v) { return v == null ? '' : String(v); }

function CurrencyEditor(props) {
  var cardId = props.cardId;
  var tk = useTheme().tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var verState = React.useState(0);
  var ver = verState[0];
  var bump = verState[1];
  function refresh() { bump(function (v) { return v + 1; }); }

  React.useEffect(function () { MOD.init(cardId); refresh(); }, [cardId]);

  function toast(msg, type) { StoryStore.pushToast(msg, { type: type || 'info', duration: 3000 }); }

  if (!MOD._data) return null;
  var d = MOD.data();

  // ---- 结构性操作（桌面每步 reRender → RN bump）----
  function onAddCurrency() { MOD.addCurrency(); refresh(); }
  function onDelCurrency(i) { MOD.delCurrency(i); refresh(); }
  function onAddRate() { MOD.addRate(); refresh(); }
  function onDelRate(i) { MOD.delRate(i); refresh(); }

  function onSave() {
    var r = MOD.save();
    if (r && r.ok) toast('货币已保存', 'success');
    else toast((r && r.reason) || '保存失败', 'error');
    refresh();
  }
  function onReload() {
    Platform.ui.confirmAsync('放弃修改？').then(function (ok) {
      if (!ok) return;
      MOD.reload();
      refresh();
    });
  }

  var delBtn = function (onPress) {
    return React.createElement(
      TouchableOpacity,
      { onPress: onPress, style: { paddingHorizontal: 8, paddingVertical: 8 } },
      React.createElement(Text, { style: { fontSize: f.sm, color: c.danger } }, '×')
    );
  };

  return React.createElement(
    View,
    { style: { flex: 1 } },

    // ===== 货币列表（html :19-34 / :47-51）=====
    React.createElement(
      Controls.SetCard,
      { title: '货币列表' },
      (d.currencies || []).length === 0
        ? React.createElement(Controls.SetNote, { first: false }, '（暂无）')
        : (d.currencies || []).map(function (cu, i) {
            return React.createElement(
              View,
              { key: 'cur' + i, style: { marginBottom: 8 } },
              React.createElement(
                View,
                { style: { flexDirection: 'row', gap: 6, alignItems: 'center' } },
                React.createElement(View, { style: { flex: 1, minWidth: 100 } },
                  React.createElement(Controls.SetTextInput, {
                    value: txt(cu.name), placeholder: '货币名',
                    onChangeText: function (v) { MOD.setCurrency(i, 'name', v); }
                  })),
                React.createElement(View, { style: { width: 80 } },
                  React.createElement(Controls.SetTextInput, {
                    value: txt(cu.symbol), placeholder: '符号',
                    onChangeText: function (v) { MOD.setCurrency(i, 'symbol', v); }
                  })),
                React.createElement(View, { style: { width: 70 } },
                  React.createElement(Controls.SetTextInput, {
                    value: txt(cu.icon), placeholder: '图标',
                    onChangeText: function (v) { MOD.setCurrency(i, 'icon', v); }
                  })),
                delBtn(function () { onDelCurrency(i); })
              ),
              React.createElement(Controls.SetSwitchRow, {
                label: '主', value: !!cu.isMain,
                onValueChange: function (v) { MOD.setCurrency(i, 'isMain', v); refresh(); }
              })
            );
          }),
      React.createElement(Controls.SetButton, { label: '+ 添加货币', onPress: onAddCurrency })
    ),

    // ===== 购买力（html :53-58）=====
    React.createElement(
      Controls.SetCard,
      { title: '购买力' },
      React.createElement(Controls.SetRow, { label: '描述' },
        React.createElement(View, { style: { width: 220 } },
          React.createElement(Controls.SetTextInput, {
            value: txt(d.purchasingPower), multiline: true, rows: 3,
            placeholder: '例：1 金币 ≈ 一顿丰盛晚餐',
            onChangeText: function (v) { MOD.set('purchasingPower', v); }
          })))
    ),

    // ===== 兑换关系（html :36-44 / :60-64）=====
    React.createElement(
      Controls.SetCard,
      { title: '兑换关系' },
      (d.exchangeRates || []).length === 0
        ? React.createElement(Controls.SetNote, { first: false }, '（暂无）')
        : (d.exchangeRates || []).map(function (r, i) {
            return React.createElement(
              View,
              { key: 'rate' + i, style: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 6 } },
              React.createElement(View, { style: { flex: 1 } },
                React.createElement(Controls.SetTextInput, {
                  value: txt(r.from), placeholder: '从',
                  onChangeText: function (v) { MOD.setRate(i, 'from', v); }
                })),
              React.createElement(Text, { style: { fontSize: f.sm, color: c.muted } }, '→'),
              React.createElement(View, { style: { flex: 1 } },
                React.createElement(Controls.SetTextInput, {
                  value: txt(r.to), placeholder: '到',
                  onChangeText: function (v) { MOD.setRate(i, 'to', v); }
                })),
              React.createElement(View, { style: { width: 100 } },
                React.createElement(Controls.SetTextInput, {
                  value: r.rate != null ? String(r.rate) : '', placeholder: '比率',
                  onChangeText: function (v) { MOD.setRate(i, 'rate', v); }
                })),
              delBtn(function () { onDelRate(i); })
            );
          }),
      React.createElement(Controls.SetButton, { label: '+ 添加兑换', onPress: onAddRate })
    ),

    // ===== 交易方式（html :66-70）=====
    React.createElement(
      Controls.SetCard,
      { title: '交易方式' },
      React.createElement(Controls.SetSwitchRow, {
        label: '支持以物换物', value: !!d.allowBarter,
        onValueChange: function (v) { MOD.set('allowBarter', v); refresh(); }
      }),
      React.createElement(Controls.SetSwitchRow, {
        label: '支持变卖道具', value: !!d.allowSell,
        onValueChange: function (v) { MOD.set('allowSell', v); refresh(); }
      })
    ),

    // ===== toolbar（html :72-75）=====
    React.createElement(
      View,
      { style: { flexDirection: 'row', gap: 10, marginTop: 4 } },
      React.createElement(Controls.SetButton, { label: '保存货币', onPress: onSave, kind: 'primary' }),
      React.createElement(Controls.SetButton, { label: '↺ 重新读取', onPress: onReload })
    )
  );
}

module.exports = { CurrencyEditor: CurrencyEditor };
