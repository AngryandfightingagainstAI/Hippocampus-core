// ============================================================
// 战役 4 · 批次 4-5a：设置页 · 通用 tab（B 类）
// grounding：ui_settings.js renderGeneralInto（L236-416）/ saveGeneral
//   （L418-459，一次写全）。
// 范围（用户裁决 5）：
//   做：日志系统 / 结局系统 / 节点系统 / 产出物系统 / AI 强硬度 /
//       思考过程 / 提议校验 / NPC 推演 / 外观（主题网格+字号档+字体）
//   已落地（原缓办）：我的主题 7 槽位 + 主题包导入导出（ColorTab 承接，smoke 双覆盖）
//   背景卡（4-6c 实装）：本地选图（image-picker → 2MB 预检 →
//     compressFile 1280/0.8/0.55/512KB → dataURL 落库，裁决 3：RN 无
//     FileReader，偏离 Electron 原图直存）/ 外链 URL 行内输入（裁决 5）
//     / 透明度即时写 / 卡内缩略预览（裁决 4：全局背景渲染层 H2 已实装）。
// 外观三件即时生效（Electron pickTheme/pickFontScale 同语义）；其余
// 字段本地暂存，保存按钮一次 setGlobal 全写（数据层 settings_model）。
// 字号/字体走 useTheme.setFontScale/setFont 包装（4-5a 增量，触发
// rev 刷新，否则 tokens 不重算——grounding 见 use_theme.js 注释）。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var ScrollView = RN.ScrollView;

var useTheme = require('../../use_theme.js').useTheme;
var Model = require('../../settings_model.js');
var Controls = require('../../components/settings/controls.js');
var ColorTab = require('./ColorTab.js').ColorTab;

// P72·W10：文风预设（与桌面 ui_settings.js 的五个按钮逐字一致）
var STYLE_PRESETS = {
  '冷峻克制': '用冷峻、克制的笔法：短句为主，少形容词，情绪靠动作与环境细节透出，不写内心独白。',
  '古典白描': '用古典白描的笔法：以动作、器物、光影写场景，语言干净不堆砌，避免现代口语与现代词。',
  '黑色幽默': '用黑色幽默的笔法：荒诞与冷静并置，苦处用轻描淡写带过，别解释笑点。',
  '快节奏短句': '节奏要快：多用短句与对话推进，少铺陈环境，每段落都要有新信息或新动作。',
  '日系轻小说': '用日系轻小说的笔法：对话密度高、语气鲜活，适度使用拟声与心理碎念，但不要长篇说理。'
};

function GeneralTab() {
  var themeApi = useTheme();
  var tk = themeApi.tokens;
  var c = tk.colors;

  // P1-B：自定义配色子页开关（桌面取色器弹窗 → RN 子页）
  var colorPageState = React.useState(false);
  var showColorPage = colorPageState[0];
  var setShowColorPage = colorPageState[1];

  var st = React.useState(function () { return Model.loadGeneralState(); });
  var gs = st[0];
  var setGs = st[1];

  function setState(patch) {
    setGs(function (prev) { return Object.assign({}, prev, patch); });
  }

  function setLogging(key, v) {
    setGs(function (prev) {
      var next = Object.assign({}, prev);
      next.logging = Object.assign({}, prev.logging);
      next.logging[key] = v;
      return next;
    });
  }

  function setThinking(key, v) {
    setGs(function (prev) {
      var next = Object.assign({}, prev);
      next.thinking = Object.assign({}, prev.thinking);
      next.thinking[key] = v;
      return next;
    });
  }

  function setProposalCheck(key, v) {
    setGs(function (prev) {
      var next = Object.assign({}, prev);
      next.proposalCheck = Object.assign({}, prev.proposalCheck);
      next.proposalCheck[key] = v;
      return next;
    });
  }

  function setNpcDeduction(key, v) {
    setGs(function (prev) {
      var next = Object.assign({}, prev);
      next.npcDeduction = Object.assign({}, prev.npcDeduction);
      next.npcDeduction[key] = v;
      return next;
    });
  }

  function save() {
    Model.saveGeneralState(gs);
    Platform.ui.toast('已保存', { type: 'success' });
  }

  // ---- 背景（4-6c）----
  var bgUrlState = React.useState('');
  var bgUrl = bgUrlState[0];
  var setBgUrl = bgUrlState[1];
  var pickState = React.useState(false);
  var picking = pickState[0];
  var setPicking = pickState[1];

  // tokens.background：{ image: {uri}|null, opacity: number, filter: null }
  var bg = tk.background || {};
  var bgImage = bg.image && bg.image.uri ? bg.image.uri : null;
  var bgOpacity = (typeof bg.opacity === 'number') ? bg.opacity : 1;

  function bgToast(msg, type) {
    Platform.ui.toast(msg, { type: type });
  }

  function pickImage() {
    if (picking) return; // 防重入
    var picker;
    try {
      picker = require('react-native-image-picker');
    } catch (eReq) {
      bgToast('图片库不可用', 'error');
      return;
    }
    setPicking(true);
    // 批次 E（2026-09-28）：压缩前移到 picker 原生实现（maxWidth/maxHeight/quality
    // 在系统选择器内做尺寸 + JPEG 质量压缩，零第三方运行时依赖）。
    // includeBase64: true 让 asset.base64 由 picker 直接产出，compressFile
    // 仅做 dataURL 组装 + bytes 估算 + oversize 标记（不再有第二趟可压）。
    picker.launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, maxWidth: 1280, maxHeight: 1280, quality: 0.8, includeBase64: true }, function (resp) {
      setPicking(false);
      if (!resp || resp.didCancel) return;
      if (resp.errorCode) { bgToast('图片读取失败', 'error'); return; }
      var asset = (resp.assets && resp.assets[0]) || null;
      if (!asset || !asset.uri) { bgToast('图片读取失败', 'error'); return; }
      // 2MB 选图预检（同 Electron ui.js L76 pickBackgroundImage）
      if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024) {
        bgToast('图片超过 2MB，请压缩后再用', 'warn');
        return;
      }
      Platform.image.compressFile(asset, {
        maxSize: 1280, quality: 0.8, fallbackQuality: 0.55, maxBytes: 512 * 1024
      }).then(function (r) {
        // 批次 E：compressFile 不再做真压缩，oversize 标记是 picker 原生压缩
        // 后仍超 maxBytes 的边界情况。决策：仍落库 + toast warn 提示「图片偏大」，
        // 让用户知情但功能不阻塞（与 Electron fallbackQuality 二趟后无条件
        // resolve 落库的语义对齐；picker 已在系统层做 1280/0.8 压缩，正常图
        // 通常 < 512KB，oversize 是极复杂纹理图的边界情况）。
        themeApi.setBackground({ image: r.src });
        if (r.oversize) {
          bgToast('图片偏大（' + Math.round(r.bytes / 1024) + 'KB），已落库但可能影响加载', 'warn');
        } else {
          bgToast('背景已更新', 'success');
        }
      }, function (e) {
        bgToast('图片读取失败：' + ((e && e.message) || e), 'error');
      });
    });
  }

  function applyUrl() {
    var u = String(bgUrl || '').trim();
    if (!u) return;
    themeApi.setBackground({ image: u });
    setBgUrl('');
    bgToast('背景已更新', 'success');
  }

  function clearBg() {
    themeApi.clearBackground();
    bgToast('背景已清除', 'success');
  }

  // ---- 外观数据源（Theme API，双仓共享模块）----
  var themeOptions = [];
  var fontScaleOptions = [];
  var sansOptions = [];
  var serifOptions = [];
  try {
    themeOptions = Theme.listBuiltins().map(function (t) {
      return { value: t.id, label: t.name };
    });
    fontScaleOptions = (Theme.FONT_SCALES || []).map(function (fs) {
      return { value: fs.value, label: fs.name };
    });
    sansOptions = ((Theme.FONT_OPTIONS || {}).sans || []).map(function (o) {
      return { value: o.id, label: o.name };
    });
    serifOptions = ((Theme.FONT_OPTIONS || {}).serif || []).map(function (o) {
      return { value: o.id, label: o.name };
    });
  } catch (e) { console.warn('[GeneralTab] 外观选项加载失败：', e); }

  var curScale = (themeApi.theme && themeApi.theme.fontScale != null) ? themeApi.theme.fontScale : 1;
  var curSans = '';
  var curSerif = '';
  try {
    curSans = Theme.getFontId('sans');
    curSerif = Theme.getFontId('serif');
  } catch (e2) { console.warn('[GeneralTab] 字体读取失败：', e2); }

  // 校验/推演模型下拉（ApiManager bootstrap 已挂载）
  var profileOptions = [{ value: null, label: '跟随主模型' }];
  try {
    var all = globalThis.ApiManager.getAll();
    (all.profiles || []).forEach(function (p) {
      profileOptions.push({ value: p.id, label: (p.name || p.id) + ' · ' + (p.model || '') });
    });
  } catch (e3) { console.warn('[GeneralTab] 校验/推演模型清单加载失败：', e3); }

  // P1-B：配色子页（替代桌面弹窗形态）
  if (showColorPage) {
    return React.createElement(
      View,
      { style: { flex: 1 } },
      React.createElement(
        View,
        { style: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 } },
        React.createElement(Controls.SetButton, {
          label: '← 返回',
          onPress: function () { setShowColorPage(false); }
        })
      ),
      React.createElement(ColorTab, null)
    );
  }

  return React.createElement(
    ScrollView, { keyboardShouldPersistTaps: 'handled', style: { flex: 1 } },
    React.createElement(
      View,
      { style: { paddingBottom: 24 } },

      React.createElement(
        Controls.SetCard,
        { title: '日志系统' },
        React.createElement(Controls.SetSwitchRow, {
          label: '启用日志压缩',
          desc: '省 token',
          value: gs.logging.enabled,
          onValueChange: function (v) { setLogging('enabled', v); }
        }),
        React.createElement(Controls.SetRow, { label: '滑动窗口保留轮数' },
          React.createElement(Controls.SetStepper, {
            value: gs.logging.windowRounds, min: 4, max: 30, step: 1,
            onChange: function (v) { setLogging('windowRounds', v); }
          })),
        React.createElement(Controls.SetRow, { label: '注入日志摘要条数' },
          React.createElement(Controls.SetStepper, {
            value: gs.logging.summaryInject, min: 1, max: 10, step: 1,
            onChange: function (v) { setLogging('summaryInject', v); }
          }))
      ),

      React.createElement(
        Controls.SetCard,
        { title: '结局系统' },
        React.createElement(Controls.SetSwitchRow, {
          label: '启用结局系统',
          desc: '关闭后 AI 完全看不到结局相关内容，也不会触发任何结局。（卡带自身定义 worldbook.endings 非空才会生效）',
          value: gs.endingsEnabled,
          onValueChange: function (v) { setState({ endingsEnabled: v }); }
        })
      ),

      React.createElement(
        Controls.SetCard,
        { title: '节点系统' },
        React.createElement(Controls.SetSwitchRow, {
          label: '启用节点系统',
          desc: '默认关闭。开启后 AI 会按卡带的 storyNodes 推进主线，不能跳过必经节点。（卡带自身定义 worldbook.storyNodes 非空才会生效）',
          value: gs.nodesEnabled,
          onValueChange: function (v) { setState({ nodesEnabled: v }); }
        })
      ),

      React.createElement(
        Controls.SetCard,
        { title: '产出物系统' },
        React.createElement(Controls.SetSwitchRow, {
          label: '启用产出物系统',
          desc: '默认关。开启后 AI 可用 output_publish / output_stir / output_settle / query_outputs，玩家发表的作品会在世界中发酵。',
          value: gs.outputsEnabled,
          onValueChange: function (v) { setState({ outputsEnabled: v }); }
        })
      ),

      React.createElement(
        Controls.SetCard,
        { title: '后台进程' },
        React.createElement(Controls.SetSwitchRow, {
          label: '启用后台进程',
          desc: '默认开。开启后引擎每隔几轮按权重挑一条「世界自己在动」的进程交给 AI 带出（卡带可用 worldbook.background.processes 自定义权重与间隔）。',
          value: gs.backgroundEnabled,
          onValueChange: function (v) { setState({ backgroundEnabled: v }); }
        })
      ),

      React.createElement(
        Controls.SetCard,
        { title: 'AI 强硬度' },
        React.createElement(
          Controls.SetNote,
          { first: true },
          '决定 AI 判定的严格程度。跑团党推荐"标准"或"硬核"。'
        ),
        React.createElement(Controls.SetSelect, {
          label: '判定严格度',
          value: gs.strictness,
          options: Model.STRICTNESS_OPTIONS,
          onChange: function (v) { setState({ strictness: v }); }
        })
      ),

      React.createElement(
        Controls.SetCard,
        { title: '长程记忆与文风' },
        React.createElement(
          Controls.SetNote,
          { first: true },
          '这三块会写进系统提示的「一局不变」区（吃前缀缓存），留空就完全不注入。修改后从下一轮开始生效。'
        ),
        React.createElement(Controls.SetTextInput, {
          label: '剧情要点（常驻，≤300 字）',
          multiline: true,
          rows: 3,
          value: gs.storyEssentials,
          placeholder: '例：主角是旧港的船匠，欠了一笔赌债；当前目标是找到失踪的妹妹。',
          onChangeText: function (v) { setState({ storyEssentials: String(v || '').slice(0, 300) }); }
        }),
        React.createElement(Controls.SetTextInput, {
          label: '作者注（叙述要求，≤300 字）',
          multiline: true,
          rows: 3,
          value: gs.storyAuthorNote,
          placeholder: '例：别写内心独白；每轮末尾给 3 个选项；不要替玩家做决定。',
          onChangeText: function (v) { setState({ storyAuthorNote: String(v || '').slice(0, 300) }); }
        }),
        React.createElement(Controls.SetSwitchRow, {
          label: '关闭自动摘要',
          value: !!gs.storySummaryOff,
          onValueChange: function (v) { setState({ storySummaryOff: !!v }); }
        }),
        React.createElement(Controls.SetStepper, {
          label: '自动摘要频率（每 N 轮）',
          value: gs.storySummaryEvery,
          min: 2,
          max: 40,
          step: 1,
          onChange: function (v) { setState({ storySummaryEvery: v }); }
        }),
        React.createElement(Controls.SetTextInput, {
          label: '文风要求（≤500 字）',
          multiline: true,
          rows: 3,
          value: gs.styleInstruction,
          placeholder: '例：用冷峻、克制的笔法：短句为主，少形容词。',
          onChangeText: function (v) { setState({ styleInstruction: String(v || '').slice(0, 500) }); }
        }),
        React.createElement(Controls.SetChips, {
          label: '文风预设（点一下填入）',
          options: [
            { value: '冷峻克制', label: '冷峻克制' },
            { value: '古典白描', label: '古典白描' },
            { value: '黑色幽默', label: '黑色幽默' },
            { value: '快节奏短句', label: '快节奏短句' },
            { value: '日系轻小说', label: '日系轻小说' }
          ],
          value: '',
          onChange: function (v) { setState({ styleInstruction: String(STYLE_PRESETS[v] || '').slice(0, 500) }); }
        })
      ),

      React.createElement(
        Controls.SetCard,
        { title: '文风闸门（反说教）' },
        React.createElement(
          Controls.SetNote,
          { first: true },
          'AI 容易在段落里冒出「记住……」「原来……才是最重要的」这类说教句。开启后本轮正文会被打分，命中重说教就自动重写一次（被否决的版本进旧分支，可切回）。检查是本机启发式，不额外调模型。'
        ),
        React.createElement(Controls.SetSelect, {
          label: '处理方式',
          value: gs.styleGuard,
          options: [
            { value: 'auto', label: '自动重写一次（推荐）' },
            { value: 'warn', label: '只提示，不动正文' },
            { value: 'off', label: '关闭检查' }
          ],
          onChange: function (v) { setState({ styleGuard: v }); }
        })
      ),

      React.createElement(
        Controls.SetCard,
        { title: '思考过程展示' },
        React.createElement(Controls.SetSwitchRow, {
          label: '显示 AI 思维链（需要模型支持）',
          value: gs.thinking.showReasoning,
          onValueChange: function (v) { setThinking('showReasoning', v); }
        }),
        React.createElement(Controls.SetSwitchRow, {
          label: '显示搜索过程',
          value: gs.thinking.showSearch,
          onValueChange: function (v) { setThinking('showSearch', v); }
        }),
        React.createElement(Controls.SetSwitchRow, {
          label: '显示 Token 统计',
          value: gs.thinking.showUsage,
          onValueChange: function (v) { setThinking('showUsage', v); }
        })
      ),

      React.createElement(
        Controls.SetCard,
        { title: '提议校验' },
        React.createElement(
          Controls.SetNote,
          { first: true },
          '开启后，变更提议在玩家确认时会让 AI 再判断一次"世界变了之后这条还成不成立"。会消耗额外 token。默认关闭。'
        ),
        React.createElement(Controls.SetSwitchRow, {
          label: '启用提议校验',
          value: gs.proposalCheck.enabled,
          onValueChange: function (v) { setProposalCheck('enabled', v); }
        }),
        React.createElement(Controls.SetSelect, {
          label: '校验用模型',
          value: gs.proposalCheck.profileId,
          options: profileOptions,
          onChange: function (v) { setProposalCheck('profileId', v); }
        }),
        React.createElement(Controls.SetRow, { label: '提议创建后经过多少轮才触发校验' },
          React.createElement(Controls.SetStepper, {
            value: gs.proposalCheck.triggerAfterRounds, min: 1, max: 20, step: 1,
            onChange: function (v) { setProposalCheck('triggerAfterRounds', v); }
          }))
      ),

      React.createElement(
        Controls.SetCard,
        { title: 'NPC 推演' },
        React.createElement(
          Controls.SetNote,
          { first: true },
          '开启后，AI 可对"某个 NPC 是否可能知道某件事"发起推演，由引擎 AI 补全推理链；玩家在人物面板确认后才登记为 NPC 知识。会消耗额外 token。默认关闭。'
        ),
        React.createElement(Controls.SetSwitchRow, {
          label: '启用 NPC 推演',
          value: gs.npcDeduction.enabled,
          onValueChange: function (v) { setNpcDeduction('enabled', v); }
        }),
        React.createElement(Controls.SetSelect, {
          label: '推演用模型',
          value: gs.npcDeduction.profileId,
          options: profileOptions,
          onChange: function (v) { setNpcDeduction('profileId', v); }
        }),
        React.createElement(Controls.SetSwitchRow, {
          label: '自动运行（AI 发起后立即推演；关闭时由玩家在人物面板点"重试"触发）',
          value: gs.npcDeduction.autoTrigger,
          onValueChange: function (v) { setNpcDeduction('autoTrigger', v); }
        })
      ),

      React.createElement(
        Controls.SetCard,
        { title: '外观' },
        React.createElement(
          Controls.SetNote,
          { first: true },
          '选一个预设主题，改完立即生效。'
        ),
        React.createElement(Controls.SetChips, {
          options: themeOptions,
          value: themeApi.currentThemeId,
          onChange: function (id) { themeApi.setTheme(id); }
        }),
        React.createElement(
          Controls.SetNote,
          null,
          '字号'
        ),
        React.createElement(Controls.SetChips, {
          options: fontScaleOptions,
          value: curScale,
          onChange: function (v) { themeApi.setFontScale(v); }
        }),
        // P1-B：自定义配色入口（桌面 ui_theme.js:41 openColorPicker 同语义）
        React.createElement(
          View,
          { style: { marginTop: 8 } },
          React.createElement(Controls.SetButton, {
            label: '自定义配色 / 我的主题',
            onPress: function () { setShowColorPage(true); }
          })
        )
      ),

      React.createElement(
        Controls.SetCard,
        { title: '字体' },
        React.createElement(
          Controls.SetNote,
          { first: true },
          '界面字体用于按钮和标题，正文字体用于剧情。RN 侧使用离线系统栈。'
        ),
        React.createElement(Controls.SetSelect, {
          label: '界面字体',
          value: curSans,
          options: sansOptions,
          onChange: function (id) { themeApi.setFont('sans', id); }
        }),
        React.createElement(Controls.SetSelect, {
          label: '正文字体',
          value: curSerif,
          options: serifOptions,
          onChange: function (id) { themeApi.setFont('serif', id); }
        })
      ),

      React.createElement(
        Controls.SetCard,
        { title: '背景' },
        React.createElement(
          Controls.SetNote,
          { first: true },
          '本地图片或外链 URL，改完立即生效。'
        ),
        // 缩略预览（裁决 4：全局背景渲染层 H2 已实装，本批卡内预览闭环）
        bgImage ? React.createElement(RN.Image, {
          source: { uri: bgImage },
          resizeMode: 'cover',
          style: {
            width: '100%', height: 140,
            borderRadius: tk.radius.sm, marginBottom: 10,
            backgroundColor: c.hair
          }
        }) : null,
        React.createElement(
          Controls.SetRow,
          { label: '本地图片' },
          React.createElement(Controls.SetButton, {
            label: picking ? '选择中…' : '选择图片',
            onPress: pickImage
          })
        ),
        React.createElement(Controls.SetNote, null, '外链 URL'),
        React.createElement(
          View,
          { style: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 4 } },
          React.createElement(
            View,
            { style: { flex: 1 } },
            React.createElement(Controls.SetTextInput, {
              value: bgUrl,
              onChangeText: setBgUrl,
              placeholder: 'https://…'
            })
          ),
          React.createElement(Controls.SetButton, { label: '应用', onPress: applyUrl })
        ),
        React.createElement(
          Controls.SetRow,
          { label: '透明度' },
          React.createElement(Controls.SetStepper, {
            value: bgOpacity, min: 0, max: 1, step: 0.05,
            format: function (v) { return Number(v).toFixed(2); },
            onChange: function (v) { themeApi.setBackground({ opacity: v }); }
          })
        ),
        bgImage ? React.createElement(
          View,
          { style: { marginTop: 4 } },
          React.createElement(Controls.SetButton, {
            label: '清除背景', kind: 'danger', onPress: clearBg
          })
        ) : null
      ),

      React.createElement(
        View,
        { style: { marginTop: 4 } },
        React.createElement(Controls.SetButton, { label: '保存', onPress: save, kind: 'primary' })
      )
    )
  );
}

module.exports = { GeneralTab: GeneralTab };
