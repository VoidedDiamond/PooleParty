'use strict';
(() => {
  // ---- drawing the stack ------------------------------------------------------------------------
  // Isometric: the room looks at the stack from the front corner. A cube at (x, y, z) is drawn
  // with its top and two front faces. Layers are drawn bottom up and, within a layer, back to
  // front, which is a correct painter's order for a stack that rests on the floor.
  const S = 40;               // cube edge on screen, before scaling to fit
  const A = S * 0.866, B = S * 0.5;
  const P = (x, y, z) => [(x - y) * A, (x + y) * B - z * S];
  const pts = list => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  // '#4dabf7' -> lighter/darker shades for the three faces.
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)));
    return `rgb(${c.join(',')})`;
  }

  function cubeSVG(x, y, z, faces) {
    return `<polygon class="ct" fill="${faces.top}" points="${pts([P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)])}"/>
      <polygon fill="${faces.right}" points="${pts([P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1)])}"/>
      <polygon fill="${faces.left}" points="${pts([P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)])}"/>`;
  }

  // build: the layers drop in one by one (the count-up).
  function stackSVG(stack, color, { build = false, layerMs = 650 } = {}) {
    const { w, d, h } = stack;
    const top = Math.max(1, ...h);
    const faces = { top: shade(color, 0.35), right: shade(color, -0.12), left: shade(color, -0.38) };
    const floor = `<polygon class="cfloor" points="${pts([P(0, 0, 0), P(w, 0, 0), P(w, d, 0), P(0, d, 0)])}"/>`
      + Array.from({ length: w - 1 }, (_, i) => `<line class="cgrid" x1="${P(i + 1, 0, 0)[0]}" y1="${P(i + 1, 0, 0)[1]}" x2="${P(i + 1, d, 0)[0]}" y2="${P(i + 1, d, 0)[1]}"/>`).join('')
      + Array.from({ length: d - 1 }, (_, i) => `<line class="cgrid" x1="${P(0, i + 1, 0)[0]}" y1="${P(0, i + 1, 0)[1]}" x2="${P(w, i + 1, 0)[0]}" y2="${P(w, i + 1, 0)[1]}"/>`).join('');
    let layers = '';
    for (let z = 0; z < top; z++) {
      let cubes = '';
      for (let s = 0; s <= w + d - 2; s++) {
        for (let x = Math.max(0, s - d + 1); x <= Math.min(w - 1, s); x++) {
          const y = s - x;
          if (h[y * w + x] > z) cubes += cubeSVG(x, y, z, faces);
        }
      }
      layers += `<g class="clayer${build ? ' drop' : ''}"${build ? ` style="animation-delay:${z * layerMs}ms"` : ''}>${cubes}</g>`;
    }
    const x0 = P(0, d, 0)[0] - 4, x1 = P(w, 0, 0)[0] + 4;
    const y0 = -top * S - 4 - (build ? 30 : 0), y1 = P(w, d, 0)[1] + 4;
    return `<svg class="cstack" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" preserveAspectRatio="xMidYMid meet">${floor}${layers}</svg>`;
  }

  // Cubes in each layer, bottom up, for the running total.
  const layerCounts = stack => {
    const top = Math.max(...stack.h);
    return Array.from({ length: top }, (_, z) => stack.h.filter(v => v > z).length);
  };

  // ---- screens ----------------------------------------------------------------------------------
  function header(s, label) {
    return `<div class="tv-header"><div><div class="kicker">Round ${s.round} of ${s.rounds}${s.level === 'hard' ? ' · Hard' : ''}</div>
      <div class="cb-label">${label}</div></div>${s.endsAt && s.phase !== 'count' ? bar(s.endsAt, s.windowMs) : ''}</div>`;
  }

  function answeredHTML(s) {
    const done = new Set(s.answeredIds || []);
    return `<ul class="pchips tanswered">${s.players.filter(p => p.connected || done.has(p.id)).map(p =>
      `<li class="pchip${done.has(p.id) ? ' in' : ''}" style="--color:${p.color}"><span class="dot"></span>${esc(p.name)}${done.has(p.id) ? icon('check') : ''}</li>`).join('')}</ul>`;
  }

  function resultsHTML(s) {
    const rows = (s.results || []).slice().sort((a, b) => a.off - b.off || b.pts - a.pts);
    const missing = s.players.filter(p => p.connected && !rows.some(r => r.id === p.id));
    return `<ul class="cb-results">${rows.map(r => {
      const p = findPlayer(s, r.id) || { name: '?', color: '#888' };
      const cls = r.off === 0 ? 'exact' : r.pts > 0 ? 'close' : '';
      return `<li class="${cls}" style="--color:${p.color}"><span class="dot"></span><span class="nm">${esc(p.name)}</span>
        <b class="guess">${r.n}</b><span class="off">${r.off === 0 ? 'Exact!' : `off by ${r.off}`}</span><b class="pts">${r.pts ? `+${r.pts}` : ''}</b></li>`;
    }).join('')}${missing.map(p => `<li style="--color:${p.color}"><span class="dot"></span><span class="nm">${esc(p.name)}</span><b class="guess">–</b><span class="off">no answer</span><b class="pts"></b></li>`).join('')}</ul>`;
  }

  function screenHTML(s) {
    if (s.phase === 'show') {
      return `<div class="stage cb">${header(s, 'Count the cubes!')}
        <div class="main cb-main"><div class="cb-stage flash">${stackSVG(s.stack, s.color)}</div></div>
        <div class="cb-foot" id="cbAnswered">${answeredHTML(s)}</div></div>`;
    }
    if (s.phase === 'guess') {
      return `<div class="stage cb">${header(s, 'How many cubes were there?')}
        <div class="main cb-main"><div class="cb-gone"><div class="cb-q">?</div><p>Type your count on your phone</p></div></div>
        <div class="cb-foot" id="cbAnswered">${answeredHTML(s)}</div></div>`;
    }
    if (s.phase === 'count') {
      return `<div class="stage cb">${header(s, "Let's count them")}
        <div class="main cb-main cb-split"><div class="cb-stage">${stackSVG(s.stack, s.color, { build: true, layerMs: s.layerMs })}</div>
        <div class="cb-tally"><div class="cb-num" id="cbNum">0</div><div class="cb-layers" id="cbLayers"></div></div></div></div>`;
    }
    // reveal
    return `<div class="stage cb">${header(s, `There were ${s.count} cubes`)}
      <div class="main cb-main cb-split"><div class="cb-stage">${stackSVG(s.stack, s.color)}</div>
      <div class="cb-tally"><div class="cb-num done">${s.count}</div>${resultsHTML(s)}</div></div>
      ${scoreboardHTML(s, { plain: true })}</div>`;
  }

  // The running total during the count-up, one layer at a time, with a pop per layer.
  let countTimers = [];
  function runCount(s) {
    countTimers.forEach(clearTimeout);
    countTimers = [];
    const per = layerCounts(s.stack);
    let total = 0;
    per.forEach((n, z) => {
      countTimers.push(setTimeout(() => {
        total += n;
        const num = $('#cbNum'), lay = $('#cbLayers');
        if (!num) return;
        num.textContent = total;
        num.classList.remove('bump'); void num.offsetWidth; num.classList.add('bump');
        if (lay) lay.insertAdjacentHTML('beforeend', `<div class="cb-layer">Layer ${z + 1}: <b>${n}</b></div>`);
        sfx.pop();
      }, z * s.layerMs + 250));
    });
  }

  GAMES.cubes.tv = {
    update(app, s) {
      if (s.phase === 'end') { app.innerHTML = finalScoresTV(s); app.dataset.cb = ''; return; }
      const key = `${s.round}:${s.phase}`;
      if (app.dataset.cb === key && $('.stage.cb', app)) {
        const ans = $('#cbAnswered', app);
        if (ans) ans.innerHTML = answeredHTML(s);
        return;
      }
      app.dataset.cb = key;
      app.innerHTML = screenHTML(s);
      if (s.phase === 'count') runCount(s);
    },
    sounds(a, b) {
      if (!a) { if (b.phase === 'show') sfx.start(); return; }
      if (b.phase === 'show' && (a.phase !== 'show' || a.round !== b.round)) sfx.start();
      if (b.phase === 'guess' && a.phase === 'show') sfx.swoosh();
      if (b.phase === 'reveal' && a.phase !== 'reveal') {
        const exact = (b.results || []).some(r => r.off === 0);
        sfx[exact ? 'right' : (b.results || []).some(r => r.pts > 0) ? 'reveal' : 'lose']();
      }
    },
  };
})();
