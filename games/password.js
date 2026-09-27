'use strict';
const { sampleFill } = require('./content');

const ROUNDS = 8;
const START_POINTS = 10;
const STEP = 2;
const CLUE_MS = 30000;
const GUESS_MS = 25000;
const REVEAL_MS = 4000;

class Password {
  // opts: { source }
  constructor(players, notify, opts) {
    this.players = players;
    this.notify = notify;
    this.words = sampleFill(opts.source.data.words, ROUNDS);
    this.round = -1;
    this.rot = 0;
    this.timer = null;
    for (const p of players.values()) p.score = 0;
    this.startRound();
  }

  dispose() { clearTimeout(this.timer); }
  onPlayerRemoved() {
    if (!this.players.has(this.hinterId) || !this.players.has(this.guesserId)) {
      if (this.phase !== 'reveal' && this.phase !== 'end') this.finishRound(0, true);
    }
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

  order() {
    const all = [...this.players.values()];
    const live = all.filter(p => p.connected);
    return (live.length >= 2 ? live : all).map(p => p.id);
  }

  startRound() {
    this.round += 1;
    if (this.round >= ROUNDS) { this.phase = 'end'; this.endsAt = null; return; }
    const list = this.order();
    if (list.length < 2) { this.phase = 'end'; this.endsAt = null; return; }
    this.hinterId = list[this.rot % list.length];
    this.guesserId = list[(this.rot + 1) % list.length];
    this.rot += 1;
    this.word = this.words[this.round];
    this.points = START_POINTS;
    this.clueText = '';
    this.clueCount = 0;
    this.startClue();
  }

  startClue() {
    this.phase = 'clue';
    this.setTimer(CLUE_MS);
    const round = this.round;
    this.later(CLUE_MS, () => { if (this.phase === 'clue' && this.round === round) this.penalize(); });
  }

  // A clue that never came (timeout/host skip) or a wrong guess costs points; out of points ends the round.
  penalize() {
    this.points = Math.max(0, this.points - STEP);
    if (this.points <= 0) { this.finishRound(0, true); return; }
    this.startClue();
  }

  giveClue(pid, text) {
    if (this.phase !== 'clue' || pid !== this.hinterId) return 'Not your turn to give a clue';
    const word = String(text || '').trim().split(/\s+/)[0] || '';
    if (!word) return 'Type a one-word clue';
    this.clueText = word.slice(0, 20);
    this.clueCount += 1;
    this.phase = 'guessing';
    this.setTimer(GUESS_MS);
    const round = this.round;
    this.later(GUESS_MS, () => { if (this.phase === 'guessing' && this.round === round) this.penalize(); });
    return null;
  }

  gotIt(pid) {
    if (this.phase !== 'guessing' || pid !== this.hinterId) return 'Not now';
    this.finishRound(this.points, false);
    return null;
  }

  miss(pid) {
    if (this.phase !== 'guessing' || pid !== this.hinterId) return 'Not now';
    this.penalize();
    return null;
  }

  finishRound(points, failed) {
    clearTimeout(this.timer);
    if (points > 0) {
      const h = this.players.get(this.hinterId); const g = this.players.get(this.guesserId);
      if (h) h.score += points;
      if (g) g.score += points;
    }
    this.awarded = points;
    this.failed = failed;
    this.phase = 'reveal';
    this.setTimer(REVEAL_MS);
    this.later(REVEAL_MS, () => this.startRound());
  }

  handle(actor, type, p) {
    p = p || {};
    const host = actor.role === 'console' || !!actor.isHost;
    const pid = actor.playerId;
    switch (type) {
      case 'giveClue': return pid ? this.giveClue(pid, p.text) : 'Players only';
      case 'gotIt': return pid ? this.gotIt(pid) : 'Players only';
      case 'miss': return pid ? this.miss(pid) : 'Players only';
      case 'skip':
        if (!host) return 'Host only';
        if (this.phase === 'clue' || this.phase === 'guessing') { this.penalize(); return null; }
        if (this.phase === 'reveal') { this.startRound(); return null; }
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
    const priv = role === 'console';
    const showWord = priv || pid === this.hinterId || this.phase === 'reveal' || this.phase === 'end';
    return {
      game: 'password', title: 'Password', phase: this.phase,
      round: this.round + 1, rounds: ROUNDS,
      hinterId: this.hinterId, guesserId: this.guesserId,
      word: showWord ? this.word : null,
      clue: this.clueText, clueCount: this.clueCount,
      points: this.points,
      awarded: this.awarded, failed: this.failed,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected,
      })),
      endsAt: this.endsAt || null, windowMs: this.total || 0,
    };
  }
}

module.exports = { Password };
