'use strict';
// Checks the Claude API key: where the game finds it, and that it works with both models the
// game uses (one tiny request each, a small fraction of a cent).   npm run check-key
const path = require('path');
const claude = require('../games/claude');

console.warn = () => {}; // the reasons are printed below, once

(async () => {
  if (!claude.init(path.join(__dirname, '..'))) {
    console.log(claude.lastError || `No API key found. Save it as ${claude.KEY_FILE} on your Desktop.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Key found on ${claude.keyWhere} (${claude.keyHint}).`);
  const checks = [['Answer judge', claude.JUDGE_MODEL], ['Host voice and Jeopardy options', claude.MODEL]];
  for (const [label, model] of checks) {
    const reply = await claude.ask({
      system: 'You are checking that an API key works.', prompt: 'Reply with just: OK',
      model, maxTokens: model === claude.JUDGE_MODEL ? 10 : 1024, wait: 30000, feature: 'check',
    });
    if (reply) console.log(`  ${label} (${model}): works`);
    else {
      console.log(`  ${label} (${model}): FAILED - ${claude.lastError || 'no reply (slow or no internet?)'}`);
      process.exitCode = 1;
      break; // a bad key or no credit fails the same way for both
    }
  }
  if (!process.exitCode) console.log('All set. Start Poole Party and the AI host and AI answers are on.');
})();
