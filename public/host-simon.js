'use strict';
(() => {
  // Four pads, each with a color and a shape, so the pattern works for colorblind players too.
  const PADS = [['#ff5d5d', '▲'], ['#4fa8ff', '●'], ['#ffd43b', '■'], ['#51cf66', '★']];
  const padsHTML = (lit = null) => `<div class="sm-pads">${PADS.map(([c, sym], i) => `<div class="sm-pad${lit === i ? ' lit' : ''}" data-pad="${i}" style="--c:${c}"><span>${sym}</span></div>`).join('')}</div>`;

  function answeredHTML(s) {
    const done = new Set(s.answeredIds || []);
    const res = new Map((s.results || []).map(r => [r.id, r]));
    return `<ul class="pchips tanswered">${s.players.filter(p => p.connected || done.has(p.id)).map(p => {
      const r = res.get(p.id);
      if (s.phase === 'reveal') return `<li class="pchip ${r && r.correct ? 'right' : 'wrong'}" style="--color:${p.color}"><span class="dot"></span>${esc(p.name)}${r && r.correct ? `<b>+${r.pts}</b>` : icon('x')}</li>`;
      return `<li class="pchip${done.has(p.id) ? ' in' : ''}" style="--color:${p.color}"><span class="dot"></span>${esc(p.name)}${done.has(p.id) ? icon('check') : ''}</li>`;
    }).join('')}</ul>`;
  }

  function screenHTML(s) {
    const label = s.phase === 'watch' ? `Watch! ${s.length} steps` : s.phase === 'repeat' ? 'Now repeat it on your phone!' : 'The pattern was:';
    const strip = s.phase === 'reveal' && s.seq ? `<div class="sm-strip">${s.seq.map(i => `<span style="--c:${PADS[i][0]}">${PADS[i][1]}</span>`).join('')}</div>` : '';
    return `<div class="stage sm"><div class="tv-header"><div><div class="kicker">Round ${s.round} of ${s.rounds}</div>
      <div class="cb-label">${label}</div></div>${s.phase === 'repeat' ? bar(s.endsAt, s.windowMs) : ''}</div>
      <div class="main sm-main">${s.phase === 'reveal' ? strip : padsHTML()}</div>
      <div class="cb-foot" id="smAnswered">${answeredHTML(s)}</div>${s.phase === 'reveal' ? scoreboardHTML(s, { plain: true }) : ''}</div>`;
  }

  // Light the pads in order, timed from the server's start so every TV matches.
  let timers = [];
  function play(s) {
    timers.forEach(clearTimeout);
    timers = [];
    s.seq.forEach((pad, k) => {
      const at = s.watchStart + k * s.stepMs - serverNow();
      if (at + s.stepMs < 0) return;
      timers.push(setTimeout(() => {
        const el = document.querySelector(`.sm-pad[data-pad="${pad}"]`);
        if (!el) return;
        el.classList.add('lit');
        sfx.select();
        timers.push(setTimeout(() => el.classList.remove('lit'), s.stepMs * 0.7));
      }, Math.max(0, at)));
    });
  }

  GAMES.simon.tv = {
    update(app, s) {
      if (s.phase === 'end') { app.innerHTML = finalScoresTV(s); app.dataset.sm = ''; return; }
      const key = `${s.round}:${s.phase}`;
      if (app.dataset.sm === key && $('.stage.sm', app)) { const a = $('#smAnswered', app); if (a) a.innerHTML = answeredHTML(s); return; }
      app.dataset.sm = key;
      app.innerHTML = screenHTML(s);
      if (s.phase === 'watch' && s.seq) play(s);
    },
    sounds(a, b) {
      if (a && b.phase === 'repeat' && a.phase !== 'repeat') sfx.start();
      if (a && b.phase === 'reveal' && a.phase !== 'reveal') sfx[(b.results || []).some(r => r.correct) ? 'reveal' : 'lose']();
    },
  };
  window.SIMON_PADS = PADS;
})();
