'use strict';
const { shuffle, sample } = require('./content');
const { score, ACCEPT } = require('./match');

const ROUNDS = 3;
const CATS_PER_ROUND = 8;
const WRITE_MS = 90000;
const CHALLENGE_MS = 25000;
const CAT_PAUSE_MS = 1200;
const ROUND_END_MS = 6000;

class Scattergories {
  // opts: { source }
  constructor(players, notify, opts) {
    this.players = players;
    this.notify = notify;
    this.categoryPool = opts.source.data.categories;
    this.letters = opts.source.data.letters;
    this.usedCats = new Set();
    this.round = -1;
    this.timer = null;
    for (const p of players.values()) p.score = 0;
    this.startRound();
  }

  dispose() { clearTimeout(this.timer); }
  onPlayerRemoved() {
    if (this.phase === 'writing' && this.allSubmitted()) this.startJudging();
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

  connectedIds() { return [...this.players.values()].filter(p => p.connected).map(p => p.id); }

  startRound() {
    this.round += 1;
    if (this.round >= ROUNDS) { this.phase = 'end'; this.endsAt = null; return; }
    this.letter = this.letters[Math.floor(Math.random() * this.letters.length)];
    const avail = this.categoryPool.filter(c => !this.usedCats.has(c));
    const pool = avail.length >= CATS_PER_ROUND ? avail : this.categoryPool;
    this.categories = shuffle(pool).slice(0, CATS_PER_ROUND);
    this.categories.forEach(c => this.usedCats.add(c));
    this.answers = new Map(); // playerId -> [text per category]
    this.doneIds = new Set();
    this.catIdx = 0;
    this.challenges = null; // Map answerOwnerId -> Set(challengerId), for the active category
    this.results = null; // per-category results once judged, keyed by catIdx
    this.catScores = this.categories.map(() => null);
    this.phase = 'writing';
    this.setTimer(WRITE_MS);
    this.later(WRITE_MS, () => this.startJudging());
  }

  allSubmitted() {
    const connected = this.connectedIds();
    return connected.length > 0 && connected.every(id => this.doneIds.has(id));
  }

  sanitizeAnswers(answers) {
    const list = Array.isArray(answers) ? answers.slice(0, CATS_PER_ROUND).map(a => String(a || '').trim().slice(0, 40)) : [];
    while (list.length < this.categories.length) list.push('');
    return list;
  }

  submitAnswers(pid, answers) {
    if (this.phase !== 'writing') return 'Not accepting answers right now';
    this.answers.set(pid, this.sanitizeAnswers(answers));
    this.doneIds.add(pid);
    if (this.allSubmitted()) this.startJudging();
    return null;
  }

  // A player's phone can go to sleep or background right as the writing timer runs out, and
  // browsers throttle/pause client-side JS timers when that happens — so a client timer racing
  // the server's own deadline is not reliable. Instead the phone streams its draft here on every
  // keystroke (like Wavelength's live dial), so whatever was last typed is already on the server
  // by the time the timer expires, with no last-second action required from the client at all.
  updateDraft(pid, answers) {
    if (this.phase !== 'writing' || this.doneIds.has(pid)) return null;
    this.answers.set(pid, this.sanitizeAnswers(answers));
    return null;
  }

  // An answer must at least start with the letter to be worth judging at all — that part is
  // objective, so it never needs a group vote.
  validLetter(text) {
    const t = String(text || '').trim();
    return t.length > 0 && t[0].toUpperCase() === this.letter;
  }

  startJudging() {
    clearTimeout(this.timer);
    this.phase = 'judging';
    this.startChallenge();
  }

  startChallenge() {
    this.challenges = new Map();
    this.agreed = new Set(); // pid -> has said "no challenge from me", lets the group skip the wait
    this.setTimer(CHALLENGE_MS);
    const idx = this.catIdx;
    this.later(CHALLENGE_MS, () => { if (this.phase === 'judging' && this.catIdx === idx) this.resolveCategory(); });
  }

  // Once every connected player has either raised a challenge or explicitly agreed there's
  // nothing to challenge, there's no reason to sit through the rest of the timer.
  maybeResolveEarly() {
    if (this.phase !== 'judging') return;
    const responded = new Set(this.agreed);
    for (const challengers of this.challenges.values()) for (const id of challengers) responded.add(id);
    if (this.connectedIds().every(id => responded.has(id))) this.resolveCategory();
  }

  agree(pid) {
    if (this.phase !== 'judging') return 'Not now';
    this.agreed.add(pid);
    this.maybeResolveEarly();
    return null;
  }

  currentEntries() {
    // [{ pid, name, text, letterOk }] for the active category, letter-invalid ones excluded from voting
    // (they're shown, but auto-worth 0, since that check isn't a matter of opinion).
    const out = [];
    for (const [pid, list] of this.answers) {
      const p = this.players.get(pid);
      const text = (list[this.catIdx] || '').trim();
      if (!text) continue;
      out.push({ pid, name: p ? p.name : 'Someone', text, letterOk: this.validLetter(text) });
    }
    return out;
  }

  challenge(pid, targetPid) {
    if (this.phase !== 'judging') return 'Not now';
    if (pid === targetPid) return 'You cannot challenge your own answer';
    const entries = this.currentEntries();
    if (!entries.some(e => e.pid === targetPid)) return 'No such answer';
    if (!this.challenges.has(targetPid)) this.challenges.set(targetPid, new Set());
    this.challenges.get(targetPid).add(pid);
    this.maybeResolveEarly();
    return null;
  }

  resolveCategory() {
    if (this.phase !== 'judging') return;
    clearTimeout(this.timer);
    const entries = this.currentEntries();
    const eligibleVoters = this.connectedIds();
    const verdicts = entries.map(e => {
      if (!e.letterOk) return { ...e, valid: false, reason: `doesn't start with ${this.letter}` };
      const challengers = this.challenges.get(e.pid) || new Set();
      const need = Math.ceil(Math.max(0, eligibleVoters.length - 1) / 2);
      const valid = need === 0 ? true : challengers.size < need;
      return { ...e, valid, reason: valid ? null : 'the group ruled it out' };
    });
    // Score: 2 pts unique valid answer, 1 pt valid but matches another valid answer, 0 invalid.
    for (const v of verdicts) {
      if (!v.valid) { v.points = 0; continue; }
      const dup = verdicts.some(o => o !== v && o.valid && score(v.text, o.text) >= ACCEPT);
      v.points = dup ? 1 : 2;
    }
    for (const v of verdicts) { const p = this.players.get(v.pid); if (p) p.score += v.points; }
    this.catScores[this.catIdx] = verdicts;
    this.phase = 'catResult';
    this.setTimer(CAT_PAUSE_MS);
    const idx = this.catIdx;
    this.later(CAT_PAUSE_MS, () => { if (this.catIdx === idx) this.nextCategory(); });
  }

  nextCategory() {
    this.catIdx += 1;
    if (this.catIdx >= this.categories.length) { this.finishRound(); return; }
    this.phase = 'judging';
    this.startChallenge();
  }

  finishRound() {
    this.phase = 'roundEnd';
    this.setTimer(ROUND_END_MS);
    this.later(ROUND_END_MS, () => this.startRound());
  }

  handle(actor, type, p) {
    p = p || {};
    const host = actor.role === 'console' || !!actor.isHost;
    const pid = actor.playerId;
    switch (type) {
      case 'submitAnswers': return pid ? this.submitAnswers(pid, p.answers) : 'Players only';
      case 'updateDraft': return pid ? this.updateDraft(pid, p.answers) : 'Players only';
      case 'challenge': return pid ? this.challenge(pid, p.target) : 'Players only';
      case 'agree': return pid ? this.agree(pid) : 'Players only';
      case 'skip':
        if (!host) return 'Host only';
        if (this.phase === 'writing') { this.startJudging(); return null; }
        if (this.phase === 'judging') { this.resolveCategory(); return null; }
        if (this.phase === 'catResult') { this.nextCategory(); return null; }
        if (this.phase === 'roundEnd') { this.startRound(); return null; }
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
    const base = {
      game: 'scattergories', title: 'Scattergories', phase: this.phase,
      round: this.round + 1, rounds: ROUNDS,
      letter: this.letter, categories: this.categories,
      doneCount: this.doneIds ? this.doneIds.size : 0, totalCount: this.connectedIds().length,
      // doneIds, not answers: answers also holds the live drafts streamed while typing.
      mySubmitted: !!(this.doneIds && this.doneIds.has(pid)),
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected,
      })),
      endsAt: this.endsAt || null, windowMs: this.total || 0,
    };
    if (['judging', 'catResult'].includes(this.phase)) {
      const entries = this.currentEntries();
      base.catIdx = this.catIdx;
      base.category = this.categories[this.catIdx];
      base.entries = entries.map(e => ({
        pid: e.pid, name: e.name, text: e.text, mine: e.pid === pid,
        challengedByMe: this.phase === 'judging' && !!(this.challenges.get(e.pid) || new Set()).has(pid),
        challengeCount: this.phase === 'catResult' ? undefined : (this.challenges.get(e.pid) || new Set()).size,
      }));
      if (this.phase === 'judging') {
        const responded = new Set(this.agreed);
        for (const challengers of this.challenges.values()) for (const id of challengers) responded.add(id);
        base.myResponded = responded.has(pid);
        base.respondedCount = responded.size;
        base.voterCount = this.connectedIds().length;
      }
      if (this.phase === 'catResult' && this.catScores[this.catIdx]) {
        base.verdicts = this.catScores[this.catIdx].map(v => ({
          pid: v.pid, name: v.name, text: v.text, valid: v.valid, points: v.points, reason: v.reason,
        }));
      }
    }
    if (priv && this.phase === 'writing') {
      base.liveAnswers = [...this.answers.entries()].map(([id, list]) => ({ id, list }));
    }
    return base;
  }
}

module.exports = { Scattergories };
