// ============================================================
// 战役 P2 · S3：设置页 · 世界书 地图编辑器（B 类，树编辑器）
// grounding：桌面 worldbook/map_editor.js html(:189-323) + renderAction(:325-380)：
//   修复日志 :196-202 / 空态 :204-207 / 树工具栏 :209-220 / 面包屑 :222-232 /
//   当前节点表单 :244-275 / 可互动点 :277-289（renderAction :325-380）/
//   子节点 :291-313 / 保存 :315-320。
// 数据层：engine/wb/map.js（A 类，零 DOM）—— MOD.data() → {maps, mapNodes}；
//   currentNode / breadcrumb / currentTreeId / currentNodeId / repairLog /
//   TYPE_OPTIONS / typeLabel；switchTree / addTree(name) / delTree / gotoNode /
//   addChild(name) / delChild / addAction / delAction / setAction /
//   setActionCost / setActionGives / addThen / delThen / setThen / setNode* /
//   save / reload。
// 适配点（相对桌面 DOM）：
//   1) 桌面整块 innerHTML 重绘；RN 只对结构性变更（切树 / 增删节点与动作与
//      后续项 / 保存 / 重读）refresh，纯文本输入不 refresh。
//   2) 桌面 data-icon 图标舍弃 → RN 用 emoji 表（TYPE_EMOJI）渲染，不入数据。
//   3) 桌面 UI.promptAsync 改名：新建树 / 子节点的名字改由组件内联输入框收集后
//      传给 MOD.addTree(name) / MOD.addChild(name)；删除确认走 confirmAsync。
//   4) 桌面 WB.showMsg 内联回执 → RN 走 StoryStore.pushToast。
// 文案逐字照桌面；RN 侧不搬 HTML。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var TouchableOpacity = RN.TouchableOpacity;
var ScrollView = RN.ScrollView;

var useTheme = require('../../../use_theme.js').useTheme;
var Controls = require('../../../components/settings/controls.js');
var StoryStore = require('../../../story_store.js');
var MOD = require('../../../../engine/wb/map.js');

// 桌面 typeIcon(:162-181) 是 data-icon HTML，RN 不搬；用 emoji 表只作用于显示
var TYPE_EMOJI = {
  universe: '🌌', galaxy: '✨', solar_system: '☀', planet: '🌍',
  continent: '🗺', country: '🚩', province: '📍', city: '🏙',
  district: '📌', street: '🛣', community: '🏘', building: '🏠',
  floor: '🪜', room: '🚪', custom: '📍'
};
function emojiFor(type) { return TYPE_EMOJI[type] || '📍'; }

// 桌面 :367-369 后续选项三选项逐字
var THEN_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'drink_now', label: '立即执行' },
  { value: 'add_todo', label: '加入待办' }
];

function MapEditor(props) {
  var cardId = props.cardId;
  var tk = useTheme().tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var verState = React.useState(0);
  var bump = verState[1];
  function refresh() { bump(function (v) { return v + 1; }); }

  // 内联输入框方案：桌面 promptAsync 名字 → 组件内 state（见文件头适配点 3）
  var treeNameState = React.useState('');
  var treeName = treeNameState[0];
  var setTreeName = treeNameState[1];
  var childNameState = React.useState('');
  var childName = childNameState[0];
  var setChildName = childNameState[1];

  React.useEffect(function () { MOD.init(cardId); refresh(); }, [cardId]);

  function toast(msg, type) {
    StoryStore.pushToast(msg, { type: type || 'info', duration: 3000 });
  }
  function num(v) { return v == null ? '' : String(v); }

  function onSave() {
    var r = MOD.save();
    if (r && r.ok) toast('地图已保存', 'success');
    else toast((r && r.reason) || '保存失败', 'warn');
    refresh();
  }
  function onReload() {
    Platform.ui.confirmAsync('放弃未保存的修改，重新读取？').then(function (ok) {
      if (!ok) return;
      MOD.reload();
      refresh();
    });
  }
  function onAddTree() {
    MOD.addTree(treeName);
    setTreeName('');
    refresh();
  }
  function onAddChild() {
    MOD.addChild(childName);
    setChildName('');
    refresh();
  }
  function onDelTree() {
    Platform.ui.confirmAsync('删除这棵树（含所有子节点）？').then(function (ok) {
      if (!ok) return;
      MOD.delTree();
      refresh();
    });
  }
  function onDelChild(id, name) {
    Platform.ui.confirmAsync('删除 "' + name + '" 及其所有子节点？').then(function (ok) {
      if (!ok) return;
      MOD.delChild(id);
      refresh();
    });
  }
  function onDelAction(ai) {
    Platform.ui.confirmAsync('删除这个动作？').then(function (ok) {
      if (!ok) return;
      MOD.delAction(ai);
      refresh();
    });
  }
  function onGoto(id) { MOD.gotoNode(id); refresh(); }
  function onSwitchTree(rootId) { MOD.switchTree(rootId); refresh(); }

  function xBtn(key, onPress) {
    return React.createElement(
      TouchableOpacity,
      {
        key: key, onPress: onPress,
        style: {
          width: 34, height: 34, borderWidth: 1, borderColor: c.hairStrong,
          borderRadius: tk.radius.sm, alignItems: 'center', justifyContent: 'center'
        }
      },
      React.createElement(Text, { style: { fontSize: f.sm, color: c.danger } }, '×')
    );
  }
  function wide(v) { return React.createElement(View, { style: { width: 220 } }, v); }

  function saveRow(primaryLabel) {
    return React.createElement(
      View,
      { key: 'save', style: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 } },
      React.createElement(Controls.SetButton, { label: primaryLabel, kind: 'primary', onPress: onSave }),
      React.createElement(Controls.SetButton, { label: '↺ 重新读取', onPress: onReload })
    );
  }

  var d = MOD.data();

  if (!d) {
    return React.createElement(
      ScrollView,
      { style: { flex: 1 } },
      React.createElement(Controls.SetNote, { first: true }, '（未初始化）')
    );
  }

  var nodes = [];
  var log = MOD.repairLog() || [];
  var maps = d.maps || [];

  // ---- 修复日志（桌面 :196-202）----
  if (log.length) {
    var repairText = '检测到数据结构问题，已自动修复：\n'
      + log.map(function (x) { return '· ' + x; }).join('\n')
      + '\n建议点下方「保存地图」把修复结果写回卡带。';
    nodes.push(React.createElement(
      View,
      {
        key: 'repair',
        style: {
          borderWidth: 1, borderColor: c.warning, borderRadius: tk.radius.sm,
          paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12, backgroundColor: c.warningBg
        }
      },
      React.createElement(Text, {
        style: { fontSize: f.xs, color: c.warning, lineHeight: Math.round(f.xs * 1.6) }
      }, repairText)
    ));
  }

  // ---- 无树空态（桌面 :204-207）----
  if (maps.length === 0) {
    nodes.push(React.createElement(Controls.SetNote, { key: 'emptynote', first: true },
      '还没有地图树。点下方「+ 新建树」开始。'));
    nodes.push(React.createElement(
      View,
      { key: 'newtree', style: { marginTop: 8, marginBottom: 12 } },
      React.createElement(Controls.SetRow, { label: '新树名' },
        wide(React.createElement(Controls.SetTextInput, {
          value: treeName, placeholder: '例：A 号宇宙',
          onChangeText: setTreeName
        }))),
      React.createElement(Controls.SetButton, { label: '+ 新建树', onPress: onAddTree })
    ));
    return React.createElement(ScrollView, { style: { flex: 1 } }, nodes);
  }

  // ---- 树工具栏（桌面 :209-220）----
  var treeOptions = maps.map(function (m) { return { value: m.rootId, label: m.name }; });
  nodes.push(React.createElement(
    View,
    { key: 'toolbar', style: { marginBottom: 12 } },
    React.createElement(Controls.SetSelect, {
      value: MOD.currentTreeId(), options: treeOptions, onChange: onSwitchTree
    }),
    React.createElement(Controls.SetRow, { label: '新树名' },
      wide(React.createElement(Controls.SetTextInput, {
        value: treeName, placeholder: '例：A 号宇宙',
        onChangeText: setTreeName
      }))),
    React.createElement(
      View,
      { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 } },
      React.createElement(Controls.SetButton, { label: '+ 新建树', onPress: onAddTree }),
      React.createElement(Controls.SetButton, { label: '删除此树', kind: 'danger', onPress: onDelTree })
    )
  ));

  // ---- 面包屑（桌面 :222-232）----
  var chain = MOD.breadcrumb();
  var crumbEls = [];
  chain.forEach(function (n, j) {
    if (j > 0) {
      crumbEls.push(React.createElement(Text, {
        key: 'sep' + j, style: { fontSize: f.sm, color: c.muted, paddingHorizontal: 6 }
      }, '›'));
    }
    crumbEls.push(React.createElement(
      TouchableOpacity,
      { key: 'crumb' + n.id, onPress: function () { onGoto(n.id); } },
      React.createElement(Text, {
        style: { fontSize: f.sm, color: (j === chain.length - 1) ? c.ink : c.primary }
      }, num(n.name))
    ));
  });
  nodes.push(React.createElement(
    View,
    { key: 'bc', style: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 } },
    crumbEls
  ));

  var cur = MOD.currentNode();

  if (!cur) {
    // 桌面 :234-241：当前节点丢失
    nodes.push(React.createElement(Controls.SetNote, { key: 'lost', first: true },
      '（当前节点丢失，请切换其它树或新建一棵）'));
    nodes.push(saveRow('保存修复结果'));
    return React.createElement(ScrollView, { style: { flex: 1 } }, nodes);
  }

  // ---- 当前节点表单（桌面 :244-275）----
  nodes.push(React.createElement(
    Controls.SetCard,
    { key: 'node', title: '当前节点' },
    React.createElement(Controls.SetRow, { label: '名称' },
      wide(React.createElement(Controls.SetTextInput, {
        value: num(cur.name), placeholder: '节点名',
        onChangeText: function (v) { MOD.setNode('name', v); }
      }))),
    React.createElement(Controls.SetSelect, {
      label: '类型', value: cur.type, options: MOD.TYPE_OPTIONS,
      onChange: function (v) { MOD.setNode('type', v); refresh(); }
    }),
    React.createElement(Controls.SetNote, { first: false }, '描述'),
    React.createElement(Controls.SetTextInput, {
      value: num(cur.desc), multiline: true, rows: 2, placeholder: '（可选）',
      onChangeText: function (v) { MOD.setNode('desc', v); }
    }),
    React.createElement(Controls.SetRow, { label: '标签（逗号分隔）' },
      wide(React.createElement(Controls.SetTextInput, {
        value: (cur.tags || []).join(','), placeholder: '商业街, 夜间营业',
        onChangeText: function (v) { MOD.setNodeTags(v); }
      }))),
    React.createElement(Controls.SetRow, { label: '关联 NPC（逗号分隔 id）' },
      wide(React.createElement(Controls.SetTextInput, {
        value: (cur.linkedNPCs || []).join(','), placeholder: 'npc_1, npc_2',
        onChangeText: function (v) { MOD.setNodeLinkedNPCs(v); }
      }))),
    React.createElement(Controls.SetRow, { label: '关联物品（逗号分隔 id）' },
      wide(React.createElement(Controls.SetTextInput, {
        value: (cur.linkedItems || []).join(','), placeholder: 'item_1, item_2',
        onChangeText: function (v) { MOD.setNodeLinkedItems(v); }
      })))
  ));

  // ---- 可互动点（桌面 :277-289 + renderAction :325-380）----
  var actions = cur.actions || [];
  var actionEls = [];
  if (actions.length === 0) {
    actionEls.push(React.createElement(Controls.SetNote, { key: 'ano', first: true }, '（暂无）'));
  } else {
    actions.forEach(function (a, ai) {
      var thens = a.then || [];
      var thenEls = [];
      if (thens.length === 0) {
        thenEls.push(React.createElement(Controls.SetNote, { key: 'tno', first: true }, '（暂无）'));
      } else {
        thens.forEach(function (t, ti) {
          thenEls.push(React.createElement(
            View,
            { key: 'then' + ai + '_' + ti, style: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 } },
            React.createElement(View, { style: { flex: 1 } },
              React.createElement(Controls.SetTextInput, {
                value: num(t.label), placeholder: '选项名，例：现在喝',
                onChangeText: function (v) { MOD.setThen(ai, ti, 'label', v); }
              })),
            React.createElement(View, { style: { width: 140 } },
              React.createElement(Controls.SetSelect, {
                value: t.action || 'none', options: THEN_OPTIONS,
                onChange: function (v) { MOD.setThen(ai, ti, 'action', v); refresh(); }
              })),
            xBtn('delthen' + ai + '_' + ti, function () { MOD.delThen(ai, ti); refresh(); })
          ));
        });
      }
      actionEls.push(React.createElement(
        View,
        {
          key: 'act' + ai,
          style: {
            borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
            padding: 10, marginBottom: 8, backgroundColor: c.bg
          }
        },
        React.createElement(
          View,
          { style: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 } },
          React.createElement(Text, { style: { flex: 1, fontSize: f.sm, color: c.ink } },
            a.label || '(未命名动作)'),
          xBtn('delact' + ai, function () { onDelAction(ai); })
        ),
        React.createElement(Controls.SetRow, { label: '显示名' },
          wide(React.createElement(Controls.SetTextInput, {
            value: num(a.label), placeholder: '例：买一杯奶茶',
            onChangeText: function (v) { MOD.setAction(ai, 'label', v); }
          }))),
        React.createElement(Controls.SetRow, { label: '消耗' },
          React.createElement(
            View,
            { style: { flexDirection: 'row', gap: 8 } },
            React.createElement(View, { style: { width: 90 } },
              React.createElement(Controls.SetTextInput, {
                value: num(a.cost && a.cost.money != null ? a.cost.money : ''),
                placeholder: '金钱',
                onChangeText: function (v) { MOD.setActionCost(ai, 'money', v); }
              })),
            React.createElement(View, { style: { width: 100 } },
              React.createElement(Controls.SetTextInput, {
                value: num(a.cost && a.cost.time != null ? a.cost.time : ''),
                placeholder: '时间(分)',
                onChangeText: function (v) { MOD.setActionCost(ai, 'time', v); }
              }))
          )),
        React.createElement(Controls.SetRow, { label: '获得物品（逗号分隔 id）' },
          wide(React.createElement(Controls.SetTextInput, {
            value: ((a.gives && a.gives.items) || []).join(','), placeholder: 'milk_tea',
            onChangeText: function (v) { MOD.setActionGives(ai, 'items', v); }
          }))),
        React.createElement(Controls.SetRow, { label: '获得状态（逗号分隔）' },
          wide(React.createElement(Controls.SetTextInput, {
            value: ((a.gives && a.gives.states) || []).join(','), placeholder: 'holding_milk_tea',
            onChangeText: function (v) { MOD.setActionGives(ai, 'states', v); }
          }))),
        React.createElement(Controls.SetNote, { first: false }, '后续选项'),
        thenEls,
        React.createElement(View, { style: { marginTop: 4 } },
          React.createElement(Controls.SetButton, { label: '+ 添加后续选项', onPress: function () { MOD.addThen(ai); refresh(); } }))
      ));
    });
  }
  nodes.push(React.createElement(
    Controls.SetCard,
    { key: 'actions', title: '可互动点' },
    actionEls,
    React.createElement(View, { style: { marginTop: 8 } },
      React.createElement(Controls.SetButton, { label: '+ 添加可互动点', onPress: function () { MOD.addAction(); refresh(); } }))
  ));

  // ---- 子节点（桌面 :291-313）----
  var childIds = cur.childrenIds || [];
  var childEls = [];
  if (childIds.length === 0) {
    childEls.push(React.createElement(Controls.SetNote, { key: 'cno', first: true }, '（暂无）'));
  } else {
    childIds.forEach(function (cid) {
      var cn = d.mapNodes[cid];
      if (!cn) return;
      childEls.push(React.createElement(
        View,
        { key: 'child' + cid, style: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 } },
        React.createElement(
          TouchableOpacity,
          { style: { flex: 1 }, onPress: function () { onGoto(cid); } },
          React.createElement(
            View,
            { style: { flexDirection: 'row', alignItems: 'center', gap: 8 } },
            React.createElement(Text, { style: { fontSize: f.sm } }, emojiFor(cn.type)),
            React.createElement(Text, { style: { flex: 1, fontSize: f.sm, color: c.ink } },
              num(cn.name) || '(未命名)'),
            React.createElement(Text, { style: { fontSize: f.xs, color: c.muted } },
              MOD.typeLabel(cn.type))
          )
        ),
        xBtn('delchild' + cid, function () { onDelChild(cid, cn.name); })
      ));
    });
  }
  nodes.push(React.createElement(
    Controls.SetCard,
    { key: 'children', title: '子节点（' + childIds.length + '）' },
    childEls,
    React.createElement(Controls.SetRow, { label: '子节点名称' },
      wide(React.createElement(Controls.SetTextInput, {
        value: childName, placeholder: '', onChangeText: setChildName
      }))),
    React.createElement(View, { style: { marginTop: 8 } },
      React.createElement(Controls.SetButton, { label: '+ 添加子节点', onPress: onAddChild }))
  ));

  nodes.push(saveRow('保存地图'));

  return React.createElement(ScrollView, { style: { flex: 1 } }, nodes);
}

module.exports = { MapEditor: MapEditor };
