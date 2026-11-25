'use strict';
(() => {
  const mod = {};
  mod.inputScreens = new Set(['guess', 'draw']);

  let canvasObj = null;
  const feedHTML = s => (s.guesses || []).slice(0, 8).map(g => `<div class="prow ${g.correct ? 'ok' : ''}">
    <b>${esc(g.name)}</b> ${g.correct ? 'got it!' : esc(g.text)}${g.checking ? ' <span class="spin sm"></span>' : ''}</div>`).join('');
  const correctText = s => `${s.correctCount || 0} player${(s.correctCount || 0) === 1 ? '' : 's'} guessed it`;

  mod.screen = (s, me) => {
    const isDrawer = s.drawerId === me.id;

    if (s.phase === 'choosing') {
      if (isDrawer) {
        return { key: 'choose', html: `<p class="say">Pick a word to draw</p>${bar(s.endsAt, s.windowMs)}
          <div class="pwordchoices">${(s.choices || []).map(w => `<button class="choice pwordchoice" data-word="${esc(w)}">${esc(w)}</button>`).join('')}</div>` };
      }
      return { key: 'choose-wait', html: `<p class="say">${esc(s.drawerName)} is picking a word</p>
        <p class="note">Get ready to guess!</p>${bar(s.endsAt, s.windowMs)}` };
    }

    if (s.phase === 'drawing' && isDrawer) {
      return { key: 'draw', html: `<p class="say">Draw: ${esc(s.word || '')}</p>${bar(s.endsAt, s.windowMs)}
        <div class="pcanvaswrap phone-canvas"><canvas id="pcanvas"></canvas></div>
        ${penToolbarHTML()}
        <p class="note" id="pcorrect">${correctText(s)}</p>` };
    }

    if (s.phase === 'drawing' && s.iGotIt) {
      return { key: 'gotit', html: `<div class="hero-check">${icon('check')}</div><p class="say">You got it!</p>
        <p class="note">Waiting for everyone else.</p>${bar(s.endsAt, s.windowMs)}<div class="pguessfeed">${feedHTML(s)}</div>` };
    }

    if (s.phase === 'drawing') {
      return { key: 'guess', html: `<p class="say">${esc(s.drawerName)} is drawing</p>
        ${wordBlanksHTML(s.wordShape)}${bar(s.endsAt, s.windowMs)}
        <form class="guessform" id="guessForm" autocomplete="off">
          <input id="guessInput" type="text" placeholder="Type your guess" autocomplete="off" enterkeyhint="send" value="${esc(draft.answer)}">
          <button class="primary" id="guessGo" type="submit">Guess</button>
        </form>
        <div class="pguessfeed" id="pfeed">${feedHTML(s)}</div>` };
    }

    if (s.phase === 'reveal') {
      const mine = isDrawer;
      return { key: 'reveal', html: `<p class="kicker">The word was</p><p class="reveal-word">${esc(s.word || '?')}</p>
        <p class="note">${mine ? 'Nice drawing!' : (s.correctCount ? 'Nice guessing!' : 'Better luck next time!')}</p>` };
    }

    return finalScoresPhone(s, me);
  };

  // The drawing and guessing screens are input-protected (the canvas / the guess box must not be
  // wiped), so live bits are patched in place as other players' guesses arrive.
  mod.refresh = (key, s) => {
    if (key === 'draw' && $('#pcorrect')) $('#pcorrect').textContent = correctText(s);
    if (key === 'guess' && $('#pfeed')) $('#pfeed').innerHTML = feedHTML(s);
  };

  mod.wire = (key, s, me) => {
    if (key === 'choose') {
      document.querySelectorAll('.pwordchoice').forEach(b => {
        b.onclick = () => act('chooseWord', { word: b.dataset.word });
      });
    }
    if (key === 'draw') {
      const canvasEl = $('#pcanvas');
      canvasObj = makeCanvas(canvasEl, {
        interactive: true, size: 8, color: penColor,
        onPoint: (kind, point, color) => sendStroke(kind, point, color),
      });
      wirePenToolbar(() => canvasObj);
    }
    if (key === 'guess') {
      const input = wireInput('guessInput', 'answer');
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

  GAMES.pictionary.phone = mod;
})();
