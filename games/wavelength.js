'use strict';
const { sampleFill } = require('./content');

// Scale and zone widths lifted from the open source Taajuus/Telewave clones (see README credits):
// the scale runs 0-1000, and the "bullseye" zone is 45 units wide, with the 3- and 2-point zones
// 3x and 5x that width, all centered on the hidden target.
const SCALE = 1000;
const ZONE = 45;
const CLUE_MS = 60000;
const GUESS_MS = 45000;
const REVEAL_MS = 7000;

function scoreFor(diff) {
  if (diff <= ZONE / 2) return 4;
  if (diff <= (3 * ZONE) / 2) return 3;
  if (diff <= (5 * ZONE) / 2) return 2;
  return 0;
}

class Wavelength {
  // opts: { source }
  constructor(players, notify, opts) {
    this.players = players;
    this.notify = notify;
    // Turn order is fixed at game start (like Feud's teams); joining later means watching this game out.
    this.order = [...players.keys()];
    this.rounds = this.order.length;
    this.pairs = sampleFill(opts.source.data.pairs, this.rounds);
    for (const p of players.values()) p.score = 0;
    this.round = -1;
    this.timer = null;
    this.startRound();
  }

  dispose() { clearTimeout(this.timer); }
  onPlayerRemoved() {
    if (this.phase === 'guessing' && this.allLocked()) this.finishGuessing();
  }

  // Everyone except the psychic guesses this round, each on their own phone.
  connectedGuessers() { return [...this.players.values()].filter(p => p.connected && p.id !== this.psychicId).map(p => p.id); }
  allLocked() { const g = this.connectedGuessers(); return g.length > 0 && g.every(id => this.locked.has(id)); }

  later(ms, fn) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      try { fn(); } catch (e) { console.error(e); }
      this.notify();
    }, ms);
  }

  setTimer(ms) { this.endsAt = Date.now() + ms; this.total = ms; }
  name(id) { const p = this.players.get(id); return p ? p.name : 'Someone'; }

  startRound() {
    this.round += 1;
    const pair = this.pairs[this.round];
    this.left = pair.left;
    this.right = pair.right;
    this.target = Math.round(Math.random() * SCALE);
    this.psychicId = this.order[this.round % this.order.length];
    this.guesses = new Map(); // pid -> live dial value, each guesser's own private guess
    this.locked = new Set();
    for (const id of this.connectedGuessers()) this.guesses.set(id, Math.round(SCALE / 2));
    this.result = null;
    this.phase = 'clue';
    this.setTimer(CLUE_MS);
    this.later(CLUE_MS, () => this.openGuessing());
  }

  openGuessing() {
    if (this.phase !== 'clue') return;
    this.phase = 'guessing';
    this.setTimer(GUESS_MS);
    this.later(GUESS_MS, () => this.finishGuessing());
  }

  // ---- actions -------------------------------------------------------------
  handle(actor, type, p) {
    p = p || {};
    const host = actor.role === 'console' || !!actor.isHost;
    const pid = actor.playerId;
    switch (type) {
      case 'ready':
        if (this.phase !== 'clue' || pid !== this.psychicId) return 'Not your turn';
        this.openGuessing();
        return null;
      case 'moveGuess': {
        if (this.phase !== 'guessing' || pid === this.psychicId || this.locked.has(pid)) return 'Not your turn';
        const v = Math.round(Number(p.value));
        if (!Number.isFinite(v)) return 'Bad value';
        this.guesses.set(pid, Math.max(0, Math.min(SCALE, v)));
        this.notify();
        return null;
      }
      case 'lockGuess': {
        if (this.phase !== 'guessing' || pid === this.psychicId) return 'Not your turn';
        if (this.locked.has(pid)) return 'Already locked in';
        const v = Math.round(Number(p.value));
        this.guesses.set(pid, Number.isFinite(v) ? Math.max(0, Math.min(SCALE, v)) : (this.guesses.get(pid) ?? Math.round(SCALE / 2)));
        this.locked.add(pid);
        if (this.allLocked()) this.finishGuessing();
        return null;
      }
      case 'skip':
        if (!host) return 'Host only';
        if (this.phase === 'clue') { this.openGuessing(); return null; }
        if (this.phase === 'guessing') { this.finishGuessing(); return null; }
        if (this.phase === 'reveal') { this.afterReveal(); return null; }
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

  // Each connected guesser is graded individually on how close their own dial landed to the
  // target; the psychic (whose clue everyone was working from) earns the rounded average of
  // what their teammates scored, so a clearer clue still pays off even with several guessers.
  finishGuessing() {
    if (this.phase !== 'guessing') return;
    clearTimeout(this.timer);
    const guesses = [];
    let total = 0;
    for (const pid of this.connectedGuessers()) {
      const value = this.guesses.get(pid) ?? Math.round(SCALE / 2);
      const diff = Math.abs(value - this.target);
      const pts = scoreFor(diff);
      guesses.push({ pid, value, diff, pts });
      total += pts;
      const p = this.players.get(pid);
      if (p) p.score += pts;
    }
    const psychicPts = guesses.length ? Math.round(total / guesses.length) : 0;
    const psychic = this.players.get(this.psychicId);
    if (psychic) psychic.score += psychicPts;
    this.result = { guesses, psychicPts };
    this.phase = 'reveal';
    this.setTimer(REVEAL_MS);
    this.later(REVEAL_MS, () => this.afterReveal());
  }

  afterReveal() {
    if (this.phase !== 'reveal') return 'Nothing to advance';
    clearTimeout(this.timer);
    this.timer = null;
    if (this.round + 1 >= this.rounds) { this.phase = 'end'; this.endsAt = null; }
    else this.startRound();
    return null;
  }

  // ---- view ------------------------------------------------------------
  view(role, pid) {
    const priv = role === 'console';
    const showTarget = priv || pid === this.psychicId || this.phase === 'reveal' || this.phase === 'end';
    const isGuesser = this.phase === 'guessing' && pid !== this.psychicId;
    const guessers = this.phase === 'guessing' ? this.connectedGuessers() : [];
    return {
      game: 'wavelength',
      title: 'Wavelength',
      phase: this.phase,
      round: this.round + 1,
      rounds: this.rounds,
      left: this.left,
      right: this.right,
      scale: SCALE,
      zone: ZONE,
      psychicId: this.psychicId,
      myGuess: isGuesser ? (this.guesses.get(pid) ?? Math.round(SCALE / 2)) : null,
      myLocked: this.locked ? this.locked.has(pid) : false,
      guesserCount: guessers.length,
      lockedCount: guessers.filter(id => this.locked.has(id)).length,
      target: showTarget ? this.target : null,
      result: (this.phase === 'reveal' || this.phase === 'end') && this.result ? {
        psychicPts: this.result.psychicPts,
        guesses: this.result.guesses.map(g => ({ pid: g.pid, name: this.name(g.pid), value: g.value, diff: g.diff, pts: g.pts })),
      } : null,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected,
      })),
      endsAt: this.endsAt || null,
      windowMs: this.total || 0,
    };
  }
}

module.exports = { Wavelength, SCALE, ZONE };
