// ============================================================
// 世界书编辑器 · 法术/技能（B 类，RN 组件）
// grounding：桌面 worldbook/skill_editor.js —— html()（:17-41，空态 :19-22、
//   条目横条 :23-28、工具栏 :35-38）、renderBody()（:43-93，逐字段：
//   技能名*/是什么*/副作用(有副作用开关+副作用描述)/升级系统(有等级开关+
//   等级列表：等级·升级条件·需要物品·经验·等级效果)/其它(可学地图·可教 NPC·标签)）、
//   del（:103-112 确认文案）、save（:129-134 回执）、reload（:135）。
// 数据层：engine/wb/skill.js（A 类纯逻辑，零 DOM）—— init/cur/select/add/del/
//   set/setList/addLevel/delLevel/setLevel/setLevelReq/save/reload。
// 适配点（相对桌面 DOM）：结构性操作（增删条目/等级、副作用与等级开关、
//   保存、重读）后 refresh()，纯文本 set/setLevel/setLevelReq 不 refresh；
//   开关 → Controls.SetSwitchRow；data-icon 舍弃；删除确认 →
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

var MOD = require('../../../../engine/wb/skill.js');

function SkillEditor(props) {
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
  var sk = data[idx] || null;

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
  function delBtn(onPress) {
    return React.createElement(
      TouchableOpacity,
      { onPress: onPress, style: { paddingHorizontal: 6, paddingVertical: 6 } },
      React.createElement(Text, { style: { fontSize: f.sm, color: c.danger } }, '×')
    );
  }

  // ---- 结构性操作 ----
  function onSelect(i) { MOD.select(i); refresh(); }
  function onAdd() { MOD.add(); refresh(); }
  function onDel(i) {
    var x = MOD._data[i] || {};
    Platform.ui.confirmAsync('删除技能「' + (x.name || '未命名') + '」？').then(function (ok) {
      if (!ok) return;
      MOD.del(i);
      refresh();
    });
  }
  function onSave() {
    var r = MOD.save();
    if (r && r.ok) toast('技能已保存', 'success');
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
  function onAddLevel() { MOD.addLevel(idx); refresh(); }
  function onDelLevel(li) { MOD.delLevel(idx, li); refresh(); }

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

  // ---- 升级系统 · 等级项（renderBody :44-62）----
  function levelItem(lv, li) {
    var req = lv.requires || {};
    return React.createElement(
      View,
      { key: 'lv' + li, style: { borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm, padding: 8, marginBottom: 8 } },
      React.createElement(
        View,
        { style: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 6 } },
        smallInput(txt(lv.level), '等级', function (v) { MOD.setLevel(idx, li, 'level', v); }, 70),
        React.createElement(
          View,
          { style: { flex: 1 } },
          React.createElement(Controls.SetTextInput, {
            value: txt(lv.condition), placeholder: '升级条件',
            onChangeText: function (v) { MOD.setLevel(idx, li, 'condition', v); }
          })
        ),
        delBtn(function () { onDelLevel(li); })
      ),
      React.createElement(
        View,
        { style: { flexDirection: 'row', gap: 6, marginBottom: 6 } },
        React.createElement(
          View,
          { style: { flex: 1 } },
          React.createElement(Controls.SetTextInput, {
            value: listText(req.items), placeholder: '需要物品（逗号）',
            onChangeText: function (v) { MOD.setLevelReq(idx, li, 'items', v); }
          })
        ),
        smallInput(txt(req.exp), '经验', function (v) { MOD.setLevelReq(idx, li, 'exp', v); }, 100)
      ),
      React.createElement(Controls.SetTextInput, {
        value: txt(lv.effect), placeholder: '等级效果',
        onChangeText: function (v) { MOD.setLevel(idx, li, 'effect', v); }
      })
    );
  }

  // ---- 主表单（renderBody :64-93）----
  function body() {
    var levels = sk.levels || [];
    return React.createElement(
      View,
      null,
      // 基础
      React.createElement(
        Controls.SetCard,
        { title: null },
        React.createElement(
          Controls.SetRow,
          { label: star('技能名') },
          smallInput(txt(sk.name), '', function (v) { MOD.set(idx, 'name', v); }, 180)
        ),
        React.createElement(
          Controls.SetRow,
          { label: star('是什么') },
          React.createElement(
            View,
            { style: { width: 200 } },
            React.createElement(Controls.SetTextInput, {
              value: txt(sk.desc), multiline: true, rows: 2,
              onChangeText: function (v) { MOD.set(idx, 'desc', v); }
            })
          )
        )
      ),
      // 副作用
      React.createElement(
        Controls.SetCard,
        { title: '副作用' },
        React.createElement(Controls.SetSwitchRow, {
          label: '有副作用', value: !!sk.hasSideEffect,
          onValueChange: function (v) { MOD.set(idx, 'hasSideEffect', v); refresh(); }
        }),
        sk.hasSideEffect
          ? React.createElement(
              Controls.SetRow,
              { label: '副作用描述' },
              React.createElement(
                View,
                { style: { width: 200 } },
                React.createElement(Controls.SetTextInput, {
                  value: txt(sk.sideEffect), multiline: true, rows: 2,
                  onChangeText: function (v) { MOD.set(idx, 'sideEffect', v); }
                })
              )
            )
          : null
      ),
      // 升级系统
      React.createElement(
        Controls.SetCard,
        { title: '升级系统' },
        React.createElement(Controls.SetSwitchRow, {
          label: '有等级', value: !!sk.hasLevels,
          onValueChange: function (v) { MOD.set(idx, 'hasLevels', v); refresh(); }
        }),
        sk.hasLevels
          ? React.createElement(
              View,
              null,
              levels.length ? null : React.createElement(Controls.SetNote, { first: false }, '（暂无等级）'),
              levels.map(levelItem),
              React.createElement(
                View,
                { style: { marginTop: 4 } },
                React.createElement(Controls.SetButton, { label: '+ 添加等级', onPress: onAddLevel })
              )
            )
          : null
      ),
      // 其它
      React.createElement(
        Controls.SetCard,
        { title: '其它' },
        React.createElement(
          Controls.SetRow,
          { label: '可学地图（逗号分隔 id）' },
          smallInput(listText(sk.linkedMaps), '', function (v) { MOD.setList(idx, 'linkedMaps', v); }, 200)
        ),
        React.createElement(
          Controls.SetRow,
          { label: '可教 NPC（逗号分隔 id）' },
          smallInput(listText(sk.linkedNPCs), '', function (v) { MOD.setList(idx, 'linkedNPCs', v); }, 200)
        ),
        React.createElement(
          Controls.SetRow,
          { label: '标签（逗号分隔）' },
          smallInput(listText(sk.tags), '', function (v) { MOD.setList(idx, 'tags', v); }, 200)
        )
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
        React.createElement(Text, { style: { fontSize: f.sm, color: c.muted, textAlign: 'center' } }, '还没有技能。')
      ),
      React.createElement(Controls.SetButton, { label: '+ 新建技能', onPress: onAdd })
    );
  }

  return React.createElement(
    ScrollView,
    { style: { flex: 1 }, contentContainerStyle: { paddingBottom: 40 } },
    tabBar(),
    React.createElement(
      View,
      { style: { marginBottom: 10 } },
      React.createElement(Controls.SetButton, { label: '+ 新建技能', onPress: onAdd })
    ),
    sk ? body() : React.createElement(Text, { style: { fontSize: f.sm, color: c.muted } }, '（空）'),
    React.createElement(
      View,
      { style: { flexDirection: 'row', gap: 10, marginTop: 16 } },
      React.createElement(Controls.SetButton, { label: '保存技能', onPress: onSave, kind: 'primary' }),
      React.createElement(Controls.SetButton, { label: '↺ 重新读取', onPress: onReload })
    )
  );
}

module.exports = { SkillEditor: SkillEditor };
