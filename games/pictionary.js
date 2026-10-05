'use strict';
const { sampleFill } = require('./content');
const { judge } = require('./match');
const ai = require('./judge');

const ROUND_MS = 80000;
const REVEAL_MS = 4500;
const CHOOSE_MS = 20000;
const WORD_CHOICES = 3;

class Pictionary {
  // opts: { source }  source comes from content.loadPictionarySource()
  constructor(players, notify, opts) {
    this.players = players;
    this.notify = notify;
    this.words = opts.source.words;
    this.order = [...players.keys()];
    this.totalRounds = this.order.length; // everyone draws once
    this.roundNum = 0;
    this.drawerIndex = -1;
    this.used = new Set();
    this.timer = null;
    this.strokes = []; // committed strokes for the current drawing, for TV reconnect resync
    for (const p of players.values()) p.score = 0;
    this.startRound();
  }

  dispose() { clearTimeout(this.timer); }
  onPlayerRemoved() {} // rotation just skips whoever is disconnected

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

  connectedCount() {
    return [...this.players.values()].filter(p => p.connected).length;
  }

  startRound() {
    clearTimeout(this.timer);
    this.strokes = [];
    this.correctIds = new Set();
    this.guesses = [];
    this.word = null;
    this.roundNum += 1;

    let next = null;
    for (let i = 0; i < this.order.length; i++) {
      const idx = (this.drawerIndex + 1 + i) % this.order.length;
      const id = this.order[idx];
      const p = this.players.get(id);
      if (p && p.connected) { next = id; this.drawerIndex = idx; break; }
    }
    if (!next) { this.phase = 'end'; this.endsAt = null; return; }
    this.drawerId = next;
    this.phase = 'choosing';
    const pool = this.words.filter(w => !this.used.has(w));
    const source = pool.length >= WORD_CHOICES ? pool : this.words;
    this.choices = sampleFill(source, WORD_CHOICES);
    this.setTimer(CHOOSE_MS);
    const round = this.roundNum;
    this.later(CHOOSE_MS, () => { if (this.phase === 'choosing' && this.roundNum === round) this.chooseWord(this.choices[0]); });
  }

  chooseWord(word) {
    this.word = this.choices.includes(word) ? word : this.choices[0];
    this.used.add(this.word);
    this.phase = 'drawing';
    this.roundSeq = (this.roundSeq || 0) + 1;
    this.setTimer(ROUND_MS);
    this.later(ROUND_MS, () => this.endRound());
  }

  handle(actor, type, p) {
    p = p || {};
    const host = actor.role === 'console' || !!actor.isHost;
    const pid = actor.playerId;
    switch (type) {
      case 'chooseWord':
        if (this.phase !== 'choosing' || pid !== this.drawerId) return 'Not your turn';
        this.chooseWord(p.word);
        return null;
      case 'guess': {
        if (this.phase !== 'drawing' || pid === this.drawerId) return 'Not now';
        if (this.correctIds.has(pid)) return 'Already guessed';
        const text = String(p.text || '').slice(0, 60);
        if (!text.trim()) return 'Empty guess';
        const player = this.players.get(pid);
        const result = judge(text, [this.word]);
        if (result.index === 0) {
          this.guesses.unshift({ name: player ? player.name : 'Someone', text, correct: true });
          this.markCorrect(pid);
        } else {
          const entry = { name: player ? player.name : 'Someone', text, correct: false };
          this.guesses.unshift(entry);
          this.aiCheck(pid, entry);
        }
        this.guesses = this.guesses.slice(0, 30);
        return null;
      }
      case 'skip':
        if (!host) return 'Host only';
        if (this.phase === 'choosing') { this.chooseWord(this.choices[0]); return null; }
        if (this.phase === 'drawing') { this.endRound(); return null; }
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

  markCorrect(pid) {
    const player = this.players.get(pid);
    this.correctIds.add(pid);
    const order = this.correctIds.size;
    const pts = Math.max(50, 150 - (order - 1) * 30);
    if (player) player.score += pts;
    const drawer = this.players.get(this.drawerId);
    if (drawer) drawer.score += 25;
    const guessers = [...this.players.values()].filter(x => x.connected && x.id !== this.drawerId).length;
    if (guessers > 0 && this.correctIds.size >= guessers) this.endRound();
  }

  // A wrong-looking guess gets a quick second look from Claude ("sofa" for "couch") while
  // the round keeps going. A few at a time, so a flurry of guesses doesn't pile up.
  aiCheck(pid, entry) {
    if (!ai.enabled() || entry.text.trim().length < 3 || (this.aiPending || 0) >= 4) return;
    this.aiPending = (this.aiPending || 0) + 1;
    entry.checking = true;
    const seq = this.roundSeq;
    ai.ask(entry.text, [this.word], { mode: 'word', context: 'Pictionary: what is being drawn?', wait: 5000 }).then(idx => {
      this.aiPending -= 1;
      entry.checking = false;
      if (idx === 0 && this.phase === 'drawing' && this.roundSeq === seq && !this.correctIds.has(pid)) {
        entry.correct = true;
        this.markCorrect(pid);
      }
      this.notify();
    });
  }

  // ---- drawing relay hooks: called directly by server.js's 'stroke' socket
  // handler, bypassing the normal action/broadcast round trip so individual
  // points relay with minimal latency. ----
  canDraw(playerId) { return this.phase === 'drawing' && playerId === this.drawerId; }
  recordStroke(kind, point, color) {
    if (kind === 'start') this.strokes.push({ c: color || '#141414', s: [point] });
    else if (kind === 'point') { const s = this.strokes[this.strokes.length - 1]; if (s) s.s.push(point); }
    else if (kind === 'clear') { this.strokes = []; this.strokeRev = (this.strokeRev || 0) + 1; }
    else if (kind === 'undo') { this.strokes.pop(); this.strokeRev = (this.strokeRev || 0) + 1; }
  }

  endRound() {
    if (this.phase !== 'drawing') return;
    clearTimeout(this.timer);
    this.phase = 'reveal';
    this.setTimer(REVEAL_MS);
    this.later(REVEAL_MS, () => this.afterReveal());
  }

  afterReveal() {
    if (this.phase !== 'reveal') return;
    clearTimeout(this.timer);
    this.timer = null;
    if (this.roundNum >= this.totalRounds) { this.phase = 'end'; this.endsAt = null; }
    else this.startRound();
  }

  view(role, pid) {
    const priv = role === 'console';
    const isDrawer = pid === this.drawerId;
    const wordKnown = priv || isDrawer || this.phase === 'reveal' || this.phase === 'end';
    return {
      game: 'pictionary',
      title: 'Pictionary',
      phase: this.phase,
      roundNum: this.roundNum,
      totalRounds: this.totalRounds,
      drawerId: this.drawerId,
      drawerName: this.name(this.drawerId),
      roundSeq: this.roundSeq || 0,
      strokeRev: this.strokeRev || 0,
      choices: (isDrawer || priv) && this.phase === 'choosing' ? this.choices : null,
      wordLength: this.word ? this.word.replace(/[^a-zA-Z]/g, '').length : 0,
      wordShape: this.word ? this.word.replace(/[A-Za-z]/g, '_') : '',
      word: wordKnown ? this.word : null,
      strokes: role === 'display' || priv ? this.strokes : undefined,
      guesses: this.guesses.slice(0, 12),
      correctCount: this.correctIds ? this.correctIds.size : 0,
      iGotIt: !!(pid && this.correctIds && this.correctIds.has(pid) && this.phase === 'drawing'),
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected,
      })),
      endsAt: this.endsAt || null,
      windowMs: this.total || 0,
    };
  }
}

module.exports = { Pictionary };
