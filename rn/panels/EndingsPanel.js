// ============================================================
// 批次 H6 · 结局面板（B 类，RN 组件）
// 桌面锚点：engine/ui_core.js:1073-1127（后日谈 :1129-1206）
// 数据源：Endings.listAll()
// 空态逐字照桌面：「结局模块未加载。」（其余：未在游戏中。/本卡带未启用结局系统。/本卡带未定义任何结局。）
// 已达成且 epilogue 非空 → 进入二级后日谈视图；续写 → Endings.extendEpilogue(id, hint)（async）。
// 二级视图状态由 React.useState 管理（epilogueId）；续写完成后 bump 刷新正文。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var TextInput = RN.TextInput;
var TouchableOpacity = RN.TouchableOpacity;
var ScrollView = RN.ScrollView;

var PanelData = require('./panel_data.js');
var StoryStore = require('../story_store.js');

function EndingsPanel(props) {
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var epilogueState = React.useState(null);
  var epilogueId = epilogueState[0];
  var setEpilogueId = epilogueState[1];
  var hintState = React.useState('');
  var hint = hintState[0];
  var setHint = hintState[1];
  var busyState = React.useState(false);
  var busy = busyState[0];
  var setBusy = busyState[1];
  var bump = React.useState(0)[1];

  var view = PanelData.computeEndings();

  var styles = RN.StyleSheet.create({
    empty: { color: c.muted, fontSize: f.base, textAlign: 'center', paddingVertical: 20 },
    hint: { fontSize: f.xs, color: c.faint, marginTop: 12, textAlign: 'center' },
    stats: {
      fontSize: f.sm, color: c.accent, textAlign: 'center',
      paddingVertical: 8, marginBottom: 10
    },
    card: {
      backgroundColor: c.bgPanel || c.bg,
      borderRadius: tk.radius.md || 6,
      paddingHorizontal: 14, paddingVertical: 12,
      marginBottom: 10
    },
    headRow: { flexDirection: 'row', alignItems: 'center' },
    sectionTitle: { fontSize: f.sm, color: c.accent, marginTop: 12, marginBottom: 6, fontWeight: '500' },
    title: { fontSize: f.md, color: c.text, fontWeight: '500', flexShrink: 1 },
    hardTag: { fontSize: f.xs, marginLeft: 8, color: c.danger },
    desc: { fontSize: f.sm, color: c.textMuted || c.muted, marginTop: 4 },
    mark: { fontSize: f.xs, marginTop: 4 },
    backBtn: {
      paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start',
      borderRadius: tk.radius.sm || 4, backgroundColor: c.hair, marginBottom: 12
    },
    backText: { fontSize: f.sm, color: c.textMuted || c.muted },
    epilogueTitle: { fontSize: f.sm, color: c.accent, marginTop: 8, marginBottom: 4, fontWeight: '500' },
    epilogueText: { fontSize: f.sm, color: c.text, lineHeight: 22 },
    extSep: { fontSize: f.xs, color: c.faint, marginTop: 8, marginBottom: 2 },
    input: {
      borderWidth: 1, borderColor: c.hair, borderRadius: tk.radius.sm || 4,
      paddingHorizontal: 10, paddingVertical: 8, marginTop: 12,
      fontSize: f.sm, color: c.text, minHeight: 64
    },
    writeBtn: {
      backgroundColor: c.accent, paddingVertical: 10, borderRadius: tk.radius.sm || 4,
      alignItems: 'center', justifyContent: 'center', marginTop: 8
    },
    writeBtnDisabled: { opacity: 0.5 },
    writeBtnText: { color: c.bg, fontSize: f.sm },
    viewBtn: {
      marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start',
      borderRadius: tk.radius.sm || 4, backgroundColor: c.accent
    },
    viewBtnText: { color: c.bg, fontSize: f.xs }
  });

  function onExtend() {
    if (!epilogueId) return;
    var h = (hint || '').trim();
    if (!h) {
      StoryStore.pushToast('请先填写续写方向', { type: 'warn' });
      return;
    }
    setBusy(true);
    try {
      var p = Endings.extendEpilogue(epilogueId, h);
      if (p && typeof p.then === 'function') {
        p.then(function (res) {
          setBusy(false);
          if (!res || !res.ok) {
            StoryStore.pushToast((res && res.reason) || '续写失败', { type: 'warn' });
            return;
          }
          setHint('');
          bump(function (v) { return v + 1; });
        }).catch(function (e) {
          setBusy(false);
          StoryStore.pushToast('续写异常：' + (e && e.message || e), { type: 'error' });
        });
      } else {
        setBusy(false);
        if (p && p.ok) setHint('');
        bump(function (v) { return v + 1; });
      }
    } catch (e) {
      setBusy(false);
      StoryStore.pushToast('续写异常：' + (e && e.message || e), { type: 'error' });
    }
  }

  // ---------- 空态 ----------
  if (view.emptyText) {
    return (
      <View>
        <Text style={styles.empty}>{view.emptyText}</Text>
        {view.subText ? <Text style={styles.hint}>{view.subText}</Text> : null}
      </View>
    );
  }

  // ---------- 二级后日谈视图 ----------
  if (epilogueId) {
    var ending = null;
    for (var i = 0; i < view.endings.length; i++) {
      if (view.endings[i].id === epilogueId) { ending = view.endings[i]; break; }
    }
    if (ending) {
      var exts = Array.isArray(ending.extensions) ? ending.extensions : [];
      return (
        <View>
          <TouchableOpacity
            style={styles.backBtn}
            activeOpacity={0.7}
            onPress={function () { setEpilogueId(null); setHint(''); setBusy(false); }}
          >
            <Text style={styles.backText}>{'← 返回结局列表'}</Text>
          </TouchableOpacity>

          <Text style={styles.title}>{ending.name + ' · 后日谈'}</Text>

          {ending.epilogue ? (
            <View>
              <Text style={styles.epilogueTitle}>{'正文'}</Text>
              <Text style={styles.epilogueText}>{ending.epilogue}</Text>
            </View>
          ) : null}

          {exts.length ? (
            <View>
              <Text style={styles.epilogueTitle}>{'续写'}</Text>
              {exts.map(function (e, j) {
                return (
                  <View key={j}>
                    {j > 0 ? <Text style={styles.extSep}>{'— — —'}</Text> : null}
                    <Text style={styles.epilogueText}>{e}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          <Text style={styles.epilogueTitle}>{'续写方向'}</Text>
          <TextInput
            style={styles.input}
            value={hint}
            onChangeText={setHint}
            placeholder={'例如：多年后主角重访旧地'}
            placeholderTextColor={c.textMuted2 || c.faint}
            multiline
            editable={!busy}
          />
          <TouchableOpacity
            style={[styles.writeBtn, busy ? styles.writeBtnDisabled : null]}
            activeOpacity={0.7}
            disabled={busy}
            onPress={onExtend}
          >
            <Text style={styles.writeBtnText}>{busy ? '续写中…' : '续写'}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    // ending 不在列表里（存档切换/回滚）：落到下方列表渲染，
    // 不在渲染期 setState，避免 React 渲染期更新告警；下次点
    // 「查看后日谈」会用新 id 覆盖这个失效值。
  }

  // ---------- 结局列表（H6R 订正：桌面两段式，ui_core.js:1085-1125）----------
  // 顶部统计条：已达成 N / M（+ 系统锁真时 · 主循环已锁死）
  // 已达成段：name（+ e.locked 真时「硬结局」标签）→ desc → 达成于 reachedAt → 查看后日谈
  // 未达成（N）段：仅 name + desc，opacity 0.7，零标签
  var reachedList = view.endings.filter(function (e) { return e.reached; });
  var unreachedList = view.endings.filter(function (e) { return !e.reached; });

  return (
    <View>
      <Text style={styles.stats}>
        {'已达成 '}
        <Text style={{ color: c.success, fontWeight: '600' }}>{String(view.reachedCount)}</Text>
        {' / ' + String(view.totalCount)}
        {view.systemLocked ? <Text style={{ color: c.danger, fontWeight: '600' }}>{' · 主循环已锁死'}</Text> : null}
      </Text>

      {reachedList.length ? (
        <View>
          <Text style={styles.sectionTitle}>{'已达成'}</Text>
          {reachedList.map(function (e, i) {
            var hasEpilogue = !!e.epilogue || (Array.isArray(e.extensions) && e.extensions.length);
            return (
              <View key={'r' + i} style={styles.card}>
                <View style={styles.headRow}>
                  <Text style={styles.title}>{e.name}</Text>
                  {e.locked ? <Text style={styles.hardTag}>{'硬结局'}</Text> : null}
                </View>
                {e.desc ? <Text style={styles.desc}>{e.desc}</Text> : null}
                <Text style={[styles.mark, { color: c.success }]}>{'达成于 ' + (e.reachedAt || '')}</Text>
                {hasEpilogue ? (
                  <TouchableOpacity
                    style={styles.viewBtn}
                    activeOpacity={0.7}
                    onPress={function () { setEpilogueId(e.id); setHint(''); setBusy(false); }}
                  >
                    <Text style={styles.viewBtnText}>{'查看后日谈'}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {unreachedList.length ? (
        <View>
          <Text style={styles.sectionTitle}>{'未达成（' + String(unreachedList.length) + '）'}</Text>
          {unreachedList.map(function (e, i) {
            return (
              <View key={'u' + i} style={[styles.card, { opacity: 0.7 }]}>
                <Text style={styles.title}>{e.name}</Text>
                {e.desc ? <Text style={styles.desc}>{e.desc}</Text> : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

module.exports = EndingsPanel;
