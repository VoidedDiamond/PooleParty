'use strict';
const { judge } = require('./match');
const ai = require('./judge');
const { pickFresh } = require('./content');

const ROUND_MS = 40000;
const REVEAL_MS = 4500;
const ROUNDS_PER_GAME = 8;
const MIN_CLUE_MS = 5000;

class MovieReveal {
  // opts: { source }  source comes from content.loadMovieSource()
  constructor(players, notify, opts) {
    this.players = players;
    this.notify = notify;
    this.source = opts.source;
    for (const p of players.values()) p.score = 0;
    this.used = new Set();
    // Bias movie order toward ones this key hasn't seen in recent sessions, so back-to-back
    // games (even across a server restart) don't keep landing on the same handful of movies.
    this.freshOrder = pickFresh('moviereveal-movies', this.source.data.movies, this.source.data.movies.length, m => m.title);
    this.roundNum = 0;
    this.timer = null;
    this.startRound();
  }

  dispose() { clearTimeout(this.timer); }
  onPlayerRemoved() {} // anyone still connected can keep guessing

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

  pickMovie() {
    const unused = this.freshOrder.filter(m => !this.used.has(m.title));
    const list = unused.length ? unused : this.source.data.movies.filter(m => !this.used.has(m.title));
    const source = list.length ? list : this.source.data.movies;
    return source[0] || source[Math.floor(Math.random() * source.length)];
  }

  startRound() {
    this.roundNum += 1;
    const m = this.pickMovie();
    this.used.add(m.title);
    if (this.batcher) this.batcher.reset();
    this.movie = m;
    this.clueIndex = 0;
    this.phase = 'clue';
    this.winnerId = null;
    this.guesses = [];
    this.clueIntervalMs = Math.max(MIN_CLUE_MS, Math.floor(ROUND_MS / m.clues.length));
    this.roundStartMs = Date.now();
    this.setTimer(ROUND_MS);
    this.later(Math.min(this.clueIntervalMs, ROUND_MS), () => this.tick());
  }

  tick() {
    if (this.phase !== 'clue') return;
    const elapsed = Date.now() - this.roundStartMs;
    const shouldBe = Math.min(this.movie.clues.length - 1, Math.floor(elapsed / this.clueIntervalMs));
    if (shouldBe > this.clueIndex) this.clueIndex = shouldBe;
    const remaining = this.endsAt - Date.now();
    if (remaining <= 0) { this.reveal(null); return; }
    if (this.clueIndex < this.movie.clues.length - 1) {
      this.later(Math.min(this.clueIntervalMs, remaining), () => this.tick());
    } else {
      this.later(remaining, () => this.reveal(null));
    }
  }

  handle(actor, type, p) {
    p = p || {};
    const host = actor.role === 'console' || !!actor.isHost;
    const pid = actor.playerId;
    switch (type) {
      case 'guess': {
        if (this.phase !== 'clue') return 'Not accepting guesses';
        const text = String(p.text || '').slice(0, 80);
        if (!text.trim()) return 'Empty guess';
        const player = this.players.get(pid);
        const result = judge(text, [this.movie.title]);
        if (result.index === 0) this.win(pid);
        else {
          const entry = { name: player ? player.name : 'Someone', text };
          this.guesses.unshift(entry);
          this.guesses = this.guesses.slice(0, 20);
          this.aiCheck(pid, entry);
        }
        return null;
      }
      case 'skip':
        if (!host) return 'Host only';
        if (this.phase === 'clue') { this.reveal(null); return null; }
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

  win(pid) {
    const player = this.players.get(pid);
    const pts = Math.max(100, 400 - this.clueIndex * 100);
    if (player) player.score += pts;
    this.reveal(pid);
  }

  // Alternate titles and nicknames ("Snow White" for "Snow White and the Seven Dwarfs") get a
  // second look from Claude while the clues keep coming, batched like Pictionary guesses.
  aiCheck(pid, entry) {
    if (entry.text.trim().length < 3) return;
    if (!this.batcher) this.batcher = new ai.GuessBatcher({ maxRequests: 5 });
    const movie = this.movie;
    const queued = this.batcher.add({
      text: entry.text, answers: [movie.title], opts: { mode: 'exact', context: 'Name that Disney movie' },
      done: idx => {
        entry.checking = false;
        if (idx === 0 && this.phase === 'clue' && this.movie === movie) this.win(pid);
        this.notify();
      },
    });
    if (queued) entry.checking = true;
  }

  reveal(winnerId) {
    if (this.phase !== 'clue') return;
    clearTimeout(this.timer);
    this.phase = 'reveal';
    this.winnerId = winnerId;
    this.setTimer(REVEAL_MS);
    this.later(REVEAL_MS, () => this.afterReveal());
  }

  afterReveal() {
    if (this.phase !== 'reveal') return;
    clearTimeout(this.timer);
    this.timer = null;
    if (this.roundNum >= ROUNDS_PER_GAME) { this.phase = 'end'; this.endsAt = null; }
    else this.startRound();
  }

  view(role) {
    const priv = role === 'console';
    const showTitle = priv || this.phase === 'reveal' || this.phase === 'end';
    return {
      game: 'moviereveal',
      title: 'Name That Disney Movie',
      phase: this.phase,
      roundNum: this.roundNum,
      totalRounds: ROUNDS_PER_GAME,
      clues: this.movie.clues.slice(0, this.clueIndex + 1),
      movie: showTitle ? this.movie.title : null,
      winnerId: this.winnerId,
      winnerName: this.winnerId ? this.name(this.winnerId) : null,
      guesses: this.guesses,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected,
      })),
      endsAt: this.endsAt || null,
      windowMs: this.total || 0,
    };
  }
}

module.exports = { MovieReveal };
