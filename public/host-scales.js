'use strict';
(() => {
  const TILT = 13; // degrees

  // One seesaw: a plank on a fulcrum, a shape at each end, tipping toward the heavier one.
  function seesawSVG(sw, colorOf, i) {
    const tilt = sw.down === 'right' ? TILT : -TILT;
    const at = (id, x) => `<g transform="translate(${x - 31} -66) scale(.62)">${shapeInner(id, colorOf[id])}</g>`;
    return `<svg class="seesaw" viewBox="-135 -115 270 160" style="--tilt:${tilt}deg;--delay:${i * 180}ms">
      <polygon class="fulcrum" points="0,0 -22,40 22,40"/>
      <rect class="sw-base" x="-60" y="40" width="120" height="6" rx="3"/>
      <g class="plank">
        <rect x="-118" y="-6" width="236" height="10" rx="5"/>
        ${at(sw.left, -82)}${at(sw.right, 82)}
      </g></svg>`;
  }

  const askWord = s => (s.ask === 'lightest' ? 'lightest' : 'heaviest');

  function header(s, label) {
    return `<div class="tv-header"><div><div class="kicker">Round ${s.round} of ${s.rounds}</div>
      <div class="cb-label">${label}</div></div>${s.phase === 'question' ? bar(s.endsAt, s.windowMs) : ''}</div>`;
  }

  function answeredHTML(s) {
    const done = new Set(s.answeredIds || []);
    return `<ul class="pchips tanswered">${s.players.filter(p => p.connected || done.has(p.id)).map(p =>
      `<li class="pchip${done.has(p.id) ? ' in' : ''}" style="--color:${p.color}"><span class="dot"></span>${esc(p.name)}${done.has(p.id) ? icon('check') : ''}</li>`).join('')}</ul>`;
  }

  function questionHTML(s) {
    const colorOf = Object.fromEntries(s.shapes.map(x => [x.id, x.color]));
    const n = s.seesaws.length;
    return `<div class="stage sc">${header(s, `Which is the <span class="sc-ask ${s.ask}">${askWord(s)}</span>?`)}
      <div class="main sc-main"><div class="sc-grid n${n}">${s.seesaws.map((sw, i) => seesawSVG(sw, colorOf, i)).join('')}</div></div>
      <div class="cb-foot" id="scAnswered">${answeredHTML(s)}</div></div>`;
  }

  function revealHTML(s) {
    const colorOf = Object.fromEntries(s.shapes.map(x => [x.id, x.color]));
    const res = new Map((s.results || []).map(r => [r.id, r]));
    const picks = s.players.filter(p => p.connected || res.has(p.id)).map(p => {
      const r = res.get(p.id);
      return `<li class="pchip ${r ? (r.correct ? 'right' : 'wrong') : 'wrong'}" style="--color:${p.color}"><span class="dot"></span>${esc(p.name)}
        ${r ? shapeSVG(r.shape, colorOf[r.shape], 'mini') : ''}${r && r.correct ? `<b>+${r.pts}</b>` : icon('x')}</li>`;
    }).join('');
    const order = s.order || [];
    return `<div class="stage sc">${header(s, `The ${esc(s.answer)} is the ${askWord(s)}!`)}
      <div class="main sc-main"><div class="sc-rank">
        <div class="sc-rank-end">Heaviest</div>
        ${order.map(id => `<div class="sc-rank-item${id === s.answer ? ' win' : ''}">${shapeSVG(id, colorOf[id])}<span>${esc(shapeName(id))}</span></div>`).join(`<div class="sc-gt">${icon('chevron-right')}</div>`)}
        <div class="sc-rank-end">Lightest</div>
      </div>
      <ul class="pchips tanswered sc-picks">${picks}</ul></div>
      ${scoreboardHTML(s, { plain: true })}</div>`;
  }

  GAMES.scales.tv = {
    update(app, s) {
      if (s.phase === 'end') { app.innerHTML = finalScoresTV(s); app.dataset.sc = ''; return; }
      const key = `${s.round}:${s.phase}`;
      if (app.dataset.sc === key && $('.stage.sc', app)) {
        const ans = $('#scAnswered', app);
        if (ans) ans.innerHTML = answeredHTML(s);
        return;
      }
      app.dataset.sc = key;
      app.innerHTML = s.phase === 'question' ? questionHTML(s) : revealHTML(s);
    },
    sounds(a, b) {
      if (b.phase === 'question' && (!a || a.phase !== 'question' || a.round !== b.round)) { sfx.start(); (b.seesaws || []).forEach((_, i) => setTimeout(() => sfx.click(), 450 + i * 180)); }
      if (a && b.phase === 'reveal' && a.phase !== 'reveal') sfx[(b.results || []).some(r => r.correct) ? 'reveal' : 'lose']();
    },
  };
})();
