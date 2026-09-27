'use strict';
// Turns kids_teen_matches.tsv (jwolle1/jeopardy_clue_dataset) into content/jeopardy/bank.json
const fs = require('fs');
const { isFamilyFriendly } = require('./family-filter');

const clean = s => String(s || '')
  .replace(/\\(["'])/g, '$1')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

const BAD_CLUE = /seen here|shown here|heard here|this clip|clue crew|audio|video|picture|photo|in this image|pictured/i;

function answerOk(a) {
  if (!a || a.length > 32) return false;
  if (/[,;:?]|\.\.\.| \+ /.test(a)) return false;
  const words = a.split(' ');
  if (words.length > 4) return false;
  if (/^(?:things|ways|types|kinds|three|four|five|two|six|seven|eight|nine|ten)\b/i.test(a)) return false;
  return true;
}

function clueOk(q) {
  return q.length >= 25 && q.length <= 230 && !BAD_CLUE.test(q);
}

function build(rawFile, outFile, options = {}) {
  const lines = fs.readFileSync(rawFile, 'utf8').split('\n');
  const header = lines[0].split('\t');
  const col = name => header.indexOf(name);
  const C = { round: col('round'), value: col('clue_value'), cat: col('category'), clue: col('answer'), resp: col('question'), date: col('air_date') };

  const groups = new Map();
  const finals = [];
  let rows = 0;
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split('\t');
    if (f.length < 8) continue;
    rows++;
    const round = f[C.round];
    const cat = clean(f[C.cat]);
    const q = clean(f[C.clue]);
    const a = clean(f[C.resp]);
    if (!cat || !clueOk(q) || !answerOk(a)) continue;
    if (!isFamilyFriendly(cat, q, a)) continue;
    if (round === '3') { finals.push({ c: cat, q, a }); continue; }
    if (round !== '1' && round !== '2') continue;
    const key = `${f[C.date]}|${round}|${cat}`;
    if (!groups.has(key)) groups.set(key, { c: cat, y: Number(String(f[C.date]).slice(0, 4)), clues: [] });
    groups.get(key).clues.push({ v: Number(f[C.value]), q, a });
  }

  const boards = [];
  for (const g of groups.values()) {
    if (g.clues.length !== 5) continue;
    g.clues.sort((x, y) => x.v - y.v);
    if (new Set(g.clues.map(c => c.v)).size !== 5) continue;
    boards.push({ c: g.c, y: g.y, clues: g.clues.map(c => ({ q: c.q, a: c.a })) });
  }

  // The full show archive is huge, so keep a random slice to keep startup quick.
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const keptBoards = options.maxBoards ? shuffle(boards).slice(0, options.maxBoards) : boards;
  const keptFinals = options.maxFinals ? shuffle(finals).slice(0, options.maxFinals) : finals;
  const out = { kind: 'jeopardy-bank', source: options.source || 'jwolle1/jeopardy_clue_dataset kids_teen_matches.tsv', categories: keptBoards, finals: keptFinals };
  fs.mkdirSync(require('path').dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(out));
  return { rows, boardsAvailable: boards.length, categories: keptBoards.length, finals: keptFinals.length, bytes: fs.statSync(outFile).size };
}

module.exports = { build };
if (require.main === module) {
  const [raw, out] = process.argv.slice(2);
  console.log(build(raw, out));
}
