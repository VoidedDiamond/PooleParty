'use strict';
// Flip 7 and Flip 7: With a Vengeance (card games by The Op), played with phones as hands.
//
// Each round, players take turns choosing to HIT (flip another card) or STAY (bank what they
// have). A second copy of a number you already have BUSTS you: no points this round. Collect
// seven number cards and you FLIP 7: +15 and the round ends for everyone. First to the target
// score (200) after a round wins.
//
// Classic deck (94): numbers 0-12 (one 0, one 1, two 2s ... twelve 12s), +2 +4 +6 +8 +10 and x2,
// and three each of Freeze (bank and you're out), Flip Three (flip three cards in a row) and
// Second Chance (shrugs off one duplicate).
//
// With a Vengeance (108): numbers 1-13 (n copies of n); one of the 7s is Unlucky 7 (throws away
// all your numbers and modifiers, keeping just itself), one of the 13s is Lucky 13 (you can hold
// two 13s), and The Zero (counts as a number, but your round scores 0 unless you Flip 7).
// Modifiers hurt: -2 -4 -6 -8 -10 and /2, and whoever flips one puts it on any player still in
// the round. Actions (two each): Just One More (that player flips one card, then must stay),
// Flip Four, Steal (take any card from another player), Discard (bin any card on the table) and
// Swap (trade two cards between two players). Vengeance cards can hit players who have stayed.
//
// Where the printed rules weren't available to check, choices are documented in the README.

const ROUND_END_MS = 9000;
const STEP_MS = 750;      // pause between card flips, so the TV can show each one
const TURN_MS = 30000;    // hit or stay; on timeout the player stays
const CHOOSE_MS = 25000;  // pick a target; on timeout a random one is picked
const AWAY_MS = 4000;     // the same, for a player whose phone has disconnected

const rand = n => Math.floor(Math.random() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function buildDeck(vengeance) {
  const cards = [];
  let id = 0;
  const add = (kind, v, label, extra = {}) => cards.push({ id: ++id, kind, v, label, ...extra });
  if (!vengeance) {
    add('num', 0, '0');
    for (let n = 1; n <= 12; n++) for (let k = 0; k < n; k++) add('num', n, String(n));
    for (const v of [2, 4, 6, 8, 10]) add('mod', v, `+${v}`, { op: 'add' });
    add('mod', 2, 'x2', { op: 'mul' });
    for (let k = 0; k < 3; k++) { add('act', 0, 'Freeze', { act: 'freeze' }); add('act', 0, 'Flip Three', { act: 'flip3' }); add('act', 0, 'Second Chance', { act: 'second' }); }
  } else {
    for (let n = 1; n <= 13; n++) {
      for (let k = 0; k < n; k++) {
        if (n === 7 && k === 0) add('num', 7, 'Unlucky 7', { sp: 'unlucky7' });
        else if (n === 13 && k === 0) add('num', 13, 'Lucky 13', { sp: 'lucky13' });
        else add('num', n, String(n));
      }
    }
    add('num', 0, 'The Zero', { sp: 'zero' });
    for (const v of [2, 4, 6, 8, 10]) add('mod', v, `−${v}`, { op: 'sub' });
    add('mod', 2, '÷2', { op: 'div' });
    for (let k = 0; k < 2; k++) {
      add('act', 0, 'Just One More', { act: 'justone' }); add('act', 0, 'Flip Four', { act: 'flip4' });
      add('act', 0, 'Steal', { act: 'steal' }); add('act', 0, 'Discard', { act: 'discard' }); add('act', 0, 'Swap', { act: 'swap' });
    }
  }
  return shuffle(cards);
}

class Flip7 {
  // opts: { variant: 'classic' | 'vengeance', target: 200 }
  constructor(players, notify, opts = {}) {
    this.players = players;
    this.notify = notify;
    this.vengeance = opts.variant === 'vengeance';
    this.stepMs = opts.stepMs != null ? opts.stepMs : STEP_MS; // tests run faster
    this.target = [100, 200].includes(Number(opts.target)) ? Number(opts.target) : 200;
    for (const p of players.values()) p.score = 0;
    this.deck = buildDeck(this.vengeance);
    this.discardPile = [];
    this.round = 0;
    this.dealerIdx = -1;
    this.timer = null;
    this.waitTimer = null;
    this.log = [];
    this.startRound();
  }

  dispose() { clearTimeout(this.timer); clearTimeout(this.waitTimer); }

  onPlayerRemoved(pid) {
    if (this.rs) this.rs.delete(pid);
    this.order = (this.order || []).filter(id => id !== pid);
    if (this.wait && this.wait.pid === pid) { this.wait = null; clearTimeout(this.waitTimer); }
    if (this.phase === 'play') this.schedule(0);
  }

  // ---- helpers ---------------------------------------------------------------------------------
  name(pid) { const p = this.players.get(pid); return p ? p.name : 'Someone'; }
  say(text) { this.log.push({ text, at: Date.now() }); if (this.log.length > 6) this.log.shift(); }
  st(pid) { return this.rs.get(pid); }
  inRound(pid) { const r = this.st(pid); return !!r && r.status !== 'busted'; }   // can be targeted by Vengeance cards
  active(pid) { const r = this.st(pid); return !!r && r.status === 'active'; }     // still taking turns

  drawCard() {
    if (!this.deck.length) {
      if (!this.discardPile.length) return null;
      this.deck = shuffle(this.discardPile);
      this.discardPile = [];
      this.say('The deck ran out, so the discard pile was shuffled in.');
    }
    return this.deck.pop();
  }

  schedule(ms = this.stepMs) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      try { this.step(); } catch (e) { console.error(e); }
      this.notify();
    }, ms);
  }

  // ---- rounds ----------------------------------------------------------------------------------
  startRound() {
    this.round += 1;
    const ids = [...this.players.keys()];
    for (const p of this.players.values()) if (typeof p.score !== 'number') p.score = 0; // joined mid-game
    this.roundOver = false;
    this.dealerIdx = (this.dealerIdx + 1) % Math.max(1, ids.length);
    // Play goes around from the dealer's left; the dealer goes last.
    this.order = ids.slice(this.dealerIdx + 1).concat(ids.slice(0, this.dealerIdx + 1));
    this.rs = new Map(ids.map(id => [id, { nums: [], mods: [], second: null, status: 'active', flip7: false, last: null }]));
    this.dealQueue = this.order.slice();
    this.turnPtr = 0;
    this.forced = [];     // [{ pid, left, then: 'stay' | null, deferred: [cards] }]
    this.pending = [];    // [{ pid, card }] actions/modifiers waiting for their player's choice
    this.wait = null;
    this.flipped = null;  // the card just flipped, for the TV
    this.results = null;
    this.phase = 'play';
    this.endsAt = null;
    this.say(`Round ${this.round}. ${this.name(ids[this.dealerIdx])} deals.`);
    this.schedule(Math.min(900, this.stepMs * 2));
  }

  // The driver: one thing happens per step, then the next step is scheduled, unless it's waiting
  // for someone's choice.
  step() {
    if (this.phase !== 'play' || this.wait) return;
    const stillGoing = this.order.some(id => this.active(id)) || this.forced.length || this.pending.length;
    if (this.roundOver || !stillGoing) { this.endRound(); return; }

    // Forced flips (Flip Three / Flip Four / Just One More) come first.
    while (this.forced.length) {
      const f = this.forced[this.forced.length - 1];
      const r = this.st(f.pid);
      if (!r || r.status === 'busted' || f.left <= 0 || this.roundOver) {
        this.forced.pop();
        if (r && r.status !== 'busted' && f.then === 'stay' && r.status === 'active') { r.status = 'stayed'; this.say(`${this.name(f.pid)} is done for the round.`); }
        // Actions flipped during the run are played afterwards (if that player is still in).
        if (r && r.status !== 'busted') for (const card of f.deferred.reverse()) this.pending.unshift({ pid: f.pid, card });
        else for (const card of f.deferred) this.discardPile.push(card);
        continue;
      }
      f.left -= 1;
      this.flip(f.pid, f);
      this.schedule();
      return;
    }

    if (this.pending.length) {
      const { pid, card } = this.pending.shift();
      this.beginChoice(pid, card);
      this.schedule(0);
      return;
    }

    // The opening deal: one card to each player.
    while (this.dealQueue.length) {
      const pid = this.dealQueue.shift();
      if (!this.active(pid)) continue;
      this.flip(pid, null);
      this.schedule();
      return;
    }

    // Turns: the next player still in decides to hit or stay.
    for (let k = 0; k < this.order.length; k++) {
      const pid = this.order[(this.turnPtr + k) % this.order.length];
      if (!this.active(pid)) continue;
      this.turnPtr = (this.order.indexOf(pid) + 1) % this.order.length;
      this.setWait({ type: 'turn', pid });
      return;
    }
    this.endRound();
  }

  setWait(w) {
    this.wait = w;
    const p = this.players.get(w.pid);
    const ms = p && p.connected ? (w.type === 'turn' ? TURN_MS : CHOOSE_MS) : AWAY_MS;
    this.endsAt = Date.now() + ms;
    this.total = ms;
    clearTimeout(this.waitTimer);
    this.waitTimer = setTimeout(() => {
      if (this.wait !== w) return;
      try {
        if (w.type === 'turn') this.stay(w.pid, true);
        else this.autoChoose(w);
      } catch (e) { console.error(e); }
      this.notify();
    }, ms);
  }

  clearWait() { this.wait = null; this.endsAt = null; clearTimeout(this.waitTimer); }

  // ---- flipping a card -------------------------------------------------------------------------
  flip(pid, forced) {
    const card = this.drawCard();
    const r = this.st(pid);
    if (!card) { this.say('No cards left!'); this.roundOver = true; return; }
    this.flipped = { card, pid, at: Date.now() };
    r.last = card.id;
    if (card.kind === 'num') { this.addNumber(pid, card, `${this.name(pid)} flipped ${card.sp ? card.label : `a ${card.label}`}`); return; }
    if (card.kind === 'mod') {
      if (!this.vengeance) { r.mods.push(card); this.say(`${this.name(pid)} flipped ${card.label}.`); return; }
      this.say(`${this.name(pid)} flipped ${card.label}. Who gets it?`);
      if (forced) forced.deferred.push(card); else this.pending.push({ pid, card });
      return;
    }
    // Actions.
    if (card.act === 'second') {
      if (!r.second) { r.second = card; this.say(`${this.name(pid)} got a Second Chance.`); return; }
      this.say(`${this.name(pid)} flipped another Second Chance and must give it away.`);
    } else this.say(`${this.name(pid)} flipped ${card.label}!`);
    if (forced) forced.deferred.push(card); else this.pending.push({ pid, card });
  }

  // A number card joins pid's row (flipped, stolen or swapped in). Handles busts, Second Chance,
  // the special numbers and Flip 7.
  addNumber(pid, card, how) {
    const r = this.st(pid);
    if (card.sp === 'unlucky7') {
      for (const c of r.nums.concat(r.mods)) this.discardPile.push(c);
      r.nums = [card];
      r.mods = [];
      this.say(`${how}. Unlucky 7! Everything else goes in the bin.`);
      return 'unlucky';
    }
    const same = r.nums.filter(c => c.v === card.v);
    const luckyPair = card.v === 13 && same.length === 1 && (card.sp === 'lucky13' || same[0].sp === 'lucky13');
    if (same.length && !luckyPair) {
      if (r.second) {
        this.discardPile.push(card, r.second);
        r.second = null;
        this.say(`${how}: a duplicate! Second Chance saves them.`);
        return 'saved';
      }
      r.nums.push(card);
      r.status = 'busted';
      r.bustCard = card.id;
      this.say(`${how}: a duplicate ${card.v}. BUST!`);
      return 'bust';
    }
    r.nums.push(card);
    if (r.nums.length >= 7) {
      r.flip7 = true;
      this.roundOver = true;
      this.say(`${how}. FLIP 7! ${this.name(pid)} ends the round with a 15-point bonus!`);
      return 'flip7';
    }
    this.say(`${how}.`);
    return 'ok';
  }

  // ---- choices ---------------------------------------------------------------------------------
  // What pid may pick for a card: player targets, or cards on the table.
  options(pid, card) {
    const others = this.order.filter(id => id !== pid);
    const tableCards = ids => ids.flatMap(id => {
      const r = this.st(id);
      return r && r.status !== 'busted' ? r.nums.concat(r.mods).map(c => ({ pid: id, cardId: c.id })) : [];
    });
    if (card.kind === 'mod') return { pick: 'player', players: this.order.filter(id => this.inRound(id)) };
    switch (card.act) {
      case 'freeze': case 'flip3': return { pick: 'player', players: this.order.filter(id => this.active(id)) };
      case 'second': return { pick: 'player', players: others.filter(id => this.active(id) && !this.st(id).second) };
      case 'justone': case 'flip4': return { pick: 'player', players: this.order.filter(id => this.inRound(id)) };
      case 'steal': return { pick: 'card', cards: tableCards(others) };
      case 'discard': return { pick: 'card', cards: tableCards(this.order) };
      case 'swap': return { pick: 'two', cards: tableCards(this.order) };
      default: return { pick: 'none' };
    }
  }

  beginChoice(pid, card) {
    const r = this.st(pid);
    // A player who busted before playing their card loses it.
    if (!r || r.status === 'busted') { this.discardPile.push(card); return; }
    const opts = this.options(pid, card);
    const empty = opts.pick === 'player' ? !opts.players.length : opts.pick === 'card' ? !opts.cards.length
      : opts.pick === 'two' ? new Set(opts.cards.map(c => c.pid)).size < 2 : true;
    if (empty) {
      this.discardPile.push(card);
      this.say(`Nobody to use ${card.label} on, so it's discarded.`);
      return;
    }
    this.setWait({ type: 'choose', pid, card, ...opts });
  }

  autoChoose(w) {
    if (w.pick === 'player') { this.choose(w.pid, { target: w.players[rand(w.players.length)] }, true); return; }
    if (w.pick === 'card') { const c = w.cards[rand(w.cards.length)]; this.choose(w.pid, { cardId: c.cardId }, true); return; }
    const a = w.cards[rand(w.cards.length)];
    const rest = w.cards.filter(c => c.pid !== a.pid);
    this.choose(w.pid, { cardId: a.cardId, cardId2: rest[rand(rest.length)].cardId }, true);
  }

  findOnTable(cardId) {
    for (const [pid, r] of this.rs) {
      const list = r.nums.find(c => c.id === cardId) ? 'nums' : r.mods.find(c => c.id === cardId) ? 'mods' : null;
      if (list) return { pid, r, list, card: r[list].find(c => c.id === cardId) };
    }
    return null;
  }

  take(loc) { loc.r[loc.list] = loc.r[loc.list].filter(c => c.id !== loc.card.id); }

  // Put a card (number or modifier) into pid's row; numbers can bust or Flip 7 there.
  give(pid, card, how) {
    if (card.kind === 'num') return this.addNumber(pid, card, how);
    this.st(pid).mods.push(card);
    return 'ok';
  }

  choose(pid, p, auto = false) {
    const w = this.wait;
    if (!w || w.type !== 'choose' || w.pid !== pid) return 'Not your choice';
    const card = w.card;
    const who = this.name(pid);
    if (w.pick === 'player') {
      const target = p.target;
      if (!w.players.includes(target)) return 'Pick one of the players';
      this.clearWait();
      const tn = target === pid ? 'themselves' : this.name(target);
      if (card.kind === 'mod') { this.st(target).mods.push(card); this.say(`${who} puts ${card.label} on ${tn}.`); }
      else if (card.act === 'freeze') { this.st(target).status = 'stayed'; this.discardPile.push(card); this.say(`${who} freezes ${tn}! They bank what they have.`); }
      else if (card.act === 'flip3') { this.forced.push({ pid: target, left: 3, then: null, deferred: [] }); this.discardPile.push(card); this.say(`${who} makes ${tn} flip three!`); }
      else if (card.act === 'flip4') { this.forced.push({ pid: target, left: 4, then: null, deferred: [] }); this.discardPile.push(card); this.say(`${who} makes ${tn} flip four!`); }
      else if (card.act === 'justone') { this.forced.push({ pid: target, left: 1, then: 'stay', deferred: [] }); this.discardPile.push(card); this.say(`Just one more for ${tn}, then they're done.`); }
      else if (card.act === 'second') { this.st(target).second = card; this.say(`${who} gives a Second Chance to ${tn}.`); }
    } else if (w.pick === 'card') {
      const opt = w.cards.find(c => c.cardId === Number(p.cardId));
      const loc = opt && this.findOnTable(opt.cardId);
      if (!loc) return 'Pick one of the cards';
      this.clearWait();
      this.take(loc);
      this.discardPile.push(card);
      if (card.act === 'discard') { this.discardPile.push(loc.card); this.say(`${who} throws away ${this.name(loc.pid)}'s ${loc.card.label}.`); }
      else {
        this.give(pid, loc.card, `${who} steals ${this.name(loc.pid)}'s ${loc.card.label}`); // numbers report themselves
        if (loc.card.kind !== 'num') this.say(`${who} steals ${this.name(loc.pid)}'s ${loc.card.label}.`);
      }
    } else if (w.pick === 'two') {
      const a = w.cards.find(c => c.cardId === Number(p.cardId));
      const b = w.cards.find(c => c.cardId === Number(p.cardId2));
      if (!a || !b || a.pid === b.pid) return 'Pick two cards from two different players';
      const la = this.findOnTable(a.cardId), lb = this.findOnTable(b.cardId);
      if (!la || !lb) return 'Those cards are gone';
      this.clearWait();
      this.take(la);
      this.take(lb);
      this.discardPile.push(card);
      this.say(`${who} swaps ${this.name(la.pid)}'s ${la.card.label} with ${this.name(lb.pid)}'s ${lb.card.label}.`);
      this.give(la.pid, lb.card, `${this.name(la.pid)} gets ${lb.card.label}`);
      this.give(lb.pid, la.card, `${this.name(lb.pid)} gets ${la.card.label}`);
    }
    if (auto) this.say(`(Time's up: picked for ${who}.)`);
    this.schedule();
    return null;
  }

  stay(pid, auto = false) {
    const w = this.wait;
    if (!w || w.type !== 'turn' || w.pid !== pid) return 'Not your turn';
    this.clearWait();
    this.st(pid).status = 'stayed';
    this.say(`${this.name(pid)} stays${auto ? " (time's up)" : ''} with ${this.roundScore(pid)}.`);
    this.schedule(Math.min(400, this.stepMs));
    return null;
  }

  hit(pid) {
    const w = this.wait;
    if (!w || w.type !== 'turn' || w.pid !== pid) return 'Not your turn';
    this.clearWait();
    this.flip(pid, null);
    this.schedule();
    return null;
  }

  // ---- scoring ---------------------------------------------------------------------------------
  roundScore(pid) {
    const r = this.st(pid);
    if (!r || r.status === 'busted') return 0;
    let s = r.nums.reduce((n, c) => n + c.v, 0);
    if (!this.vengeance) {
      if (r.mods.some(c => c.op === 'mul')) s *= 2;
      s += r.mods.filter(c => c.op === 'add').reduce((n, c) => n + c.v, 0);
    } else {
      if (r.mods.some(c => c.op === 'div')) s = Math.floor(s / 2);
      s -= r.mods.filter(c => c.op === 'sub').reduce((n, c) => n + c.v, 0);
      s = Math.max(0, s);
      if (r.nums.some(c => c.sp === 'zero') && !r.flip7) s = 0;
    }
    if (r.flip7) s += 15;
    return s;
  }

  endRound() {
    if (this.phase !== 'play') return;
    if (this.wait && this.wait.card) this.discardPile.push(this.wait.card);
    this.clearWait();
    this.results = this.order.map(pid => {
      const r = this.st(pid);
      const pts = this.roundScore(pid);
      const p = this.players.get(pid);
      if (p) p.score += pts;
      return { id: pid, pts, busted: r.status === 'busted', flip7: r.flip7 };
    });
    for (const r of this.rs.values()) for (const c of r.nums.concat(r.mods, r.second ? [r.second] : [])) this.discardPile.push(c);
    // Cards still waiting to be played when the round ended (a Flip 7 mid-run) go too.
    for (const f of this.forced) this.discardPile.push(...f.deferred);
    for (const x of this.pending) this.discardPile.push(x.card);
    this.forced = [];
    this.pending = [];
    this.roundOver = false;
    const best = Math.max(...[...this.players.values()].map(p => p.score));
    this.phase = best >= this.target ? 'end' : 'roundEnd';
    if (this.phase === 'end') { this.endsAt = null; return; }
    const pause = Math.min(ROUND_END_MS, this.stepMs * 12);
    this.endsAt = Date.now() + pause;
    this.total = pause;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; if (this.phase === 'roundEnd') { this.startRound(); this.notify(); } }, pause);
  }

  // ---- actions from phones -------------------------------------------------------------------------
  handle(actor, type, p) {
    p = p || {};
    const host = actor.role === 'console' || !!actor.isHost;
    const pid = actor.playerId;
    switch (type) {
      case 'hit': return this.phase === 'play' ? this.hit(pid) : 'Not now';
      case 'stay': return this.phase === 'play' ? this.stay(pid) : 'Not now';
      case 'choose': return this.phase === 'play' ? this.choose(pid, p) : 'Not now';
      case 'skip':
        if (!host) return 'Host only';
        if (this.phase === 'roundEnd') { clearTimeout(this.timer); this.startRound(); return null; }
        if (this.wait && this.wait.type === 'turn') return this.stay(this.wait.pid, true);
        if (this.wait) { this.autoChoose(this.wait); return null; }
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

  view() {
    const rows = this.order.map(pid => {
      const r = this.st(pid) || { nums: [], mods: [], status: 'busted' };
      return { id: pid, nums: r.nums, mods: r.mods, second: !!r.second, status: r.status, flip7: r.flip7, bustCard: r.bustCard || null, roundPts: this.roundScore(pid) };
    });
    const w = this.wait;
    return {
      game: 'flip7',
      title: this.vengeance ? 'Flip 7: With a Vengeance' : 'Flip 7',
      variant: this.vengeance ? 'vengeance' : 'classic',
      target: this.target,
      phase: this.phase,
      round: this.round,
      dealerId: [...this.players.keys()][this.dealerIdx] || null,
      rows,
      deckCount: this.deck.length,
      flipped: this.flipped,
      log: this.log.slice(-4),
      wait: w ? { type: w.type, pid: w.pid, card: w.card || null, pick: w.pick || null, players: w.players || null, cards: w.cards || null } : null,
      results: this.results,
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected })),
      endsAt: this.endsAt || null,
      windowMs: this.total || 0,
    };
  }
}

module.exports = { Flip7, buildDeck };
