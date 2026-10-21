// ============================================================
// 批次 H6 · 日志面板（B 类，RN 组件）
// 桌面锚点：engine/ui_panels.js:519 renderLogPanel / :530 renderLogList
// 数据源：Logger.listLogs / Logger.search（vfs/logger.js:102 / :353）
// 空态逐字照桌面：「还没有日志。」
// H6 追加：搜索框 + 清空 + 详情视图（G8）
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

function LogPanel(props) {
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var view = PanelData.computeLog();

  // 搜索状态
  var searchKey = React.useState('');
  var kw = searchKey[0], setKw = searchKey[1];
  var searchState = React.useState(null); // null=未搜索, []=搜了0条, [...]=有结果
  var searchResult = searchState[0], setSearchResult = searchState[1];
  var detailLog = React.useState(null);
  var detail = detailLog[0], setDetail = detailLog[1];

  // 刷新计数
  var bumpS = React.useState(0);
  var bump = bumpS[0], setBump = bumpS[1];

  // P72·§15.4-3：归档日志的「显示已归档」开关（会话内存态，不落盘；同桌面
  // ui_panels.js:669 toggleArchivedLogs）。关着=只列活跃块（默认），开着=连被
  // 回退切走的归档块一起列，且能在详情页「恢复已归档」把它们放回默认视图。
  var archS = React.useState(false);
  var showArch = archS[0], setShowArch = archS[1];

  // 重新取数据（搜索后刷新）
  view = PanelData.computeLog();

  var styles = RN.StyleSheet.create({
    empty: { color: c.muted, fontSize: f.base, textAlign: 'center', paddingVertical: 20 },
    searchRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    input: {
      flex: 1, borderWidth: 1, borderColor: c.hair,
      borderRadius: tk.radius.sm || 4, paddingHorizontal: 12,
      paddingVertical: 8, fontSize: f.base, color: c.text
    },
    btn: {
      paddingHorizontal: 14, paddingVertical: 8,
      borderRadius: tk.radius.sm || 4, backgroundColor: c.hair
    },
    btnActive: {
      paddingHorizontal: 14, paddingVertical: 8,
      borderRadius: tk.radius.sm || 4, backgroundColor: c.accent || c.primary
    },
    btnText: { fontSize: f.sm, color: c.text },
    btnTextActive: { fontSize: f.sm, color: c.bgWhite || '#fff' },
    searchHeader: { fontSize: f.sm, color: c.textMuted || c.muted, marginBottom: 8 },
    card: {
      backgroundColor: c.bgPanel || c.bg,
      borderRadius: tk.radius.md || 6,
      paddingHorizontal: 14, paddingVertical: 12,
      marginBottom: 10
    },
    cardTouch: {
      backgroundColor: c.bgPanel || c.bg,
      borderRadius: tk.radius.md || 6,
      paddingHorizontal: 14, paddingVertical: 12,
      marginBottom: 10
    },
    title: { fontSize: f.md, color: c.text, fontWeight: '500' },
    sub: { fontSize: f.sm, color: c.textMuted || c.muted, marginTop: 4 },
    detailBack: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      marginBottom: 12, paddingVertical: 4
    },
    detailBackText: { fontSize: f.base, color: c.accent || c.primary },
    detailTitle: { fontSize: f.lg, color: c.text, fontWeight: '500', marginBottom: 6 },
    detailMeta: { fontSize: f.sm, color: c.textMuted || c.muted, marginBottom: 8 },
    detailBody: { fontSize: f.base, color: c.text, lineHeight: Math.round(f.base * 1.6) },
    detailSection: { marginTop: 10 },
    detailLabel: { fontSize: f.sm, color: c.textMuted || c.muted, marginBottom: 4 },
    detailEntities: { fontSize: f.sm, color: c.text2 || c.text },
    detailBtnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
    detailDel: {
      borderWidth: 1, borderColor: c.danger, borderRadius: tk.radius.sm || 4,
      paddingHorizontal: 14, paddingVertical: 8
    },
    detailDelText: { fontSize: f.sm, color: c.danger },
    // P72·§15.4-3：归档开关与恢复按钮
    archRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginBottom: 10, paddingVertical: 4
    },
    archToggle: {
      borderWidth: 1, borderColor: c.hair, borderRadius: tk.radius.sm || 4,
      paddingHorizontal: 10, paddingVertical: 5
    },
    archToggleText: { fontSize: f.sm, color: c.text2 || c.text },
    archEmpty: { fontSize: f.sm, color: c.muted },
    archBadge: { fontSize: f.sm, color: c.muted, marginTop: 2 },
    detailRestore: {
      borderWidth: 1, borderColor: c.accent || c.primary, borderRadius: tk.radius.sm || 4,
      paddingHorizontal: 14, paddingVertical: 8
    },
    detailRestoreText: { fontSize: f.sm, color: c.accent || c.primary }
  });

  // 空模块态
  if (view.emptyText && view.emptyText !== '还没有日志。') {
    return <Text style={styles.empty}>{view.emptyText}</Text>;
  }

  // P6·S3-7：日志删除（桌面 ui_panels.js:644-651 deleteLog）——
  // 按 id 现查原始日志取 gameDate 再删（computeLog 出口不含 gameDate 对象）。
  function doDeleteLog() {
    if (!detail) return;
    Platform.ui.confirmAsync('确定删除？').then(function (ok) {
      if (!ok) return;
      try {
        var raw = Logger.listLogs(GameState.currentCardId, GameState.currentSaveId) || [];
        var target = null;
        raw.forEach(function (l) { if (l && l.id === detail.id) target = l; });
        if (!target) { setDetail(null); return; }
        Logger.deleteLog(GameState.currentCardId, GameState.currentSaveId, target.gameDate);
      } catch (e) { /* 删除失败不阻断回列表（同桌面静默） */ }
      setDetail(null);
      setSearchResult(null);
      setBump(function (v) { return v + 1; });
    });
  }

  // P72·§15.4-3：某天归档块数（列表角标 / 详情按钮都用它）
  function archCountOf(l) {
    if (!l || !l.gameDate) return 0;
    try {
      if (typeof Logger !== 'undefined' && Logger.countArchived) {
        return Logger.countArchived(GameState.currentCardId, GameState.currentSaveId, l.gameDate) || 0;
      }
    } catch (e) { /* 取不到就当没有 */ }
    return 0;
  }

  // P72·§15.4-3：把这一天的归档块放回默认日志流（不删任何内容）
  function doUnarchive() {
    if (!detail || !detail.gameDate) return;
    var n = 0;
    try {
      if (typeof Logger !== 'undefined' && Logger.unarchiveLog) {
        n = Logger.unarchiveLog(GameState.currentCardId, GameState.currentSaveId, detail.gameDate) || 0;
      }
    } catch (e) { n = 0; }
    if (Platform.ui.toast) {
      Platform.ui.toast(n > 0 ? ('已恢复 ' + n + ' 块归档日志') : '这天没有已归档的日志',
        { type: n > 0 ? 'success' : 'info' });
    }
    setDetail(null);
    setSearchResult(null);
    setBump(function (v) { return v + 1; });
  }

  // 详情视图
  if (detail) {
    var ent = detail.entities || {};
    var detailArchN = archCountOf(detail);
    return (
      <View>
        <TouchableOpacity style={styles.detailBack} onPress={function () { setDetail(null); }}>
          <Text style={styles.detailBackText}>{'‹ 返回列表'}</Text>
        </TouchableOpacity>
        <Text style={styles.detailTitle}>{detail.title || ''}</Text>
        <Text style={styles.detailMeta}>
          {(detail.gameDate || detail.date || '') + (detail.realTime ? ' · ' + detail.realTime : '')}
        </Text>
        {detail.summary ? (
          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>{'摘要'}</Text>
            <Text style={styles.detailBody}>{detail.summary}</Text>
          </View>
        ) : null}
        {detail.fullText ? (
          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>{'正文'}</Text>
            <Text style={styles.detailBody}>{detail.fullText}</Text>
          </View>
        ) : null}
        {ent.npcs && ent.npcs.length ? (
          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>{'NPC'}</Text>
            <Text style={styles.detailEntities}>{ent.npcs.join('、')}</Text>
          </View>
        ) : null}
        {ent.places && ent.places.length ? (
          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>{'地点'}</Text>
            <Text style={styles.detailEntities}>{ent.places.join('、')}</Text>
          </View>
        ) : null}
        {ent.items && ent.items.length ? (
          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>{'物品'}</Text>
            <Text style={styles.detailEntities}>{ent.items.join('、')}</Text>
          </View>
        ) : null}
        {detail.tags && detail.tags.length ? (
          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>{'标签'}</Text>
            <Text style={styles.detailEntities}>{detail.tags.join('、')}</Text>
          </View>
        ) : null}
        {detail.messageCount != null ? (
          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>{'消息数'}</Text>
            <Text style={styles.detailEntities}>{String(detail.messageCount)}</Text>
          </View>
        ) : null}
        <View style={styles.detailBtnRow}>
          {detailArchN > 0 ? (
            <TouchableOpacity style={styles.detailRestore} activeOpacity={0.7} onPress={doUnarchive}>
              <Text style={styles.detailRestoreText}>{'恢复已归档 ' + detailArchN + ' 块'}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.detailDel} activeOpacity={0.7} onPress={doDeleteLog}>
            <Text style={styles.detailDelText}>{'删除'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // 搜索栏 + 列表
  var logs = view.logs;
  // P72·§15.4-3：开关打开时用 includeArchived 重新取，行对象补 gameDate 供
  // archCountOf / 恢复按钮用（computeLog 出口只有 date 字符串）
  if (showArch && typeof Logger !== 'undefined' && GameState.currentCardId) {
    try {
      var raw = Logger.listLogs(GameState.currentCardId, GameState.currentSaveId, { includeArchived: true }) || [];
      logs = raw.map(function (l) {
        var d = l.gameDate;
        return {
          id: l.id || '', date: d ? (d.year + '-' + d.month + '-' + d.day) : '?',
          title: l.title || '', summary: l.summary || '', gameDate: d || null
        };
      });
    } catch (e) { /* 取失败就退回默认视图 */ }
  }
  var searchHeader = '';
  if (searchResult !== null) {
    logs = searchResult;
    searchHeader = '搜索「' + kw + '」找到 ' + logs.length + ' 条';
  }

  // ★ P4·S5：搜索栏改为常显（原 H6 逻辑是「无日志就整块不渲染」，
  //   空库下玩家根本够不到搜索框）。去掉早返后，下面 :219 已处理
  //   「无结果/无日志」时的空态文案，不会渲染出空白的搜索栏。

  function doSearch() {
    if (!kw.trim()) return; // 空关键词什么都不做（桌面 doLogSearch 行为）
    var hits = [];
    try {
      if (typeof Logger !== 'undefined' && GameState.currentCardId && GameState.currentSaveId) {
        hits = Logger.search(GameState.currentCardId, GameState.currentSaveId, kw.trim()) || [];
      }
    } catch (e) { hits = []; }
    // ★ P4：Logger.search 返回的是原始日志对象（只有 gameDate，没有 date），
    //   列表行渲染用的是 l.date ⇒ 这里补一份带 date 的浅拷贝（详情视图字段照旧保留）。
    hits = hits.map(function (l) {
      var d = l.gameDate;
      var ds = d ? (d.year + '-' + d.month + '-' + d.day) : (l.date || '?');
      return Object.assign({}, l, { date: ds });
    });
    setSearchResult(hits);
  }

  function clearSearch() {
    setKw('');
    setSearchResult(null);
  }

  return (
    <View>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={kw}
          onChangeText={setKw}
          placeholder={'关键词'}
          placeholderTextColor={c.textMuted || c.muted}
          onSubmitEditing={doSearch}
        />
        <TouchableOpacity style={styles.btnActive} onPress={doSearch} activeOpacity={0.7}>
          <Text style={styles.btnTextActive}>{'搜索'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={clearSearch} activeOpacity={0.7}>
          <Text style={styles.btnText}>{'清空'}</Text>
        </TouchableOpacity>
      </View>
      {searchHeader ? <Text style={styles.searchHeader}>{searchHeader}</Text> : null}
      {searchResult === null ? (
        <View style={styles.archRow}>
          <TouchableOpacity
            style={styles.archToggle}
            activeOpacity={0.7}
            onPress={function () { setShowArch(function (v) { return !v; }); }}
          >
            <Text style={styles.archToggleText}>
              {showArch ? '✓ 显示已归档' : '显示已归档'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.archEmpty}>
            {showArch ? '回退切走的旧轮日志也列出来，可在详情里恢复' : ''}
          </Text>
        </View>
      ) : null}
      {logs.length ? logs.map(function (l, i) {
        var archN = archCountOf(l);
        return (
          <TouchableOpacity
            key={l.id || l.date || i}
            style={styles.cardTouch}
            activeOpacity={0.7}
            onPress={function () { setDetail(l); }}
          >
            <Text style={styles.title}>{(l.date || '') + ' · ' + (l.title || '')}</Text>
            <Text style={styles.sub}>{l.summary || ''}</Text>
            {archN > 0 ? <Text style={styles.archBadge}>{'· 已归档 ' + archN + ' 块'}</Text> : null}
          </TouchableOpacity>
        );
      }) : (searchHeader ? null : <Text style={styles.empty}>{view.emptyText}</Text>)}
    </View>
  );
}

module.exports = LogPanel;
