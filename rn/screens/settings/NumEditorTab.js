// ============================================================
// 战役 P2 · S2：设置页 · 数值编辑器 tab（B 类）
// grounding：桌面 engine/editor.js NumEditor.render（:98-116，卡带选择 +
//   「共 N 条数值。」+ 条目列表 + 「+ 新建连续数值」/「+ 新建关系」+
//   「💾 保存」/「↺ 重新读取」）与 renderItem（:117-147，逐项字段：
//   icon / label / 类型标签 / 删除 / 内部名 / 从 / 对 / 位置 / 上下限
//   （min·max·init 三输入）/ 颜色 / 总说明 / 分段说明（min·max·text·
//   触发钮·删段钮）/ + 添加一段）。
// 数据层：globalThis.NumEditor（rn_bootstrap.js 装载 engine/num_editor.js，
//   两仓同源主体 + 去 DOM 适配）+ globalThis.Storage。
// 交互适配（相对桌面 DOM 的三处）：
//   - 桌面靠整块 innerHTML 重绘：RN 只对「结构性变更」（选卡带 / 增删条目 /
//     增删段 / 触发开关 / 保存 / 重读）bump 重渲染；纯文本输入
//     （set / setSeg）同桌面 :353/:356 语义不重绘，避免输入法失焦。
//   - 桌面 UI.confirmAsync / UI.toast：组件层发（文案逐字）。
//   - 保存回执：桌面内联 .alert 显示「已保存」；RN 走 StoryStore.pushToast。
// 文案逐字照桌面；RN 侧不搬 HTML。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var TouchableOpacity = RN.TouchableOpacity;

var useTheme = require('../../use_theme.js').useTheme;
var Controls = require('../../components/settings/controls.js');
var StoryStore = require('../../story_store.js');

// renderItem :288 四色选项逐字
var COLOR_OPTIONS = [
  { value: 'blue', label: '蓝' },
  { value: 'green', label: '绿' },
  { value: 'yellow', label: '黄' },
  { value: 'red', label: '红' }
];

function NumEditorTab() {
  var tk = useTheme().tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var verState = React.useState(0);
  var ver = verState[0];
  var bump = verState[1];
  function refresh() { bump(function (v) { return v + 1; }); }

  function NE() { return globalThis.NumEditor; }
  function toast(msg, type) {
    StoryStore.pushToast(msg, { type: type || 'info', duration: 3000 });
  }

  var NEo = null;
  try { NEo = NE(); } catch (e0) { NEo = null; }
  // render :269 同语义：cardId 指向不存在的卡带 → 静默重置
  if (NEo && NEo.cardId) NEo._ensureValidCard();

  var cardId = NEo ? NEo.cardId : null;
  var items = (NEo && NEo.items) || [];

  // 卡带清单（render :271-272：Storage.getAllCards()）
  var cards = {};
  try { cards = globalThis.Storage.getAllCards() || {}; } catch (e1) { cards = {}; }
  var cardOptions = [{ value: '', label: '-- 选择卡带 --' }];
  Object.keys(cards).forEach(function (k) {
    var cd = cards[k] || {};
    cardOptions.push({ value: cd.cardId || k, label: cd.cardName || cd.cardId || k });
  });

  var whereOptions = NEo ? NEo.whereOptions() : [{ value: 'hud', label: '顶栏（HUD）' }, { value: 'sidebar', label: '左侧状态栏' }];

  // ---- 结构性操作（桌面每步都整块重绘 → RN bump）----
  function onPick(id) {
    var r = NE().pickCard(id);
    if (r && r.ok === false) toast(r.reason, 'warn');
    refresh();
  }
  function onAdd(type) {
    var r = NE().addItem(type);
    if (r && r.ok === false) toast(r.reason, 'warn');
    refresh();
  }
  function onDelItem(i) {
    Platform.ui.confirmAsync('删除？').then(function (ok) {
      if (!ok) return;
      NE().delItem(i);
      refresh();
    });
  }
  function onAddSeg(i) { NE().addSeg(i); refresh(); }
  function onDelSeg(i, si) { NE().delSeg(i, si); refresh(); }
  function onToggleTrigger(i, si) { NE().toggleTrigger(i, si); refresh(); }
  function onSave() {
    var r = NE().saveAndSync();
    if (r && r.ok) {
      if (r.validation && r.validation.ok === false) toast('已保存（校验：' + r.validation.msg + '）', 'warn');
      else toast('已保存', 'success');
    } else {
      toast((r && r.reason) || '保存失败', 'error');
    }
    refresh();
  }
  function onReload() {
    if (NE().dirty) {
      Platform.ui.confirmAsync('放弃修改？').then(function (ok) {
        if (!ok) return;
        var r = NE().reload();
        if (r && r.ok === false) toast(r.reason, 'error');
        refresh();
      });
      return;
    }
    var r2 = NE().reload();
    if (r2 && r2.ok === false) toast(r2.reason, 'error');
    refresh();
  }

  // ---- 纯文本/数值编辑（桌面 :353 set / :356 setSeg 不重绘）----
  function setField(i, key, v) { NE().set(i, key, v); }
  function setSegField(i, si, key, v) { NE().setSeg(i, si, key, v); }

  function numText(v) { return v == null ? '' : String(v); }

  // ---- 单条数值卡片（renderItem 逐字段）----
  function renderItem(it, i) {
    var isRel = it.type === 'relation';
    return React.createElement(
      View,
      {
        key: 'item' + i,
        style: {
          borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
          padding: 10, marginBottom: 10, backgroundColor: c.bg
        }
      },
      // 头行：icon / 名称 / 类型标签 / 删除
      React.createElement(
        View,
        { style: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 } },
        React.createElement(
          View,
          { style: { width: 54 } },
          React.createElement(Controls.SetTextInput, {
            value: numText(it.icon), onChangeText: function (v) { setField(i, 'icon', v); }
          })
        ),
        React.createElement(
          View,
          { style: { flex: 1 } },
          React.createElement(Controls.SetTextInput, {
            value: numText(it.label), placeholder: '名称', onChangeText: function (v) { setField(i, 'label', v); }
          })
        ),
        React.createElement(Text, { style: { fontSize: f.xs, color: c.muted } }, isRel ? '关系' : '连续数值'),
        React.createElement(
          TouchableOpacity,
          { onPress: function () { onDelItem(i); }, style: { borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm, paddingHorizontal: 10, paddingVertical: 4 } },
          React.createElement(Text, { style: { fontSize: f.xs, color: c.danger } }, '删除')
        )
      ),
      // 内部名
      React.createElement(Controls.SetRow, { label: '内部名' },
        React.createElement(View, { style: { width: 170 } },
          React.createElement(Controls.SetTextInput, { value: numText(it.key), onChangeText: function (v) { setField(i, 'key', v); } }))),
      // 关系型：从 / 对（renderItem :304-305，桌面用 <select> 从 npcOptions，RN 用可输入文本）
      isRel
        ? React.createElement(Controls.SetRow, { label: '从' },
            React.createElement(View, { style: { width: 170 } },
              React.createElement(Controls.SetTextInput, { value: numText(it.from || 'player'), onChangeText: function (v) { setField(i, 'from', v); } })))
        : null,
      isRel
        ? React.createElement(Controls.SetRow, { label: '对' },
            React.createElement(View, { style: { width: 170 } },
              React.createElement(Controls.SetTextInput, { value: numText(it.to), onChangeText: function (v) { setField(i, 'to', v); } })))
        : null,
      // 位置
      React.createElement(Controls.SetSelect, {
        label: '位置', value: it.where, options: whereOptions,
        onChange: function (v) { NE().set(i, 'where', v); refresh(); }
      }),
      // 上下限：min / max / init（renderItem :307-310）
      React.createElement(Controls.SetRow, { label: '上下限' },
        React.createElement(
          View,
          { style: { flexDirection: 'row', gap: 6 } },
          React.createElement(View, { style: { width: 62 } },
            React.createElement(Controls.SetTextInput, { value: numText(it.min), placeholder: '下限', onChangeText: function (v) { setField(i, 'min', v === '' ? 0 : Number(v)); } })),
          React.createElement(View, { style: { width: 62 } },
            React.createElement(Controls.SetTextInput, { value: numText(it.max), placeholder: '上限', onChangeText: function (v) { setField(i, 'max', v === '' ? null : Number(v)); } })),
          React.createElement(View, { style: { width: 62 } },
            React.createElement(Controls.SetTextInput, { value: numText(it.init), placeholder: '初始', onChangeText: function (v) { setField(i, 'init', v === '' ? 0 : Number(v)); } }))
        )),
      // 颜色
      React.createElement(Controls.SetSelect, {
        label: '颜色', value: it.color || 'blue', options: COLOR_OPTIONS,
        onChange: function (v) { NE().set(i, 'color', v); refresh(); }
      }),
      // 总说明
      React.createElement(Controls.SetRow, { label: '总说明' },
        React.createElement(View, { style: { width: 170 } },
          React.createElement(Controls.SetTextInput, { value: numText(it.desc), onChangeText: function (v) { setField(i, 'desc', v); } }))),
      // 分段说明
      React.createElement(Controls.SetNote, { first: false }, '分段说明'),
      (it.segments || []).map(function (s, si) {
        return React.createElement(
          View,
          { key: 'seg' + si, style: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 } },
          React.createElement(View, { style: { width: 58 } },
            React.createElement(Controls.SetTextInput, { value: numText(s.min != null ? s.min : 0), placeholder: 'min', onChangeText: function (v) { setSegField(i, si, 'min', v); } })),
          React.createElement(View, { style: { width: 58 } },
            React.createElement(Controls.SetTextInput, { value: numText(s.max != null ? s.max : 100), placeholder: 'max', onChangeText: function (v) { setSegField(i, si, 'max', v); } })),
          React.createElement(View, { style: { flex: 1 } },
            React.createElement(Controls.SetTextInput, { value: numText(s.text), placeholder: '文案', onChangeText: function (v) { setSegField(i, si, 'text', v); } })),
          React.createElement(
            TouchableOpacity,
            {
              onPress: function () { onToggleTrigger(i, si); },
              style: {
                borderWidth: 1, borderRadius: tk.radius.sm, paddingHorizontal: 8, paddingVertical: 6,
                borderColor: s.trigger ? c.primary : c.hairStrong
              }
            },
            React.createElement(Text, { style: { fontSize: f.xs, color: s.trigger ? c.primary : c.ink2 } }, s.trigger ? '☑触发' : '☐触发')
          ),
          React.createElement(
            TouchableOpacity,
            { onPress: function () { onDelSeg(i, si); }, style: { paddingHorizontal: 6, paddingVertical: 6 } },
            React.createElement(Text, { style: { fontSize: f.xs, color: c.danger } }, '×')
          )
        );
      }),
      React.createElement(
        View,
        { style: { marginTop: 4 } },
        React.createElement(Controls.SetButton, { label: '+ 添加一段', onPress: function () { onAddSeg(i); } })
      )
    );
  }

  return React.createElement(
    View,
    { style: { flex: 1 } },
    React.createElement(
      Controls.SetCard,
      { title: '数值编辑器' },

      // 卡带选择（render :281 的 <select>）
      React.createElement(Controls.SetSelect, {
        label: '卡带', value: cardId || '', options: cardOptions, onChange: onPick
      }),

      !cardId
        ? React.createElement(Controls.SetNote, { first: false }, '选择一个卡带开始编辑。')
        : React.createElement(
            View,
            null,
            React.createElement(Controls.SetNote, { first: false }, '共 ' + items.length + ' 条数值。'),
            items.map(renderItem),
            React.createElement(
              View,
              { style: { flexDirection: 'row', gap: 8, marginTop: 12 } },
              React.createElement(View, { style: { flex: 1 } },
                React.createElement(Controls.SetButton, { label: '+ 新建连续数值', onPress: function () { onAdd('gauge'); } })),
              React.createElement(View, { style: { flex: 1 } },
                React.createElement(Controls.SetButton, { label: '+ 新建关系', onPress: function () { onAdd('relation'); } }))
            ),
            React.createElement(
              View,
              { style: { flexDirection: 'row', gap: 10, marginTop: 16 } },
              React.createElement(Controls.SetButton, { label: '💾 保存', onPress: onSave, kind: 'primary' }),
              React.createElement(Controls.SetButton, { label: '↺ 重新读取', onPress: onReload })
            )
          )
    )
  );
}

module.exports = { NumEditorTab: NumEditorTab };
