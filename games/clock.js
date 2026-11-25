'use strict';
// Clock Reader: an analog clock on your phone; tap the time it shows, from four. A race.
// Right: +10. Wrong: -5 and a short freeze.
// Round 1: o'clock, quarter past, half past, quarter to. Round 2: any five minutes.
// Round 3: any five minutes, on a clock with no numbers.
const { Race, rand, shuffle } = require('./race');

const LABELS = ["O'clock, quarter and half past", 'Any five minutes', 'No numbers on the clock'];
const fmt = (h, m) => `${h}:${String(m).padStart(2, '0')}`;
const wrapH = h => ((h - 1 + 12) % 12) + 1;

function clockItem(round) {
  const h = 1 + rand(12);
  const m = round === 1 ? [0, 15, 30, 45][rand(4)] : 5 * rand(12);
  const answer = fmt(h, m);
  // Tempting wrong answers: hands swapped, an hour off, five or fifteen minutes off.
  const tempt = [];
  const swapH = m === 0 ? 12 : m / 5;
  const swapM = (h % 12) * 5;
  tempt.push(fmt(swapH, swapM));
  tempt.push(fmt(wrapH(h + 1), m), fmt(wrapH(h - 1), m));
  tempt.push(fmt(h, (m + 5) % 60), fmt(h, (m + 55) % 60), fmt(h, (m + 30) % 60));
  const wrong = shuffle([...new Set(tempt)].filter(t => t !== answer)).slice(0, 3);
  return { h, m, answer, numbers: round < 3, options: shuffle([answer, ...wrong]) };
}

class ClockReader extends Race {
  constructor(players, notify) {
    super(players, notify, { game: 'clock', title: 'Clock Reader', rounds: 3, playMs: 40000, lockMs: 900 });
  }
  makeRound(round) { return { items: Array.from({ length: 120 }, () => clockItem(round)) }; }
  attempt(prog, item, p) { const ok = p.value === item.answer; return { ok, pts: ok ? 10 : -5, done: true }; }
  itemView(item) { return { h: item.h, m: item.m, numbers: item.numbers, options: item.options }; }
  roundLabel(round) { return LABELS[round - 1] || ''; }
}

module.exports = { ClockReader, clockItem };
