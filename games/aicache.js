'use strict';
// Rulings and options Claude has already given, kept on disk (data/ai-cache.json) so the same
// Feud guess, Pictionary guess or Jeopardy clue is never paid for twice, even on another night.
//   get(kind, key) / set(kind, key, value)
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'ai-cache.json');
const MAX_PER_KIND = 5000; // oldest entries drop off first

let data = null;
function load() {
  if (data) return data;
  try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { data = {}; }
  return data;
}

let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(data));
    } catch (e) { console.warn(`Could not save ai-cache.json: ${e.message}`); }
  }, 1500);
}

function get(kind, key) {
  const k = load()[kind];
  return k && Object.prototype.hasOwnProperty.call(k, key) ? k[key] : undefined;
}

function set(kind, key, value) {
  const all = load();
  const k = all[kind] || (all[kind] = {});
  delete k[key];
  k[key] = value;
  const keys = Object.keys(k);
  for (let i = 0; i < keys.length - MAX_PER_KIND; i++) delete k[keys[i]];
  save();
}

module.exports = { get, set };
