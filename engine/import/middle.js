// ============================================================
// 导入层 · 中间格式（IMD = Imported Material Document）
// 「解析器」这一层的唯一出口。之后所有的 AI 分析、拆分、卡带生成、
// Validator 都只认这个结构——加格式时不用改后面任何一层。
//
// 设计约束（硬性）：
//   1. 不静默丢内容：任何解析器认不出的东西，都必须落成 raw / asset 块，
//      并在 stats.unhandled 里留一条带数量的记录。
//   2. 有损转换必须留痕：例如「图片暂未处理」「表格被降级成文本」，
//      都进 warnings，同时进 stats.unhandled。
//   3. 原文永远保留：imd.raw.text 保存原始文本（二进制格式为 null，
//      原文件走 ImportVault）；AI 抽取错了可以回退到这一份。
// ============================================================

var IMD_VERSION = '1.0';

function nowISO() {
  return new Date().toISOString();
}

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// 每块都带 type + 可选 note。type 取值固定，消费侧 switch 不要出现 default 吞掉。
var BLOCK_TYPES = ['heading', 'paragraph', 'list', 'table', 'code', 'kv', 'raw', 'asset', 'pagebreak'];

var ImportMiddle = {
  IMD_VERSION: IMD_VERSION,
  BLOCK_TYPES: BLOCK_TYPES,
  uid: uid,

  create: function (opts) {
    opts = opts || {};
    return {
      imdVersion: IMD_VERSION,
      importId: opts.importId || uid('imp'),
      createdAt: nowISO(),
      source: {
        name: opts.name || '',
        ext: opts.ext || '',
        formatId: opts.formatId || 'unknown',
        parser: opts.parser || null,
        bytes: opts.bytes || 0,
        sha256: opts.sha256 || null,
        encoding: opts.encoding || null,
        retained: false
      },
      meta: {
        title: opts.title || null,
        lineCount: 0, charCount: 0,
        headings: 0, paragraphs: 0, tables: 0, lists: 0, codes: 0, kvs: 0,
        pages: 0, images: 0, attachments: 0
      },
      outline: [],
      blocks: [],
      warnings: [],
      stats: { unhandled: [] },
      raw: { text: (typeof opts.rawText === 'string' ? opts.rawText : null) }
    };
  },

  // ---- 块构造器（保证字段齐，消费侧不用防 undefined）----
  heading: function (level, text) {
    return { type: 'heading', level: Math.max(1, Math.min(6, level | 0)), text: String(text == null ? '' : text) };
  },
  paragraph: function (text) { return { type: 'paragraph', text: String(text == null ? '' : text) }; },
  list: function (items, ordered) {
    return { type: 'list', ordered: !!ordered, items: (items || []).map(function (s) { return String(s == null ? '' : s); }) };
  },
  table: function (headers, rows, note) {
    return {
      type: 'table',
      headers: (headers || []).map(function (s) { return String(s == null ? '' : s); }),
      rows: (rows || []).map(function (r) {
        return (r || []).map(function (s) { return String(s == null ? '' : s); });
      }),
      note: note || null
    };
  },
  code: function (text, lang) { return { type: 'code', text: String(text == null ? '' : text), lang: lang || null }; },
  kv: function (path, value) { return { type: 'kv', path: String(path), value: value === undefined ? null : value }; },
  // 认不出的东西一律进这里。note 必须写清「这是什么、为什么没用上」。
  raw: function (text, note) { return { type: 'raw', text: String(text == null ? '' : text), note: note || '未能归类的原文' }; },
  asset: function (kind, name, note) { return { type: 'asset', kind: kind || 'unknown', name: name || '', note: note || '本轮未处理' }; },
  pagebreak: function (pageNo) { return { type: 'pagebreak', pageNo: pageNo | 0 }; },

  // ---- 收尾：统计 + 目录 + 一致性检查 ----
  finalize: function (imd) {
    var m = imd.meta;
    m.headings = m.paragraphs = m.tables = m.lists = m.codes = m.kvs = 0;
    imd.outline = [];
    var chars = 0;
    for (var i = 0; i < imd.blocks.length; i++) {
      var b = imd.blocks[i];
      switch (b.type) {
        case 'heading': m.headings++; imd.outline.push({ level: b.level, title: b.text, blockIndex: i }); chars += b.text.length; break;
        case 'paragraph': m.paragraphs++; chars += b.text.length; break;
        case 'table': m.tables++; chars += (b.headers.join('').length + b.rows.length * 8); break;
        case 'list': m.lists++; chars += b.items.join('').length; break;
        case 'code': m.codes++; chars += b.text.length; break;
        case 'kv': m.kvs++; chars += b.path.length + String(b.value == null ? '' : b.value).length; break;
        case 'raw': chars += b.text.length; break;
        case 'asset': chars += 0; break;
        case 'pagebreak': break;
        default:
          // 未知块类型不能吞：转成 raw 并报警（防御未来手滑）
          imd.warnings.push('未知块类型「' + b.type + '」已降级为 raw');
          b.type = 'raw'; b.note = '未知块类型降级';
          break;
      }
    }
    if (imd.raw && typeof imd.raw.text === 'string') {
      m.charCount = imd.raw.text.length;
      m.lineCount = m.charCount ? imd.raw.text.split('\n').length : 0;
    } else {
      m.charCount = chars;
      m.lineCount = 0;
    }
    if (!imd.meta.title && imd.outline.length) imd.meta.title = imd.outline[0].title;
    return imd;
  },

  // 给 AI 看的纯文本还原（块类型信息用轻标记保留，便于 AI 理解结构）
  toPlainText: function (imd, opts) {
    opts = opts || {};
    var out = [];
    for (var i = 0; i < imd.blocks.length; i++) {
      var b = imd.blocks[i];
      if (b.type === 'heading') out.push(new Array(b.level + 1).join('#') + ' ' + b.text);
      else if (b.type === 'paragraph') out.push(b.text);
      else if (b.type === 'list') for (var j = 0; j < b.items.length; j++) out.push((b.ordered ? (j + 1) + '. ' : '- ') + b.items[j]);
      else if (b.type === 'table') {
        out.push('| ' + b.headers.join(' | ') + ' |');
        for (var r = 0; r < b.rows.length; r++) out.push('| ' + b.rows[r].join(' | ') + ' |');
      } else if (b.type === 'code') out.push('```' + (b.lang || '') + '\n' + b.text + '\n```');
      else if (b.type === 'kv') out.push(b.path + ': ' + (b.value === null ? '' : JSON.stringify(b.value)));
      else if (b.type === 'raw') out.push('【原文·未归类】' + b.text);
      else if (b.type === 'asset') out.push('【附件·未处理】' + b.kind + ' ' + b.name);
      else if (b.type === 'pagebreak') { if (opts.pages !== false) out.push('--- 第 ' + b.pageNo + ' 页 ---'); }
    }
    return out.join('\n');
  },

  // 估算 token（与 PromptBuilder 同口径：中文约 1 字符 ≈ 0.6 token 的常用近似）
  estimate: function (imd) {
    var t = ImportMiddle.toPlainText(imd, { pages: false });
    var cjk = (t.match(/[\u3400-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/g) || []).length;
    var rest = t.length - cjk;
    return Math.round(cjk * 1.0 + rest * 0.28);
  },

  // 逐块摘要，给 UI 直接渲染（不返回 HTML，返回数据）
  summarize: function (imd) {
    var m = imd.meta;
    return {
      importId: imd.importId,
      formatId: imd.source.formatId,
      title: m.title,
      blocks: imd.blocks.length,
      headings: m.headings, paragraphs: m.paragraphs, tables: m.tables,
      lists: m.lists, codes: m.codes, kvs: m.kvs,
      images: m.images, pages: m.pages, attachments: m.attachments,
      charCount: m.charCount, lineCount: m.lineCount,
      estTokens: ImportMiddle.estimate(imd),
      warnings: imd.warnings.slice(),
      unhandled: imd.stats.unhandled.slice()
    };
  }
};

if (typeof window !== 'undefined') window.ImportMiddle = ImportMiddle;
if (typeof module !== 'undefined' && module.exports) module.exports = ImportMiddle;
