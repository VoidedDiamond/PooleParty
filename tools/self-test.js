'use strict';
// npm test: quick checks on the answer matcher and the content files.
const { judge } = require('../games/match');
let bad = 0;
const t = (guess, answers, expect, lenient = false) => {
  const r = judge(guess, [].concat(answers), { lenient });
  if (r.index !== expect) { bad++; console.log(`FAIL ${JSON.stringify(guess)} vs ${JSON.stringify(answers)}: got ${r.index}, wanted ${expect}`); }
};
t('mars', 'What is Mars?', 0);
t('the planet mars', 'Mars', 0);
t('eisenhower', 'Dwight David Eisenhower', 0);
t('george', 'George Washington', -1);
t('kneejerk', 'Knee-jerk', 0);
t('1990', '1989', -1);
t('city', 'Kansas City', -1);
t('world war i', 'World War II', -1);
t('north dakota', 'South Dakota', -1);
t('sun screen', ['umbrella', 'sunscreen'], 1, true);
t('beach hat', ['umbrella', 'sun hat'], 1, true);
t('an umbrella', ['umbrella', 'sun hat'], 0, true);
console.log(bad ? `${bad} matcher checks failed` : 'matcher checks passed');
process.exit(bad ? 1 : 0);
