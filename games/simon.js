'use strict';
// Simon Says: four colored pads light up in a pattern on the TV. Then repeat the pattern on
// your phone. The pattern starts at 3 and grows by one each round, up to 10.
// Getting the whole pattern right scores 20 points per step, plus a speed bonus of up to 30%.
// Phases: watch -> repeat -> reveal -> ... -> end.

const ROUNDS = 8;
const STEP_MS = 750;      // one pad lighting on the TV
const LEAD_MS = 1200;     // a beat before the first pad
const REVEAL_MS = 4500;

const rand = n => Math.floor(Math.random() * n);

class Simon {
  constructor(players, notify) {
    this.players = players;
    this.notify = notify;
    for (const p of players.values()) p.score = 0;
    this.round = 0;
    this.seq = [];
    this.timer = null;
    this.startRound();
  }

  dispose() { clearTimeout(this.timer); }
  onPlayerRemoved() { if (this.phase === 'repeat' && this.allAnswered()) this.reveal(); }

  later(ms, fn) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; try { fn(); } catch (e) { console.error(e); } this.notify(); }, ms);
  }
  setTimer(ms) { this.endsAt = Date.now() + ms; this.total = ms; }
  allAnswered() {
    const live = [...this.players.values()].filter(p => p.connected);
    return live.length > 0 && live.every(p => this.answers.has(p.id));
  }

  startRound() {
    this.round += 1;
    const len = Math.min(10, 2 + this.round);
    // The pattern grows from last round's, like the real Simon, so memory builds up.
    while (this.seq.length < len) {
      let next = rand(4);
      if (this.seq.length >= 2 && this.seq[this.seq.length - 1] === next && this.seq[this.seq.length - 2] === next) next = (next + 1 + rand(3)) % 4;
      this.seq.push(next);
    }
    this.answers = new Map();
    this.phase = 'watch';
    this.watchStart = Date.now() + LEAD_MS;
    const ms = LEAD_MS + this.seq.length * STEP_MS + 300;
    this.setTimer(ms);
    this.later(ms, () => this.startRepeat());
  }

  startRepeat() {
    if (this.phase !== 'watch') return;
    this.phase = 'repeat';
    this.askedAt = Date.now();
    this.repeatMs = 5000 + this.seq.length * 1200;
    this.setTimer(this.repeatMs);
    this.later(this.repeatMs, () => this.reveal());
  }

  reveal() {
    if (this.phase !== 'repeat') return;
    for (const [pid, a] of this.answers) {
      a.correct = a.seq.length === this.seq.length && a.seq.every((x, i) => x === this.seq[i]);
      a.upTo = a.seq.findIndex((x, i) => x !== this.seq[i]);
      if (a.upTo < 0) a.upTo = Math.min(a.seq.length, this.seq.length);
      const base = 20 * this.seq.length;
      a.pts = a.correct ? Math.round(base * (1 + 0.3 * Math.max(0, 1 - a.ms / this.repeatMs))) : 0;
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
        if (this.phase !== 'repeat') return 'Watch the TV first';
        if (!pid || !this.players.has(pid)) return 'Join the game first';
        if (this.answers.has(pid)) return 'Already answered';
        const seq = Array.isArray(p.seq) ? p.seq.slice(0, 12).map(Number) : [];
        if (!seq.length || seq.some(x => !Number.isInteger(x) || x < 0 || x > 3)) return 'Tap the pads';
        this.answers.set(pid, { seq, ms: Date.now() - this.askedAt });
        if (this.allAnswered()) this.reveal();
        return null;
      }
      case 'skip':
        if (!host) return 'Host only';
        if (this.phase === 'watch') { this.startRepeat(); return null; }
        if (this.phase === 'repeat') { this.reveal(); return null; }
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
    const done = this.phase === 'reveal' || this.phase === 'end';
    const mine = pid ? this.answers.get(pid) : null;
    return {
      game: 'simon',
      title: 'Simon Says',
      phase: this.phase,
      round: this.round,
      rounds: ROUNDS,
      length: this.seq.length,
      // The pattern is shown on the TV while it plays (and to everyone at the reveal).
      seq: role === 'display' && this.phase === 'watch' || role === 'console' || done ? this.seq : null,
      watchStart: this.watchStart,
      stepMs: STEP_MS,
      answeredIds: [...this.answers.keys()],
      myAnswer: mine ? { len: mine.seq.length, correct: done ? mine.correct : null, upTo: done ? mine.upTo : null, pts: done ? mine.pts : null } : null,
      results: done ? [...this.answers.entries()].map(([id, a]) => ({ id, correct: a.correct, upTo: a.upTo, pts: a.pts })) : null,
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected })),
      endsAt: this.endsAt || null,
      windowMs: this.total || 0,
    };
  }
}

module.exports = { Simon };
