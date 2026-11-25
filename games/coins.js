'use strict';
// Coin Count: a handful of coins on your phone; type how many cents they add up to. A race.
// The keypad checks as soon as you've typed as many digits as the answer has.
// Right: +10. Wrong: a short freeze, then the next pile.
// Round 1: pennies, nickels and dimes. Round 2: quarters too. Round 3: bigger piles, half dollars.
const { Race, rand, shuffle } = require('./race');

const LABELS = ['Pennies, nickels and dimes', 'Quarters join in', 'Big piles and half dollars'];
const KINDS = { 1: [1, 5, 10], 2: [1, 5, 10, 25], 3: [1, 5, 10, 25, 50] };

function pile(round) {
  const n = round === 1 ? 3 + rand(3) : round === 2 ? 4 + rand(3) : 6 + rand(3);
  const kinds = KINDS[round];
  const coins = shuffle(Array.from({ length: n }, () => kinds[rand(kinds.length)]));
  return { coins, total: coins.reduce((a, b) => a + b, 0) };
}

class CoinCount extends Race {
  constructor(players, notify) {
    super(players, notify, { game: 'coins', title: 'Coin Count', rounds: 3, playMs: 45000, lockMs: 900 });
  }
  makeRound(round) { return { items: Array.from({ length: 120 }, () => pile(round)) }; }
  attempt(prog, item, p) { const ok = Number(p.value) === item.total; return { ok, pts: ok ? 10 : 0, done: true }; }
  // The digit count lets the keypad check without an extra tap; the total stays on the server.
  itemView(item) { return { coins: item.coins, digits: String(item.total).length }; }
  roundLabel(round) { return LABELS[round - 1] || ''; }
}

module.exports = { CoinCount, pile };
