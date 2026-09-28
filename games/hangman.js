'use strict';
const { sample } = require('./content');

const THEME_CHOICES = 3;
const CHOOSE_MS = 15000;
const GUESS_MS = 120000;
const REVEAL_MS = 6000;
const MAX_WRONG = 6; // classic six-part hangman figure: head, torso, 2 arms, 2 legs
const LETTER_PTS = 25;
const SOLVE_BONUS = 150;

class Hangman {
  // opts: { source }  source.data.categories: { [themeName]: string[] }
  constructor(players, notify, opts) {
    this.players = players;
    this.notify = notify;
    this.categories = opts.source.data.categories;
    this.categoryNames = Object.keys(this.categories);
    this.order = [...players.keys()];
    this.rounds = this.order.length;
    this.round = -1;
    this.timer = null;
    for (const p of players.values()) p.score = 0;
    this.startRound();
  }

  dispose() { clearTimeout(this.timer); }
  onPlayerRemoved() {
    if (this.phase === 'guessing' && this.allGuessersDone()) this.finishRound(false);
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
  name(id) { const p = this.players.get(id); return p ? p.name : 'Someone'; }

  connectedGuessers() { return [...this.players.values()].filter(p => p.connected && p.id !== this.giverId).map(p => p.id); }
  allGuessersDone() { return this.connectedGuessers().length === 0; } // nobody left to guess

  startRound() {
    this.round += 1;
    if (this.round >= this.rounds) { this.phase = 'end'; this.endsAt = null; return; }
    this.giverId = this.order[this.round % this.order.length];
    this.themeChoices = sample(this.categoryNames, Math.min(THEME_CHOICES, this.categoryNames.length));
    this.phase = 'choosing';
    this.setTimer(CHOOSE_MS);
    this.later(CHOOSE_MS, () => this.chooseTheme(this.giverId, this.themeChoices[0]));
  }

  chooseTheme(pid, theme) {
    if (this.phase !== 'choosing' || pid !== this.giverId) return 'Not your turn';
    const words = this.categories[this.themeChoices.includes(theme) ? theme : this.themeChoices[0]];
    this.theme = this.themeChoices.includes(theme) ? theme : this.themeChoices[0];
    this.word = sample(words, 1)[0].toUpperCase();
    this.guessed = new Set(); // correctly-guessed letters
    this.wrong = new Set(); // incorrectly-guessed letters
    this.creditFor = new Map(); // letter -> pid who first guessed it
    this.wrongCount = 0;
    this.startedAt = Date.now();
    this.phase = 'guessing';
    this.setTimer(GUESS_MS);
    const round = this.round;
    this.later(GUESS_MS, () => { if (this.phase === 'guessing' && this.round === round) this.finishRound(false); });
    return null;
  }

  wordLetters() { return new Set([...this.word].filter(c => /[A-Z]/.test(c))); }
  isSolved() { return [...this.wordLetters()].every(c => this.guessed.has(c)); }

  guessLetter(pid, letter) {
    if (this.phase !== 'guessing' || pid === this.giverId) return 'Not your turn';
    const L = String(letter || '').toUpperCase().slice(0, 1);
    if (!/[A-Z]/.test(L)) return 'Bad letter';
    if (this.guessed.has(L) || this.wrong.has(L)) return 'Already guessed';
    if (this.wordLetters().has(L)) {
      this.guessed.add(L);
      this.creditFor.set(L, pid);
      if (this.isSolved()) this.finishRound(true);
    } else {
      this.wrong.add(L);
      this.wrongCount += 1;
      if (this.wrongCount >= MAX_WRONG) this.finishRound(false);
    }
    return null;
  }

  guessWord(pid, text) {
    if (this.phase !== 'guessing' || pid === this.giverId) return 'Not your turn';
    const letters = t => String(t || '').toUpperCase().replace(/[^A-Z]/g, '');
    const guess = letters(text);
    if (!guess) return 'Type a guess first';
    if (guess === letters(this.word)) { this.finishRound(true, pid); return null; }
    this.wrongCount += 1;
    if (this.wrongCount >= MAX_WRONG) this.finishRound(false);
    return null;
  }

  // The giver is rewarded for how hard the word was to get: more wrong guesses and more time
  // elapsed both mean it took the group longer, so the longer it takes, the more they earn.
  finishRound(won, solverPid) {
    if (this.phase !== 'guessing') return;
    clearTimeout(this.timer);
    const elapsedSec = Math.min(90, (Date.now() - this.startedAt) / 1000);
    const wrongForScoring = Math.min(this.wrongCount, MAX_WRONG);
    const giverPts = Math.round(wrongForScoring * 45 + elapsedSec * 4);
    const giver = this.players.get(this.giverId);
    if (giver) giver.score += giverPts;
    const letterCredits = [];
    if (won) {
      for (const [letter, pid] of this.creditFor) {
        const p = this.players.get(pid);
        if (p) p.score += LETTER_PTS;
        letterCredits.push({ pid, letter });
      }
      if (solverPid) {
        const s = this.players.get(solverPid);
        if (s) s.score += SOLVE_BONUS;
      }
    }
    this.awarded = { won, giverPts, solverName: solverPid ? this.name(solverPid) : null, letterCredits: letterCredits.length };
    this.phase = 'reveal';
    this.setTimer(REVEAL_MS);
    this.later(REVEAL_MS, () => this.afterReveal());
  }

  afterReveal() {
    if (this.phase !== 'reveal') return;
    clearTimeout(this.timer);
    this.timer = null;
    this.startRound();
  }

  handle(actor, type, p) {
    p = p || {};
    const host = actor.role === 'console' || !!actor.isHost;
    const pid = actor.playerId;
    switch (type) {
      case 'chooseTheme': return pid ? this.chooseTheme(pid, p.theme) : 'Players only';
      case 'guessLetter': return pid ? this.guessLetter(pid, p.letter) : 'Players only';
      case 'guessWord': return pid ? this.guessWord(pid, p.text) : 'Players only';
      case 'skip':
        if (!host) return 'Host only';
        if (this.phase === 'choosing') { this.chooseTheme(this.giverId, this.themeChoices[0]); return null; }
        if (this.phase === 'guessing') { this.finishRound(false); return null; }
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

  view(role, pid) {
    const priv = role === 'console';
    const isGiver = pid === this.giverId;
    const showWord = priv || isGiver || this.phase === 'reveal' || this.phase === 'end';
    const blanks = this.phase === 'guessing' || this.phase === 'reveal' || this.phase === 'end'
      ? [...this.word].map(c => (/[A-Z]/.test(c) ? (this.guessed.has(c) || showWord ? c : '_') : c)).join('')
      : null;
    return {
      game: 'hangman', title: 'Hangman', phase: this.phase,
      round: this.round + 1, rounds: this.rounds,
      giverId: this.giverId, giverName: this.name(this.giverId),
      themeChoices: isGiver && this.phase === 'choosing' ? this.themeChoices : null,
      theme: this.phase === 'choosing' ? null : this.theme,
      word: showWord ? this.word : null,
      blanks,
      guessedLetters: this.phase === 'guessing' || this.phase === 'reveal' ? [...(this.guessed || [])] : [],
      wrongLetters: this.phase === 'guessing' || this.phase === 'reveal' ? [...(this.wrong || [])] : [],
      wrongCount: this.wrongCount || 0,
      maxWrong: MAX_WRONG,
      awarded: this.awarded || null,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected,
      })),
      endsAt: this.endsAt || null, windowMs: this.total || 0,
    };
  }
}

module.exports = { Hangman };
