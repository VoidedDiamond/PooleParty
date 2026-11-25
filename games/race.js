'use strict';
// Shared engine for the brain-game races (Quick Math, Pop in Order): everyone works through the
// same list of puzzles on their own phone at the same time, as fast as they can, while the TV
// shows the race. Each round: ready (a short countdown) -> play -> results. Points count live.
//
// A game extends Race and provides:
//   makeRound(round)          -> { items: [...], ...anything else for the round }
//   attempt(prog, item, p)    -> { ok, pts, done }  check one move on the current item
//                                (done: move on to the next item)
//   itemView(item)            -> what the phone shows for an item (never the answer, unless
//                                the game needs it on the phone to play)
//   roundLabel(round)         -> a short description of the round ("Adding and taking away")

const READY_MS = 3500;
const RESULTS_MS = 6500;

class Race {
  constructor(players, notify, { game, title, rounds = 3, playMs = 40000, lockMs = 900 }) {
    Object.assign(this, { players, notify, game, title, rounds, playMs, lockMs });
    for (const p of players.values()) p.score = 0;
    this.round = 0;
    this.timer = null;
    this.startRound();
  }

  dispose() { clearTimeout(this.timer); }
  onPlayerRemoved() {}

  later(ms, fn) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      try { fn(); } catch (e) { console.error(e); }
      this.notify();
    }, ms);
  }
  setTimer(ms) { this.endsAt = Date.now() + ms; this.total = ms; }

  startRound() {
    this.round += 1;
    this.data = this.makeRound(this.round);
    this.progress = new Map(); // pid -> { idx, right, wrong, pts, lockUntil, last }
    this.phase = 'ready';
    this.setTimer(READY_MS);
    this.later(READY_MS, () => this.startPlay());
  }

  startPlay() {
    if (this.phase !== 'ready') return;
    this.phase = 'play';
    this.setTimer(this.playMs);
    this.later(this.playMs, () => this.finishRound());
  }

  finishRound() {
    if (this.phase !== 'play') return;
    this.phase = 'results';
    this.setTimer(RESULTS_MS);
    this.later(RESULTS_MS, () => this.next());
  }

  next() {
    if (this.phase !== 'results') return;
    if (this.round >= this.rounds) { clearTimeout(this.timer); this.phase = 'end'; this.endsAt = null; return; }
    this.startRound();
  }

  prog(pid) {
    let pr = this.progress.get(pid);
    if (!pr) { pr = { idx: 0, step: 0, right: 0, wrong: 0, pts: 0, lockUntil: 0, last: null }; this.progress.set(pid, pr); }
    return pr;
  }

  handle(actor, type, p) {
    p = p || {};
    const host = actor.role === 'console' || !!actor.isHost;
    const pid = actor.playerId;
    switch (type) {
      case 'move': {
        if (this.phase !== 'play') return 'Not yet';
        const player = pid && this.players.get(pid);
        if (!player) return 'Join the game first';
        const pr = this.prog(pid);
        if (Number(p.idx) !== pr.idx) return null; // a late tap on a puzzle already done
        if (Date.now() < pr.lockUntil) return null;
        const item = this.data.items[pr.idx % this.data.items.length];
        const r = this.attempt(pr, item, p);
        pr.last = { ok: r.ok, at: Date.now(), n: (pr.last ? pr.last.n : 0) + 1 };
        if (r.ok) pr.right += 1; else { pr.wrong += 1; pr.lockUntil = Date.now() + this.lockMs; }
        pr.pts += r.pts;
        player.score += r.pts;
        if (r.done) { pr.idx += 1; pr.step = 0; }
        return null;
      }
      case 'skip':
        if (!host) return 'Host only';
        if (this.phase === 'ready') { this.startPlay(); return null; }
        if (this.phase === 'play') { this.finishRound(); return null; }
        if (this.phase === 'results') { this.next(); return null; }
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
    const pr = pid ? this.prog(pid) : null;
    const item = pr && this.phase === 'play' ? this.data.items[pr.idx % this.data.items.length] : null;
    return {
      game: this.game,
      title: this.title,
      phase: this.phase,
      round: this.round,
      rounds: this.rounds,
      roundLabel: this.roundLabel(this.round),
      me: pr ? { idx: pr.idx, step: pr.step, right: pr.right, wrong: pr.wrong, pts: pr.pts, last: pr.last, lockUntil: pr.lockUntil, item: item ? this.itemView(item, pr) : null } : null,
      race: [...this.players.values()].map(p => {
        const x = this.progress.get(p.id);
        return { id: p.id, right: x ? x.right : 0, wrong: x ? x.wrong : 0, pts: x ? x.pts : 0 };
      }),
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected })),
      endsAt: this.endsAt || null,
      windowMs: this.total || 0,
    };
  }
}

const rand = n => Math.floor(Math.random() * n);
const between = (a, b) => a + rand(b - a + 1);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

module.exports = { Race, rand, between, shuffle };
