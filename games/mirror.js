'use strict';
// Mirror or Not: two copies of a picture, the second one turned. Is it the same picture turned
// around, or a mirror image? A race. Right: +10. Wrong: -5 and a short freeze.
// Round 1: quarter turns. Round 2: any angle. Round 3: both pictures are turned.
const { Race, rand } = require('./race');
const { LOPSIDED } = require('./oddoneout');

const LABELS = ['Quarter turns', 'Any angle', 'Both pictures turned'];

function pair(round) {
  const e = LOPSIDED[rand(LOPSIDED.length)];
  const mirror = Math.random() < 0.5;
  const turn = round === 1 ? [90, 180, 270][rand(3)] : 30 + 15 * rand(21); // never 0: that would be too easy
  const first = round === 3 ? 15 * rand(24) : 0;
  return { e, mirror, a: first, b: (first + turn) % 360 };
}

class MirrorOrNot extends Race {
  constructor(players, notify) {
    super(players, notify, { game: 'mirror', title: 'Mirror or Not', rounds: 3, playMs: 40000, lockMs: 900 });
  }
  makeRound(round) { return { items: Array.from({ length: 150 }, () => pair(round)) }; }
  attempt(prog, item, p) {
    const ok = (p.value === 'mirror') === item.mirror;
    return { ok, pts: ok ? 10 : -5, done: true };
  }
  itemView(item) { return { e: item.e, mirror: item.mirror, a: item.a, b: item.b }; }
  roundLabel(round) { return LABELS[round - 1] || ''; }
}

module.exports = { MirrorOrNot };
