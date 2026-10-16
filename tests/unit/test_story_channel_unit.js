// ============================================================
// P54·第10条 补测：外部 AI 通道的「可测缝」（L 组）
//   L1 _channelKind：老档没有 storyChannel 键 ⇒ direct（fail-open，老存档行为逐字不变）
//   L2 _channelKind：设置写着 external 但平台没实装契约 ⇒ 回落 direct（不能把用户卡死）
//   L3 _channelKind：设置 external 且平台已实装 ⇒ external
//   L4 _channelKind：Storage.getGlobal 抛错 ⇒ direct，且异常不外抛（不炸主循环）
//   L5 _channelKind：只认严格字面量 'external'（大小写变体 / 未知值一律 direct）
//   L6 _externalReply：取消·空·纯空白 ⇒ null；其余 String(...) 原样（不 trim，与旧 content 口径一致）
//   L7 源码守卫：通道裁决只有一个真源 _channelKind()，旧内联形态不许复活
//   L8 手机侧入口守卫：设置页有「对话通道」、落盘 fail-open、契约已登记且手机平台已转发
//
// 存在理由：这条路径跨「设置落盘 → 引擎每轮现读 → 平台弹浮层」三层，任何一层写错都只会
//   表现为真机上「点了没反应」，smoke 抓不到（手机上此前对 storyChannel 零断言）。
//   把裁决与归一化抽成两个小函数夹在这里，另加词法守卫钉住调用点。
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./_harness');

// 内存 VFS 补齐 logger.js 需要的目录级接口（story.js 间接依赖）
function mkVFS() {
  const vfs = H.makeVFS();
  vfs.mkdir = function() { return true; };
  vfs.listAll = function(dir) {
    return Object.keys(vfs._files).filter(function(p) { return p.indexOf(dir + '/') === 0; });
  };
  vfs.deleteFile = function(p) { return vfs.remove(p); };
  return vfs;
}

// opts.global：Storage.getGlobal() 的返回值；传字符串 'THROW' 表示该调用抛错
// opts.impl  ：是否给 Platform.ui 装上 requestExternalReply 契约
// opts.reply ：契约的返回值（或函数）
function mkSL(opts) {
  opts = opts || {};
  const ui = {
    appendHint: function() {},
    renderTopbar: function() {},
    renderSidebarExpanded: function() {}
  };
  ui._sent = null;
  if (opts.impl) {
    ui.requestExternalReply = function(msgs) {
      ui._sent = msgs;
      const v = (typeof opts.reply === 'function') ? opts.reply(msgs) : opts.reply;
      return Promise.resolve(v);
    };
  }
  const sb = H.makeSandbox({
    VFS: mkVFS(),
    GameState: {
      currentCardId: 'c1', currentSaveId: 's1', chatHistory: [],
      _gameTime: { year: 2026, month: 1, day: 5, hour: 9, minute: 0 }
    },
    Storage: {
      getGlobal: function() {
        if (opts.global === 'THROW') throw new Error('存储读不出来');
        return (opts.global === undefined) ? {} : opts.global;
      }
    },
    Platform: { ui: ui },
    Logger: {
      listLogs: function() { return []; },
      shouldCompress: function() { return { yes: false }; },
      compress: function() { return Promise.resolve(null); }
    }
  });
  H.load(sb, 'engine/story.js');
  return { SL: sb.window.StoryLoop, ui: ui };
}

// ---------- L1 ----------
H.run('L1 _channelKind：老档没有 storyChannel 键 ⇒ direct（fail-open，老存档行为不变）', function() {
  H.eq(mkSL({ global: {} }).SL._channelKind(), 'direct', 'L1 无键 ⇒ direct');
  H.eq(mkSL({}).SL._channelKind(), 'direct', 'L1 getGlobal 返回空对象 ⇒ direct');
});

// ---------- L2 ----------
H.run('L2 _channelKind：设置写了 external 但平台没实装契约 ⇒ 回落 direct（不把用户卡死）', function() {
  H.eq(mkSL({ global: { storyChannel: 'external' }, impl: false }).SL._channelKind(), 'direct', 'L2 未实装 ⇒ direct');
});

// ---------- L3 ----------
H.run('L3 _channelKind：设置 external 且平台已实装 ⇒ external', function() {
  H.eq(mkSL({ global: { storyChannel: 'external' }, impl: true }).SL._channelKind(), 'external', 'L3 实装 ⇒ external');
});

// ---------- L4 ----------
H.run('L4 _channelKind：Storage.getGlobal 抛错 ⇒ direct，且异常不外抛（不炸主循环）', function() {
  const s = mkSL({ global: 'THROW' });
  let got = null;
  H.noThrow(function() { got = s.SL._channelKind(); }, 'L4 读设置抛错不该炸主循环');
  H.eq(got, 'direct', 'L4 抛错 ⇒ direct');
});

// ---------- L5 ----------
H.run('L5 _channelKind：只认严格字面量 external（大小写变体 / 未知值一律 direct）', function() {
  H.eq(mkSL({ global: { storyChannel: 'EXTERNAL' }, impl: true }).SL._channelKind(), 'direct', "L5 'EXTERNAL' ⇒ direct");
  H.eq(mkSL({ global: { storyChannel: 'External' }, impl: true }).SL._channelKind(), 'direct', "L5 'External' ⇒ direct");
  H.eq(mkSL({ global: { storyChannel: 'foo' }, impl: true }).SL._channelKind(), 'direct', 'L5 未知值 ⇒ direct');
  H.eq(mkSL({ global: { storyChannel: 'direct' }, impl: true }).SL._channelKind(), 'direct', "L5 'direct' ⇒ direct");
  H.eq(mkSL({ global: { storyChannel: true }, impl: true }).SL._channelKind(), 'direct', 'L5 布尔 true ⇒ direct（不做真值判断）');
});

// ---------- L6 ----------
H.run('L6 _externalReply：取消·空·纯空白 ⇒ null；其余 String(...) 原样（与旧 content 口径一致）', function() {
  const cases = [
    [null, null, 'null（用户取消）'],
    [undefined, null, 'undefined'],
    ['', null, '空串'],
    ['   ', null, '纯空格'],
    ['\n\t ', null, '纯换行/制表'],
    ['  正文  ', '  正文  ', '带空白的正文原样保留（旧代码 content=String(__manual) 不做 trim）'],
    ['正文', '正文', '普通正文'],
    [42, '42', '数字走 String()'],
    [{ a: 1 }, '[object Object]', '对象走 String()（与旧行为一致）']
  ];
  let chain = Promise.resolve();
  cases.forEach(function(c) {
    chain = chain.then(function() {
      const s = mkSL({ impl: true, reply: c[0] });
      return s.SL._externalReply([{ role: 'user', content: 'X' }]).then(function(r) {
        H.eq(r, c[1], 'L6 ' + c[2]);
      });
    });
  });
  // 末条：提示词必须原样交给契约（不截断、不改写）
  chain = chain.then(function() {
    const sent = [{ role: 'system', content: 'SYS' }, { role: 'user', content: '整轮提示词' }];
    const s = mkSL({ impl: true, reply: 'GM 回复' });
    return s.SL._externalReply(sent).then(function(r) {
      H.eq(r, 'GM 回复', 'L6 正常回复原样返回');
      H.eq(s.ui._sent, sent, 'L6 整轮提示词原样透传（同一引用，不截断）');
      H.eq(s.ui._sent.length, 2, 'L6 两条消息都送到');
    });
  });
  return chain;
});

// ---------- L7 ----------
H.run('L7 源码守卫：通道裁决只有一个真源，旧内联形态不许复活', function() {
  const st = fs.readFileSync(path.join(H.ROOT, 'engine', 'story.js'), 'utf8');
  H.ok(st.indexOf('_channelKind() {') >= 0, 'L7 story.js 有 _channelKind 定义');
  H.ok(st.indexOf('const __channel = this._channelKind();') >= 0, 'L7 callAI 经 _channelKind() 取通道');
  H.ok(st.indexOf('async _externalReply(toSend) {') >= 0, 'L7 story.js 有 _externalReply 定义');
  H.ok(st.indexOf('await this._externalReply(toSend)') >= 0, 'L7 callAI 经 _externalReply 取回复');
  H.ok(st.indexOf('if (__manual === null) {') >= 0, 'L7 空回复的分支收在 _externalReply 的返回约定上');
  H.notOk(st.indexOf("let __channel = 'direct'") >= 0, 'L7 旧内联裁决已不在');
  H.notOk(st.indexOf('__gCh') >= 0, 'L7 旧内联设置读取已不在');
  H.eq((st.match(/this\._channelKind\(\)/g) || []).length, 1, 'L7 调用点只有一处（单一真源）');
  H.eq((st.match(/this\._externalReply\(/g) || []).length, 1, 'L7 外部回复取用只有一处');
  H.eq((st.match(/Platform\.ui\.requestExternalReply/g) || []).length, 2,
    'L7 平台契约只被缝碰（_channelKind 探测 + _externalReply 调用，各一处）');
});

// ---------- L8 ----------
H.run('L8 手机侧入口守卫：设置页有「对话通道」、落盘 fail-open、契约已登记且手机平台已转发', function() {
  const apiTab = fs.readFileSync(path.join(H.ROOT, 'rn', 'screens', 'settings', 'ApiTab.js'), 'utf8');
  H.contains(apiTab, '对话通道', 'L8 设置页有对话通道控件');
  H.contains(apiTab, "g.storyChannel = (v === 'external') ? 'external' : 'direct'", 'L8 落盘只写两个合法值');
  H.contains(apiTab, "return (g && g.storyChannel === 'external') ? 'external' : 'direct'", 'L8 回显口径与引擎一致（fail-open）');
  const adapter = fs.readFileSync(path.join(H.ROOT, 'platform', 'platform_adapter.js'), 'utf8');
  H.contains(adapter, "'requestExternalReply'", 'L8 契约登记在 platform_adapter NAMES');
  const rnp = fs.readFileSync(path.join(H.ROOT, 'rn', 'rn_platform.js'), 'utf8');
  H.contains(rnp, "wrapRet('requestExternalReply'", 'L8 手机平台已把契约转发到 UI');
});

H.finish();
