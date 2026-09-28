'use strict';
(() => {
  const mod = {};
  mod.inputScreens = new Set(['guess']);
  let dialValue = 500; // where this phone's needle sits while dragging

  // The dial, plus the two spectrum words pinned under its ends.
  const dialHTML = (s, inner, id = '') => `<div class="wldial${id ? ' live' : ''}">${WL.svg(inner, id)}
    <div class="wlends"><span>${esc(s.left)}</span><span>${esc(s.right)}</span></div></div>`;

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

    switch (s.phase) {
      case 'clue':
        if (isPsychic) return { key: 'clue-give', html: `<p class="kicker">You're the Psychic</p><p class="say">Give a clue</p>
          ${dialHTML(s, WL.zones(s.target) + WL.targetLine(s.target))}
          <p class="note">Say one clue out loud that points at the bullseye. Only you can see it.</p>
          <button class="primary" id="ready">I've said my clue</button>${bar(s.endsAt, s.windowMs)}` };
        return { key: 'clue-wait', html: `<p class="say">${esc(psy ? psy.name : 'Someone')} is thinking of a clue</p>${dialHTML(s, '')}
          <p class="note">Say it out loud. Everyone else will place their own dial once it's given.</p>` };

      case 'guessing':
        if (!isPsychic) {
          if (s.myLocked) return { key: 'guess-locked', html: `<p class="say">Locked in!</p>
            ${dialHTML(s, WL.needle(dialValue, me.color))}
            <p class="note">Waiting on everyone else (${s.lockedCount}/${s.guesserCount} done)…</p>` };
          dialValue = s.myGuess == null ? 500 : s.myGuess;
          return { key: 'guess',
            html: `<p class="kicker">${esc(psy ? psy.name : 'The Psychic')} gave a clue</p><p class="say">Drag the needle</p>
              ${dialHTML(s, `<g id="wlmine">${WL.needle(dialValue, me.color)}</g>`, 'wldrag')}
              <p class="note">Your guess is private until the reveal.</p>
              <button class="primary" id="lockGuess">Lock it in</button>${bar(s.endsAt, s.windowMs)}` };
        }
        return { key: 'guessing-wait', html: `<p class="say">Everyone's placing their own dial</p>${dialHTML(s, '')}
          <p class="note">${s.lockedCount}/${s.guesserCount} locked in. Watch the TV.</p>` };

      case 'reveal': {
        const mine = (s.result.guesses || []).find(g => g.pid === me.id);
        const summary = mine
          ? `<p class="note">You scored ${mine.pts} point${mine.pts === 1 ? '' : 's'}.</p>`
          : isPsychic ? `<p class="note">Your clue earned you ${s.result.psychicPts} point${s.result.psychicPts === 1 ? '' : 's'} (average of everyone's guesses).</p>` : '';
        const rows = (s.result.guesses || []).map(g => {
          const p = findPlayer(s, g.pid);
          return `<div class="wlrow" style="--color:${p ? p.color : '#fff'}"><span><span class="dot"></span> ${esc(g.name)}</span><span>${g.pts} pt${g.pts === 1 ? '' : 's'}</span></div>`;
        }).join('');
        const needles = (s.result.guesses || []).map(g => { const p = findPlayer(s, g.pid); return WL.needle(g.value, p ? p.color : '#fff'); }).join('');
        return { key: 'reveal', html: `<p class="say">Reveal!</p>${dialHTML(s, WL.zones(s.target) + WL.targetLine(s.target) + needles)}${summary}<div class="wlresults">${rows}</div>` };
      }
      default: return finalScoresPhone(s, me);
    }
  };

  mod.wire = (key, s, me) => {
    if ($('#ready')) $('#ready').onclick = () => act('ready');
    const dial = $('#wldrag');
    if (dial) {
      // Drag anywhere on the dial; the needle follows the finger around the arc.
      const move = e => {
        dialValue = WL.valueAt(dial, e.clientX, e.clientY);
        $('#wlmine').innerHTML = WL.needle(dialValue, me.color);
        sendMove(dialValue);
      };
      dial.addEventListener('pointerdown', e => { dial.setPointerCapture(e.pointerId); move(e); });
      dial.addEventListener('pointermove', e => { if (dial.hasPointerCapture(e.pointerId)) move(e); });
    }
    if ($('#lockGuess')) $('#lockGuess').onclick = () => act('lockGuess', { value: dialValue });
  };

  GAMES.wavelength.phone = mod;
})();
