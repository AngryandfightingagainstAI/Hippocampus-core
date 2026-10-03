// ============================================================
// 世界书编辑器 · 势力（B 类，RN 组件）
// grounding：桌面 worldbook/faction_editor.js —— html()（:23-58，空态 :27-32、
//   条目横条 :34-40、工具栏 :52-55）、renderBody()（:60-163，逐字段：
//   势力名/有暗明面/明面(名称·是干什么的·影响范围·资源)/暗面(仅开关时)/
//   核心(主要目标·主走哪面 仅开关时)/外界态度(官方·军方·人民·同行)/
//   和其它势力的关系/其它(关联 NPC·标签)）、delFaction（:181-190 确认文案
//   含「此操作不可撤销。」）、save（:214-219 回执）、reload（:220-224）。
// 数据层：engine/wb/faction.js（A 类纯逻辑，零 DOM）—— init/getFactionOptions/
//   selectFaction/addFaction/delFaction/set/setList/setSub/setSubList/
//   add|del|setRelation/save/reload。
// 适配点（相对桌面 DOM）：结构性操作后 refresh()，纯文本 set 不 refresh；
//   <select> → Controls.SetSelect；checkbox → Controls.SetSwitchRow；
//   data-icon 舍弃；确认 → Platform.ui.confirmAsync，回执 → StoryStore.pushToast。
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

var MOD = require('../../../../engine/wb/faction.js');

function FactionEditor(props) {
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

  // 同 npcEditor：首渲（useEffect 之前）_data 为 null，继续往下会命中
  // getFactionOptions() 内部的 this._data.map 抛 TypeError。
  // 与 shopEditor.js:62 / currencyEditor.js:50 同一道防线。
  if (!MOD._data) return null;

  var data = MOD._data;
  var idx = MOD._curIdx || 0;
  if (idx >= data.length) idx = 0;
  var fac = data[idx] || null;

  var facOpts = [{ value: '', label: '-- 选对象势力 --' }];
  MOD.getFactionOptions().forEach(function (o) { facOpts.push({ value: o.id, label: o.name }); });
  var typeOpts = [{ value: '合作', label: '合作' }, { value: '敌对', label: '敌对' }];
  var faceOpts = [{ value: '明面', label: '明面' }, { value: '暗面', label: '暗面' }, { value: '两面并用', label: '两面并用' }];

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
  function onSelect(i) { MOD.selectFaction(i); refresh(); }
  function onAdd() { MOD.addFaction(); refresh(); }
  function onDel(i) {
    var ff = MOD._data[i] || {};
    Platform.ui.confirmAsync('删除势力「' + (ff.name || '未命名') + '」？此操作不可撤销。').then(function (ok) {
      if (!ok) return;
      MOD.delFaction(i);
      refresh();
    });
  }
  function onSave() {
    var r = MOD.save();
    if (r && r.ok) toast('势力已保存', 'success');
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
  function onAddRelation() { MOD.addRelation(idx); refresh(); }
  function onDelRelation(ri) { MOD.delRelation(idx, ri); refresh(); }

  // ---- 条目横条（html :34-40）----
  function tabBar() {
    return React.createElement(
      View,
      { style: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 } },
      data.map(function (it, i) {
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
            React.createElement(Text, { style: { fontSize: f.xs, color: on ? c.bgCard : c.ink } }, it.name || '(未命名)')
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

  // ---- 一面（明面 / 暗面）----
  function sideCard(title, subKey) {
    var side = fac[subKey] || {};
    return React.createElement(
      Controls.SetCard,
      { title: title },
      React.createElement(
        Controls.SetRow,
        { label: '名称' },
        smallInput(txt(side.name), '', function (v) { MOD.setSub(idx, subKey, 'name', v); }, 200)
      ),
      React.createElement(
        Controls.SetRow,
        { label: '是干什么的' },
        React.createElement(
          View,
          { style: { width: 200 } },
          React.createElement(Controls.SetTextInput, {
            value: txt(side.what), multiline: true, rows: 2,
            onChangeText: function (v) { MOD.setSub(idx, subKey, 'what', v); }
          })
        )
      ),
      React.createElement(
        Controls.SetRow,
        { label: '影响范围' },
        smallInput(txt(side.scope), '', function (v) { MOD.setSub(idx, subKey, 'scope', v); }, 200)
      ),
      React.createElement(
        Controls.SetRow,
        { label: '资源（逗号分隔）' },
        smallInput(listText(side.resources), '', function (v) { MOD.setSubList(idx, subKey, 'resources', v); }, 200)
      )
    );
  }

  // ---- 与其它势力的关系（:65-83 / :148-153）----
  function relationCard() {
    var arr = fac.relations || [];
    return React.createElement(
      Controls.SetCard,
      { title: '和其它势力的关系' },
      React.createElement(Controls.SetNote, { first: true }, '单向各写一条。A 对 B 和 B 对 A 分别记。'),
      arr.length ? null : React.createElement(Controls.SetNote, { first: false }, '（暂无）'),
      arr.map(function (r, ri) {
        return React.createElement(
          View,
          { key: 'rel' + ri, style: { marginBottom: 8 } },
          React.createElement(
            View,
            { style: { flexDirection: 'row', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' } },
            React.createElement(
              View,
              { style: { flex: 1, minWidth: 120 } },
              React.createElement(Controls.SetSelect, {
                value: r.targetId, options: facOpts,
                onChange: function (v) { MOD.setRelation(idx, ri, 'targetId', v); }
              })
            ),
            React.createElement(
              View,
              { style: { width: 90 } },
              React.createElement(Controls.SetSelect, {
                value: r.type || '合作', options: typeOpts,
                onChange: function (v) { MOD.setRelation(idx, ri, 'type', v); }
              })
            ),
            React.createElement(
              View,
              { style: { flex: 1, minWidth: 120 } },
              React.createElement(Controls.SetTextInput, {
                value: txt(r.level), placeholder: '程度（依附/平等/全面战争…）',
                onChangeText: function (v) { MOD.setRelation(idx, ri, 'level', v); }
              })
            ),
            delBtn(function () { onDelRelation(ri); })
          ),
          React.createElement(Controls.SetTextInput, {
            value: txt(r.reason), placeholder: '为什么走到这一步',
            onChangeText: function (v) { MOD.setRelation(idx, ri, 'reason', v); }
          })
        );
      }),
      React.createElement(
        View,
        { style: { marginTop: 4 } },
        React.createElement(Controls.SetButton, { label: '+ 添加关系', onPress: onAddRelation })
      )
    );
  }

  // ---- 主表单（renderBody :87-162）----
  function body() {
    return React.createElement(
      View,
      null,
      // 基础
      React.createElement(
        Controls.SetCard,
        { title: null },
        React.createElement(
          Controls.SetRow,
          { label: star('势力名') },
          smallInput(txt(fac.name), '例：银月学院', function (v) { MOD.set(idx, 'name', v); }, 180)
        ),
        React.createElement(Controls.SetSwitchRow, {
          label: '有暗明面', value: !!fac.hasHiddenSide,
          onValueChange: function (v) { MOD.set(idx, 'hasHiddenSide', v); refresh(); }
        })
      ),
      sideCard('明面', 'publicSide'),
      fac.hasHiddenSide ? sideCard('暗面', 'hiddenSide') : null,
      // 核心
      React.createElement(
        Controls.SetCard,
        { title: '核心' },
        React.createElement(
          Controls.SetRow,
          { label: '主要目标' },
          smallInput(txt(fac.mainGoal), '', function (v) { MOD.set(idx, 'mainGoal', v); }, 200)
        ),
        fac.hasHiddenSide
          ? React.createElement(Controls.SetSelect, {
              label: '主走哪面', value: fac.mainFace || '明面', options: faceOpts,
              onChange: function (v) { MOD.set(idx, 'mainFace', v); }
            })
          : null
      ),
      // 外界态度
      React.createElement(
        Controls.SetCard,
        { title: '外界态度' },
        React.createElement(
          Controls.SetRow,
          { label: '官方' },
          smallInput(txt(fac.stanceOfficial), '', function (v) { MOD.set(idx, 'stanceOfficial', v); }, 200)
        ),
        React.createElement(
          Controls.SetRow,
          { label: '军方' },
          smallInput(txt(fac.stanceMilitary), '', function (v) { MOD.set(idx, 'stanceMilitary', v); }, 200)
        ),
        React.createElement(
          Controls.SetRow,
          { label: '人民' },
          smallInput(txt(fac.stancePeople), '', function (v) { MOD.set(idx, 'stancePeople', v); }, 200)
        ),
        React.createElement(
          Controls.SetRow,
          { label: '同行' },
          smallInput(txt(fac.stancePeers), '', function (v) { MOD.set(idx, 'stancePeers', v); }, 200)
        )
      ),
      relationCard(),
      // 其它
      React.createElement(
        Controls.SetCard,
        { title: '其它' },
        React.createElement(
          Controls.SetRow,
          { label: '关联 NPC（逗号分隔 id）' },
          smallInput(listText(fac.linkedNPCs), '', function (v) { MOD.setList(idx, 'linkedNPCs', v); }, 200)
        ),
        React.createElement(
          Controls.SetRow,
          { label: '标签（逗号分隔）' },
          smallInput(listText(fac.tags), '', function (v) { MOD.setList(idx, 'tags', v); }, 200)
        )
      )
    );
  }

  // 空态（html :27-32）：只有提示 + 新建按钮
  if (!data.length) {
    return React.createElement(
      ScrollView,
      { style: { flex: 1 }, contentContainerStyle: { paddingBottom: 40 } },
      React.createElement(
        View,
        { style: { paddingVertical: 20, alignItems: 'center' } },
        React.createElement(Text, { style: { fontSize: f.sm, color: c.muted, textAlign: 'center' } }, '还没有势力。')
      ),
      React.createElement(Controls.SetButton, { label: '+ 新建势力', onPress: onAdd })
    );
  }

  return React.createElement(
    ScrollView,
    { style: { flex: 1 }, contentContainerStyle: { paddingBottom: 40 } },
    tabBar(),
    React.createElement(
      View,
      { style: { marginBottom: 10 } },
      React.createElement(Controls.SetButton, { label: '+ 新建势力', onPress: onAdd })
    ),
    fac ? body() : React.createElement(Text, { style: { fontSize: f.sm, color: c.muted } }, '（空）'),
    React.createElement(
      View,
      { style: { flexDirection: 'row', gap: 10, marginTop: 16 } },
      React.createElement(Controls.SetButton, { label: '保存势力', onPress: onSave, kind: 'primary' }),
      React.createElement(Controls.SetButton, { label: '↺ 重新读取', onPress: onReload })
    )
  );
}

module.exports = { FactionEditor: FactionEditor };
