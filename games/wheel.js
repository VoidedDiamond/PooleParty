'use strict';
const crypto = require('crypto');
const { judge } = require('./match');
const { sampleFill } = require('./content');

const WEDGES = [
  { label: '$500', value: 500 }, { label: '$600', value: 600 }, { label: 'BANKRUPT', kind: 'bankrupt' },
  { label: '$700', value: 700 }, { label: '$900', value: 900 }, { label: 'LOSE A TURN', kind: 'lose' },
  { label: '$550', value: 550 }, { label: '$650', value: 650 }, { label: '$800', value: 800 },
  { label: 'BANKRUPT', kind: 'bankrupt' }, { label: '$2500', value: 2500 }, { label: '$600', value: 600 },
  { label: '$700', value: 700 }, { label: '$900', value: 900 }, { label: '$500', value: 500 },
  { label: '$1000', value: 1000 },
];
const VOWEL_COST = 250;
const MIN_WIN = 1000;
const SPIN_MS = 4200;
const TURN_MS = 45000;
const ROUND_END_MS = 8000;
const VOWELS = 'AEIOU';
const SOLVE_THRESHOLD = 0.9;
const BONUS_PICK_MS = 45000;
const BONUS_SOLVE_MS = 25000;
const BONUS_END_MS = 10000;
const BONUS_FREE = 'RSTLNE';
const BONUS_PRIZES = [25000, 35000, 50000, 100000];
const BONUS_FREE_MAX_RATIO = 0.4;

// The bonus round gives RSTLNE for free, so a puzzle leaning too hard on those
// letters solves itself. Keep those out of the bonus-round pool.
function tooEasyForBonus(text) {
  const letters = String(text).toUpperCase().replace(/[^A-Z]/g, '');
  if (!letters.length) return false;
  const free = letters.split('').filter(ch => BONUS_FREE.includes(ch)).length;
  return free / letters.length > BONUS_FREE_MAX_RATIO;
}

class Wheel {
  // opts: { source, rounds }
  constructor(players, notify, opts) {
    this.players = players;
    this.notify = notify;
    this.rounds = opts.rounds || 3;
    const pool = opts.source.data.puzzles;
    this.puzzles = sampleFill(pool, this.rounds); // the bonus puzzle is appended below
    const bonusPool = pool.filter(p => !tooEasyForBonus(p.text));
    this.puzzles.push(sampleFill(bonusPool.length ? bonusPool : pool, 1)[0]); // index `rounds` is the bonus puzzle
    this.bonus = null;
    this.round = -1;
    this.timer = null;
    this.spinCount = 0;
    for (const p of players.values()) p.score = 0;
    this.startRound();
  }

  dispose() { clearTimeout(this.timer); }

  later(ms, fn) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      try { fn(); } catch (e) { console.error(e); }
      this.notify();
    }, ms);
  }

  setTimer(ms) { this.endsAt = Date.now() + ms; this.total = ms; }

  // ---- turn order --------------------------------------------------------
  order() {
    const all = [...this.players.values()];
    const live = all.filter(p => p.connected);
    return (live.length ? live : all).map(p => p.id);
  }

  onPlayerRemoved() {
    if (this.phase.startsWith('bonus')) {
      if (!this.players.has(this.bonus.pid) && this.phase !== 'bonus_end') { this.phase = 'bonus_solve'; this.bonusFinish(false); }
      return;
    }
    if (!this.players.has(this.turnPid) && this.phase !== 'end' && this.phase !== 'roundEnd') {
      this.turnPid = this.order()[0] || null;
      this.beginTurn();
    }
  }

  advanceTurn() {
    const list = this.order();
    if (!list.length) { this.turnPid = null; return; }
    const i = list.indexOf(this.turnPid);
    this.turnPid = list[(i + 1) % list.length];
  }

  beginTurn() {
    this.phase = 'turn';
    this.wedge = null;
    this.setTimer(TURN_MS);
    const pid = this.turnPid;
    this.later(TURN_MS, () => { if (this.turnPid === pid && this.phase !== 'roundEnd') this.pass('ran out of time'); });
  }

  pass(reason) {
    const name = this.name(this.turnPid);
    this.msg = `${name} ${reason}`;
    this.advanceTurn();
    this.beginTurn();
  }

  name(id) { const p = this.players.get(id); return p ? p.name : 'Someone'; }

  // ---- rounds ------------------------------------------------------------
  startRound() {
    this.round += 1;
    this.puzzle = this.puzzles[this.round];
    this.text = this.puzzle.text.toUpperCase();
    this.called = new Set();
    this.bank = new Map();
    this.msg = '';
    this.roundWinner = null;
    const list = this.order();
    this.turnPid = list.length ? list[this.round % list.length] : null;
    this.beginTurn();
  }

  bankOf(pid) { return this.bank.get(pid) || 0; }

  puzzleLetters() { return new Set(this.text.split('').filter(ch => /[A-Z]/.test(ch))); }

  solvedByLetters() {
    for (const ch of this.puzzleLetters()) if (!this.called.has(ch)) return false;
    return true;
  }

  winRound(pid, how) {
    const p = this.players.get(pid);
    const won = Math.max(this.bankOf(pid), MIN_WIN);
    if (p) p.score += won;
    this.roundWinner = pid;
    this.msg = `${this.name(pid)} ${how} and wins $${won.toLocaleString()}`;
    this.phase = 'roundEnd';
    this.wedge = null;
    this.setTimer(ROUND_END_MS);
    this.later(ROUND_END_MS, () => this.nextRound());
  }

  nextRound() {
    if (this.phase !== 'roundEnd') return;
    if (this.round + 1 >= this.rounds) this.startBonus();
    else this.startRound();
  }

  // ---- bonus round -------------------------------------------------------
  // The leader picks 3 more consonants and a vowel (R S T L N E are free), then solves.
  startBonus() {
    const ranked = [...this.players.values()].sort((a, b) => b.score - a.score);
    const top = ranked[0];
    if (!top) { this.phase = 'end'; return; }
    this.puzzle = this.puzzles[this.rounds];
    this.text = this.puzzle.text.toUpperCase();
    this.called = new Set(BONUS_FREE.split(''));
    this.bonus = { pid: top.id, prize: BONUS_PRIZES[crypto.randomInt(BONUS_PRIZES.length)], won: null };
    this.turnPid = top.id;
    this.roundWinner = null;
    this.wedge = null;
    this.phase = 'bonus_pick';
    this.msg = `Bonus round for ${top.name}`;
    this.setTimer(BONUS_PICK_MS);
    this.later(BONUS_PICK_MS, () => this.bonusSolvePhase());
  }

  bonusPick(letters, vowel) {
    if (this.phase !== 'bonus_pick') return 'Not now';
    const cons = [...new Set(String(letters || '').toUpperCase().split('').filter(c => /[A-Z]/.test(c)))];
    const v = String(vowel || '').toUpperCase();
    if (cons.length !== 3) return 'Pick exactly 3 consonants';
    if (cons.some(c => VOWELS.includes(c) || BONUS_FREE.includes(c))) return 'Those consonants are already given. Pick others';
    if (!/^[AIOU]$/.test(v)) return 'Pick one vowel (A, I, O or U)';
    for (const c of [...cons, v]) this.called.add(c);
    if (this.solvedByLetters()) { this.phase = 'bonus_solve'; this.bonusFinish(true); return null; }
    this.bonusSolvePhase();
    return null;
  }

  bonusSolvePhase() {
    if (this.phase !== 'bonus_pick') return;
    this.phase = 'bonus_solve';
    this.msg = `${this.name(this.bonus.pid)} has ${BONUS_SOLVE_MS / 1000} seconds to solve it`;
    this.setTimer(BONUS_SOLVE_MS);
    this.later(BONUS_SOLVE_MS, () => this.bonusFinish(false));
  }

  bonusSolve(text) {
    if (this.phase !== 'bonus_solve') return 'Not now';
    const guess = String(text || '').trim().slice(0, 80);
    if (!guess) return 'Type your solution first';
    this.bonusFinish(judge(guess, [this.text], { threshold: SOLVE_THRESHOLD }).index === 0);
    return null;
  }

  bonusFinish(won) {
    if (this.phase !== 'bonus_solve') return;
    const p = this.players.get(this.bonus.pid);
    this.bonus.won = won;
    if (won && p) p.score += this.bonus.prize;
    for (const ch of this.puzzleLetters()) this.called.add(ch);
    this.msg = won ? `${this.name(this.bonus.pid)} solved it and wins $${this.bonus.prize.toLocaleString()}` : 'Not solved. Better luck next time';
    this.phase = 'bonus_end';
    this.setTimer(BONUS_END_MS);
    this.later(BONUS_END_MS, () => { this.phase = 'end'; this.endsAt = null; });
  }

  // ---- actions -----------------------------------------------------------
  handle(actor, type, p) {
    p = p || {};
    const host = actor.role === 'console' || !!actor.isHost;
    const pid = actor.playerId;
    const mine = () => (pid && pid === this.turnPid ? null : 'It is not your turn');
    switch (type) {
      case 'spin': return mine() || this.spin();
      case 'letter': return mine() || this.letter(String(p.letter || '').toUpperCase());
      case 'buyVowel': return mine() || this.buyVowel();
      case 'solve': return mine() || this.solve(p.text);
      case 'bonusPick': return mine() || this.bonusPick(p.letters, p.vowel);
      case 'bonusSolve': return mine() || this.bonusSolve(p.text);
      case 'skip':
        if (!host) return 'Host only';
        if (this.phase === 'roundEnd') { this.nextRound(); return null; }
        if (this.phase === 'bonus_pick') { this.bonusSolvePhase(); return null; }
        if (this.phase === 'bonus_solve') { this.bonusFinish(false); return null; }
        if (this.phase === 'bonus_end') { clearTimeout(this.timer); this.phase = 'end'; return null; }
        if (['turn', 'consonant', 'vowel'].includes(this.phase)) { this.pass('was skipped'); return null; }
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

  consonantsLeft() {
    for (const ch of this.puzzleLetters()) if (!VOWELS.includes(ch) && !this.called.has(ch)) return true;
    return false;
  }

  spin() {
    if (this.phase !== 'turn') return 'You cannot spin right now';
    if (!this.consonantsLeft()) return 'No consonants left. Buy a vowel or solve';
    const index = crypto.randomInt(WEDGES.length);
    this.phase = 'spinning';
    this.msg = '';
    this.spin_ = { id: ++this.spinCount, index };
    this.setTimer(SPIN_MS);
    this.later(SPIN_MS, () => this.landed(index));
    return null;
  }

  landed(index) {
    const w = WEDGES[index];
    if (w.kind === 'bankrupt') {
      this.bank.set(this.turnPid, 0);
      this.pass('went BANKRUPT');
    } else if (w.kind === 'lose') {
      this.pass('lost a turn');
    } else {
      this.wedge = w;
      this.phase = 'consonant';
      this.msg = `${w.label}. Call a consonant.`;
      this.setTimer(TURN_MS);
      const pid = this.turnPid;
      this.later(TURN_MS, () => { if (this.turnPid === pid && this.phase === 'consonant') this.pass('ran out of time'); });
    }
  }

  buyVowel() {
    if (this.phase !== 'turn') return 'You can only buy a vowel at the start of your turn';
    if (this.bankOf(this.turnPid) < VOWEL_COST) return `A vowel costs $${VOWEL_COST}`;
    if ([...VOWELS].every(v => this.called.has(v))) return 'All vowels are gone';
    this.bank.set(this.turnPid, this.bankOf(this.turnPid) - VOWEL_COST);
    this.phase = 'vowel';
    this.msg = 'Call a vowel.';
    this.setTimer(TURN_MS);
    const pid = this.turnPid;
    this.later(TURN_MS, () => { if (this.turnPid === pid && this.phase === 'vowel') this.pass('ran out of time'); });
    return null;
  }

  letter(ch) {
    if (this.phase !== 'consonant' && this.phase !== 'vowel') return 'Spin first, or buy a vowel';
    if (!/^[A-Z]$/.test(ch)) return 'Pick a letter';
    const isVowel = VOWELS.includes(ch);
    if (this.phase === 'consonant' && isVowel) return 'Pick a consonant';
    if (this.phase === 'vowel' && !isVowel) return 'Pick a vowel';
    if (this.called.has(ch)) return `${ch} was already called`;
    this.called.add(ch);
    const count = this.text.split('').filter(c => c === ch).length;
    const pid = this.turnPid;
    if (!count) {
      this.pass(`called ${ch}. There is no ${ch}`);
      return null;
    }
    let gain = 0;
    if (this.phase === 'consonant') {
      gain = count * this.wedge.value;
      this.bank.set(pid, this.bankOf(pid) + gain);
    }
    this.msg = `${this.name(pid)} found ${count} ${ch}${count > 1 ? "'s" : ''}${gain ? ` for $${gain.toLocaleString()}` : ''}`;
    if (this.solvedByLetters()) { this.winRound(pid, 'revealed the last letter'); return null; }
    this.beginTurn();
    return null;
  }

  solve(text) {
    if (this.phase !== 'turn') return 'You can only solve at the start of your turn';
    const guess = String(text || '').trim().slice(0, 80);
    if (!guess) return 'Type your solution first';
    const ok = judge(guess, [this.text], { threshold: SOLVE_THRESHOLD }).index === 0;
    if (!ok) { this.pass(`guessed "${guess}". Not it`); return null; }
    for (const ch of this.puzzleLetters()) this.called.add(ch);
    this.winRound(this.turnPid, 'solved it');
    return null;
  }

  // ---- views -------------------------------------------------------------
  view(role) {
    const priv = role === 'console';
    const done = ['roundEnd', 'end', 'bonus_end'].includes(this.phase);
    const words = this.text.split(' ').map(w => w.split('').map(ch => {
      const letter = /[A-Z]/.test(ch);
      const shown = !letter || this.called.has(ch);
      return { ch: shown ? ch : '', letter, shown };
    }));
    return {
      game: 'wheel',
      title: 'Wheel of Fortune',
      phase: this.phase,
      round: this.round + 1,
      rounds: this.rounds,
      isBonus: this.phase.startsWith('bonus'),
      category: this.puzzle.cat,
      words,
      solution: priv || done ? this.text : null,
      called: [...this.called].sort(),
      vowelCost: VOWEL_COST,
      wedges: WEDGES,
      spin: this.phase === 'spinning' || this.spin_ ? this.spin_ || null : null,
      consonantsLeft: this.consonantsLeft(),
      wedge: this.wedge || null,
      turnPid: ['roundEnd', 'end', 'bonus_end'].includes(this.phase) ? null : this.turnPid,
      bonus: this.bonus && { pid: this.bonus.pid, prize: this.bonus.prize, won: this.bonus.won },
      roundWinner: this.roundWinner,
      msg: this.msg,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected, bank: this.bankOf(p.id),
      })),
      endsAt: this.endsAt || null,
      windowMs: this.total || 0,
    };
  }
}

module.exports = { Wheel, WEDGES };
