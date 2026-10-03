// ============================================================
// 批次 H6 · 变更提议面板（B 类，RN 组件）
// 桌面锚点：engine/ui_core.js:924-950
// 数据源：Proposals.list()
// 空态逐字照桌面：「提议模块未加载。」（其余：未在游戏中。/暂无待确认的变更提议。）
// 接受 → Proposals.confirm(id)（async）；拒绝 → Proposals.reject(id)。
// P6·S3-8：confirm 返回 needsConfirm ⇒ 二次确认（confirmAsync「仍然执行吗？」，
//   okText「仍然执行」）→ Proposals.confirm(id, {skipSemanticCheck:true}) 强执；
//   玩家取消则保持面板不变。文案与分支照桌面 ui_core.js:1021-1038 / 同款
//   已实装实现 rn/story_proposals.js:71-85。
// 引擎调用 try/catch 包裹，本地 bump 刷新。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var TouchableOpacity = RN.TouchableOpacity;

var PanelData = require('./panel_data.js');
var StoryStore = require('../story_store.js');

function ChangeProposalsPanel(props) {
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var bump = React.useState(0)[1];
  var view = PanelData.computeChangeProposals();

  var styles = RN.StyleSheet.create({
    empty: { color: c.muted, fontSize: f.base, textAlign: 'center', paddingVertical: 20 },
    hint: { fontSize: f.xs, color: c.faint, marginTop: 12, textAlign: 'center' },
    header: { fontSize: f.sm, color: c.textMuted || c.muted, marginBottom: 10 },
    card: {
      backgroundColor: c.bgPanel || c.bg,
      borderRadius: tk.radius.md || 6,
      paddingHorizontal: 14, paddingVertical: 12,
      marginBottom: 10
    },
    title: { fontSize: f.md, color: c.text, fontWeight: '500' },
    desc: { fontSize: f.sm, color: c.textMuted || c.muted, marginTop: 4 },
    reason: { fontSize: f.xs, color: c.textMuted2 || c.faint, marginTop: 4 },
    btnRow: { flexDirection: 'row', marginTop: 10 },
    btn: {
      flex: 1, paddingVertical: 8, borderRadius: tk.radius.sm || 4,
      alignItems: 'center', justifyContent: 'center', marginRight: 8
    },
    btnAccept: { backgroundColor: c.success },
    btnReject: { backgroundColor: c.danger, marginRight: 0 },
    btnText: { color: c.bg, fontSize: f.sm }
  });

  function onAccept(id) {
    try {
      var p = Proposals.confirm(id);
      Promise.resolve(p).then(function (res) {
        if (res && res.needsConfirm) {
          // B 层 AI 判定可能失效：二次确认，确定文案「仍然执行」（桌面 ui_core :1023-1037）
          var msg = res.reason || '这条变更可能已经不再合适了。';
          return Platform.ui.confirmAsync(msg + '\n\n仍然执行吗？', {
            okText: '仍然执行',
            cancelText: '取消'
          }).then(function (doAnyway) {
            if (!doAnyway) return; // 玩家取消：保持面板不变
            return Promise.resolve(Proposals.confirm(id, { skipSemanticCheck: true })).then(function (res2) {
              if (res2 && res2.ok) {
                StoryStore.pushToast('已强制接受提议' + (res2.label ? '：' + res2.label : ''), { type: 'success' });
              } else {
                StoryStore.pushToast('执行失败：' + (res2 && res2.reason), { type: 'error' });
              }
              bump(function (v) { return v + 1; });
            });
          });
        }
        if (!res || !res.ok) {
          StoryStore.pushToast((res && res.reason) || '确认失败', { type: 'warn' });
        }
        bump(function (v) { return v + 1; });
      }).catch(function (e) {
        StoryStore.pushToast('确认异常：' + (e && e.message || e), { type: 'error' });
        bump(function (v) { return v + 1; });
      });
    } catch (e) {
      StoryStore.pushToast('确认异常：' + (e && e.message || e), { type: 'error' });
      bump(function (v) { return v + 1; });
    }
  }

  function onReject(id) {
    try {
      Proposals.reject(id);
    } catch (e) {
      StoryStore.pushToast('拒绝异常：' + (e && e.message || e), { type: 'error' });
    }
    bump(function (v) { return v + 1; });
  }

  if (!view.proposals.length) {
    return (
      <View>
        <Text style={styles.empty}>{view.emptyText}</Text>
        {view.subText ? <Text style={styles.hint}>{view.subText}</Text> : null}
      </View>
    );
  }

  return (
    <View>
      {view.header ? <Text style={styles.header}>{view.header}</Text> : null}
      {view.proposals.map(function (p, i) {
        return (
          <View key={i} style={styles.card}>
            <Text style={styles.title}>{p.title}</Text>
            {p.desc ? <Text style={styles.desc}>{p.desc}</Text> : null}
            {p.reason ? <Text style={styles.reason}>{'理由：' + p.reason}</Text> : null}
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnAccept]}
                activeOpacity={0.7}
                onPress={function () { onAccept(p.id); }}
              >
                <Text style={styles.btnText}>{'接受'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnReject]}
                activeOpacity={0.7}
                onPress={function () { onReject(p.id); }}
              >
                <Text style={styles.btnText}>{'拒绝'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

module.exports = ChangeProposalsPanel;
