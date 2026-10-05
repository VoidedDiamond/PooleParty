'use strict';
// Claude writes the wrong options for multiple-choice Jeopardy. Without it, the options come
// from the clue bank (mostly the other answers in the same column), so a sharp player can solve
// a clue by elimination. Claude's options are the same kind of thing as the right answer and
// fit the clue, so you have to actually know it.
//   wrongOptions(clues, boardAnswers) -> Promise<Map<id, string[]> | null>
//     clues: [{ id, category, clue, answer }]
const claude = require('./claude');
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

async function wrongOptions(clues, boardAnswers = []) {
  if (!ai.enabled() || !clues.length) return null;
  const prompt = [
    ...clues.map(c => `Clue ${c.id}\nCategory: ${c.category}\nClue: ${c.clue}\nCorrect answer: ${c.answer}`),
    `Correct answers elsewhere on the board (don't use these): ${boardAnswers.join('; ')}`,
  ].join('\n\n');
  const text = await claude.ask({ system: SYSTEM, prompt, wait: 40000, schema: SCHEMA });
  if (!text) return null;
  try {
    const out = new Map();
    for (const it of JSON.parse(text).items || []) {
      if (!Number.isInteger(it.id) || !Array.isArray(it.wrong)) continue;
      out.set(it.id, it.wrong.filter(w => typeof w === 'string').map(w => w.trim()).filter(Boolean).slice(0, 5));
    }
    return out;
  } catch { return null; }
}

module.exports = { wrongOptions };
