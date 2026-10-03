// ============================================================
// 批次 H4 · 角色面板（B 类，RN 组件）
// 桌面锚点：engine/ui_panels.js:432 renderCharacterPanel
// 数据源：GameState.playerData + card.attributes + Alias.get + GameState.computeAge()
// 「重审人设」按钮已搬（H6 G9：UI_Portrait RN 实装，Platform.ui.showScreen('portrait')）。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var TouchableOpacity = RN.TouchableOpacity;

var PanelData = require('./panel_data.js');

function CharacterPanel(props) {
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;
  var view = PanelData.computeCharacter();

  var styles = RN.StyleSheet.create({
    section: { marginBottom: 14 },
    secTitle: {
      fontSize: f.sm, color: c.muted, letterSpacing: 1,
      marginBottom: 6, borderBottomWidth: 1, borderBottomColor: c.hair, paddingBottom: 4
    },
    row: { flexDirection: 'row', marginBottom: 4 },
    k: { width: 80, fontSize: f.sm, color: c.faint },
    v: { flex: 1, fontSize: f.sm, color: c.text },
    body: { fontSize: f.sm, color: c.text2 || c.text, lineHeight: Math.round(f.sm * 1.6) },
    trait: { fontSize: f.sm, color: c.text2 || c.text, marginBottom: 2 },
    attrRow: { marginBottom: 8 },
    attrHead: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 3 },
    attrName: { flex: 1, fontSize: f.sm, color: c.ink2 || c.text },
    attrVal: { fontSize: f.xs, color: c.muted },
    track: { height: 4, backgroundColor: c.hair, borderRadius: 2, overflow: 'hidden' },
    fill: { height: 4, backgroundColor: c.accent },
    invCat: { marginBottom: 8 },
    invCatName: { fontSize: f.sm, color: c.faint, marginBottom: 3 },
    invItem: { fontSize: f.sm, color: c.text2 || c.text, marginBottom: 2 },
    invDesc: { fontSize: f.xs, color: c.faint },
    reviewBtn: {
      borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
      paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start',
      marginBottom: 14
    },
    reviewBtnText: { fontSize: f.sm, color: c.accent, letterSpacing: 2 }
  });

  function kv(k, v) {
    if (!v && v !== 0) return null;
    return (
      <View key={k} style={styles.row}>
        <Text style={styles.k}>{k}</Text>
        <Text style={styles.v}>{String(v)}</Text>
      </View>
    );
  }

  return (
    <View>
      {view.portraitSummary ? (
        <View style={styles.section}>
          <Text style={styles.secTitle}>{'人设总述'}</Text>
          <Text style={styles.body}>{view.portraitSummary}</Text>
          {view.traits.map(function (t, i) {
            return <Text key={i} style={styles.trait}>{'· ' + t}</Text>;
          })}
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.reviewBtn}
        activeOpacity={0.6}
        onPress={function () {
          try { Platform.ui.showScreen('portrait'); } catch (e) { /* showScreen 壳异常不得卡面板 */ }
        }}
      >
        <Text style={styles.reviewBtnText}>{'重审人设'}</Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <Text style={styles.secTitle}>{'基础'}</Text>
        {kv('姓名', view.name)}
        {kv('性别', view.gender)}
        {kv('当前年龄', view.age !== '—' ? view.age + ' 岁' : '—')}
        {kv('生日', view.birthday)}
        {kv('身高', view.height)}
        {kv('外貌', view.appearance)}
        {kv('背景', view.background)}
      </View>

      {view.attrs.length ? (
        <View style={styles.section}>
          <Text style={styles.secTitle}>{'属性'}</Text>
          {view.attrs.map(function (a) {
            return (
              <View key={a.key} style={styles.attrRow}>
                <View style={styles.attrHead}>
                  <Text style={styles.attrName}>{a.name}</Text>
                  <Text style={styles.attrVal}>{a.value + (a.max != null ? '/' + a.max : '')}</Text>
                </View>
                {a.max != null ? (
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: a.pct + '%' }]} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {view.talents.length ? (
        <View style={styles.section}>
          <Text style={styles.secTitle}>{'天赋 / 技能'}</Text>
          {view.talents.map(function (t, i) {
            return <Text key={i} style={styles.trait}>{'· ' + t}</Text>;
          })}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.secTitle}>{'资产'}</Text>
        {kv('金币', view.money)}
      </View>

      <View style={styles.section}>
        <Text style={styles.secTitle}>{'所持物品'}</Text>
        {view.inventory.map(function (cat) {
          return (
            <View key={cat.key} style={styles.invCat}>
              <Text style={styles.invCatName}>{cat.label + (cat.items.length ? '' : '（空）')}</Text>
              {cat.items.map(function (it, i) {
                return (
                  <View key={i} style={{ marginBottom: 2 }}>
                    <Text style={styles.invItem}>{'· ' + it.name}</Text>
                    {it.desc ? <Text style={styles.invDesc}>{it.desc}</Text> : null}
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    </View>
  );
}

module.exports = CharacterPanel;
