'use strict';
// Fuzzy answer matching. Pure functions, no dependencies.
//   judge(guess, answers) -> { index, score }   index is -1 when nothing is close enough.

const ACCEPT = 0.7;

const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'to', 'in', 'on', 'at', 'is', 'are', 'was', 'were', 'for', 'by', 'with', 'as', 'it']);

// Words that are too common to count as "the" answer on their own ("city" for "Kansas City").
// Stored in stemmed form.
const GENERIC = new Set(['city', 'state', 'river', 'lake', 'mount', 'mountain', 'island', 'ocean', 'sea', 'bay',
  'county', 'party', 'war', 'day', 'man', 'woman', 'king', 'queen', 'prince', 'princess', 'saint', 'new', 'old',
  'north', 'south', 'east', 'west', 'great', 'united', 'national', 'park', 'street', 'road', 'university', 'college',
  'school', 'company', 'world', 'little', 'big', 'kingdom', 'republic', 'empire', 'house', 'club', 'sir', 'doctor']);

const NUMBER_WORDS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16',
  seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20',
};

const ALIAS = {
  usa: ['united', 'states'], us: ['united', 'states'], america: ['united', 'states'], uk: ['united', 'kingdom'], nyc: ['new', 'york', 'city'],
  tv: ['television'], mt: ['mount'], st: ['saint'], dr: ['doctor'], mr: ['mister'], mrs: ['missus'],
  phone: ['telephone'], telephone: ['telephone'], cellphone: ['telephone'], bike: ['bicycle'], fridge: ['refrigerator'],
  couch: ['sofa'], soda: ['pop'], sneakers: ['shoes'], sneaker: ['shoe'], tshirt: ['shirt'], tee: ['shirt'],
};

function fold(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function stem(w) {
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (/(ch|sh|x|z|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

const PREFIX = /^(?:(?:what|who|where|when|which)\s+(?:is|are|was|were)|whats|whos|wheres|i think|maybe|probably|its|it is|they are|he is|she is)\s+/;

function prep(text) {
  let s = fold(text)
    .replace(/&/g, ' and ')
    .replace(/\bu\.\s?s\.(\s?a\.)?/g, ' usa ')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/['\u2019]s\b/g, '')
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (let i = 0; i < 2; i++) s = s.replace(PREFIX, '');
  let words = [];
  for (const raw of s.split(' ').filter(Boolean)) {
    const w = NUMBER_WORDS[raw] || raw;
    if (ALIAS[w]) words.push(...ALIAS[w]);
    else words.push(w);
  }
  words = words.map(stem);
  const kept = words.filter(w => !STOP.has(w));
  const tokens = kept.length ? kept : words;
  return { tokens, compact: tokens.join('') };
}

function variantsOf(answer) {
  const base = String(answer == null ? '' : answer);
  const out = new Set();
  for (const v of [base.replace(/\([^)]*\)/g, ' '), base.replace(/[()]/g, ' ')]) {
    out.add(v);
    for (const part of v.split(/\s*(?:\/|;|\bor\b)\s*/i)) if (part.trim()) out.add(part);
  }
  return [...out].map(prep).filter(p => p.tokens.length);
}

// Damerau-Levenshtein (optimal string alignment) with an early exit.
function dl(a, b, max) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

const ROMAN = /^(?:i{1,3}|iv|v|vi{1,3}|ix|x)$/;
const hasNumeral = toks => toks.some(t => /\d/.test(t) || ROMAN.test(t));

const tolerance = len => (len < 5 ? 0 : len < 8 ? 1 : len < 14 ? 2 : 3);

function tokenEq(a, b) {
  if (a === b) return true;
  if (/\d/.test(a) || /\d/.test(b)) return false;
  const t = tolerance(Math.min(a.length, b.length));
  return t > 0 && dl(a, b, t) <= t;
}

function similarity(g, v, lenient) {
  if (!g.tokens.length || !v.tokens.length) return 0;
  if (g.compact === v.compact) return 1;
  // Spacing differences with a small typo ("sun glases" for "sunglasses"). Same word count is left to the
  // per-word check below, so "north dakota" cannot slide into "south dakota".
  if (g.tokens.length !== v.tokens.length && !hasNumeral(g.tokens) && !hasNumeral(v.tokens)) {
    if (tolerance(Math.max(g.compact.length, v.compact.length)) > 0 && dl(g.compact, v.compact, 1) <= 1) return 0.92;
  }

  const used = new Set();
  let unmatchedGuess = 0;
  for (const gt of g.tokens) {
    let j = v.tokens.findIndex((at, i) => !used.has(i) && at === gt);
    if (j < 0) j = v.tokens.findIndex((at, i) => !used.has(i) && tokenEq(gt, at));
    if (j < 0) unmatchedGuess++;
    else used.add(j);
  }
  const matched = [...used];

  // Guess contains every answer word, plus a little extra ("the planet Mars").
  if (matched.length === v.tokens.length) {
    if (!unmatchedGuess) return 0.97;
    return unmatchedGuess / g.tokens.length <= 0.5 ? 0.85 : 0;
  }
  if (unmatchedGuess) {
    // Lenient (survey) mode: one extra word is fine if the main noun matches ("beach hat" for "sun hat").
    const head = v.tokens[v.tokens.length - 1];
    if (lenient && unmatchedGuess === 1 && g.tokens.length <= 3 && !GENERIC.has(head) && head.length >= 3
        && tokenEq(g.tokens[g.tokens.length - 1], head)) return 0.72;
    return 0;
  }

  // Guess is a part of the answer ("Eisenhower" for "Dwight David Eisenhower").
  const idx = v.tokens.map((_, i) => i);
  const sig = idx.filter(i => !GENERIC.has(v.tokens[i]));
  const pool = sig.length ? sig : idx;
  const matchedSig = matched.filter(i => pool.includes(i));
  if (!matchedSig.length) return 0;
  const chars = i => v.tokens[i].length;
  const sum = arr => arr.reduce((n, i) => n + chars(i), 0);
  const frac = sum(matchedSig) / sum(pool);
  const last = pool[pool.length - 1];
  if (frac >= 0.5) return 0.55 + 0.4 * frac;
  if (matchedSig.includes(last) && chars(last) >= 4) return Math.max(0.72, 0.55 + 0.4 * frac);
  return 0;
}

function score(guess, answer, lenient = false) {
  const g = prep(guess);
  if (!g.tokens.length) return 0;
  let best = 0;
  for (const v of variantsOf(answer)) best = Math.max(best, similarity(g, v, lenient));
  return best;
}

// Best match among answers. Ties go to the earlier answer.
// options: { threshold, lenient }   lenient is for survey answers (Family Feud).
function judge(guess, answers, options = {}) {
  const threshold = options.threshold == null ? ACCEPT : options.threshold;
  let index = -1;
  let best = 0;
  answers.forEach((a, i) => {
    const s = score(guess, a, !!options.lenient);
    if (s > best + 1e-9) { best = s; index = i; }
  });
  return best >= threshold ? { index, score: best } : { index: -1, score: best };
}

module.exports = { judge, score, prep, ACCEPT };
