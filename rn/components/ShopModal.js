// ============================================================
// 战役 4 · 批次 4-6b：商店浮层（B 类，RN 组件）
// RN 独有。挂 OverlayHost（同 ConfirmModal/ToastBar 范式），视图模型
// 全部由 shop_store.js（A 类）急切算好经 props 传入，本组件纯渲染。
//
// 结构平移 Electron ui_shop.js _render（L47-85）：
//   遮罩 rgba(0,0,0,0.85) → 居中面板（maxWidth 640 / maxHeight 92%）
//   header：店名（accent）+ 货币行（muted）+ 关闭钮
//   body：商品卡列表（名/述/价·库存三态/购买钮三态文案）+ 出售区
// 字号映射（theme fontSizes：sm11.5/base13/md14/lg16）：
//   店名 15→lg · 货币行 12→sm · 商品名 14→md · 述/价/库存 12→sm
//   购买钮 13→base · 出售标签 12→sm · 出售行 13→base · 出售钮 12→sm
// 圆角：面板 lg · 商品卡 md · 钮 sm（同 ConfirmModal 先例）
// 关闭路径：仅 X 钮 + Android 返回键（Electron 无遮罩点击关闭，不平移
// 之外新增交互）。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var Modal = RN.Modal;
var ScrollView = RN.ScrollView;
var TouchableOpacity = RN.TouchableOpacity;
var TouchableWithoutFeedback = RN.TouchableWithoutFeedback;

var ShopStore = require('../shop_store.js');

// 库存三态色（ui_shop L97）：售罄 muted2 / 无限 success / 有数 text
var STOCK_COLOR = {
  soldout: 'textMuted2',
  infinite: 'success',
  count: 'text'
};

function ShopItemRow(props) {
  var it = props.item;
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var styles = RN.StyleSheet.create({
    card: {
      backgroundColor: c.bgPanel, borderRadius: tk.radius.md,
      paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10
    },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    main: { flex: 1, minWidth: 0 },
    name: { color: c.text, fontSize: f.md, fontWeight: '500' },
    desc: { color: c.textMuted, fontSize: f.sm, marginTop: 4 },
    meta: { marginTop: 6, fontSize: f.sm },
    price: { color: c.warning },
    stock: { color: c[STOCK_COLOR[it.stockKind]] || c.text },
    btn: {
      borderRadius: tk.radius.sm, paddingHorizontal: 16, paddingVertical: 8,
      backgroundColor: it.canBuy ? c.primary : c.borderStrong,
      flexShrink: 0
    },
    btnText: {
      fontSize: f.base,
      color: it.canBuy ? c.bgWhite : c.textMuted2
    }
  });

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.main}>
          <Text style={styles.name}>{it.name}</Text>
          {it.desc ? <Text style={styles.desc}>{it.desc}</Text> : null}
          <Text style={styles.meta}>
            {it.price != null ? <Text style={styles.price}>{it.price} {props.currencyId}</Text> : null}
            <Text style={styles.stock}>{it.price != null ? ' · ' : ''}库存 {it.stockText}</Text>
          </Text>
        </View>
        <TouchableOpacity
          style={styles.btn}
          disabled={!it.canBuy}
          activeOpacity={it.canBuy ? 0.85 : 1}
          onPress={function () { ShopStore.buy(it.id); }}
        >
          <Text style={styles.btnText}>{it.btnText}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SellSection(props) {
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var styles = RN.StyleSheet.create({
    wrap: {
      marginTop: 18, paddingTop: 14,
      borderTopWidth: 1, borderTopColor: c.border
    },
    label: {
      fontSize: f.sm, color: c.textMuted2, letterSpacing: 1, marginBottom: 10
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
    name: { flex: 1, color: c.text2, fontSize: f.base },
    btn: {
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: tk.radius.sm,
      backgroundColor: c.border, borderWidth: 1, borderColor: c.borderStrong
    },
    btnText: { color: c.accent, fontSize: f.sm }
  });

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>你可以出售</Text>
      {props.items.map(function (name) {
        return (
          <View key={name} style={styles.row}>
            <Text style={styles.name}>{name}</Text>
            <TouchableOpacity
              style={styles.btn}
              activeOpacity={0.85}
              onPress={function () { ShopStore.sell(name); }}
            >
              <Text style={styles.btnText}>出售</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

function ShopModal(props) {
  var view = props.view;
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var styles = RN.StyleSheet.create({
    mask: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
      justifyContent: 'center', padding: 12
    },
    inner: {
      backgroundColor: c.bgPanel, borderRadius: tk.radius.lg,
      width: '100%', maxWidth: 640, maxHeight: '92%',
      alignSelf: 'center', overflow: 'hidden'
    },
    header: {
      paddingHorizontal: 18, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.border,
      flexDirection: 'row', alignItems: 'center', gap: 10
    },
    headerMain: { flex: 1 },
    shopName: { fontSize: f.lg, color: c.accent },
    currency: { fontSize: f.sm, color: c.textMuted, marginTop: 4 },
    closeBtn: {
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: tk.radius.sm, backgroundColor: c.borderStrong
    },
    closeBtnText: { color: c.text, fontSize: f.base },
    body: { paddingHorizontal: 18, paddingVertical: 14 },
    empty: { color: c.textMuted, fontSize: f.base }
  });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={function () { ShopStore.close(); }}>
      <TouchableWithoutFeedback onPress={function () { /* 遮罩点击不关框（平移 Electron） */ }}>
        <View style={styles.mask}>
          <TouchableWithoutFeedback onPress={function () { /* 吞内容点击 */ }}>
            <View style={styles.inner}>
              <View style={styles.header}>
                <View style={styles.headerMain}>
                  <Text style={styles.shopName}>{view.name}</Text>
                  {view.currency.id ? (
                    <Text style={styles.currency}>你持有：{view.currency.have} {view.currency.id}</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={styles.closeBtn}
                  activeOpacity={0.85}
                  onPress={function () { ShopStore.close(); }}
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.body}>
                {view.items.length === 0 ? (
                  <Text style={styles.empty}>（这家店还没有商品）</Text>
                ) : view.items.map(function (it) {
                  return <ShopItemRow key={it.id} item={it} tokens={tk} currencyId={view.currency.id} />;
                })}
                {view.sellItems.length > 0 ? (
                  <SellSection items={view.sellItems} tokens={tk} />
                ) : null}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

module.exports = { ShopModal: ShopModal };
