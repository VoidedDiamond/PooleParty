'use strict';
(() => {
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
    const pic = s.picture;
    if (s.phase === 'question') {
      // Negative delay: a TV that joins late (or redraws) shows the same blur as everyone else.
      const delay = -Math.max(0, serverNow() - s.askedAt);
      return `<div class="stage bl"><div class="tv-header"><div><div class="kicker">Round ${s.round} of ${s.rounds}</div>
        <div class="cb-label">What is it? Guess early for more points!</div></div>${bar(s.endsAt, s.windowMs)}</div>
        <div class="main bl-main"><div class="bl-frame"><span class="bl-pic" style="--z:${s.zoom};animation-duration:${s.askMs}ms;animation-delay:${delay}ms">${pic ? pic.e : ''}</span></div></div>
        <div class="cb-foot" id="blAnswered">${answeredHTML(s)}</div></div>`;
    }
    return `<div class="stage bl"><div class="tv-header"><div><div class="kicker">Round ${s.round} of ${s.rounds}</div>
      <div class="cb-label">It's a ${esc(s.answer.name)}!</div></div></div>
      <div class="main bl-main"><div class="bl-frame"><span class="bl-pic clear">${s.answer.e}</span></div></div>
      <div class="cb-foot">${answeredHTML(s)}</div>${scoreboardHTML(s, { plain: true })}</div>`;
  }

  GAMES.blurry.tv = {
    update(app, s) {
      if (s.phase === 'end') { app.innerHTML = finalScoresTV(s); app.dataset.bl = ''; return; }
      const key = `${s.round}:${s.phase}`;
      if (app.dataset.bl === key && $('.stage.bl', app)) { const a = $('#blAnswered', app); if (a) a.innerHTML = answeredHTML(s); return; }
      app.dataset.bl = key;
      app.innerHTML = screenHTML(s);
    },
    sounds(a, b) {
      if (b.phase === 'question' && (!a || a.phase !== 'question' || a.round !== b.round)) sfx.start();
      if (a && b.phase === 'reveal' && a.phase !== 'reveal') sfx[(b.results || []).some(r => r.correct) ? 'reveal' : 'lose']();
    },
  };
})();
