'use strict';
const { judge } = require('./match');
const { pickFeudQuestions } = require('./content');

const TEAM_COLORS = ['#ff8a3d', '#4aa8ff'];
const FACEOFF_MS = 20000;
const TURN_MS = 20000;
const STEAL_MS = 20000;
const RESOLVE_MS = 4000;
const STRIKEOUT_MS = 3000;
const REVEAL_STEP_MS = 650;
const ROUND_END_MS = 6000;
const CHOICE_MS = 12000;
const FM_INTRO_MS = 6000;
const FM_BETWEEN_MS = 5000;
const FM_REVEAL_MS = 1500;
const FM_END_MS = 12000;
const FM_TARGET = 200;
const MULTIPLIERS = [1, 1, 2, 3];

class Feud {
  // opts: { source, rounds }
  constructor(players, notify, opts) {
    this.players = players;
    this.notify = notify;
    this.rounds = opts.rounds || 4;
    this.questions = pickFeudQuestions(opts.source, this.rounds + 5);
    this.fmQuestions = this.questions.slice(this.rounds);
    this.fm = null;
    this.teamOf = new Map();
    // Separate rotation counters: face-off picks and steal picks used to share one counter per
    // team, so every steal silently ate into the next round's face-off order and teammates
    // stopped alternating cleanly on who opens the round.
    this.faceRot = [0, 0];
    this.stealRot = [0, 0];
    this.scores = [0, 0];
    this.round = -1;
    this.timer = null;
    this.cur = null;
    this.phase = 'faceoff'; // faceoff | choice | play | steal | reveal | fastmoney | end
    this.ensureTeams();
    this.startRound();
  }

  dispose() { clearTimeout(this.timer); }
  onPlayerRemoved() { this.ensureTeams(); }

  later(ms, fn) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      try { fn(); } catch (e) { console.error(e); }
      this.notify();
    }, ms);
  }

  setTimer(c, ms) { c.endsAt = Date.now() + ms; c.total = ms; }

  // ---- teams -------------------------------------------------------------
  ensureTeams() {
    for (const id of [...this.teamOf.keys()]) if (!this.players.has(id)) this.teamOf.delete(id);
    for (const p of this.players.values()) {
      if (this.teamOf.has(p.id)) continue;
      const count = [0, 0];
      for (const t of this.teamOf.values()) count[t]++;
      this.teamOf.set(p.id, count[0] <= count[1] ? 0 : 1);
    }
  }

  teamPlayers(t, includeAway = false) {
    const all = [...this.players.values()].filter(p => this.teamOf.get(p.id) === t);
    const live = all.filter(p => p.connected);
    return (includeAway || !live.length ? all : live).map(p => p.id);
  }

  teamName(t) {
    const list = this.teamPlayers(t, true).map(id => this.players.get(id).name);
    if (list.length === 1) return list[0];
    return list.length ? `${list[0]}'s team` : `Team ${t + 1}`;
  }

  nextPlayerFrom(rot, t) {
    const list = this.teamPlayers(t);
    if (!list.length) return null;
    const id = list[rot[t] % list.length];
    rot[t]++;
    return id;
  }

  // ---- rounds ------------------------------------------------------------
  startRound() {
    this.round += 1;
    const q = this.questions[this.round];
    this.cur = {
      q: q.q,
      answers: q.a.map(([text, pts]) => ({ text, pts, revealed: false, missed: false, team: null })),
      strikes: 0, bank: 0, control: null,
      mult: MULTIPLIERS[Math.min(this.round, MULTIPLIERS.length - 1)],
      face: null, turnList: [], turnIdx: 0, turnPid: null, steal: null, lastGuess: null, award: null,
      endsAt: null, total: 0,
    };
    this.startFaceoff();
  }

  startFaceoff() {
    const c = this.cur;
    const ids = [0, 1].map(t => this.nextPlayerFrom(this.faceRot, t));
    c.face = { ids, guesses: {}, order: [], results: null, winner: null, resolved: false };
    this.phase = 'faceoff';
    this.setTimer(c, FACEOFF_MS);
    this.later(FACEOFF_MS, () => this.resolveFaceoff());
    if (ids.every(id => id == null)) this.resolveFaceoff();
  }

  match(text) {
    return judge(text, this.cur.answers.map(a => a.text), { lenient: true });
  }

  revealAnswer(idx, team) {
    const a = this.cur.answers[idx];
    a.revealed = true;
    a.team = team;
    this.cur.bank += a.pts;
  }

  // ---- actions -----------------------------------------------------------
  handle(actor, type, p) {
    p = p || {};
    const host = actor.role === 'console' || !!actor.isHost;
    switch (type) {
      case 'answer':
        return actor.playerId ? this.submit(actor.playerId, p.text) : 'Players only';
      case 'choose': return actor.playerId ? this.choose(actor.playerId, !!p.play) : 'Players only';
      case 'fmPass': return actor.playerId ? this.fmPass(actor.playerId) : 'Players only';
      case 'skip': return host ? this.skip() : 'Host only';
      case 'adjust':
        if (!host) return 'Host only';
        if (![0, 1].includes(Number(p.team)) || !Number.isFinite(Number(p.delta))) return 'Bad adjustment';
        this.scores[Number(p.team)] += Number(p.delta);
        return null;
      default: return 'Unknown action';
    }
  }

  submit(pid, raw) {
    this.ensureTeams();
    const text = String(raw || '').trim().slice(0, 60);
    if (!text) return 'Type an answer first';
    const c = this.cur;
    if (this.phase === 'fastmoney') return this.fmSubmit(pid, text);
    if (this.phase === 'faceoff') {
      if (c.face.resolved || !c.face.ids.includes(pid)) return 'You are not in this face-off';
      if (c.face.guesses[pid] !== undefined) return 'Answer already locked in';
      c.face.guesses[pid] = text;
      c.face.order.push(pid);
      if (c.face.ids.every(id => id == null || c.face.guesses[id] !== undefined)) this.resolveFaceoff();
      return null;
    }
    if (this.phase === 'play') {
      if (pid !== c.turnPid) return 'It is not your turn';
      return this.playGuess(pid, text);
    }
    if (this.phase === 'steal') {
      if (pid !== c.steal.pid) return 'It is not your turn';
      return this.stealGuess(pid, text);
    }
    return 'Not now';
  }

  skip() {
    if (this.phase === 'faceoff') { this.resolveFaceoff(); return null; }
    if (this.phase === 'play') { this.strike('timeout', this.cur.turnPid); return null; }
    if (this.phase === 'strikeout') { clearTimeout(this.timer); this.startSteal(); return null; }
    if (this.phase === 'steal') { this.finishSteal(this.cur.steal.pid, '', -1); return null; }
    if (this.phase === 'reveal') { this.nextRound(); return null; }
    if (this.phase === 'choice') { this.choose(this.cur.choice.pid, true); return null; }
    if (this.phase === 'fastmoney') return this.fmSkip();
    return 'Nothing to skip';
  }

  resolveFaceoff() {
    const c = this.cur;
    if (this.phase !== 'faceoff' || c.face.resolved) return;
    c.face.resolved = true;
    clearTimeout(this.timer);
    const res = c.face.ids.map(id => {
      const g = id != null ? c.face.guesses[id] : undefined;
      return { id, guess: g || null, idx: g ? this.match(g).index : -1 };
    });
    for (const r of res) {
      if (r.idx >= 0 && !c.answers[r.idx].revealed) this.revealAnswer(r.idx, this.teamOf.get(r.id));
    }
    const rank = r => (r.idx >= 0 ? r.idx : 99);
    const when = r => { const i = c.face.order.indexOf(r.id); return i < 0 ? 99 : i; };
    const cand = res.filter(r => r.id != null);
    cand.sort((a, b) => rank(a) - rank(b) || when(a) - when(b));
    let winner = cand[0];
    if (cand.length > 1 && rank(cand[0]) === 99 && when(cand[0]) === 99 && when(cand[1]) === 99) {
      winner = cand[Math.floor(Math.random() * cand.length)];
    }
    c.face.results = res;
    c.face.winner = winner ? winner.id : null;
    c.control = winner ? this.teamOf.get(winner.id) : 0;
    this.setTimer(c, RESOLVE_MS);
    this.later(RESOLVE_MS, () => this.startChoice(c.face.winner));
  }

  startChoice(winnerId) {
    const c = this.cur;
    if (c.answers.every(a => a.revealed)) { this.endRound(c.control); return; }
    c.choice = { pid: winnerId, decision: null };
    this.phase = 'choice';
    this.setTimer(c, CHOICE_MS);
    this.later(CHOICE_MS, () => this.choose(c.choice.pid, true));
  }

  choose(pid, play) {
    const c = this.cur;
    if (this.phase !== 'choice' || pid !== c.choice.pid) return 'Nothing to decide right now';
    clearTimeout(this.timer);
    if (!play) c.control = 1 - c.control;
    c.choice.decision = play ? 'play' : 'pass';
    this.startPlay(c.face.winner);
    return null;
  }

  startPlay(winnerId) {
    const c = this.cur;
    if (c.answers.every(a => a.revealed)) { this.endRound(c.control); return; }
    c.turnList = this.teamPlayers(c.control);
    const i = c.turnList.indexOf(winnerId);
    c.turnIdx = c.turnList.length > 1 ? (i + 1) % c.turnList.length : 0;
    this.phase = 'play';
    this.beginTurn();
  }

  beginTurn() {
    const c = this.cur;
    c.turnList = this.teamPlayers(c.control);
    c.turnPid = c.turnList.length ? c.turnList[c.turnIdx % c.turnList.length] : null;
    this.setTimer(c, TURN_MS);
    const pid = c.turnPid;
    this.later(TURN_MS, () => { if (this.phase === 'play' && c.turnPid === pid) this.strike('timeout', pid); });
    if (pid == null) this.strike('timeout', null);
  }

  playGuess(pid, text) {
    const c = this.cur;
    const m = this.match(text);
    if (m.index >= 0 && c.answers[m.index].revealed) return 'That one is already on the board';
    if (m.index < 0) { this.strike('miss', pid, text); return null; }
    this.revealAnswer(m.index, c.control);
    c.lastGuess = { pid, text, kind: 'hit', idx: m.index };
    if (c.answers.every(a => a.revealed)) this.endRound(c.control);
    else { c.turnIdx += 1; this.beginTurn(); }
    return null;
  }

  strike(kind, pid, text = '') {
    const c = this.cur;
    c.strikes += 1;
    c.lastGuess = { pid, text, kind, idx: -1 };
    if (c.strikes >= 3) {
      // Pause here so everyone actually sees the 3rd strike and what was guessed,
      // instead of jumping straight to the steal with no chance to see it happen.
      clearTimeout(this.timer);
      c.turnPid = null;
      this.phase = 'strikeout';
      this.setTimer(c, STRIKEOUT_MS);
      this.later(STRIKEOUT_MS, () => this.startSteal());
    } else { c.turnIdx += 1; this.beginTurn(); }
  }

  startSteal() {
    const c = this.cur;
    if (this.phase !== 'strikeout') return;
    const other = 1 - c.control;
    const pid = this.nextPlayerFrom(this.stealRot, other);
    c.steal = { pid, team: other };
    this.phase = 'steal';
    this.setTimer(c, STEAL_MS);
    this.later(STEAL_MS, () => { if (this.phase === 'steal') this.finishSteal(pid, '', -1); });
    if (pid == null) this.finishSteal(null, '', -1);
  }

  stealGuess(pid, text) {
    const m = this.match(text);
    this.finishSteal(pid, text, m.index);
    return null;
  }

  finishSteal(pid, text, idx) {
    const c = this.cur;
    if (this.phase !== 'steal') return;
    const hit = idx >= 0 && !c.answers[idx].revealed;
    c.lastGuess = { pid, text, kind: hit ? 'hit' : 'miss', idx: hit ? idx : -1 };
    if (hit) this.revealAnswer(idx, c.steal.team);
    c.steal.result = hit ? 'stolen' : 'failed';
    this.endRound(hit ? c.steal.team : c.control);
  }

  endRound(team) {
    const c = this.cur;
    clearTimeout(this.timer);
    c.award = { team, points: c.bank * c.mult };
    this.scores[team] += c.award.points;
    this.phase = 'reveal';
    c.endsAt = null;
    const step = () => {
      const a = c.answers.find(x => !x.revealed);
      if (a) { a.revealed = true; a.missed = true; this.later(REVEAL_STEP_MS, step); return; }
      this.setTimer(c, ROUND_END_MS);
      this.later(ROUND_END_MS, () => this.nextRound());
    };
    this.later(1500, step);
  }

  nextRound() {
    if (this.phase !== 'reveal') return;
    if (this.round + 1 >= this.rounds) this.startFastMoney();
    else this.startRound();
  }

  // ---- Fast Money --------------------------------------------------------
  // The leading team plays. Each player answers 5 questions typed on their phone.
  startFastMoney() {
    const team = this.scores[1] > this.scores[0] ? 1 : 0;
    const allIds = [...this.players.values()].map(p => p.id);
    const ids = allIds.length === 2 ? allIds : this.teamPlayers(team).slice(0, 2);
    this.fm = {
      team, ids, step: 0, idx: 0, stage: 'intro', revealN: 0, total: 0, endsAt: null, tot: 0,
      qs: this.fmQuestions.map(q => ({ q: q.q, answers: q.a.map(([text, pts]) => ({ text, pts })) })),
      results: ids.map(() => Array(5).fill(null)),
    };
    this.phase = 'fastmoney';
    this.cur.endsAt = null;
    this.fmTimer(FM_INTRO_MS);
    this.later(FM_INTRO_MS, () => this.fmBegin());
  }

  fmTimer(ms) { this.fm.endsAt = Date.now() + ms; this.fm.tot = ms; }

  fmMs() { const f = this.fm; return f.ids.length === 1 || f.step === 1 ? 35000 : 30000; }

  fmBegin() {
    const f = this.fm;
    if (this.phase !== 'fastmoney' || !['intro', 'between'].includes(f.stage)) return;
    f.stage = 'play';
    f.idx = 0;
    const ms = this.fmMs();
    this.fmTimer(ms);
    const step = f.step;
    this.later(ms, () => { if (this.fm.stage === 'play' && this.fm.step === step) this.fmEndTurn(); });
    if (!f.ids.length) this.fmEndTurn();
  }

  fmSubmit(pid, text) {
    const f = this.fm;
    if (f.stage !== 'play' || pid !== f.ids[f.step]) return 'It is not your turn';
    const q = f.qs[f.idx];
    const m = judge(text, q.answers.map(a => a.text), { lenient: true });
    if (f.step === 1 && m.index >= 0) {
      const first = f.results[0][f.idx];
      if (first && first.matched === m.index) return 'Your teammate already said that. Try another answer';
    }
    f.results[f.step][f.idx] = { text, matched: m.index, pts: m.index >= 0 ? q.answers[m.index].pts : 0 };
    f.idx += 1;
    if (f.idx >= 5) this.fmEndTurn();
    return null;
  }

  fmPass(pid) {
    const f = this.fm;
    if (this.phase !== 'fastmoney' || f.stage !== 'play' || pid !== f.ids[f.step]) return 'It is not your turn';
    f.results[f.step][f.idx] = { text: '', matched: -1, pts: 0 };
    f.idx += 1;
    if (f.idx >= 5) this.fmEndTurn();
    return null;
  }

  fmEndTurn() {
    const f = this.fm;
    if (f.stage !== 'play') return;
    clearTimeout(this.timer);
    for (let i = 0; i < 5; i++) if (!f.results[f.step][i]) f.results[f.step][i] = { text: '', matched: -1, pts: 0 };
    if (f.step + 1 < f.ids.length) {
      f.step += 1;
      f.stage = 'between';
      this.fmTimer(FM_BETWEEN_MS);
      this.later(FM_BETWEEN_MS, () => this.fmBegin());
    } else {
      f.stage = 'reveal';
      f.revealN = 0;
      this.fmRevealStep(true);
    }
  }

  fmRevealStep(first) {
    const f = this.fm;
    if (f.stage !== 'reveal') return;
    const rows = f.ids.length * 5;
    if (!first) f.revealN += 1;
    if (f.revealN >= rows) {
      f.stage = 'done';
      f.total = f.results.flat().reduce((n, r) => n + (r ? r.pts : 0), 0);
      this.fmTimer(FM_END_MS);
      this.later(FM_END_MS, () => { this.phase = 'end'; });
      return;
    }
    this.later(FM_REVEAL_MS, () => this.fmRevealStep(false));
  }

  fmSkip() {
    const f = this.fm;
    if (['intro', 'between'].includes(f.stage)) { this.fmBegin(); return null; }
    if (f.stage === 'play') { this.fmEndTurn(); return null; }
    if (f.stage === 'reveal') { f.revealN = f.ids.length * 5 - 1; this.fmRevealStep(false); return null; }
    if (f.stage === 'done') { clearTimeout(this.timer); this.phase = 'end'; return null; }
    return 'Nothing to skip';
  }

  fmView() {
    const f = this.fm;
    if (!f) return null;
    const rows = [];
    f.ids.forEach((id, pi) => f.results[pi].forEach((r, qi) => rows.push({ pi, qi, r })));
    const shown = f.stage === 'reveal' ? f.revealN : f.stage === 'done' ? rows.length : 0;
    return {
      team: f.team, ids: f.ids, step: f.step, stage: f.stage, idx: f.idx, target: FM_TARGET,
      question: f.stage === 'play' ? f.qs[f.idx].q : null,
      rows: rows.map((x, i) => ({
        pi: x.pi, qi: x.qi, q: f.qs[x.qi].q, shown: i < shown,
        text: i < shown && x.r ? x.r.text : null, pts: i < shown && x.r ? x.r.pts : null,
      })),
      subtotals: f.ids.map((id, pi) => rows.slice(0, shown).filter(x => x.pi === pi).reduce((n, x) => n + ((x.r && x.r.pts) || 0), 0)),
      total: rows.slice(0, shown).reduce((n, x) => n + ((x.r && x.r.pts) || 0), 0),
      win: f.stage === 'done' ? f.total >= FM_TARGET : null,
      endsAt: f.endsAt, windowMs: f.tot,
    };
  }

  // ---- views -------------------------------------------------------------
  view(role) {
    this.ensureTeams();
    const priv = role === 'console';
    const c = this.cur;
    const f = c.face;
    return {
      game: 'feud',
      title: 'Family Feud',
      phase: this.phase,
      round: this.round + 1,
      rounds: this.rounds,
      mult: c.mult,
      question: c.q,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, color: p.color, connected: p.connected, team: this.teamOf.get(p.id),
      })),
      teams: [0, 1].map(t => ({
        id: t, name: this.teamName(t), color: TEAM_COLORS[t], score: this.scores[t], players: this.teamPlayers(t, true),
      })),
      answers: c.answers.map((a, i) => ({
        n: i + 1, revealed: a.revealed, missed: a.missed, team: a.team,
        text: a.revealed || priv ? a.text : null, pts: a.revealed ? a.pts : null,
      })),
      strikes: c.strikes,
      bank: c.bank,
      control: c.control,
      choice: this.phase === 'choice' ? { pid: c.choice.pid } : (c.choice || null),
      fm: this.fmView(),
      turnPid: this.phase === 'play' ? c.turnPid : null,
      stealPid: this.phase === 'steal' ? c.steal.pid : null,
      face: f && {
        ids: f.ids,
        submitted: Object.fromEntries(f.ids.filter(id => id != null).map(id => [id, f.guesses[id] !== undefined])),
        resolved: f.resolved,
        winner: f.winner,
        results: f.results && f.results.map(r => ({ id: r.id, guess: r.guess, idx: r.idx })),
      },
      lastGuess: c.lastGuess,
      award: c.award,
      endsAt: c.endsAt,
      windowMs: c.total,
    };
  }
}

module.exports = { Feud };
