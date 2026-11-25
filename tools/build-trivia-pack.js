'use strict';
// Builds content/trivia/general.json ("Trivia Night") from OpenTriviaQA (uberspot/OpenTriviaQA,
// CC BY-SA 4.0): grown-up multiple-choice trivia, about 48,000 questions in its raw form.
//
//   node tools/build-trivia-pack.js          (downloads the raw category files once into data/raw)
//
// The raw set is crowd-gathered and uneven, so only questions that pass every check are kept:
// exactly four distinct short choices with the answer among them, no True/False or "all of the
// above", nothing time-sensitive ("currently", "as of"), no giveaways (answer printed in the
// question), and the family filter. Each pack "tier" is a category, so a 10-question game visits
// ten different subjects instead of escalating difficulty.
const fs = require('fs');
const path = require('path');
const { isFamilyFriendly } = require('./family-filter');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw', 'opentriviaqa');
const OUT = path.join(ROOT, 'content', 'trivia', 'general.json');
const BASE = 'https://raw.githubusercontent.com/uberspot/OpenTriviaQA/master/categories/';
const PER_TIER = 1500;

// tier label -> raw category files
const TIERS = [
  ['History', ['history']],
  ['Geography', ['geography', 'world']],
  ['Science', ['science-technology']],
  ['Movies', ['movies']],
  ['Music', ['music']],
  ['Television', ['television']],
  ['Sports', ['sports']],
  ['Books & Arts', ['literature', 'humanities']],
  ['Animals', ['animals']],
  ['Potluck', ['general', 'hobbies', 'video-games']],
];

const STALE = /\b(currently|as of|this year|last year|recent(ly)?|latest|today|nowadays|at present|so far)\b/i;
const FILLER = /^(all|none|both|neither) of (the|these|them)|^(true|false|yes|no)$/i;

async function ensureRaw(name) {
  const file = path.join(RAW, name);
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(RAW, { recursive: true });
  console.log(`downloading ${name} ...`);
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${BASE + name} -> HTTP ${res.status}`);
  fs.writeFileSync(file, await res.text());
  return file;
}

const tidy = s => String(s || '').replace(/\s+/g, ' ').replace(/\s+([?.,!])/g, '$1').trim();
const norm = s => tidy(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function parse(text) {
  const out = [];
  for (const block of text.split(/\n(?=#Q )/)) {
    const lines = block.split('\n').map(l => l.trimEnd()).filter(Boolean);
    if (!lines.length || !lines[0].startsWith('#Q')) continue;
    // A question can wrap onto extra lines before the "^" answer line.
    const ai = lines.findIndex(l => l.startsWith('^ '));
    if (ai < 1) continue;
    const q = tidy(lines.slice(0, ai).join(' ').replace(/^#Q\s*/, ''));
    const answer = tidy(lines[ai].slice(2));
    const choices = lines.slice(ai + 1).filter(l => /^[A-Z] /.test(l)).map(l => tidy(l.slice(2)));
    out.push({ q, answer, choices });
  }
  return out;
}

function keep({ q, answer, choices }) {
  if (choices.length !== 4) return false;
  if (q.length < 25 || q.length > 230 || !/[a-z]/.test(q)) return false;
  if (choices.some(c => !c || c.length > 48 || FILLER.test(c))) return false;
  if (new Set(choices.map(norm)).size !== 4) return false;
  if (!choices.some(c => norm(c) === norm(answer))) return false;
  if (STALE.test(q)) return false;
  const a = norm(answer);
  if (a.length > 3 && norm(q).includes(a)) return false; // the question gives the answer away
  return isFamilyFriendly(q, ...choices);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

async function build() {
  const seen = new Set();
  const questions = [];
  const report = [];
  for (const [ti, [label, files]] of TIERS.entries()) {
    let pool = [];
    for (const f of files) pool.push(...parse(fs.readFileSync(await ensureRaw(f), 'utf8')));
    const raw = pool.length;
    pool = pool.filter(x => {
      if (!keep(x)) return false;
      const k = norm(x.q);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const picked = shuffle(pool).slice(0, PER_TIER);
    for (const x of picked) {
      // The raw files list the answer in a fixed slot surprisingly often; shuffle the choices.
      const choices = shuffle([...x.choices]);
      questions.push({ tier: ti + 1, topic: label, q: x.q, choices, correct: choices.findIndex(c => norm(c) === norm(x.answer)) });
    }
    report.push(`${label}: ${picked.length} kept of ${raw}`);
  }
  const pack = {
    title: 'Trivia Night',
    source: 'OpenTriviaQA (github.com/uberspot/OpenTriviaQA), CC BY-SA 4.0, filtered',
    maxTier: TIERS.length,
    tierLabels: TIERS.map(t => t[0]),
    questions,
  };
  fs.writeFileSync(OUT, JSON.stringify(pack));
  return `${questions.length} questions\n  ${report.join('\n  ')}`;
}

module.exports = { build };
if (require.main === module) build().then(r => console.log('Trivia Night:', r)).catch(e => { console.error(e.message); process.exit(1); });
