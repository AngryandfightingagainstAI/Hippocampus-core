// ============================================================
// P1-C · 思维链 + 搜索过程折叠块（B 类，RN 组件）
// 桌面锚点：engine/ui_thinking.js render（L23）折叠面板 details/summary/
//   think-body；挂载点 ui_core.js L675-690（段内 changes 之后、选项之前）。
// 输入 meta 已由 story_store.filterThinkingMeta 按三开关裁好（同时机对齐
// ui_core L676-682）；本组件只负责排印，不读开关、不碰存储。
// 形态差异（自报）：桌面对话用 data-icon 图标集（brain/magnifying-glass/
// chart-bar/x），RN 无图标集，按裁定改 emoji 文本；<details> 折叠改本地
// useState 展开/收起（默认收起，同 details 无 open 属性）。
// 纪律：颜色/字号只取自 useTheme tokens；布局数值为 RN 必要度量。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var TouchableOpacity = RN.TouchableOpacity;

function ThinkingBlock(props) {
  var tk = props.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;
  var fonts = tk.fonts;
  var meta = props.meta;

  var openState = React.useState(false);
  var open = openState[0];
  var setOpen = openState[1];

  if (!meta) return null;
  var hasReasoning = !!(meta.reasoning && String(meta.reasoning).trim());
  var hasSearches = !!(meta.searches && meta.searches.length);
  // P17·A 缓存用量：Provider 只报缓存字段、没报 total 时，面板也要出得来。
  var cacheInfo = (typeof ApiClient !== 'undefined' && ApiClient._cacheUsage) ? ApiClient._cacheUsage(meta.usage) : null;
  var hasUsage = !!(meta.usage && (meta.usage.total_tokens || meta.usage.prompt_tokens)) || !!(cacheInfo && (cacheInfo.cached || cacheInfo.creation));
  if (!hasReasoning && !hasSearches && !hasUsage) return null;

  var summary = [];
  if (hasReasoning) summary.push('🧠 思考');
  if (hasSearches) summary.push('🔍 搜索 × ' + meta.searches.length);
  if (hasUsage) summary.push('📊 ' + ((meta.usage && meta.usage.total_tokens) || '?'));
  if (cacheInfo && cacheInfo.cached) summary.push('💾 缓存 ' + cacheInfo.cached);

  var styles = React.useMemo(function () {
    return RN.StyleSheet.create({
      panel: {
        marginVertical: 6, backgroundColor: c.bgPanel || c.panel,
        borderWidth: 1, borderColor: c.border || c.hair,
        borderRadius: tk.radius.sm || 6
      },
      summary: { paddingHorizontal: 10, paddingVertical: 6 },
      summaryText: { fontSize: f.sm, color: c.accent || c.primary },
      arrow: { fontSize: f.xs, color: c.faint || c.muted },
      body: {
        paddingHorizontal: 10, paddingBottom: 10,
        borderTopWidth: 1, borderTopColor: c.border || c.hair
      },
      section: { marginTop: 8 },
      sectionTitle: {
        fontSize: f.xs, color: c.textMuted2 || c.muted,
        letterSpacing: 1, marginBottom: 4
      },
      thinkText: {
        color: c.textMuted || c.muted, fontSize: f.sm,
        lineHeight: Math.round(f.sm * 1.7), fontFamily: fonts.serif
      },
      search: {
        backgroundColor: c.bg || c.panel, borderRadius: tk.radius.sm || 6,
        paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8
      },
      searchHead: {
        flexDirection: 'row', alignItems: 'baseline',
        justifyContent: 'space-between', gap: 8, marginBottom: 6
      },
      searchKeyword: { flex: 1, color: c.text2 || c.text, fontSize: f.sm },
      searchMetaText: { flexShrink: 0, color: c.textMuted2 || c.muted, fontSize: f.xs },
      searchResults: {
        borderLeftWidth: 2, borderLeftColor: c.info || c.primary, paddingLeft: 8
      },
      result: { marginVertical: 6 },
      resultTitle: { color: c.text2 || c.text, fontSize: f.sm, lineHeight: Math.round(f.sm * 1.5) },
      resultUrl: {
        color: c.textMuted || c.muted, fontSize: f.xs,
        fontFamily: fonts.mono, lineHeight: Math.round(f.xs * 1.5)
      },
      resultSnippet: {
        color: c.textMuted || c.muted, fontSize: f.xs,
        lineHeight: Math.round(f.xs * 1.55), marginTop: 2
      },
      searchFail: { color: c.danger || c.seal, fontSize: f.xs, marginTop: 4 },
      usageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
      usageText: { color: c.textMuted || c.muted, fontSize: f.xs }
    });
  }, [tk]);

  return (
    <View style={styles.panel}>
      <TouchableOpacity style={styles.summary} activeOpacity={0.6}
        onPress={function () { setOpen(!open); }}>
        <Text style={styles.summaryText}>
          <Text style={styles.arrow}>{open ? '▼ ' : '▶ '}</Text>
          {summary.join(' · ')}
        </Text>
      </TouchableOpacity>
      {open ? (
        <View style={styles.body}>
          {hasReasoning ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{'🧠 AI 思考'}</Text>
              <Text style={styles.thinkText}>{String(meta.reasoning)}</Text>
            </View>
          ) : null}
          {hasSearches ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{'🔍 联网搜索'}</Text>
              {meta.searches.map(function (s, i) {
                var sm = '';
                if (s.backend) sm += s.backend + ' · ';
                if (s.count != null) sm += s.count + ' 条 · ';
                if (s.duration != null) sm += s.duration + 'ms';
                return (
                  <View key={i} style={styles.search}>
                    <View style={styles.searchHead}>
                      <Text style={styles.searchKeyword}>{s.keyword || '?'}</Text>
                      {sm ? <Text style={styles.searchMetaText}>{sm}</Text> : null}
                    </View>
                    {s.results && s.results.length ? (
                      <View style={styles.searchResults}>
                        {s.results.map(function (r, ri) {
                          return (
                            <View key={ri} style={styles.result}>
                              <Text style={styles.resultTitle}>{('' + (ri + 1)) + '. ' + (r.title || '(无标题)')}</Text>
                              {r.url ? <Text style={styles.resultUrl}>{r.url}</Text> : null}
                              {r.snippet ? <Text style={styles.resultSnippet}>{String(r.snippet).slice(0, 300)}</Text> : null}
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                    {!s.ok ? (
                      <Text style={styles.searchFail}>{'✕ ' + (s.reason || '搜索失败')}</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}
          {hasUsage ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{'📊 Token'}</Text>
              <View style={styles.usageRow}>
                {meta.usage.prompt_tokens != null
                  ? <Text style={styles.usageText}>{'输入 ' + meta.usage.prompt_tokens}</Text> : null}
                {meta.usage.completion_tokens != null
                  ? <Text style={styles.usageText}>{'输出 ' + meta.usage.completion_tokens}</Text> : null}
                {meta.usage.total_tokens != null
                  ? <Text style={styles.usageText}>{'总计 ' + meta.usage.total_tokens}</Text> : null}
                {cacheInfo && cacheInfo.cached
                  ? <Text style={styles.usageText}>{'缓存命中 ' + cacheInfo.cached}</Text> : null}
                {cacheInfo && cacheInfo.creation
                  ? <Text style={styles.usageText}>{'写缓存 ' + cacheInfo.creation}</Text> : null}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

module.exports = { ThinkingBlock: ThinkingBlock };