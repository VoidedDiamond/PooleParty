'use strict';
(() => {
  const mod = {};
  mod.inputScreens = new Set(['guess']);

  const feedHTML = s => (s.guesses || []).slice(0, 6).map(g => `<div class="prow"><b>${esc(g.name)}</b> ${esc(g.text)}</div>`).join('');

  mod.refresh = (key, s) => { if (key === 'guess' && $('#mfeed')) $('#mfeed').innerHTML = feedHTML(s); };

  mod.screen = (s, me) => {
    if (s.phase === 'clue') {
      return { key: 'guess', html: `<p class="kicker">Round ${s.roundNum} of ${s.totalRounds}</p><p class="say">Name that Disney movie</p>${bar(s.endsAt, s.windowMs)}
        <ol class="mclues">${(s.clues || []).map(c => `<li class="mclue">${esc(c)}</li>`).join('')}</ol>
        <input id="guessInput" type="text" placeholder="Which movie is it?" autocomplete="off">
        <button class="primary" id="guessGo">Guess</button>
        <div class="pguessfeed" id="mfeed">${feedHTML(s)}</div>` };
    }

    if (s.phase === 'reveal') {
      return { key: 'reveal', html: `<p class="kicker">${s.winnerName ? `${esc(s.winnerName)} got it` : 'Nobody got it'}</p>
        <p class="reveal-word">${esc(s.movie || '?')}</p>` };
    }

    return finalScoresPhone(s, me);
  };

  mod.wire = key => {
    if (key === 'guess') {
      const input = wireInput('guessInput', 'answer');
      const go = () => {
        const text = (draft.answer || '').trim();
        if (!text) return;
        act('guess', { text });
        draft.answer = '';
        if (input) input.value = '';
      };
      onEnter(input, go);
      if ($('#guessGo')) $('#guessGo').onclick = go;
    }
  };

  GAMES.moviereveal.phone = mod;
})();
