// ============================================================
// 世界书编辑器 · 物品（B 类，RN 组件）
// grounding：桌面 worldbook/item_editor.js —— html()（:17-41，空态 :19-22、
//   条目横条 :23-28、工具栏 :35-38）、renderBody()（:43-63，逐字段：
//   物品名*/分类*(枚举 武器/食物/家具/电器/衣物/其他)/描述/效果/
//   关联地图（逗号分隔 id）/关联 NPC（逗号分隔 id）/标签）、
//   del（:72-81 确认文案）、save（:84-89 回执）、reload（:90）。
// 数据层：engine/wb/item.js（A 类纯逻辑，零 DOM）—— CATS/init/cur/select/
//   add/del/set/setList/save/reload。
// 适配点（相对桌面 DOM）：结构性操作后 refresh()，纯文本 set 不 refresh；
//   分类 <select> → Controls.SetSelect（选项取 MOD.CATS）；data-icon 舍弃；
//   删除确认 → Platform.ui.confirmAsync，回执 → StoryStore.pushToast。
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

var MOD = require('../../../../engine/wb/item.js');

function ItemEditor(props) {
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
  var it = data[idx] || null;

  var catOpts = (MOD.CATS || []).map(function (x) { return { value: x, label: x }; });

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
    Platform.ui.confirmAsync('删除物品「' + (x.name || '未命名') + '」？').then(function (ok) {
      if (!ok) return;
      MOD.del(i);
      refresh();
    });
  }
  function onSave() {
    var r = MOD.save();
    if (r && r.ok) toast('物品已保存', 'success');
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

  // ---- 主表单（renderBody :46-62）----
  function body() {
    return React.createElement(
      Controls.SetCard,
      { title: null },
      React.createElement(
        Controls.SetRow,
        { label: star('物品名') },
        smallInput(txt(it.name), '', function (v) { MOD.set(idx, 'name', v); }, 180)
      ),
      React.createElement(Controls.SetSelect, {
        label: star('分类'), value: it.category || '其他', options: catOpts,
        onChange: function (v) { MOD.set(idx, 'category', v); }
      }),
      React.createElement(
        Controls.SetRow,
        { label: '描述' },
        React.createElement(
          View,
          { style: { width: 200 } },
          React.createElement(Controls.SetTextInput, {
            value: txt(it.desc), multiline: true, rows: 2,
            onChangeText: function (v) { MOD.set(idx, 'desc', v); }
          })
        )
      ),
      React.createElement(
        Controls.SetRow,
        { label: '效果' },
        React.createElement(
          View,
          { style: { width: 200 } },
          React.createElement(Controls.SetTextInput, {
            value: txt(it.effects), multiline: true, rows: 2,
            onChangeText: function (v) { MOD.set(idx, 'effects', v); }
          })
        )
      ),
      React.createElement(
        Controls.SetRow,
        { label: '关联地图（逗号分隔 id）' },
        smallInput(listText(it.linkedMaps), '', function (v) { MOD.setList(idx, 'linkedMaps', v); }, 200)
      ),
      React.createElement(
        Controls.SetRow,
        { label: '关联 NPC（逗号分隔 id）' },
        smallInput(listText(it.linkedNPCs), '', function (v) { MOD.setList(idx, 'linkedNPCs', v); }, 200)
      ),
      React.createElement(
        Controls.SetRow,
        { label: '标签（逗号分隔）' },
        smallInput(listText(it.tags), '', function (v) { MOD.setList(idx, 'tags', v); }, 200)
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
        React.createElement(Text, { style: { fontSize: f.sm, color: c.muted, textAlign: 'center' } }, '还没有特殊物品。')
      ),
      React.createElement(Controls.SetButton, { label: '+ 新建物品', onPress: onAdd })
    );
  }

  return React.createElement(
    ScrollView,
    { style: { flex: 1 }, contentContainerStyle: { paddingBottom: 40 } },
    tabBar(),
    React.createElement(
      View,
      { style: { marginBottom: 10 } },
      React.createElement(Controls.SetButton, { label: '+ 新建物品', onPress: onAdd })
    ),
    it ? body() : React.createElement(Text, { style: { fontSize: f.sm, color: c.muted } }, '（空）'),
    React.createElement(
      View,
      { style: { flexDirection: 'row', gap: 10, marginTop: 16 } },
      React.createElement(Controls.SetButton, { label: '保存物品', onPress: onSave, kind: 'primary' }),
      React.createElement(Controls.SetButton, { label: '↺ 重新读取', onPress: onReload })
    )
  );
}

module.exports = { ItemEditor: ItemEditor };
