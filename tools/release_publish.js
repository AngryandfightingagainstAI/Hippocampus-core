'use strict';
/**
 * GitHub Release 发布工具（P79 · 修「一堆问号」的根因用）
 *
 * 为什么要有它：v1.3.3 那个 Release 的标题与正文在上传时被 Windows 本地编码（CP936/GBK）
 * 转 ASCII，所有中文被逐字替换成 '?'，GitHub 存的就是坏文本。手搓命令行太容易再犯，
 * 所以把发布固化成三条命令，并且：
 *   1. 标题/正文一律从 **UTF-8 文件**读（不让 shell 参数经手中文）；
 *   2. 发送前 `check`：出现 U+FFFD、连续问号、或「有中文却有孤立问号」直接拒发；
 *   3. 发送后**回读比对**：GET 一次 release，逐字符比 name/body，不一致就报错。
 *
 * 用法：
 *   node tools/release_publish.js check  <notes.md>
 *   node tools/release_publish.js edit   --tag v1.3.3 --title-file <t.txt> --notes <notes.md> [--dry-run]
 *   node tools/release_publish.js create --tag v1.3.6 --title-file <t.txt> --notes <notes.md> [--target main] [--dry-run]
 *   node tools/release_publish.js show   --tag v1.3.3
 *   node tools/release_publish.js upload --tag v1.3.6 --file <apk/exe> [--name 别名] [--dry-run]
 *
 * 凭据：优先 `GITHUB_TOKEN`；没有就走 `git credential fill`（只在内存里用，不落盘、不打印）。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = process.env.RELEASE_REPO || 'AngryandfightingagainstAI/Hippocampus-core';
const API = 'https://api.github.com';

function die(msg) {
  console.error('RELEASE_FAIL: ' + msg);
  process.exit(1);
}

function argOf(name) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function flag(name) {
  return process.argv.indexOf('--' + name) >= 0;
}

function readUtf8(file) {
  if (!file) die('缺少文件参数');
  if (!fs.existsSync(file)) die('文件不存在：' + file);
  const buf = fs.readFileSync(file);
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    die('文件带 BOM，请存成 UTF-8 无 BOM：' + file);
  }
  return buf.toString('utf8');
}

// ---- 文本体检：把「上传前就已经坏掉」的情况拦在本地 ----
function auditText(label, text) {
  const problems = [];
  if (text.indexOf('\uFFFD') >= 0) problems.push('含替换字符 U+FFFD');
  const runs = text.match(/\?{2,}/g);
  if (runs) problems.push('含连续问号 ' + runs.slice(0, 3).join(' '));
  const hasCjk = /[\u4e00-\u9fff]/.test(text);
  if (hasCjk) {
    // 中文段落里出现孤立问号，多半就是「中文被吃成 ?」的残留。
    // 但文档正文里合法引用一个 `?` 是允许的，所以先把行内代码/围栏代码剥掉再数。
    const prose = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]*`/g, '');
    const lone = (prose.match(/(?<![?\u003f])\?(?![?\u003f])/g) || []).length;
    if (lone > 0) problems.push('有中文但仍有 ' + lone + ' 个孤立问号（疑似编码损坏）');
  }
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  console.log('AUDIT ' + label + ': ' + text.length + ' 字符，中文 ' + cjk + ' 字，'
    + (problems.length ? 'FAIL → ' + problems.join('；') : 'ok'));
  return problems;
}

// ---- 凭据 ----
function gitBins() {
  const out = [];
  if (process.env.GIT_BIN) out.push(process.env.GIT_BIN);
  out.push('git');
  if (process.platform === 'win32') {
    out.push('C:\\Users\\' + (process.env.USERNAME || '') + '\\AppData\\Local\\Programs\\MinGit\\cmd\\git.exe');
    out.push('C:\\Program Files\\Git\\cmd\\git.exe');
  }
  return out;
}

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  for (const bin of gitBins()) {
    try {
      const out = execFileSync(bin, ['credential', 'fill'], {
        input: 'protocol=https\nhost=github.com\n\n',
        encoding: 'utf8'
      });
      const m = out.match(/^password=(.+)$/m);
      if (m && m[1].trim()) return m[1].trim();
    } catch (e) { /* 换下一个 git */ }
  }
  die('拿不到 GitHub 凭据：设 GITHUB_TOKEN（或 GIT_BIN 指向 git），或先让 git 记住 GitHub 凭据');
}

async function api(method, url, body) {
  const res = await fetch(API + url, {
    method: method,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + token(),
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* 非 JSON 响应 */ }
  if (!res.ok) {
    die(method + ' ' + url + ' → HTTP ' + res.status + '：' + (text || '').slice(0, 500));
  }
  return json;
}

async function findRelease(tag) {
  const list = await api('GET', '/repos/' + REPO + '/releases?per_page=100');
  const hit = (list || []).find(function (r) { return r.tag_name === tag; });
  if (!hit) die('找不到 tag 为 ' + tag + ' 的 release');
  return hit;
}

async function verify(release, name, body) {
  const fresh = await api('GET', '/repos/' + REPO + '/releases/' + release.id);
  const okName = fresh.name === name;
  const okBody = (fresh.body || '') === body;
  console.log('VERIFY name: ' + (okName ? 'ok' : 'MISMATCH'));
  console.log('VERIFY body: ' + (okBody ? 'ok' : 'MISMATCH'));
  if (!okName) {
    console.log('  期望: ' + JSON.stringify(name));
    console.log('  实际: ' + JSON.stringify(fresh.name));
  }
  if (!okBody) {
    const a = (fresh.body || '');
    let i = 0;
    while (i < Math.min(a.length, body.length) && a[i] === body[i]) i++;
    console.log('  首个差异位置 ' + i + '：期望 ' + JSON.stringify(body.slice(i, i + 40))
      + ' / 实际 ' + JSON.stringify(a.slice(i, i + 40)));
  }
  if (!okName || !okBody) die('回读比对不一致（远端存的与你发的不一样）');
  console.log('RELEASE_VERIFY: ok（远端已存中文，未发生编码替换）');
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd) die('用法见文件头注释');

  if (cmd === 'check') {
    const text = readUtf8(process.argv[3]);
    const problems = auditText(path.basename(process.argv[3]), text);
    if (problems.length) die('文本体检不通过，拒绝发布');
    console.log('RELEASE_CHECK: ok');
    return;
  }

  if (cmd === 'show') {
    const rel = await findRelease(argOf('tag'));
    console.log('id=' + rel.id + ' tag=' + rel.tag_name);
    console.log('name=' + JSON.stringify(rel.name));
    console.log('assets=' + (rel.assets || []).map(function (a) { return a.name; }).join(', '));
    console.log('body 前 200 字：' + JSON.stringify((rel.body || '').slice(0, 200)));
    return;
  }

  if (cmd === 'upload') {
    const upTag = argOf('tag');
    const file = argOf('file');
    if (!upTag) die('缺少 --tag');
    if (!file) die('缺少 --file');
    if (!fs.existsSync(file)) die('文件不存在：' + file);
    const rel = await findRelease(upTag);
    const name = argOf('name') || path.basename(file);
    const buf = fs.readFileSync(file);
    // GitHub 不允许同名资产并存：先删旧的，再传新的（重发同一版本时用得上）
    const dup = (rel.assets || []).find(function (a) { return a.name === name; });
    if (dup) {
      await api('DELETE', '/repos/' + REPO + '/releases/assets/' + dup.id);
      console.log('REMOVED 旧资产 ' + name);
    }
    const url = 'https://uploads.github.com/repos/' + REPO + '/releases/' + rel.id
      + '/assets?name=' + encodeURIComponent(name);
    if (flag('dry-run')) {
      console.log('DRY_RUN 将上传 ' + name + '（' + buf.length + ' bytes）到 ' + upTag);
      return;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + token(),
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(buf.length)
      },
      body: buf
    });
    const upText = await res.text();
    if (!res.ok) die('上传失败 HTTP ' + res.status + '：' + upText.slice(0, 300));
    const upJson = JSON.parse(upText);
    console.log('UPLOADED ' + upJson.name + ' ' + upJson.size + ' bytes state=' + upJson.state);
    const again = ((await api('GET', '/repos/' + REPO + '/releases/' + rel.id)).assets || [])
      .find(function (a) { return a.name === name; });
    if (!again) die('上传后回读找不到资产 ' + name);
    if (again.size !== buf.length) {
      die('回读大小不符：本地 ' + buf.length + ' / 远端 ' + again.size);
    }
    console.log('UPLOAD_VERIFY: ok（' + again.size + ' bytes）');
    return;
  }

  const tag = argOf('tag');
  // 标题：优先 --title-file；否则取 notes 第一行 "# 标题"，其余作为正文
  let name = '';
  let body = '';
  if (argOf('title-file')) {
    name = readUtf8(argOf('title-file')).trim();
    body = readUtf8(argOf('notes'));
  } else {
    const raw = readUtf8(argOf('notes'));
    const m = raw.match(/^\uFEFF?#[ \t]+(.+)\r?\n([\s\S]*)$/);
    if (!m) die('notes 首行要写成 "# 标题"，或用 --title-file 指定标题');
    name = m[1].trim();
    body = m[2].replace(/^\s+/, '');
  }
  if (!tag) die('缺少 --tag');
  if (!name) die('标题为空');
  if (!body.trim()) die('正文为空');
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) die('tag 形状不对：' + tag);

  const problems = auditText('title', name).concat(auditText('body', body));
  if (problems.length) die('文本体检不通过，拒绝发布');

  if (flag('dry-run')) {
    console.log('DRY_RUN 将' + (cmd === 'create' ? '创建' : '更新') + ' release ' + tag);
    console.log('  name: ' + name);
    console.log('  body 字符数: ' + body.length);
    return;
  }

  if (cmd === 'edit') {
    const rel = await findRelease(tag);
    const out = await api('PATCH', '/repos/' + REPO + '/releases/' + rel.id, { name: name, body: body });
    console.log('EDITED id=' + out.id + ' tag=' + out.tag_name);
    await verify(out, name, body);
    return;
  }

  if (cmd === 'create') {
    const out = await api('POST', '/repos/' + REPO + '/releases', {
      tag_name: tag,
      target_commitish: argOf('target') || 'main',
      name: name,
      body: body,
      draft: false,
      prerelease: false
    });
    console.log('CREATED id=' + out.id + ' tag=' + out.tag_name
      + ' url=' + out.html_url);
    await verify(out, name, body);
    return;
  }

  die('未知子命令：' + cmd);
}

if (require.main === module) {
  main().catch(function (e) { die(String(e && e.stack || e)); });
}

module.exports = { auditText: auditText, parseNotes: parseNotes };

// 供 smoke 测试用：把「# 标题 + 正文」拆开（与命令行同一套规则）
function parseNotes(raw) {
  const m = raw.match(/^\uFEFF?#[ \t]+(.+)\r?\n([\s\S]*)$/);
  if (!m) return null;
  return { title: m[1].trim(), body: m[2].replace(/^\s+/, '') };
}
