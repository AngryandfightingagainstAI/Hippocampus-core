// ============================================================
// P6 · S3-6：导出通道（B 类，持 RN 核心 Share/Clipboard）
// 桌面锚点：engine/ui_cards.js exportCard（:213-222）/ exportSave（:227-252）
//   —— 桌面走 Blob + <a download> 落盘；RN 无下载语义，按仓内既有口径
//   （rn/screens/settings/DataTab.js:81-95）走 Share.share，失败降级 Clipboard。
// 载荷形状逐字对齐桌面：
//   卡带 = 卡对象原样 JSON；
//   存档 = { format:'ai_tg_save', version:1, cardId, saveId, exportAt, files:{路径:内容} }
//   「存档为空，无法导出」同桌面 :231 文案。
// 纯构造（buildCardText / buildSaveText）不碰 RN API，Node 可注入假件直测；
// shareOrCopy 才用 Share/Clipboard。
// ============================================================

'use strict';

var RN = require('react-native');
var Share = RN.Share;
var Clipboard = RN.Clipboard;

// P54·第17条 stage 2：信封加密件（纯 Node 可测；空口令一律明文 ⇒ 默认行为不变）
var SecureEnvelope = require('../vfs/secure_envelope.js');

// P58：信封的「长相」——加密模块不可用时用它区分「加密导出」与「明文 JSON」。
// 只认 format 是首键这一种（encrypt() 的 JSON.stringify 顺序固定），不做宽松嗅探。
var ENV_HEAD = /^\s*\{\s*"format"\s*:\s*"ai_tg_secure"/;

// 卡带导出（桌面 exportCard：卡对象 JSON.parse(JSON.stringify(card)) 等价）
function buildCardText(cardId) {
  try {
    var cards = Storage.getAllCards();
    var card = cards && cards[cardId];
    if (!card) return { ok: false, reason: '卡带不存在：' + cardId };
    var out = JSON.parse(JSON.stringify(card));
    return { ok: true, text: JSON.stringify(out, null, 2), filename: 'card_' + cardId + '.json' };
  } catch (e) {
    return { ok: false, reason: '导出失败：' + (e && e.message || e) };
  }
}

// 存档导出（桌面 exportSave 载荷逐字段对齐）
function buildSaveText(cardId, saveId) {
  try {
    var base = Saves.basePath(cardId, saveId);
    var files = VFS.listAll(base);
    if (!files || !files.length) return { ok: false, reason: '存档为空，无法导出' };
    var out = {
      format: 'ai_tg_save',
      version: 1,
      cardId: cardId,
      saveId: saveId,
      exportAt: new Date().toISOString(),
      files: {}
    };
    files.forEach(function (p) {
      var content = VFS.readFile(p);
      if (content !== null) out.files[p] = content;
    });
    return { ok: true, text: JSON.stringify(out, null, 2), filename: 'save_' + cardId + '_' + saveId + '.json' };
  } catch (e) {
    return { ok: false, reason: '导出失败：' + (e && e.message || e) };
  }
}

// P54·第17条 stage 2：口令封装（薄一层 —— 口令由屏幕层的 OverlayHost.PromptModal 收）
//   · secureWrap：空口令 ⇒ 明文原样回（encrypted:false）；有口令 ⇒ encrypt()
//   · secureUnwrap：明文原样放行；信封 ⇒ decrypt()（口令不对只回 reason）
//     模块缺失 ⇒ { ok:false, reason:'加密模块不可用' }（P58：不再静默当明文放行）
//   · isEnvelopeText：屏幕层用它决定「要不要弹口令框」
function secureWrap(text, passphrase, opts) {
  var s = String(text == null ? '' : text);
  var pass = String(passphrase == null ? '' : passphrase);
  if (!pass) return { ok: true, text: s, encrypted: false };
  if (!SecureEnvelope || typeof SecureEnvelope.encrypt !== 'function') return { ok: false, reason: '加密模块不可用' };
  var r = SecureEnvelope.encrypt(s, pass, opts);
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true, text: r.text, encrypted: true };
}
function secureUnwrap(text, passphrase) {
  var s = String(text == null ? '' : text);
  // P58：模块缺失时不能当明文放行 —— 信封本身是一段合法 JSON，放行后下游只会报
  //   「校验失败 / 这不是本引擎导出的存档」，把「加密模块没加载」这个真因藏掉。
  //   也不能连明文导入一起拦下 ⇒ 只对「看起来是信封」的输入报错。
  //   信封由 vfs/secure_envelope.js:468 的 encrypt() 直接 JSON.stringify 落盘，format 是首键。
  if (!SecureEnvelope || typeof SecureEnvelope.isEnvelope !== 'function') {
    if (!looksLikeEnvelope(s)) return { ok: true, text: s, encrypted: false };
    return { ok: false, reason: '加密模块不可用' };
  }
  if (!SecureEnvelope.isEnvelope(s)) return { ok: true, text: s, encrypted: false };
  var r = SecureEnvelope.decrypt(s, passphrase);
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true, text: r.text, encrypted: true };
}
// P58：信封「长相」嗅探 —— 只认 format 是首键那一种（encrypt() 的 JSON.stringify 顺序固定）。
//   加密模块可用时由 SecureEnvelope.isEnvelope 做权威判断；不可用时靠它，屏幕才会进
//   「要不要口令」那一支、进而听到「加密模块不可用」，而不是把密文当明文去解析。
function looksLikeEnvelope(text) {
  return ENV_HEAD.test(String(text == null ? '' : text).replace(/^\uFEFF/, ''));
}
function isEnvelopeText(text) {
  var s = String(text == null ? '' : text);
  if (!SecureEnvelope || typeof SecureEnvelope.isEnvelope !== 'function') return looksLikeEnvelope(s);
  return SecureEnvelope.isEnvelope(s);
}

// 设备通道：Share.share → 失败降级 Clipboard（同 DataTab.shareOrCopy）
// resolve：{ shared:true } | { copied:true } | { dismissed:true }
function shareOrCopy(text, title) {
  return Share.share({ message: text, title: title })
    .then(function (res) {
      if (res && res.action === Share.sharedAction) return { shared: true };
      return { dismissed: true };
    })
    .catch(function () {
      try { Clipboard.setString(text); } catch (e) { return { failed: true }; }
      return { copied: true };
    });
}

module.exports = {
  buildCardText: buildCardText,
  buildSaveText: buildSaveText,
  shareOrCopy: shareOrCopy,
  // P54·第17条 stage 2：口令封装 / 信封判别
  secureWrap: secureWrap,
  secureUnwrap: secureUnwrap,
  isEnvelopeText: isEnvelopeText
};
