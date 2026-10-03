// ============================================================
// 世界书编辑器 · 职业（B 类，RN 组件）
// grounding：桌面 worldbook/occupation_editor.js —— html()（:17-41，空态
//   :19-22、条目横条 :23-28、工具栏 :35-38）、renderBody()（:43-66，逐字段：
//   职业名*/能干什么*/待遇/官方态度/官方知道这个职业(开关)/工作时间(自由·固定)/
//   什么环境诞生/为什么需要/标签）、del（:76-85 确认文案）、save（:88-93 回执）、
//   reload（:94）。
// 数据层：engine/wb/occupation.js（A 类纯逻辑，零 DOM）—— init/cur/select/
//   add/del/set/setList/save/reload。
// 适配点（相对桌面 DOM）：结构性操作（增删条目、保存、重读）后 refresh()，
//   纯文本 set 与开关 set 不 refresh；工作时间 <select> → Controls.SetSelect；
//   data-icon 舍弃；删除确认 → Platform.ui.confirmAsync，回执 →
//   StoryStore.pushToast。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var ScrollView = RN.ScrollView;
var TouchableOpacity = RN.TouchableOpacity;

var useTheme = require('../../../use_theme.js').useTheme;
var Controls = require('../../../components/settings/controls.js');
var StoryStore = require('../../../story_store.js');

var MOD = require('../../../../engine/wb/occupation.js');

function OccupationEditor(props) {
  var cardId = props.cardId;
  var tk = useTheme().tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var verState = React.useState(0);
  var ver = verState[0];
  var bump = verState[1];
  function refresh() { bump(function (v) { return v + 1; }); }

  React.useEffect(function () {
    MOD.init(cardId);
    refresh();
  }, [cardId]);

  function toast(msg, type) { StoryStore.pushToast(msg, { type: type || 'info', duration: 3000 }); }

  var data = MOD._data || [];
  var idx = MOD._curIdx || 0;
  if (idx >= data.length) idx = 0;
  var oc = data[idx] || null;

  var workOpts = [{ value: '自由', label: '自由' }, { value: '固定', label: '固定' }];

  function txt(v) { return v == null ? '' : String(v); }
  function listText(a) { return (a || []).join(','); }
  function star(label) {
    return React.createElement(Text, null, label + ' ', React.createElement(Text, { style: { color: c.danger } }, '*'));
  }
  function smallInput(value, ph, onChange, width) {
    return React.createElement(
      View,
      { style: { width: width || 200 } },
      React.createElement(Controls.SetTextInput, { value: value, placeholder: ph, onChangeText: onChange })
    );
  }

  // ---- 结构性操作 ----
  function onSelect(i) { MOD.select(i); refresh(); }
  function onAdd() { MOD.add(); refresh(); }
  function onDel(i) {
    var x = MOD._data[i] || {};
    Platform.ui.confirmAsync('删除职业「' + (x.name || '未命名') + '」？').then(function (ok) {
      if (!ok) return;
      MOD.del(i);
      refresh();
    });
  }
  function onSave() {
    var r = MOD.save();
    if (r && r.ok) toast('职业已保存', 'success');
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

  // ---- 条目横条（html :23-28）----
  function tabBar() {
    return React.createElement(
      View,
      { style: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 } },
      data.map(function (x, i) {
        var on = i === idx;
        return React.createElement(
          View,
          {
            key: 'tab' + i,
            style: {
              flexDirection: 'row', alignItems: 'center', marginRight: 8, marginBottom: 8,
              borderWidth: 1, borderRadius: tk.radius.sm,
              borderColor: on ? c.primary : c.hairStrong,
              backgroundColor: on ? c.primary : c.bgCard
            }
          },
          React.createElement(
            TouchableOpacity,
            { onPress: function () { onSelect(i); }, style: { paddingHorizontal: 10, paddingVertical: 5 } },
            React.createElement(Text, { style: { fontSize: f.xs, color: on ? c.bgCard : c.ink } }, x.name || '(未命名)')
          ),
          React.createElement(
            TouchableOpacity,
            { onPress: function () { onDel(i); }, style: { paddingHorizontal: 8, paddingVertical: 5 } },
            React.createElement(Text, { style: { fontSize: f.xs, color: on ? c.bgCard : c.danger } }, '×')
          )
        );
      })
    );
  }

  // ---- 主表单（renderBody :44-66）----
  function body() {
    return React.createElement(
      Controls.SetCard,
      { title: null },
      React.createElement(
        Controls.SetRow,
        { label: star('职业名') },
        smallInput(txt(oc.name), '', function (v) { MOD.set(idx, 'name', v); }, 180)
      ),
      React.createElement(
        Controls.SetRow,
        { label: star('能干什么') },
        React.createElement(
          View,
          { style: { width: 200 } },
          React.createElement(Controls.SetTextInput, {
            value: txt(oc.desc), multiline: true, rows: 2,
            onChangeText: function (v) { MOD.set(idx, 'desc', v); }
          })
        )
      ),
      React.createElement(
        Controls.SetRow,
        { label: '待遇' },
        smallInput(txt(oc.treatment), '', function (v) { MOD.set(idx, 'treatment', v); }, 200)
      ),
      React.createElement(
        Controls.SetRow,
        { label: '官方态度' },
        smallInput(txt(oc.stanceOfficial), '', function (v) { MOD.set(idx, 'stanceOfficial', v); }, 200)
      ),
      React.createElement(Controls.SetSwitchRow, {
        label: '官方知道这个职业', value: !!oc.officiallyKnown,
        onValueChange: function (v) { MOD.set(idx, 'officiallyKnown', v); }
      }),
      React.createElement(Controls.SetSelect, {
        label: '工作时间', value: oc.workTime || '自由', options: workOpts,
        onChange: function (v) { MOD.set(idx, 'workTime', v); }
      }),
      React.createElement(
        Controls.SetRow,
        { label: '什么环境诞生' },
        React.createElement(
          View,
          { style: { width: 200 } },
          React.createElement(Controls.SetTextInput, {
            value: txt(oc.origin), multiline: true, rows: 2,
            onChangeText: function (v) { MOD.set(idx, 'origin', v); }
          })
        )
      ),
      React.createElement(
        Controls.SetRow,
        { label: '为什么需要' },
        React.createElement(
          View,
          { style: { width: 200 } },
          React.createElement(Controls.SetTextInput, {
            value: txt(oc.necessity), multiline: true, rows: 2,
            onChangeText: function (v) { MOD.set(idx, 'necessity', v); }
          })
        )
      ),
      React.createElement(
        Controls.SetRow,
        { label: '标签（逗号分隔）' },
        smallInput(listText(oc.tags), '', function (v) { MOD.setList(idx, 'tags', v); }, 200)
      )
    );
  }

  // 空态（html :19-22）：只有提示 + 新建按钮
  if (!data.length) {
    return React.createElement(
      ScrollView,
      { style: { flex: 1 }, contentContainerStyle: { paddingBottom: 40 } },
      React.createElement(
        View,
        { style: { paddingVertical: 20, alignItems: 'center' } },
        React.createElement(Text, { style: { fontSize: f.sm, color: c.muted, textAlign: 'center' } }, '还没有特殊职业。')
      ),
      React.createElement(Controls.SetButton, { label: '+ 新建职业', onPress: onAdd })
    );
  }

  return React.createElement(
    ScrollView,
    { style: { flex: 1 }, contentContainerStyle: { paddingBottom: 40 } },
    tabBar(),
    React.createElement(
      View,
      { style: { marginBottom: 10 } },
      React.createElement(Controls.SetButton, { label: '+ 新建职业', onPress: onAdd })
    ),
    oc ? body() : React.createElement(Text, { style: { fontSize: f.sm, color: c.muted } }, '（空）'),
    React.createElement(
      View,
      { style: { flexDirection: 'row', gap: 10, marginTop: 16 } },
      React.createElement(Controls.SetButton, { label: '保存职业', onPress: onSave, kind: 'primary' }),
      React.createElement(Controls.SetButton, { label: '↺ 重新读取', onPress: onReload })
    )
  );
}

module.exports = { OccupationEditor: OccupationEditor };
