'use strict';
(() => {
  function header(s, label) {
    return `<div class="tv-header"><div><div class="kicker">Round ${s.round} of ${s.rounds}</div>
      <div class="cb-label">${label}</div></div>${s.phase !== 'reveal' ? bar(s.endsAt, s.windowMs) : ''}</div>`;
  }

  function gridHTML(s, { faceUp, mark = null }) {
    const n = s.cols * s.rows;
    return `<div class="mf-grid" style="--cols:${s.cols};--rows:${s.rows}">${Array.from({ length: n }, (_, i) => {
      const c = s.cells && s.cells[i];
      const cls = `${faceUp ? ' up' : ''}${mark === i ? ' mark' : ''}`;
      return `<div class="mf-card${cls}" style="--i:${i}"><div class="mf-face">${c ? c.e : ''}</div><div class="mf-back">?</div></div>`;
    }).join('')}</div>`;
  }

  function answeredHTML(s) {
    const done = new Set(s.answeredIds || []);
    return `<ul class="pchips tanswered">${s.players.filter(p => p.connected || done.has(p.id)).map(p =>
      `<li class="pchip${done.has(p.id) ? ' in' : ''}" style="--color:${p.color}"><span class="dot"></span>${esc(p.name)}${done.has(p.id) ? icon('check') : ''}</li>`).join('')}</ul>`;
  }

  function resultsHTML(s) {
    const res = new Map((s.results || []).map(r => [r.id, r]));
    return `<ul class="pchips tanswered">${s.players.filter(p => p.connected || res.has(p.id)).map(p => {
      const r = res.get(p.id);
      return `<li class="pchip ${r && r.correct ? 'right' : 'wrong'}" style="--color:${p.color}"><span class="dot"></span>${esc(p.name)}${r && r.correct ? `<b>+${r.pts}</b>` : icon('x')}</li>`;
    }).join('')}</ul>`;
  }

  function screenHTML(s) {
    if (s.phase === 'show') {
      return `<div class="stage mf">${header(s, 'Remember where everything is!')}
        <div class="main mf-main">${gridHTML(s, { faceUp: true })}</div></div>`;
    }
    if (s.phase === 'question') {
      const label = s.kind === 'where' ? `Where was the <span class="mf-target">${s.ask.e}</span> ${esc(s.ask.name)}?` : 'What was in the glowing spot?';
      return `<div class="stage mf">${header(s, label)}
        <div class="main mf-main">${gridHTML(s, { faceUp: false, mark: s.kind === 'what' ? s.ask.cell : null })}</div>
        <div class="cb-foot" id="mfAnswered">${answeredHTML(s)}</div></div>`;
    }
    const label = s.kind === 'where' ? `The ${esc(s.ask.name)} was here!` : `It was the ${esc(s.answer.name)}!`;
    return `<div class="stage mf">${header(s, label)}
      <div class="main mf-main">${gridHTML(s, { faceUp: true, mark: s.answer.cell })}</div>
      <div class="cb-foot">${resultsHTML(s)}</div>${scoreboardHTML(s, { plain: true })}</div>`;
  }

  GAMES.memory.tv = {
    update(app, s) {
      if (s.phase === 'end') { app.innerHTML = finalScoresTV(s); app.dataset.mf = ''; return; }
      const key = `${s.round}:${s.phase}`;
      if (app.dataset.mf === key && $('.stage.mf', app)) {
        const ans = $('#mfAnswered', app);
        if (ans) ans.innerHTML = answeredHTML(s);
        return;
      }
      app.dataset.mf = key;
      app.innerHTML = screenHTML(s);
    },
    sounds(a, b) {
      if (b.phase === 'show' && (!a || a.phase !== 'show' || a.round !== b.round)) sfx.start();
      if (a && b.phase === 'question' && a.phase === 'show') sfx.flip();
      if (a && b.phase === 'reveal' && a.phase !== 'reveal') sfx[(b.results || []).some(r => r.correct) ? 'reveal' : 'lose']();
    },
  };
})();
