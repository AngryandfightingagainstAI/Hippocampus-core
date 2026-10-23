'use strict';
/**
 * release_publish 的自检（不发网络请求）
 * 目的：把「上传前就该拦下」的三种坏文本钉成回归，避免 1.3.3 那种「中文全变问号」再发生。
 */
const path = require('path');
const release = require('./release_publish.js');

let ok = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { ok++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
}

// A. 编码损坏必须被拦下
check('A1 中文被吃成问号 ⇒ 报「连续问号」',
  release.auditText('t', '## ????\n- ??????? `x` ?????????').length > 0);
check('A2 替换字符 U+FFFD ⇒ 报错',
  release.auditText('t', '正文里出现�坏字节').length > 0);
check('A3 中文正文夹孤立问号 ⇒ 报错',
  release.auditText('t', '修复了 ? 个问题，详见提交记录').length > 0);

// B. 正常中文不得误报
check('B1 纯中文正文通过',
  release.auditText('t', '## 本次修复\n\n- 自写答案不再被强行归类，只算已作答。').length === 0);
check('B2 正文里合法引用一个 `?`（行内代码）不算损坏',
  release.auditText('t', '标题里的 `?` 是问号；正文中文正常。').length === 0);
check('B3 中英混排通过',
  release.auditText('t', 'Pixel 7 模拟器（Android 15 / x86_64）验证：连做 2 轮无卡顿。').length === 0);

// C. 标题/正文拆分规则
const parsed = release.parseNotes('# v9.9.9 - 标题\n\n正文第一行\n正文第二行\n');
check('C1 首行 "# 标题" 被拆成 title', parsed && parsed.title === 'v9.9.9 - 标题');
check('C2 其余内容原样作为 body', parsed && parsed.body === '正文第一行\n正文第二行\n');
check('C3 没有 "# 标题" 行 ⇒ 返回 null（命令行会报错拒绝）',
  release.parseNotes('只有正文没有标题') === null);
check('C4 BOM 开头的文件也能拆', (function () {
  const p = release.parseNotes('\uFEFF# 标题\n正文\n');
  return p && p.title === '标题' && p.body === '正文\n';
})());

// D. 仓库里已有的发布说明都要过体检（防止以后再提交坏文件）
const fs = require('fs');
const dir = path.join(__dirname, '..', 'docs', 'releases');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(function (f) { return /\.md$/.test(f); }) : [];
check('D1 docs/releases 至少有一份说明', files.length > 0, files.join(','));
files.forEach(function (f) {
  const raw = fs.readFileSync(path.join(dir, f), 'utf8');
  const p = release.parseNotes(raw);
  const bad = (p ? release.auditText(f, p.body) : []).concat(p ? release.auditText(f + '#title', p.title) : ['缺标题行']);
  check('D2 ' + f + ' 体检通过', bad.length === 0, bad.join('；'));
});

console.log('\nSUMMARY: ' + ok + ' passed, ' + fail + ' failed');
console.log('RELEASE_PUBLISH_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
if (fail > 0) process.exit(1);
