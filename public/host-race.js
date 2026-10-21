'use strict';
// TV for the brain-game races (Quick Math, Pop in Order): a countdown, then live bars as
// everyone races on their own phone, then the round's results.
(() => {
  const HOW = {
    quickmath: 'Answer the sums on your phone. Fast!',
    popinorder: 'Pop the bubbles on your phone from smallest to largest!',
    oddoneout: 'Find the odd one out on your phone!',
    colorclash: 'Tap the right color on your phone. Read carefully!',
  };

  function header(s, label) {
    return `<div class="tv-header"><div><div class="kicker">Round ${s.round} of ${s.rounds} · ${esc(s.roundLabel)}</div>
      <div class="cb-label">${label}</div></div>${s.phase === 'play' ? bar(s.endsAt, s.windowMs) : ''}</div>`;
  }

  function barsHTML(s) {
    const rows = s.players.filter(p => p.connected || (s.race.find(r => r.id === p.id) || {}).pts)
      .map(p => ({ p, r: s.race.find(r => r.id === p.id) || { right: 0, wrong: 0, pts: 0 } }))
      .sort((a, b) => b.r.pts - a.r.pts);
    const top = Math.max(1, ...rows.map(x => x.r.pts));
    return `<div class="rc-bars">${rows.map(({ p, r }, i) => `<div class="rc-row" style="--color:${p.color}">
      <span class="rc-name"><span class="dot"></span>${esc(p.name)}</span>
      <div class="rc-track"><div class="rc-fill" style="width:${Math.max(2, (Math.max(0, r.pts) / top) * 100)}%"></div></div>
      <b class="rc-pts">${r.pts}</b><span class="rc-sub">${r.right} right${r.wrong ? ` · ${r.wrong} wrong` : ''}</span>
      ${s.phase === 'results' && i === 0 && r.pts > 0 ? `<span class="rc-crown">${icon('crown')}</span>` : ''}</div>`).join('')}</div>`;
  }

  function screenHTML(s) {
    if (s.phase === 'ready') {
      return `<div class="stage rc">${header(s, HOW[s.game] || '')}
        <div class="main rc-main"><div class="rc-count" id="rcCount">3</div></div></div>`;
    }
    const label = s.phase === 'play' ? HOW[s.game] || '' : `Round ${s.round} results`;
    return `<div class="stage rc">${header(s, label)}<div class="main rc-main" id="rcBars">${barsHTML(s)}</div>
      ${s.phase === 'results' ? scoreboardHTML(s, { plain: true }) : ''}</div>`;
  }

  let countTimer = null;
  function runCount(s) {
    clearInterval(countTimer);
    let last = null;
    const tick = () => {
      const el = $('#rcCount');
      if (!el) { clearInterval(countTimer); return; }
      const left = Math.ceil((s.endsAt - serverNow()) / 1000);
      const txt = left > 3 ? '3' : left >= 1 ? String(left) : 'Go!';
      if (txt !== last) { last = txt; el.textContent = txt; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    };
    tick();
    countTimer = setInterval(tick, 100);
  }

  const tv = {
    update(app, s) {
      if (s.phase === 'end') { app.innerHTML = finalScoresTV(s); app.dataset.rc = ''; return; }
      const key = `${s.round}:${s.phase}`;
      if (app.dataset.rc === key && $('.stage.rc', app)) {
        const b = $('#rcBars', app);
        if (b) b.innerHTML = barsHTML(s);
        return;
      }
      app.dataset.rc = key;
      app.innerHTML = screenHTML(s);
      if (s.phase === 'ready') runCount(s);
    },
    sounds(a, b) {
      if (b.phase === 'play' && (!a || a.phase !== 'play')) sfx.start();
      if (a && b.phase === 'results' && a.phase !== 'results') sfx.timesup();
      if (a && b.phase === 'play' && a.phase === 'play') {
        const sum = x => x.race.reduce((n, r) => n + r.right, 0);
        if (sum(b) > sum(a)) sfx.click(0.6);
      }
    },
  };
  GAMES.quickmath.tv = tv;
  GAMES.popinorder.tv = tv;
  GAMES.oddoneout.tv = tv;
  GAMES.colorclash.tv = tv;
})();
