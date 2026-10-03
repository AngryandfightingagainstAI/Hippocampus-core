// ============================================================
// 世界书编辑器 · 种族（B 类，RN 组件）
// grounding：桌面 worldbook/race_editor.js —— html()（:20-54：未启用分支
//   :21-28「这个卡带没有启用种族系统。」+「启用种族系统」开关；已启用分支
//   :41-53「种族系统已启用」开关 + 条目横条 :30-36 + 新增钮 + 工具栏 :48-51）、
//   renderBody()（:56-97，逐字段：种族名*/是什么*/国家态度/人群态度/宗教态度/
//   NPC 倾向(喜欢/厌恶/无感)/种族天赋/特殊之处/住在哪里/社会形态(群居/分散)/
//   稀有度(稀有/常见)/种族历史/标签）、del（:107-117 确认文案）、
//   save（:121-126 回执）、reload（:127）。
// 数据层：engine/wb/race.js（A 类纯逻辑，零 DOM）—— init/cur/hasRaces/
//   toggleRaces/select/add/del/set/setList/save/reload（save/del 同写
//   hasRaces + races 两字段）。
// 适配点（相对桌面 DOM）：开关径由 toggleRaces 改写并 refresh；纯文本 set
//   不 refresh；<select> → Controls.SetSelect；data-icon 舍弃；删除确认 →
//   Platform.ui.confirmAsync，回执 → StoryStore.pushToast。
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

var MOD = require('../../../../engine/wb/race.js');

function RaceEditor(props) {
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

  var hasRaces = MOD.hasRaces();
  var data = MOD._data || [];
  var idx = MOD._curIdx || 0;
  if (idx >= data.length) idx = 0;
  var rc = data[idx] || null;

  var tendOpts = [{ value: '喜欢', label: '喜欢' }, { value: '厌恶', label: '厌恶' }, { value: '无感', label: '无感' }];
  var socialOpts = [{ value: '群居', label: '群居' }, { value: '分散', label: '分散' }];
  var rarityOpts = [{ value: '稀有', label: '稀有' }, { value: '常见', label: '常见' }];

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
  function onToggleRaces(on) { MOD.toggleRaces(on); refresh(); }
  function onSelect(i) { MOD.select(i); refresh(); }
  function onAdd() { MOD.add(); refresh(); }
  function onDel(i) {
    var x = MOD._data[i] || {};
    Platform.ui.confirmAsync('删除种族「' + (x.name || '未命名') + '」？').then(function (ok) {
      if (!ok) return;
      MOD.del(i);
      refresh();
    });
  }
  function onSave() {
    var r = MOD.save();
    if (r && r.ok) toast('种族已保存', 'success');
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

  // ---- 条目横条（html :30-36）----
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

  // ---- 主表单（renderBody :58-96）----
  function body() {
    return React.createElement(
      Controls.SetCard,
      { title: null },
      React.createElement(
        Controls.SetRow,
        { label: star('种族名') },
        smallInput(txt(rc.name), '', function (v) { MOD.set(idx, 'name', v); }, 180)
      ),
      React.createElement(
        Controls.SetRow,
        { label: star('是什么') },
        React.createElement(
          View,
          { style: { width: 200 } },
          React.createElement(Controls.SetTextInput, {
            value: txt(rc.desc), multiline: true, rows: 2,
            onChangeText: function (v) { MOD.set(idx, 'desc', v); }
          })
        )
      ),
      React.createElement(
        Controls.SetRow,
        { label: '国家态度' },
        smallInput(txt(rc.stanceOfficial), '', function (v) { MOD.set(idx, 'stanceOfficial', v); }, 200)
      ),
      React.createElement(
        Controls.SetRow,
        { label: '人群态度' },
        smallInput(txt(rc.stancePeople), '', function (v) { MOD.set(idx, 'stancePeople', v); }, 200)
      ),
      React.createElement(
        Controls.SetRow,
        { label: '宗教态度' },
        smallInput(txt(rc.stanceReligion), '', function (v) { MOD.set(idx, 'stanceReligion', v); }, 200)
      ),
      React.createElement(Controls.SetSelect, {
        label: 'NPC 倾向', value: rc.npcTendency || '无感', options: tendOpts,
        onChange: function (v) { MOD.set(idx, 'npcTendency', v); }
      }),
      React.createElement(
        Controls.SetRow,
        { label: '种族天赋（逗号分隔）' },
        smallInput(listText(rc.talents), '', function (v) { MOD.setList(idx, 'talents', v); }, 200)
      ),
      React.createElement(
        Controls.SetRow,
        { label: '特殊之处' },
        smallInput(txt(rc.specials), '', function (v) { MOD.set(idx, 'specials', v); }, 200)
      ),
      React.createElement(
        Controls.SetRow,
        { label: '住在哪里' },
        smallInput(txt(rc.habitat), '', function (v) { MOD.set(idx, 'habitat', v); }, 200)
      ),
      React.createElement(Controls.SetSelect, {
        label: '社会形态', value: rc.socialType || '分散', options: socialOpts,
        onChange: function (v) { MOD.set(idx, 'socialType', v); }
      }),
      React.createElement(Controls.SetSelect, {
        label: '稀有度', value: rc.rarity || '稀有', options: rarityOpts,
        onChange: function (v) { MOD.set(idx, 'rarity', v); }
      }),
      React.createElement(
        Controls.SetRow,
        { label: '种族历史（可选）' },
        React.createElement(
          View,
          { style: { width: 200 } },
          React.createElement(Controls.SetTextInput, {
            value: txt(rc.history), multiline: true, rows: 2,
            onChangeText: function (v) { MOD.set(idx, 'history', v); }
          })
        )
      ),
      React.createElement(
        Controls.SetRow,
        { label: '标签（逗号分隔）' },
        smallInput(listText(rc.tags), '', function (v) { MOD.setList(idx, 'tags', v); }, 200)
      )
    );
  }

  // 未启用分支（html :21-28）
  if (!hasRaces) {
    return React.createElement(
      ScrollView,
      { style: { flex: 1 }, contentContainerStyle: { paddingBottom: 40 } },
      React.createElement(
        Controls.SetCard,
        { title: null },
        React.createElement(Controls.SetNote, { first: true }, '这个卡带没有启用种族系统。'),
        React.createElement(
          View,
          { style: { marginTop: 10 } },
          React.createElement(Controls.SetSwitchRow, {
            label: '启用种族系统', value: false,
            onValueChange: function () { onToggleRaces(true); }
          })
        )
      )
    );
  }

  // 已启用分支（html :41-53）
  return React.createElement(
    ScrollView,
    { style: { flex: 1 }, contentContainerStyle: { paddingBottom: 40 } },
    React.createElement(
      Controls.SetCard,
      { title: null },
      React.createElement(Controls.SetSwitchRow, {
        label: '种族系统已启用', value: true,
        onValueChange: function () { onToggleRaces(false); }
      })
    ),
    tabBar(),
    React.createElement(
      View,
      { style: { marginBottom: 10 } },
      React.createElement(Controls.SetButton, { label: '+ 新建种族', onPress: onAdd })
    ),
    rc ? body() : React.createElement(Text, { style: { fontSize: f.sm, color: c.muted } }, '（还没种族）'),
    React.createElement(
      View,
      { style: { flexDirection: 'row', gap: 10, marginTop: 16 } },
      React.createElement(Controls.SetButton, { label: '保存种族', onPress: onSave, kind: 'primary' }),
      React.createElement(Controls.SetButton, { label: '↺ 重新读取', onPress: onReload })
    )
  );
}

module.exports = { RaceEditor: RaceEditor };
