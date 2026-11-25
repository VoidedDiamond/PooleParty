'use strict';
// Pop in Order: bubbles with numbers float on your phone. Pop them from smallest to largest, as
// fast as you can. Everyone gets the same sets in the same order. Each right pop scores 2, a
// finished set adds 10, and a wrong pop costs 5 and freezes you for a moment. Three 40-second
// rounds: plain numbers, bigger numbers, then little sums you have to work out.
const { Race, between, shuffle } = require('./race');

const LABELS = ['Small numbers', 'Bigger numbers', 'Work out the sums'];

// Spots for the bubbles, as percentages of the play area, kept apart so none overlap.
function spots(n) {
  for (let tries = 0; tries < 200; tries++) {
    const out = [];
    for (let k = 0; k < 400 && out.length < n; k++) {
      const p = { x: between(12, 88), y: between(10, 90) };
      if (out.every(q => Math.hypot(q.x - p.x, (q.y - p.y) * 1.3) > 26)) out.push(p);
    }
    if (out.length === n) return out;
  }
  return Array.from({ length: n }, (_, i) => ({ x: 20 + (i % 3) * 30, y: 15 + Math.floor(i / 3) * 30 }));
}

function makeSet(round) {
  const n = round === 1 ? 5 : 6;
  const values = new Set();
  const labels = new Map();
  while (values.size < n) {
    if (round === 1) values.add(between(1, 20));
    else if (round === 2) {
      // Some look-alikes (16 and 61, 39 and 93) to slow you down.
      const v = between(10, 99);
      values.add(v);
      const flip = Number(String(v).split('').reverse().join(''));
      if (values.size < n && flip !== v && flip >= 10 && Math.random() < 0.4) values.add(flip);
    } else {
      const kind = between(0, 2);
      let a, b, v, label;
      if (kind === 0) { a = between(1, 12); b = between(1, 12); v = a + b; label = `${a}+${b}`; }
      else if (kind === 1) { a = between(6, 20); b = between(1, a - 1); v = a - b; label = `${a}−${b}`; }
      else { a = between(2, 6); b = between(2, 6); v = a * b; label = `${a}×${b}`; }
      if (!values.has(v)) { values.add(v); labels.set(v, label); }
    }
  }
  const list = shuffle([...values]);
  const at = spots(n);
  return { bubbles: list.map((v, i) => ({ label: labels.get(v) || String(v), value: v, x: at[i].x, y: at[i].y })) };
}

class PopInOrder extends Race {
  constructor(players, notify) {
    super(players, notify, { game: 'popinorder', title: 'Pop in Order', rounds: 3, playMs: 40000, lockMs: 1000 });
  }

  makeRound(round) {
    return { items: Array.from({ length: 80 }, () => makeSet(round)) };
  }

  // p.bubble: the index of the bubble tapped. prog.step: how many are popped in this set.
  attempt(prog, item, p) {
    const order = item.bubbles.map((b, i) => [b.value, i]).sort((x, y) => x[0] - y[0]);
    const want = order[prog.step] && order[prog.step][1];
    if (Number(p.bubble) !== want) return { ok: false, pts: -5, done: false };
    prog.step += 1;
    const done = prog.step >= item.bubbles.length;
    return { ok: true, pts: 2 + (done ? 10 : 0), done };
  }

  // The phone shows the bubbles (labels and spots) and which ones are already popped.
  itemView(item, prog) {
    const order = item.bubbles.map((b, i) => [b.value, i]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
    const popped = order.slice(0, prog.step);
    return { bubbles: item.bubbles.map((b, i) => ({ label: b.label, x: b.x, y: b.y, popped: popped.includes(i) })) };
  }

  roundLabel(round) { return LABELS[round - 1] || ''; }
}

module.exports = { PopInOrder, makeSet };
