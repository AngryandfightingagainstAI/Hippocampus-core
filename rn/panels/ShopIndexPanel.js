// ============================================================
// 批次 H4 · 商店索引面板（B 类，RN 组件）
// 桌面锚点：engine/ui_panels.js:227 renderShopIndexPanel
// 数据源：Shop.listShops() = GameState.currentCard.worldbook.shops
// 空态逐字照桌面：「这个卡带没有商店。」
// 行点击 = 真跳转：closePanel() → setTimeout(function(){ Platform.ui.openShop(id); }, 100)
// 口径同桌面 openShopFromIndex（ui_panels.js:248-251 先关后开）。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var TouchableOpacity = RN.TouchableOpacity;

var PanelData = require('./panel_data.js');
var StoryStore = require('../story_store.js');

function ShopIndexPanel(props) {
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;
  var view = PanelData.computeShopIndex();

  var styles = RN.StyleSheet.create({
    empty: { color: c.muted, fontSize: f.base, textAlign: 'center', paddingVertical: 20 },
    card: {
      backgroundColor: c.bgPanel || c.bg,
      borderRadius: tk.radius.md || 6,
      paddingHorizontal: 14, paddingVertical: 12,
      marginBottom: 8
    },
    title: { fontSize: f.md, color: c.text, fontWeight: '500' },
    sub: { fontSize: f.sm, color: c.textMuted || c.muted, marginTop: 4 },
    meta: { fontSize: f.xs, color: c.textMuted2 || c.faint, marginTop: 4 },
    hint: { fontSize: f.xs, color: c.faint, marginTop: 12 }
  });

  function openShop(shopId) {
    StoryStore.closePanel();
    setTimeout(function () {
      try {
        if (typeof Platform !== 'undefined' && Platform.ui && Platform.ui.openShop) {
          Platform.ui.openShop(shopId);
        }
      } catch (e) { /* openShop 壳异常不向上抛 */ }
    }, 100);
  }

  if (!view.shops.length) {
    return <Text style={styles.empty}>{view.emptyText}</Text>;
  }

  return (
    <View>
      {view.shops.map(function (s) {
        var loc = s.locationId ? (' @ ' + s.locationId) : '';
        var npc = s.npcId ? (' · 由 ' + s.npcId + ' 经营') : '';
        return (
          <TouchableOpacity
            key={s.id}
            style={styles.card}
            activeOpacity={0.7}
            onPress={function () { openShop(s.id); }}
          >
            <Text style={styles.title}>{s.name}</Text>
            {s.desc ? <Text style={styles.sub}>{s.desc}</Text> : null}
            <Text style={styles.meta}>{s.itemCount + ' 件商品' + loc + npc}</Text>
          </TouchableOpacity>
        );
      })}
      <Text style={styles.hint}>{'点击商店名可以打开购买界面。也可以让 AI 通过 open_shop 工具打开。'}</Text>
    </View>
  );
}

module.exports = ShopIndexPanel;
