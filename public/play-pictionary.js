'use strict';
(() => {
  const mod = {};
  mod.inputScreens = new Set(['guess', 'draw']);

  let canvasObj = null;
  let currentColor = '#141414';

  function drawerToolbarHTML() {
    const colors = ['#141414', '#e53e3e', '#3182ce', '#38a169', '#d69e2e'];
    return `<div class="ptoolbar">
      ${colors.map(c => `<button class="pswatch ${c === currentColor ? 'sel' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
      <button class="ghost" id="pclear">Clear</button>
    </div>`;
  }

  const feedHTML = s => (s.guesses || []).slice(0, 8).map(g => `<div class="prow ${g.correct ? 'ok' : ''}">
    <b>${esc(g.name)}</b> ${g.correct ? 'got it!' : esc(g.text)}</div>`).join('');
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
        ${drawerToolbarHTML()}
        <p class="note" id="pcorrect">${correctText(s)}</p>` };
    }

    if (s.phase === 'drawing' && s.iGotIt) {
      return { key: 'gotit', html: `<div class="hero-check">${icon('check')}</div><p class="say">You got it!</p>
        <p class="note">Waiting for everyone else.</p>${bar(s.endsAt, s.windowMs)}<div class="pguessfeed">${feedHTML(s)}</div>` };
    }

    if (s.phase === 'drawing') {
      return { key: 'guess', html: `<p class="say">${esc(s.drawerName)} is drawing</p>
        ${wordBlanksHTML(s.wordShape)}${bar(s.endsAt, s.windowMs)}
        <input id="guessInput" type="text" placeholder="Type your guess" autocomplete="off">
        <button class="primary" id="guessGo">Guess</button>
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
        interactive: true, size: 8, color: currentColor,
        onPoint: (kind, point, color) => sendStroke(kind, point, color),
      });
      document.querySelectorAll('.pswatch').forEach(b => {
        b.onclick = () => {
          currentColor = b.dataset.color;
          if (canvasObj) canvasObj.setColor(currentColor);
          document.querySelectorAll('.pswatch').forEach(x => x.classList.remove('sel'));
          b.classList.add('sel');
        };
      });
      if ($('#pclear')) $('#pclear').onclick = () => { if (canvasObj) canvasObj.clear(); };
    }
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

  GAMES.pictionary.phone = mod;
})();
