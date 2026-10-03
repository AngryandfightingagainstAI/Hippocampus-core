// ============================================================
// RN 图片压缩 smoke · 战役 4 · 批次 4-6a
// 用法：node tools/image_smoke.js（cwd = RN 仓根）
//
// A. rn_platform 导出纯函数（A 类，Node 可直测）：
//    imageCalcFit 等比缩放 / imageEstimateBytes 0.75 系数 /
//    imageSelectQuality 两级质量决策 / imageNormalizeInput 双形态归一
// B. image.compressFile 守卫契约（Promise reject 语义，不触达原生模块）：
//    无文件 / 非图片（type 守卫 + 后缀守卫）/ 无 uri
//    —— 原生压缩路径留 G9 真机验证，Node 只验守卫与返回形态
// C. babel transform 语法验证：rn_platform.js / shop_store.js /
//    ShopModal.js / OverlayHost.js
// D. shop_store（4-6b）：假件注入 Shop/GameState/Platform 全局，
//    验 open/close/buy/sell/视图模型/失败 toast/openShop 壳桥接
// ============================================================

'use strict';

var path = require('path');
var root = path.resolve(__dirname, '..');

var ok = 0, fail = 0;
function check(name, cond) {
  if (cond) { ok++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}
function eq(name, actual, expected) {
  check(name + '（actual=' + JSON.stringify(actual) + '）', actual === expected);
}

var RnPlatform = require(path.join(root, 'rn', 'rn_platform.js'));

// ============ A 组：纯函数 ============

(function () {
  // A1-A4 calcFit 等比缩放
  var f1 = RnPlatform.imageCalcFit(800, 600, 256);
  check('A1 calcFit 横图等比（800x600→256 宽）', f1.nw === 256 && f1.nh === 192);
  var f2 = RnPlatform.imageCalcFit(600, 1200, 256);
  check('A2 calcFit 竖图等比（600x1200→256 高）', f2.nw === 128 && f2.nh === 256);
  var f3 = RnPlatform.imageCalcFit(100, 80, 256);
  check('A3 calcFit 小图不放大', f3.nw === 100 && f3.nh === 80);
  var f4 = RnPlatform.imageCalcFit(0, 0, 256);
  check('A4 calcFit 零尺寸防御', f4.nw === 0 && f4.nh === 0);
  var f5 = RnPlatform.imageCalcFit(1024, 512, 256);
  check('A5 calcFit 2:1（1024x512→256x128）', f5.nw === 256 && f5.nh === 128);

  // A6-A8 estimateDataUrlBytes（Electron 同算法：(len - head) * 0.75）
  // 'data:image/jpeg;base64,' 长 23，base64 'AAAA' 4 字符 = 3 字节
  var d1 = 'data:image/jpeg;base64,AAAA';
  eq('A6 estimateBytes（4 base64 字符 = 3 字节）', RnPlatform.imageEstimateBytes(d1), 3);
  eq('A7 estimateBytes 非字符串', RnPlatform.imageEstimateBytes(null), 0);
  // base64 长度 100 → round(100 * 0.75) = 75
  var b64 = '';
  for (var i = 0; i < 100; i++) b64 += 'A';
  eq('A8 estimateBytes（100 base64 字符 = 75 字节）',
    RnPlatform.imageEstimateBytes('data:image/jpeg;base64,' + b64), 75);

  // A9-A11 selectQuality 两级质量
  var q1 = RnPlatform.imageSelectQuality(50000, 81920, 0.8, 0.6);
  check('A9 selectQuality 未超阈值走单趟', q1.quality === 0.8 && q1.secondPass === false);
  var q2 = RnPlatform.imageSelectQuality(90000, 81920, 0.8, 0.6);
  check('A10 selectQuality 超阈值走二趟 fallback', q2.quality === 0.6 && q2.secondPass === true);
  var q3 = RnPlatform.imageSelectQuality(81920, 81920, 0.8, 0.6);
  check('A11 selectQuality 边界（等于 maxBytes 不超）', q3.secondPass === false);

  // A12-A17 normalizeInput 双形态归一
  var n1 = RnPlatform.imageNormalizeInput(null);
  eq('A12 null 归一为 null', n1, null);
  var n2 = RnPlatform.imageNormalizeInput({ type: 'text/plain', uri: 'file:///x.txt' });
  check('A13 非图片 type 守卫', n2 && n2.err === '不是图片文件');
  var n3 = RnPlatform.imageNormalizeInput({ uri: 'file:///x.txt' });
  check('A14 无 type 后缀守卫', n3 && n3.err === '不是图片文件');
  var n4 = RnPlatform.imageNormalizeInput({ type: 'image/png' });
  check('A15 有 type 无 uri → 没有文件', n4 && n4.err === '没有文件');
  var n5 = RnPlatform.imageNormalizeInput({ uri: 'file:///a.jpg', width: 800, height: 600 });
  check('A16 asset 形态（无 type 有 .jpg 后缀）通过', n5 && !n5.err && n5.uri === 'file:///a.jpg' && n5.width === 800);
  var n6 = RnPlatform.imageNormalizeInput({ type: 'image/jpeg', uri: 'content://m/1', fileName: 'a.jpg' });
  check('A17 asset 形态（有 type）通过', n6 && !n6.err && n6.uri === 'content://m/1');
})();

// ============ B 组：compressFile 守卫契约（Promise reject）============

function expectReject(name, file, expectedMsg) {
  return RnPlatform.install({}).image.compressFile(file).then(
    function () { check(name + '（意外 resolve）', false); },
    function (e) {
      var msg = (e && e.message) || String(e);
      eq(name, msg, expectedMsg);
    }
  );
}

async function runB() {
  // install({}) 返回合并后的 Platform，image.compressFile 走 RN 实装
  await expectReject('B1 无文件 reject', null, '没有文件');
  await expectReject('B2 undefined reject', undefined, '没有文件');
  await expectReject('B3 非图片 type reject', { type: 'application/pdf', uri: 'file:///a.pdf' }, '不是图片文件');
  await expectReject('B4 非图片后缀 reject', { uri: 'file:///a.txt' }, '不是图片文件');
  await expectReject('B5 有 type 无 uri reject', { type: 'image/png' }, '没有文件');
  // B6：合法 asset 会走到 lazy require（Node 无 expo 原生）→ '图片解析失败'
  // 该路径证明守卫全部通过、已进入压缩驱动分支
  await expectReject('B6 合法 asset 触达原生层（Node 环境报解析失败）',
    { uri: 'file:///a.jpg', width: 100, height: 100 }, '图片解析失败');
}

// ============ C 组：babel transform ============

function runC() {
  var babel = require(path.join(root, 'node_modules', '@babel', 'core'));
  var files = [
    'rn/rn_platform.js',
    'rn/shop_store.js',
    'rn/components/ShopModal.js',
    'rn/components/OverlayHost.js'
  ];
  files.forEach(function (rel) {
    var full = path.join(root, rel);
    try {
      babel.transformFileSync(full, { cwd: root, configFile: path.join(root, 'babel.config.js') });
      check('C ' + rel + ' babel transform ok', true);
    } catch (e) {
      check('C ' + rel + ' babel transform FAIL：' + e.message, false);
    }
  });
}

// ============ D 组：shop_store（假件注入）============

function runD() {
  var ShopStore = require(path.join(root, 'rn', 'shop_store.js'));
  ShopStore.reset();

  // ---- 假件：Shop 数据层（对齐 shop.js 契约的最小面）----
  var stockMap = { i1: -1, i2: 3, i3: 0 }; // -1 无限 / 正数 / 0 售罄
  var fakeShopDef = {
    id: 's1', name: '杂货铺', currencyId: 'gold',
    items: [
      { id: 'i1', name: '面包', desc: '充饥', price: 10 },
      { id: 'i2', name: '药水', price: 50 },
      { id: 'i3', name: '钥匙', price: 100 }
    ]
  };
  var buyCalls = [];
  var sellCalls = [];
  global.Shop = {
    findShop: function (id) { return id === 's1' ? fakeShopDef : null; },
    getStock: function (sid, iid) { return stockMap[iid] != null ? stockMap[iid] : 0; },
    buy: function (sid, iid, count) {
      buyCalls.push({ sid: sid, iid: iid, count: count });
      if (iid === 'i3') return { ok: false, reason: '库存不足（剩 0）' };
      // 模拟扣款：买 i1 花 10 gold
      if (iid === 'i1') global.GameState.currentState.hud[0].current -= 10;
      return { ok: true };
    },
    sell: function (sid, name) {
      sellCalls.push({ sid: sid, name: name });
      if (name === '不存在的') return { ok: false, reason: '背包里没有这个物品' };
      return { ok: true };
    }
  };
  global.GameState = {
    currentCard: { worldbook: {} },
    currentState: {
      hud: [{ key: 'gold', name: '金币', current: 30 }],
      sidebar: [],
      panels: {}
    },
    playerData: { inventory: { bar: [{ name: '旧剑', desc: '' }], common: [], story: [], rare: [] } },
    persist: function () {}
  };
  var toasts = [];
  global.Platform = { ui: { toast: function (msg, opts) { toasts.push({ msg: msg, type: opts && opts.type }); } } };

  // D1 初始关闭
  var s0 = ShopStore.getSnapshot();
  check('D1 初始关闭', s0.open === false && s0.view === null);

  // D2 打开不存在商店 → toast error + 保持关闭
  ShopStore.open('nope');
  var s1 = ShopStore.getSnapshot();
  check('D2 未知商店 toast + 保持关闭',
    s1.open === false && toasts.length === 1 &&
    toasts[0].msg === '商店不存在：nope' && toasts[0].type === 'error');

  // D3 打开合法商店 → 视图模型形状
  ShopStore.open('s1');
  var s2 = ShopStore.getSnapshot();
  check('D3 open 后视图（店名/货币/三商品/出售区）',
    s2.open === true && s2.view && s2.view.name === '杂货铺' &&
    s2.view.currency.id === 'gold' && s2.view.currency.have === 30 &&
    s2.view.items.length === 3 && s2.view.sellItems.length === 1 &&
    s2.view.sellItems[0] === '旧剑');

  // D4 库存三态 + 购买钮三态文案（持有 30 gold）
  var it1 = s2.view.items[0], it2 = s2.view.items[1], it3 = s2.view.items[2];
  check('D4a 无限库存可买', it1.stockKind === 'infinite' && it1.stockText === '无限' &&
    it1.canBuy === true && it1.btnText === '购买');
  check('D4b 有库存但钱不够', it2.stockKind === 'count' && it2.stockText === '3' &&
    it2.canBuy === false && it2.btnText === '钱不够');
  check('D4c 售罄', it3.stockKind === 'soldout' && it3.stockText === '已售罄' &&
    it3.canBuy === false && it3.btnText === '已售罄');

  // D5 购买成功 → Shop.buy 收到调用 + 视图重算（gold 30→20）
  ShopStore.buy('i1');
  var s3 = ShopStore.getSnapshot();
  check('D5 购买成功重算视图（have 30→20）',
    buyCalls.length === 1 && buyCalls[0].iid === 'i1' && buyCalls[0].count === 1 &&
    s3.view.currency.have === 20);

  // D6 购买失败 → toast error，视图仍是打开态
  ShopStore.buy('i3');
  check('D6 购买失败 toast', toasts.length === 2 &&
    toasts[1].msg === '购买失败：库存不足（剩 0）' && toasts[1].type === 'error' &&
    ShopStore.getSnapshot().open === true);

  // D7 出售成功 + 失败 toast
  ShopStore.sell('旧剑');
  ShopStore.sell('不存在的');
  check('D7 出售（成功调用 + 失败 toast）',
    sellCalls.length === 2 && sellCalls[0].name === '旧剑' &&
    toasts.length === 3 && toasts[2].msg === '出售失败：背包里没有这个物品');

  // D8 关闭
  ShopStore.close();
  var s4 = ShopStore.getSnapshot();
  check('D8 close 归零', s4.open === false && s4.shopId === null && s4.view === null);

  // D9 getSnapshot 无变化同引用（useSyncExternalStore 协议）
  check('D9 无变化同引用', ShopStore.getSnapshot() === s4);

  // D10 openShop 壳桥接：install 后 Platform.ui.openShop 触达 ShopStore
  var merged = RnPlatform.install({});
  merged.ui.openShop('s1');
  var s5 = ShopStore.getSnapshot();
  check('D10 openShop 壳桥接打开商店', s5.open === true && s5.shopId === 's1' &&
    s5.view && s5.view.name === '杂货铺');
  ShopStore.close();

  // 清场：避免影响同进程其他 smoke（本文件独立进程，兜底防御）
  delete global.Shop;
  delete global.GameState;
  delete global.Platform;
  ShopStore.reset();
}

(async function () {
  try {
    await runB();
    runC();
    runD();
  } catch (e) {
    fail++;
    console.log('SMOKE_CRASH: ' + (e && e.stack || e));
  }
  console.log('IMAGE_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
