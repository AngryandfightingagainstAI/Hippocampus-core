// ============================================================
// 战役 P2 · S3：设置页 · 世界书 产出物编辑器（B 类）
// grounding：桌面 worldbook/outputs_editor.js html(:42-169) 五块：
//   基础 / 产出物类型（types）/ 受众群体（audiences）/
//   发酵事件池（eventPool）/ 定论规则（settleRules）；工具栏 :163-166。
// 数据层：engine/wb/outputs.js（A 类，零 DOM）—— MOD.data() 取对象；
//   set / addType / delType / setType / addAudience / delAudience /
//   setAudience / addEvent / delEvent / setEvent / setEventHint /
//   setWhenType / setWhen / addAffect / delAffect / setAffect / save / reload。
// 适配点（相对桌面 DOM）：
//   1) 桌面整块 innerHTML 重绘；RN 只对结构性变更（增删条目 / 切换下拉 /
//      保存 / 重读）refresh，纯文本输入不 refresh（避免输入法失焦）。
//   2) 桌面 data-icon 图标一律舍弃，只留文字（删除钮用 ×）。
//   3) 桌面 WB.msg 内联回执 → RN 走 StoryStore.pushToast。
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
var MOD = require('../../../../engine/wb/outputs.js');

// 桌面 :50-55 发酵粒度三选项逐字
var FERMENT_OPTIONS = [
  { value: 'month', label: '每月' },
  { value: 'season', label: '每季' },
  { value: 'year', label: '每年（推荐）' }
];
// 桌面 :132-136 定论条件两选项逐字
var WHEN_OPTIONS = [
  { value: 'progress-full', label: 'progress 累积到 100' },
  { value: 'fixed-years', label: '发布 N 年后' }
];

function OutputsEditor(props) {
  var cardId = props.cardId;
  var tk = useTheme().tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var verState = React.useState(0);
  var bump = verState[1];
  function refresh() { bump(function (v) { return v + 1; }); }

  React.useEffect(function () { MOD.init(cardId); refresh(); }, [cardId]);

  function toast(msg, type) {
    StoryStore.pushToast(msg, { type: type || 'info', duration: 3000 });
  }
  function num(v) { return v == null ? '' : String(v); }

  // 结构性操作（桌面每步 reRender）→ RN refresh
  function onSave() {
    var r = MOD.save();
    if (r && r.ok) toast('产出物配置已保存', 'success');
    else toast((r && r.reason) || '保存失败', 'warn');
    refresh();
  }
  function onReload() {
    Platform.ui.confirmAsync('放弃未保存修改，重新读取？').then(function (ok) {
      if (!ok) return;
      MOD.reload();
      refresh();
    });
  }

  // 删除钮（桌面 wb-del-btn，图标舍弃 → ×）
  function xBtn(onPress) {
    return React.createElement(
      TouchableOpacity,
      {
        onPress: onPress,
        style: {
          width: 34, height: 34, borderWidth: 1, borderColor: c.hairStrong,
          borderRadius: tk.radius.sm, alignItems: 'center', justifyContent: 'center'
        }
      },
      React.createElement(Text, { style: { fontSize: f.sm, color: c.danger } }, '×')
    );
  }

  var d = MOD.data();

  if (!d) {
    return React.createElement(
      ScrollView,
      { style: { flex: 1 } },
      React.createElement(Controls.SetCard, { title: '产出物' },
        React.createElement(Controls.SetNote, { first: true }, '（未初始化）'))
    );
  }

  var when = d.settleRules.when || {};
  var whenType = when.type || 'progress-full';

  // ---- 基础（桌面 :48-56）----
  var baseCard = React.createElement(
    Controls.SetCard,
    { title: '基础' },
    React.createElement(Controls.SetSelect, {
      label: '发酵粒度',
      value: d.fermentInterval || 'year',
      options: FERMENT_OPTIONS,
      onChange: function (v) { MOD.set('fermentInterval', v); refresh(); }
    }),
    React.createElement(Controls.SetNote, { first: true },
      '引擎每隔这么久检查一次发酵进度。玩家发表的作品会按这个节奏累积。')
  );

  // ---- types（桌面 :58-74 / :142-145）----
  var typeRows = (d.types || []).map(function (t, i) {
    return React.createElement(
      View,
      {
        key: 't' + i,
        style: {
          borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
          padding: 10, marginBottom: 8, backgroundColor: c.bg
        }
      },
      React.createElement(
        View,
        { style: { flexDirection: 'row', alignItems: 'center', gap: 6 } },
        React.createElement(View, { style: { width: 90 } },
          React.createElement(Controls.SetTextInput, {
            value: num(t.icon), placeholder: '图标名',
            onChangeText: function (v) { MOD.setType(i, 'icon', v); }
          })),
        React.createElement(View, { style: { flex: 1 } },
          React.createElement(Controls.SetTextInput, {
            value: num(t.name), placeholder: '类型名（例：著作）',
            onChangeText: function (v) { MOD.setType(i, 'name', v); }
          })),
        xBtn(function () { MOD.delType(i); refresh(); })
      ),
      React.createElement(Controls.SetRow, { label: 'id：' },
        React.createElement(View, { style: { width: 200 } },
          React.createElement(Controls.SetTextInput, {
            value: num(t.id), placeholder: '英文 id（留空自动生成）',
            onChangeText: function (v) { MOD.setType(i, 'id', v); }
          })))
    );
  });
  var typesCard = React.createElement(
    Controls.SetCard,
    { title: '产出物类型（types）' },
    React.createElement(Controls.SetNote, { first: true },
      '书 / 画 / 曲 / 功法 / 提案……AI 发布产出物时会从中选。'),
    typeRows.length ? typeRows : React.createElement(Controls.SetNote, { first: false }, '（暂无）'),
    React.createElement(View, { style: { marginTop: 8 } },
      React.createElement(Controls.SetButton, { label: '+ 添加类型', onPress: function () { MOD.addType(); refresh(); } }))
  );

  // ---- audiences（桌面 :76-92 / :147-150）----
  var audienceRows = (d.audiences || []).map(function (a, i) {
    return React.createElement(
      View,
      {
        key: 'a' + i,
        style: {
          borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
          padding: 10, marginBottom: 8, backgroundColor: c.bg
        }
      },
      React.createElement(
        View,
        { style: { flexDirection: 'row', alignItems: 'center', gap: 6 } },
        React.createElement(View, { style: { flex: 1 } },
          React.createElement(Controls.SetTextInput, {
            value: num(a.name), placeholder: '群体名（例：文人圈）',
            onChangeText: function (v) { MOD.setAudience(i, 'name', v); }
          })),
        React.createElement(View, { style: { width: 80 } },
          React.createElement(Controls.SetTextInput, {
            value: num(a.weight != null ? a.weight : 5), placeholder: '权重',
            onChangeText: function (v) { MOD.setAudience(i, 'weight', v); }
          })),
        xBtn(function () { MOD.delAudience(i); refresh(); })
      ),
      React.createElement(Controls.SetRow, { label: 'id：' },
        React.createElement(View, { style: { width: 200 } },
          React.createElement(Controls.SetTextInput, {
            value: num(a.id), placeholder: '英文 id（留空自动生成）',
            onChangeText: function (v) { MOD.setAudience(i, 'id', v); }
          })))
    );
  });
  var audiencesCard = React.createElement(
    Controls.SetCard,
    { title: '受众群体（audiences）' },
    React.createElement(Controls.SetNote, { first: true },
      '谁能看到这个作品。weight 决定发酵速度（1-10）。'),
    audienceRows.length ? audienceRows : React.createElement(Controls.SetNote, { first: false }, '（暂无）'),
    React.createElement(View, { style: { marginTop: 8 } },
      React.createElement(Controls.SetButton, { label: '+ 添加群体', onPress: function () { MOD.addAudience(); refresh(); } }))
  );

  // ---- eventPool（桌面 :94-110 / :152-155）----
  var eventRows = (d.eventPool || []).map(function (e, i) {
    var hint = (e.effect && e.effect.promptHint) || e.promptHint || '';
    return React.createElement(
      View,
      {
        key: 'e' + i,
        style: {
          borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
          padding: 10, marginBottom: 8, backgroundColor: c.bg
        }
      },
      React.createElement(
        View,
        { style: { flexDirection: 'row', alignItems: 'center', gap: 6 } },
        React.createElement(View, { style: { flex: 1 } },
          React.createElement(Controls.SetTextInput, {
            value: num(e.name), placeholder: '事件名（例：被评论家批评）',
            onChangeText: function (v) { MOD.setEvent(i, 'name', v); }
          })),
        React.createElement(View, { style: { width: 80 } },
          React.createElement(Controls.SetTextInput, {
            value: num(e.weight != null ? e.weight : 5), placeholder: '权重',
            onChangeText: function (v) { MOD.setEvent(i, 'weight', v); }
          })),
        xBtn(function () { MOD.delEvent(i); refresh(); })
      ),
      React.createElement(View, { style: { marginTop: 6 } },
        React.createElement(Controls.SetTextInput, {
          value: num(hint), placeholder: '叙事提示（给 AI 的一句话）',
          onChangeText: function (v) { MOD.setEventHint(i, v); }
        }))
    );
  });
  var eventPoolCard = React.createElement(
    Controls.SetCard,
    { title: '发酵事件池（eventPool）' },
    React.createElement(Controls.SetNote, { first: true },
      '发酵过程中可能发生的事。引擎按权重随机抽（第二版才生效，可先留空）。'),
    eventRows.length ? eventRows : React.createElement(Controls.SetNote, { first: false }, '（暂无）'),
    React.createElement(View, { style: { marginTop: 8 } },
      React.createElement(Controls.SetButton, { label: '+ 添加事件', onPress: function () { MOD.addEvent(); refresh(); } }))
  );

  // ---- settleRules（桌面 :112-137 / :157-161）----
  var affectRows = (d.settleRules.affects || []).map(function (a, i) {
    return React.createElement(
      View,
      { key: 'af' + i, style: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 } },
      React.createElement(View, { style: { flex: 1 } },
        React.createElement(Controls.SetTextInput, {
          value: num(a.statKey), placeholder: '属性 key（例：fame）',
          onChangeText: function (v) { MOD.setAffect(i, 'statKey', v); }
        })),
      React.createElement(View, { style: { width: 100 } },
        React.createElement(Controls.SetTextInput, {
          value: num(a.delta != null ? a.delta : 0), placeholder: '变化量',
          onChangeText: function (v) { MOD.setAffect(i, 'delta', v); }
        })),
      xBtn(function () { MOD.delAffect(i); refresh(); })
    );
  });
  var settleCard = React.createElement(
    Controls.SetCard,
    { title: '定论规则（settleRules）' },
    React.createElement(Controls.SetSelect, {
      label: '定论条件',
      value: whenType,
      options: WHEN_OPTIONS,
      onChange: function (v) { MOD.setWhenType(v); refresh(); }
    }),
    whenType === 'fixed-years'
      ? React.createElement(Controls.SetRow, { label: '多少年后' },
          React.createElement(View, { style: { width: 120 } },
            React.createElement(Controls.SetTextInput, {
              value: num(when.years != null ? when.years : 3),
              onChangeText: function (v) { MOD.setWhen('years', v); }
            })))
      : null,
    React.createElement(Controls.SetNote, { first: true }, '定论时影响的属性'),
    React.createElement(Controls.SetNote, { first: true },
      'statKey 填 hud / sidebar / panels 里某个数值项的 key。'),
    affectRows.length ? affectRows : React.createElement(Controls.SetNote, { first: false }, '（暂无）'),
    React.createElement(View, { style: { marginTop: 8 } },
      React.createElement(Controls.SetButton, { label: '+ 添加一条', onPress: function () { MOD.addAffect(); refresh(); } }))
  );

  // ---- 工具栏（桌面 :163-166）----
  var toolbar = React.createElement(
    View,
    { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 } },
    React.createElement(Controls.SetButton, { label: '保存产出物配置', kind: 'primary', onPress: onSave }),
    React.createElement(Controls.SetButton, { label: '↺ 重新读取', onPress: onReload })
  );

  return React.createElement(
    ScrollView,
    { style: { flex: 1 } },
    baseCard,
    typesCard,
    audiencesCard,
    eventPoolCard,
    settleCard,
    toolbar
  );
}

module.exports = { OutputsEditor: OutputsEditor };
