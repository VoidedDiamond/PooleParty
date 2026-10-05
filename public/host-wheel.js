'use strict';
(() => {
  const STEP = 360 / 16;
  const COLORS = ['#ff5a5f', '#ffc53d', '#3b82f6', '#22c55e', '#f97316', '#a855f7'];
  let rot = 0;
  let lastSpinId = null;
  let wheelEl = null;

  const polar = (r, deg) => [r * Math.sin(deg * Math.PI / 180), -r * Math.cos(deg * Math.PI / 180)];

  // Labels are stacked one character per line from the rim toward the hub, each character upright
  // relative to its wedge (like the real wheel), so whichever wedge stops under the pointer reads
  // straight up and down.
  function buildWheel(wedges) {
    const n = wedges.length;
    const step = 360 / n;
    const f = v => v.toFixed(2);
    let paths = '';
    let labels = '';
    let pegs = '';
    wedges.forEach((w, i) => {
      const c = i * step;
      const [x1, y1] = polar(96, c - step / 2);
      const [x2, y2] = polar(96, c + step / 2);
      const fill = w.kind === 'bankrupt' ? '#15131c' : w.kind === 'lose' ? '#f1f3f5' : COLORS[i % COLORS.length];
      const ink = w.kind === 'lose' ? '#15131c' : '#fff';
      const label = w.kind === 'bankrupt' ? 'BANKRUPT' : w.kind === 'lose' ? 'LOSE TURN' : w.label.replace('$', '');
      paths += `<path d="M0 0 L${f(x1)} ${f(y1)} A96 96 0 0 1 ${f(x2)} ${f(y2)} Z" fill="${fill}"/>`;
      const chars = [...label];
      const size = chars.length > 5 ? 7.4 : 10.5;
      const pitch = size * (chars.length > 5 ? .96 : .92);
      chars.forEach((ch, k) => {
        if (ch === ' ') return;
        const [x, y] = polar(85 - size / 2 - k * pitch, c);
        labels += `<text x="${f(x)}" y="${f(y)}" transform="rotate(${f(c)} ${f(x)} ${f(y)})" fill="${ink}" font-size="${size}">${esc(ch)}</text>`;
      });
      const [px, py] = polar(92.5, c - step / 2);
      pegs += `<circle cx="${f(px)}" cy="${f(py)}" r="1.5"/>`;
    });
    return `<svg viewBox="-100 -100 200 200" class="wheel-svg">
      <circle r="99" fill="#fff"/>${paths}
      <g class="wheel-dividers" stroke="rgba(255,255,255,.9)" stroke-width=".7">${wedges.map((_, i) => { const [x, y] = polar(96, i * step - step / 2); return `<line x1="0" y1="0" x2="${f(x)}" y2="${f(y)}"/>`; }).join('')}</g>
      <g class="wheel-labels" text-anchor="middle" dominant-baseline="central" font-family="Fredoka, Nunito, sans-serif" font-weight="700">${labels}</g>
      <g class="wheel-pegs" fill="#ffe7a3" stroke="rgba(0,0,0,.35)" stroke-width=".4">${pegs}</g>
      <circle r="13" fill="#fff"/><circle r="9.5" fill="#ffc53d"/><circle r="3" fill="#fff" opacity=".7"/></svg>`;
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
    if (animate) spinClicks();
  }

  // The pointer clicks past each wedge: read the wheel's actual angle every frame while it spins.
  let clickRaf = null;
  function spinClicks() {
    cancelAnimationFrame(clickRaf);
    const until = performance.now() + 4200;
    let last = null;
    const frame = () => {
      if (!wheelEl || !wheelEl.isConnected || performance.now() > until) return;
      const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(wheelEl).transform);
      if (m) {
        const [a, b] = m[1].split(',').map(Number);
        const seg = Math.floor(((Math.atan2(b, a) * 180 / Math.PI + 360) % 360) / STEP);
        if (last !== null && seg !== last) sfx.click(0.8);
        last = seg;
      }
      clickRaf = requestAnimationFrame(frame);
    };
    clickRaf = requestAnimationFrame(frame);
  }

  // Letters that just turned over (compared with the previous state of the same puzzle) flip in.
  function boardHTML(s, prev) {
    const before = prev && prev.category === s.category && prev.round === s.round && prev.isBonus === s.isBonus ? prev.words : null;
    return s.words.map((w, wi) => `<div class="pword">${w.map((t, li) => {
      if (!t.letter) return `<span class="tp">${esc(t.ch)}</span>`;
      const was = before && before[wi] && before[wi][li];
      const flip = t.shown && was && !was.shown ? ' flip' : '';
      return `<span class="tl${t.shown ? ' on' : ''}${flip}" style="animation-delay:${flip ? (wi * 7 + li) * 60 : 0}ms">${t.shown ? t.ch : ''}</span>`;
    }).join('')}</div>`).join('');
  }

  function statusText(s) {
    const p = findPlayer(s, s.turnPid);
    const name = p ? esc(p.name) : '';
    switch (s.phase) {
      case 'turn': return `${name}: spin, buy a vowel, or solve`;
      case 'spinning': return `${name} is spinning...`;
      case 'consonant': return `${name} is calling a consonant`;
      case 'vowel': return `${name} is buying a vowel`;
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
      $('#pboard').innerHTML = boardHTML(s, prev);
      $('#wmsg').innerHTML = `<div class="big">${esc(s.msg || '')}</div><div>${statusText(s)}</div>${['roundEnd', 'bonus_pick', 'bonus_solve', 'bonus_end'].includes(s.phase) ? bar(s.endsAt, s.windowMs) : ''}`;
      $('#called').innerHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c =>
        `<span class="cl${'AEIOU'.includes(c) ? ' vowel' : ''}${s.called.includes(c) ? ' used' : ''}">${c}</span>`).join('');
      $('#wscores').innerHTML = scoresHTML(s);
    },
    sounds(a, b) {
      if (!a) return;
      const shown = st => st.words.flat().filter(t => t.letter && t.shown).length;
      if (b.called.length > a.called.length) {
        const n = shown(b) - shown(a);
        if (n > 0) for (let i = 0; i < Math.min(n, 6); i++) setTimeout(() => sfx.flip(), i * 140);
        else sfx.wrong();
      }
      if (b.msg && b.msg !== a.msg) {
        if (/BANKRUPT/.test(b.msg)) sfx.bankrupt();
        else if (/lost a turn/.test(b.msg)) sfx.lose();
      }
      if ((b.phase === 'roundEnd' && a.phase !== 'roundEnd') || (b.bonus && b.bonus.won && !(a.bonus && a.bonus.won))) { sfx.kaching(); sfx.applause(1.8); }
    },
  };
})();
