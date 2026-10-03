// ============================================================
// 世界书编辑器 · NPC（B 类，RN 组件）
// grounding：桌面 worldbook/npc_editor.js —— html()（:23-57，空态 :28、
//   条目横条 :32-40、工具栏 :51-54）、renderNpcBody()（:59-212，逐字段：
//   姓名/这是假名/真名列表/性别/身高/年龄/出生年/舞台权重 1-10 + 触发关键词/
//   能力/喜好/厌恶/描述/标签/所属势力/和其它 NPC 的关系/同人模式多时期）、
//   delNpc（:229-238 确认文案）、save（:285-290 回执文案）、reload（:291-295）。
// 数据层：engine/wb/npc.js（A 类纯逻辑，零 DOM）—— init/getNpcOptions/
//   selectNpc/addNpc/delNpc/set/setList/add|del|set RealName/Faction/
//   Relation/Period/setPeriodRange/save/reload。
// 适配点（相对桌面 DOM）：
//   - 桌面整块 innerHTML 重绘：RN 结构性操作（切换/增删条目与子项、假名开关、
//     保存、重读）后 refresh()；纯文本 set 不 refresh，避免输入法失焦。
//   - 桌面 <select> → Controls.SetSelect；checkbox → Controls.SetSwitchRow。
//   - data-icon 图标全部舍弃，仅留文字；删除确认 → Platform.ui.confirmAsync，
//     保存回执 WB.msg → StoryStore.pushToast。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var ScrollView = RN.ScrollView;
var TouchableOpacity = RN.TouchableOpacity;

var useTheme = require('../../../use_theme.js').useTheme;
var Controls = require('../../../components/settings/controls.js');
var StoryStore = require('../../../story_store.js');

var MOD = require('../../../../engine/wb/npc.js');

function NpcEditor(props) {
  var cardId = props.cardId;
  var tk = useTheme().tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var verState = React.useState(0);
  var ver = verState[0];
  var bump = verState[1];
  function refresh() { bump(function (v) { return v + 1; }); }

  React.useEffect(function () {
    MOD.init(cardId);
    refresh();
  }, [cardId]);

  function toast(msg, type) { StoryStore.pushToast(msg, { type: type || 'info', duration: 3000 }); }

  // 首渲时 MOD.init 尚未执行（它在 useEffect 里跑），_data 仍为 null。
  // 此刻若继续往下走会调用 getNpcOptions()，其内部 this._data.map 直接抛
  // TypeError（真机 2026-09-30 14:53 崩溃即此）。未初始化就不渲染，
  // 与 shopEditor.js:62 / currencyEditor.js:50 同一道防线。
  if (!MOD._data) return null;

  var data = MOD._data;
  var idx = MOD._curIdx || 0;
  if (idx >= data.length) idx = 0;
  var n = data[idx] || null;

  var npcOpts = [{ value: '', label: '-- 选对象 NPC --' }];
  MOD.getNpcOptions().forEach(function (o) { npcOpts.push({ value: o.id, label: o.name }); });
  var aliasTypeOpts = [{ value: 'real', label: '真名' }, { value: 'former', label: '曾用名' }];

  function txt(v) { return v == null ? '' : String(v); }
  function listText(a) { return (a || []).join(','); }
  function star(label) {
    return React.createElement(Text, null, label + ' ', React.createElement(Text, { style: { color: c.danger } }, '*'));
  }
  function smallInput(value, ph, onChange, width) {
    return React.createElement(
      View,
      { style: { width: width } },
      React.createElement(Controls.SetTextInput, { value: value, placeholder: ph, onChangeText: onChange })
    );
  }
  function delBtn(onPress) {
    return React.createElement(
      TouchableOpacity,
      { onPress: onPress, style: { paddingHorizontal: 6, paddingVertical: 6 } },
      React.createElement(Text, { style: { fontSize: f.sm, color: c.danger } }, '×')
    );
  }

  // ---- 结构性操作（桌面每步 reRender → RN refresh）----
  function onSelect(i) { MOD.selectNpc(i); refresh(); }
  function onAdd() { MOD.addNpc(); refresh(); }
  function onDel(i) {
    var nn = MOD._data[i] || {};
    Platform.ui.confirmAsync('删除 NPC「' + (nn.name || '未命名') + '」？').then(function (ok) {
      if (!ok) return;
      MOD.delNpc(i);
      refresh();
    });
  }
  function onSave() {
    var r = MOD.save();
    if (r && r.ok) toast('NPC 已保存', 'success');
    else toast((r && r.reason) || '保存失败', 'error');
    refresh();
  }
  function onReload() {
    Platform.ui.confirmAsync('放弃未保存修改，重新读取？').then(function (ok) {
      if (!ok) return;
      MOD.reload();
      refresh();
    });
  }
  function onAddRealName() { MOD.addRealName(idx); refresh(); }
  function onDelRealName(ri) { MOD.delRealName(idx, ri); refresh(); }
  function onAddFaction() { MOD.addFaction(idx); refresh(); }
  function onDelFaction(fi) { MOD.delFaction(idx, fi); refresh(); }
  function onAddRelation() { MOD.addRelation(idx); refresh(); }
  function onDelRelation(ri) { MOD.delRelation(idx, ri); refresh(); }
  function onAddPeriod() { MOD.addPeriod(idx); refresh(); }
  function onDelPeriod(pi) { MOD.delPeriod(idx, pi); refresh(); }

  // ---- 条目横条（html :32-40）----
  function tabBar() {
    return React.createElement(
      View,
      { style: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 } },
      data.map(function (it, i) {
        var on = i === idx;
        var w = it.weight != null ? it.weight : 5;
        var badge = w >= 8 ? ' ★' : (w <= 3 ? ' ·' : '');
        return React.createElement(
          View,
          {
            key: 'tab' + i,
            style: {
              flexDirection: 'row', alignItems: 'center', marginRight: 8, marginBottom: 8,
              borderWidth: 1, borderRadius: tk.radius.sm,
              borderColor: on ? c.primary : c.hairStrong,
              backgroundColor: on ? c.primary : c.bgCard
            }
          },
          React.createElement(
            TouchableOpacity,
            { onPress: function () { onSelect(i); }, style: { paddingHorizontal: 10, paddingVertical: 5 } },
            React.createElement(Text, { style: { fontSize: f.xs, color: on ? c.bgCard : c.ink } }, (it.name || '(未命名)') + badge)
          ),
          React.createElement(
            TouchableOpacity,
            { onPress: function () { onDel(i); }, style: { paddingHorizontal: 8, paddingVertical: 5 } },
            React.createElement(Text, { style: { fontSize: f.xs, color: on ? c.bgCard : c.danger } }, '×')
          )
        );
      })
    );
  }

  // ---- 真名 / 曾用名（renderNpcBody :62-78）----
  function aliasPanel() {
    return React.createElement(
      View,
      { style: { marginTop: 8, padding: 10, backgroundColor: c.bgCard, borderRadius: tk.radius.sm, borderWidth: 1, borderColor: c.hair } },
      React.createElement(Controls.SetNote, { first: true }, '真名 / 曾用名'),
      (n.realNames || []).map(function (rn, ri) {
        return React.createElement(
          View,
          { key: 'rn' + ri, style: { flexDirection: 'row', gap: 6, marginBottom: 6, alignItems: 'center' } },
          React.createElement(
            View,
            { style: { flex: 1 } },
            React.createElement(Controls.SetTextInput, {
              value: txt(rn.name), placeholder: '名字',
              onChangeText: function (v) { MOD.setRealName(idx, ri, 'name', v); }
            })
          ),
          React.createElement(
            View,
            { style: { width: 100 } },
            React.createElement(Controls.SetSelect, {
              value: rn.type || 'real', options: aliasTypeOpts,
              onChange: function (v) { MOD.setRealName(idx, ri, 'type', v); }
            })
          ),
          delBtn(function () { onDelRealName(ri); })
        );
      }),
      React.createElement(
        View,
        { style: { marginTop: 4 } },
        React.createElement(Controls.SetButton, { label: '+ 添加一条', onPress: onAddRealName })
      )
    );
  }

  // ---- 所属势力（:80-90 / :192-196）----
  function factionCard() {
    var arr = n.factions || [];
    return React.createElement(
      Controls.SetCard,
      { title: '所属势力' },
      arr.length ? null : React.createElement(Controls.SetNote, { first: true }, '（暂无）'),
      arr.map(function (fc, fi) {
        return React.createElement(
          View,
          { key: 'fc' + fi, style: { flexDirection: 'row', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' } },
          React.createElement(
            View,
            { style: { flex: 1, minWidth: 100 } },
            React.createElement(Controls.SetTextInput, {
              value: txt(fc.factionId), placeholder: '势力 id',
              onChangeText: function (v) { MOD.setFaction(idx, fi, 'factionId', v); }
            })
          ),
          React.createElement(
            View,
            { style: { flex: 1, minWidth: 120 } },
            React.createElement(Controls.SetTextInput, {
              value: txt(fc.relation), placeholder: '关系（正式/卧底/叛逃…）',
              onChangeText: function (v) { MOD.setFaction(idx, fi, 'relation', v); }
            })
          ),
          React.createElement(
            View,
            { style: { flex: 1, minWidth: 100 } },
            React.createElement(Controls.SetTextInput, {
              value: txt(fc.attitude), placeholder: '态度',
              onChangeText: function (v) { MOD.setFaction(idx, fi, 'attitude', v); }
            })
          ),
          delBtn(function () { onDelFaction(fi); })
        );
      }),
      React.createElement(
        View,
        { style: { marginTop: 4 } },
        React.createElement(Controls.SetButton, { label: '+ 添加势力归属', onPress: onAddFaction })
      )
    );
  }

  // ---- 和其它 NPC 的关系（:92-108 / :198-203）----
  function relationCard() {
    var arr = n.relations || [];
    return React.createElement(
      Controls.SetCard,
      { title: '和其它 NPC 的关系' },
      React.createElement(Controls.SetNote, { first: true }, '这是 NPC↔NPC 关系，不是玩家和 NPC 的关系。'),
      arr.length ? null : React.createElement(Controls.SetNote, { first: false }, '（暂无）'),
      arr.map(function (r, ri) {
        return React.createElement(
          View,
          { key: 'rel' + ri, style: { marginBottom: 8 } },
          React.createElement(
            View,
            { style: { flexDirection: 'row', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' } },
            React.createElement(
              View,
              { style: { flex: 1, minWidth: 120 } },
              React.createElement(Controls.SetSelect, {
                value: r.targetId, options: npcOpts,
                onChange: function (v) { MOD.setRelation(idx, ri, 'targetId', v); }
              })
            ),
            React.createElement(
              View,
              { style: { flex: 1, minWidth: 110 } },
              React.createElement(Controls.SetTextInput, {
                value: txt(r.relation), placeholder: '关系名',
                onChangeText: function (v) { MOD.setRelation(idx, ri, 'relation', v); }
              })
            ),
            React.createElement(
              View,
              { style: { flex: 1, minWidth: 100 } },
              React.createElement(Controls.SetTextInput, {
                value: txt(r.attitude), placeholder: '态度',
                onChangeText: function (v) { MOD.setRelation(idx, ri, 'attitude', v); }
              })
            ),
            delBtn(function () { onDelRelation(ri); })
          ),
          React.createElement(
            View,
            null,
            React.createElement(Controls.SetTextInput, {
              value: txt(r.events), placeholder: '两人之间才会发生的事（可选）',
              onChangeText: function (v) { MOD.setRelation(idx, ri, 'events', v); }
            })
          )
        );
      }),
      React.createElement(
        View,
        { style: { marginTop: 4 } },
        React.createElement(Controls.SetButton, { label: '+ 添加关系', onPress: onAddRelation })
      )
    );
  }

  // ---- 同人模式多时期（:110-129 / :205-210）----
  function periodCard() {
    var arr = n.periods || [];
    return React.createElement(
      Controls.SetCard,
      { title: '同人模式多时期（可选）' },
      React.createElement(Controls.SetNote, { first: true }, '如果这个 NPC 随时间线有不同形态，在这里写。'),
      arr.length ? null : React.createElement(Controls.SetNote, { first: false }, '（暂无）'),
      arr.map(function (p, pi) {
        var pdata = typeof p.data === 'string' ? p.data : JSON.stringify(p.data || '');
        var tr = (p.timeRange && p.timeRange[0] != null) ? p.timeRange[0] : '';
        var tr2 = (p.timeRange && p.timeRange[1] != null) ? p.timeRange[1] : '';
        return React.createElement(
          View,
          { key: 'pd' + pi, style: { borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm, padding: 8, marginBottom: 8 } },
          React.createElement(
            View,
            { style: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 6 } },
            React.createElement(
              View,
              { style: { flex: 1 } },
              React.createElement(Controls.SetTextInput, {
                value: txt(p.periodName), placeholder: '时期名',
                onChangeText: function (v) { MOD.setPeriod(idx, pi, 'periodName', v); }
              })
            ),
            delBtn(function () { onDelPeriod(pi); })
          ),
          React.createElement(
            View,
            { style: { flexDirection: 'row', gap: 6, marginBottom: 6 } },
            React.createElement(
              View,
              { style: { flex: 1 } },
              React.createElement(Controls.SetTextInput, {
                value: txt(tr), placeholder: '起始',
                onChangeText: function (v) { MOD.setPeriodRange(idx, pi, 0, v); }
              })
            ),
            React.createElement(
              View,
              { style: { flex: 1 } },
              React.createElement(Controls.SetTextInput, {
                value: txt(tr2), placeholder: '结束',
                onChangeText: function (v) { MOD.setPeriodRange(idx, pi, 1, v); }
              })
            )
          ),
          React.createElement(Controls.SetTextInput, {
            value: txt(pdata), placeholder: '该时期的差异描述', multiline: true, rows: 2,
            onChangeText: function (v) { MOD.setPeriod(idx, pi, 'data', v); }
          })
        );
      }),
      React.createElement(
        View,
        { style: { marginTop: 4 } },
        React.createElement(Controls.SetButton, { label: '+ 添加时期', onPress: onAddPeriod })
      )
    );
  }

  // ---- 主表单（renderNpcBody :134-211）----
  function body() {
    var w = n.weight != null ? n.weight : 5;
    return React.createElement(
      View,
      null,
      // 基础
      React.createElement(
        Controls.SetCard,
        { title: null },
        React.createElement(
          Controls.SetRow,
          { label: star('姓名') },
          smallInput(txt(n.name), '显示名', function (v) { MOD.set(idx, 'name', v); }, 180)
        ),
        React.createElement(Controls.SetSwitchRow, {
          label: '这是假名', value: !!n.isAlias,
          onValueChange: function (v) { MOD.set(idx, 'isAlias', v); refresh(); }
        }),
        n.isAlias ? aliasPanel() : null,
        React.createElement(
          Controls.SetRow,
          { label: '性别' },
          smallInput(txt(n.gender), '男/女/其他', function (v) { MOD.set(idx, 'gender', v); }, 180)
        ),
        React.createElement(
          Controls.SetRow,
          { label: '身高' },
          smallInput(txt(n.height), '例：165cm', function (v) { MOD.set(idx, 'height', v); }, 180)
        ),
        React.createElement(
          Controls.SetRow,
          { label: '年龄' },
          smallInput(txt(n.age), '数字或描述', function (v) { MOD.set(idx, 'age', v); }, 180)
        ),
        React.createElement(
          Controls.SetRow,
          { label: '出生年' },
          smallInput(txt(n.born), '例：1980', function (v) { MOD.set(idx, 'born', v === '' ? null : Number(v)); }, 180)
        )
      ),
      // 舞台权重
      React.createElement(
        Controls.SetCard,
        { title: '舞台权重' },
        React.createElement(Controls.SetNote, { first: true }, '决定这个 NPC 出场的概率。加权随机抽取，不是越高越必出。'),
        React.createElement(Controls.SetStepper, {
          label: '后台权重（1-10）', value: w, min: 1, max: 10, step: 1,
          onChange: function (v) { MOD.set(idx, 'weight', v); }
        }),
        React.createElement(Controls.SetNote, { first: false }, '1-3 路人 · 4-6 配角 · 7-8 重要 · 9-10 主角级'),
        React.createElement(
          Controls.SetRow,
          { label: '触发关键词（逗号分隔）' },
          smallInput(listText(n.keywords), '魔法, 魁地奇, 霍格沃茨', function (v) { MOD.setList(idx, 'keywords', v); }, 200)
        ),
        React.createElement(Controls.SetNote, { first: false }, '剧情里提到这些词时，该 NPC 出场速度加快。最多 8 条。')
      ),
      // 能力 / 喜好 / 厌恶 / 描述 / 标签
      React.createElement(
        Controls.SetCard,
        { title: null },
        React.createElement(
          Controls.SetRow,
          { label: '能力（逗号分隔）' },
          smallInput(listText(n.abilities), '星辰灵力, 剑术', function (v) { MOD.setList(idx, 'abilities', v); }, 200)
        ),
        React.createElement(
          Controls.SetRow,
          { label: '喜好（逗号分隔）' },
          smallInput(listText(n.likes), '星空, 古籍', function (v) { MOD.setList(idx, 'likes', v); }, 200)
        ),
        React.createElement(
          Controls.SetRow,
          { label: '厌恶（逗号分隔）' },
          smallInput(listText(n.dislikes), '欺诈, 喧闹', function (v) { MOD.setList(idx, 'dislikes', v); }, 200)
        ),
        React.createElement(
          Controls.SetRow,
          { label: '描述' },
          React.createElement(
            View,
            { style: { width: 200 } },
            React.createElement(Controls.SetTextInput, {
              value: txt(n.desc), placeholder: '一句话描述', multiline: true, rows: 2,
              onChangeText: function (v) { MOD.set(idx, 'desc', v); }
            })
          )
        ),
        React.createElement(
          Controls.SetRow,
          { label: '标签（逗号分隔）' },
          smallInput(listText(n.tags), '学院, 星辰系', function (v) { MOD.setList(idx, 'tags', v); }, 200)
        )
      ),
      factionCard(),
      relationCard(),
      periodCard()
    );
  }

  // 空态（html :27-30）：只有提示 + 新建按钮，无横条、无工具栏
  if (!data.length) {
    return React.createElement(
      ScrollView,
      { style: { flex: 1 }, contentContainerStyle: { paddingBottom: 40 } },
      React.createElement(
        View,
        { style: { paddingVertical: 20, alignItems: 'center' } },
        React.createElement(Text, { style: { fontSize: f.sm, color: c.muted, textAlign: 'center' } }, '还没有 NPC。点下方按钮新建一个。')
      ),
      React.createElement(Controls.SetButton, { label: '+ 新建 NPC', onPress: onAdd })
    );
  }

  return React.createElement(
    ScrollView,
    { style: { flex: 1 }, contentContainerStyle: { paddingBottom: 40 } },
    tabBar(),
    React.createElement(
      View,
      { style: { marginBottom: 10 } },
      React.createElement(Controls.SetButton, { label: '+ 新建 NPC', onPress: onAdd })
    ),
    n ? body() : React.createElement(Text, { style: { fontSize: f.sm, color: c.muted } }, '（空）'),
    React.createElement(
      View,
      { style: { flexDirection: 'row', gap: 10, marginTop: 16 } },
      React.createElement(Controls.SetButton, { label: '保存 NPC', onPress: onSave, kind: 'primary' }),
      React.createElement(Controls.SetButton, { label: '↺ 重新读取', onPress: onReload })
    )
  );
}

module.exports = { NpcEditor: NpcEditor };
