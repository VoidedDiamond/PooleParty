'use strict';
// Color Clash: a color word written in a different color ink ("RED" in blue). Tap the color of
// the INK, not what the word says. Right: +10. Wrong: -5 and a short freeze.
// Round 1: tap a color swatch. Round 2: the buttons are color names written in the wrong ink
// too. Round 3: some cards ask for the WORD instead of the ink, so read the question.
const { Race, rand, shuffle } = require('./race');

const LABELS = ['Tap the ink color', 'The buttons lie too', 'Ink or word? Read carefully'];
const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
const other = (not) => { const list = COLORS.filter(c => !not.includes(c)); return list[rand(list.length)]; };

function card(round) {
  const ink = COLORS[rand(COLORS.length)];
  const word = other([ink]);
  const ask = round === 3 && Math.random() < 0.45 ? 'word' : 'ink';
  const answer = ask === 'ink' ? ink : word;
  // Four choices, always including both the ink and the word (the tempting wrong one).
  const names = shuffle([ink, word, ...shuffle(COLORS.filter(c => c !== ink && c !== word)).slice(0, 2)]);
  const options = names.map(name => ({ name, ink: round === 1 ? name : other([name]) }));
  return { word, ink, ask, answer, style: round === 1 ? 'swatch' : 'text', options };
}

class ColorClash extends Race {
  constructor(players, notify) {
    super(players, notify, { game: 'colorclash', title: 'Color Clash', rounds: 3, playMs: 40000, lockMs: 900 });
  }
  makeRound(round) {
    const items = [];
    while (items.length < 200) {
      const c = card(round);
      const last = items[items.length - 1];
      if (last && last.word === c.word && last.ink === c.ink) continue;
      items.push(c);
    }
    return { items };
  }
  attempt(prog, item, p) {
    const ok = p.value === item.answer;
    return { ok, pts: ok ? 10 : -5, done: true };
  }
  itemView(item) { return { word: item.word, ink: item.ink, ask: item.ask, style: item.style, options: item.options }; }
  roundLabel(round) { return LABELS[round - 1] || ''; }
}

module.exports = { ColorClash };
