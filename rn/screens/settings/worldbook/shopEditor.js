// ============================================================
// 世界书 · 商店编辑器（B 类，RN 组件）
// grounding：桌面 worldbook/shop_editor.js —— html() :18-43（空态 :22
//   「还没有商店。」/「+ 新建商店」、商店横条 npc-tabs-bar、renderBody、
//   toolbar「保存商店」/「↺ 重新读取」）；renderBody() :45-96（商店名* /
//   描述 / 店主 NPC id（可选）/ 位置（地图节点 id，可选）/ 默认货币
//   （留空用主货币）/ 补货规则；「商品」卡：商品名 / 价格 / 库存(-1无限) /
//   分类 / 描述 / 删除 /「+ 添加商品」）。
// 数据层：engine/wb/shop.js（WB_Shop —— A 类纯逻辑，去 DOM，零 DOM API）。
// 适配点：桌面 reRender() 整块重绘，RN 仅结构性变更 bump 重渲染
//   （set / setItem 纯文本不重绘，防输入法失焦）；删除商店走
//   Platform.ui.confirmAsync（条目删除桌面无确认，RN 同）；WB.msg 内联提示
//   改 StoryStore.pushToast；data-icon 图标舍弃只留文字；纵向滚动交由外层。
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
var MOD = require('../../../../engine/wb/shop.js');

// renderBody :59-61 分类四选项（文案映射逐字）
var CATEGORY_OPTIONS = [
  { value: 'bar', label: '物品栏' },
  { value: 'common', label: '通用' },
  { value: 'story', label: '剧情' },
  { value: 'rare', label: '稀有' }
];

// renderBody :84-87 补货规则四选项（文案映射逐字）
var REFRESH_OPTIONS = [
  { value: 'none', label: '不补货' },
  { value: 'daily', label: '每日' },
  { value: 'weekly', label: '每周' },
  { value: 'story', label: '剧情触发' }
];

function txt(v) { return v == null ? '' : String(v); }

function ShopEditor(props) {
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
  var shops = MOD._data;
  var curIdx = MOD._curIdx;
  var cur = shops[curIdx] || null;

  // ---- 结构性操作（桌面每步 reRender → RN bump）----
  function onSelect(i) { MOD.select(i); refresh(); }
  function onAdd() { MOD.add(); refresh(); }
  function onDel(i) {
    var s = shops[i];
    if (!s) return;
    Platform.ui.confirmAsync('删除商店「' + (s.name || '未命名') + '」？').then(function (ok) {
      if (!ok) return;
      MOD.del(i);
      refresh();
    });
  }
  function onAddItem(idx) { MOD.addItem(idx); refresh(); }
  function onDelItem(idx, ii) { MOD.delItem(idx, ii); refresh(); }

  function onSave() {
    var r = MOD.save();
    if (r && r.ok) toast('商店已保存', 'success');
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

  // ---- 纯文本编辑（桌面 set / setItem 不重绘）----
  function setField(idx, key, v) { MOD.set(idx, key, v); }
  function setItemField(idx, ii, key, v) { MOD.setItem(idx, ii, key, v); }

  // ---- 商品条目（renderBody :46-68 逐字段）----
  function renderItem(idx, it, ii) {
    return React.createElement(
      View,
      {
        key: 'item' + ii,
        style: {
          borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
          padding: 10, marginBottom: 10, backgroundColor: c.bg
        }
      },
      // 商品名 + 删除
      React.createElement(
        View,
        { style: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 } },
        React.createElement(View, { style: { flex: 1 } },
          React.createElement(Controls.SetTextInput, {
            value: txt(it.name), placeholder: '商品名',
            onChangeText: function (v) { setItemField(idx, ii, 'name', v); }
          })),
        React.createElement(
          TouchableOpacity,
          { onPress: function () { onDelItem(idx, ii); }, style: { paddingHorizontal: 8, paddingVertical: 8 } },
          React.createElement(Text, { style: { fontSize: f.sm, color: c.danger } }, '×')
        )
      ),
      // 价格 / 库存(-1无限) / 分类
      React.createElement(
        View,
        { style: { flexDirection: 'row', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' } },
        React.createElement(View, { style: { flex: 1, minWidth: 80 } },
          React.createElement(Controls.SetTextInput, {
            value: it.price != null ? String(it.price) : '', placeholder: '价格',
            onChangeText: function (v) { setItemField(idx, ii, 'price', v); }
          })),
        React.createElement(View, { style: { flex: 1, minWidth: 100 } },
          React.createElement(Controls.SetTextInput, {
            value: it.stock != null ? String(it.stock) : '-1', placeholder: '库存(-1无限)',
            onChangeText: function (v) { setItemField(idx, ii, 'stock', v); }
          })),
        React.createElement(View, { style: { flex: 1, minWidth: 110 } },
          React.createElement(Controls.SetSelect, {
            value: it.category || 'common', options: CATEGORY_OPTIONS,
            onChange: function (v) { setItemField(idx, ii, 'category', v); refresh(); }
          }))
      ),
      // 描述
      React.createElement(View, { style: { marginTop: 2 } },
        React.createElement(Controls.SetTextInput, {
          value: txt(it.desc), placeholder: '描述',
          onChangeText: function (v) { setItemField(idx, ii, 'desc', v); }
        }))
    );
  }

  // ---- 当前商店主体（renderBody :71-95）----
  function renderBody(s, idx) {
    var items = s.items || [];
    return React.createElement(
      View,
      null,
      React.createElement(
        Controls.SetCard,
        null,
        React.createElement(Controls.SetRow, { label: '商店名 *' },
          React.createElement(View, { style: { width: 160 } },
            React.createElement(Controls.SetTextInput, {
              value: txt(s.name), onChangeText: function (v) { setField(idx, 'name', v); }
            }))),
        React.createElement(Controls.SetRow, { label: '描述' },
          React.createElement(View, { style: { width: 200 } },
            React.createElement(Controls.SetTextInput, {
              value: txt(s.desc), multiline: true, rows: 2,
              onChangeText: function (v) { setField(idx, 'desc', v); }
            }))),
        React.createElement(Controls.SetRow, { label: '店主 NPC id（可选）' },
          React.createElement(View, { style: { width: 160 } },
            React.createElement(Controls.SetTextInput, {
              value: txt(s.npcId), onChangeText: function (v) { setField(idx, 'npcId', v); }
            }))),
        React.createElement(Controls.SetRow, { label: '位置（地图节点 id，可选）' },
          React.createElement(View, { style: { width: 160 } },
            React.createElement(Controls.SetTextInput, {
              value: txt(s.locationId), onChangeText: function (v) { setField(idx, 'locationId', v); }
            }))),
        React.createElement(Controls.SetRow, { label: '默认货币（留空用主货币）' },
          React.createElement(View, { style: { width: 160 } },
            React.createElement(Controls.SetTextInput, {
              value: txt(s.currencyId), onChangeText: function (v) { setField(idx, 'currencyId', v); }
            }))),
        React.createElement(Controls.SetSelect, {
          label: '补货规则', value: s.refresh || 'none', options: REFRESH_OPTIONS,
          onChange: function (v) { setField(idx, 'refresh', v); refresh(); }
        })
      ),
      React.createElement(
        Controls.SetCard,
        { title: '商品' },
        items.length === 0
          ? React.createElement(Controls.SetNote, { first: false }, '（暂无）')
          : items.map(function (it, ii) { return renderItem(idx, it, ii); }),
        React.createElement(Controls.SetButton, {
          label: '+ 添加商品', onPress: function () { onAddItem(idx); }
        })
      )
    );
  }

  return React.createElement(
    View,
    { style: { flex: 1 } },
    // 商店横条（html :25-30）
    shops.length === 0
      ? React.createElement(Controls.SetNote, { first: true }, '还没有商店。')
      : React.createElement(
          View,
          { style: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 } },
          shops.map(function (s, i) {
            var on = i === curIdx;
            return React.createElement(
              View,
              { key: 'shop' + i, style: { flexDirection: 'row', alignItems: 'center', marginRight: 6, marginBottom: 6 } },
              React.createElement(
                TouchableOpacity,
                {
                  onPress: function () { onSelect(i); },
                  style: {
                    borderWidth: 1, borderColor: on ? c.primary : c.hairStrong,
                    backgroundColor: on ? c.primary : c.bgCard,
                    borderRadius: tk.radius.sm, paddingHorizontal: 10, paddingVertical: 5
                  }
                },
                React.createElement(Text, { style: { fontSize: f.xs, color: on ? c.bgCard : c.ink } }, s.name || '(未命名)')
              ),
              React.createElement(
                TouchableOpacity,
                { onPress: function () { onDel(i); }, style: { paddingHorizontal: 6, paddingVertical: 5 } },
                React.createElement(Text, { style: { fontSize: f.xs, color: c.danger } }, '×')
              )
            );
          })
        ),
    // 「+ 新建商店」（html :35）
    React.createElement(
      View,
      { style: { marginBottom: 10 } },
      React.createElement(Controls.SetButton, { label: '+ 新建商店', onPress: onAdd })
    ),
    cur ? renderBody(cur, curIdx) : React.createElement(Controls.SetNote, { first: false }, '（空）'),
    // toolbar（html :37-40）
    React.createElement(
      View,
      { style: { flexDirection: 'row', gap: 10, marginTop: 16 } },
      React.createElement(Controls.SetButton, { label: '保存商店', onPress: onSave, kind: 'primary' }),
      React.createElement(Controls.SetButton, { label: '↺ 重新读取', onPress: onReload })
    )
  );
}

module.exports = { ShopEditor: ShopEditor };
