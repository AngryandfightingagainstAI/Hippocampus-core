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
  if (!SecureEnvelope || typeof SecureEnvelope.isEnvelope !== 'function') return { ok: true, text: s, encrypted: false };
  if (!SecureEnvelope.isEnvelope(s)) return { ok: true, text: s, encrypted: false };
  var r = SecureEnvelope.decrypt(s, passphrase);
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true, text: r.text, encrypted: true };
}
function isEnvelopeText(text) {
  if (!SecureEnvelope || typeof SecureEnvelope.isEnvelope !== 'function') return false;
  return SecureEnvelope.isEnvelope(String(text == null ? '' : text));
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
