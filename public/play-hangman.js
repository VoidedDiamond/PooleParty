'use strict';
(() => {
  const mod = {};
  mod.inputScreens = new Set(['hmguess']);
  const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  const blanksHTML = s => hangmanBlanksHTML(s.blanks, 'phone');

  const missesHTML = s => `${s.wrongCount} of ${s.maxWrong} misses`;

  function keysHTML(s) {
    return AZ.map(l => {
      const wrong = (s.wrongLetters || []).includes(l);
      const right = (s.guessedLetters || []).includes(l);
      return `<button class="hm-key${wrong ? ' wrong' : right ? ' right' : ''}" data-letter="${l}" ${wrong || right ? 'disabled' : ''}>${l}</button>`;
    }).join('');
  }

  function wireKeys() {
    document.querySelectorAll('.hm-key:not([disabled])').forEach(b => {
      b.onclick = () => act('guessLetter', { letter: b.dataset.letter });
    });
  }

  mod.screen = (s, me) => {
    const isGiver = s.giverId === me.id;

    if (s.phase === 'choosing') {
      if (isGiver) {
        return { key: 'hmchoose', html: `<p class="say">Pick a theme</p>${bar(s.endsAt, s.windowMs)}
          <p class="note">A secret word from it is chosen for you. Everyone else guesses; the longer they take, the more you score.</p>
          <div class="choices">${(s.themeChoices || []).map(t => `<button class="choice" data-theme="${esc(t)}">${esc(t)}</button>`).join('')}</div>` };
      }
      return { key: 'hmchoosewait', html: `<p class="say">${esc(s.giverName)} is picking a theme</p><p class="note">Get ready to guess letters.</p>${bar(s.endsAt, s.windowMs)}` };
    }

    if (s.phase === 'reveal') {
      const a = s.awarded || {};
      const msg = a.won
        ? `${esc(s.giverName)} earns ${a.giverPts} pts for how long it took.${a.solverName ? ` ${esc(a.solverName)} called the whole word for a bonus.` : ''}`
        : `The hangman was completed. ${esc(s.giverName)} earns ${a.giverPts} pts.`;
      return { key: 'hmreveal', html: `<p class="kicker">${a.won ? 'Solved' : 'Nobody got it'}</p><p class="reveal-word">${esc(s.word)}</p><p class="note">${msg}</p>` };
    }

    if (s.phase === 'end') return finalScoresPhone(s, me);

    // guessing
    if (isGiver) {
      return { key: 'hmgiverwatch', html: `<p class="kicker">Your theme</p><p class="say">${esc(s.theme)}</p>
        ${blanksHTML(s)}<p class="note">${missesHTML(s)}. Sit back while they work on it.</p>${bar(s.endsAt, s.windowMs)}` };
    }
    return { key: 'hmguess', html: `<p class="kicker">Theme</p><p class="say">${esc(s.theme)}</p>
      <div id="hmword">${blanksHTML(s)}</div>
      <p class="note" id="hmmiss">${missesHTML(s)}</p>${bar(s.endsAt, s.windowMs)}
      <div class="hm-keys" id="hmkeys">${keysHTML(s)}</div>
      <div class="row"><input id="wordGuess" type="text" maxlength="40" autocomplete="off" placeholder="Solve it…">
      <button class="primary" id="wordGuessGo">Guess</button></div>` };
  };

  // Other players' letters arrive while this screen is input-protected: patch the word, the
  // miss count and the keyboard in place so the whole-word input keeps its text and focus.
  mod.refresh = (key, s) => {
    if (key !== 'hmguess') return;
    if ($('#hmword')) $('#hmword').innerHTML = blanksHTML(s);
    if ($('#hmmiss')) $('#hmmiss').textContent = missesHTML(s);
    if ($('#hmkeys')) { $('#hmkeys').innerHTML = keysHTML(s); wireKeys(); }
  };

  mod.wire = (key) => {
    document.querySelectorAll('[data-theme]').forEach(b => { b.onclick = () => act('chooseTheme', { theme: b.dataset.theme }); });
    if (key === 'hmguess') {
      wireKeys();
      const go = () => {
        const el = $('#wordGuess');
        const text = (el && el.value || '').trim();
        if (!text) return;
        act('guessWord', { text });
        if (el) el.value = '';
      };
      if ($('#wordGuessGo')) $('#wordGuessGo').onclick = go;
      onEnter($('#wordGuess'), go);
    }
  };

  GAMES.hangman.phone = mod;
})();
