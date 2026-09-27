'use strict';
(() => {
  const mod = {};
  mod.inputScreens = new Set(['pwclue']);

  mod.screen = (s, me) => {
    const isHinter = me.id === s.hinterId;
    const isGuesser = me.id === s.guesserId;

    if (s.phase === 'end') return finalScoresPhone(s, me);

    if (s.phase === 'reveal') {
      return { key: 'pwreveal', html: `<p class="kicker">The password was</p><p class="reveal-word">${esc(s.word)}</p>
        <p class="note">${s.awarded > 0 ? `+${s.awarded} points!` : 'No points this time.'}</p>` };
    }

    if (isHinter) {
      if (s.phase === 'clue') {
        return { key: 'pwclue', html: `<p class="say">The password is</p><p class="pw-word-phone">${esc(s.word)}</p>
          <p class="note">Give a one-word clue. No rhymes, no spelling it out!</p>
          <input id="clueword" type="text" maxlength="20" autocomplete="off" placeholder="One-word clue">
          <button class="primary" id="sendclue">Give this clue</button>${bar(s.endsAt, s.windowMs)}` };
      }
      return { key: 'pwjudge', html: `<p class="say">Your clue: "${esc(s.clue)}"</p><p class="note">Did ${esc((findPlayer(s, s.guesserId) || {}).name || 'they')} get it?</p>
        <button class="primary" id="gotit">They got it!</button><button class="ghost big" id="miss">Nope, new clue</button>${bar(s.endsAt, s.windowMs)}` };
    }

    if (isGuesser) {
      if (s.phase === 'clue') return { key: 'pwguesswait', html: `<p class="say">Your partner is thinking of a clue</p><p class="note">Get ready to guess out loud.</p>` };
      return { key: 'pwguessing', html: `<p class="say">Clue: "${esc(s.clue)}"</p><p class="note">Say your guess out loud! ${s.points} points on the table.</p>` };
    }

    return { key: 'pwwatch', html: `<p class="say">${s.phase === 'clue' ? 'Thinking of a clue…' : `Clue: "${esc(s.clue)}"`}</p><p class="note">Watch the TV.</p>` };
  };

  mod.wire = (key) => {
    if ($('#sendclue')) $('#sendclue').onclick = () => act('giveClue', { text: $('#clueword').value });
    if ($('#gotit')) $('#gotit').onclick = () => act('gotIt');
    if ($('#miss')) $('#miss').onclick = () => act('miss');
  };

  GAMES.password.phone = mod;
})();
