'use strict';
// Blurry Picture: a picture starts out blurry and zoomed in on the TV and slowly comes into
// focus. Pick what it is from four choices on your phone, one guess each. The sooner you get it
// right, the more it's worth: up to 200, down to 50 once it's sharp. Ten rounds.
const { ITEMS } = require('./memory');

const ROUNDS = 10;
const ASK_MS = 15000;     // the picture sharpens over this long
const REVEAL_MS = 4500;

const rand = n => Math.floor(Math.random() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

class Blurry {
  constructor(players, notify) {
    this.players = players;
    this.notify = notify;
    for (const p of players.values()) p.score = 0;
    this.round = 0;
    this.used = new Set();
    this.timer = null;
    this.startRound();
  }

  dispose() { clearTimeout(this.timer); }
  onPlayerRemoved() { if (this.phase === 'question' && this.allAnswered()) this.reveal(); }

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
    const fresh = ITEMS.filter(([, name]) => !this.used.has(name));
    const [e, name] = fresh[rand(fresh.length)];
    this.used.add(name);
    this.item = { e, name };
    // Later rounds get a bigger zoom, so it starts harder.
    this.zoom = this.round <= 3 ? 3 : this.round <= 7 ? 4 : 5;
    const others = shuffle(ITEMS.filter(([, n]) => n !== name)).slice(0, 3).map(([oe, n]) => ({ e: oe, name: n }));
    this.options = shuffle([this.item, ...others]);
    this.answers = new Map();
    this.phase = 'question';
    this.askedAt = Date.now();
    this.setTimer(ASK_MS);
    this.later(ASK_MS + 400, () => this.reveal());
  }

  reveal() {
    if (this.phase !== 'question') return;
    for (const [pid, a] of this.answers) {
      a.correct = a.name === this.item.name;
      a.pts = a.correct ? Math.round(50 + 150 * Math.max(0, 1 - a.ms / ASK_MS)) : 0;
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
        if (this.phase !== 'question') return 'Not now';
        if (!pid || !this.players.has(pid)) return 'Join the game first';
        if (this.answers.has(pid)) return 'Already answered';
        if (!this.options.some(o => o.name === p.name)) return 'Pick one of the pictures';
        this.answers.set(pid, { name: p.name, ms: Date.now() - this.askedAt });
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
    const done = this.phase === 'reveal' || this.phase === 'end';
    const mine = pid ? this.answers.get(pid) : null;
    return {
      game: 'blurry',
      title: 'Blurry Picture',
      phase: this.phase,
      round: this.round,
      rounds: ROUNDS,
      // The picture is only on the TV (and phones see it at the reveal).
      picture: role === 'display' || role === 'console' || done ? this.item : null,
      zoom: this.zoom,
      askedAt: this.askedAt,
      askMs: ASK_MS,
      options: this.options.map(o => ({ name: o.name })),
      answer: done || role === 'console' ? this.item : null,
      answeredIds: [...this.answers.keys()],
      myAnswer: mine ? { name: mine.name, correct: done ? mine.correct : null, pts: done ? mine.pts : null } : null,
      results: done ? [...this.answers.entries()].map(([id, a]) => ({ id, name: a.name, correct: a.correct, pts: a.pts })) : null,
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected })),
      endsAt: this.endsAt || null,
      windowMs: this.total || 0,
    };
  }
}

module.exports = { Blurry };
