'use strict';

// Embedded setup is spawned with Yan Agent.exe + ELECTRON_RUN_AS_NODE.
if (process.versions && process.versions.electron) process.noAsar = true;

// Embed the WE bridge into Yan's wallpaper settings page (re-runnable).
// 1. Copy a stable backend into YanData/we-bridge.
// 2. Switch main.js / renderer/index.html / renderer/styles.css to "unpacked"
//    and write modified copies into app.asar.unpacked (no full repack).
//    - main.js: auto-start the backend at Yan launch.
//    - index.html: inject the settings UI script.
//    - styles.css: strip the old scrim override; modes are applied at runtime
//      by the injected panel, so Yan's material-strength slider keeps working.
// Backup + syntax check + verification + auto-rollback. Re-run after Yan update.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { embed } = require('./embed-patch.cjs');

const executableAsar = path.join(path.dirname(process.execPath), 'resources', 'app.asar');
const ASAR = process.argv[2] || process.env.WE_BRIDGE_ASAR
  || (fs.existsSync(executableAsar) ? executableAsar : '');
if (!ASAR) {
  console.error('找不到 app.asar。请通过 we_embed install 调用，或传入 Yan 的 resources/app.asar 路径。');
  process.exit(1);
}
const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const configuredData = String(process.env.WE_BRIDGE_YAN_DATA || '').trim();
const dataDir = configuredData ? path.resolve(configuredData) : path.join(appData, 'yan-agent', 'YanData');
const embedDir = path.join(dataDir, 'we-bridge');
const rawPort = Number(process.env.WE_BRIDGE_GALLERY_PORT || 43197);
const PORT = Number.isInteger(rawPort) && rawPort >= 1 && rawPort <= 65535 ? rawPort : 43197;

// 1. stable backend
fs.mkdirSync(embedDir, { recursive: true });
for (const f of ['server.cjs', 'gallery.cjs', 'gallery.html', 'scrim-mode.cjs', 'embed-patch.cjs', 'we-bridge-ui.js']) {
  fs.copyFileSync(path.join(__dirname, f), path.join(embedDir, f));
}
console.log('[1/2] 后端已复制到', embedDir, '| 遮罩由界面热切换');

// 2. prepare transforms
const HOOK = [
  '// wallpaper-engine-bridge:autostart',
  'try {',
  "  const { spawn } = require('child_process');",
  "  const path = require('path');",
  "  const fs = require('fs');",
  "  const dataDir = __WE_DATA__;",
  "  const gallery = path.join(dataDir, 'we-bridge', 'gallery.cjs');",
  "  const asarPath = path.join(path.dirname(process.execPath), 'resources', 'app.asar');",
  '  if (fs.existsSync(gallery)) {',
  '    app.whenReady().then(() => {',
  '      try {',
  '        const child = spawn(process.execPath, [gallery], {',
  "          detached: true, stdio: 'ignore', windowsHide: true,",
  "          env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1', WE_BRIDGE_GALLERY_PORT: '__WE_PORT__', WE_BRIDGE_YAN_DATA: __WE_DATA__, WE_BRIDGE_EMBEDDED: '1', WE_BRIDGE_NO_BROWSER: '1', WE_BRIDGE_ASAR: asarPath })",
  '        });',
  '        child.unref();',
  '      } catch (e) {}',
  '    });',
  '  }',
  '} catch (e) {}'
].join('\n').replace(/__WE_PORT__/g, String(PORT)).replace(/__WE_DATA__/g, JSON.stringify(dataDir));

const ui = fs.readFileSync(path.join(__dirname, 'we-bridge-ui.js'), 'utf8');
const UI_BLOCK = '<!-- wallpaper-engine-bridge:ui --><script src="we-bridge-ui.js" data-port="' + PORT + '"></script>';

const RENDERER_HOOK = [
  '// wallpaper-engine-bridge:hot',
  'window.__weBridgeRefresh = async function () {',
  '  var diag = { src: "hook", ts: Date.now() };',
  '  try {',
  '    diag.apiType = typeof api;',
  '    diag.getConfigType = typeof (api && api.getConfig);',
  '    const cfg = await api.getConfig();',
  '    diag.gotConfig = !!cfg;',
  '    diag.wallpaperId = cfg && cfg.wallpaper && cfg.wallpaper.id;',
  '    try { if (state && typeof state === "object") state.config = cfg; } catch (e) { diag.stateErr = String(e); }',
  '    applyWallpaperConfig(cfg);',
  '    diag.applied = true;',
  '    var v = document.getElementById("wallpaperVideo");',
  '    if (v) diag.video = { src: (v.currentSrc || v.src || "").slice(-60), ready: v.readyState, paused: v.paused, err: v.error && v.error.code, net: v.networkState, active: v.classList.contains("active") };',
  '    [300, 1000, 2000].forEach(function (ms) { setTimeout(function () { try { var vv = document.getElementById("wallpaperVideo"); if (vv && vv.getAttribute("src") && vv.classList.contains("active") && vv.paused) { vv.muted = true; var pp = vv.play(); if (pp && pp.catch) pp.catch(function () {}); } } catch (e) {} }, ms); });',
  '  } catch (e) { diag.error = String((e && e.message) || e); }',
  '  try { fetch("http://127.0.0.1:43197/api/diag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(diag) }).catch(function(){}); } catch (e) {}',
  '  return diag;',
  '};'
].join('\n');

// Video wallpapers are the least reliable layer: a 4K/HEVC clip on a machine
// without the right decoder shows a black frame with no feedback. Every
// imported video now gets a sibling *.poster.jpg; this guard sets it as the
// <video> poster and, if decoding fails or stalls, shows it on the wallpaper
// layer instead of leaving a black screen. Video imports are normalized to
// H.264/1080p by the backend, so this is a safety net, not the main fix.
const RENDERER_GUARD = [
  '// wallpaper-engine-bridge:video-guard',
  '(function () {',
  '  if (window.__weVideoGuard) return;',
  '  window.__weVideoGuard = true;',
  '  var POSTER_RE = /\\.(mp4|webm|m4v|mov|ogv)([?#].*)?$/i;',
  '  function posterFor(src) { return String(src || "").replace(POSTER_RE, ".poster.jpg"); }',
  '  function layerEl() { return document.getElementById("wallpaperLayer"); }',
  '  function clearFallback() {',
  '    var layer = layerEl();',
  '    if (!layer) return;',
  '    var fallback = layer.dataset.weFallback || "";',
  '    if (!fallback) return;',
  '    if ((layer.style.backgroundImage || "").indexOf(fallback) >= 0) layer.style.backgroundImage = "none";',
  '    layer.dataset.weFallback = "";',
  '  }',
  '  function applyFallback(poster) {',
  '    var layer = layerEl();',
  '    if (!layer || !poster) return;',
  '    if (layer.dataset.weFallback !== poster) {',
  '      layer.dataset.weFallback = poster;',
  '      layer.style.backgroundImage = "url(" + JSON.stringify(poster) + ")";',
  '    }',
  '  }',
  '  function check() {',
  '    var v = document.getElementById("wallpaperVideo");',
  '    if (!v) return;',
  '    var attr = v.getAttribute("src") || "";',
  '    if (!attr) { v.style.visibility = ""; clearFallback(); return; }',
  '    var src = v.currentSrc || v.src || attr;',
  '    var poster = posterFor(src);',
  '    if (poster && v.getAttribute("poster") !== poster) v.setAttribute("poster", poster);',
  '    if (v.error || v.networkState === 3) {',
  '      applyFallback(poster);',
  '      v.style.visibility = "hidden";',
  '      return;',
  '    }',
  '    if (v.classList.contains("active") && v.readyState === 0) {',
  '      if (v.dataset.weWaitSrc !== src) { v.dataset.weWaitSrc = src; v.dataset.weWaitSince = String(Date.now()); }',
  '      else if (Date.now() - Number(v.dataset.weWaitSince || 0) > 9000) {',
  '        applyFallback(poster);',
  '        v.style.visibility = "hidden";',
  '        return;',
  '      }',
  '    }',
  '    if (v.readyState >= 2) { v.style.visibility = ""; clearFallback(); }',
  '  }',
  '  function bind() {',
  '    var v = document.getElementById("wallpaperVideo");',
  '    if (!v || v.dataset.weVideoGuard) return;',
  '    v.dataset.weVideoGuard = "1";',
  '    ["error", "stalled", "emptied"].forEach(function (name) {',
  '      v.addEventListener(name, function () { setTimeout(check, 150); });',
  '    });',
  '    ["loadeddata", "playing", "canplay"].forEach(function (name) {',
  '      v.addEventListener(name, function () { v.style.visibility = ""; clearFallback(); });',
  '    });',
  '    try {',
  '      new MutationObserver(function () { setTimeout(check, 60); }).observe(v, { attributes: true, attributeFilter: ["src", "class"] });',
  '    } catch (e) {}',
  '  }',
  '  bind();',
  '  setInterval(bind, 1500);',
  '})();'
].join('\n');

const SCRIM_MARKERS = ['/* wallpaper-engine-bridge:scrim-off */', '/* wallpaper-engine-bridge:override */'];
function cleanScrim(css) {
  let idx = css.length;
  for (const m of SCRIM_MARKERS) { const i = css.indexOf(m); if (i >= 0 && i < idx) idx = i; }
  return css.slice(0, idx);
}

const files = [
  {
    relPath: 'main.js',
    marker: '// wallpaper-engine-bridge:autostart',
    syntaxCheck: true,
    transform: clean => clean.replace(/\s+$/, '') + '\n\n' + HOOK + '\n'
  },
  {
    relPath: 'renderer/index.html',
    marker: '<!-- wallpaper-engine-bridge:ui -->',
    blockEnd: '</script>',
    transform: clean => {
      let html = clean;
      // CSP: allow the local backend for fetch (connect-src) and previews
      // (img-src). Keep it in sync with the configured panel port. Idempotent.
      const localOrigin = `http://127.0.0.1:${PORT}`;
      html = html.replace(/(connect-src[^;]*?)http:\/\/127\.0\.0\.1:\d+/g, `$1${localOrigin}`);
      html = html.replace(/(img-src[^;]*?)http:\/\/127\.0\.0\.1:\d+/g, `$1${localOrigin}`);
      if (!/connect-src[^;]*http:\/\/127\.0\.0\.1/.test(html)) {
        html = html.replace(/connect-src 'self'/, `connect-src 'self' ${localOrigin}`);
      }
      if (!/img-src[^;]*http:\/\/127\.0\.0\.1/.test(html)) {
        html = html.replace(/img-src 'self'/, `img-src 'self' ${localOrigin}`);
      }
      const i = html.lastIndexOf('</body>');
      return i >= 0 ? html.slice(0, i) + UI_BLOCK + '\n' + html.slice(i) : html + UI_BLOCK;
    }
  },
  {
    relPath: 'renderer/styles.css',
    transform: clean => cleanScrim(clean).replace(/\s+$/, '') + '\n'
  },
  {
    relPath: 'renderer/renderer.js',
    marker: '// wallpaper-engine-bridge:hot',
    syntaxCheck: true,
    transform: clean => clean.replace(/\s+$/, '') + '\n\n' + RENDERER_HOOK + '\n\n' + RENDERER_GUARD + '\n'
  }
];

const r = embed(ASAR, files, [{ relPath: 'renderer/we-bridge-ui.js', content: ui }]);
console.log('[2/2] 注入:', JSON.stringify(r, null, 2));
if (r.ok) {
  console.log('\n✅ 内置完成。重启 Yan，打开 设置 → 壁纸，即可看到 Wallpaper Engine 面板（浏览/导入/遮罩开关）。');
} else {
  console.log('\n⚠️ 失败（已自动回滚）：' + r.error);
}
process.exit(r.ok ? 0 : 1);