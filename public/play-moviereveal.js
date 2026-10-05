'use strict';
(() => {
  const mod = {};
  mod.inputScreens = new Set(['guess']);

  const feedHTML = s => (s.guesses || []).slice(0, 6).map(g => `<div class="prow"><b>${esc(g.name)}</b> ${esc(g.text)}${g.checking ? ' <span class="spin sm"></span>' : ''}</div>`).join('');

  const cluesHTML = s => (s.clues || []).map(c => `<li class="mclue">${esc(c)}</li>`).join('');

  // New clues and other players' guesses are patched in place, so the guess box (and the phone
  // keyboard) never get wiped while someone is typing.
  mod.refresh = (key, s) => {
    if (key !== 'guess') return;
    if ($('#mfeed')) $('#mfeed').innerHTML = feedHTML(s);
    const list = $('#mclues');
    if (list && list.children.length !== (s.clues || []).length) list.innerHTML = cluesHTML(s);
  };

  mod.screen = (s, me) => {
    if (s.phase === 'clue') {
      return { key: 'guess', html: `<p class="kicker">Round ${s.roundNum} of ${s.totalRounds}</p><p class="say">Name that Disney movie</p>${bar(s.endsAt, s.windowMs)}
        <ol class="mclues" id="mclues">${cluesHTML(s)}</ol>
        <form class="guessform" id="guessForm" autocomplete="off">
          <input id="guessInput" type="text" placeholder="Which movie is it?" autocomplete="off" enterkeyhint="send" value="${esc(draft.answer)}">
          <button class="primary" id="guessGo" type="submit">Guess</button>
        </form>
        <div class="pguessfeed" id="mfeed">${feedHTML(s)}</div>` };
    }

    if (s.phase === 'reveal') {
      draft.answer = '';
      return { key: 'reveal', html: `<p class="kicker">${s.winnerName ? `${esc(s.winnerName)} got it` : 'Nobody got it'}</p>
        <p class="reveal-word">${esc(s.movie || '?')}</p>` };
    }

    return finalScoresPhone(s, me);
  };

  mod.wire = key => {
    if (key === 'guess') {
      const input = wireInput('guessInput', 'answer');
      // A real <form> submit: the phone keyboard's Go/Enter key and the Guess button both land here.
      $('#guessForm').onsubmit = e => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        act('guess', { text });
        draft.answer = '';
        input.value = '';
        input.focus();
      };
    }
  };

  GAMES.moviereveal.phone = mod;
})();
