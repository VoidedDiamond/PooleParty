'use strict';
// House settings the host changes from their phone (volumes, host voice, AI answer checking).
// Kept in data/settings.json so they survive a restart; each laptop keeps its own.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  music: 45,        // 0-100, background music on the TV
  sfx: 80,          // 0-100, sound effects on the TV
  voice: 90,        // 0-100, the host voice
  voiceMode: null,  // 'off' | 'classic' | 'ai'; null = AI when there's a key, else classic
  aiJudge: true,    // let Claude accept answers the built-in matcher misses (needs a key)
  aiBudget: 1,      // dollars of Claude use per session before the offline host and judge take over; 0 = no limit
  hostStyle: 'gameshow', // the host's character (see STYLES in announcer.js), or 'mix' for a new one each game
  voiceName: null,  // a TV browser voice by name; null = the best one for the character
  readAloud: true,  // the host reads questions and clues out loud
};
const STYLE_IDS = ['gameshow', 'sports', 'trailer', 'grandma', 'pirate', 'mix'];
const BUDGETS = [0.5, 1, 2, 5, 0];

const settings = { ...DEFAULTS };
let file = null;

function load(root) {
  file = path.join(root, 'data', 'settings.json');
  try { Object.assign(settings, sanitize(JSON.parse(fs.readFileSync(file, 'utf8')))); } catch { /* first run */ }
  return settings;
}

const vol = v => Math.max(0, Math.min(100, Math.round(Number(v))));

function sanitize(p) {
  const out = {};
  if (!p || typeof p !== 'object') return out;
  for (const k of ['music', 'sfx', 'voice']) if (Number.isFinite(Number(p[k])) && p[k] !== null && p[k] !== '') out[k] = vol(p[k]);
  if (['off', 'classic', 'ai', null].includes(p.voiceMode)) out.voiceMode = p.voiceMode;
  if (typeof p.aiJudge === 'boolean') out.aiJudge = p.aiJudge;
  if (BUDGETS.includes(Number(p.aiBudget)) && p.aiBudget !== null && p.aiBudget !== '') out.aiBudget = Number(p.aiBudget);
  if (STYLE_IDS.includes(p.hostStyle)) out.hostStyle = p.hostStyle;
  if (p.voiceName === null || (typeof p.voiceName === 'string' && p.voiceName.length <= 120)) out.voiceName = p.voiceName || null;
  if (typeof p.readAloud === 'boolean') out.readAloud = p.readAloud;
  return out;
}

let saveTimer = null;
function update(patch) {
  Object.assign(settings, sanitize(patch));
  // Volume sliders send many small changes; write the file once they settle.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(settings, null, 2));
    } catch (e) { console.warn(`Could not save settings: ${e.message}`); }
  }, 600);
  return settings;
}

module.exports = { settings, load, update, DEFAULTS, BUDGETS };
