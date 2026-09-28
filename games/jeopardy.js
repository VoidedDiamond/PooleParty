'use strict';
const { judge } = require('./match');
const { buildBoard, makeChoices } = require('./content');

const READ_BASE_MS = 1500;
const READ_PER_WORD_MS = 280;
const READ_MAX_MS = 9000;
const BUZZ_WINDOW_MS = 8000;
const EARLY_LOCK_MS = 400;
const REVEAL_MS = 6000;
const REVEAL_CHALLENGE_MS = 10000;
const CHALLENGE_MS = 10000;
const CHALLENGE_DONE_MS = 4500;
const FINAL_ANSWER_MS = 40000;
const BOARD_MS = 40000; // if the picker's phone dies or they wander off, a random clue gets picked for them
const DD_WAGER_MS = 30000;
const FINAL_WAGER_MS = 45000;
const ANSWER_MS = { typed: 20000, choice: 12000 };

const readTime = text => Math.min(READ_MAX_MS, READ_BASE_MS + text.split(/\s+/).length * READ_PER_WORD_MS);

class Jeopardy {
  // opts: { source, mode: 'typed' | 'choice' }
  constructor(players, notify, opts) {
    this.players = players;
    this.notify = notify;
    this.source = opts.source;
    this.mode = opts.mode === 'choice' ? 'choice' : 'typed';
    this.timer = null;
    for (const p of players.values()) p.score = 0;

    const b = buildBoard(this.source);
    this.board = b.categories.map(cat => ({
      name: cat.name,
      clues: cat.clues.map(cl => ({ ...cl, used: false })),
    }));
    this.finalClue = b.final;
    this.boardMax = Math.max(...this.board.flatMap(c => c.clues.map(cl => cl.value)));
    this.ensureDailyDouble();

    this.controllerId = null;
    this.current = null;
    this.final = null;
    this.ensureController();
    this.enterBoard(); // phases: board | clue | final_wager | final_answer | final_judge | end
  }

  enterBoard() {
    this.phase = 'board';
    this.board_ = { endsAt: Date.now() + BOARD_MS, total: BOARD_MS };
    this.later(BOARD_MS, () => {
      if (this.phase !== 'board') return;
      const open = [];
      this.board.forEach((cat, ci) => cat.clues.forEach((cl, ri) => { if (!cl.used) open.push([ci, ri]); }));
      if (open.length) { const [ci, ri] = open[Math.floor(Math.random() * open.length)]; this.pick(ci, ri); }
    });
  }

  dispose() { clearTimeout(this.timer); }

  ensureDailyDouble() {
    if (this.board.some(c => c.clues.some(cl => cl.dd))) return;
    const cat = this.board[Math.floor(Math.random() * this.board.length)];
    const rows = cat.clues.length;
    cat.clues[rows > 1 ? 1 + Math.floor(Math.random() * (rows - 1)) : 0].dd = true;
  }

  ensureController() {
    if (this.players.has(this.controllerId)) return;
    const list = [...this.players.values()];
    this.controllerId = list.length ? list[Math.floor(Math.random() * list.length)].id : null;
  }

  onPlayerRemoved() { this.ensureController(); }

  later(ms, fn) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      try { fn(); } catch (e) { console.error(e); }
      this.notify();
    }, ms);
  }

  setTimer(c, ms) { c.endsAt = Date.now() + ms; c.total = ms; }

  // ---- actions -----------------------------------------------------------
  // Returns null on success or a short message shown to the person who acted.
  handle(actor, type, p) {
    p = p || {};
    const host = actor.role === 'console' || !!actor.isHost;
    const pid = actor.playerId;
    const hostOnly = fn => (host ? fn() : 'Host only');
    const playerOnly = fn => (pid ? fn() : 'Players only');

    switch (type) {
      case 'pick':
        if (!host && pid !== this.controllerId) return 'It is not your pick';
        return this.pick(Number(p.ci), Number(p.ri));
      case 'buzz': return playerOnly(() => this.buzz(pid));
      case 'wager': return this.wager(host ? this.controllerId : pid, p.amount);
      case 'answer': return playerOnly(() => this.answer(pid, p));
      case 'challenge': return playerOnly(() => this.challenge(pid));
      case 'challengeVote': return playerOnly(() => this.challengeVote(pid, !!p.yes));
      case 'openNow': return hostOnly(() => this.openBuzzers());
      case 'judge': return hostOnly(() => this.hostJudge(!!p.correct));
      case 'skip': return hostOnly(() => this.skip());
      case 'next': return hostOnly(() => this.afterReveal());
      case 'startFinal':
        if (!host) return 'Host only';
        if (this.phase !== 'board') return 'Finish the current clue first';
        return this.startFinal();
      case 'finalWager': return playerOnly(() => this.finalWager(pid, p.amount));
      case 'finalAnswer': return playerOnly(() => this.finalAnswer(pid, p));
      case 'forceFinalNext': return hostOnly(() => this.forceFinalNext());
      case 'adjust': return hostOnly(() => this.adjust(p.playerId, Number(p.delta)));
      default: return 'Unknown action';
    }
  }

  pick(ci, ri) {
    if (this.phase !== 'board') return 'Not on the board';
    const cat = this.board[ci];
    const cl = cat && cat.clues[ri];
    if (!cl || cl.used) return 'That clue is gone';
    this.ensureController();
    const ch = this.mode === 'choice' ? makeChoices(this.source.pool, cl.answer, cat.name) : null;
    const c = {
      ci, ri, clue: cl, value: cl.value, dd: cl.dd, stage: null,
      answerMode: ch ? 'choice' : 'typed', choices: ch && ch.choices, correctIdx: ch ? ch.correctIdx : -1,
      lockedOut: new Set(), early: new Set(), lockUntil: {}, rulings: [], challenge: null,
      buzzedId: null, endsAt: null, total: 0,
    };
    this.current = c;
    this.phase = 'clue';
    if (cl.dd) {
      c.stage = 'wager';
      this.setTimer(c, DD_WAGER_MS);
      // No wager in time: play it for the clue's face value (capped at what they're allowed to bet).
      this.later(DD_WAGER_MS, () => {
        if (this.current === c && c.stage === 'wager') { c.value = Math.min(cl.value, this.wagerMax(this.controllerId)); this.startAnswering(c, this.controllerId); }
      });
    } else {
      c.stage = 'reading';
      const ms = readTime(cl.clue);
      this.setTimer(c, ms);
      this.later(ms, () => this.openBuzzers());
    }
    return null;
  }

  wagerMax(pid) {
    const p = this.players.get(pid);
    return Math.max(p ? p.score : 0, this.boardMax);
  }

  wager(pid, amount) {
    const c = this.current;
    if (this.phase !== 'clue' || !c || !c.dd || c.stage !== 'wager') return 'No wager needed right now';
    if (pid !== this.controllerId) return 'Only the player who found the Daily Double can wager';
    const a = Math.floor(Number(amount));
    const max = this.wagerMax(pid);
    if (!Number.isFinite(a) || a < 5 || a > max) return `Wager must be between $5 and $${max}`;
    c.value = a;
    this.startAnswering(c, pid);
    return null;
  }

  openBuzzers() {
    const c = this.current;
    if (this.phase !== 'clue' || !c || c.stage !== 'reading') return 'Buzzers are not waiting to open';
    this.openRound(c);
    for (const id of c.early) c.lockUntil[id] = c.openedAt + EARLY_LOCK_MS;
    return null;
  }

  openRound(c) {
    c.stage = 'open';
    c.openedAt = Date.now();
    c.buzzedId = null;
    this.setTimer(c, BUZZ_WINDOW_MS);
    this.later(BUZZ_WINDOW_MS, () => { if (this.current === c && c.stage === 'open') this.reveal(); });
  }

  buzz(pid) {
    const c = this.current;
    if (this.phase !== 'clue' || !c || c.dd) return 'Not now';
    if (c.lockedOut.has(pid)) return 'You already answered this one';
    if (c.stage === 'reading') { c.early.add(pid); return 'Too early. Wait for the buzzer.'; }
    if (c.stage !== 'open') return 'Not now';
    if (Date.now() < (c.lockUntil[pid] || 0)) return 'Locked out for a moment';
    this.startAnswering(c, pid);
    return null;
  }

  startAnswering(c, pid) {
    c.stage = 'answering';
    c.buzzedId = pid;
    const ms = ANSWER_MS[c.answerMode];
    this.setTimer(c, ms);
    this.later(ms, () => {
      if (this.current === c && c.stage === 'answering' && c.buzzedId === pid) this.rule(pid, '', false);
    });
  }

  // Auto-judging. Typed answers go through the fuzzy matcher, multiple choice is exact.
  answer(pid, p) {
    const c = this.current;
    if (this.phase !== 'clue' || !c || c.stage !== 'answering' || c.buzzedId !== pid) return 'It is not your turn to answer';
    let guess;
    let correct;
    if (c.answerMode === 'choice') {
      const i = Number(p.choice);
      if (!Number.isInteger(i) || i < 0 || i >= c.choices.length) return 'Pick one of the options';
      guess = c.choices[i];
      correct = i === c.correctIdx;
    } else {
      guess = String(p.text || '').trim().slice(0, 80);
      if (!guess) return 'Type an answer first';
      correct = judge(guess, [c.clue.answer]).index === 0;
    }
    return this.rule(pid, guess, correct);
  }

  hostJudge(correct) {
    const c = this.current;
    if (this.phase !== 'clue' || !c || c.stage !== 'answering') return 'Nothing to judge';
    return this.rule(c.buzzedId, '(host ruling)', correct);
  }

  rule(pid, guess, correct) {
    const c = this.current;
    const p = this.players.get(pid);
    if (p) p.score += correct ? c.value : -c.value;
    c.rulings.push({ pid, guess, correct });
    if (correct) {
      if (p) this.controllerId = pid;
      this.reveal();
      return null;
    }
    if (c.dd) { this.reveal(); return null; }
    c.lockedOut.add(pid);
    const remaining = [...this.players.values()].filter(x => x.connected && !c.lockedOut.has(x.id));
    if (remaining.length) this.openRound(c);
    else this.reveal();
    return null;
  }

  skip() {
    const c = this.current;
    if (this.phase !== 'clue' || !c || c.stage === 'revealed' || c.stage === 'wager') return 'Nothing to skip';
    this.reveal();
    return null;
  }

  challengeable(c) {
    return c.stage === 'revealed' && !c.challenge && c.rulings.length > 0 && !c.rulings.some(r => r.correct);
  }

  reveal() {
    const c = this.current;
    if (!c) return;
    c.stage = 'revealed';
    c.clue.used = true;
    const ms = this.challengeable(c) ? REVEAL_CHALLENGE_MS : REVEAL_MS;
    this.setTimer(c, ms);
    this.later(ms, () => this.afterReveal());
  }

  // A player who was ruled wrong can ask the others to overrule the computer.
  challenge(pid) {
    const c = this.current;
    if (this.phase !== 'clue' || !c || !this.challengeable(c)) return 'No ruling to challenge';
    const mine = [...c.rulings].reverse().find(r => r.pid === pid);
    if (!mine) return 'You did not answer this clue';
    const voters = [...this.players.values()].filter(x => x.id !== pid && x.connected).map(x => x.id);
    c.challenge = { pid, voters, votes: {}, result: null };
    if (!voters.length) { this.resolveChallenge(); return null; }
    this.setTimer(c, CHALLENGE_MS);
    this.later(CHALLENGE_MS, () => this.resolveChallenge());
    return null;
  }

  challengeVote(pid, yes) {
    const c = this.current;
    const ch = c && c.challenge;
    if (!ch || ch.result || !ch.voters.includes(pid)) return 'Nothing to vote on';
    if (ch.votes[pid] !== undefined) return 'Vote already counted';
    ch.votes[pid] = yes;
    if (ch.voters.every(id => ch.votes[id] !== undefined)) this.resolveChallenge();
    return null;
  }

  resolveChallenge() {
    const c = this.current;
    const ch = c && c.challenge;
    if (!ch || ch.result) return;
    const yes = Object.values(ch.votes).filter(Boolean).length;
    const accepted = ch.voters.length === 0 || yes * 2 > ch.voters.length;
    ch.result = accepted ? 'accepted' : 'rejected';
    if (accepted) {
      const r = [...c.rulings].reverse().find(x => x.pid === ch.pid);
      const p = this.players.get(ch.pid);
      if (r && !r.correct) {
        r.correct = true;
        r.overruled = true;
        if (p) { p.score += 2 * c.value; this.controllerId = p.id; }
      }
    }
    this.setTimer(c, CHALLENGE_DONE_MS);
    this.later(CHALLENGE_DONE_MS, () => this.afterReveal());
  }

  afterReveal() {
    const c = this.current;
    if (this.phase !== 'clue' || !c || c.stage !== 'revealed') return 'Nothing to advance';
    if (c.challenge && !c.challenge.result) return 'A challenge is in progress';
    clearTimeout(this.timer);
    this.timer = null;
    this.current = null;
    this.ensureController();
    if (this.board.every(cat => cat.clues.every(cl => cl.used))) this.startFinal();
    else this.enterBoard();
    return null;
  }

  adjust(playerId, delta) {
    const p = this.players.get(playerId);
    if (!p || !Number.isFinite(delta)) return 'Bad adjustment';
    p.score += delta;
    return null;
  }

  // ---- Final Jeopardy ----------------------------------------------------
  startFinal() {
    const f = this.finalClue;
    const eligible = [...this.players.values()].filter(p => p.score > 0).map(p => p.id);
    if (!f || !eligible.length) { this.phase = 'end'; this.final = null; return null; }
    const ch = this.mode === 'choice' ? makeChoices(this.source.pool, f.answer, f.category) : null;
    this.final = {
      category: f.category, clue: f.clue, answer: f.answer,
      mode: ch ? 'choice' : 'typed', choices: ch && ch.choices, correctIdx: ch ? ch.correctIdx : -1,
      eligible, wagers: {}, answers: {}, verdicts: {}, results: {}, order: [], idx: 0, shown: false, endsAt: null, total: 0,
    };
    this.phase = 'final_wager';
    this.setTimer(this.final, FINAL_WAGER_MS);
    this.later(FINAL_WAGER_MS, () => { if (this.phase === 'final_wager') this.forceFinalNext(); });
    return null;
  }

  finalWager(pid, amount) {
    const f = this.final;
    if (this.phase !== 'final_wager' || !f.eligible.includes(pid)) return 'Not now';
    if (f.wagers[pid] !== undefined) return 'Wager already locked in';
    const p = this.players.get(pid);
    const a = Math.floor(Number(amount));
    if (!Number.isFinite(a) || a < 0 || a > p.score) return `Wager must be between $0 and $${p.score}`;
    f.wagers[pid] = a;
    if (f.eligible.every(id => f.wagers[id] !== undefined)) this.beginFinalAnswer();
    return null;
  }

  beginFinalAnswer() {
    const f = this.final;
    this.phase = 'final_answer';
    this.setTimer(f, FINAL_ANSWER_MS);
    this.later(FINAL_ANSWER_MS, () => this.beginFinalJudge());
  }

  finalAnswer(pid, p) {
    const f = this.final;
    if (this.phase !== 'final_answer' || !f.eligible.includes(pid)) return 'Not now';
    if (f.answers[pid] !== undefined) return 'Answer already locked in';
    if (f.mode === 'choice') {
      const i = Number(p.choice);
      if (!Number.isInteger(i) || i < 0 || i >= f.choices.length) return 'Pick one of the options';
      f.answers[pid] = f.choices[i];
      f.verdicts[pid] = i === f.correctIdx;
    } else {
      const text = String(p.text || '').trim().slice(0, 80);
      if (!text) return 'Type an answer first';
      f.answers[pid] = text;
      f.verdicts[pid] = judge(text, [f.answer]).index === 0;
    }
    if (f.eligible.every(id => f.answers[id] !== undefined)) this.beginFinalJudge();
    return null;
  }

  beginFinalJudge() {
    const f = this.final;
    if (!f || this.phase !== 'final_answer') return;
    this.phase = 'final_judge';
    f.endsAt = null;
    for (const id of f.eligible) if (f.verdicts[id] === undefined) { f.answers[id] = ''; f.verdicts[id] = false; }
    const scoreOf = id => (this.players.get(id) || { score: 0 }).score;
    f.order = [...f.eligible].sort((a, b) => scoreOf(a) - scoreOf(b));
    f.idx = 0;
    f.shown = false;
    this.later(1500, () => this.finalStep());
  }

  // Reveal each answer, then apply the ruling, lowest score first.
  finalStep() {
    const f = this.final;
    if (this.phase !== 'final_judge') return;
    if (!f.shown) { f.shown = true; this.later(3500, () => this.finalStep()); return; }
    const id = f.order[f.idx];
    const p = this.players.get(id);
    const ok = !!f.verdicts[id];
    const w = f.wagers[id] || 0;
    if (p) p.score += ok ? w : -w;
    f.results[id] = ok;
    f.idx += 1;
    f.shown = false;
    if (f.idx >= f.order.length) this.phase = 'end';
    else this.later(2000, () => this.finalStep());
  }

  forceFinalNext() {
    const f = this.final;
    if (this.phase === 'final_wager') {
      for (const id of f.eligible) if (f.wagers[id] === undefined) f.wagers[id] = 0;
      this.beginFinalAnswer();
      return null;
    }
    if (this.phase === 'final_answer') { this.beginFinalJudge(); return null; }
    return 'Nothing to advance';
  }

  // ---- views -------------------------------------------------------------
  view(role, pid) {
    const priv = role === 'console';
    const c = this.current;
    return {
      game: 'jeopardy',
      title: 'Jeopardy',
      mode: this.mode,
      phase: this.phase,
      controllerId: this.controllerId,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected,
      })),
      board: this.board.map(cat => ({
        name: cat.name,
        clues: cat.clues.map(cl => ({ value: cl.value, used: cl.used })),
      })),
      boardEndsAt: this.phase === 'board' && this.board_ ? this.board_.endsAt : null,
      boardWindowMs: this.board_ ? this.board_.total : 0,
      current: c && {
        ci: c.ci, ri: c.ri,
        category: this.board[c.ci].name,
        value: c.value,
        dd: c.dd,
        stage: c.stage,
        answerMode: c.answerMode,
        clue: c.stage === 'wager' && !priv ? null : c.clue.clue,
        answer: priv || c.stage === 'revealed' ? c.clue.answer : null,
        choices: role === 'player' && c.stage === 'answering' && c.buzzedId === pid && c.answerMode === 'choice' ? c.choices : null,
        buzzedId: c.buzzedId,
        lockedOut: [...c.lockedOut],
        rulings: c.rulings.map(r => ({ pid: r.pid, guess: r.guess, correct: r.correct, overruled: !!r.overruled })),
        challengeable: this.challengeable(c) ? [...new Set(c.rulings.map(r => r.pid))] : [],
        challenge: c.challenge && {
          pid: c.challenge.pid, voters: c.challenge.voters, result: c.challenge.result,
          votes: Object.keys(c.challenge.votes).length, youVoted: c.challenge.votes[pid] !== undefined,
        },
        endsAt: c.endsAt,
        windowMs: c.total,
        wagerMax: c.dd ? this.wagerMax(this.controllerId) : null,
      },
      final: this.finalView(role, priv),
    };
  }

  finalView(role, priv) {
    const f = this.final;
    if (!f) return null;
    const judging = this.phase === 'final_judge' || this.phase === 'end';
    return {
      category: f.category,
      mode: f.mode,
      clue: this.phase === 'final_wager' && !priv ? null : f.clue,
      answer: judging || (priv && this.phase !== 'final_wager') ? f.answer : null,
      choices: role === 'player' && this.phase === 'final_answer' ? f.choices : null,
      endsAt: f.endsAt,
      windowMs: f.total,
      currentId: this.phase === 'final_judge' && f.shown ? f.order[f.idx] : null,
      entries: f.eligible.map(id => {
        const pos = f.order.indexOf(id);
        const revealed = this.phase === 'end' || (this.phase === 'final_judge' && (pos < f.idx || (pos === f.idx && f.shown)));
        const show = revealed || priv;
        return {
          id,
          wagerLocked: f.wagers[id] !== undefined,
          answerLocked: f.answers[id] !== undefined,
          revealed,
          wager: show && f.wagers[id] !== undefined ? f.wagers[id] : null,
          answer: show && f.answers[id] !== undefined ? f.answers[id] : null,
          result: f.results[id] === undefined ? null : f.results[id],
        };
      }),
    };
  }
}

module.exports = { Jeopardy };
