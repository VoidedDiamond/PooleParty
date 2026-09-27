'use strict';
// npm run fetch-data            Kids/Teen Jeopardy clues + Family Feud surveys.
// npm run fetch-data -- --full  The full Jeopardy archive (about 80 MB download) + Family Feud surveys.
// Raw files go to data/raw (kept, so rebuilding is offline). Banks go to content/.
const fs = require('fs');
const path = require('path');
const { build: buildJeopardy } = require('./build-jeopardy-bank');
const { build: buildFeud } = require('./build-feud-bank');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const SOURCES = {
  jeopardy: {
    file: 'kids_teen_matches.tsv',
    url: 'https://raw.githubusercontent.com/jwolle1/jeopardy_clue_dataset/main/kids_teen_matches.tsv',
  },
  jeopardyFull: {
    file: 'combined_season1-42.tsv',
    url: 'https://raw.githubusercontent.com/jwolle1/jeopardy_clue_dataset/main/combined_season1-42.tsv',
  },
  feud: {
    file: 'protoqa_train.jsonl',
    url: 'https://raw.githubusercontent.com/iesl/protoqa-data/9fb72b4e7d41a7d3a9766c33ef66c78d7a100b41/data/train/protoqa_train.jsonl',
  },
};

async function download({ file, url }, force) {
  const dest = path.join(RAW, file);
  if (fs.existsSync(dest) && !force) { console.log(`have ${file}`); return dest; }
  console.log(`downloading ${file} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  fs.mkdirSync(RAW, { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

(async () => {
  const force = process.argv.includes('--force');
  const only = process.argv.find(a => a === 'jeopardy' || a === 'feud');
  if (process.argv.includes('--full')) {
    const raw = await download(SOURCES.jeopardyFull, force);
    console.log('Jeopardy full bank:', buildJeopardy(raw, path.join(ROOT, 'content/jeopardy/bank-full.json'),
      { maxBoards: 15000, maxFinals: 1500, source: 'jwolle1/jeopardy_clue_dataset combined_season1-42.tsv (random slice)' }));
    if (only !== 'feud' && !process.argv.includes('--also-kids')) {
      if (!only) { const rawF = await download(SOURCES.feud, force); console.log('Family Feud bank:', buildFeud(rawF, path.join(ROOT, 'content/feud/bank.json'))); }
      return;
    }
  }
  if (!only || only === 'jeopardy') {
    const raw = await download(SOURCES.jeopardy, force);
    console.log('Jeopardy bank:', buildJeopardy(raw, path.join(ROOT, 'content/jeopardy/bank.json')));
  }
  if (!only || only === 'feud') {
    const raw = await download(SOURCES.feud, force);
    console.log('Family Feud bank:', buildFeud(raw, path.join(ROOT, 'content/feud/bank.json')));
  }
})().catch(e => { console.error(e.message); process.exit(1); });
