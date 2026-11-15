/* wallpaper-engine-bridge embedded settings UI */
(function () {
  'use strict';
  if (window.__weBridgeUI) return;
  window.__weBridgeUI = true;

  var PORT = (function () {
    try {
      var script = document.currentScript;
      var attr = script && script.getAttribute && script.getAttribute('data-port');
      var match = attr ? /^(\d+)$/.exec(attr) : null;
      var value = match ? Number(match[1]) : 0;
      if (!value) {
        var src = (script && script.src) || '';
        var query = /[?&]port=(\d+)/.exec(src);
        value = query ? Number(query[1]) : 0;
      }
      return Number.isInteger(value) && value >= 1 && value <= 65535 ? value : 43197;
    } catch (e) { return 43197; }
  })();
  var API = 'http://127.0.0.1:' + PORT;
  var PANEL_ID = 'we-bridge-panel';
  var ALL = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function node(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function typeLabel(type) {
    if (type === 'video') return 'video 动态';
    if (type === 'scene' || type === 'web' || type === 'application') return type + ' 静态';
    return type;
  }
  function api(p, opts) {
    return fetch(API + p, opts).then(function (r) { return r.json(); })
      .catch(function (e) { return { ok: false, error: '后端未运行：' + e.message }; });
  }
  function toast(msg, kind) {
    var box = document.getElementById('we-bridge-toast');
    if (!box) { box = node('<div id="we-bridge-toast"></div>'); document.body.appendChild(box); }
    // Deduplicate repeated clicks and keep at most three toasts on screen.
    Array.prototype.slice.call(box.children).forEach(function (el) {
      if (el.dataset && el.dataset.text === msg) el.remove();
    });
    while (box.children.length >= 3) box.firstChild.remove();
    var t = node('<div class="we-bridge-toast-item ' + (kind || '') + '">' + esc(msg) + '</div>');
    t.dataset.text = msg;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
  }

  var STYLE = ''
    + '#we-bridge-panel{background:color-mix(in srgb,var(--bg,#0d1117) 82%,transparent);border:1px solid color-mix(in srgb,var(--border,#2d333b) 78%,transparent);border-radius:14px;padding:14px 16px;box-shadow:0 12px 36px rgba(0,0,0,.28);-webkit-backdrop-filter:blur(16px) saturate(1.06);backdrop-filter:blur(16px) saturate(1.06)}'
    + '#we-bridge-panel h2,#we-bridge-panel .we-title,#we-bridge-panel .we-imp .nm{color:var(--text,#e6edf3)}'
    + '#we-bridge-panel .general-section-heading p,#we-bridge-panel .we-note,#we-bridge-panel .we-imp .tech{color:var(--text-secondary,#8b949e)}'
    + '#we-bridge-panel .we-bridge-scrim{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0 16px;padding:8px 10px;border-radius:10px;background:color-mix(in srgb,var(--bg,#0d1117) 55%,transparent);font-size:13px}'
    + '#we-bridge-panel .we-bridge-scrim>span:first-child{color:var(--text-secondary,#8b949e);margin-right:4px}'
    + '#we-bridge-panel button{cursor:pointer;border:1px solid color-mix(in srgb,var(--border,#2d333b) 85%,transparent);background:color-mix(in srgb,var(--bg-elev,#1c2129) 92%,transparent);color:var(--text,#e6edf3);border-radius:8px;padding:6px 12px;font-size:12.5px;font-weight:500}'
    + '#we-bridge-panel button:hover{filter:brightness(1.18)}'
    + '#we-bridge-panel button:disabled{opacity:.55;cursor:wait}'
    + '#we-bridge-panel button.active{background:color-mix(in srgb,#2f81f7 24%,var(--bg-elev,#1c2129));border-color:#2f81f7;color:#79b8ff;font-weight:600}'
    + '#we-bridge-panel button.primary{background:#2f81f7;border-color:#2f81f7;color:#fff}'
    + '#we-bridge-panel button.danger{color:#f85149}'
    + '#we-bridge-panel .we-bridge-scrim-status{font-size:12px;color:var(--text-secondary,#8b949e)}'
    + '#we-bridge-panel .we-bridge-scrim-hint{font-size:11px;line-height:1.45;color:var(--text-secondary,#8b949e);margin:-8px 0 14px;padding:0 2px}'
    + '#we-bridge-panel .we-bridge-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}'
    + '#we-bridge-panel input[type=search],#we-bridge-panel select{background:color-mix(in srgb,var(--bg,#161b22) 92%,transparent);border:1px solid color-mix(in srgb,var(--border,#2d333b) 85%,transparent);color:var(--text,#e6edf3);border-radius:8px;padding:6px 10px;font-size:13px;outline:none}'
    + '#we-bridge-panel input[type=search]{width:220px}'
    + '#we-bridge-panel .we-bridge-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}'
    + '#we-bridge-panel .we-card{border:1px solid color-mix(in srgb,var(--border,#2d333b) 82%,transparent);border-radius:10px;overflow:hidden;background:color-mix(in srgb,var(--bg-elev,#1c2129) 90%,transparent);display:flex;flex-direction:column}'
    + '#we-bridge-panel .we-thumb{aspect-ratio:16/9;background:#0a0d12 center/cover no-repeat;position:relative}'
    + '#we-bridge-panel .we-thumb img{width:100%;height:100%;object-fit:cover;display:block}'
    + '#we-bridge-panel .we-badge{position:absolute;top:6px;left:6px;font-size:10.5px;padding:1px 7px;border-radius:20px;background:rgba(0,0,0,.72);color:#fff}'
    + '#we-bridge-panel .we-badge.video{background:rgba(47,129,247,.9)}'
    + '#we-bridge-panel .we-badge.scene,#we-bridge-panel .we-badge.web,#we-bridge-panel .we-badge.application{background:rgba(210,153,34,.9)}'
    + '#we-bridge-panel .we-size{position:absolute;top:6px;right:6px;font-size:10.5px;padding:1px 7px;border-radius:20px;background:rgba(0,0,0,.72);color:#ddd}'
    + '#we-bridge-panel .we-body{padding:8px 10px 10px;display:flex;flex-direction:column;gap:6px;flex:1}'
    + '#we-bridge-panel .we-title{font-size:12.5px;font-weight:600;line-height:1.3}'
    + '#we-bridge-panel .we-note{font-size:10.5px;line-height:1.35;flex:1}'
    + '#we-bridge-panel .we-actions{display:flex;gap:6px}'
    + '#we-bridge-panel .we-actions button{flex:1;padding:5px 8px;font-size:11.5px}'
    + '#we-bridge-panel h3{font-size:13px;color:var(--text-secondary,#8b949e);margin:18px 0 10px}'
    + '#we-bridge-panel .we-imp{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid color-mix(in srgb,var(--border,#2d333b) 82%,transparent);border-radius:8px;padding:7px 12px;margin-bottom:6px;font-size:12.5px;background:color-mix(in srgb,var(--bg-elev,#1c2129) 78%,transparent)}'
    + '#we-bridge-panel .we-imp .nm{font-weight:600}'
    + '#we-bridge-panel .we-imp .tech{font-size:10.5px}'
    + '#we-bridge-panel .we-imp .tech.bad{color:#d29922}'
    + '#we-bridge-panel .we-imp .sel{font-size:10.5px;color:#3fb950;border:1px solid #3fb950;padding:0 7px;border-radius:20px}'
    + '#we-bridge-panel .we-imp .sp{flex:1}'
    + '#we-bridge-panel .we-bridge-optimize{display:flex;align-items:center;gap:10px;margin:2px 0 10px}'
    + '#we-bridge-panel .we-bridge-optimize .we-opt-status{font-size:11px;color:var(--text-secondary,#8b949e)}'
    + '#we-bridge-panel .we-empty{color:var(--text-secondary,#8b949e);font-size:12.5px;padding:10px 0}'
    + '#we-bridge-toast{position:fixed;bottom:22px;right:22px;left:auto;transform:none;z-index:99999;display:flex;flex-direction:column;gap:8px;align-items:flex-end;pointer-events:none}'
    + '.we-bridge-toast-item{background:color-mix(in srgb,var(--bg-elev,#161b22) 94%,transparent);border:1px solid color-mix(in srgb,var(--border,#2d333b) 90%,transparent);border-left:3px solid #3fb950;color:var(--text,#e6edf3);padding:9px 16px;border-radius:9px;font-size:13px;max-width:420px;box-shadow:0 6px 24px rgba(0,0,0,.5);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}'
    + '.we-bridge-toast-item.err{border-left-color:#f85149}'
    + '.we-bridge-toast-item.info{border-left-color:#2f81f7}';

  function buildPanel() {
    var panel = node(''
      + '<section class="general-settings-section" id="' + PANEL_ID + '">'
      + '<div class="general-section-heading"><div>'
      + '<h2>Wallpaper Engine</h2>'
      + '<p>从你的 Wallpaper Engine 库挑选导入壁纸 · 视频自动转 1080p/H.264 · <b>video 动态，scene/web 只能静态图</b> · 可一键修复旧视频 · 控制主题遮罩</p>'
      + '</div></div>'
      + '<div class="we-bridge-scrim"><span>主题遮罩</span>'
      + '<button data-scrim="restore" title="跟随 Yan 的材质强度滑杆（推荐，滑杆可正常调节）">跟随滑杆</button>'
      + '<button data-scrim="off" title="只去掉壁纸全屏遮罩；会接管材质强度滑杆">关闭遮罩</button>'
      + '<button data-scrim="fusion" title="壁纸通透 + 消息玻璃卡；会接管材质强度滑杆">融合模式</button>'
      + '<button data-scrim="full" title="壁纸与面板全部透明；会接管滑杆，文字可能难读">全屏通透</button>'
      + '<span class="we-bridge-scrim-status"></span></div>'
      + '<div class="we-bridge-scrim-hint">「关闭遮罩 / 融合 / 全透」会接管 Yan 的「材质强度」滑杆；想自己调节壁纸明显度，点「跟随滑杆」即可恢复。</div>'
      + '<div class="we-bridge-toolbar">'
      + '<input type="search" class="we-q" placeholder="搜索标题 / 标签…">'
      + '<select class="we-type"><option value="">全部类型</option><option value="video">video 动态</option><option value="scene">scene 静态</option><option value="web">web 静态</option><option value="application">application 静态</option></select>'
      + '<button class="we-refresh">刷新</button></div>'
      + '<div class="we-bridge-grid"></div>'
      + '<h3>已导入 Yan 的壁纸</h3>'
      + '<div class="we-bridge-optimize"><button class="we-opt-all">一键修复已导入视频</button><span class="we-opt-status"></span></div>'
      + '<div class="we-bridge-imported"></div>'
      + '</section>');
    return panel;
  }

  function renderGrid(panel) {
    var q = (panel.querySelector('.we-q').value || '').trim().toLowerCase();
    var type = panel.querySelector('.we-type').value;
    var list = ALL.filter(function (w) {
      return (!type || w.type === type)
        && (!q || w.title.toLowerCase().indexOf(q) >= 0 || (w.tags || []).some(function (t) { return t.toLowerCase().indexOf(q) >= 0; }));
    });
    var grid = panel.querySelector('.we-bridge-grid');
    if (!list.length) { grid.innerHTML = '<div class="we-empty">没有匹配的壁纸（点刷新加载，或确认后端已运行）</div>'; return; }
    grid.innerHTML = list.slice(0, 60).map(function (w) {
      return '<div class="we-card">'
        + '<div class="we-thumb">' + (w.previewUrl ? '<img loading="lazy" src="' + API + esc(w.previewUrl) + '">' : '')
        + '<span class="we-badge ' + esc(w.type) + '">' + esc(typeLabel(w.type)) + '</span>'
        + '<span class="we-size">' + (w.sizeMB ? w.sizeMB + 'MB' : '') + '</span></div>'
        + '<div class="we-body"><div class="we-title">' + esc(w.title) + '</div>'
        + '<div class="we-note">' + esc(w.note || '') + '</div>'
        + '<div class="we-actions"><button class="primary" data-import="' + esc(w.id) + '" ' + (w.importable ? '' : 'disabled') + '>导入并应用</button>'
        + '<button data-import-lib="' + esc(w.id) + '" ' + (w.importable ? '' : 'disabled') + '>仅入库</button></div></div></div>';
    }).join('');
  }

  function loadList(panel) {
    api('/api/list').then(function (r) {
      if (r.ok) { ALL = r.wallpapers; renderGrid(panel); }
      else { panel.querySelector('.we-bridge-grid').innerHTML = '<div class="we-empty">' + esc(r.error || '加载失败') + '</div>'; }
    });
  }
  function techText(e) {
    if (e.kind !== 'video') return '图片';
    if (!e.technical) return e.fileExists ? '视频（未检测编码）' : '文件缺失';
    var t = e.technical;
    return (t.codec || '?') + ' ' + (t.width || '?') + 'x' + (t.height || '?') + (t.fps ? '@' + t.fps : '') + (t.safe ? '' : ' · 建议修复');
  }
  function loadImported(panel) {
    api('/api/imported').then(function (r) {
      var box = panel.querySelector('.we-bridge-imported');
      var status = panel.querySelector('.we-opt-status');
      if (!r.ok) { box.innerHTML = '<div class="we-empty">' + esc(r.error) + '</div>'; return; }
      var bits = [];
      if (r.needingFix) bits.push(r.needingFix + ' 个视频需要修复');
      if (r.missingPoster) bits.push(r.missingPoster + ' 个缺备用图');
      if (status) status.textContent = bits.length ? bits.join('，') : '视频已统一为安全规格';
      if (!r.entries.length) { box.innerHTML = '<div class="we-empty">还没有导入过 WE 壁纸</div>'; return; }
      box.innerHTML = r.entries.map(function (e) {
        return '<div class="we-imp"><span class="nm">' + esc(e.name) + '</span>'
          + (e.selected ? '<span class="sel">当前</span>' : '')
          + '<span class="tech' + (e.needsFix ? ' bad' : '') + '">' + esc(techText(e)) + (e.kind === 'video' && e.posterExists ? ' · 备用图' : '') + '</span>'
          + (e.fileExists ? '' : '<span class="tech bad">文件缺失</span>')
          + '<span class="sp"></span>'
          + (e.kind === 'video' && e.fileExists && (e.needsFix || !e.posterExists)
            ? '<button data-opt="' + esc(e.id) + '">' + (e.needsFix ? '修复兼容性' : '补备用图') + '</button>'
            : '')
          + '<button class="danger" data-remove="' + esc(e.id) + '">移除并删文件</button></div>';
      }).join('');
    });
  }
  function optimize(panel, id, btn) {
    var bulk = !id;
    var status = panel.querySelector('.we-opt-status');
    var allBtn = panel.querySelector('.we-opt-all');
    var buttons = bulk ? [allBtn] : [btn];
    buttons.forEach(function (b) { if (b) b.disabled = true; });
    var old = btn ? btn.textContent : allBtn.textContent;
    if (btn) btn.textContent = '修复中…'; else allBtn.textContent = '修复中…';
    if (status) status.textContent = bulk ? '正在检查全部视频，可能需要几分钟…' : '正在重编码视频…';
    toast(bulk ? '正在修复全部视频壁纸，大视频可能需要几分钟。' : '正在重编码视频，可能需要几分钟。', 'info');
    api('/api/optimize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id ? { id: id } : {}) })
      .then(function (r) {
        if (r.ok) {
          var msg = r.optimized ? ('已修复 ' + r.optimized + ' 个视频壁纸。') : (r.note || '无需修复。');
          toast(msg + (r.pending ? (' 还有 ' + r.pending + ' 个，请再次点击。') : ''), 'ok');
          loadImported(panel);
          if (r.optimized) refreshWallpaper();
        } else toast('修复失败：' + (r.error || ''), 'err');
      })
      .finally(function () {
        buttons.forEach(function (b) { if (b) b.disabled = false; });
        if (btn) btn.textContent = old; else allBtn.textContent = old;
      });
  }
  var FUSION_RULES = '.app.wallpaper-enabled .msg.assistant .msg-body{background:color-mix(in srgb, var(--bg-elev) 58%, transparent);-webkit-backdrop-filter:blur(14px) saturate(1.05);backdrop-filter:blur(14px) saturate(1.05);border:1px solid color-mix(in srgb, var(--text) 10%, transparent);border-radius:12px;padding:12px 16px;}'
    + '.app.wallpaper-enabled .msg.assistant .msg-body table{background:color-mix(in srgb, var(--bg) 72%, transparent);}'
    + '.app.wallpaper-enabled .msg.assistant .msg-body th,.app.wallpaper-enabled .msg.assistant .msg-body td{border-color:color-mix(in srgb, var(--text) 16%, transparent);}'
    + '.app.wallpaper-enabled .msg.assistant .msg-body pre{background:color-mix(in srgb, var(--bg) 78%, transparent);}'
    + '.app.wallpaper-enabled .scheduled-run-label{background:color-mix(in srgb, var(--bg-elev) 60%, transparent);border-radius:999px;padding:2px 10px;width:max-content;margin-left:auto;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);}'
    + '.app.wallpaper-enabled .toast,body.wallpaper-enabled .toast{background:color-mix(in srgb, var(--bg-elev2, var(--bg-elev)) 86%, transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);}';
  var SCRIM_CSS = {
    scrim: ':root{--wall-scrim:transparent!important;--wall-scrim-top:transparent!important;--wall-scrim-bottom:transparent!important;--wall-blur:0px!important;}',
    fusion: ':root{--wall-scrim:transparent!important;--wall-scrim-top:transparent!important;--wall-scrim-bottom:transparent!important;--wall-blur:0px!important;--mat-chrome:color-mix(in srgb, var(--bg) 55%, transparent)!important;--mat-panel:color-mix(in srgb, var(--bg) 62%, transparent)!important;--mat-card:color-mix(in srgb, var(--bg-elev) 66%, transparent)!important;--mat-float:color-mix(in srgb, var(--bg-elev) 80%, transparent)!important;--mat-blur:14px!important;}' + FUSION_RULES,
    full: ':root{--wall-scrim:transparent!important;--wall-scrim-top:transparent!important;--wall-scrim-bottom:transparent!important;--wall-blur:0px!important;--mat-chrome:transparent!important;--mat-panel:transparent!important;--mat-card:transparent!important;--mat-float:transparent!important;--mat-blur:0px!important;}'
  };
  var lastScrimLevel;
  function applyScrimHot(level) {
    try {
      if (level === lastScrimLevel && document.getElementById('we-bridge-scrim-style')) return;
      lastScrimLevel = level;
      var st = document.getElementById('we-bridge-scrim-style');
      if (!st) { st = document.createElement('style'); st.id = 'we-bridge-scrim-style'; document.head.appendChild(st); }
      st.textContent = SCRIM_CSS[level] || '';
    } catch (e) { }
  }
  // Apply the saved scrim mode as soon as the backend is reachable, independent
  // of whether the settings page has ever been opened. "none" clears the style
  // and lets Yan's material-strength slider control the variables again.
  function syncScrimHot() {
    api('/api/scrim').then(function (r) { if (r.ok) applyScrimHot(r.level); }).catch(function () { });
  }
  syncScrimHot();
  setInterval(syncScrimHot, 8000);
  function refreshWallpaper() {
    var d = { src: 'ui', hookType: typeof window.__weBridgeRefresh, yanType: typeof window.yan, ts: Date.now() };
    try {
      if (typeof window.__weBridgeRefresh === 'function') { window.__weBridgeRefresh(); d.called = true; }
      else d.called = false;
    } catch (e) { d.error = String(e); }
    sendDiag(d);
    setTimeout(function () { sendDiag(videoDiag('after-refresh')); }, 1200);
  }
  function videoDiag(tag) {
    var v = document.getElementById('wallpaperVideo');
    var layer = document.getElementById('wallpaperLayer');
    return {
      src: 'ui', tag: tag, ts: Date.now(),
      hookType: typeof window.__weBridgeRefresh,
      video: v ? {
        src: (v.currentSrc || v.src || '').slice(-60),
        ready: v.readyState, paused: v.paused, err: v.error && v.error.code,
        net: v.networkState, active: v.classList.contains('active'), muted: v.muted,
        time: Number(v.currentTime || 0).toFixed(2),
        poster: v.getAttribute('poster') || '',
        visibility: v.style.visibility || ''
      } : null,
      layerBg: layer ? (layer.style.backgroundImage || '').slice(-60) : null,
      scrim: (document.getElementById('we-bridge-scrim-style') || {}).textContent ? 'hot' : 'none',
      appClass: (document.getElementById('app') || {}).className
    };
  }
  function sendDiag(obj) {
    try { fetch(API + '/api/diag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }).catch(function () { }); } catch (e) { }
  }

  function loadScrim(panel) {
    api('/api/scrim').then(function (r) {
      var st = panel.querySelector('.we-bridge-scrim-status');
      if (!r.ok) { st.textContent = r.error || ''; return; }
      applyScrimHot(r.level);
      var label = r.level === 'full' ? '当前：全屏通透（接管滑杆）'
        : r.level === 'fusion' ? '当前：融合模式（接管滑杆）'
          : r.level === 'scrim' ? '当前：已关遮罩（接管滑杆）'
            : '当前：跟随 Yan 滑杆';
      st.textContent = label + '（即时生效，重启后保持）';
      panel.querySelectorAll('[data-scrim]').forEach(function (b) {
        b.classList.toggle('active', (r.level === 'scrim' && b.dataset.scrim === 'off') || (r.level === 'fusion' && b.dataset.scrim === 'fusion') || (r.level === 'full' && b.dataset.scrim === 'full') || (r.level === 'none' && b.dataset.scrim === 'restore'));
      });
    });
  }
  function startScrimPoll(panel) {
    if (panel.__weScrimPoll) return;
    panel.__weScrimPoll = setInterval(function () {
      if (!document.body.contains(panel)) {
        clearInterval(panel.__weScrimPoll);
        panel.__weScrimPoll = null;
        return;
      }
      loadScrim(panel);
    }, 8000);
  }

  function wire(panel) {
    panel.querySelector('.we-q').addEventListener('input', function () { renderGrid(panel); });
    panel.querySelector('.we-type').addEventListener('change', function () { renderGrid(panel); });
    panel.querySelector('.we-refresh').addEventListener('click', function () { loadList(panel); loadImported(panel); loadScrim(panel); });
    panel.addEventListener('click', function (ev) {
      var imp = ev.target.closest('[data-import]');
      var lib = ev.target.closest('[data-import-lib]');
      var rm = ev.target.closest('[data-remove]');
      var sc = ev.target.closest('[data-scrim]');
      var opt = ev.target.closest('[data-opt]');
      var all = ev.target.closest('.we-opt-all');
      if (imp || lib) {
        var id = imp ? imp.dataset.import : lib.dataset.importLib;
        var apply = !!imp;
        var btn = imp || lib; btn.disabled = true; var old = btn.textContent; btn.textContent = '导入中…';
        api('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, apply: apply, compress: true }) })
          .then(function (r) {
            if (r.ok) {
              var m = r.media || {};
              var tag = m.fallbackFromVideo ? (m.kind === 'video' ? '（已用 GIF 预览动画）' : '（视频无法转换，已用静态备用图）') : m.resolution ? '（' + m.resolution + (m.kind === 'image' ? '，静态图' : (m.fps ? '@' + m.fps : '')) + '）' : '';
              toast('「' + r.entry.name + '」' + (r.applied ? '已导入并应用' : '已入库') + tag + (r.applied ? '，已即时生效。' : '。'), 'ok');
              loadImported(panel); if (r.applied) refreshWallpaper();
            } else toast('导入失败：' + (r.error || ''), 'err');
          }).finally(function () { btn.disabled = false; btn.textContent = old; });
      } else if (opt) {
        optimize(panel, opt.dataset.opt, opt);
      } else if (all) {
        optimize(panel, '', null);
      } else if (rm) {
        rm.disabled = true;
        api('/api/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rm.dataset.remove, deleteFile: true }) })
          .then(function (r) { if (r.ok) { toast('已移除「' + r.removed.name + '」', 'info'); loadImported(panel); refreshWallpaper(); } else toast('移除失败：' + r.error, 'err'); })
          .finally(function () { rm.disabled = false; });
      } else if (sc) {
        var scButtons = panel.querySelectorAll('[data-scrim]');
        var scStatus = panel.querySelector('.we-bridge-scrim-status');
        scButtons.forEach(function (b) { b.disabled = true; });
        if (scStatus) scStatus.textContent = '切换中…';
        api('/api/scrim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: sc.dataset.scrim }) })
          .then(function (r) {
            if (r.ok) {
              applyScrimHot(r.level);
              var label = r.level === 'full' ? '全屏通透'
                : r.level === 'fusion' ? '融合模式'
                  : r.level === 'scrim' ? '已关遮罩'
                    : '跟随 Yan 滑杆';
              toast('遮罩已切换：' + label + (r.level === 'none' ? '' : '（已接管材质强度滑杆）'), 'info');
              loadScrim(panel);
            } else {
              toast('操作失败：' + (r.error || ''), 'err');
              loadScrim(panel);
            }
          })
          .catch(function (e) { toast('请求失败：' + e.message, 'err'); loadScrim(panel); })
          .finally(function () { scButtons.forEach(function (b) { b.disabled = false; }); });
      }
    });
  }

  function inject() {
    try {
      if (document.getElementById(PANEL_ID)) return;
      var market = document.querySelector('.wallpaper-market-section');
      if (!market || !market.parentNode) return;
      if (!document.getElementById('we-bridge-style')) {
        var st = document.createElement('style'); st.id = 'we-bridge-style'; st.textContent = STYLE; document.head.appendChild(st);
      }
      var panel = buildPanel();
      market.parentNode.insertBefore(panel, market.nextSibling);
      wire(panel);
      loadScrim(panel); loadList(panel); loadImported(panel);
      startScrimPoll(panel);
      setTimeout(function () { sendDiag(videoDiag('on-load')); }, 1500);
    } catch (e) { if (window.console) console.warn('we-bridge UI inject', e); }
  }

  var timer = null;
  function schedule() { if (timer) return; timer = setTimeout(function () { timer = null; inject(); }, 300); }
  try {
    var obs = new MutationObserver(schedule);
    obs.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) { }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule);
  else schedule();
  setInterval(function () { if (!document.getElementById(PANEL_ID)) schedule(); }, 3000);

  // Hot-apply any wallpaper config change (panel, native market, or external).
  var lastWpKey = null;
  setInterval(function () {
    try {
      if (window.yan && typeof window.yan.getConfig === 'function') {
        window.yan.getConfig().then(function (cfg) {
          var w = cfg && cfg.wallpaper; if (!w) return;
          var key = (w.id || '') + '|' + (w.path || '');
          if (lastWpKey !== null && key !== lastWpKey) refreshWallpaper();
          lastWpKey = key;
        }).catch(function () { });
      }
    } catch (e) { }
  }, 2500);
})();