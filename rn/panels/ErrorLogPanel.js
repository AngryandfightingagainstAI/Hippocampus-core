// ============================================================
// P1-E · 报错面板（B 类，RN 组件）
// 桌面锚点：engine/error_log_dom.js（Electron 专属 DOM 壳，判不搬）；
// 数据源沿用 core：engine/error_log_core.js 的 _load() / _state.errors，
// 键名直读 error_log_core.js:89-97 的 item 形状。
//
// 空态逐字照桌面 error_log_dom.js:258「没有捕获到错误」。
// 条目倒序（桌面 :237 slice().reverse()，新错误在前）。
// 清空确认文案逐字照桌面 :206「清空所有诊断日志？」。
// 复制成功 toast 逐字照桌面 :279「已复制」。
// P10·A3：补「复制整份报告」按钮（桌面 :275-284 copyReport → core.getReport()，
//   设备通道复用 rn/export_util.js 的 shareOrCopy）+「存储占用」一行（桌面 :230）。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var TouchableOpacity = RN.TouchableOpacity;
var Clipboard = RN.Clipboard;

var PanelData = require('./panel_data.js');
var ExportUtil = require('../export_util.js');

// 单条复制文本（桌面复制的是整份报告 :276 core.getReport()；RN 侧按任务书
// 只做「复制单条」，内容含编号/时间/类型/消息/现场/堆栈）
function entryText(e) {
  var lines = [];
  lines.push('[' + e.index + '] ' + (e.timeFull || e.time || '') + ' · ' + (e.type || 'Error'));
  lines.push('消息: ' + (e.message || ''));
  lines.push('现场: 屏幕=' + (e.screen || '?') + ' 卡带=' + (e.cardId || '?') + ' 轮次=' + (e.round == null ? '?' : e.round));
  if (e.stack) {
    lines.push('堆栈:');
    var st = String(e.stack).split('\n').slice(0, 8);
    for (var i = 0; i < st.length; i++) lines.push('  ' + String(st[i]).trim());
  }
  return lines.join('\n');
}

function ErrorLogPanel(props) {
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  // 清空后靠 bump 触发重渲染（computeErrorLog 每次渲染现算）
  var bumpState = React.useState(0);
  var bump = bumpState[0], setBump = bumpState[1];

  var view = PanelData.computeErrorLog();

  var styles = RN.StyleSheet.create({
    summary: {
      fontSize: f.sm, color: c.muted,
      marginBottom: 10
    },
    toolbar: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    btn: {
      paddingHorizontal: 14, paddingVertical: 8,
      borderRadius: tk.radius.sm || 4, backgroundColor: c.hair
    },
    btnDanger: {
      paddingHorizontal: 14, paddingVertical: 8,
      borderRadius: tk.radius.sm || 4, backgroundColor: c.danger || c.error || c.hair
    },
    btnText: { fontSize: f.sm, color: c.text },
    btnTextOn: { fontSize: f.sm, color: c.bgWhite || '#fff' },
    card: {
      backgroundColor: c.bgPanel || c.bg,
      borderLeftWidth: 3, borderLeftColor: c.danger || c.hair,
      borderRadius: tk.radius.md || 6,
      paddingHorizontal: 14, paddingVertical: 12,
      marginBottom: 10
    },
    cardHead: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', gap: 8, marginBottom: 6
    },
    headLeft: { flex: 1, minWidth: 0 },
    title: { fontSize: f.md, color: c.text, fontWeight: '500' },
    msg: {
      fontSize: f.base, color: c.text,
      lineHeight: Math.round(f.base * 1.5), marginBottom: 6
    },
    meta: { fontSize: f.sm, color: c.textMuted || c.muted },
    copyBtn: {
      paddingHorizontal: 10, paddingVertical: 5,
      borderRadius: tk.radius.sm || 4, backgroundColor: c.hair
    },
    copyText: { fontSize: f.sm, color: c.text2 || c.text },
    empty: {
      color: c.success || c.muted, fontSize: f.base,
      textAlign: 'center', paddingVertical: 20
    }
  });

  function onClear() {
    Platform.ui.confirmAsync('清空所有诊断日志？').then(function (ok) {
      if (!ok) return;
      PanelData.clearErrorLog();
      setBump(bump + 1);
    });
  }

  function onCopy(e) {
    try {
      Clipboard.setString(entryText(e));
      Platform.ui.toast('已复制', { type: 'success' });
    } catch (err) {
      try { Platform.ui.toast('复制失败', { type: 'error' }); } catch (e2) { /* */ }
    }
  }

  // P10·A3：整份报告（桌面 copyReport :275-284）。设备通道走 export_util.shareOrCopy
  // （Share 优先、失败降级 Clipboard）；用户取消分享不提示，成功一律「已复制」。
  function onCopyReport() {
    var report = PanelData.errorLogReport();
    ExportUtil.shareOrCopy(report, '诊断报告').then(function (res) {
      if (res && res.dismissed) return;
      try { Platform.ui.toast('已复制', { type: 'success' }); } catch (e) { /* */ }
    }).catch(function () {
      try { Platform.ui.toast('复制失败', { type: 'error' }); } catch (e) { /* */ }
    });
  }

  var errors = view.errors || [];

  return (
    <View>
      <Text style={styles.summary}>{'错误 ' + view.count + ' 条'}</Text>
      <Text style={styles.summary}>{'存储占用：' + (view.storageText || '—')}</Text>
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.btnDanger} activeOpacity={0.7} onPress={onClear}>
          <Text style={styles.btnTextOn}>{'清空'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} activeOpacity={0.7} onPress={onCopyReport}>
          <Text style={styles.btnText}>{'复制整份报告'}</Text>
        </TouchableOpacity>
      </View>
      {errors.length ? errors.map(function (e) {
        return (
          <View key={e.index + ':' + (e.timeFull || e.time)} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.headLeft}>
                <Text style={styles.title}>{'[' + e.index + '] ' + (e.time || '') + ' · ' + (e.type || 'Error')}</Text>
              </View>
              <TouchableOpacity style={styles.copyBtn} activeOpacity={0.7} onPress={function () { onCopy(e); }}>
                <Text style={styles.copyText}>{'复制'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.msg}>{e.message || ''}</Text>
            <Text style={styles.meta}>
              {'屏幕：' + (e.screen || '?') + ' · 卡带：' + (e.cardId || '?') + ' · 轮次：' + (e.round == null ? '?' : e.round)}
            </Text>
          </View>
        );
      }) : <Text style={styles.empty}>{view.emptyText}</Text>}
    </View>
  );
}

module.exports = ErrorLogPanel;