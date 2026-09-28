'use strict';
(() => {
  const who = (s, id) => { const p = findPlayer(s, id); return p ? esc(p.name) : 'Someone'; };

  function ensureStage(app) {
    if (app.querySelector('.wlstage')) return;
    app.innerHTML = `<div class="stage wlstage"><div class="main wlmain">
      <div class="wlcard"><div class="wlword" id="wlleft"></div><div class="wlvs">vs</div><div class="wlword" id="wlright"></div></div>
      <div class="wlgauge" id="wlgauge"></div>
      <div class="wlstatus" id="wlstatus"></div>
    </div><div id="wlscores"></div></div>`;
  }

  function statusText(s) {
    const psy = who(s, s.psychicId);
    switch (s.phase) {
      case 'clue': return `<div class="big">${psy} is thinking of a clue</div><div>Say it out loud — everyone else will place their own dial once it's given.</div>${bar(s.endsAt, s.windowMs)}`;
      case 'guessing': return `<div class="big">Everyone's placing their own dial</div><div>${s.lockedCount}/${s.guesserCount} locked in</div>${bar(s.endsAt, s.windowMs)}`;
      case 'reveal': {
        const rows = (s.result.guesses || []).map(g => `<div>${esc(g.name)}: ${g.pts} pt${g.pts === 1 ? '' : 's'}</div>`).join('');
        return `<div class="big">${psy}'s clue earned ${s.result.psychicPts} pt${s.result.psychicPts === 1 ? '' : 's'}</div><div class="wlreveal-rows">${rows}</div>`;
      }
      default: return '';
    }
  }

  GAMES.wavelength.tv = {
    update(app, s) {
      if (s.phase === 'end') { app.innerHTML = finalScoresTV(s); return; }
      ensureStage(app);
      $('#wlleft').textContent = s.left;
      $('#wlright').textContent = s.right;
      // Individual guesses stay private on each phone while guessing; the TV only shows every
      // needle once the round is revealed, one per guesser, colored by their player color.
      const reveal = s.phase === 'reveal' && s.target != null && s.result;
      const key = reveal ? `r${s.round}` : 'blank';
      const gauge = $('#wlgauge');
      if (gauge.dataset.key !== key) {
        gauge.dataset.key = key;
        gauge.innerHTML = WL.svg(reveal ? WL.zones(s.target) + WL.targetLine(s.target)
          + (s.result.guesses || []).map(g => { const p = findPlayer(s, g.pid); return WL.needle(g.value, p ? p.color : '#fff', 'show'); }).join('') : '');
      }
      $('#wlstatus').innerHTML = statusText(s);
      $('#wlscores').innerHTML = scoreboardHTML(s, { turnId: s.psychicId, plain: true });
    },
    sounds(a, b) {
      if (!a) return;
      if (b.phase === 'reveal' && a.phase !== 'reveal') {
        const any = (b.result.guesses || []).some(g => g.pts > 0);
        sfx[any ? 'right' : 'wrong']();
      }
      if (b.phase === 'guessing' && a.phase !== 'guessing') sfx.buzz();
    },
  };
})();
