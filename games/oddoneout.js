'use strict';
// Odd One Out: a grid of pictures on your phone, all the same but one. Tap the odd one, as fast
// as you can. Everyone gets the same grids. Right: +10. Wrong: -5 and a short freeze.
// Round 1: a look-alike picture. Round 2: one picture is mirrored. Round 3: one is slightly
// tilted, in a bigger grid.
const { Race, rand } = require('./race');

const LABELS = ['Spot the look-alike', 'Spot the mirror image', 'Spot the tilted one'];
const LOOKALIKES = [
  ['😀', '😃'], ['😊', '🙂'], ['🍎', '🍅'], ['🍊', '🍑'], ['🐱', '🐯'], ['🌕', '🌝'], ['⭐', '🌟'],
  ['💙', '💜'], ['🚗', '🚙'], ['🍋', '🍌'], ['🐶', '🐺'], ['😺', '😸'], ['🌲', '🌳'], ['🍪', '🍩'],
  ['🐭', '🐹'], ['🔵', '🟣'], ['🟥', '🟧'], ['🍇', '🫐'], ['🐻', '🐨'], ['🐔', '🐤'],
];
// Pictures that clearly face one way, so a mirrored or turned copy stands out (nothing
// symmetrical like a butterfly, whose mirror image looks the same).
const LOPSIDED = ['🐶', '🚗', '🐟', '🎸', '🔑', '🐌', '🚀', '🐘', '🦆', '🐢', '👟', '🦒', '🐎', '🚲', '🐿️', '🦖', '🐊', '🐓'];

function grid(round) {
  const size = round === 3 ? 5 : 4;
  const n = size * size;
  const at = rand(n);
  if (round === 1) {
    const pair = LOOKALIKES[rand(LOOKALIKES.length)];
    const [base, odd] = Math.random() < 0.5 ? pair : [pair[1], pair[0]];
    return { size, at, cells: Array.from({ length: n }, (_, i) => ({ e: i === at ? odd : base })) };
  }
  const e = LOPSIDED[rand(LOPSIDED.length)];
  const t = round === 2 ? 'flip' : (Math.random() < 0.5 ? 'tilt' : 'tiltb');
  return { size, at, cells: Array.from({ length: n }, (_, i) => ({ e, t: i === at ? t : '' })) };
}

class OddOneOut extends Race {
  constructor(players, notify) {
    super(players, notify, { game: 'oddoneout', title: 'Odd One Out', rounds: 3, playMs: 40000, lockMs: 1000 });
  }
  makeRound(round) { return { items: Array.from({ length: 80 }, () => grid(round)) }; }
  attempt(prog, item, p) {
    const ok = Number(p.cell) === item.at;
    return { ok, pts: ok ? 10 : -5, done: ok };
  }
  itemView(item) { return { size: item.size, cells: item.cells }; }
  roundLabel(round) { return LABELS[round - 1] || ''; }
}

module.exports = { OddOneOut };
