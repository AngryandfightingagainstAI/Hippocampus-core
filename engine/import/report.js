// ============================================================
// 导入层 · 逐文件提取报告
// 存在的唯一理由：**不静默丢内容**。
// 每个文件走完解析后必须产出一条人话，形如：
//   xxx.docx：正文已提取（12 段 / 3 标题 / 2 表格），2 张图片暂未处理
// 而不是「导入成功」四个字。
// ============================================================

var ImportReport = {
  create: function () {
    return { startedAt: new Date().toISOString(), files: [], warnings: [], errors: [] };
  },

  // entry: { name, bytes, formatId, priority, ok, extracted:{}, unhandled:[], warnings:[], error, imdSummary }
  addFile: function (report, entry) {
    var e = {
      name: entry.name || '(未命名)',
      bytes: entry.bytes || 0,
      formatId: entry.formatId || 'unknown',
      priority: entry.priority || null,
      ok: entry.ok !== false,
      skipped: !!entry.skipped,
      extracted: entry.extracted || {},
      unhandled: (entry.unhandled || []).slice(),
      warnings: (entry.warnings || []).slice(),
      error: entry.error || null,
      note: entry.note || null,
      importId: entry.importId || null,
      imdSummary: entry.imdSummary || null
    };
    report.files.push(e);
    return e;
  },

  addWarning: function (report, msg) { report.warnings.push(String(msg)); },
  addError: function (report, msg) { report.errors.push(String(msg)); },

  // 中文量词：段 / 个 / 张
  _unit: function (kind) {
    return ({ paragraph: '段', heading: '个标题', table: '个表格', list: '个列表', code: '段代码', kv: '个字段', page: '页', image: '张图片', attachment: '个附件', raw: '段原文' })[kind] || '项';
  },

  // 一条文件的人话总结。extracted 的键用块类型名。
  line: function (e) {
    if (e.skipped) return e.name + '：未处理（' + (e.note || '不支持该格式') + '）';
    if (!e.ok) return e.name + '：解析失败（' + (e.error || '原因未知') + '）';
    var parts = [];
    var order = ['heading', 'paragraph', 'table', 'list', 'code', 'kv', 'page'];
    for (var i = 0; i < order.length; i++) {
      var k = order[i];
      if (e.extracted[k]) parts.push(e.extracted[k] + ' ' + this._unit(k));
    }
    var head = e.name + '：';
    var body = parts.length ? ('已提取 ' + parts.join(' / ')) : '未提取到可用内容';
    var tail = [];
    for (var j = 0; j < e.unhandled.length; j++) {
      var u = e.unhandled[j];
      tail.push((u.count || 0) + (u.unit || this._unit(u.kind)) + '暂未处理' + (u.note ? '（' + u.note + '）' : ''));
    }
    return head + body + (tail.length ? '，' + tail.join('，') : '');
  },

  lines: function (report) {
    var out = [];
    for (var i = 0; i < report.files.length; i++) out.push(this.line(report.files[i]));
    for (var w = 0; w < report.warnings.length; w++) out.push('⚠ ' + report.warnings[w]);
    for (var x = 0; x < report.errors.length; x++) out.push('✖ ' + report.errors[x]);
    return out;
  },

  summary: function (report) {
    var ok = 0, skip = 0, fail = 0, unhandled = 0;
    for (var i = 0; i < report.files.length; i++) {
      var f = report.files[i];
      if (f.skipped) skip++; else if (!f.ok) fail++; else ok++;
      for (var j = 0; j < f.unhandled.length; j++) unhandled += (f.unhandled[j].count || 0);
    }
    return { files: report.files.length, ok: ok, skipped: skip, failed: fail, unhandledItems: unhandled, warnings: report.warnings.length, errors: report.errors.length };
  },

  toText: function (report) {
    var s = this.summary(report);
    var out = ['导入报告：共 ' + s.files + ' 个文件，成功 ' + s.ok + '，跳过 ' + s.skipped + '，失败 ' + s.failed];
    if (s.unhandledItems) out.push('未处理内容共 ' + s.unhandledItems + ' 项（见下方逐文件说明，原文件已保留）');
    out = out.concat(this.lines(report));
    return out.join('\n');
  }
};

if (typeof window !== 'undefined') window.ImportReport = ImportReport;
if (typeof module !== 'undefined' && module.exports) module.exports = ImportReport;
