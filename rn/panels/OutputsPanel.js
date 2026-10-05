// ============================================================
// 批次 P27 · 产出物面板（B 类，RN 组件）
// 对应引擎：engine/outputs.js
// 数据源：PanelData.computeOutputs()（只在动作函数里调引擎，渲染不碰 Outputs.listAll）
// 空态：未开启 → 一句「产出物系统当前未开启（设置 → 通用 → 产出物系统）」；
//   已开启但列表空 → computeOutputs().empty。
// 三块：① 新建产出物（标题必填 / 描述 / 正文）→ Outputs.create({... fromPanel:true})
//   ⇒ 引擎置 review.state='pending'（待审），要先过一轮 AI 审核才纳入剧情；
//   ② 逐条列表（标题 / 描述 / 正文截断 200 字 / 状态徽标 / 送 AI 审核·编辑·定论）；
//   ③ 编辑区（标题 / 描述 / 正文）→ Outputs.update(id, {...})（字段白名单）。
// 「送 AI 审核」→ Outputs.review(id, { chat: (msgs, opts) => ApiClient.chat(msgs, opts) })
//   （返回 Promise；按 verdict include/revise/reject 给不同提示，.catch 也提示；
//   审核期间按钮禁用并显示「正在审核…」）。
// 「定论」→ Platform.ui.confirmAsync 二次确认 → Outputs.settle(id, '手动定论')。
// 引擎调用全部 try/catch 包裹，本地 bump 刷新。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var TextInput = RN.TextInput;
var TouchableOpacity = RN.TouchableOpacity;

var PanelData = require('./panel_data.js');
var StoryStore = require('../story_store.js');

// review.state → 徽标文案（engine/outputs.js:106/220-229：none/pending/include/revise/reject）
var REVIEW_LABEL = {
  none: '已纳入剧情',
  pending: '待审',
  included: '已纳入',
  revised: '已修改并纳入',
  rejected: '已驳回'
};
// fate → 徽标文案（engine/outputs.js:118 发酵中 / :384 已定论）
var FATE_LABEL = { fermenting: '发酵中', settled: '已定论' };

function reviewLabel(state) {
  return REVIEW_LABEL[state] || REVIEW_LABEL.none;
}

function reviewColor(c, state) {
  if (state === 'rejected') return c.danger;
  if (state === 'included' || state === 'revised') return c.success;
  if (state === 'pending') return c.warning || c.accent;
  return c.textMuted2 || c.faint;
}

function truncate(s, n) {
  var t = String(s == null ? '' : s);
  return t.length > n ? (t.slice(0, n) + '…') : t;
}

function OutputsPanel(props) {
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var bump = React.useState(0)[1];
  var view = PanelData.computeOutputs();
  var items = Array.isArray(view.items) ? view.items : [];

  // 新建表单
  var formTitleState = React.useState('');
  var formTitle = formTitleState[0];
  var setFormTitle = formTitleState[1];
  var formDescState = React.useState('');
  var formDesc = formDescState[0];
  var setFormDesc = formDescState[1];
  var formContentState = React.useState('');
  var formContent = formContentState[0];
  var setFormContent = formContentState[1];

  // 编辑区（editId 非空 = 该条正在编辑）
  var editIdState = React.useState('');
  var editId = editIdState[0];
  var setEditId = editIdState[1];
  var editTitleState = React.useState('');
  var editTitle = editTitleState[0];
  var setEditTitle = editTitleState[1];
  var editDescState = React.useState('');
  var editDesc = editDescState[0];
  var setEditDesc = editDescState[1];
  var editContentState = React.useState('');
  var editContent = editContentState[0];
  var setEditContent = editContentState[1];

  // 正在送审的产出物 id（'' = 空闲）
  var busyIdState = React.useState('');
  var busyId = busyIdState[0];
  var setBusyId = busyIdState[1];

  var styles = RN.StyleSheet.create({
    empty: { color: c.muted, fontSize: f.base, textAlign: 'center', paddingVertical: 20 },
    header: { fontSize: f.sm, color: c.textMuted || c.muted, marginBottom: 10 },
    sectionTitle: { fontSize: f.sm, color: c.accent, marginTop: 4, marginBottom: 6, fontWeight: '500' },
    card: {
      backgroundColor: c.bgPanel || c.bg,
      borderRadius: tk.radius.md || 6,
      paddingHorizontal: 14, paddingVertical: 12,
      marginBottom: 10
    },
    headRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
    title: { fontSize: f.md, color: c.text, fontWeight: '500', flexShrink: 1 },
    badge: { fontSize: f.xs, marginLeft: 8 },
    desc: { fontSize: f.sm, color: c.textMuted || c.muted, marginTop: 4 },
    content: { fontSize: f.sm, color: c.text, marginTop: 4, lineHeight: 20 },
    reason: { fontSize: f.xs, color: c.textMuted2 || c.faint, marginTop: 4 },
    progress: { fontSize: f.xs, color: c.textMuted2 || c.faint, marginTop: 4 },
    input: {
      borderWidth: 1, borderColor: c.hair, borderRadius: tk.radius.sm || 4,
      paddingHorizontal: 10, paddingVertical: 8, marginTop: 8,
      color: c.text, fontSize: f.sm
    },
    inputArea: { minHeight: 64, textAlignVertical: 'top' },
    btnRow: { flexDirection: 'row', marginTop: 10 },
    btn: {
      flex: 1, paddingVertical: 8, borderRadius: tk.radius.sm || 4,
      alignItems: 'center', justifyContent: 'center', marginRight: 8
    },
    btnPrimary: { backgroundColor: c.success },
    btnGhost: { backgroundColor: c.hair },
    btnDanger: { backgroundColor: c.danger, marginRight: 0 },
    btnDisabled: { opacity: 0.5 },
    btnText: { color: c.bg, fontSize: f.sm },
    btnTextGhost: { color: c.textMuted || c.muted, fontSize: f.sm },
    btnTextLight: { color: c.text, fontSize: f.sm }
  });

  function refresh() { bump(function (v) { return v + 1; }); }

  // ① 新建（fromPanel:true ⇒ 引擎置 pending，待 AI 审核）
  function onCreate() {
    var title = String(formTitle || '').trim();
    if (!title) {
      StoryStore.pushToast('标题必填', { type: 'warn' });
      return;
    }
    try {
      var r = Outputs.create({
        name: title,
        title: title,
        desc: String(formDesc || ''),
        content: String(formContent || ''),
        fromPanel: true
      });
      if (r && r.ok) {
        StoryStore.pushToast('已提交《' + title + '》，待 AI 审核', { type: 'success' });
        setFormTitle('');
        setFormDesc('');
        setFormContent('');
      } else {
        StoryStore.pushToast('新建失败：' + ((r && r.reason) || '未知原因'), { type: 'error' });
      }
    } catch (e) {
      StoryStore.pushToast('新建异常：' + (e && e.message || e), { type: 'error' });
    }
    refresh();
  }

  // ④ 编辑 → Outputs.update（只认 title/desc/content/name/type/keywords/audience）
  function onEditStart(o) {
    setEditId(o.id);
    setEditTitle(o.title || o.name || '');
    setEditDesc(o.desc || '');
    setEditContent(o.content || '');
  }

  function onCancelEdit() { setEditId(''); }

  function onSaveEdit() {
    if (!editId) return;
    try {
      var r = Outputs.update(editId, {
        title: String(editTitle || ''),
        desc: String(editDesc || ''),
        content: String(editContent || '')
      });
      if (r && r.ok) {
        StoryStore.pushToast('已保存（' + ((r.applied || []).join('/')) + '）', { type: 'success' });
        setEditId('');
      } else {
        StoryStore.pushToast('保存失败：' + ((r && r.reason) || '未知原因'), { type: 'error' });
      }
    } catch (e) {
      StoryStore.pushToast('保存异常：' + (e && e.message || e), { type: 'error' });
    }
    refresh();
  }

  // ⑤ 送 AI 审核（Promise；审核期间按钮禁用 +「正在审核…」）
  function onReview(o) {
    if (busyId) return;
    setBusyId(o.id);
    function finish() { setBusyId(''); refresh(); }
    try {
      var p = Outputs.review(o.id, {
        chat: function (msgs, opts) { return ApiClient.chat(msgs, opts); }
      });
      Promise.resolve(p).then(function (res) {
        if (res && res.ok) {
          if (res.verdict === 'include') {
            StoryStore.pushToast('审核通过：《' + (o.title || o.name) + '》已纳入剧情', { type: 'success' });
          } else if (res.verdict === 'revise') {
            StoryStore.pushToast('审核通过：已按 AI 改写纳入《' + (o.title || o.name) + '》', { type: 'success' });
          } else {
            StoryStore.pushToast('已驳回：' + (res.reason || '与世界不一致'), { type: 'warn' });
          }
        } else {
          StoryStore.pushToast('审核失败：' + ((res && res.reason) || '未知原因'), { type: 'error' });
        }
        finish();
      }, function (e) {
        StoryStore.pushToast('审核异常：' + (e && e.message || e), { type: 'error' });
        finish();
      });
    } catch (e) {
      StoryStore.pushToast('审核异常：' + (e && e.message || e), { type: 'error' });
      setBusyId('');
      refresh();
    }
  }

  // ⑥ 定论（不可逆 → 二次确认）
  function onSettle(o) {
    var name = o.title || o.name || '';
    var ask = Platform.ui.confirmAsync('给《' + name + '》下结论？\n\n定论后不能再发酵，也不能再送审核。', {
      okText: '定论',
      cancelText: '取消'
    });
    Promise.resolve(ask).then(function (yes) {
      if (!yes) return;
      try {
        var r = Outputs.settle(o.id, '手动定论');
        if (r && r.ok) {
          StoryStore.pushToast('已定论：《' + name + '》', { type: 'success' });
        } else {
          StoryStore.pushToast('定论失败：' + ((r && r.reason) || '未知原因'), { type: 'error' });
        }
      } catch (e) {
        StoryStore.pushToast('定论异常：' + (e && e.message || e), { type: 'error' });
      }
      refresh();
    }, function (e) {
      StoryStore.pushToast('定论异常：' + (e && e.message || e), { type: 'error' });
    });
  }

  // ① 未开启：只给一句引导
  if (!view.enabled) {
    return (
      <View>
        <Text style={styles.empty}>{view.emptyText}</Text>
      </View>
    );
  }

  return (
    <View>
      {view.header ? <Text style={styles.header}>{view.header}</Text> : null}

      <Text style={styles.sectionTitle}>{'新建产出物'}</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={formTitle}
          onChangeText={setFormTitle}
          placeholder={'标题（必填）'}
          placeholderTextColor={c.textMuted2 || c.faint}
        />
        <TextInput
          style={styles.input}
          value={formDesc}
          onChangeText={setFormDesc}
          placeholder={'描述（可选）'}
          placeholderTextColor={c.textMuted2 || c.faint}
        />
        <TextInput
          style={[styles.input, styles.inputArea]}
          value={formContent}
          onChangeText={setFormContent}
          placeholder={'正文（可选）'}
          placeholderTextColor={c.textMuted2 || c.faint}
          multiline
        />
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            activeOpacity={0.7}
            onPress={onCreate}
          >
            <Text style={styles.btnText}>{'提交（待 AI 审核）'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.sectionTitle}>{'产出物'}</Text>
      {items.length ? items.map(function (o, i) {
        var st = o.reviewState || 'none';
        var editing = !!editId && editId === o.id;
        var busy = busyId === o.id;
        return (
          <View key={o.id || i} style={styles.card}>
            <View style={styles.headRow}>
              <Text style={styles.title}>{'《' + (o.title || o.name || '未命名') + '》'}</Text>
              <Text style={[styles.badge, { color: reviewColor(c, st) }]}>{reviewLabel(st)}</Text>
              <Text style={[styles.badge, { color: c.textMuted2 || c.faint }]}>
                {FATE_LABEL[o.fate] || ''}
              </Text>
            </View>
            {o.desc ? <Text style={styles.desc}>{o.desc}</Text> : null}
            {o.content ? <Text style={styles.content}>{truncate(o.content, 200)}</Text> : null}
            {o.reason ? <Text style={styles.reason}>{'审核意见：' + o.reason}</Text> : null}
            <Text style={styles.progress}>{'发酵进度 ' + String(o.progress || 0)}</Text>

            {editing ? (
              <View>
                <TextInput
                  style={styles.input}
                  value={editTitle}
                  onChangeText={setEditTitle}
                  placeholder={'标题'}
                  placeholderTextColor={c.textMuted2 || c.faint}
                />
                <TextInput
                  style={styles.input}
                  value={editDesc}
                  onChangeText={setEditDesc}
                  placeholder={'描述'}
                  placeholderTextColor={c.textMuted2 || c.faint}
                />
                <TextInput
                  style={[styles.input, styles.inputArea]}
                  value={editContent}
                  onChangeText={setEditContent}
                  placeholder={'正文'}
                  placeholderTextColor={c.textMuted2 || c.faint}
                  multiline
                />
                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary]}
                    activeOpacity={0.7}
                    onPress={onSaveEdit}
                  >
                    <Text style={styles.btnText}>{'保存'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnGhost]}
                    activeOpacity={0.7}
                    onPress={onCancelEdit}
                  >
                    <Text style={styles.btnTextGhost}>{'取消'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary, busy ? styles.btnDisabled : null]}
                  activeOpacity={0.7}
                  disabled={busy}
                  onPress={function () { onReview(o); }}
                >
                  <Text style={styles.btnText}>{busy ? '正在审核…' : '送 AI 审核'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnGhost]}
                  activeOpacity={0.7}
                  onPress={function () { onEditStart(o); }}
                >
                  <Text style={styles.btnTextGhost}>{'编辑'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnDanger, o.fate === 'settled' ? styles.btnDisabled : null]}
                  activeOpacity={0.7}
                  disabled={o.fate === 'settled'}
                  onPress={function () { onSettle(o); }}
                >
                  <Text style={styles.btnTextLight}>{'定论'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      }) : <Text style={styles.empty}>{view.empty || '还没有产出物…'}</Text>}
    </View>
  );
}

module.exports = OutputsPanel;
