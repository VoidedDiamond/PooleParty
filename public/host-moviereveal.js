'use strict';
(() => {
  function clueHTML(s) {
    const points = Math.max(100, 400 - ((s.clues || []).length - 1) * 100);
    return `<div class="stage"><div class="tv-header">
        <div><div class="kicker">Round ${s.roundNum} of ${s.totalRounds}</div><div class="bigtitle small">Name that Disney movie</div></div>
        <div class="mpoints">${points}<small>pts right now</small></div>
      </div>
      ${bar(s.endsAt, s.windowMs)}
      <div class="main"><div class="mrow">
        <ol class="mclues">${(s.clues || []).map(c => `<li class="mclue">${esc(c)}</li>`).join('')}</ol>
        <div class="mfeed"><div class="kicker">Guesses</div>${(s.guesses || []).slice(0, 10).map(g => `<div class="prow"><b>${esc(g.name)}</b> ${esc(g.text)}${g.checking ? ' <span class="spin sm"></span>' : ''}</div>`).join('') || '<div class="side-empty">No guesses yet</div>'}</div>
      </div></div>${scoreboardHTML(s, { plain: true })}</div>`;
  }

  function revealHTML(s) {
    return `<div class="stage"><div class="main"><div class="cluebox">
      <div class="cluemeta">${s.winnerName ? `${esc(s.winnerName)} got it!` : 'Nobody got it'}</div>
      <div class="cluetext">${esc(s.movie || '?')}</div>
    </div></div>${scoreboardHTML(s, { plain: true })}</div>`;
  }

  GAMES.moviereveal.tv = {
    update(app, s) {
      if (s.phase === 'clue') app.innerHTML = clueHTML(s);
      else if (s.phase === 'reveal') app.innerHTML = revealHTML(s);
      else app.innerHTML = finalScoresTV(s);
    },
    sounds(a, b) {
      if (!a) return;
      if ((b.clues || []).length > (a.clues || []).length) sfx.flip();
      if (b.phase === 'reveal' && a.phase !== 'reveal') sfx[b.winnerName ? 'kaching' : 'lose']();
      if (b.phase === 'clue' && a.phase !== 'clue') sfx.start();
    },
  };
})();
