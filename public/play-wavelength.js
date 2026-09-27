'use strict';
(() => {
  const mod = {};
  mod.inputScreens = new Set(['guess']);
  const pct = v => (v / 1000) * 100;

  function trackHTML(id, { marker = null, interactive = false, value = 500 } = {}) {
    const dot = marker != null ? `<div class="wlmarker target" style="left:${pct(marker)}%"></div>` : '';
    const slider = interactive
      ? `<input id="guessSlider" type="range" min="0" max="1000" value="${value}" class="wlslider">`
      : '';
    return `<div class="wltrack" id="${id}">${dot}</div>${slider}`;
  }

  // Sends at most one moveGuess per ~70ms while dragging. Uses send() directly (not act()) so a
  // late "not your turn" right as the phase moves on doesn't pop an error toast mid-drag.
  let lastSend = 0;
  function sendMove(value) {
    const now = Date.now();
    if (now - lastSend < 70) return;
    lastSend = now;
    send(socket, 'moveGuess', { value });
  }

  mod.screen = (s, me) => {
    const isPsychic = s.psychicId === me.id;
    const psy = findPlayer(s, s.psychicId);
    const card = `<div class="wlcard"><div class="wlword">${esc(s.left)}</div><div class="wlvs">vs</div><div class="wlword">${esc(s.right)}</div></div>`;

    switch (s.phase) {
      case 'clue':
        if (isPsychic) return { key: 'clue-give', html: `<p class="say">Give a clue</p>${card}
          ${trackHTML('wltargetbox', { marker: s.target })}
          <p class="note">Say a clue out loud that points at the marker on this spectrum. Nobody else can see it.</p>
          <button class="primary" id="ready">I've given my clue</button>` };
        return { key: 'clue-wait', html: `<p class="say">${esc(psy ? psy.name : 'Someone')} is thinking of a clue</p>${card}
          <p class="note">Say it out loud. Everyone else will place their own dial once it's given.</p>` };

      case 'guessing':
        if (!isPsychic) {
          if (s.myLocked) return { key: 'guess-locked', html: `<p class="say">Locked in!</p>${card}
            <p class="note">Waiting on everyone else (${s.lockedCount}/${s.guesserCount} done)…</p>` };
          return { key: 'guess',
            html: `<p class="say">Place the dial — just you, no peeking at others</p>${card}${bar(s.endsAt, s.windowMs)}
              ${trackHTML('wldrag', { interactive: true, value: s.myGuess })}
              <button class="primary" id="lockGuess">Lock in this spot</button>` };
        }
        return { key: 'guessing-wait', html: `<p class="say">Everyone's placing their own dial</p>${card}
          <p class="note">${s.lockedCount}/${s.guesserCount} locked in. Watch the TV.</p>` };

      case 'reveal': {
        const mine = (s.result.guesses || []).find(g => g.pid === me.id);
        const summary = mine
          ? `<p class="note">You scored ${mine.pts} point${mine.pts === 1 ? '' : 's'}.</p>`
          : isPsychic ? `<p class="note">Your clue earned you ${s.result.psychicPts} point${s.result.psychicPts === 1 ? '' : 's'} (average of everyone's guesses).</p>` : '';
        const rows = (s.result.guesses || []).map(g => `<div class="wlrow"><span>${esc(g.name)}</span><span>${g.pts} pt${g.pts === 1 ? '' : 's'}</span></div>`).join('');
        return { key: 'reveal', html: `<p class="say">Reveal!</p>${card}${summary}<div class="wlresults">${rows}</div>` };
      }
      default: return finalScoresPhone(s, me);
    }
  };

  mod.wire = key => {
    if ($('#ready')) $('#ready').onclick = () => act('ready');
    const slider = $('#guessSlider');
    if (slider) slider.addEventListener('input', () => sendMove(Number(slider.value)));
    if ($('#lockGuess')) $('#lockGuess').onclick = () => act('lockGuess', { value: Number(slider ? slider.value : 500) });
  };

  GAMES.wavelength.phone = mod;
})();
