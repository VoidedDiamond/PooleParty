'use strict';
(() => {
  const mod = {};
  mod.inputScreens = new Set();

  mod.screen = (s, me) => {
    const isHinter = me.id === s.hinterId;
    const isGuesser = me.id === s.guesserId;

    if (s.phase === 'end') return finalScoresPhone(s, me);

    if (s.phase === 'reveal') {
      return { key: 'ndreveal', html: `<p class="kicker">The word was</p><p class="reveal-word">${esc(s.word)}</p>
        <p class="note">${s.awarded > 0 ? `+${s.awarded} points!` : 'No points this time.'}</p>` };
    }

    if (isHinter) {
      if (s.phase === 'clue') {
        return { key: 'ndclue', html: `<p class="say">The word is</p><p class="pw-word-phone">${esc(s.word)}</p>
          <p class="note big-warn">Grunt ONE SYLLABLE. That's it. No words, no pointing, no spelling.</p>
          <button class="primary" id="sendgrunt">I've grunted — their turn</button>${bar(s.endsAt, s.windowMs)}` };
      }
      return { key: 'ndjudge', html: `<p class="kicker">The word is</p><p class="pw-word-phone">${esc(s.word)}</p>
        <p class="note">Did ${esc((findPlayer(s, s.guesserId) || {}).name || 'they')} say it?</p>
        <button class="primary" id="gotit">They got it!</button><button class="ghost big" id="miss">Nope, grunt again</button>${bar(s.endsAt, s.windowMs)}` };
    }

    if (isGuesser) {
      if (s.phase === 'clue') return { key: 'ndguesswait', html: `<p class="say">Your partner is about to grunt</p><p class="note">Listen close — one syllable only.</p>` };
      return { key: 'ndguessing', html: `<p class="say">One syllable given</p><p class="note">Shout your guess out loud! ${s.points} points on the table.</p>` };
    }

    return { key: 'ndwatch', html: `<p class="say">${s.phase === 'clue' ? 'About to grunt…' : 'Guessing…'}</p><p class="note">Watch the TV.</p>` };
  };

  mod.wire = () => {
    if ($('#sendgrunt')) $('#sendgrunt').onclick = () => act('giveGrunt');
    if ($('#gotit')) $('#gotit').onclick = () => act('gotIt');
    if ($('#miss')) $('#miss').onclick = () => act('miss');
  };

  GAMES.neanderthals.phone = mod;
})();
