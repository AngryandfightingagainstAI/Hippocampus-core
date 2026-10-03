// ============================================================
// P1-I · I-4：生成卡带指令浮层（B 类，RN 组件）
// RN 独有。grounding：桌面 engine/ui_cards.js
//   openInstructionModal(:421-441)：标题「生成卡带指令」+ 说明行
//     「第 1 段必给（骨架），第 2-6 段按需追加。按顺序复制给 AI。」
//     + 7 个切换按钮（1 · 基础骨架 / 2 · 事件系统 / 3 · NPC 规范 /
//       4 · 内容要求 / 5 · 可选系统 / 6 · 世界书数据 / 全部）
//     + 只读文本区（默认第 1 段）+「复制当前段」+「关闭」
//   switchInstructionPart(:443-458)：切段 + 选中段高亮（桌面切 .primary class）
//   copyInstruction(:1139-1143)：复制文本区内容 → toast「已复制」success /
//     「复制失败」error
// 6 段文本来自 rn/instruction_templates.js（A 类，逐字节同桌面）。
// RN 侧落法：
//   - 遮罩 = tokens c.maskStrong（桌面 --c-mask-strong 同值 rgba(0,0,0,0.85)），
//     面板 maxWidth 640 / maxHeight 92%（同 ConfirmModal/ShopModal 先例）
//   - 只读文本区 = 可滚动 ScrollView 包 Text selectable（桌面 textarea rows=18
//     的内部滚动 → 面板 body 整体滚动，长文本可滚）
//   - 复制走 RN 核心 Clipboard（仓内先例 rn/screens/settings/DataTab.js:24/92）
//   - 桌面按钮内的 clipboard-text 图标 RN 无图标系统，只留文案「复制当前段」
//   - 遮罩点击不关框（平移 Electron：只「关闭」钮 + Android 返回键关闭）
//   - visible 由父级 useState 控制；每次打开回到第 1 段（桌面每次重建 modal-body）
// 纪律：颜色/字号只取自 useTheme() tokens，无字面量色值/字号；不引新依赖；
//   不碰浏览器 DOM/BOM 全局（纯 RN API）。
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
var Clipboard = RN.Clipboard;

var useTheme = require('../use_theme.js').useTheme;
var Tpl = require('../instruction_templates.js');

// 7 个切换按钮：文案逐字照桌面 ui_cards.js:426-432，顺序一致
var PARTS = [
  { id: '1', label: '1 · 基础骨架' },
  { id: '2', label: '2 · 事件系统' },
  { id: '3', label: '3 · NPC 规范' },
  { id: '4', label: '4 · 内容要求' },
  { id: '5', label: '5 · 可选系统' },
  { id: '6', label: '6 · 世界书数据' },
  { id: 'all', label: '全部' }
];

// 段 id → 文本取值（照桌面 switchInstructionPart:443-458 的分派）
var TEXT_OF = {
  '1': Tpl.part1,
  '2': Tpl.part2,
  '3': Tpl.part3,
  '4': Tpl.part4,
  '5': Tpl.part5,
  '6': Tpl.part6,
  'all': Tpl.getInstructionTemplate
};

function InstructionModal(props) {
  var visible = props.visible;
  var onClose = props.onClose;

  var themeApi = useTheme();
  var tk = themeApi.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;
  var fonts = tk.fonts;

  var activeState = React.useState('1');
  var active = activeState[0];
  var setActive = activeState[1];

  // 每次打开回到第 1 段（桌面 openInstructionModal 每次重建 modal-body 的等价）
  React.useEffect(function () {
    if (visible) setActive('1');
  }, [visible]);

  var text = (TEXT_OF[active] || Tpl.part1)();

  function copyCurrent() {
    try {
      Clipboard.setString(text);
      Platform.ui.toast('已复制', { type: 'success' });
    } catch (e) {
      Platform.ui.toast('复制失败', { type: 'error' });
    }
  }

  var styles = React.useMemo(function () {
    return RN.StyleSheet.create({
      mask: {
        flex: 1, backgroundColor: c.maskStrong,
        justifyContent: 'center', padding: 12
      },
      inner: {
        backgroundColor: c.bgPanel, borderRadius: tk.radius.lg,
        width: '100%', maxWidth: 640, maxHeight: '92%',
        alignSelf: 'center', overflow: 'hidden'
      },
      header: {
        paddingHorizontal: 18, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: c.border
      },
      title: {
        fontFamily: fonts.serif, fontSize: f.lg, color: c.text, letterSpacing: 2
      },
      note: {
        fontSize: f.sm, color: c.textMuted,
        lineHeight: Math.round(f.sm * 1.7), marginTop: 6
      },
      body: { paddingHorizontal: 18, paddingVertical: 14 },
      partRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
      partBtn: {
        borderWidth: 1, borderColor: c.border, borderRadius: tk.radius.sm,
        paddingHorizontal: 10, paddingVertical: 6, backgroundColor: c.bgCard
      },
      partBtnOn: { borderColor: c.primary, backgroundColor: c.primary },
      partText: { fontSize: f.sm, color: c.textMuted, letterSpacing: 1 },
      partTextOn: { fontSize: f.sm, color: c.bgWhite, letterSpacing: 1 },
      textBox: {
        borderWidth: 1, borderColor: c.border, borderRadius: tk.radius.sm,
        backgroundColor: c.bg
      },
      code: {
        fontFamily: fonts.mono, fontSize: f.sm, color: c.text,
        lineHeight: Math.round(f.sm * 1.6), padding: 12
      },
      btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
      copyBtn: {
        borderWidth: 1, borderColor: c.primary, borderRadius: tk.radius.sm,
        paddingHorizontal: 14, paddingVertical: 8, backgroundColor: c.primary
      },
      copyBtnText: {
        fontFamily: fonts.sans, fontSize: f.sm, color: c.bgWhite, letterSpacing: 1
      },
      closeBtn: {
        borderWidth: 1, borderColor: c.borderStrong, borderRadius: tk.radius.sm,
        paddingHorizontal: 14, paddingVertical: 8
      },
      closeBtnText: {
        fontFamily: fonts.sans, fontSize: f.sm, color: c.textMuted, letterSpacing: 1
      }
    });
  }, [tk]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={function () { /* 遮罩点击不关框（平移 Electron） */ }}>
        <View style={styles.mask}>
          <TouchableWithoutFeedback onPress={function () { /* 吞内容点击 */ }}>
            <View style={styles.inner}>
              <View style={styles.header}>
                <Text style={styles.title}>{'生成卡带指令'}</Text>
                <Text style={styles.note}>{'第 1 段必给（骨架），第 2-6 段按需追加。按顺序复制给 AI。'}</Text>
              </View>
              <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.body}>
                <View style={styles.partRow}>
                  {PARTS.map(function (p) {
                    var on = active === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={on ? [styles.partBtn, styles.partBtnOn] : styles.partBtn}
                        activeOpacity={0.85}
                        onPress={function () { setActive(p.id); }}
                      >
                        <Text style={on ? styles.partTextOn : styles.partText}>{p.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.textBox}>
                  <Text style={styles.code} selectable>{text}</Text>
                </View>
                <View style={styles.btnRow}>
                  <TouchableOpacity style={styles.copyBtn} activeOpacity={0.85} onPress={copyCurrent}>
                    <Text style={styles.copyBtnText}>{'复制当前段'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.closeBtn} activeOpacity={0.85} onPress={onClose}>
                    <Text style={styles.closeBtnText}>{'关闭'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

module.exports = { InstructionModal: InstructionModal };