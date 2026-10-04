'use strict';
const { shuffle, sample } = require('./content');

const TEAM_COLORS = ['#ff5d5d', '#4fa8ff'];
const TEAM_NAMES = ['Red', 'Blue'];
const CLUE_MS = 60000;
const GUESS_MS = 90000;
const TEAMS_MS = 45000;
const ROLES_MS = 30000;

class Codenames {
  // opts: { source, teamMode: 'pick' | 'random' }
  constructor(players, notify, opts) {
    this.players = players;
    this.notify = notify;
    this.pool = opts.source.data.words;
    this.teamOf = new Map();
    this.picked = new Set(); // who has locked in a team, during 'teams' phase
    this.roleOf = new Map(); // playerId -> 'spy' | 'guess', during 'roles' phase
    this.rolesPicked = new Set();
    this.chosenSpymaster = [null, null];
    this.timer = null;
    this.winner = null;
    const wantsPick = opts.teamMode === 'pick' && players.size > 2;
    if (wantsPick) {
      this.phase = 'teams';
      this.setTimer(TEAMS_MS);
      this.later(TEAMS_MS, () => this.finishTeamPick());
    } else {
      this.autoAssignTeams();
      this.startRoles();
    }
  }

  dispose() { clearTimeout(this.timer); }
  connectedIds() { return [...this.players.values()].filter(p => p.connected).map(p => p.id); }

  later(ms, fn) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      try { fn(); } catch (e) { console.error(e); }
      this.notify();
    }, ms);
  }
  setTimer(ms) { this.endsAt = Date.now() + ms; this.total = ms; }

  onPlayerRemoved() {
    if (this.phase === 'teams') return;
    if (this.phase === 'roles') { this.maybeFinishRoles(); return; }
    for (const id of [...this.teamOf.keys()]) if (!this.players.has(id)) this.teamOf.delete(id);
    // If a spymaster left, hand the role to a teammate so the game can continue.
    for (const t of [0, 1]) {
      const sm = this.spymasterOf[t];
      if (sm != null && (!this.players.has(sm) || !this.players.get(sm).connected)) {
        const list = this.teamPlayers(t);
        this.spymasterOf[t] = list.length ? list[0] : null;
      }
    }
  }

  // ---- teams --------------------------------------------------------------
  autoAssignTeams() {
    const ids = shuffle([...this.players.keys()]);
    ids.forEach((id, i) => this.teamOf.set(id, i % 2));
  }

  teamPlayers(t) {
    return [...this.players.values()].filter(p => this.teamOf.get(p.id) === t && p.connected).map(p => p.id);
  }

  teamName(t) { return `Team ${TEAM_NAMES[t]}`; }

  pickTeam(pid, team) {
    if (this.phase !== 'teams') return 'Teams are already set';
    if (![0, 1].includes(team)) return 'Bad team';
    this.teamOf.set(pid, team);
    this.picked.add(pid);
    const connected = [...this.players.values()].filter(p => p.connected).map(p => p.id);
    if (connected.every(id => this.picked.has(id))) this.finishTeamPick();
    return null;
  }

  finishTeamPick() {
    if (this.phase !== 'teams') return;
    this.phase = 'teamsDone';
    // Anyone who didn't choose (phone asleep when picking closed, say) gets balanced in, and if
    // everybody piled onto one side, half of them are moved so both teams have players.
    this.ensureTeams();
    for (const t of [0, 1]) {
      const mine = [...this.teamOf.entries()].filter(([, x]) => x === t).map(([id]) => id);
      const theirs = [...this.teamOf.entries()].filter(([, x]) => x !== t).map(([id]) => id);
      if (!mine.length && theirs.length > 1) shuffle(theirs).slice(0, Math.floor(theirs.length / 2)).forEach(id => this.teamOf.set(id, t));
    }
    this.startRoles();
  }

  // Every player has a team once team picking is over, including anyone whose phone was asleep
  // at that moment or who joined after the game started: they go to the smaller team. Without
  // this they'd see the role buttons but have every tap refused.
  ensureTeams() {
    if (this.phase === 'teams') return;
    for (const id of [...this.teamOf.keys()]) if (!this.players.has(id)) this.teamOf.delete(id);
    for (const p of this.players.values()) {
      if (this.teamOf.has(p.id)) continue;
      const count = [0, 0];
      for (const t of this.teamOf.values()) count[t]++;
      this.teamOf.set(p.id, count[0] <= count[1] ? 0 : 1);
    }
  }

  // ---- roles ----------------------------------------------------------------
  // A team with only one connected player has no one else to guess, so that player is forced
  // into both roles automatically — nothing to ask them. Otherwise each team picks who gives
  // hints (spymaster); everyone else on the team guesses. Only one hint-giver per team.
  startRoles() {
    this.roleOf = new Map();
    this.rolesPicked = new Set();
    this.chosenSpymaster = [0, 1].map(t => {
      const list = this.teamPlayers(t);
      if (list.length <= 1) { const id = list[0] ?? null; if (id != null) { this.roleOf.set(id, 'spy'); this.rolesPicked.add(id); } return id; }
      return null;
    });
    if ([0, 1].every(t => this.teamPlayers(t).length <= 1)) { this.setupBoard(); return; }
    this.phase = 'roles';
    this.setTimer(ROLES_MS);
    this.later(ROLES_MS, () => this.finishRoles());
    this.maybeFinishRoles();
  }

  pickRole(pid, role) {
    if (this.phase !== 'roles') return 'Not choosing roles right now';
    this.ensureTeams();
    if (!['spy', 'guess'].includes(role)) return 'Bad role';
    const t = this.teamOf.get(pid);
    if (t == null) return 'No team';
    if (this.teamPlayers(t).length <= 1) return 'Your team decides automatically';
    if (role === 'spy') {
      const taken = [...this.roleOf.entries()].some(([id, r]) => r === 'spy' && id !== pid && this.teamOf.get(id) === t);
      if (taken) return 'Your team already has a hint-giver';
    }
    this.roleOf.set(pid, role);
    this.rolesPicked.add(pid);
    this.maybeFinishRoles();
    return null;
  }

  maybeFinishRoles() {
    if (this.phase !== 'roles') return;
    if (this.connectedIds().every(id => this.rolesPicked.has(id))) this.finishRoles();
  }

  finishRoles() {
    if (this.phase !== 'roles') return;
    for (const t of [0, 1]) {
      if (this.chosenSpymaster[t] != null) continue;
      const list = this.teamPlayers(t);
      const picked = list.find(id => this.roleOf.get(id) === 'spy');
      this.chosenSpymaster[t] = picked ?? (list[0] ?? null);
    }
    this.setupBoard();
  }

  setupBoard() {
    if (this.teamPlayers(0).length === 0 || this.teamPlayers(1).length === 0) {
      // Degenerate case (e.g. everyone ended up on one side): rebalance evenly.
      this.autoAssignTeams();
    }
    const words = sample(this.pool, 25);
    const first = Math.random() < 0.5 ? 0 : 1;
    const counts = first === 0 ? [9, 8] : [8, 9];
    const colors = shuffle([
      ...Array(counts[0]).fill(0), ...Array(counts[1]).fill(1),
      ...Array(7).fill('neutral'), 'assassin',
    ]);
    this.board = words.map((word, i) => ({ word, color: colors[i], revealed: false }));
    this.spymasterOf = [0, 1].map(t => {
      const chosen = this.chosenSpymaster[t];
      if (chosen != null && this.teamPlayers(t).includes(chosen)) return chosen;
      return this.teamPlayers(t)[0] ?? null;
    });
    this.turn = first;
    this.remaining = [counts[0], counts[1]];
    this.clue = null;
    this.log = [];
    this.startClue();
  }

  // ---- turns ----------------------------------------------------------------
  startClue() {
    this.phase = 'clue';
    this.clue = null;
    clearTimeout(this.timer);
    this.setTimer(CLUE_MS);
    const turn = this.turn;
    this.later(CLUE_MS, () => { if (this.phase === 'clue' && this.turn === turn) this.giveClue(this.spymasterOf[turn], { word: '(no clue)', number: 1 }); });
  }

  giveClue(pid, p) {
    if (this.phase !== 'clue' || pid !== this.spymasterOf[this.turn]) return 'Not your turn to give a clue';
    const word = String((p && p.word) || '').trim().slice(0, 24);
    const number = Math.max(0, Math.min(9, Number((p && p.number)) || 0));
    if (!word) return 'Type a clue word first';
    this.clue = { word, number, guessesMade: 0 };
    this.log.unshift({ kind: 'clue', team: this.turn, word, number });
    this.phase = 'guess';
    this.setTimer(GUESS_MS);
    const turn = this.turn;
    this.later(GUESS_MS, () => { if (this.phase === 'guess' && this.turn === turn) this.endTurn(); });
    return null;
  }

  // A solo team (2-player games: one person per side) has nobody else to guess, so its lone
  // member doubles as both spymaster and operative. With a teammate, the normal rule applies.
  soloTeam(t) { return this.teamPlayers(t).length <= 1; }

  guess(pid, idx) {
    if (this.phase !== 'guess') return 'Not now';
    if (this.teamOf.get(pid) !== this.turn) return 'Not your turn';
    if (pid === this.spymasterOf[this.turn] && !this.soloTeam(this.turn)) return 'The spymaster cannot guess';
    const cell = this.board[idx];
    if (!cell || cell.revealed) return 'Bad guess';
    cell.revealed = true;
    const who = this.players.get(pid);
    this.log.unshift({ kind: 'guess', team: this.turn, word: cell.word, color: cell.color, by: who ? who.name : 'Someone' });
    if (cell.color === 'assassin') { this.endGame(1 - this.turn, `${cell.word} was the assassin`); return null; }
    if (typeof cell.color === 'number') {
      this.remaining[cell.color] -= 1;
      if (this.remaining[cell.color] <= 0) { this.endGame(cell.color, `${TEAM_NAMES[cell.color]} found every agent`); return null; }
    }
    if (cell.color !== this.turn) { this.endTurn(); return null; }
    // Correct guesses no longer cap out at clue.number+1 — the team can keep guessing as many
    // times as they want until they guess wrong, hit the assassin, or run out of time.
    this.clue.guessesMade = (this.clue.guessesMade || 0) + 1;
    return null;
  }

  stopGuessing(pid) {
    if (this.phase !== 'guess') return 'Not now';
    if (this.teamOf.get(pid) !== this.turn) return 'Not your turn';
    if (pid === this.spymasterOf[this.turn] && !this.soloTeam(this.turn)) return 'Not your turn';
    this.endTurn();
    return null;
  }

  endTurn() {
    if (this.phase === 'end') return;
    this.turn = 1 - this.turn;
    this.startClue();
  }

  endGame(winner, reason) {
    clearTimeout(this.timer);
    this.phase = 'end';
    this.winner = winner;
    this.reason = reason;
    this.endsAt = null;
    for (const cell of this.board) cell.revealed = true;
  }

  // ---- actions ----------------------------------------------------------------
  handle(actor, type, p) {
    p = p || {};
    this.ensureTeams();
    const host = actor.role === 'console' || !!actor.isHost;
    const pid = actor.playerId;
    switch (type) {
      case 'pickTeam': return pid ? this.pickTeam(pid, Number(p.team)) : 'Players only';
      case 'pickRole': return pid ? this.pickRole(pid, p.role) : 'Players only';
      case 'giveClue': return pid ? this.giveClue(pid, p) : 'Players only';
      case 'guess': return pid ? this.guess(pid, Number(p.idx)) : 'Players only';
      case 'stopGuessing': return pid ? this.stopGuessing(pid) : 'Players only';
      case 'skip':
        if (!host) return 'Host only';
        if (this.phase === 'teams') { this.finishTeamPick(); return null; }
        if (this.phase === 'roles') { this.finishRoles(); return null; }
        if (this.phase === 'clue') { this.giveClue(this.spymasterOf[this.turn], { word: '(skipped)', number: 1 }); return null; }
        if (this.phase === 'guess') { this.endTurn(); return null; }
        return 'Nothing to skip';
      case 'adjust': return host ? null : 'Host only';
      default: return 'Unknown action';
    }
  }

  // ---- view ---------------------------------------------------------------
  view(role, pid) {
    this.ensureTeams();
    if (this.phase === 'teams') {
      return {
        game: 'codenames', title: 'Codenames', phase: 'teams',
        players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, connected: p.connected, team: this.teamOf.get(p.id) ?? null })),
        picked: [...this.picked],
        endsAt: this.endsAt || null, windowMs: this.total || 0,
      };
    }
    if (this.phase === 'roles') {
      const spyTakenBy = [0, 1].map(t => {
        const found = [...this.roleOf.entries()].find(([id, r]) => r === 'spy' && this.teamOf.get(id) === t);
        return found ? found[0] : null;
      });
      return {
        game: 'codenames', title: 'Codenames', phase: 'roles',
        players: [...this.players.values()].map(p => ({
          id: p.id, name: p.name, color: p.color, connected: p.connected,
          team: this.teamOf.get(p.id) ?? null, role: this.roleOf.get(p.id) || null,
        })),
        teams: [0, 1].map(t => ({ id: t, name: this.teamName(t), color: TEAM_COLORS[t], spyTakenBy: spyTakenBy[t], solo: this.teamPlayers(t).length <= 1 })),
        picked: [...this.rolesPicked],
        endsAt: this.endsAt || null, windowMs: this.total || 0,
      };
    }
    const priv = role === 'console';
    const isSpymaster = pid != null && (pid === this.spymasterOf[0] || pid === this.spymasterOf[1]);
    const showColor = priv || isSpymaster;
    return {
      game: 'codenames', title: 'Codenames', phase: this.phase,
      turn: this.turn, remaining: this.remaining,
      teams: [0, 1].map(t => ({ id: t, name: this.teamName(t), color: TEAM_COLORS[t], spymaster: this.spymasterOf[t] })),
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, connected: p.connected, team: this.teamOf.get(p.id) })),
      board: this.board.map((c, i) => ({
        i, word: c.word, revealed: c.revealed,
        color: (c.revealed || showColor) ? c.color : null,
      })),
      isSpymaster, mySpymasterTeam: pid === this.spymasterOf[0] ? 0 : pid === this.spymasterOf[1] ? 1 : null,
      soloTeam: this.soloTeam(this.turn),
      clue: this.clue,
      log: this.log.slice(0, 6),
      winner: this.winner, reason: this.reason,
      endsAt: this.endsAt || null, windowMs: this.total || 0,
    };
  }
}

module.exports = { Codenames };
