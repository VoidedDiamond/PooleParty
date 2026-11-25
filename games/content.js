'use strict';
const fs = require('fs');
const path = require('path');
const { score } = require('./match');

const ROOT = path.join(__dirname, '..');
const readJSON = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const first = (...files) => files.find(f => fs.existsSync(f));

const shuffle = arr => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const sample = (arr, n) => shuffle(arr).slice(0, n);
// Like sample, but always returns n items (repeats if a custom file is very small).
const sampleFill = (arr, n) => { const out = sample(arr, n); while (out.length < n && arr.length) out.push(arr[Math.floor(Math.random() * arr.length)]); return out; };

// ---- cross-session "don't repeat what we just saw" tracking ---------------
// Content pools are big, but a random sample can still land on the same categories/questions
// two games in a row, including across a server restart. This remembers what was picked
// recently (on disk, per content key) and prefers anything NOT in that recent history first.
const RECENT_FILE = path.join(ROOT, 'data', 'recent-usage.json');
function loadRecentUsage() {
  try { return readJSON(RECENT_FILE); } catch { return {}; }
}
function saveRecentUsage(all) {
  try {
    fs.mkdirSync(path.dirname(RECENT_FILE), { recursive: true });
    fs.writeFileSync(RECENT_FILE, JSON.stringify(all, null, 2));
  } catch (e) { console.error('Could not save data/recent-usage.json:', e.message); }
}
// Picks n items from pool, preferring ones outside this key's recent history, then records the
// choice so the next game (even after a restart) keeps avoiding it for a while. idOf turns a
// pool item into the string identity that gets remembered (defaults to the item itself).
function pickFresh(key, pool, n, idOf = x => x) {
  const all = loadRecentUsage();
  const recent = new Set(all[key] || []);
  const fresh = pool.filter(item => !recent.has(idOf(item)));
  const chosen = sample(fresh.length >= n ? fresh : pool, n);
  const cap = Math.max(pool.length * 3, n * 6); // remember several games' worth before cycling back
  all[key] = [...chosen.map(idOf), ...(all[key] || [])].slice(0, cap);
  saveRecentUsage(all);
  return chosen;
}

// ---- display helpers ------------------------------------------------------
const strip = a => String(a).replace(/^(?:what|who|where|when|which)\s+(?:is|are|was|were)\s+/i, '').replace(/\?+$/, '').trim();
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const display = a => cap(strip(a));

// ---- Jeopardy -------------------------------------------------------------
function shapeOf(a) {
  if (/^\d{4}$/.test(a)) return 'year';
  if (/^\d+$/.test(a)) return 'num';
  const words = a.split(/\s+/);
  const caps = words.every(w => /^[A-Z0-9]/.test(w));
  return `${caps ? 'C' : 'l'}${Math.min(words.length, 3)}`;
}

// Keywords of a clue, for finding related clues elsewhere in the bank.
const KEY_STOP = new Set(('this that these those with from they them their there were have been also into after before about '
  + 'like what which when where while known name named called first last only than then each many most more some such '
  + 'used your just over under made make become became being does done other another here very much once upon onto '
  + 'it\'s its title word words letter letters').split(' '));
function keywords(text) {
  return [...new Set(String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length >= 4 && !KEY_STOP.has(w))
    .map(w => w.replace(/ies$/, 'y').replace(/(ch|sh|x)es$/, '$1').replace(/([^s])s$/, '$1')))];
}

function buildPool(entries) { // entries: [{ a, cat, q }]
  const byCat = new Map();
  const byShape = new Map();
  const list = [];
  const byWord = new Map();
  for (const { a, cat, q } of entries) {
    const d = display(a);
    const shape = shapeOf(d);
    if (!byShape.has(shape)) byShape.set(shape, []);
    byShape.get(shape).push(d);
    const k = String(cat).toLowerCase();
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k).push(d);
    const i = list.length;
    list.push({ d, shape });
    for (const w of keywords(`${q || ''} ${cat}`)) {
      if (!byWord.has(w)) byWord.set(w, []);
      byWord.get(w).push(i);
    }
  }
  return { byCat, byShape, list, byWord };
}

// Answers to clues elsewhere in the bank that share rare words with this clue and its category:
// a colonies clue pulls in other colonies, a planets clue other planets. Best matches first.
function relatedAnswers(pool, clue, category) {
  if (!pool.list || !clue) return [];
  const n = pool.list.length;
  const scores = new Map();
  for (const w of keywords(`${clue} ${category}`)) {
    const ids = pool.byWord.get(w);
    if (!ids || ids.length > 40 + n * 0.004) continue; // too common to mean anything
    const idf = Math.log(n / ids.length);
    for (const i of ids) scores.set(i, (scores.get(i) || 0) + idf);
  }
  // A single shared word is often a coincidence ("1799"); ask for about two.
  return [...scores.entries()].filter(([, sc]) => sc >= 11).sort((x, y) => y[1] - x[1]).slice(0, 60).map(([i]) => pool.list[i]);
}

// Four options for a multiple-choice clue. opts:
//   clue     the clue text, to find related wrong answers in the bank
//   wrong    wrong answers written by Claude for this clue (used first when they check out)
//   exclude  answers elsewhere on this board, which Claude's options must not reuse
function makeChoices(pool, answer, category, opts = {}) {
  const correct = display(answer);
  const shape = shapeOf(correct);
  const picked = [];
  const exclude = new Set([...(opts.exclude || [])].map(x => display(x).toLowerCase()));
  const ok = c => !!c && c.length <= 80 && c.toLowerCase() !== correct.toLowerCase()
    && !picked.some(p => p.toLowerCase() === c.toLowerCase())
    && score(c, correct) < 0.55 && score(correct, c) < 0.55;

  for (const w of opts.wrong || []) {
    if (picked.length === 3) break;
    const c = display(String(w).trim());
    if (ok(c) && !exclude.has(c.toLowerCase())) picked.push(c);
  }
  if (picked.length === 3) { /* Claude's options checked out */ } else if (shape === 'year') {
    const y = Number(correct);
    for (const d of shuffle([-1, 1, -2, 2, -3, 3, -5, 5, -8, 8, -12, 12])) {
      if (picked.length === 3) break;
      if (ok(String(y + d))) picked.push(String(y + d));
    }
  } else {
    // Offline: answers to closely related clues elsewhere in the bank first (a colonies clue
    // pulls in other colonies), then this category's answers, then anything of the same shape.
    const related = relatedAnswers(pool, opts.clue, category).filter(r => r.shape === shape).slice(0, 4).map(r => r.d);
    const cands = [
      ...shuffle(related).slice(0, 2),
      ...shuffle(pool.byCat.get(String(category).toLowerCase()) || []).slice(0, 12),
      ...sample(pool.byShape.get(shape) || [], 40),
    ];
    for (const c of cands) { if (picked.length === 3) break; if (ok(c)) picked.push(c); }
    if (picked.length < 3) {
      for (const list of shuffle([...pool.byShape.values()])) {
        for (const c of sample(list, 10)) { if (picked.length === 3) break; if (ok(c)) picked.push(c); }
        if (picked.length === 3) break;
      }
    }
  }
  if (picked.length < 3) return null;
  const choices = shuffle([correct, ...picked]);
  return { choices, correctIdx: choices.indexOf(correct) };
}

function validatePack(pack, file) {
  if (!Array.isArray(pack.categories) || !pack.categories.length) throw new Error(`${file}: "categories" must be a non-empty array`);
  pack.categories.forEach((cat, i) => {
    if (!cat.name || !Array.isArray(cat.clues) || !cat.clues.length) throw new Error(`${file}: category ${i + 1} needs "name" and "clues"`);
    cat.clues.forEach((cl, j) => {
      if (!cl.clue || !cl.answer || !Number.isFinite(cl.value)) throw new Error(`${file}: "${cat.name}" clue ${j + 1} needs value, clue, answer`);
    });
  });
}

function loadJeopardySource(override) {
  const file = override ? path.resolve(override)
    : first(path.join(ROOT, 'content/jeopardy/bank-full.json'), path.join(ROOT, 'content/jeopardy/bank.json'), path.join(ROOT, 'content/jeopardy/sample.json'));
  const data = readJSON(file);
  if (data.kind === 'jeopardy-bank') {
    const entries = [];
    for (const b of data.categories) for (const c of b.clues) entries.push({ a: c.a, cat: b.c, q: c.q });
    for (const f of data.finals) entries.push({ a: f.a, cat: f.c, q: f.q });
    return { kind: 'bank', data, pool: buildPool(entries), label: `${data.categories.length.toLocaleString()} boards in the clue bank` };
  }
  validatePack(data, file);
  const entries = [];
  for (const cat of data.categories) for (const c of cat.clues) entries.push({ a: c.answer, cat: cat.name, q: c.clue });
  if (data.final) entries.push({ a: data.final.answer, cat: data.final.category, q: data.final.clue });
  return { kind: 'pack', data, pool: buildPool(entries), label: `Pack: ${data.title || path.basename(file)}` };
}

// Returns { categories: [{ name, clues: [{ value, clue, answer, dd }] }], final }
function buildBoard(src) {
  if (src.kind === 'pack') {
    const d = src.data;
    return {
      categories: d.categories.map(cat => ({
        name: cat.name,
        clues: cat.clues.map(c => ({ value: c.value, clue: c.clue, answer: c.answer, dd: !!c.dailyDouble })),
      })),
      final: d.final || null,
    };
  }
  const names = new Set();
  const uniqueBoards = [];
  for (const b of src.data.categories) {
    const k = b.c.toLowerCase();
    if (names.has(k)) continue;
    names.add(k);
    uniqueBoards.push(b);
  }
  const chosen = pickFresh('jeopardy-categories', uniqueBoards, Math.min(5, uniqueBoards.length), b => b.c.toLowerCase());
  const f = src.data.finals.length ? src.data.finals[Math.floor(Math.random() * src.data.finals.length)] : null;
  return {
    categories: chosen.map(b => ({
      name: b.c,
      clues: b.clues.map((c, i) => ({ value: (i + 1) * 200, clue: c.q, answer: c.a, dd: false })),
    })),
    final: f && { category: f.c, clue: f.q, answer: f.a },
  };
}

// ---- Family Feud ----------------------------------------------------------
function loadFeudSource(override) {
  const file = override ? path.resolve(override)
    : first(path.join(ROOT, 'content/feud/bank.json'), path.join(ROOT, 'content/feud/sample.json'));
  const data = readJSON(file);
  if (!Array.isArray(data.questions) || !data.questions.length) throw new Error(`${file}: "questions" must be a non-empty array`);
  return { data, label: `${data.questions.length.toLocaleString()} survey questions` };
}

function pickFeudQuestions(src, n) {
  const chosen = pickFresh('feud-questions', src.data.questions, n, q => q.q);
  return chosen.length < n ? sampleFill(src.data.questions, n) : chosen;
}

// ---- Wheel of Fortune -----------------------------------------------------
function loadWheelSource(override) {
  const file = override ? path.resolve(override)
    : first(path.join(ROOT, 'content/wheel/puzzles.json'));
  const data = readJSON(file);
  if (!Array.isArray(data.puzzles) || !data.puzzles.length) throw new Error(`${file}: "puzzles" must be a non-empty array`);
  return { data, label: `${data.puzzles.length.toLocaleString()} puzzles` };
}

// ---- Wavelength -----------------------------------------------------------
function loadWavelengthSource(override) {
  const file = override ? path.resolve(override)
    : first(path.join(ROOT, 'content/wavelength/pairs.json'));
  const data = readJSON(file);
  if (!Array.isArray(data.pairs) || !data.pairs.length) throw new Error(`${file}: "pairs" must be a non-empty array`);
  return { data, label: `${data.pairs.length.toLocaleString()} spectrum pairs` };
}

// ---- Pictionary -------------------------------------------------------------
function loadPictionarySource(override) {
  const file = override ? path.resolve(override) : path.join(ROOT, 'content/pictionary/words.json');
  const data = readJSON(file);
  if (!data.categories || typeof data.categories !== 'object') throw new Error(`${file}: "categories" must be an object of arrays`);
  const words = Object.values(data.categories).flat();
  if (!words.length) throw new Error(`${file}: no words found`);
  return { data, words, label: `${words.length.toLocaleString()} words` };
}

// ---- T-Shirt Wars -----------------------------------------------------------
function loadTshirtSource(override) {
  const file = override ? path.resolve(override) : path.join(ROOT, 'content/tshirt/prompts.json');
  const data = readJSON(file);
  if (!Array.isArray(data.prompts) || !data.prompts.length) throw new Error(`${file}: "prompts" must be a non-empty array`);
  return { data, label: `${data.prompts.length.toLocaleString()} design prompts` };
}

// ---- Trivia -----------------------------------------------------------------
function loadTriviaSource(override) {
  const file = override ? path.resolve(override) : path.join(ROOT, 'content/trivia/fifthgrade.json');
  const data = readJSON(file);
  if (!Array.isArray(data.questions) || !data.questions.length) throw new Error(`${file}: "questions" must be a non-empty array`);
  if (!Number.isFinite(data.maxTier)) throw new Error(`${file}: "maxTier" is required`);
  const byTier = new Map();
  for (const q of data.questions) {
    if (!byTier.has(q.tier)) byTier.set(q.tier, []);
    byTier.get(q.tier).push(q);
  }
  return { data, byTier, label: `${data.questions.length.toLocaleString()} questions — ${data.title || path.basename(file)}` };
}

// ---- Movie Reveal -------------------------------------------------------------
function loadMovieSource(override) {
  const file = override ? path.resolve(override) : path.join(ROOT, 'content/movie/disney.json');
  const data = readJSON(file);
  if (!Array.isArray(data.movies) || !data.movies.length) throw new Error(`${file}: "movies" must be a non-empty array`);
  return { data, label: `${data.movies.length.toLocaleString()} movies` };
}

// ---- Codenames ----------------------------------------------------------------
function loadCodenamesSource(override) {
  const file = override ? path.resolve(override) : path.join(ROOT, 'content/codenames/words.json');
  const data = readJSON(file);
  if (!Array.isArray(data.words) || data.words.length < 25) throw new Error(`${file}: "words" needs at least 25 entries`);
  return { data, label: `${data.words.length.toLocaleString()} words` };
}

// ---- Password -------------------------------------------------------------------
function loadPasswordSource(override) {
  const file = override ? path.resolve(override) : path.join(ROOT, 'content/password/words.json');
  const data = readJSON(file);
  if (!Array.isArray(data.words) || !data.words.length) throw new Error(`${file}: "words" must be a non-empty array`);
  return { data, label: `${data.words.length.toLocaleString()} words` };
}

// ---- Hangman ----------------------------------------------------------------------
function loadHangmanSource(override) {
  const file = override ? path.resolve(override) : path.join(ROOT, 'content/hangman/words.json');
  const data = readJSON(file);
  if (!data.categories || typeof data.categories !== 'object') throw new Error(`${file}: "categories" must be an object of arrays`);
  const count = Object.values(data.categories).flat().length;
  if (!count) throw new Error(`${file}: no words found`);
  return { data, label: `${count.toLocaleString()} words in ${Object.keys(data.categories).length} categories` };
}

// ---- Neanderthals ------------------------------------------------------------------
// Cards: { cards: [{ one: "Fork", three: "Pitchfork", ban: ["eat", ...] }] }. A plain
// { words: [...] } list (the old format) still loads: each word becomes a 1-point-only card.
function loadNeanderthalsSource(override) {
  const file = override ? path.resolve(override) : path.join(ROOT, 'content/neanderthals/cards.json');
  const data = readJSON(file);
  const cards = Array.isArray(data.cards) ? data.cards.filter(c => c && c.one)
    : Array.isArray(data.words) ? data.words.map(w => ({ one: w, three: null, ban: [] })) : [];
  if (!cards.length) throw new Error(`${file}: "cards" must be a non-empty array`);
  for (const c of cards) { c.three = c.three || null; c.ban = Array.isArray(c.ban) ? c.ban : []; }
  return { data, cards, label: `${cards.length.toLocaleString()} cards` };
}

// ---- Scattergories --------------------------------------------------------------
function loadScattergoriesSource(override) {
  const file = override ? path.resolve(override) : path.join(ROOT, 'content/scattergories/categories.json');
  const data = readJSON(file);
  if (!Array.isArray(data.categories) || !data.categories.length) throw new Error(`${file}: "categories" must be a non-empty array`);
  if (!Array.isArray(data.letters) || !data.letters.length) throw new Error(`${file}: "letters" must be a non-empty array`);
  return { data, label: `${data.categories.length.toLocaleString()} categories` };
}

module.exports = {
  shuffle, sample, sampleFill, display, pickFresh,
  loadJeopardySource, buildBoard, makeChoices,
  loadFeudSource, pickFeudQuestions,
  loadWheelSource,
  loadWavelengthSource,
  loadPictionarySource,
  loadTshirtSource,
  loadTriviaSource,
  loadMovieSource,
  loadCodenamesSource,
  loadPasswordSource,
  loadScattergoriesSource,
  loadHangmanSource,
  loadNeanderthalsSource,
};
