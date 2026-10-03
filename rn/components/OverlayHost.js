// ============================================================
// 战役 4 · 批次 4-3：全局浮层 Host（B 类，RN 组件）
// RN 独有。挂在路由根层（App.tsx Root 内），任意屏都能承接 Platform.ui
// 收口壳弹出的浮层，调用方（story.js 等）不感知路由层级。
//
// 4-3a：confirmAsync 的确认框（Promise<bool> 语义同 ui_prompt.js：
//       确定 true / 取消 false / 点遮罩 false；okText/cancelText 可覆盖）。
// 4-3b：ToastBar 非阻塞提示条（ui_prompt.js L117-162）：
//       info/success/warn/error 四型；error 默认手动点击关闭，
//       其余 duration（默认 3000ms）自动消失。自动计时器由 ToastItem
//       组件持有（store 保持 A 类，不挂 setTimeout）。
//       busy/loading/error 三态的 Electron grounding 在 story-area 内
//       （setBusy 仅禁按钮、loading/error 是流内元素），故由 StoryScreen
//       渲染，不进本 Host。
// P1-I · I-2：promptAsync 输入框（等价 ui_prompt.js:10-71 的 .prompt-modal），
//       由 story_store.promptOpen/resolvePrompt 驱动，Promise<string|null>。
//
// 纪律：颜色/字号只取自 useTheme tokens；遮罩与内容点击用
// TouchableWithoutFeedback 双层嵌套（View 无 onPress）。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var Modal = RN.Modal;
var TextInput = RN.TextInput;
var TouchableOpacity = RN.TouchableOpacity;
var TouchableWithoutFeedback = RN.TouchableWithoutFeedback;

var useTheme = require('../use_theme.js').useTheme;
var StoryStore = require('../story_store.js');
var ShopStore = require('../shop_store.js');
var ShopModal = require('./ShopModal.js').ShopModal;

// toast 型 → token 色键（同 index.html L763-781）
var TOAST_BG = {
  info: 'maskStrong',
  success: 'success',
  warn: 'warning',
  error: 'danger'
};

function ToastItem(props) {
  var toast = props.toast;
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  React.useEffect(function () {
    // 手动条（error 默认）不计时；其余 duration 到点自动消失
    if (toast.manual || !(toast.duration > 0)) return undefined;
    var timer = setTimeout(function () {
      StoryStore.dismissToast(toast.id);
    }, toast.duration);
    return function () { clearTimeout(timer); };
  }, [toast.id, toast.manual, toast.duration]);

  var bg = c[TOAST_BG[toast.type] || 'maskStrong'] || c.maskStrong;
  var itemStyle = {
    backgroundColor: bg,
    borderRadius: tk.radius.md,
    paddingHorizontal: 20,
    paddingVertical: 9,
    marginHorizontal: 24
  };
  var textStyle = {
    color: c.bgPanel,
    fontSize: f.sm,
    lineHeight: Math.round(f.sm * 1.5)
  };

  var content = (
    <View style={itemStyle}>
      <Text style={textStyle}>{toast.msg}{toast.manual ? ' ×' : ''}</Text>
    </View>
  );

  if (toast.manual) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={function () { StoryStore.dismissToast(toast.id); }}
      >
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

function ToastBar(props) {
  var toasts = props.toasts;
  var tk = props.tokens;

  var containerStyle = {
    position: 'absolute',
    top: 64, // index.html：top 70px（状态栏/安全区由外层 Screen 已让出，此处对齐视觉）
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8
  };

  return (
    <View style={containerStyle} pointerEvents="box-none">
      {toasts.map(function (t) {
        return <ToastItem key={t.id} toast={t} tokens={tk} />;
      })}
    </View>
  );
}

function ConfirmModal(props) {
  var pending = props.pending;
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var styles = RN.StyleSheet.create({
    mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 28 },
    box: {
      backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.hairStrong,
      borderRadius: tk.radius.lg, padding: 20
    },
    message: { fontSize: f.base, lineHeight: Math.round(f.base * 1.7), color: c.ink },
    btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
    btn: {
      borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
      paddingHorizontal: 18, paddingVertical: 8
    },
    btnPrimary: { borderWidth: 1, borderColor: c.seal, backgroundColor: c.seal, borderRadius: tk.radius.sm, paddingHorizontal: 18, paddingVertical: 8 },
    btnCancelText: { fontSize: f.sm, color: c.muted, letterSpacing: 2 },
    btnOkText: { fontSize: f.sm, color: c.card, letterSpacing: 2, fontWeight: '600' }
  });

  var okText = (pending.options && pending.options.okText) || '确定';
  var cancelText = (pending.options && pending.options.cancelText) || '取消';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={function () { StoryStore.resolveConfirm(false); }}>
      <TouchableWithoutFeedback onPress={function () { StoryStore.resolveConfirm(false); }}>
        <View style={styles.mask}>
          <TouchableWithoutFeedback onPress={function () { /* 吞内容点击，不冒泡关框 */ }}>
            <View style={styles.box}>
              <Text style={styles.message}>{pending.message}</Text>
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={styles.btn}
                  onPress={function () { StoryStore.resolveConfirm(false); }}
                >
                  <Text style={styles.btnCancelText}>{cancelText}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={function () { StoryStore.resolveConfirm(true); }}
                >
                  <Text style={styles.btnOkText}>{okText}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// P1-I · I-2：promptAsync 输入框（等价 ui_prompt.js:10-71 的 .prompt-modal）。
// 确定 → resolvePrompt(输入值)；取消 / 点遮罩 / Android 返回键 → resolvePrompt(null)。
// options：okText / cancelText / placeholder / password。
function PromptModal(props) {
  var pending = props.pending;
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var valueState = React.useState(pending.defaultValue || '');
  var value = valueState[0];
  var setValue = valueState[1];

  var styles = RN.StyleSheet.create({
    mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 28 },
    box: {
      backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.hairStrong,
      borderRadius: tk.radius.lg, padding: 20
    },
    message: { fontSize: f.base, lineHeight: Math.round(f.base * 1.7), color: c.ink, marginBottom: 12 },
    input: {
      borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
      paddingHorizontal: 10, paddingVertical: 8,
      fontSize: f.base, color: c.ink, marginBottom: 12
    },
    inputMulti: { minHeight: 92, textAlignVertical: 'top' },
    btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
    btn: {
      borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm,
      paddingHorizontal: 18, paddingVertical: 8
    },
    btnPrimary: { borderWidth: 1, borderColor: c.seal, backgroundColor: c.seal, borderRadius: tk.radius.sm, paddingHorizontal: 18, paddingVertical: 8 },
    btnCancelText: { fontSize: f.sm, color: c.muted, letterSpacing: 2 },
    btnOkText: { fontSize: f.sm, color: c.card, letterSpacing: 2, fontWeight: '600' }
  });

  var opts = pending.options || {};
  var okText = opts.okText || '确定';
  var cancelText = opts.cancelText || '取消';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={function () { StoryStore.resolvePrompt(null); }}>
      <TouchableWithoutFeedback onPress={function () { StoryStore.resolvePrompt(null); }}>
        <View style={styles.mask}>
          <TouchableWithoutFeedback onPress={function () { /* 吞内容点击，不冒泡关框 */ }}>
            <View style={styles.box}>
              <Text style={styles.message}>{pending.message}</Text>
              <TextInput
                style={opts.multiline ? [styles.input, styles.inputMulti] : styles.input}
                value={value}
                onChangeText={setValue}
                placeholder={opts.placeholder || ''}
                placeholderTextColor={c.faint}
                secureTextEntry={!!opts.password}
                multiline={!!opts.multiline}
                numberOfLines={opts.multiline ? (opts.rows || 5) : 1}
                autoFocus
              />
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={styles.btn}
                  onPress={function () { StoryStore.resolvePrompt(null); }}
                >
                  <Text style={styles.btnCancelText}>{cancelText}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={function () { StoryStore.resolvePrompt(value); }}
                >
                  <Text style={styles.btnOkText}>{okText}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function OverlayHost() {
  var themeApi = useTheme();
  var tk = themeApi.tokens;

  var snap = React.useSyncExternalStore(StoryStore.subscribe, StoryStore.getSnapshot, StoryStore.getSnapshot);
  var pending = snap.confirmPending;

  // 4-6b：商店浮层（shop_store 视图模型急切算好，此处只取引用）
  var shopSnap = React.useSyncExternalStore(ShopStore.subscribe, ShopStore.getSnapshot, ShopStore.getSnapshot);

  return (
    <>
      {pending ? <ConfirmModal pending={pending} tokens={tk} /> : null}
      {snap.promptPending ? <PromptModal pending={snap.promptPending} tokens={tk} /> : null}
      {snap.toasts.length ? <ToastBar toasts={snap.toasts} tokens={tk} /> : null}
      {shopSnap.open && shopSnap.view ? <ShopModal view={shopSnap.view} tokens={tk} /> : null}
    </>
  );
}

module.exports = { OverlayHost: OverlayHost };
