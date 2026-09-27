'use strict';
(() => {
  // Zone widths as a percentage of the 0-1000 scale; must match games/wavelength.js (SCALE=1000, ZONE=45).
  const PCT = { four: 4.5, three: 13.5, two: 22.5 };
  const who = (s, id) => { const p = findPlayer(s, id); return p ? esc(p.name) : 'Someone'; };

  // The real Wavelength board is a big illuminated semicircle: a needle sweeps left-right over a
  // 180 degree arc, and on reveal, colored scoring bands light up centered on the hidden target.
  // -90deg = far left of the scale, 0deg = straight up (center), +90deg = far right.
  const CX = 150, CY = 150, R_OUT = 148, R_IN = 80;
  const toDeg = v => Math.max(-90, Math.min(90, (v / 1000 - 0.5) * 180));
  const pointAt = (deg, r) => {
    const rad = deg * Math.PI / 180;
    return [CX + r * Math.sin(rad), CY - r * Math.cos(rad)];
  };
  const sectorPath = (startDeg, endDeg, rIn, rOut) => {
    const [x1, y1] = pointAt(startDeg, rOut);
    const [x2, y2] = pointAt(endDeg, rOut);
    const [x3, y3] = pointAt(endDeg, rIn);
    const [x4, y4] = pointAt(startDeg, rIn);
    const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${rOut} ${rOut} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} ` +
      `L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${rIn} ${rIn} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
  };

  function ensureStage(app) {
    if (app.querySelector('.wlstage')) return;
    app.innerHTML = `<div class="stage wlstage"><div class="main wlmain">
      <div class="wlcard"><div class="wlword" id="wlleft"></div><div class="wlvs">vs</div><div class="wlword" id="wlright"></div></div>
      <div class="wlgauge">
        <svg viewBox="0 0 300 160" class="wlarc">
          <path class="wlarc-track" d="${sectorPath(-90, 90, R_IN, R_OUT)}"></path>
          <g id="wlzones"></g>
          <path class="wlarc-outline" d="${sectorPath(-90, 90, R_IN, R_OUT)}"></path>
          ${[-90, -45, 0, 45, 90].map(d => { const [x1, y1] = pointAt(d, R_IN - 8); const [x2, y2] = pointAt(d, R_IN - 18); return `<line class="wltick" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"></line>`; }).join('')}
          <line id="wltarget" class="wltargetline" x1="150" y1="${(CY - R_IN).toFixed(2)}" x2="150" y2="${(CY - R_OUT).toFixed(2)}" style="display:none"></line>
          <g id="wlneedles"></g>
        </svg>
      </div>
      <div class="wlstatus" id="wlstatus"></div>
    </div><div id="wlscores"></div></div>`;
  }

  function zonesHTML(target) {
    const t = toDeg(target);
    const half = pctWidth => (pctWidth / 100) * 180 / 2;
    const band = (halfDeg, cls) => `<path class="wlzone ${cls}" d="${sectorPath(
      Math.max(-90, t - halfDeg), Math.min(90, t + halfDeg), R_IN, R_OUT)}"></path>`;
    return band(half(PCT.two), 'z2') + band(half(PCT.three), 'z3') + band(half(PCT.four), 'z4');
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
      const showTarget = s.phase === 'reveal' && s.target != null;
      $('#wlzones').innerHTML = showTarget ? zonesHTML(s.target) : '';
      const targetLine = $('#wltarget');
      targetLine.style.display = showTarget ? '' : 'none';
      if (showTarget) targetLine.style.transform = `rotate(${toDeg(s.target)}deg)`;
      // Individual guesses stay private on each phone while guessing; the TV only shows every
      // needle once the round is revealed, one per guesser, colored by their player color.
      const needles = $('#wlneedles');
      if (s.phase === 'reveal' && s.result) {
        needles.innerHTML = (s.result.guesses || []).map(g => {
          const p = findPlayer(s, g.pid);
          const [tx, ty] = pointAt(toDeg(g.value), R_OUT - 18);
          return `<g class="wlneedle show"><line x1="150" y1="150" x2="${tx.toFixed(2)}" y2="${ty.toFixed(2)}" stroke="${p ? p.color : 'var(--wl-guess)'}"></line></g>`;
        }).join('') + `<circle cx="150" cy="150" r="10" class="wlneedle-hub"></circle>`;
      } else {
        needles.innerHTML = '';
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
