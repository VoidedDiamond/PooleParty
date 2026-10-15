'use strict';
// Count the Cubes: a stack of cubes flashes up on the TV, then disappears, and everyone types how
// many cubes there were. The stacks follow gravity, so some cubes are hidden underneath others
// and have to be worked out. Stacks get bigger and the flashes shorter as the game goes on.
//
// Phases: show (the stack is on the TV) -> guess (it's gone, keep answering) -> count (the TV
// rebuilds it layer by layer, counting up) -> reveal (who was closest) -> ... -> end.
// Answers are accepted from the moment the stack appears until the count starts.

const ROUNDS = 10;
const GUESS_MS = 15000;
const LAYER_MS = 650;      // the count-up rebuilds one layer this often
const COUNT_TAIL_MS = 1300;
const REVEAL_MS = 5500;

// Every stack sits on a 5x5 grid. Per difficulty: cubes in the first and last round, flash time
// in the first and last round, and the tallest a column can get.
const GRID = 5;
const LEVELS = {
  normal: { cubes: [5, 26], show: [7000, 4000], maxH: [3, 5] },
  hard: { cubes: [10, 38], show: [5000, 2500], maxH: [4, 6] },
};

const COLORS = ['#4dabf7', '#ff922b', '#69db7c', '#f06595', '#ffd43b', '#9775fa', '#3bc9db', '#ff6b6b', '#a9e34b', '#f783ac'];

const lerp = (a, b, t) => a + (b - a) * t;
const rand = n => Math.floor(Math.random() * n);

// A stack you can always count fairly. The room looks at it from the front corner (x and y grow
// toward the viewer), so it's built as a staircase that only steps down toward the viewer: no
// column is ever taller than the ones behind it. That way the top of every column is in plain
// sight, and the only hidden cubes are the ones underneath visible cubes, which you can work out
// because nothing floats. heights[y * w + x] is the number of cubes in each column.
function buildStack(w, d, total, maxH) {
  const h = new Array(w * d).fill(0);
  const at = (x, y) => h[y * w + x];
  // How much this stack likes to pile up versus spread out, so stacks look different.
  const tall = 1 + Math.random() * 3;
  let placed = 0;
  while (placed < total) {
    const options = [];
    for (let y = 0; y < d; y++) {
      for (let x = 0; x < w; x++) {
        const c = at(x, y);
        if (c >= maxH) continue;
        if (x > 0 && at(x - 1, y) <= c) continue; // would stick up past the column behind it
        if (y > 0 && at(x, y - 1) <= c) continue;
        const weight = Math.max(1, Math.round(c > 0 ? tall * (1 + c / 2) : 2));
        for (let k = 0; k < weight; k++) options.push(y * w + x);
      }
    }
    if (!options.length) break;
    h[options[rand(options.length)]] += 1;
    placed += 1;
  }
  return { w, d, h };
}

class Cubes {
  // opts: { level: 'normal' | 'hard' }
  constructor(players, notify, opts = {}) {
    this.players = players;
    this.notify = notify;
    this.levelName = LEVELS[opts.level] ? opts.level : 'normal';
    this.level = LEVELS[this.levelName];
    for (const p of players.values()) p.score = 0;
    this.round = 0;
    this.timer = null;
    this.answers = new Map();
    this.startRound();
  }

  dispose() { clearTimeout(this.timer); }

  onPlayerRemoved() {
    if ((this.phase === 'show' || this.phase === 'guess') && this.allAnswered()) this.startCount();
  }

  later(ms, fn) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      try { fn(); } catch (e) { console.error(e); }
      this.notify();
    }, ms);
  }
  setTimer(ms) { this.endsAt = Date.now() + ms; this.total = ms; }

  connected() { return [...this.players.values()].filter(p => p.connected); }
  allAnswered() { const live = this.connected(); return live.length > 0 && live.every(p => this.answers.has(p.id)); }

  startRound() {
    this.round += 1;
    const t = ROUNDS > 1 ? (this.round - 1) / (ROUNDS - 1) : 1;
    const L = this.level;
    const total = Math.round(lerp(L.cubes[0], L.cubes[1], t)) + rand(3) - 1;
    const maxH = Math.round(lerp(L.maxH[0], L.maxH[1], t));
    this.stack = buildStack(GRID, GRID, total, maxH);
    this.count = this.stack.h.reduce((a, b) => a + b, 0);
    this.layers = Math.max(...this.stack.h);
    this.color = COLORS[(this.round - 1) % COLORS.length];
    this.answers = new Map();
    this.phase = 'show';
    this.shownAt = Date.now();
    this.showMs = Math.round(lerp(L.show[0], L.show[1], t));
    this.setTimer(this.showMs);
    this.later(this.showMs, () => this.startGuess());
  }

  startGuess() {
    if (this.phase !== 'show') return;
    this.phase = 'guess';
    this.setTimer(GUESS_MS);
    this.later(GUESS_MS, () => this.startCount());
  }

  // Work out everyone's points, then let the TV count the cubes up before the results show.
  startCount() {
    if (this.phase !== 'show' && this.phase !== 'guess') return;
    const span = this.showMs + GUESS_MS;
    for (const [pid, a] of this.answers) {
      const off = Math.abs(a.n - this.count);
      let pts = 0;
      if (off === 0) pts = 100 + Math.round(50 * Math.max(0, 1 - a.ms / span));
      else if (off === 1) pts = 50;
      else if (off === 2) pts = 20;
      a.off = off;
      a.pts = pts;
    }
    this.phase = 'count';
    const ms = this.layers * LAYER_MS + COUNT_TAIL_MS;
    this.setTimer(ms);
    this.later(ms, () => this.startReveal());
  }

  startReveal() {
    if (this.phase !== 'count') return;
    // Points land with the results, so phones don't give the count away early.
    for (const [pid, a] of this.answers) { const p = this.players.get(pid); if (p) p.score += a.pts; }
    this.phase = 'reveal';
    this.setTimer(REVEAL_MS);
    this.later(REVEAL_MS, () => this.next());
  }

  next() {
    if (this.phase !== 'reveal') return;
    if (this.round >= ROUNDS) { clearTimeout(this.timer); this.phase = 'end'; this.endsAt = null; return; }
    this.startRound();
  }

  handle(actor, type, p) {
    p = p || {};
    const host = actor.role === 'console' || !!actor.isHost;
    const pid = actor.playerId;
    switch (type) {
      case 'answer': {
        if (this.phase !== 'show' && this.phase !== 'guess') return 'Not accepting answers';
        if (!pid || !this.players.has(pid)) return 'Join the game first';
        if (this.answers.has(pid)) return 'Already answered';
        const n = Number(p.n);
        if (!Number.isInteger(n) || n < 0 || n > 999) return 'Type a number';
        this.answers.set(pid, { n, ms: Date.now() - this.shownAt });
        if (this.allAnswered()) this.startCount();
        return null;
      }
      case 'skip':
        if (!host) return 'Host only';
        if (this.phase === 'show') { this.startGuess(); return null; }
        if (this.phase === 'guess') { this.startCount(); return null; }
        if (this.phase === 'count') { this.startReveal(); return null; }
        if (this.phase === 'reveal') { this.next(); return null; }
        return 'Nothing to skip';
      case 'adjust': {
        if (!host) return 'Host only';
        const pl = this.players.get(p.playerId);
        if (!pl || !Number.isFinite(Number(p.delta))) return 'Bad adjustment';
        pl.score += Number(p.delta);
        return null;
      }
      default: return 'Unknown action';
    }
  }

  view(role, pid) {
    const done = this.phase === 'count' || this.phase === 'reveal' || this.phase === 'end';
    const priv = role === 'console';
    // Phones never get the stack: the only place to count it is the TV.
    const showStack = (role === 'display' && this.phase !== 'guess') || priv || done;
    const mine = pid ? this.answers.get(pid) : null;
    const results = this.phase === 'reveal' || this.phase === 'end';
    return {
      game: 'cubes',
      title: 'Count the Cubes',
      level: this.levelName,
      phase: this.phase,
      round: this.round,
      rounds: ROUNDS,
      stack: showStack ? this.stack : null,
      color: this.color,
      layerMs: LAYER_MS,
      count: done || priv ? this.count : null,
      answeredIds: [...this.answers.keys()],
      myAnswer: mine ? { n: mine.n, off: results ? mine.off : null, pts: results ? mine.pts : null } : null,
      results: results ? [...this.answers.entries()].map(([id, a]) => ({ id, n: a.n, off: a.off, pts: a.pts })) : null,
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected })),
      endsAt: this.endsAt || null,
      windowMs: this.total || 0,
    };
  }
}

module.exports = { Cubes, buildStack };
