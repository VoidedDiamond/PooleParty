'use strict';

const ROUND_MS = 25000; // the Trivia Night questions run long
const REVEAL_MS = 4000;
const QUESTIONS_PER_GAME = 10;

class Trivia {
  // opts: { source }  source comes from content.loadTriviaSource()
  constructor(players, notify, opts) {
    this.players = players;
    this.notify = notify;
    this.source = opts.source;
    this.maxTier = this.source.data.maxTier;
    this.title = this.source.data.title || 'Trivia';
    for (const p of players.values()) p.score = 0;
    this.used = new Set();
    this.qIndex = 0;
    this.timer = null;
    this.answers = new Map();
    this.startQuestion();
  }

  dispose() { clearTimeout(this.timer); }
  onPlayerRemoved() {} // nothing to reassign; the current question just proceeds

  later(ms, fn) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      try { fn(); } catch (e) { console.error(e); }
      this.notify();
    }, ms);
  }
  setTimer(ms) { this.endsAt = Date.now() + ms; this.total = ms; }

  connectedCount() {
    return [...this.players.values()].filter(p => p.connected).length;
  }

  pickQuestion() {
    const tier = ((this.qIndex - 1) % this.maxTier) + 1;
    const pool = (this.source.byTier.get(tier) || []).filter(q => !this.used.has(q.q));
    const list = pool.length ? pool : this.source.data.questions.filter(q => !this.used.has(q.q));
    const source = list.length ? list : this.source.data.questions;
    return source[Math.floor(Math.random() * source.length)];
  }

  startQuestion() {
    this.qIndex += 1;
    const q = this.pickQuestion();
    this.used.add(q.q);
    this.current = q;
    this.answers = new Map();
    this.phase = 'question';
    this.questionStartMs = Date.now();
    this.setTimer(ROUND_MS);
    this.later(ROUND_MS, () => this.reveal());
  }

  handle(actor, type, p) {
    p = p || {};
    const host = actor.role === 'console' || !!actor.isHost;
    const pid = actor.playerId;
    switch (type) {
      case 'answer': {
        if (this.phase !== 'question') return 'Not accepting answers';
        if (this.answers.has(pid)) return 'Already answered';
        const idx = Number(p.choice);
        if (!Number.isFinite(idx)) return 'Bad answer';
        const correct = idx === this.current.correct;
        let pts = 0;
        if (correct) {
          const elapsed = Date.now() - this.questionStartMs;
          const frac = Math.max(0, 1 - elapsed / ROUND_MS);
          pts = Math.round(100 + 100 * frac);
          const pl = this.players.get(pid);
          if (pl) pl.score += pts;
        }
        this.answers.set(pid, { idx, correct, pts });
        if (this.answers.size >= this.connectedCount()) this.reveal();
        return null;
      }
      case 'skip':
        if (!host) return 'Host only';
        if (this.phase === 'question') { this.reveal(); return null; }
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

  reveal() {
    if (this.phase !== 'question') return;
    clearTimeout(this.timer);
    this.phase = 'reveal';
    this.setTimer(REVEAL_MS);
    this.later(REVEAL_MS, () => this.afterReveal());
  }

  afterReveal() {
    if (this.phase !== 'reveal') return;
    clearTimeout(this.timer);
    this.timer = null;
    if (this.qIndex >= QUESTIONS_PER_GAME) { this.phase = 'end'; this.endsAt = null; }
    else this.startQuestion();
  }

  view(role, pid) {
    const priv = role === 'console';
    const showAnswer = priv || this.phase === 'reveal' || this.phase === 'end';
    const mine = pid ? this.answers.get(pid) : null;
    return {
      game: 'trivia',
      title: this.title,
      phase: this.phase,
      qIndex: this.qIndex,
      totalQuestions: QUESTIONS_PER_GAME,
      tier: this.current.tier,
      maxTier: this.maxTier,
      topic: this.current.topic,
      question: this.current.q,
      choices: this.current.choices,
      tierLabel: (this.source.data.tierLabels && this.source.data.tierLabels[this.current.tier - 1]) || `Tier ${this.current.tier}`,
      correct: showAnswer ? this.current.correct : null,
      answeredCount: this.answers.size,
      answeredIds: [...this.answers.keys()],
      // Your own pick is yours to see right away; whether it was right waits for the reveal.
      myAnswer: mine ? { idx: mine.idx, correct: showAnswer ? mine.correct : null, pts: showAnswer ? mine.pts : null } : null,
      results: showAnswer ? [...this.answers.entries()].map(([id, a]) => ({ id, idx: a.idx, correct: a.correct, pts: a.pts })) : null,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected,
      })),
      endsAt: this.endsAt || null,
      windowMs: this.total || 0,
    };
  }
}

module.exports = { Trivia };
