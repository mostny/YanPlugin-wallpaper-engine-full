'use strict';

// Scrim mode persistence for the Wallpaper Engine bridge.
//
// The old implementation rewrote Yan's styles.css with !important variables.
// That permanently overrode the variables written by Yan's "material strength"
// slider, so the slider stopped working. Modes are now applied as a runtime
// style by the injected panel, and only the selected level is stored here.

if (process.versions && process.versions.electron) process.noAsar = true;

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const LEVELS = new Set(['none', 'scrim', 'fusion', 'full']);
const ACTIONS = { restore: 'none', off: 'scrim', fusion: 'fusion', full: 'full' };

function yanDataDir() {
  const override = String(process.env.WE_BRIDGE_YAN_DATA || '').trim();
  if (override) return path.resolve(override);
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'yan-agent', 'YanData');
}

function modeFile() {
  return path.join(yanDataDir(), 'we-bridge', 'scrim-mode.json');
}

function read() {
  try {
    const parsed = JSON.parse(fs.readFileSync(modeFile(), 'utf8'));
    return LEVELS.has(parsed.level) ? parsed.level : 'none';
  } catch {
    return 'none';
  }
}

function write(level) {
  const file = modeFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify({ level, updatedAt: Date.now() }, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } finally {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
  return level;
}

function status() {
  const level = read();
  return {
    ok: true,
    level,
    mode: 'hot',
    restartRequired: false,
    note: level === 'none'
      ? '当前跟随 Yan 的「材质强度」滑杆。'
      : '当前为固定遮罩模式，会接管「材质强度」滑杆；点「跟随滑杆」可立即恢复。'
  };
}

function set(action) {
  const key = String(action || '').trim();
  const level = ACTIONS[key];
  if (!level) return { ok: false, error: `未知遮罩模式：${key || '(空)'}`, levels: [...LEVELS] };
  write(level);
  return {
    ok: true,
    level,
    mode: 'hot',
    restartRequired: false,
    note: level === 'none'
      ? '已切回跟随 Yan 滑杆，材质强度可以正常调节。'
      : '已切换固定遮罩模式；该模式会接管材质强度滑杆，可用「跟随滑杆」恢复。'
  };
}

module.exports = { status, set, read, write, modeFile, LEVELS };