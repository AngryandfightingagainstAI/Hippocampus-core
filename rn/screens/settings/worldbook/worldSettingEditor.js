// ============================================================
// 战役 P2 · S3：设置页 · 世界书 世界设定编辑器（B 类）
// grounding：桌面 worldbook/world_setting_editor.js html(:88-306) 八块：
//   基础 / 世界边界（existence）/ 年代产物（eraProducts）/ 能力体系 /
//   官方（可多个国家/政权）/ 军方 / 宗教（可多个）/ 种族歧视；
//   保存 :443-463（校验文案）、addReligionToFactions :401-436。
// 数据层：engine/wb/world_setting.js（A 类，零 DOM）—— MOD.data() 取对象；
//   set('a.b') 点路径 / addExistence / delExistence / setExistence /
//   addEraSeg / delEraSeg / setEraSeg / setEraList / addCounter / delCounter /
//   setCounter / addOfficial / delOfficial / setOfficial / addReligion /
//   delReligion / setReligion / addReligionToFactions / save / reload。
// 适配点（相对桌面 DOM）：
//   1) 桌面整块 innerHTML 重绘；RN 只对结构性变更（增删条目 / 开关 / 保存）
//      refresh，纯文本输入不 refresh（避免输入法失焦）。
//   2) 桌面 data-icon 图标一律舍弃，只留文字（删除钮用 ×，新宗教标记「新」）。
//   3) 桌面 WB.showMsg 内联回执 → RN 走 StoryStore.pushToast（文案逐字）。
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
var MOD = require('../../../../engine/wb/world_setting.js');

function WorldSettingEditor(props) {
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

  // 点路径 setter（桌面 :308-314 同语义）
  function set(path, v) { MOD.set(path, v); }

  function onSave() {
    var r = MOD.save();
    if (r && r.ok) toast('世界设定已保存', 'success');
    else toast((r && r.reason) || '保存失败', 'warn');
  }
  function onReligionToFactions(i) {
    var r = MOD.addReligionToFactions(i);
    if (r && r.ok) toast('已添加到势力栏', 'success');
    else toast((r && r.reason) || '添加失败', 'warn');
    refresh();
  }
  function onDelEra(i) {
    Platform.ui.confirmAsync('删除这个时段？').then(function (ok) {
      if (!ok) return;
      MOD.delEraSeg(i);
      refresh();
    });
  }
  function onDelOfficial(i) {
    Platform.ui.confirmAsync('删除这个官方条目？').then(function (ok) {
      if (!ok) return;
      MOD.delOfficial(i);
      refresh();
    });
  }
  function onDelReligion(i) {
    Platform.ui.confirmAsync('删除这个宗教条目？').then(function (ok) {
      if (!ok) return;
      MOD.delReligion(i);
      refresh();
    });
  }

  // 删除钮（桌面 data-icon="x"，舍弃图标 → ×）
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
  function wide(v) { return React.createElement(View, { style: { width: 220 } }, v); }

  var d = MOD.data();

  if (!d) {
    return React.createElement(
      ScrollView,
      { style: { flex: 1 } },
      React.createElement(Controls.SetCard, { title: '世界设定' },
        React.createElement(Controls.SetNote, { first: true }, '（未初始化）'))
    );
  }

  // ---- 基础（桌面 :192-204）----
  var baseCard = React.createElement(
    Controls.SetCard,
    { title: '基础' },
    React.createElement(Controls.SetRow, { label: '世界名 *' },
      wide(React.createElement(Controls.SetTextInput, {
        value: num(d.worldName), placeholder: '例：星轨大陆',
        onChangeText: function (v) { set('worldName', v); }
      }))),
    React.createElement(Controls.SetRow, { label: '主要舞台 *' },
      wide(React.createElement(Controls.SetTextInput, {
        value: num(d.mainStage), placeholder: '例：大陆北境的银月城',
        onChangeText: function (v) { set('mainStage', v); }
      }))),
    React.createElement(Controls.SetNote, { first: false }, '一句话总览 *'),
    React.createElement(Controls.SetTextInput, {
      value: num(d.description), multiline: true, rows: 2,
      placeholder: '用一两句话概括这个世界',
      onChangeText: function (v) { set('description', v); }
    })
  );

  // ---- 世界边界 existence（桌面 :92-111 / :206-221）----
  var hasRows = (d.existence.has || []).map(function (x, i) {
    return React.createElement(
      View,
      { key: 'h' + i, style: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 } },
      React.createElement(View, { style: { flex: 1 } },
        React.createElement(Controls.SetTextInput, {
          value: num(x), placeholder: '例：魔法',
          onChangeText: function (v) { MOD.setExistence('has', i, v); }
        })),
      xBtn(function () { MOD.delExistence('has', i); refresh(); })
    );
  });
  var hasNotRows = (d.existence.hasNot || []).map(function (x, i) {
    return React.createElement(
      View,
      { key: 'n' + i, style: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 } },
      React.createElement(View, { style: { flex: 1 } },
        React.createElement(Controls.SetTextInput, {
          value: num(x), placeholder: '例：电力',
          onChangeText: function (v) { MOD.setExistence('hasNot', i, v); }
        })),
      xBtn(function () { MOD.delExistence('hasNot', i); refresh(); })
    );
  });
  var existenceCard = React.createElement(
    Controls.SetCard,
    { title: '世界边界（existence）' },
    React.createElement(Controls.SetNote, { first: true },
      '写清楚这个世界"有什么"和"没有什么"，AI 就不会编出不存在的东西。'),
    React.createElement(Controls.SetNote, { first: false }, '这个世界存在'),
    hasRows.length ? hasRows : React.createElement(Controls.SetNote, { first: false }, '（暂无）'),
    React.createElement(View, { style: { marginBottom: 14 } },
      React.createElement(Controls.SetButton, { label: '+ 添加', onPress: function () { MOD.addExistence('has'); refresh(); } })),
    React.createElement(Controls.SetNote, { first: false }, '这个世界不存在'),
    hasNotRows.length ? hasNotRows : React.createElement(Controls.SetNote, { first: false }, '（暂无）'),
    React.createElement(View, { style: { marginTop: 8 } },
      React.createElement(Controls.SetButton, { label: '+ 添加', onPress: function () { MOD.addExistence('hasNot'); refresh(); } }))
  );

  // ---- 年代产物 eraProducts（桌面 :113-138 / :223-228）----
  var eraRows = (d.eraProducts || []).map(function (seg, i) {
    return React.createElement(
      View,
      {
        key: 'era' + i,
        style: {
          borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
          padding: 10, marginBottom: 8, backgroundColor: c.bg
        }
      },
      React.createElement(
        View,
        { style: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 } },
        React.createElement(View, { style: { width: 90 } },
          React.createElement(Controls.SetTextInput, {
            value: num(seg.from), placeholder: '从',
            onChangeText: function (v) { MOD.setEraSeg(i, 'from', v); }
          })),
        React.createElement(Text, { style: { fontSize: f.sm, color: c.muted } }, '—'),
        React.createElement(View, { style: { width: 90 } },
          React.createElement(Controls.SetTextInput, {
            value: num(seg.to), placeholder: '到',
            onChangeText: function (v) { MOD.setEraSeg(i, 'to', v); }
          })),
        React.createElement(View, { style: { flex: 1 } }),
        xBtn(function () { onDelEra(i); })
      ),
      React.createElement(Controls.SetNote, { first: true }, '这个年代有（逗号分隔）'),
      React.createElement(Controls.SetTextInput, {
        value: (seg.has || []).join(','), placeholder: '蒸汽机, 马车, 电报',
        onChangeText: function (v) { MOD.setEraList(i, 'has', v); }
      }),
      React.createElement(Controls.SetNote, { first: false }, '这个年代没有（逗号分隔）'),
      React.createElement(Controls.SetTextInput, {
        value: (seg.hasNot || []).join(','), placeholder: '汽车, 飞机, 电子设备',
        onChangeText: function (v) { MOD.setEraList(i, 'hasNot', v); }
      })
    );
  });
  var eraCard = React.createElement(
    Controls.SetCard,
    { title: '年代产物（eraProducts）' },
    React.createElement(Controls.SetNote, { first: true },
      '按游戏内年份分段的产物清单。AI 会按当前年份自动约束。年代范围外的年份，AI 用最近一段参考。'),
    eraRows.length ? eraRows : React.createElement(Controls.SetNote, { first: false }, '（暂无）'),
    React.createElement(View, { style: { marginTop: 8 } },
      React.createElement(Controls.SetButton, { label: '+ 添加时段', onPress: function () { MOD.addEraSeg(); refresh(); } }))
  );

  // ---- 能力体系（桌面 :141-149 / :230-251）----
  var counterRows = (d.powerCounters || []).map(function (x, i) {
    return React.createElement(
      View,
      { key: 'cnt' + i, style: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 } },
      React.createElement(View, { style: { flex: 1 } },
        React.createElement(Controls.SetTextInput, {
          value: num(x), placeholder: '例：冰系克制火系',
          onChangeText: function (v) { MOD.setCounter(i, v); }
        })),
      xBtn(function () { MOD.delCounter(i); refresh(); })
    );
  });
  var powerCard = React.createElement(
    Controls.SetCard,
    { title: '能力体系' },
    React.createElement(Controls.SetNote, { first: true }, '特殊能力体系描述'),
    React.createElement(Controls.SetTextInput, {
      value: num(d.powerSystem), multiline: true, rows: 3,
      placeholder: '例：以星辰共鸣为核心的灵力体系',
      onChangeText: function (v) { set('powerSystem', v); }
    }),
    React.createElement(Controls.SetSwitchRow, {
      label: '多种能力混杂', value: !!d.powerMix,
      onValueChange: function (v) { set('powerMix', v); refresh(); }
    }),
    React.createElement(Controls.SetRow, { label: '能力上限' },
      wide(React.createElement(Controls.SetTextInput, {
        value: num(d.powerCeiling), placeholder: '例：顶尖者可以挪动山岳',
        onChangeText: function (v) { set('powerCeiling', v); }
      }))),
    React.createElement(Controls.SetNote, { first: false }, '克制关系'),
    counterRows.length ? counterRows : React.createElement(Controls.SetNote, { first: false }, '（暂无）'),
    React.createElement(View, { style: { marginTop: 4, marginBottom: 8 } },
      React.createElement(Controls.SetButton, { label: '+ 添加一条', onPress: function () { MOD.addCounter(); refresh(); } })),
    React.createElement(Controls.SetRow, { label: '弱点' },
      wide(React.createElement(Controls.SetTextInput, {
        value: num(d.powerWeakness), placeholder: '例：灵力耗尽会陷入昏迷',
        onChangeText: function (v) { set('powerWeakness', v); }
      })))
  );

  // ---- 官方（桌面 :151-163 / :253-257）----
  var officialRows = (d.officials || []).map(function (o, i) {
    return React.createElement(
      View,
      {
        key: 'off' + i,
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
            value: num(o.name), placeholder: '官方/国家名',
            onChangeText: function (v) { MOD.setOfficial(i, 'name', v); }
          })),
        xBtn(function () { onDelOfficial(i); })
      ),
      React.createElement(View, { style: { marginTop: 6 } },
        React.createElement(Controls.SetTextInput, {
          value: num(o.stance), placeholder: '对这个能力的官方态度',
          onChangeText: function (v) { MOD.setOfficial(i, 'stance', v); }
        }))
    );
  });
  var officialCard = React.createElement(
    Controls.SetCard,
    { title: '官方（可多个国家/政权）' },
    officialRows.length ? officialRows : React.createElement(Controls.SetNote, { first: true }, '（暂无）'),
    React.createElement(View, { style: { marginTop: 8 } },
      React.createElement(Controls.SetButton, { label: '+ 添加一个官方', onPress: function () { MOD.addOfficial(); refresh(); } }))
  );

  // ---- 军方（桌面 :259-275）----
  var militaryCard = React.createElement(
    Controls.SetCard,
    { title: '军方' },
    React.createElement(Controls.SetSwitchRow, {
      label: '军方应用', value: !!(d.militaryUse && d.militaryUse.used),
      onValueChange: function (v) { set('militaryUse.used', v); refresh(); }
    }),
    React.createElement(Controls.SetSwitchRow, {
      label: '曾用于战争', value: !!(d.militaryUse && d.militaryUse.inWar),
      onValueChange: function (v) { set('militaryUse.inWar', v); refresh(); }
    }),
    React.createElement(Controls.SetRow, { label: '补充说明' },
      wide(React.createElement(Controls.SetTextInput, {
        value: num(d.militaryUse && d.militaryUse.note), placeholder: '补充说明',
        onChangeText: function (v) { set('militaryUse.note', v); }
      })))
  );

  // ---- 宗教（桌面 :165-190 / :277-288）----
  var religionRows = (d.religions || []).map(function (r, i) {
    return React.createElement(
      View,
      {
        key: 'rel' + i,
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
            value: num(r.name), placeholder: '宗教名',
            onChangeText: function (v) { MOD.setReligion(i, 'name', v); }
          })),
        r.isNew
          ? React.createElement(Text, { style: { fontSize: f.xs, color: c.primary } }, '新')
          : null,
        xBtn(function () { onDelReligion(i); })
      ),
      React.createElement(View, { style: { marginTop: 6 } },
        React.createElement(Controls.SetTextInput, {
          value: num(r.faith), placeholder: '信仰什么',
          onChangeText: function (v) { MOD.setReligion(i, 'faith', v); }
        })),
      React.createElement(View, { style: { marginTop: 6 } },
        React.createElement(Controls.SetTextInput, {
          value: num(r.practice), placeholder: '平常做什么',
          onChangeText: function (v) { MOD.setReligion(i, 'practice', v); }
        })),
      React.createElement(View, { style: { marginTop: 6 } },
        React.createElement(Controls.SetTextInput, {
          value: num(r.stance), placeholder: '对这个能力的态度',
          onChangeText: function (v) { MOD.setReligion(i, 'stance', v); }
        })),
      React.createElement(View, { style: { marginTop: 8 } },
        React.createElement(Controls.SetButton, { label: '→ 添加到势力栏', onPress: function () { onReligionToFactions(i); } }))
    );
  });
  var religionCard = React.createElement(
    Controls.SetCard,
    { title: '宗教（可多个）' },
    religionRows.length ? religionRows : React.createElement(Controls.SetNote, { first: true }, '（暂无）'),
    React.createElement(View, { style: { marginTop: 8 } },
      React.createElement(Controls.SetButton, { label: '+ 添加一个宗教', onPress: function () { MOD.addReligion(); refresh(); } })),
    React.createElement(Controls.SetSwitchRow, {
      label: '存在因能力而诞生的新宗教', value: !!d.newReligion,
      onValueChange: function (v) { set('newReligion', v); refresh(); }
    })
  );

  // ---- 种族歧视（桌面 :290-304）----
  var racialCard = React.createElement(
    Controls.SetCard,
    { title: '种族歧视' },
    React.createElement(Controls.SetSwitchRow, {
      label: '存在种族歧视', value: !!(d.racialDiscrimination && d.racialDiscrimination.has),
      onValueChange: function (v) { set('racialDiscrimination.has', v); refresh(); }
    }),
    (d.racialDiscrimination && d.racialDiscrimination.has)
      ? React.createElement(Controls.SetRow, { label: '针对谁' },
          wide(React.createElement(Controls.SetTextInput, {
            value: num(d.racialDiscrimination.against), placeholder: '例：暗影系灵力者',
            onChangeText: function (v) { set('racialDiscrimination.against', v); }
          })))
      : null
  );

  return React.createElement(
    ScrollView,
    { style: { flex: 1 } },
    baseCard,
    existenceCard,
    eraCard,
    powerCard,
    officialCard,
    militaryCard,
    religionCard,
    racialCard,
    React.createElement(View, { style: { flexDirection: 'row', gap: 10, marginTop: 16 } },
      React.createElement(Controls.SetButton, { label: '保存', kind: 'primary', onPress: onSave }))
  );
}

module.exports = { WorldSettingEditor: WorldSettingEditor };
