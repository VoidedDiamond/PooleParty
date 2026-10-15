'use strict';
// Quick Math: a race through arithmetic problems on your phone. Everyone gets the same problems
// in the same order. Type the answer on the keypad; it's checked as soon as you've typed as many
// digits as the answer has. Right: +10. Wrong: a short freeze, then the next problem.
// Three 40-second rounds, each harder than the last.
const { Race, between } = require('./race');

const LABELS = ['Adding and taking away', 'Bigger numbers and times tables', 'Everything, including dividing'];

function problem(round) {
  const kind = round === 1 ? between(0, 1) : round === 2 ? between(0, 2) : between(0, 4);
  let a, b, c, text, answer;
  if (round === 1) {
    if (kind === 0) { a = between(1, 9); b = between(1, 9); text = `${a} + ${b}`; answer = a + b; }
    else { a = between(5, 18); b = between(1, Math.min(9, a)); text = `${a} − ${b}`; answer = a - b; }
  } else if (round === 2) {
    if (kind === 0) { a = between(11, 69); b = between(5, 29); text = `${a} + ${b}`; answer = a + b; }
    else if (kind === 1) { a = between(20, 99); b = between(5, a - 1); text = `${a} − ${b}`; answer = a - b; }
    else { a = between(2, 9); b = between(2, 9); text = `${a} × ${b}`; answer = a * b; }
  } else if (kind === 0) { a = between(3, 12); b = between(3, 12); text = `${a} × ${b}`; answer = a * b; }
  else if (kind === 1) { b = between(2, 9); answer = between(2, 12); a = b * answer; text = `${a} ÷ ${b}`; }
  else if (kind === 2) { a = between(5, 20); b = between(2, 15); c = between(1, a + b - 1); text = `${a} + ${b} − ${c}`; answer = a + b - c; }
  else if (kind === 3) { a = between(25, 99); b = between(12, 99); text = `${a} + ${b}`; answer = a + b; }
  else { a = between(40, 120); b = between(11, a - 1); text = `${a} − ${b}`; answer = a - b; }
  return { text, answer };
}

class QuickMath extends Race {
  constructor(players, notify) {
    super(players, notify, { game: 'quickmath', title: 'Quick Math', rounds: 3, playMs: 40000, lockMs: 800 });
  }

  makeRound(round) {
    const items = [];
    for (let i = 0; i < 200; i++) {
      let p = problem(round);
      if (items.length && items[items.length - 1].text === p.text) p = problem(round);
      items.push(p);
    }
    return { items };
  }

  attempt(prog, item, p) {
    const ok = Number(p.value) === item.answer;
    return { ok, pts: ok ? 10 : 0, done: true };
  }

  // The phone needs the number of digits to know when you've finished typing; not the answer.
  itemView(item) { return { text: item.text, digits: String(item.answer).length }; }

  roundLabel(round) { return LABELS[round - 1] || ''; }
}

module.exports = { QuickMath, problem };
