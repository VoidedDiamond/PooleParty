'use strict';
const { shuffle } = require('./content');

// Poetry for Neanderthals rules (Exploding Kittens), adapted for phones:
// - On your turn you are the Poet: 90 seconds to get through as many cards as you can.
// - Every card has a 1-point word and a harder 3-point phrase. Get the word (+1), then either go for
//   the phrase (+2 more, 3 total) or move on. Going straight for the phrase also scores 3.
// - Speak only in one-syllable words. Never say a word on the card or any part of one, never rhyme,
//   gesture, spell, or use initials. This version adds a short "don't say" list on each card.
// - Skipping a card costs 1 point. Breaking a rule gets you a NO! (the other side presses it on
//   their phone, or you own up), which also costs 1 point and burns the card. Penalties only ever
//   cost the Poet's side, never the guesser.
// Two ways to play: Teams (Team Glad vs Team Mad, as in the box; needs 4+) or everyone for
// themselves, where the Poet taps whoever shouted it and both score.
const TURN_MS = 90000;
const READY_MS = 25000;
const TURN_END_MS = 8000;
const TEAM_NAMES = ['Team Glad', 'Team Mad'];
const TEAM_COLORS = ['#ffb347', '#7ccf6b'];

class Neanderthals {
  // opts: { source, mode: 'teams' | 'solo' }
  constructor(players, notify, opts) {
    this.players = players;
    this.notify = notify;
    this.cards = opts.source.cards;
    this.deck = shuffle(this.cards);
    this.deckIdx = 0;
    this.timer = null;
    this.cardSeq = 0;
    const ids = [...players.keys()];
    this.mode = opts.mode === 'teams' && ids.length >= 4 ? 'teams' : 'solo';
    // Turn order is fixed at the start, and the game is a whole number of laps, so every player
    // is the Poet equally often (teams: both teams get the same number of turns).
    if (this.mode === 'teams') {
      this.teams = [ids.filter((_, i) => i % 2 === 0), ids.filter((_, i) => i % 2 === 1)];
      this.teamScores = [0, 0];
      this.turns = 2 * Math.max(this.teams[0].length, this.teams[1].length);
    } else {
      this.order = ids;
      this.turns = ids.length * (ids.length <= 3 ? 2 : 1);
    }
    for (const p of players.values()) p.score = 0;
    this.turn = -1;
    this.startTurn();
  }

  dispose() { clearTimeout(this.timer); }
  onPlayerRemoved() {
    if (!this.players.has(this.poetId) && (this.phase === 'ready' || this.phase === 'turn')) this.endTurn();
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
  teamOf(id) { return this.mode === 'teams' ? this.teams.findIndex(t => t.includes(id)) : null; }

  poetFor(t) {
    if (this.mode === 'teams') {
      const list = this.teams[t % 2];
      return list[Math.floor(t / 2) % list.length];
    }
    return this.order[t % this.order.length];
  }

  // ---- turns ------------------------------------------------------------------
  startTurn() {
    clearTimeout(this.timer);
    for (;;) {
      this.turn += 1;
      if (this.turn >= this.turns) { this.phase = 'end'; this.endsAt = null; this.card = null; return; }
      this.poetId = this.poetFor(this.turn);
      const p = this.players.get(this.poetId);
      if (p && p.connected) break; // a Poet whose phone is gone forfeits that turn
    }
    this.poetTeam = this.teamOf(this.poetId);
    this.log = [];
    this.turnPts = 0;
    this.card = null;
    this.lastNo = null;
    this.phase = 'ready';
    this.setTimer(READY_MS);
    this.later(READY_MS, () => this.beginTurn());
  }

  beginTurn() {
    if (this.phase !== 'ready') return;
    this.phase = 'turn';
    this.setTimer(TURN_MS);
    this.drawCard();
    this.later(TURN_MS, () => this.endTurn());
  }

  drawCard() {
    if (this.deckIdx >= this.deck.length) { this.deck = shuffle(this.cards); this.deckIdx = 0; }
    this.card = this.deck[this.deckIdx++];
    this.stage = 'one'; // 'three' once the 1-point word has been guessed
    this.cardSeq += 1;
  }

  endTurn() {
    if (this.phase !== 'ready' && this.phase !== 'turn') return;
    clearTimeout(this.timer);
    // A card still in play when time runs out just goes back; a 1-point word already got stays.
    this.card = null;
    this.phase = 'turnEnd';
    this.setTimer(TURN_END_MS);
    this.later(TURN_END_MS, () => this.startTurn());
  }

  // ---- scoring ----------------------------------------------------------------
  // Points go to the Poet's team, or (everyone for themselves) to the Poet and whoever said it.
  award(pts, guesserId) {
    this.turnPts += pts;
    if (this.mode === 'teams') return this.addTeam(this.poetTeam, pts);
    for (const id of new Set([this.poetId, guesserId])) { const p = this.players.get(id); if (p) p.score += pts; }
  }

  penalty() {
    this.turnPts -= 1;
    if (this.mode === 'teams') return this.addTeam(this.poetTeam, -1);
    const p = this.players.get(this.poetId);
    if (p) p.score -= 1;
  }

  addTeam(t, pts) {
    this.teamScores[t] += pts;
    for (const id of this.teams[t]) { const p = this.players.get(id); if (p) p.score = this.teamScores[t]; }
  }

  logCard(result, pts, guesserId) {
    this.log.push({ one: this.card.one, three: this.card.three, result, pts, by: guesserId ? this.name(guesserId) : null });
  }

  // ---- actions ----------------------------------------------------------------
  handle(actor, type, p) {
    p = p || {};
    const host = actor.role === 'console' || !!actor.isHost;
    const pid = actor.playerId;
    const poet = pid && pid === this.poetId;
    const live = this.phase === 'turn' && this.card;
    const guesser = () => {
      if (this.mode === 'teams') return null;
      const g = this.players.get(p.guesser);
      if (g && g.id !== this.poetId) return g.id;
      const others = [...this.players.values()].filter(x => x.connected && x.id !== this.poetId);
      return others.length === 1 ? others[0].id : null;
    };
    switch (type) {
      case 'start':
        if (this.phase !== 'ready' || !poet) return 'Not your turn';
        this.beginTurn();
        return null;
      case 'got1': {
        if (!live || !poet) return 'Not your turn';
        if (this.stage !== 'one') return 'Already scored the word';
        const g = guesser();
        if (this.mode === 'solo' && !g) return 'Pick who said it';
        this.award(1, g);
        this.stage = 'three';
        this.logCard('1', 1, g);
        return null;
      }
      case 'got3': {
        if (!live || !poet) return 'Not your turn';
        const g = guesser();
        if (this.mode === 'solo' && !g) return 'Pick who said it';
        const pts = this.stage === 'one' ? 3 : 2;
        this.award(pts, g);
        if (this.stage === 'three') { const last = this.log[this.log.length - 1]; last.result = '3'; last.pts += pts; last.by = this.name(g); }
        else this.logCard('3', 3, g);
        this.drawCard();
        return null;
      }
      case 'next':
        if (!live || !poet) return 'Not your turn';
        if (this.stage !== 'three') return 'Skipping a fresh card costs a point';
        this.drawCard();
        return null;
      case 'pass':
        if (!live || !poet) return 'Not your turn';
        if (this.stage !== 'one') { this.drawCard(); return null; }
        this.penalty();
        this.logCard('skip', -1);
        this.drawCard();
        return null;
      case 'no': {
        // The NO! stick. Teams: the other team judges. Everyone for themselves: anyone but the
        // Poet can call it, and the Poet can own up. Tied to one card, so two people pressing at
        // once only costs one point.
        if (!live) return 'Nothing to call';
        if (Number(p.card) !== this.cardSeq) return null;
        const judge = this.mode === 'teams' ? this.teamOf(pid) !== this.poetTeam : !poet;
        if (!poet && !judge && !host) return 'Only the other team can call it';
        this.penalty();
        if (this.stage === 'three') { const last = this.log[this.log.length - 1]; last.result = '1+no'; last.pts -= 1; } else this.logCard('no', -1);
        this.lastNo = { by: pid ? this.name(pid) : 'Host', self: poet, at: Date.now() };
        this.drawCard();
        return null;
      }
      case 'skip': // host / console: move the phase along
        if (!host) return 'Host only';
        if (this.phase === 'ready') { this.beginTurn(); return null; }
        if (this.phase === 'turn') { this.endTurn(); return null; }
        if (this.phase === 'turnEnd') { this.startTurn(); return null; }
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

  // ---- view -------------------------------------------------------------------
  view(role, pid) {
    const priv = role === 'console';
    const poet = pid === this.poetId;
    const myTeam = this.teamOf(pid);
    // Teams: the other team judges, so they see the card (they aren't guessing).
    const judge = this.phase === 'turn' && (this.mode === 'teams' ? myTeam != null && myTeam !== this.poetTeam : !poet);
    const seesCard = priv || poet || (this.mode === 'teams' && judge);
    const open = ['turnEnd', 'end'].includes(this.phase) || seesCard;
    return {
      game: 'neanderthals', title: 'Neanderthals', phase: this.phase, mode: this.mode,
      turn: this.turn + 1, turns: this.turns,
      poetId: this.poetId, poetTeam: this.poetTeam,
      card: this.phase === 'turn' && this.card && seesCard ? { ...this.card, stage: this.stage, seq: this.cardSeq } : null,
      cardSeq: this.cardSeq,
      canNo: this.phase === 'turn' && (judge || poet),
      turnPts: this.turnPts,
      log: (this.log || []).map(l => (open ? l : { result: l.result, pts: l.pts })),
      lastNo: this.lastNo,
      teams: this.mode === 'teams' ? this.teams.map((ids, t) => ({ id: t, name: TEAM_NAMES[t], color: TEAM_COLORS[t], score: this.teamScores[t], players: ids })) : null,
      myTeam,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected, team: this.teamOf(p.id),
      })),
      endsAt: this.endsAt || null, windowMs: this.total || 0,
    };
  }
}

module.exports = { Neanderthals, TURN_MS };
