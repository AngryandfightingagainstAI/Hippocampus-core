// ============================================================
// 世界书 · 时间线编辑器（B 类，RN 组件）
// grounding：桌面 worldbook/timeline_editor.js —— html() :19-62 三分段卡：
//   「官方历史（主线开始前）」+ :39「+ 添加历史事件」；「同人未来（可选）」
//   + :44 提示「主线之后的事件。留空则 AI 不提前知道未来。」+ :46「+ 添加未来
//   事件」；「玩家时间线（运行时产生）」+ :51 提示「玩家在游戏里干的大事，可手动
//   加也可由 AI 加。」+ :53「+ 添加玩家事件」；空态逐段 :24/:28/:32「（暂无）」；
//   toolbar :56-59「保存时间线」/「↺ 重新读取」。renderItem() :64-101 逐字段：
//   时间点 / 发生了什么 / 对世界/国家的影响 / 对势力影响（用 ; 分隔）/
//   对 NPC 影响（用 ; 分隔）/ 标签（逗号分隔）。
// 数据层：engine/wb/timeline.js（WB_Timeline —— A 类纯逻辑，去 DOM）。
//   分段：MOD.SECTIONS = official / fanFuture / playerLine；impactFactions /
//   impactNPCs 走 setMulti ';'、tags 走 setMulti ','。
// 适配点：桌面 reRender() 整块重绘，RN 仅结构性变更 bump 重渲染
//   （addItem / delItem / save / reload），纯文本 setItem / setMulti 不重绘；
//   删除确认 Platform.ui.confirmAsync('删除这条事件？')（:113 逐字）；重读确认
//   :138 文案「放弃未保存修改，重新读取？」；WB.msg 改 StoryStore.pushToast；
//   data-icon 舍弃只留文字。
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
var MOD = require('../../../../engine/wb/timeline.js');

function txt(v) { return v == null ? '' : String(v); }
function joinList(arr, sep) { return (arr || []).join(sep); }

function TimelineEditor(props) {
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
  function onAdd(section) { MOD.addItem(section); refresh(); }
  function onDel(section, idx) {
    Platform.ui.confirmAsync('删除这条事件？').then(function (ok) {
      if (!ok) return;
      MOD.delItem(section, idx);
      refresh();
    });
  }
  function onSave() {
    var r = MOD.save();
    if (r && r.ok) toast('时间线已保存', 'success');
    else toast((r && r.reason) || '保存失败', 'error');
    refresh();
  }
  function onReload() {
    Platform.ui.confirmAsync('放弃未保存修改，重新读取？').then(function (ok) {
      if (!ok) return;
      MOD.reload();
      refresh();
    });
  }

  // ---- 纯文本编辑（桌面 setItem / setMulti 不重绘）----
  function setOne(section, idx, key, v) { MOD.setItem(section, idx, key, v); }
  function setMulti(section, idx, key, v) { MOD.setMulti(section, idx, key, v); }

  // ---- 单条事件（renderItem :64-101 逐字段）----
  function renderItem(section, it, idx) {
    return React.createElement(
      View,
      {
        key: section + idx,
        style: {
          borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
          padding: 10, marginBottom: 10, backgroundColor: c.bg
        }
      },
      // 时间点 + 删除
      React.createElement(
        View,
        { style: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 } },
        React.createElement(View, { style: { flex: 1 } },
          React.createElement(Controls.SetTextInput, {
            value: txt(it.time), placeholder: '时间点（例：主线前 3 年 或 1995-06）',
            onChangeText: function (v) { setOne(section, idx, 'time', v); }
          })),
        React.createElement(
          TouchableOpacity,
          { onPress: function () { onDel(section, idx); }, style: { paddingHorizontal: 8, paddingVertical: 8 } },
          React.createElement(Text, { style: { fontSize: f.sm, color: c.danger } }, '×')
        )
      ),
      // 发生了什么
      React.createElement(View, { style: { marginBottom: 6 } },
        React.createElement(Controls.SetTextInput, {
          value: txt(it.event), placeholder: '发生了什么',
          onChangeText: function (v) { setOne(section, idx, 'event', v); }
        })),
      // 对世界/国家的影响
      React.createElement(View, { style: { marginBottom: 6 } },
        React.createElement(Controls.SetTextInput, {
          value: txt(it.impactWorld), placeholder: '对世界/国家的影响',
          onChangeText: function (v) { setOne(section, idx, 'impactWorld', v); }
        })),
      // 对势力影响（用 ; 分隔）
      React.createElement(View, { style: { marginBottom: 6 } },
        React.createElement(Controls.SetTextInput, {
          value: joinList(it.impactFactions, '; '), placeholder: '对势力影响（用 ; 分隔）',
          onChangeText: function (v) { setMulti(section, idx, 'impactFactions', v); }
        })),
      // 对 NPC 影响（用 ; 分隔）
      React.createElement(View, { style: { marginBottom: 6 } },
        React.createElement(Controls.SetTextInput, {
          value: joinList(it.impactNPCs, '; '), placeholder: '对 NPC 影响（用 ; 分隔）',
          onChangeText: function (v) { setMulti(section, idx, 'impactNPCs', v); }
        })),
      // 标签（逗号分隔）
      React.createElement(View, null,
        React.createElement(Controls.SetTextInput, {
          value: joinList(it.tags, ','), placeholder: '标签（逗号分隔）',
          onChangeText: function (v) { setMulti(section, idx, 'tags', v); }
        }))
    );
  }

  // 单分段卡（html :36-54）
  function renderSection(section, title, note, addLabel) {
    var list = d[section] || [];
    return React.createElement(
      Controls.SetCard,
      { title: title },
      note ? React.createElement(Controls.SetNote, { first: false }, note) : null,
      list.length === 0
        ? React.createElement(Controls.SetNote, { first: false }, '（暂无）')
        : list.map(function (it, idx) { return renderItem(section, it, idx); }),
      React.createElement(Controls.SetButton, { label: addLabel, onPress: function () { onAdd(section); } })
    );
  }

  return React.createElement(
    View,
    { style: { flex: 1 } },
    renderSection('official', '官方历史（主线开始前）', null, '+ 添加历史事件'),
    renderSection('fanFuture', '同人未来（可选）',
      '主线之后的事件。留空则 AI 不提前知道未来。', '+ 添加未来事件'),
    renderSection('playerLine', '玩家时间线（运行时产生）',
      '玩家在游戏里干的大事，可手动加也可由 AI 加。', '+ 添加玩家事件'),
    // toolbar（html :56-59）
    React.createElement(
      View,
      { style: { flexDirection: 'row', gap: 10, marginTop: 6 } },
      React.createElement(Controls.SetButton, { label: '保存时间线', onPress: onSave, kind: 'primary' }),
      React.createElement(Controls.SetButton, { label: '↺ 重新读取', onPress: onReload })
    )
  );
}

module.exports = { TimelineEditor: TimelineEditor };
