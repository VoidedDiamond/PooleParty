'use strict';
// Claude writes the wrong options for multiple-choice Jeopardy. Without it, the options come
// from the clue bank (mostly the other answers in the same column), so a sharp player can solve
// a clue by elimination. Claude's options are the same kind of thing as the right answer and
// fit the clue, so you have to actually know it.
//   wrongOptions(clues, boardAnswers) -> Promise<Map<id, string[]> | null>
//     clues: [{ id, category, clue, answer }]
// Options are remembered on disk per clue (aicache.js), so a clue seen again costs nothing.
const claude = require('./claude');
const cache = require('./aicache');
const ai = require('./judge');

const SYSTEM = `You write the wrong options for multiple-choice questions in a family quiz game built from Jeopardy clues.
For each clue you get its category, the clue, and the correct answer. Write three wrong answers for it that:
- are the same kind of thing as the correct answer (a person for a person, a colony for a colony, a year for a year), in the same style and about the same length;
- are believable: someone who doesn't know the answer should hesitate between all four options;
- fit the clue's wording and category, so nothing in the clue rules them out at a glance;
- are definitely wrong: never a synonym, nickname, alternate spelling, or partly right version of the correct answer;
- are not any of the other correct answers on the board (players can see the whole board);
- are family friendly.
Answer in JSON.`;

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'integer' }, wrong: { type: 'array', items: { type: 'string' } } },
        required: ['id', 'wrong'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

const keyOf = c => JSON.stringify([c.category, c.clue, c.answer]);

async function wrongOptions(clues, boardAnswers = []) {
  const out = new Map();
  for (const c of clues) { const known = cache.get('quiz', keyOf(c)); if (known) out.set(c.id, known); }
  const todo = clues.filter(c => !out.has(c.id));
  if (!todo.length || !ai.enabled()) return out.size ? out : null;
  const prompt = [
    ...todo.map(c => `Clue ${c.id}\nCategory: ${c.category}\nClue: ${c.clue}\nCorrect answer: ${c.answer}`),
    `Correct answers elsewhere on the board (don't use these): ${boardAnswers.join('; ')}`,
  ].join('\n\n');
  const text = await claude.ask({ system: SYSTEM, prompt, wait: 40000, schema: SCHEMA, feature: 'quiz' });
  if (!text) return out.size ? out : null;
  try {
    for (const it of JSON.parse(text).items || []) {
      const c = todo.find(x => x.id === it.id);
      if (!c || !Array.isArray(it.wrong)) continue;
      const wrong = it.wrong.filter(w => typeof w === 'string').map(w => w.trim()).filter(Boolean).slice(0, 5);
      out.set(c.id, wrong);
      if (wrong.length >= 3) cache.set('quiz', keyOf(c), wrong);
    }
  } catch { /* keep whatever was cached */ }
  return out.size ? out : null;
}

module.exports = { wrongOptions };
