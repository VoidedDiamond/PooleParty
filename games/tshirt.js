'use strict';

const DRAW_MS = 100000;
const VOTE_MS = 45000;
const RESULTS_PAUSE_MS = 6000;
const ROUNDS_PER_GAME = 3;

class Tshirt {
  // opts: { source }  source comes from content.loadTshirtSource()
  constructor(players, notify, opts) {
    this.players = players;
    this.notify = notify;
    this.prompts = opts.source.data.prompts;
    this.used = new Set();
    this.roundNum = 0;
    for (const p of players.values()) p.score = 0;
    this.timer = null;
    this.startRound();
  }

  dispose() { clearTimeout(this.timer); }
  onPlayerRemoved() {
    if (this.phase === 'drawing' && this.allSubmitted()) this.startVoting();
    if (this.phase === 'voting') {
      const connected = [...this.players.values()].filter(x => x.connected).length;
      if (this.votes.size >= connected) this.finishVoting();
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

  startRound() {
    clearTimeout(this.timer);
    this.roundNum += 1;
    const pool = this.prompts.filter(p => !this.used.has(p));
    const source = pool.length ? pool : this.prompts;
    this.prompt = source[Math.floor(Math.random() * source.length)];
    this.used.add(this.prompt);
    this.submissions = new Map(); // playerId -> strokes[]
    this.doneIds = new Set();
    this.votes = new Map(); // voterId -> targetPlayerId
    this.galleryOrder = [];
    this.results = null;
    this.phase = 'drawing';
    this.setTimer(DRAW_MS);
    this.later(DRAW_MS, () => this.startVoting());
  }

  allSubmitted() {
    const connected = [...this.players.values()].filter(p => p.connected).map(p => p.id);
    return connected.length > 0 && connected.every(id => this.doneIds.has(id));
  }

  handle(actor, type, p) {
    p = p || {};
    const host = actor.role === 'console' || !!actor.isHost;
    const pid = actor.playerId;
    switch (type) {
      case 'submitDrawing': {
        if (this.phase !== 'drawing') return 'Not drawing right now';
        const strokes = Array.isArray(p.strokes) ? p.strokes.slice(0, 400) : [];
        this.submissions.set(pid, strokes);
        this.doneIds.add(pid);
        if (this.allSubmitted()) this.startVoting();
        return null;
      }
      case 'vote': {
        if (this.phase !== 'voting') return 'Not voting right now';
        const target = p.targetId;
        if (target === pid || !this.submissions.has(target)) return 'Bad vote';
        this.votes.set(pid, target);
        const connected = [...this.players.values()].filter(x => x.connected).length;
        if (this.votes.size >= connected) this.finishVoting();
        return null;
      }
      case 'skip':
        if (!host) return 'Host only';
        if (this.phase === 'drawing') { this.startVoting(); return null; }
        if (this.phase === 'voting') { this.finishVoting(); return null; }
        if (this.phase === 'results') { this.afterResults(); return null; }
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

  startVoting() {
    if (this.phase !== 'drawing') return;
    clearTimeout(this.timer);
    for (const p of this.players.values()) {
      if (p.connected && !this.submissions.has(p.id)) this.submissions.set(p.id, []);
    }
    this.galleryOrder = [...this.submissions.keys()];
    this.phase = 'voting';
    this.setTimer(VOTE_MS);
    this.later(VOTE_MS, () => this.finishVoting());
  }

  finishVoting() {
    if (this.phase !== 'voting') return;
    clearTimeout(this.timer);
    const tally = new Map();
    for (const target of this.votes.values()) tally.set(target, (tally.get(target) || 0) + 1);
    let top = 0;
    for (const v of tally.values()) top = Math.max(top, v);
    this.results = this.galleryOrder.map(id => ({ id, votes: tally.get(id) || 0 }));
    for (const r of this.results) {
      if (r.votes > 0) {
        const pl = this.players.get(r.id);
        if (pl) pl.score += r.votes * 40 + (r.votes === top ? 50 : 0);
      }
    }
    this.phase = 'results';
    this.later(RESULTS_PAUSE_MS, () => this.afterResults());
  }

  afterResults() {
    if (this.phase !== 'results') return;
    clearTimeout(this.timer);
    this.timer = null;
    if (this.roundNum >= ROUNDS_PER_GAME) { this.phase = 'end'; }
    else this.startRound();
  }

  view(role, pid) {
    const priv = role === 'console';
    const showGallery = this.phase === 'voting' || this.phase === 'results' || priv;
    return {
      game: 'tshirt',
      title: 'T-Shirt Wars',
      phase: this.phase,
      roundNum: this.roundNum,
      totalRounds: ROUNDS_PER_GAME,
      prompt: this.prompt,
      doneCount: this.doneIds.size,
      totalCount: [...this.players.values()].filter(p => p.connected).length,
      designs: showGallery ? this.galleryOrder.map(id => ({
        id, name: (this.players.get(id) || {}).name || '?', strokes: this.submissions.get(id) || [],
      })) : null,
      voteOptions: this.phase === 'voting'
        ? this.galleryOrder.filter(id => id !== pid).map(id => ({ id, name: (this.players.get(id) || {}).name || '?' }))
        : null,
      myVote: this.votes.get(pid) || null,
      results: this.results,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected,
      })),
      endsAt: this.endsAt || null,
      windowMs: this.total || 0,
    };
  }
}

module.exports = { Tshirt };
