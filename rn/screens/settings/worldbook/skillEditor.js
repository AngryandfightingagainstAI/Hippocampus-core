// ============================================================
// 世界书编辑器 · 法术/技能（B 类，RN 组件）
// grounding：桌面 worldbook/skill_editor.js —— html()（:17-41，空态 :19-22、
//   条目横条 :23-28、工具栏 :35-38）、renderBody()（:43-93，逐字段：
//   技能名*/是什么*/副作用(有副作用开关+副作用描述)/升级系统(有等级开关+
//   等级列表：等级·升级条件·需要物品·经验·等级效果)/其它(可学地图·可教 NPC·标签)）、
//   del（:103-112 确认文案）、save（:129-134 回执）、reload（:135）。
// 数据层：engine/wb/skill.js（A 类纯逻辑，零 DOM）—— init/cur/select/add/del/
//   set/setList/addLevel/delLevel/setLevel/setLevelReq/save/reload。
// v3（阶段 C3）：技能预算 skillPool、数值规则 stat、保存前规则检查（共用
//   engine/core/skill_editor_helpers.js）、缺失数值规则提示、生效范围说明。
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
var HELPERS = require('../../../../engine/core/skill_editor_helpers.js');

var MODE_OPTIONS = [
  { value: 'block', label: 'block（拒绝越界）' },
  { value: 'warn', label: 'warn（允许并告警）' },
  { value: 'clamp', label: 'clamp（截到合法）' }
];

function SkillEditor(props) {
  var cardId = props.cardId;
  var tk = useTheme().tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var verState = React.useState(0);
  var ver = verState[0];
  var bump = verState[1];
  function refresh() { bump(function (v) { return v + 1; }); }
  var issuesState = React.useState(null);
  var issues = issuesState[0];
  var setIssues = issuesState[1];

  React.useEffect(function () {
    MOD.init(cardId);
    setIssues(null);
    refresh();
  }, [cardId]);

  function toast(msg, type) { StoryStore.pushToast(msg, { type: type || 'info', duration: 3000 }); }

  var data = MOD._data || [];
  var idx = MOD._curIdx || 0;
  if (idx >= data.length) idx = 0;
  var sk = data[idx] || null;
  var pool = MOD.pool();

  function txt(v) { return v == null ? '' : String(v); }
  function listText(a) { return (a || []).join(','); }
  function bare(k) { return String(k == null ? '' : k).replace(/^attr_+/, ''); }
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
  function cardAttrs() {
    var all = (typeof Storage !== 'undefined' && Storage.getAllCards) ? Storage.getAllCards() : {};
    var card = all[cardId];
    return (card && Array.isArray(card.attributes)) ? card.attributes : [];
  }

  // ---- 结构性操作 ----
  function onSelect(i) { MOD.select(i); refresh(); }
  function onAdd() { MOD.add(); refresh(); }
  function onDel(i) {
    var x = MOD._data[i] || {};
    Platform.ui.confirmAsync('删除技能「' + (x.name || '未命名') + '」？' + (x.stat ? '（含数值规则）' : '')).then(function (ok) {
      if (!ok) return;
      MOD.del(i);
      setIssues(null);
      refresh();
    });
  }

  function runCheck() {
    var all = (typeof Storage !== 'undefined' && Storage.getAllCards) ? Storage.getAllCards() : {};
    var r = HELPERS.validate(all[cardId] || null, { skills: MOD._data, skillPool: MOD.pool() });
    setIssues(r);
    return r;
  }
  function onCheck() { runCheck(); refresh(); }

  function doSave(r) {
    var res = MOD.save();
    if (res && res.ok) {
      var tail = (r && r.errorCount > 0) ? '（' + r.errorCount + ' 条规则问题待处理）' : '';
      toast('技能已保存' + tail, 'success');
    } else toast((res && res.reason) || '保存失败', 'error');
    refresh();
  }
  function onSave() {
    var r = runCheck();
    refresh();
    if (r.errorCount > 0) {
      var first = r.issues.filter(function (i) { return i.level === 'error'; }).slice(0, 3)
        .map(function (i) { return '· [' + i.code + '] ' + i.path; }).join('\n');
      Platform.ui.confirmAsync('规则检查发现 ' + r.errorCount + ' 条错误：\n' + first +
        (r.errorCount > 3 ? '\n…' : '') + '\n\n可以保存为草稿；导入 / 诊断 / 运行时仍会按原规则校验。继续保存？').then(function (ok) {
        if (!ok) return;
        doSave(r);
      });
      return;
    }
    doSave(r);
  }
  function onReload() {
    Platform.ui.confirmAsync('放弃修改？').then(function (ok) {
      if (!ok) return;
      MOD.reload();
      setIssues(null);
      refresh();
    });
  }
  function onAddLevel() { MOD.addLevel(idx); refresh(); }
  function onDelLevel(li) { MOD.delLevel(idx, li); refresh(); }

  // ---- 技能预算 ----
  function budgetCard() {
    var on = pool != null;
    return React.createElement(
      Controls.SetCard,
      { title: '技能预算（可选）' },
      React.createElement(Controls.SetNote, { first: true }, '独立于属性池。若创角步骤里也写了 pool，两处值不同会报冲突（不会自动取其中一处）。'),
      React.createElement(Controls.SetSwitchRow, {
        label: '启用技能预算', value: on,
        onValueChange: function (v) { MOD.setPoolEnabled(v); refresh(); }
      }),
      on ? React.createElement(
        View,
        null,
        React.createElement(
          Controls.SetRow,
          { label: '总点数 total' },
          smallInput(txt(pool.total), '数字或公式；留空=不限制', function (v) { MOD.setPoolField('total', v); }, 200)
        ),
        React.createElement(Controls.SetChips, {
          options: MODE_OPTIONS, value: pool.mode || 'block',
          onChange: function (v) { MOD.setPoolField('mode', v); refresh(); }
        }),
        React.createElement(Controls.SetSwitchRow, {
          label: '必须花完（requireSpend）', value: pool.requireSpend === true,
          onValueChange: function (v) { MOD.setPoolField('requireSpend', v); refresh(); }
        })
      ) : React.createElement(Controls.SetNote, { first: true }, '未启用：保存时写入 skillPool: null（等同未配置）。')
    );
  }

  // ---- 数值规则 ----
  function statCard() {
    var st = MOD.statOf(idx);
    var attrs = cardAttrs();
    var picked = (st && Array.isArray(st.attrs)) ? st.attrs.map(bare) : [];
    return React.createElement(
      Controls.SetCard,
      { title: '数值规则（可选）' },
      React.createElement(Controls.SetSwitchRow, {
        label: '配置数值规则', value: st != null,
        onValueChange: function (v) {
          if (!v) {
            Platform.ui.confirmAsync('关闭会删除该技能的数值规则（stat），继续？').then(function (ok) {
              if (!ok) { refresh(); return; }
              MOD.disableStat(idx); setIssues(null); refresh();
            });
            return;
          }
          MOD.enableStat(idx);
          setIssues(null);
          refresh();
        }
      }),
      st == null
        ? React.createElement(Controls.SetNote, { first: true }, '尚未配置数值规则（可选）。不配置时该技能不参与技能预算与分配；旧卡技能通常就是这种状态。')
        : React.createElement(
            View,
            null,
            React.createElement(Controls.SetNote, { first: true }, 'init / bonus 可填数字或公式（如 floor(attr.int / 5)）；公式只允许四则、比较、三元与 floor/ceil/round/min/max。留空表示使用缺省（init=0、bonus=0）。'),
            React.createElement(
              Controls.SetRow,
              { label: '初始值 init' },
              smallInput(txt(st.init), '数字或公式；留空=0', function (v) { MOD.setStatRaw(idx, 'init', v); }, 200)
            ),
            React.createElement(
              Controls.SetRow,
              { label: '属性加成 bonus' },
              smallInput(txt(st.bonus), '数字或公式；留空=0', function (v) { MOD.setStatRaw(idx, 'bonus', v); }, 200)
            ),
            React.createElement(Controls.SetSwitchRow, {
              label: '无下限', value: st.min == null,
              onValueChange: function (v) { MOD.setBound(idx, 'min', v); refresh(); }
            }),
            st.min == null ? null : React.createElement(
              Controls.SetRow,
              { label: '下限 min' },
              smallInput(txt(st.min), '数字', function (v) { MOD.setStatNum(idx, 'min', v); }, 120)
            ),
            React.createElement(Controls.SetSwitchRow, {
              label: '无上限', value: st.max == null,
              onValueChange: function (v) { MOD.setBound(idx, 'max', v); refresh(); }
            }),
            st.max == null ? null : React.createElement(
              Controls.SetRow,
              { label: '上限 max' },
              smallInput(txt(st.max), '数字', function (v) { MOD.setStatNum(idx, 'max', v); }, 120)
            ),
            React.createElement(
              Controls.SetRow,
              { label: '关联属性 attrs' },
              attrs.length
                ? React.createElement(
                    View,
                    { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 } },
                    attrs.map(function (a) {
                      var k = bare(a.key);
                      var on = picked.indexOf(k) >= 0;
                      return React.createElement(
                        TouchableOpacity,
                        {
                          key: 'attr' + k,
                          onPress: function () { MOD.toggleAttr(idx, k, !on); refresh(); },
                          style: {
                            paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1,
                            borderRadius: tk.radius.sm,
                            borderColor: on ? c.primary : c.hairStrong,
                            backgroundColor: on ? c.primary : c.bgCard
                          }
                        },
                        React.createElement(Text, { style: { fontSize: f.xs, color: on ? c.bgCard : c.ink } },
                          (a.name || k) + '（' + k + '）')
                      );
                    })
                  )
                : React.createElement(Text, { style: { fontSize: f.xs, color: c.muted } }, '本卡未声明 card.attributes，无法选择关联属性。')
            )
          )
    );
  }

  // ---- 规则检查结果 ----
  function issuesBlock() {
    if (!issues) {
      return React.createElement(Controls.SetNote, { first: false }, '保存前会做一次规则检查；保存只写入卡带，不代表规则通过（导入 / 诊断 / 运行时仍会各自校验）。');
    }
    if (!issues.issues.length) {
      return React.createElement(Controls.SetNote, { first: false }, '规则检查：未发现结构性问题（仍以后续导入 / 诊断 / 运行时校验为准）。');
    }
    return React.createElement(
      View,
      null,
      React.createElement(Text, { style: { fontSize: f.sm, color: c.ink, marginBottom: 6, fontWeight: '700' } },
        '规则检查：' + issues.errorCount + ' 错误 / ' + issues.warningCount + ' 警告'),
      issues.issues.map(function (it, i) {
        var col = it.level === 'error' ? c.danger : c.warn;
        return React.createElement(
          View,
          { key: 'iss' + i, style: { borderLeftWidth: 3, borderLeftColor: col, paddingLeft: 8, marginBottom: 6 } },
          React.createElement(Text, { style: { fontSize: f.xs, color: col } }, (it.level === 'error' ? '错误' : '警告') + ' [' + it.code + '] ' + it.path),
          React.createElement(Text, { style: { fontSize: f.xs, color: c.ink2 } }, it.message)
        );
      })
    );
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
      statCard(),
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

  var missing = HELPERS.countMissingStat(data);
  var missingNote = (data.length && missing > 0)
    ? React.createElement(Controls.SetNote, { first: false }, '本卡带有 ' + missing + ' 个技能未配置数值规则（可选；旧卡技能通常没有）。')
    : null;
  var scopeNote = React.createElement(Controls.SetNote, { first: false }, '说明：卡带修改只影响之后新建的存档；已有存档使用创建时的卡带快照，不会自动更新。');

  // 空态（html :19-22）：只有提示 + 新建按钮
  if (!data.length) {
    return React.createElement(
      ScrollView, { keyboardShouldPersistTaps: 'handled', style: { flex: 1 }, contentContainerStyle: { paddingBottom: 40 } },
      React.createElement(
        View,
        { style: { paddingVertical: 20, alignItems: 'center' } },
        React.createElement(Text, { style: { fontSize: f.sm, color: c.muted, textAlign: 'center' } }, '还没有技能。')
      ),
      React.createElement(Controls.SetButton, { label: '+ 新建技能', onPress: onAdd }),
      budgetCard(),
      issuesBlock(),
      scopeNote
    );
  }

  return React.createElement(
    ScrollView, { keyboardShouldPersistTaps: 'handled', style: { flex: 1 }, contentContainerStyle: { paddingBottom: 40 } },
    budgetCard(),
    tabBar(),
    React.createElement(
      View,
      { style: { marginBottom: 10 } },
      React.createElement(Controls.SetButton, { label: '+ 新建技能', onPress: onAdd })
    ),
    sk ? body() : React.createElement(Text, { style: { fontSize: f.sm, color: c.muted } }, '（空）'),
    issuesBlock(),
    missingNote,
    React.createElement(
      View,
      { style: { flexDirection: 'row', gap: 10, marginTop: 16 } },
      React.createElement(Controls.SetButton, { label: '保存技能', onPress: onSave, kind: 'primary' }),
      React.createElement(Controls.SetButton, { label: '检查规则', onPress: onCheck }),
      React.createElement(Controls.SetButton, { label: '↺ 重新读取', onPress: onReload })
    ),
    scopeNote
  );
}

module.exports = { SkillEditor: SkillEditor };
