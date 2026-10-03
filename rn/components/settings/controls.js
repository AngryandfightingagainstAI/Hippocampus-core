// ============================================================
// 战役 4 · 批次 4-5a：设置页基础控件（B 类，RN 组件）
// RN 独有。复刻 Electron 设置页 .card/.row/checkbox/select/range/
// textarea 的排印语义（index.html 内联样式 + ui_settings 各 render）。
//
// 控件清单：
//   SetCard        卡片容器（bgCard 底 + radius，同 .card）
//   SetRow         label 左 / 控件右（同 .row）
//   SetSwitchRow   开关行（同 checkbox 行，desc 灰字）
//   SetSelect      选项选择（同 <select>，Modal 列表，零依赖）
//   SetStepper     -/+ 步进数值（同 <input type=number>，用户裁决 4）
//   SetChips       横排分段选择（同主题网格/字号档按钮排）
//   SetTextInput   文本输入（同 <input>/<textarea>，4-5b ApiTab 也用）
//   SetButton      按钮（primary 描边加重，同 .btn-row button）
//   SetNote        灰字说明行（同 .muted）
// （P6·S4-4 删 SetPlaceholder：唯一引用方 rn/screens/settings/PlaceholderTab.js
//   已删，二者互为死代码。）
//
// 纪律：颜色/字号/圆角全部取 tokens，不硬编码色值；布局数值为 RN
// 必要度量。控件全部无状态（受控组件），状态由各 tab 组件持有。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var TextInput = RN.TextInput;
var Switch = RN.Switch;
var TouchableOpacity = RN.TouchableOpacity;
var Modal = RN.Modal;
var ScrollView = RN.ScrollView;
var Pressable = RN.Pressable;

var useTheme = require('../../use_theme.js').useTheme;

// ------------------------------------------------------------
// hooks 前置：每个控件独立取 tokens（无全局样式表，页面级 useMemo
// 在 tab 组件侧做；控件数量有限，此粒度的重复计算可接受）
// ------------------------------------------------------------
function useTk() {
  var api = useTheme();
  return api.tokens;
}

// ------------------------------------------------------------
// SetNote：灰字说明（同 .muted）
// ------------------------------------------------------------
function SetNote(props) {
  var tk = useTk();
  var c = tk.colors;
  var f = tk.fontSizes;
  return React.createElement(
    Text,
    {
      style: {
        fontSize: f.xs,
        color: c.muted,
        lineHeight: Math.round(f.xs * 1.7),
        marginTop: props.first ? 0 : 4,
        marginBottom: 6
      }
    },
    props.children
  );
}

// ------------------------------------------------------------
// SetCard：卡片容器
// ------------------------------------------------------------
function SetCard(props) {
  var tk = useTk();
  var c = tk.colors;
  return React.createElement(
    View,
    {
      style: {
        backgroundColor: c.bgCard,
        borderRadius: tk.radius.sm,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 12
      }
    },
    props.title
      ? React.createElement(
          Text,
          {
            style: {
              fontFamily: tk.fonts.kai,
              fontSize: tk.fontSizes.md,
              color: c.ink,
              marginBottom: 8
            }
          },
          props.title
        )
      : null,
    props.children
  );
}

// ------------------------------------------------------------
// SetRow：label 左 / 控件右
// ------------------------------------------------------------
function SetRow(props) {
  var tk = useTk();
  var c = tk.colors;
  var f = tk.fontSizes;
  return React.createElement(
    View,
    {
      style: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 7,
        minHeight: 40
      }
    },
    React.createElement(
      Text,
      { style: { flex: 1, fontSize: f.sm, color: c.ink2, paddingRight: 12 } },
      props.label
    ),
    React.createElement(View, { style: { flexShrink: 1, alignItems: 'flex-end' } }, props.children)
  );
}

// ------------------------------------------------------------
// SetSwitchRow：开关行 + 可选 desc
// ------------------------------------------------------------
function SetSwitchRow(props) {
  var tk = useTk();
  var c = tk.colors;
  var f = tk.fontSizes;
  var dimStyle = props.disabled ? { opacity: 0.4 } : null;
  return React.createElement(
    View,
    { style: [{ paddingVertical: 6 }, dimStyle] },
    React.createElement(
      View,
      { style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } },
      React.createElement(
        Text,
        { style: { flex: 1, fontSize: f.sm, color: c.ink, paddingRight: 10 } },
        props.label
      ),
      React.createElement(Switch, {
        value: !!props.value,
        onValueChange: props.onValueChange,
        disabled: !!props.disabled,
        trackColor: { false: c.hairStrong, true: c.primary },
        thumbColor: c.bgCard,
        ios_backgroundColor: c.hairStrong
      })
    ),
    props.desc
      ? React.createElement(
          Text,
          { style: { fontSize: f.xs, color: c.muted, lineHeight: Math.round(f.xs * 1.6), marginTop: 2 } },
          props.desc
        )
      : null
  );
}

// ------------------------------------------------------------
// SetSelect：选项选择（<select> 语义，Modal 列表，零依赖）
// props: label（行标签，可空=独立块）, value, options:[{value,label,desc?}],
//        onChange(value)
// ------------------------------------------------------------
function SetSelect(props) {
  var tk = useTk();
  var c = tk.colors;
  var f = tk.fontSizes;
  var openState = React.useState(false);
  var open = openState[0];
  var setOpen = openState[1];

  var current = null;
  for (var i = 0; i < props.options.length; i++) {
    if (props.options[i].value === props.value) current = props.options[i];
  }
  var currentLabel = current ? current.label : (props.placeholder || '请选择');

  var trigger = React.createElement(
    TouchableOpacity,
    { onPress: function () { setOpen(true); } },
    React.createElement(
      View,
      {
        style: {
          borderWidth: 1,
          borderColor: c.hairStrong,
          borderRadius: tk.radius.sm,
          paddingHorizontal: 12,
          paddingVertical: 7,
          minWidth: 120
        }
      },
      React.createElement(
        Text,
        { style: { fontSize: f.sm, color: current ? c.ink : c.muted } },
        currentLabel + ' ▾'
      )
    )
  );

  return React.createElement(
    View,
    null,
    props.label
      ? React.createElement(
          View,
          { style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 } },
          React.createElement(Text, { style: { flex: 1, fontSize: f.sm, color: c.ink2, paddingRight: 12 } }, props.label),
          trigger
        )
      : trigger,
    React.createElement(
      Modal,
      { visible: open, transparent: true, animationType: 'fade', onRequestClose: function () { setOpen(false); } },
      React.createElement(
        Pressable,
        {
          style: { flex: 1, backgroundColor: c.maskStrong, justifyContent: 'center', paddingHorizontal: 32 },
          onPress: function () { setOpen(false); }
        },
        React.createElement(
          Pressable,
          {
            style: {
              backgroundColor: c.bgCard,
              borderRadius: tk.radius.md,
              maxHeight: 420
            },
            onPress: function () {}
          },
          React.createElement(
            ScrollView,
            null,
            props.options.map(function (opt, idx) {
              var active = opt.value === props.value;
              return React.createElement(
                TouchableOpacity,
                {
                  key: opt.value == null ? 'null' + idx : String(opt.value),
                  onPress: function () {
                    setOpen(false);
                    props.onChange(opt.value);
                  },
                  style: {
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth: idx < props.options.length - 1 ? 1 : 0,
                    borderBottomColor: c.hair
                  }
                },
                React.createElement(
                  Text,
                  {
                    style: {
                      fontSize: f.sm,
                      color: active ? c.primary : c.ink,
                      fontWeight: active ? '700' : '400'
                    }
                  },
                  (active ? '· ' : '') + opt.label
                ),
                opt.desc
                  ? React.createElement(
                      Text,
                      { style: { fontSize: f.xs, color: c.muted, marginTop: 2 } },
                      opt.desc
                    )
                  : null
              );
            })
          )
        )
      )
    )
  );
}

// ------------------------------------------------------------
// SetStepper：-/+ 步进数值（用户裁决 4：零依赖替代 Slider）
// props: label, value, min, max, step, onChange(v), format?(v)->string
// ------------------------------------------------------------
function SetStepper(props) {
  var tk = useTk();
  var c = tk.colors;
  var f = tk.fontSizes;
  var step = props.step != null ? props.step : 1;
  var dec = 0;
  var stepStr = String(step);
  if (stepStr.indexOf('.') >= 0) dec = stepStr.split('.')[1].length;

  function clamp(v) {
    var out = v;
    if (props.min != null && out < props.min) out = props.min;
    if (props.max != null && out > props.max) out = props.max;
    // 浮点积差：按 step 小数位四舍五入（同 theme_tokens 纪律）
    if (dec > 0) out = Math.round(out * Math.pow(10, dec)) / Math.pow(10, dec);
    return out;
  }

  var display = props.format ? props.format(props.value) : String(props.value);

  function btn(label, delta, disabled) {
    return React.createElement(
      TouchableOpacity,
      {
        onPress: function () {
          if (disabled) return;
          props.onChange(clamp(Number(props.value) + delta));
        },
        disabled: disabled,
        style: {
          width: 34,
          height: 30,
          borderWidth: 1,
          borderColor: disabled ? c.hair : c.hairStrong,
          borderRadius: tk.radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : 1
        }
      },
      React.createElement(Text, { style: { fontSize: f.md, color: c.ink } }, label)
    );
  }

  var atMin = props.min != null && Number(props.value) <= props.min;
  var atMax = props.max != null && Number(props.value) >= props.max;

  return React.createElement(
    View,
    { style: { flexDirection: 'row', alignItems: 'center' } },
    btn('−', -step, atMin),
    React.createElement(
      Text,
      { style: { minWidth: 56, textAlign: 'center', fontSize: f.sm, color: c.ink, fontFamily: tk.fonts.mono } },
      display
    ),
    btn('+', step, atMax)
  );
}

// ------------------------------------------------------------
// SetChips：横排分段选择（同主题网格/字号档 <button> 排）
// props: options:[{value,label}], value, onChange(v)
// ------------------------------------------------------------
function SetChips(props) {
  var tk = useTk();
  var c = tk.colors;
  var f = tk.fontSizes;
  return React.createElement(
    View,
    { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } },
    props.options.map(function (opt) {
      var active = opt.value === props.value;
      return React.createElement(
        TouchableOpacity,
        {
          key: String(opt.value),
          onPress: function () { props.onChange(opt.value); },
          style: {
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: tk.radius.sm,
            borderWidth: 1,
            borderColor: active ? c.primary : c.hairStrong,
            backgroundColor: active ? c.primary : c.bgCard,
            minHeight: 36,
            justifyContent: 'center'
          }
        },
        React.createElement(
          Text,
          { style: { fontSize: f.sm, color: active ? c.bgCard : c.text, fontWeight: active ? '700' : '400' } },
          opt.label
        )
      );
    })
  );
}

// ------------------------------------------------------------
// SetTextInput：文本输入
// props: value, onChangeText, placeholder?, multiline?, rows?, secure?
// ------------------------------------------------------------
function SetTextInput(props) {
  var tk = useTk();
  var c = tk.colors;
  var f = tk.fontSizes;
  var lines = props.multiline ? (props.rows || 4) : 1;
  return React.createElement(
    TextInput,
    {
      value: props.value,
      onChangeText: props.onChangeText,
      placeholder: props.placeholder || '',
      placeholderTextColor: c.faint,
      secureTextEntry: !!props.secure,
      multiline: !!props.multiline,
      numberOfLines: lines,
      textAlignVertical: props.multiline ? 'top' : 'center',
      style: {
        borderWidth: 1,
        borderColor: c.hairStrong,
        borderRadius: tk.radius.sm,
        paddingHorizontal: 12,
        paddingTop: props.multiline ? 8 : 0,
        paddingBottom: props.multiline ? 8 : 0,
        minHeight: props.multiline ? Math.round(f.sm * 1.7) * lines + 16 : 38,
        fontSize: f.sm,
        color: c.text,
        backgroundColor: c.bg
      }
    }
  );
}

// ------------------------------------------------------------
// SetButton：按钮（同 .btn-row button / button.primary）
// props: label, onPress, kind?: 'primary'|'normal'|'danger'
// ------------------------------------------------------------
function SetButton(props) {
  var tk = useTk();
  var c = tk.colors;
  var f = tk.fontSizes;
  var kind = props.kind || 'normal';
  var border = kind === 'primary' ? c.ink : (kind === 'danger' ? c.danger : c.hairStrong);
  var color = kind === 'danger' ? c.danger : c.ink;
  return React.createElement(
    TouchableOpacity,
    {
      onPress: props.onPress,
      style: {
        borderWidth: 1,
        borderColor: border,
        borderRadius: tk.radius.md,
        paddingHorizontal: 18,
        paddingVertical: 9,
        alignSelf: 'flex-start'
      }
    },
    React.createElement(
      Text,
      { style: { fontSize: f.sm, color: color, letterSpacing: 2, fontFamily: tk.fonts.serif } },
      props.label
    )
  );
}

// ------------------------------------------------------------
// P6·S4-4：原 SetPlaceholder（占位页 02/07/08/09）已删——
// PlaceholderTab.js 是唯一引用方，该文件亦无任何生产引用，二者互为死代码。
// 引用计数（删除前）：PlaceholderTab 0 处、SetPlaceholder 1 处（即前者）。
// ------------------------------------------------------------

module.exports = {
  SetNote: SetNote,
  SetCard: SetCard,
  SetRow: SetRow,
  SetSwitchRow: SetSwitchRow,
  SetSelect: SetSelect,
  SetStepper: SetStepper,
  SetChips: SetChips,
  SetTextInput: SetTextInput,
  SetButton: SetButton
};
