'use strict';
// Memory Flash: a grid of pictures flashes up on the TV, then the cards turn over. One question:
// either "Where was the apple?" (tap the spot on your phone's grid) or "What was here?" (the TV
// highlights a card; pick the picture from four on your phone). Right: 100, plus up to 50 for
// answering fast. Ten rounds; the grid grows and the flash gets shorter.
//
// Phases: show -> question -> reveal -> ... -> end.

const ROUNDS = 10;
const REVEAL_MS = 5000;

const ITEMS = [
  ['🍎', 'apple'], ['🍌', 'banana'], ['🍇', 'grapes'], ['🍓', 'strawberry'], ['🍕', 'pizza'], ['🍩', 'donut'],
  ['🧀', 'cheese'], ['🥕', 'carrot'], ['🌽', 'corn'], ['🍦', 'ice cream'], ['🎂', 'cake'], ['🍪', 'cookie'],
  ['🐶', 'dog'], ['🐱', 'cat'], ['🐸', 'frog'], ['🐵', 'monkey'], ['🐷', 'pig'], ['🐮', 'cow'],
  ['🦁', 'lion'], ['🐧', 'penguin'], ['🐢', 'turtle'], ['🐙', 'octopus'], ['🦋', 'butterfly'], ['🐝', 'bee'],
  ['⚽', 'soccer ball'], ['🏀', 'basketball'], ['🎈', 'balloon'], ['🎁', 'present'], ['🚗', 'car'], ['🚀', 'rocket'],
  ['✈️', 'airplane'], ['🚲', 'bike'], ['⏰', 'alarm clock'], ['🔑', 'key'], ['💡', 'light bulb'], ['📚', 'books'],
  ['🎸', 'guitar'], ['🥁', 'drum'], ['🎩', 'top hat'], ['👑', 'crown'], ['🌈', 'rainbow'], ['⭐', 'star'],
  ['🌙', 'moon'], ['☀️', 'sun'], ['🌵', 'cactus'], ['🌻', 'sunflower'], ['🍄', 'mushroom'], ['⛄', 'snowman'],
];

const rand = n => Math.floor(Math.random() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Grid size, how many cards have pictures, and how long the flash lasts, per round.
function plan(round) {
  if (round <= 3) return { cols: 3, rows: 2, filled: 6, showMs: 6000, askMs: 15000 };
  if (round <= 6) return { cols: 3, rows: 3, filled: 9, showMs: 6000, askMs: 15000 };
  if (round <= 8) return { cols: 4, rows: 3, filled: 12, showMs: 7000, askMs: 15000 };
  return { cols: 4, rows: 3, filled: 12, showMs: 5500, askMs: 13000 };
}

class Memory {
  constructor(players, notify) {
    this.players = players;
    this.notify = notify;
    for (const p of players.values()) p.score = 0;
    this.round = 0;
    this.timer = null;
    this.answers = new Map();
    this.startRound();
  }

  dispose() { clearTimeout(this.timer); }
  onPlayerRemoved() { if (this.phase === 'question' && this.allAnswered()) this.reveal(); }

  later(ms, fn) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      try { fn(); } catch (e) { console.error(e); }
      this.notify();
    }, ms);
  }
  setTimer(ms) { this.endsAt = Date.now() + ms; this.total = ms; }

  allAnswered() {
    const live = [...this.players.values()].filter(p => p.connected);
    return live.length > 0 && live.every(p => this.answers.has(p.id));
  }

  startRound() {
    this.round += 1;
    const pl = plan(this.round);
    this.plan = pl;
    const picks = shuffle(ITEMS.slice()).slice(0, pl.filled);
    this.cells = picks.map(([e, name]) => ({ e, name }));
    // Alternate the two kinds of question, starting with "where".
    this.kind = this.round % 2 === 1 ? 'where' : 'what';
    this.target = rand(this.cells.length);
    if (this.kind === 'what') {
      // Four pictures: the right one and three others from the same grid.
      const others = shuffle(this.cells.map((c, i) => i).filter(i => i !== this.target)).slice(0, 3);
      this.options = shuffle([this.target, ...others]).map(i => this.cells[i]);
    } else this.options = null;
    this.answers = new Map();
    this.phase = 'show';
    this.setTimer(pl.showMs);
    this.later(pl.showMs, () => this.ask());
  }

  ask() {
    if (this.phase !== 'show') return;
    this.phase = 'question';
    this.askedAt = Date.now();
    this.setTimer(this.plan.askMs);
    this.later(this.plan.askMs, () => this.reveal());
  }

  reveal() {
    if (this.phase !== 'question') return;
    const right = this.kind === 'where' ? this.target : this.cells[this.target].name;
    for (const [pid, a] of this.answers) {
      a.correct = a.pick === right;
      a.pts = a.correct ? 100 + Math.round(50 * Math.max(0, 1 - a.ms / this.plan.askMs)) : 0;
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
        if (this.phase !== 'question') return 'Wait for the question';
        if (!pid || !this.players.has(pid)) return 'Join the game first';
        if (this.answers.has(pid)) return 'Already answered';
        let pick;
        if (this.kind === 'where') {
          pick = Number(p.cell);
          if (!Number.isInteger(pick) || pick < 0 || pick >= this.cells.length) return 'Tap a spot';
        } else {
          pick = String(p.name || '');
          if (!this.options.some(o => o.name === pick)) return 'Pick a picture';
        }
        this.answers.set(pid, { pick, ms: Date.now() - this.askedAt });
        if (this.allAnswered()) this.reveal();
        return null;
      }
      case 'skip':
        if (!host) return 'Host only';
        if (this.phase === 'show') { this.ask(); return null; }
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
    const priv = role === 'console';
    // The pictures are only on the TV while they flash (and at the reveal); never on phones
    // before the reveal.
    const showCells = done || priv || (role === 'display' && this.phase === 'show');
    const asking = this.phase === 'question' || done;
    const t = this.cells[this.target];
    const mine = pid ? this.answers.get(pid) : null;
    return {
      game: 'memory',
      title: 'Memory Flash',
      phase: this.phase,
      round: this.round,
      rounds: ROUNDS,
      cols: this.plan.cols,
      rows: this.plan.rows,
      cells: showCells ? this.cells : null,
      kind: asking || priv ? this.kind : null,
      // where: the picture to find. what: the highlighted spot.
      ask: asking || priv ? (this.kind === 'where' ? { e: t.e, name: t.name } : { cell: this.target }) : null,
      options: asking || priv ? this.options : null,
      answer: done || priv ? (this.kind === 'where' ? { cell: this.target } : { name: t.name, e: t.e, cell: this.target }) : null,
      answeredIds: [...this.answers.keys()],
      myAnswer: mine ? { pick: mine.pick, correct: done ? mine.correct : null, pts: done ? mine.pts : null } : null,
      results: done ? [...this.answers.entries()].map(([id, a]) => ({ id, pick: a.pick, correct: a.correct, pts: a.pts })) : null,
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected })),
      endsAt: this.endsAt || null,
      windowMs: this.total || 0,
    };
  }
}

module.exports = { Memory, ITEMS };
