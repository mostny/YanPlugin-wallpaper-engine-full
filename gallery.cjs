'use strict';

// The embedded backend runs under Electron's Node runtime; see server.cjs.
if (process.versions && process.versions.electron) process.noAsar = true;

// Self-service gallery: local web UI for browsing & importing Wallpaper Engine
// wallpapers into Yan. Zero dependencies; binds to 127.0.0.1 only.
// Reuses the bridge logic from server.cjs (same import contract & safety).

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const bridge = require('./server.cjs');

const rawPort = Number(process.env.WE_BRIDGE_GALLERY_PORT || 43197);
const PORT = Number.isInteger(rawPort) && rawPort >= 1 && rawPort <= 65535 ? rawPort : 43197;
const IDLE_EXIT_MS = 30 * 60 * 1000;
const EMBEDDED = process.env.WE_BRIDGE_EMBEDDED === '1';
const NO_BROWSER = process.env.WE_BRIDGE_NO_BROWSER === '1';
const tool = name => bridge.TOOLS.find(t => t.name === name).handler;

function embedAsarPath() {
  const explicit = String(process.env.WE_BRIDGE_ASAR || '').trim();
  if (explicit) return path.resolve(explicit);
  const candidate = path.join(path.dirname(process.execPath), 'resources', 'app.asar');
  try { if (fs.statSync(candidate).isFile()) return candidate; } catch { /* not Electron */ }
  return '';
}

function embedStatus() {
  const setup = path.join(__dirname, 'setup-embedded.cjs');
  const available = fs.existsSync(setup);
  const asarPath = embedAsarPath();
  let embedded = null;
  let error = '';
  if (!asarPath) {
    error = '未找到 Yan 的 app.asar；请让 Yan 执行 we_embed install，或从插件目录启动面板。';
  } else {
    try {
      const patch = require('./embed-patch.cjs');
      const fd = fs.openSync(asarPath, 'r');
      try {
        const header = patch.readHeader(fd);
        embedded = !!patch.getEntry(header.header, 'main.js').unpacked;
      } finally { fs.closeSync(fd); }
    } catch (e) { error = String(e?.message || e); }
  }
  return {
    ok: true, available, embedded, asarPath: asarPath || undefined,
    error: error || undefined, restartRequired: false,
    note: embedded
      ? '已内置；重启 Yan 后设置→壁纸 会显示 WE 面板。'
      : '未内置；内置后需重启 Yan，设置→壁纸 才会显示 WE 面板。'
  };
}

function embedInstall() {
  const setup = path.join(__dirname, 'setup-embedded.cjs');
  if (!fs.existsSync(setup)) {
    return {
      ok: false, available: false,
      error: '当前后端目录没有 setup-embedded.cjs（很可能已经是内置后端）。请在插件目录启动自选面板，或对 Yan 说「把 WE 面板内置到设置页」。'
    };
  }
  const asarPath = embedAsarPath();
  if (!asarPath || !fs.existsSync(asarPath)) {
    return { ok: false, available: true, error: '找不到 Yan 的 app.asar，无法内置。请让 Yan 执行 we_embed install。' };
  }
  const r = spawnSync(process.execPath, [setup, asarPath], {
    encoding: 'utf8', timeout: 100000, windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', WE_BRIDGE_ASAR: asarPath }
  });
  const ok = r.status === 0;
  return {
    ok, available: true, embedded: ok, restartRequired: ok,
    output: String(r.stdout || '').slice(-1500),
    error: ok ? undefined : String(r.stderr || r.stdout || `内置脚本退出码 ${r.status}`).slice(-800)
  };
}

let idleTimer;
function touch() {
  if (EMBEDDED) return; // embedded backend stays running
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => process.exit(0), IDLE_EXIT_MS);
}

function sendJson(res, code, obj) {
  if (res.writableEnded || res.destroyed) return;
  if (res.headersSent) { try { res.end(); } catch { /* ignore */ } return; }
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) { reject(new Error('请求体过大')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };

const diagLog = [];
function pushDiag(entry) {
  diagLog.push({ ...entry, at: Date.now() });
  if (diagLog.length > 40) diagLog.shift();
}

function openBrowser() {
  if (NO_BROWSER) return;
  try {
    spawn('rundll32.exe', ['url.dll,FileProtocolHandler', `http://127.0.0.1:${PORT}`], {
      windowsHide: true, detached: true, stdio: 'ignore'
    }).unref();
  } catch { /* browser open is best-effort */ }
}

const server = http.createServer(async (req, res) => {
  touch();
  const origin = String(req.headers.origin || '');
  const allowedOrigin = !origin
    || origin === 'null'
    || origin === `http://127.0.0.1:${PORT}`
    || origin === `http://localhost:${PORT}`
    || origin.startsWith('file://');
  if (allowedOrigin) {
    const localOrigin = !origin || origin === 'null' || origin.startsWith('file://');
    res.setHeader('Access-Control-Allow-Origin', localOrigin ? '*' : origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    if (!allowedOrigin) { res.writeHead(403); res.end(); return; }
    res.writeHead(204);
    res.end();
    return;
  }
  if (!allowedOrigin) {
    sendJson(res, 403, { ok: false, error: 'forbidden origin' });
    return;
  }
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const page = path.join(__dirname, 'gallery.html');
      if (!fs.existsSync(page)) {
        sendJson(res, 500, { ok: false, error: `面板页面缺失：${page}。请重新执行 we_embed install 或使用插件目录启动面板。` });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(page));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/ping') {
      sendJson(res, 200, { ok: true, pid: process.pid });
      return;
    }
    if (url.pathname === '/api/embed') {
      if (req.method === 'POST') {
        const args = await readBody(req);
        if (args.action === 'install') {
          if (args.confirm !== true) {
            sendJson(res, 200, { ok: false, error: '需要确认：内置会修改 Yan 程序本体 app.asar，并需要重启 Yan。' });
            return;
          }
          sendJson(res, 200, embedInstall());
          return;
        }
        sendJson(res, 200, embedStatus());
        return;
      }
      sendJson(res, 200, embedStatus());
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/list') {
      const { items } = bridge.scanWallpapers();
      sendJson(res, 200, {
        ok: true,
        wallpapers: items.map(i => ({
          id: i.id, title: i.title, type: i.type, source: i.source, tags: i.tags,
          mediaKind: i.mediaKind,
          sizeMB: i.mediaBytes ? Math.round(i.mediaBytes / 1048576 * 10) / 10 : 0,
          importable: i.importable, note: i.note,
          previewUrl: i.previewPath ? `/preview?id=${encodeURIComponent(i.id)}` : ''
        }))
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/preview') {
      const id = url.searchParams.get('id') || '';
      const item = bridge.scanWallpapers().items.find(i => i.id === id);
      if (!item || !item.previewPath || !fs.existsSync(item.previewPath)) {
        sendJson(res, 404, { ok: false, error: '无预览图' });
        return;
      }
      const ext = path.extname(item.previewPath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' });
      const stream = fs.createReadStream(item.previewPath);
      stream.on('error', () => { try { res.destroy(); } catch { /* ignore */ } });
      stream.pipe(res);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/imported') {
      sendJson(res, 200, await tool('we_list_imported')({}));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      sendJson(res, 200, await tool('we_status')({}));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/import') {
      const args = await readBody(req);
      sendJson(res, 200, await tool('we_import_wallpaper')(args));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/optimize') {
      const args = await readBody(req);
      sendJson(res, 200, await tool('we_optimize_imported')(args));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/remove') {
      const args = await readBody(req);
      sendJson(res, 200, await tool('we_remove_imported')(args));
      return;
    }
    if (url.pathname === '/api/diag') {
      if (req.method === 'POST') { pushDiag(await readBody(req)); sendJson(res, 200, { ok: true }); }
      else sendJson(res, 200, { ok: true, log: diagLog });
      return;
    }
    if (url.pathname === '/api/scrim') {
      const mode = require('./scrim-mode.cjs');
      const args = req.method === 'POST' ? await readBody(req) : {};
      const action = args.action || 'status';
      sendJson(res, 200, action === 'status' ? mode.status() : mode.set(action));
      return;
    }
    sendJson(res, 404, { ok: false, error: 'not found' });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: String(error?.message || error) });
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') { openBrowser(); process.exit(0); }
  console.error(error);
  process.exit(1);
});

// Video optimization can legitimately take several minutes; do not let the
// Node HTTP request timeout abort the ffmpeg work halfway through.
server.requestTimeout = 0;
server.timeout = 0;

server.listen(PORT, '127.0.0.1', () => {
  touch();
  openBrowser();
});