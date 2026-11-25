'use strict';
// Tip the Scales: seesaws on the TV show which shape outweighs which. Work out which shape is the
// heaviest (or, in later rounds, sometimes the lightest) and tap it on your phone. Each seesaw
// compares two shapes; together they always give exactly one answer, but you have to chain
// them ("star beats heart, heart beats moon...").
//
// Phases: question -> reveal -> ... -> end.

const ROUNDS = 10;
const REVEAL_MS = 6000;

const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'diamond', 'moon', 'hexagon'];
const COLORS = { circle: '#ff6b6b', square: '#4dabf7', triangle: '#69db7c', star: '#ffd43b', heart: '#f06595', diamond: '#3bc9db', moon: '#b197fc', hexagon: '#ff922b' };

const rand = n => Math.floor(Math.random() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Round plan: how many shapes, and how long to answer.
function plan(round) {
  if (round <= 3) return { n: 3, ms: 20000 };
  if (round <= 6) return { n: 4, ms: 18000 };
  if (round <= 8) return { n: 5, ms: 16000 };
  return { n: 5, ms: 13000 };
}

// Build a puzzle: shapes with hidden weights and seesaws that decide one answer.
// For "heaviest", every other shape loses on some seesaw (to a random heavier shape, so the
// clues chain), and the heaviest never loses. "Lightest" is the mirror image.
function makePuzzle(n, ask) {
  const shapes = shuffle(SHAPES.slice()).slice(0, n);
  const order = shuffle(shapes.slice()); // order[0] is the lightest, order[n-1] the heaviest
  const weight = Object.fromEntries(order.map((s, i) => [s, i + 1]));
  const seesaws = [];
  for (let i = 0; i < n; i++) {
    const s = order[i];
    if (ask === 'heaviest' && i < n - 1) {
      const heavier = order[i + 1 + rand(n - 1 - i)];
      seesaws.push([s, heavier]);
    } else if (ask === 'lightest' && i > 0) {
      const lighter = order[rand(i)];
      seesaws.push([lighter, s]);
    }
  }
  // Each seesaw: left and right shape, and which side goes down.
  const shown = shuffle(seesaws).map(([light, heavy]) => (Math.random() < 0.5
    ? { left: light, right: heavy, down: 'right' } : { left: heavy, right: light, down: 'left' }));
  const answer = ask === 'heaviest' ? order[n - 1] : order[0];
  return { shapes, weight, order, seesaws: shown, answer, ask };
}

class Scales {
  constructor(players, notify) {
    this.players = players;
    this.notify = notify;
    for (const p of players.values()) p.score = 0;
    this.round = 0;
    this.timer = null;
    this.answers = new Map();
    this.startRound();
  }

  dispose() { clearTimeout(this.timer); }

  onPlayerRemoved() {
    if (this.phase === 'question' && this.allAnswered()) this.reveal();
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

  allAnswered() {
    const live = [...this.players.values()].filter(p => p.connected);
    return live.length > 0 && live.every(p => this.answers.has(p.id));
  }

  startRound() {
    this.round += 1;
    const { n, ms } = plan(this.round);
    // From round 4 on, some rounds ask for the lightest instead, so read the question.
    const ask = this.round >= 4 && Math.random() < 0.4 ? 'lightest' : 'heaviest';
    this.puzzle = makePuzzle(n, ask);
    this.answers = new Map();
    this.phase = 'question';
    this.askedAt = Date.now();
    this.ms = ms;
    this.setTimer(ms);
    this.later(ms, () => this.reveal());
  }

  reveal() {
    if (this.phase !== 'question') return;
    for (const [pid, a] of this.answers) {
      a.correct = a.shape === this.puzzle.answer;
      a.pts = a.correct ? 100 + Math.round(50 * Math.max(0, 1 - a.ms / this.ms)) : 0;
      const p = this.players.get(pid);
      if (p) p.score += a.pts;
    }
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
        if (this.phase !== 'question') return 'Not accepting answers';
        if (!pid || !this.players.has(pid)) return 'Join the game first';
        if (this.answers.has(pid)) return 'Already answered';
        if (!this.puzzle.shapes.includes(p.shape)) return 'Pick a shape';
        this.answers.set(pid, { shape: p.shape, ms: Date.now() - this.askedAt });
        if (this.allAnswered()) this.reveal();
        return null;
      }
      case 'skip':
        if (!host) return 'Host only';
        if (this.phase === 'question') { this.reveal(); return null; }
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
    const pz = this.puzzle;
    const done = this.phase === 'reveal' || this.phase === 'end';
    const priv = role === 'console';
    const mine = pid ? this.answers.get(pid) : null;
    return {
      game: 'scales',
      title: 'Tip the Scales',
      phase: this.phase,
      round: this.round,
      rounds: ROUNDS,
      ask: pz.ask,
      shapes: pz.shapes.map(s => ({ id: s, color: COLORS[s] })),
      // The seesaws are the puzzle: only the TV (and the console) shows them.
      seesaws: role === 'display' || priv || done ? pz.seesaws : null,
      answer: done || priv ? pz.answer : null,
      order: done || priv ? pz.order.slice().reverse() : null, // heaviest first
      answeredIds: [...this.answers.keys()],
      myAnswer: mine ? { shape: mine.shape, correct: done ? mine.correct : null, pts: done ? mine.pts : null } : null,
      results: done ? [...this.answers.entries()].map(([id, a]) => ({ id, shape: a.shape, correct: a.correct, pts: a.pts })) : null,
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected })),
      endsAt: this.endsAt || null,
      windowMs: this.total || 0,
    };
  }
}

module.exports = { Scales, makePuzzle, COLORS };
