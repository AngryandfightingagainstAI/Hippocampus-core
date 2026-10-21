// ============================================================
// P72·W6 单测：RN 主页「跟随我的主题」模型层（rn/home_model.js）
//   WF-1 默认 false（维持书票压主题）
//   WF-2 setHomeFollow(true) 落 settings.ui.homeFollowGlobal 且读回 true
//   WF-3 buildHomeModel 带出 homeFollow；关掉后回到 false
//   WF-4 跟随中不写 skinOverride（书票不生效，但也不污染存储）
//   WF-5 存储里 settings/ui 缺失时不炸（空全局）
//   WF-6 切书票仍走 setSkinOverride（未跟随时行为不变）
//   WF-7 与桌面同键：engine/ui_home.js 里出现同一字符串 homeFollowGlobal
//   WF-8 buildHomeModel 每次现读存储（改完不缓存旧值）
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./_harness');

// 最小假件：Storage（真源）+ CardDisplay（书票解析）+ theme
function mkSandbox(seed) {
  const g = {
    settings: {
      theme: { activeId: 'paper' },
      skinOverride: { demo_v1: 'glass' }
    }
  };
  if (seed) seed(g);
  const card = {
    id: 'demo_v1',
    display: { title: '示例卡带', seal: '示例', sub: '', genre: '', theme: 'paper', accent: '' }
  };
  const sb = H.makeSandbox({
    // home_model.js 顶部 require('../engine/card_display.js')：沙箱里换成注入口，
    // 让假 CardDisplay 生效（真实文件在 Node 里也能加载，但会带一堆无关依赖）
    require: function () { return sb.CardDisplay; },
    module: { exports: {} },
    exports: {},
    Storage: {
      getGlobal: function () { return JSON.parse(JSON.stringify(g)); },
      setGlobal: function (next) { Object.keys(next).forEach(function (k) { g[k] = next[k]; }); return true; },
      getAllCards: function () { return { demo_v1: card }; }
    },
    LocalStore: { getItem: function () { return null; }, setItem: function () {} },
    Saves: { listAll: function () { return []; }, listByCard: function () { return []; } },
    CardDisplay: {
      SKIN_THEMES: ['paper', 'glass', 'scroll'],
      isSkinTheme: function (id) { return ['paper', 'glass', 'scroll'].indexOf(id) >= 0; },
      resolveCardDisplay: function (c) { return (c && c.display) || { theme: 'paper' }; },
      resolveThemeId: function (d, ov, cid) {
        if (ov && cid && ov[cid]) return ov[cid];
        return (d && d.theme) || 'paper';
      },
      formatOverline: function () { return '未知卡带'; }
    },
    Theme: { getBuiltin: function (id) { return { id: id, colors: {} }; } },
    _peekGlobal: function () { return g; }
  });
  return sb;
}

function loadModel(sb) {
  H.load(sb, 'rn/home_model.js');
  return sb.module.exports;
}

H.run('WF-1 默认 false（维持书票压主题）', function () {
  const sb = mkSandbox();
  const M = loadModel(sb);
  H.eq(M.getHomeFollow(), false, '默认值');
});

H.run('WF-2 setHomeFollow(true) 落盘 settings.ui.homeFollowGlobal 且读回 true', function () {
  const sb = mkSandbox();
  const M = loadModel(sb);
  const r = M.setHomeFollow(true);
  H.eq(r, true, '返回值');
  H.eq(sb._peekGlobal().settings.ui.homeFollowGlobal, true, '落盘值');
  H.eq(M.getHomeFollow(), true, '读回');
});

H.run('WF-3 buildHomeModel 带出 homeFollow；关掉后回 false', function () {
  const sb = mkSandbox();
  const M = loadModel(sb);
  M.setHomeFollow(true);
  H.eq(M.buildHomeModel().homeFollow, true, '开');
  M.setHomeFollow(false);
  H.eq(M.buildHomeModel().homeFollow, false, '关');
});

H.run('WF-4 跟随中不改 skinOverride（用户没点书票时存储不动）', function () {
  const sb = mkSandbox(function (g) { g.settings.skinOverride = {}; });
  const M = loadModel(sb);
  M.setHomeFollow(true);
  M.buildHomeModel();
  H.deepEq(sb._peekGlobal().settings.skinOverride, {}, 'skinOverride 保持空');
});

H.run('WF-5 空全局（无 settings）不炸', function () {
  const sb = mkSandbox(function (g) { delete g.settings; });
  const M = loadModel(sb);
  H.eq(M.getHomeFollow(), false, '缺 settings 时 false');
  H.eq(M.setHomeFollow(true), true, 'setHomeFollow 能补出 settings.ui');
  H.eq(sb._peekGlobal().settings.ui.homeFollowGlobal, true, '补齐后落盘');
});

H.run('WF-6 未跟随时切书票仍写 skinOverride（行为不变）', function () {
  const sb = mkSandbox(function (g) { g.settings.skinOverride = {}; });
  const M = loadModel(sb);
  M.setSkinOverride('demo_v1', 'scroll');
  H.eq(sb._peekGlobal().settings.skinOverride.demo_v1, 'scroll', '写入');
  H.eq(M.effectiveSkin(M.getHomePicked()), 'scroll', '生效');
});

H.run('WF-7 与桌面同键：engine/ui_home.js 也读 homeFollowGlobal', function () {
  const PC_ROOT = process.env.HIPPOCAMPUS_PC || 'D:\\AI文游\\神秘小引擎测试版\\神秘小引擎测试版';
  const p = path.join(PC_ROOT, 'engine', 'ui_home.js');
  if (!fs.existsSync(p)) { console.log('       （桌面仓不可见 ⇒ WF-7 跳过）'); return; }
  const src = fs.readFileSync(p, 'utf8');
  H.ok(src.indexOf('homeFollowGlobal') >= 0, '桌面 ui_home.js 用同一存储键');
});

H.run('WF-8 buildHomeModel 每次现读存储（不缓存旧值）', function () {
  const sb = mkSandbox();
  const M = loadModel(sb);
  H.eq(M.buildHomeModel().homeFollow, false, '先 false');
  sb._peekGlobal().settings.ui = { homeFollowGlobal: true };  // 绕过 setter 直接改存储
  H.eq(M.buildHomeModel().homeFollow, true, '改后立即可见');
});

H.finish();
