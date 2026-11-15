'use strict';

// Treated app.asar as a plain file; disable Electron's asar interception.
if (process.versions && process.versions.electron) process.noAsar = true;

// Embed WE bridge into Yan by switching specific packed files to "unpacked".
// Electron loads a file from app.asar.unpacked/<path> when its asar header
// entry is {unpacked:true}. We replace the target entries with {unpacked:true}
// (which SHRINKS the header, so it always fits the original header region) and
// write modified copies into app.asar.unpacked. No full repack needed; all
// other files keep their original offsets. Asar integrity validation is
// disabled in Yan, so header edits are accepted.
//
// Reversible: restore copies the pristine backup over app.asar (entries become
// packed again) and removes the injected unpacked copies.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const BACKUP_SUFFIX = '.we-bridge-bak';

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function readHeader(fd) {
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  if (head.readUInt32LE(0) !== 4) throw new Error('不是有效的 asar 文件');
  const headerBufSize = head.readUInt32LE(4);
  const payloadSize = head.readUInt32LE(8);
  const jsonLen = head.readUInt32LE(12);
  const jb = Buffer.alloc(jsonLen);
  fs.readSync(fd, jb, 0, jsonLen, 16);
  return { headerBufSize, payloadSize, jsonLen, header: JSON.parse(jb.toString('utf8')), dataOffset: 8 + headerBufSize };
}

function getEntry(header, relPath) {
  let node = header;
  for (const p of relPath.split('/')) {
    node = node.files?.[p];
    if (!node) throw new Error(`asar 中找不到 ${relPath}`);
  }
  return node;
}
function setEntry(header, relPath, value) {
  const parts = relPath.split('/');
  let node = header;
  for (let i = 0; i < parts.length - 1; i++) node = node.files[parts[i]];
  node.files[parts[parts.length - 1]] = value;
}
function readFileEntry(fd, h, entry) {
  const buf = Buffer.alloc(entry.size);
  fs.readSync(fd, buf, 0, entry.size, h.dataOffset + Number(entry.offset));
  return buf;
}
function stripBlock(content, marker, blockEnd) {
  const i = content.indexOf(marker);
  if (i < 0) return content;
  if (!blockEnd) return content.slice(0, i).replace(/\s+$/, '');
  const j = content.indexOf(blockEnd, i);
  return j < 0 ? content.slice(0, i) : content.slice(0, i) + content.slice(j + blockEnd.length);
}
function syntaxCheckJs(content) {
  const tmp = path.join(os.tmpdir(), `we-syntax-${crypto.randomUUID()}.js`);
  fs.writeFileSync(tmp, content);
  try {
    const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8', timeout: 20000, windowsHide: true });
    if (r.status !== 0) throw new Error('JS 语法校验失败：' + (r.stderr || '').slice(0, 300));
  } finally { try { fs.unlinkSync(tmp); } catch { } }
}

function packageVersionOf(fd, h, asarPath) {
  try {
    const entry = getEntry(h.header, 'package.json');
    const buf = entry.unpacked
      ? fs.readFileSync(path.join(asarPath + '.unpacked', 'package.json'))
      : readFileEntry(fd, h, entry);
    const parsed = JSON.parse(buf.toString('utf8'));
    return String(parsed.version || '');
  } catch {
    return '';
  }
}

function backupInfo(backup) {
  let fd;
  try {
    fd = fs.openSync(backup, 'r');
    const h = readHeader(fd);
    let embedded = false;
    try { embedded = !!getEntry(h.header, 'main.js').unpacked; } catch { /* ignore */ }
    return { version: packageVersionOf(fd, h, backup), embedded };
  } catch {
    return { version: '', embedded: false };
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { }
  }
}

// files: [{relPath, transform, marker?, blockEnd?, syntaxCheck?}]
// newFiles: [{relPath, content}] — added as unpacked entries (e.g. external UI script)
function embed(asarPath, files, newFiles = []) {
  if (!fs.existsSync(asarPath)) return { ok: false, error: `找不到 app.asar：${asarPath}` };
  const unpackedRoot = asarPath + '.unpacked';
  const backup = asarPath + BACKUP_SUFFIX;
  let fd;
  try { fd = fs.openSync(asarPath, 'r+'); }
  catch (e) { return { ok: false, error: `无法写入 app.asar（Yan 可能占用）。请关闭 Yan 后重试。[${e.code || e.message}]`, locked: true }; }

  const written = [];
  try {
    const h = readHeader(fd);
    const alreadyEmbedded = (() => {
      try { return !!getEntry(h.header, 'main.js').unpacked; } catch { return false; }
    })();
    if (!fs.existsSync(backup)) {
      fs.copyFileSync(asarPath, backup);
    } else if (!alreadyEmbedded) {
      // A Yan update replaces app.asar with a pristine build. Refresh the
      // rollback backup when it is from another version (or itself embedded),
      // otherwise a failed re-embed would restore an old Yan.
      const info = backupInfo(backup);
      const currentVersion = packageVersionOf(fd, h, asarPath);
      if (info.embedded || (currentVersion && currentVersion !== info.version)) {
        try { fs.copyFileSync(asarPath, backup); } catch { /* keep old backup if refresh fails */ }
      }
    }

    // prepare modified content for each target
    const prepared = [];
    for (const f of files) {
      const entry = getEntry(h.header, f.relPath);
      let current;
      if (entry.unpacked) {
        const up = path.join(unpackedRoot, f.relPath);
        current = fs.existsSync(up) ? fs.readFileSync(up, 'utf8') : '';
      } else {
        current = readFileEntry(fd, h, entry).toString('utf8');
      }
      const clean = f.marker ? stripBlock(current, f.marker, f.blockEnd) : current;
      const newContent = f.transform(clean);
      if (f.syntaxCheck) syntaxCheckJs(newContent);
      prepared.push({ ...f, newContent });
    }

    // write modified copies into unpacked dir
    for (const p of prepared) {
      const dest = path.join(unpackedRoot, p.relPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, p.newContent, 'utf8');
      written.push(dest);
      setEntry(h.header, p.relPath, { unpacked: true, size: Buffer.byteLength(p.newContent, 'utf8') });
    }

    // add new files as unpacked entries
    for (const nf of newFiles) {
      const dest = path.join(unpackedRoot, nf.relPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, nf.content, 'utf8');
      written.push(dest);
      setEntry(h.header, nf.relPath, { unpacked: true, size: Buffer.byteLength(nf.content, 'utf8') });
    }

    // rewrite header (shrinks because entries become {unpacked:true})
    const newJsonBuf = Buffer.from(JSON.stringify(h.header), 'utf8');
    if (4 + newJsonBuf.length > h.payloadSize) {
      throw new Error('头部容量不足（Unexpected）');
    }
    const region = Buffer.alloc(h.dataOffset - 16, 0x20); // spaces, exactly the header string region
    newJsonBuf.copy(region, 0);
    fs.writeSync(fd, region, 0, region.length, 16);
    const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32LE(newJsonBuf.length, 0);
    fs.writeSync(fd, lenBuf, 0, 4, 12);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;

    // verify: header parses, targets unpacked, copies exist, others intact
    const vfd = fs.openSync(asarPath, 'r');
    try {
      const vh = readHeader(vfd);
      for (const p of prepared) {
        const e = getEntry(vh.header, p.relPath);
        if (!e.unpacked) throw new Error(`${p.relPath} 未标记 unpacked`);
        const up = path.join(unpackedRoot, p.relPath);
        if (sha256(fs.readFileSync(up)) !== sha256(Buffer.from(p.newContent, 'utf8'))) throw new Error(`${p.relPath} 副本校验失败`);
      }
      const sample = getEntry(vh.header, 'renderer/renderer.js');
      if (sample.integrity?.hash) {
        const d = readFileEntry(vfd, vh, sample);
        if (sha256(d) !== sample.integrity.hash) throw new Error('renderer.js 完整性校验失败');
      }
    } finally { fs.closeSync(vfd); }

    return { ok: true, embedded: true, files: prepared.map(p => p.relPath), unpackedRoot, backup, restartRequired: true };
  } catch (e) {
    if (fd !== null) try { fs.closeSync(fd); } catch { }
    // rollback: restore backup + remove written copies
    if (fs.existsSync(backup)) try { fs.copyFileSync(backup, asarPath); } catch { }
    for (const w of written) try { fs.unlinkSync(w); } catch { }
    return { ok: false, error: String(e.message || e) };
  }
}

function restore(asarPath) {
  const backup = asarPath + BACKUP_SUFFIX;
  if (!fs.existsSync(backup)) return { ok: false, error: '没有备份，无法还原。' };

  // Guard: if the current asar is not embedded (e.g. Yan was upgraded and
  // replaced it), restoring an old backup would downgrade Yan. Do nothing.
  let currentVersion = '';
  let embedded = false;
  let fd;
  try {
    fd = fs.openSync(asarPath, 'r');
    const h = readHeader(fd);
    currentVersion = packageVersionOf(fd, h, asarPath);
    try { embedded = !!getEntry(h.header, 'main.js').unpacked; } catch { /* ignore */ }
  } catch (e) {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { }
    return { ok: false, error: `无法读取 app.asar：${e.message || e}` };
  }
  try { fs.closeSync(fd); } catch { }
  if (!embedded) {
    return { ok: true, restored: false, restartRequired: false, note: '当前 Yan 未内置（可能已升级或已还原），无需操作。' };
  }
  const previous = backupInfo(backup);
  if (previous.embedded) return { ok: false, error: '回滚备份本身是已内置状态，无法安全还原。请重新安装 Yan 或联系维护者。' };
  if (currentVersion && previous.version && currentVersion !== previous.version) {
    return { ok: false, error: `回滚备份版本 ${previous.version} 与当前 Yan ${currentVersion} 不一致，为安全起见未还原。请先重新执行 we_embed install 刷新备份。` };
  }

  try { fs.copyFileSync(backup, asarPath); }
  catch (e) { return { ok: false, error: `还原失败（Yan 可能占用）。请关闭 Yan 后重试。[${e.code || e.message}]`, locked: true }; }
  // remove injected unpacked copies (header now packed again, but clean up)
  const unpackedRoot = asarPath + '.unpacked';
  for (const rel of ['main.js', 'renderer/index.html', 'renderer/styles.css', 'renderer/renderer.js', 'renderer/we-bridge-ui.js']) {
    try { fs.unlinkSync(path.join(unpackedRoot, rel)); } catch { }
  }
  return { ok: true, restored: true, restartRequired: true, note: '已还原 Yan 原始程序。重启生效。' };
}

module.exports = { embed, restore, readHeader, getEntry, readFileEntry };