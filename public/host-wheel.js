'use strict';
(() => {
  const STEP = 360 / 16;
  const COLORS = ['#ff5a5f', '#ffc53d', '#3b82f6', '#22c55e', '#f97316', '#a855f7'];
  let rot = 0;
  let lastSpinId = null;
  let wheelEl = null;

  const polar = (r, deg) => [r * Math.sin(deg * Math.PI / 180), -r * Math.cos(deg * Math.PI / 180)];

  function buildWheel(wedges) {
    const n = wedges.length;
    const step = 360 / n;
    let paths = '';
    wedges.forEach((w, i) => {
      const c = i * step;
      const [x1, y1] = polar(96, c - step / 2);
      const [x2, y2] = polar(96, c + step / 2);
      const fill = w.kind === 'bankrupt' ? '#15131c' : w.kind === 'lose' ? '#f1f3f5' : COLORS[i % COLORS.length];
      const ink = w.kind === 'lose' ? '#15131c' : '#fff';
      const label = w.kind === 'bankrupt' ? 'BANKRUPT' : w.kind === 'lose' ? 'LOSE TURN' : w.label;
      paths += `<path d="M0 0 L${x1.toFixed(2)} ${y1.toFixed(2)} A96 96 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${fill}" stroke="#fff" stroke-width=".8"/>
        <text transform="rotate(${c - 90}) translate(89 0)" text-anchor="end" dominant-baseline="middle" font-size="${label.length > 6 ? 6.2 : 8}" font-weight="600" fill="${ink}" font-family="Fredoka, Nunito, sans-serif">${label}</text>`;
    });
    return `<svg viewBox="-100 -100 200 200" class="wheel-svg">${paths}<circle r="11" fill="#fff"/><circle r="5" fill="#ffc53d"/></svg>`;
  }

  function ensureStage(app, s) {
    if (app.querySelector('.wheelstage')) return;
    app.innerHTML = `<div class="stage wheelstage"><div class="main wmain">
      <div class="wleft"><div class="wheelwrap"><div class="pointer"></div><div id="wheel" class="wheel">${buildWheel(s.wedges)}</div></div></div>
      <div class="wright"><div class="wcat" id="wcat"></div><div class="pboard" id="pboard"></div>
        <div class="wmsg" id="wmsg"></div><div class="called" id="called"></div></div>
      </div><div id="wscores"></div></div>`;
    wheelEl = $('#wheel');
    wheelEl.style.transform = `rotate(${rot}deg)`;
  }

  function spinTo(index, animate) {
    const cur = ((rot % 360) + 360) % 360;
    const target = (360 - index * STEP + (Math.random() * 12 - 6) + 360) % 360;
    const delta = (((target - cur) % 360) + 360) % 360 + (animate ? 360 * 5 : 0);
    rot += delta;
    wheelEl.style.transition = animate ? 'transform 4s cubic-bezier(.12,.6,.12,1)' : 'none';
    wheelEl.style.transform = `rotate(${rot}deg)`;
  }

  function boardHTML(s) {
    return s.words.map(w => `<div class="pword">${w.map(t => t.letter
      ? `<span class="tl ${t.shown ? 'on' : ''}">${t.shown ? t.ch : ''}</span>`
      : `<span class="tp">${esc(t.ch)}</span>`).join('')}</div>`).join('');
  }

  function statusText(s) {
    const p = findPlayer(s, s.turnPid);
    const name = p ? esc(p.name) : '';
    switch (s.phase) {
      case 'turn': return `${name}: spin, buy a vowel, or solve`;
      case 'spinning': return `${name} is spinning...`;
      case 'consonant': return `${name}: call a consonant for ${esc(s.wedge ? s.wedge.label : '')}`;
      case 'vowel': return `${name}: call a vowel`;
      case 'roundEnd': return `The answer: ${esc(s.solution || '')}`;
      case 'bonus_pick': return `${name} is choosing 3 consonants and a vowel. R S T L N E are given.`;
      case 'bonus_solve': return `${name}, solve the puzzle!`;
      case 'bonus_end': return `The answer: ${esc(s.solution || '')}`;
      default: return '';
    }
  }

  function scoresHTML(s) {
    return `<div class="scores">${s.players.map(p => `
      <div class="score ${p.id === s.turnPid ? 'turn' : ''} ${p.connected ? '' : 'away'}" style="--color:${p.color}">
        <div class="pname"><span class="dot"></span>${esc(p.name)}</div><div class="pscore">${money(p.score)}</div>
        <div class="pbank">This round ${money(p.bank)}</div></div>`).join('')}</div>`;
  }

  GAMES.wheel.tv = {
    update(app, s, prev) {
      if (s.phase === 'end') { app.innerHTML = finalScoresTV(s, { fmt: money }); return; }
      ensureStage(app, s);
      if (s.spin && s.spin.id !== lastSpinId) {
        lastSpinId = s.spin.id;
        spinTo(s.spin.index, s.phase === 'spinning' && (!prev || prev.game === 'wheel'));
      }
      $('#wcat').innerHTML = `<small>${s.isBonus ? 'Bonus round' : `Round ${s.round} of ${s.rounds}`}</small><div>${esc(s.category)}</div>`;
      $('#pboard').innerHTML = boardHTML(s);
      $('#wmsg').innerHTML = `<div class="big">${esc(s.msg || '')}</div><div>${statusText(s)}</div>${['roundEnd', 'bonus_pick', 'bonus_solve', 'bonus_end'].includes(s.phase) ? bar(s.endsAt, s.windowMs) : ''}`;
      $('#called').innerHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c =>
        `<span class="cl ${s.called.includes(c) ? 'used' : ''}">${c}</span>`).join('');
      $('#wscores').innerHTML = scoresHTML(s);
    },
    sounds(a, b) {
      if (!a) return;
      const shown = st => st.words.flat().filter(t => t.letter && t.shown).length;
      if (b.called.length > a.called.length) sfx[shown(b) > shown(a) ? 'right' : 'wrong']();
      if (b.spin && (!a.spin || b.spin.id !== a.spin.id)) sfx.buzz();
      if ((b.phase === 'roundEnd' && a.phase !== 'roundEnd') || (b.bonus && b.bonus.won && !(a.bonus && a.bonus.won))) sfx.dd();
    },
  };
})();
