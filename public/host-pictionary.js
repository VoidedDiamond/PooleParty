'use strict';
(() => {
  let canvasObj = null;
  let lastRoundSeq = -1;

  onStroke(msg => {
    if (!canvasObj || !msg) return;
    if (msg.kind === 'start') { canvasObj.setColor(msg.color || '#141414'); canvasObj.startStroke(msg.point); }
    else if (msg.kind === 'point') canvasObj.addPoint(msg.point);
    else if (msg.kind === 'end') canvasObj.endStroke();
    else if (msg.kind === 'clear') canvasObj.clearRemote();
  });

  function ensureCanvas(app) {
    if (canvasObj && app.querySelector('#pcanvas')) return;
    app.innerHTML = `<div class="stage">
      <div class="pmain">
        <div class="pcanvaswrap"><canvas id="pcanvas"></canvas></div>
        <div class="psidebar">
          <div class="pictword"><div class="kicker" id="pdrawer"></div><div id="pword"></div></div>
          <div class="pguesses" id="pguesses"></div>
        </div>
      </div>
      <div id="pscores"></div></div>`;
    canvasObj = makeCanvas($('#pcanvas'), { interactive: false, size: 9, color: '#141414' });
  }

  function choosingHTML(s) {
    return `<div class="stage"><div class="main"><div class="cluebox">
      <div class="cluemeta">Round ${s.roundNum} of ${s.totalRounds}</div>
      <div class="cluetext">${esc(s.drawerName)} is picking a word to draw</div>
      ${bar(s.endsAt, s.windowMs)}
    </div></div>${scoreboardHTML(s, { turnId: s.drawerId, plain: true })}</div>`;
  }

  function revealHTML(s) {
    const correctCount = s.correctCount || 0;
    return `<div class="stage"><div class="main"><div class="cluebox">
      <div class="cluemeta">${esc(s.drawerName)} was drawing</div>
      <div class="cluetext">${esc(s.word || '?')}</div>
      <div class="status">${correctCount > 0 ? `${correctCount} player${correctCount === 1 ? '' : 's'} got it!` : 'Nobody guessed it in time!'}</div>
    </div></div><div>${scoreboardHTML(s, { plain: true })}</div></div>`;
  }


  GAMES.pictionary.tv = {
    sounds(a, b) {
      if (!a) return;
      if (b.phase === 'choosing' && a.phase !== 'choosing') sfx.pop();
      if (a.phase !== 'reveal' && b.phase === 'reveal') sfx.whoosh();
      const ca = (a.guesses || []).filter(g => g.correct).length;
      const cb = (b.guesses || []).filter(g => g.correct).length;
      if (cb > ca) sfx.right();
    },
    update(app, s) {
      if (s.phase === 'choosing') { canvasObj = null; app.innerHTML = choosingHTML(s); return; }
      if (s.phase === 'reveal') { canvasObj = null; app.innerHTML = revealHTML(s); return; }
      if (s.phase === 'end') { canvasObj = null; app.innerHTML = finalScoresTV(s); return; }

      // drawing
      ensureCanvas(app);
      if (s.roundSeq !== lastRoundSeq) {
        lastRoundSeq = s.roundSeq;
        canvasObj.renderStatic(s.strokes || []);
      }
      $('#pdrawer').textContent = `${s.drawerName} is drawing`;
      $('#pword').innerHTML = `${wordBlanksHTML(s.wordShape)}${bar(s.endsAt, s.windowMs)}`;
      const feed = $('#pguesses');
      feed.innerHTML = (s.guesses || []).map(g => `<div class="prow ${g.correct ? 'ok' : ''}">
        <b>${esc(g.name)}</b>${g.correct ? ' got it!' : `: ${esc(g.text)}`}</div>`).join('');
      $('#pscores').innerHTML = scoreboardHTML(s, { turnId: s.drawerId, plain: true });
    },
  };
})();
