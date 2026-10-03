// ============================================================
// 批次 H6 · NPC 人物面板（B 类，RN 组件）
// 桌面锚点：engine/ui_npc.js:45-91 UI_Npc.render
// 数据源：GameState.currentCard.worldbook.npcs + NpcRuntime + NpcDeduction
// 空态逐字照桌面：「这个卡带还没有 NPC。去设置 → 世界书 → NPC 添加。」
// P1-I I-1（G7-b）已实现：卡片头「更新」按钮（npc_actions_rn.requestUpdate）
//   + NpcUpdateModal 浮层；推演链 pending 条目「确认/拒绝/重试」按钮（照
//   桌面 ui_npc.js:156-168），history 条目文案照 :173。裁决逻辑全在 A 类
//   rn/npc_actions_rn.js，本组件只做渲染 + 触发 + 本地 bump。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var TouchableOpacity = RN.TouchableOpacity;

var PanelData = require('./panel_data.js');
var NpcActions = require('../npc_actions_rn.js');
var NpcUpdateModal = require('./NpcUpdateModal.js').NpcUpdateModal;

// knownFacts 条目是 { text, acquiredAt, source, sourceNote } 对象；
// recentEvents 条目可能是 string 或对象。统一抽出可读文本。
function fmtItem(x) {
  if (x == null) return '';
  if (typeof x === 'string') return x;
  return x.text || x.desc || x.name || x.summary || '';
}

function NpcPanel(props) {
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;
  var view = PanelData.computeNpc();

  var revState = React.useState(0);
  var bump = revState[1];
  // modal: { npcId, errMsg } | null（null = 浮层关闭）
  var modalState = React.useState(null);
  var modal = modalState[0];
  var setModal = modalState[1];

  var pendingUpdate = NpcActions.getPendingUpdate();
  var updatingId = NpcActions.getUpdatingNpcId();
  var modalNpcId = modal ? modal.npcId : null;
  var modalErrMsg = modal ? modal.errMsg : null;
  var modalData = React.useMemo(function () {
    if (!modalNpcId) return null;
    if (!pendingUpdate || pendingUpdate.npcId !== modalNpcId) return null;
    return NpcActions.buildForm(modalNpcId);
  }, [modalNpcId, pendingUpdate]);
  var modalLoading = !!(modalNpcId && !modalErrMsg && !modalData && updatingId === modalNpcId);

  function refresh() { bump(function (v) { return v + 1; }); }

  // 卡片头「更新」按钮 → 先开 loading 浮层，请求落地后再按结果切数据态/错误态
  function handleUpdate(npcId) {
    if (NpcActions.getUpdatingNpcId()) {
      NpcActions.requestUpdate(npcId); // 触发 busy toast，不开浮层（同桌面前置拦截）
      return;
    }
    setModal({ npcId: npcId, errMsg: null });
    refresh();
    var p = NpcActions.requestUpdate(npcId);
    if (p && typeof p.then === 'function') {
      p.then(function (r) {
        if (r && !r.ok) {
          // 带 error = 解析失败/异常（桌面在浮层里展示）；无 error = 前置拦截已 toast
          setModal(r.error ? { npcId: npcId, errMsg: r.error } : null);
        }
        refresh();
      });
    }
  }

  function handleRegenerate() {
    var npcId = modalNpcId;
    if (!npcId) return;
    setModal({ npcId: npcId, errMsg: null });
    refresh();
    var p = NpcActions.regenerate();
    if (p && typeof p.then === 'function') {
      p.then(function (r) {
        if (r && !r.ok) {
          setModal(r.error ? { npcId: npcId, errMsg: r.error } : null);
        }
        refresh();
      });
    }
  }

  function handleCancel() {
    NpcActions.cancelUpdate();
    setModal(null);
    refresh();
  }

  function handleConfirm(values) {
    NpcActions.confirmUpdate(values);
    setModal(null);
    refresh();
  }

  var styles = RN.StyleSheet.create({
    empty: { color: c.muted, fontSize: f.base, textAlign: 'center', paddingVertical: 20 },
    sectionHead: { fontSize: f.sm, color: c.accent, marginTop: 12, marginBottom: 6, fontWeight: '500' },
    card: {
      backgroundColor: c.bgPanel || c.bg,
      borderRadius: tk.radius.md || 6,
      paddingHorizontal: 14, paddingVertical: 12,
      marginBottom: 10
    },
    name: { fontSize: f.md, color: c.text, fontWeight: '500' },
    meta: { fontSize: f.sm, color: c.textMuted || c.muted, marginTop: 2 },
    subHead: { fontSize: f.xs, color: c.textMuted2 || c.faint, marginTop: 6, marginBottom: 2 },
    listItem: { fontSize: f.sm, color: c.textMuted || c.muted, marginTop: 1, marginLeft: 4 },
    muted: { fontSize: f.sm, color: c.textMuted2 || c.faint, marginTop: 4 },
    chainItem: { fontSize: f.sm, color: c.textMuted || c.muted, marginTop: 2, marginLeft: 4 },
    headRow: { flexDirection: 'row', alignItems: 'center' },
    headName: { flex: 1, fontSize: f.md, color: c.text, fontWeight: '500' },
    updateBtn: {
      paddingHorizontal: 12, paddingVertical: 5, borderRadius: tk.radius.sm || 4,
      backgroundColor: c.borderStrong
    },
    updateBtnText: { fontSize: f.sm, color: c.text },
    chainCard: {
      backgroundColor: c.bg, borderRadius: tk.radius.sm || 4,
      paddingHorizontal: 8, paddingVertical: 6, marginTop: 4
    },
    chainNote: { fontSize: f.xs, color: c.textMuted || c.muted, marginTop: 4 },
    btnRow: { flexDirection: 'row', marginTop: 6 },
    btn: {
      paddingHorizontal: 14, paddingVertical: 6, borderRadius: tk.radius.sm || 4,
      backgroundColor: c.borderStrong, marginRight: 8, alignItems: 'center', justifyContent: 'center'
    },
    btnPrimary: { backgroundColor: c.primary },
    btnDanger: { backgroundColor: c.danger },
    btnText: { fontSize: f.sm, color: c.text },
    btnTextOn: { fontSize: f.sm, color: c.bgWhite }
  });

  function renderNpc(npcId) {
    var def = view.npcs[npcId] || { id: npcId, name: npcId };
    var rt = view.runtime[npcId]; // 可能 null
    return (
      <View key={npcId} style={styles.card}>
        <View style={styles.headRow}>
          <Text style={styles.headName}>{def.name}</Text>
          <TouchableOpacity
            style={styles.updateBtn}
            activeOpacity={0.75}
            onPress={function () { handleUpdate(npcId); }}
          >
            <Text style={styles.updateBtnText}>{'更新'}</Text>
          </TouchableOpacity>
        </View>
        {!rt ? (
          <Text style={styles.muted}>{view.noRuntimeText}</Text>
        ) : (
          <View>
            <Text style={styles.meta}>{'心情：' + (rt.mood || '—')}</Text>
            <Text style={styles.meta}>{'好感：' + (rt.playerRelation || '—')}</Text>
            <Text style={styles.meta}>{'位置：' + (rt.locationId || '—')}</Text>
            <Text style={styles.meta}>{'存活：' + (rt.alive ? '是' : '否')}</Text>
            {rt.knownFacts && rt.knownFacts.length ? (
              <View>
                <Text style={styles.subHead}>{'已知事实'}</Text>
                {rt.knownFacts.map(function (fact, k) {
                  var txt = fmtItem(fact);
                  return txt ? <Text key={k} style={styles.listItem}>{'· ' + txt}</Text> : null;
                })}
              </View>
            ) : null}
            {rt.recentEvents && rt.recentEvents.length ? (
              <View>
                <Text style={styles.subHead}>{'近期事件'}</Text>
                {rt.recentEvents.map(function (ev, k) {
                  var txt = fmtItem(ev);
                  return txt ? <Text key={k} style={styles.listItem}>{'· ' + txt}</Text> : null;
                })}
              </View>
            ) : null}
          </View>
        )}
      </View>
    );
  }

  // 推演链列表：kind==='history' 走历史文案（照桌面 :173）；否则 pending（照 :150-170）
  function renderChainList(items, kind) {
    if (!items || !items.length) {
      return <Text style={styles.muted}>{'（空）'}</Text>;
    }
    return items.map(function (it, i) {
      if (kind === 'history') {
        var resLabel = { confirmed: '已确认', rejected: '已拒绝', auto_rejected: '引擎判定不成立' }[it && it.resolution] || '已拒绝';
        var hTxt = (it && it.factText) ? it.factText : fmtItem(it);
        if (typeof hTxt !== 'string') hTxt = String(hTxt || '');
        var color = (it && it.resolution === 'confirmed') ? c.success : (c.textMuted2 || c.faint);
        return <Text key={i} style={[styles.chainItem, { color: color }]}>{'· ' + resLabel + '：' + hTxt}</Text>;
      }
      // pending：内容 + 按 desktop 三分支给按钮（有 deductionNote / 有 failReason / 其余）
      var pTxt = (it && it.factText) ? it.factText : fmtItem(it);
      if (typeof pTxt !== 'string') pTxt = String(pTxt || '');
      var id = (it && it.id) || '';
      var note = '';
      var buttons = null;
      if (it && it.deductionNote) {
        note = '推理链：' + String(it.deductionNote);
        buttons = (
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              activeOpacity={0.75}
              onPress={function () { NpcActions.confirmDeduction(id); refresh(); }}
            >
              <Text style={styles.btnTextOn}>{'确认'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnDanger]}
              activeOpacity={0.75}
              onPress={function () { NpcActions.rejectDeduction(id); refresh(); }}
            >
              <Text style={styles.btnTextOn}>{'拒绝'}</Text>
            </TouchableOpacity>
          </View>
        );
      } else if (it && it.failReason) {
        note = '推演失败：' + String(it.failReason);
        buttons = (
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.btn}
              activeOpacity={0.75}
              onPress={function () {
                var p = NpcActions.retryDeduction(id);
                if (p && typeof p.then === 'function') p.then(function () { refresh(); });
                else refresh();
              }}
            >
              <Text style={styles.btnText}>{'重试'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnDanger]}
              activeOpacity={0.75}
              onPress={function () { NpcActions.rejectDeduction(id); refresh(); }}
            >
              <Text style={styles.btnTextOn}>{'拒绝'}</Text>
            </TouchableOpacity>
          </View>
        );
      } else {
        note = '（引擎正在推演…）';
        buttons = (
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btn, styles.btnDanger]}
              activeOpacity={0.75}
              onPress={function () { NpcActions.rejectDeduction(id); refresh(); }}
            >
              <Text style={styles.btnTextOn}>{'拒绝'}</Text>
            </TouchableOpacity>
          </View>
        );
      }
      return (
        <View key={i} style={styles.chainCard}>
          <Text style={styles.chainItem}>{'· 需要知道：' + pTxt}</Text>
          {note ? <Text style={styles.chainNote}>{note}</Text> : null}
          {buttons}
        </View>
      );
    });
  }

  if (!view.focus.length && !view.scene.length && !view.pending.length && !view.history.length) {
    return <Text style={styles.empty}>{view.emptyText}</Text>;
  }

  return (
    <View>
      <Text style={styles.sectionHead}>{'在场 NPC（focus）'}</Text>
      {view.focus.length ? (
        view.focus.map(function (id) { return renderNpc(id); })
      ) : (
        <Text style={styles.muted}>{view.noFocusText}</Text>
      )}

      {view.scene.length ? (
        <View>
          <Text style={styles.sectionHead}>{'现场 NPC（scene）'}</Text>
          {view.scene.map(function (id) { return renderNpc(id); })}
        </View>
      ) : null}

      <Text style={styles.sectionHead}>{'推演链 · 待处理'}</Text>
      {renderChainList(view.pending, 'pending')}

      <Text style={styles.sectionHead}>{'推演链 · 历史'}</Text>
      {renderChainList(view.history, 'history')}

      <NpcUpdateModal
        visible={!!modal}
        npcName={(view.npcs[modalNpcId] && view.npcs[modalNpcId].name) || modalNpcId || ''}
        tokens={tk}
        loading={modalLoading}
        errMsg={modalErrMsg}
        data={modalData}
        onConfirm={handleConfirm}
        onRegenerate={handleRegenerate}
        onCancel={handleCancel}
      />
    </View>
  );
}

module.exports = NpcPanel;
