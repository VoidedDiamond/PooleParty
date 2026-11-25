'use strict';
// Phones for the brain-game races: Quick Math (a keypad) and Pop in Order (bubbles to tap).
(() => {
  // Screens whose key starts with 'play' keep what's being typed across broadcasts.
  const inputScreens = { has: k => String(k).startsWith('play') };

  const waitScreen = (s, how) => {
    if (s.phase === 'ready') return { key: 'ready', html: `<p class="kicker">Round ${s.round} of ${s.rounds} · ${esc(s.roundLabel)}</p><p class="say">Get ready…</p><p class="note">${how}</p>` };
    return null;
  };
  const resultsScreen = (s, me) => {
    if (s.phase !== 'results') return null;
    const r = s.me || { right: 0, wrong: 0, pts: 0 };
    const sorted = s.race.slice().sort((a, b) => b.pts - a.pts);
    const place = sorted.findIndex(x => x.id === me.id) + 1;
    return { key: 'results', html: `<div class="verdict ${place === 1 && r.pts > 0 ? 'good' : 'miss'}">${icon(place === 1 && r.pts > 0 ? 'crown' : 'check')}</div>
      <p class="say">${r.pts} points</p><p class="note">${r.right} right${r.wrong ? `, ${r.wrong} wrong` : ''}. ${place ? `You came ${['', '1st', '2nd', '3rd'][place] || `${place}th`} this round.` : ''}</p>` };
  };
  // A quick red flash when the last move was wrong.
  const flash = s => (s.me && s.me.last && !s.me.last.ok && serverNow() - s.me.last.at < 900 ? ' rc-wrong' : '');

  // ---- Quick Math ----
  const qm = { inputScreens };
  let typed = '', typedIdx = -1;
  qm.screen = (s, me) => {
    const w = waitScreen(s, 'Type the answers on the keypad. It checks as soon as you finish typing.') || resultsScreen(s, me);
    if (w) return w;
    if (s.phase !== 'play') return finalScoresPhone(s, me);
    const m = s.me;
    if (m.idx !== typedIdx) { typedIdx = m.idx; typed = ''; }
    return { key: `play:${m.idx}`, head: null, html: `<div class="rc-top"><span>${icon('check')} ${m.right}</span><b>${m.pts} pts</b></div>${bar(s.endsAt, s.windowMs)}
      <div class="qm-problem${flash(s)}">${esc(m.item.text)} =</div>
      <div class="cb-entry" id="qmEntry">${esc(typed) || '<span class="ph">?</span>'}</div>
      <div class="cb-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="cb-key" data-k="${n}">${n}</button>`).join('')}
        <button class="cb-key fn" data-k="del" aria-label="Delete">${icon('x')}</button><button class="cb-key" data-k="0">0</button>
        <button class="cb-key go" data-k="go" aria-label="Check">${icon('check')}</button></div>` };
  };
  qm.wire = (key, s) => {
    if (!key.startsWith('play')) return;
    const show = () => { const el = $('#qmEntry'); if (el) el.innerHTML = esc(typed) || '<span class="ph">?</span>'; };
    const submit = () => {
      if (!typed) return;
      const value = Number(typed);
      typed = '';
      show();
      act('move', { idx: s.me.idx, value });
    };
    document.querySelectorAll('.cb-key').forEach(b => {
      b.onclick = () => {
        if (serverNow() < (s.me.lockUntil || 0)) return; // frozen for a moment after a wrong answer
        const k = b.dataset.k;
        if (k === 'del') typed = typed.slice(0, -1);
        else if (k === 'go') { submit(); return; }
        else if (typed.length < 4) typed += k;
        show();
        if (typed.length >= s.me.item.digits) submit();
      };
    });
  };
  GAMES.quickmath.phone = qm;

  // ---- Pop in Order ----
  const pop = { inputScreens };
  pop.screen = (s, me) => {
    const w = waitScreen(s, 'Pop the bubbles from smallest to largest.') || resultsScreen(s, me);
    if (w) return w;
    if (s.phase !== 'play') return finalScoresPhone(s, me);
    const m = s.me;
    return { key: `play:${m.idx}:${m.step}:${m.last ? m.last.n : 0}`, html: `<div class="rc-top"><span>${icon('check')} ${m.right}</span><b>${m.pts} pts</b></div>${bar(s.endsAt, s.windowMs)}
      <p class="note">Smallest to largest</p>
      <div class="pp-area${flash(s)}">${m.item.bubbles.map((b, i) => `<button class="pp-bubble${b.popped ? ' popped' : ''}" data-b="${i}" style="left:${b.x}%;top:${b.y}%">${esc(b.label)}</button>`).join('')}</div>` };
  };
  pop.wire = (key, s) => {
    if (!key.startsWith('play')) return;
    document.querySelectorAll('.pp-bubble').forEach(b => {
      b.onclick = () => {
        if (b.classList.contains('popped')) return;
        if (serverNow() < (s.me.lockUntil || 0)) return;
        b.classList.add('popping');
        act('move', { idx: s.me.idx, bubble: Number(b.dataset.b) });
      };
    });
  };
  GAMES.popinorder.phone = pop;

  // ---- Odd One Out ----
  const odd = { inputScreens };
  odd.screen = (s, me) => {
    const w = waitScreen(s, 'Every picture is the same but one. Tap the odd one!') || resultsScreen(s, me);
    if (w) return w;
    if (s.phase !== 'play') return finalScoresPhone(s, me);
    const m = s.me;
    return { key: `play:${m.idx}:${m.last ? m.last.n : 0}`, html: `<div class="rc-top"><span>${icon('check')} ${m.right}</span><b>${m.pts} pts</b></div>${bar(s.endsAt, s.windowMs)}
      <p class="note">${esc(s.roundLabel)}</p>
      <div class="oo-grid${flash(s)}" style="--n:${m.item.size}">${m.item.cells.map((c, i) => `<button class="oo-cell" data-cell="${i}"><span class="${c.t || ''}">${c.e}</span></button>`).join('')}</div>` };
  };
  odd.wire = (key, s) => {
    if (!key.startsWith('play')) return;
    document.querySelectorAll('.oo-cell').forEach(b => {
      b.onclick = () => { if (serverNow() < (s.me.lockUntil || 0)) return; b.classList.add('popping'); act('move', { idx: s.me.idx, cell: Number(b.dataset.cell) }); };
    });
  };
  GAMES.oddoneout.phone = odd;

  // ---- Color Clash ----
  const INK = { red: '#ff4d4d', blue: '#4d9dff', green: '#3ccf6e', yellow: '#ffd43b', purple: '#b57bff', orange: '#ff922b' };
  const clash = { inputScreens };
  clash.screen = (s, me) => {
    const w = waitScreen(s, 'Tap the color of the INK, not what the word says.') || resultsScreen(s, me);
    if (w) return w;
    if (s.phase !== 'play') return finalScoresPhone(s, me);
    const m = s.me, it = m.item;
    const opts = it.options.map(o => (it.style === 'swatch'
      ? `<button class="cc-opt swatch" data-v="${o.name}" style="--c:${INK[o.name]}" aria-label="${o.name}"></button>`
      : `<button class="cc-opt" data-v="${o.name}" style="--c:${INK[o.ink]}">${o.name.toUpperCase()}</button>`)).join('');
    return { key: `play:${m.idx}`, html: `<div class="rc-top"><span>${icon('check')} ${m.right}</span><b>${m.pts} pts</b></div>${bar(s.endsAt, s.windowMs)}
      <p class="cc-ask ${it.ask}">Tap the ${it.ask === 'ink' ? '<b>INK</b> color' : '<b>WORD</b>'}</p>
      <div class="cc-word${flash(s)}" style="color:${INK[it.ink]}">${it.word.toUpperCase()}</div>
      <div class="cc-opts">${opts}</div>` };
  };
  clash.wire = (key, s) => {
    if (!key.startsWith('play')) return;
    document.querySelectorAll('.cc-opt').forEach(b => {
      b.onclick = () => { if (serverNow() < (s.me.lockUntil || 0)) return; act('move', { idx: s.me.idx, value: b.dataset.v }); };
    });
  };
  GAMES.colorclash.phone = clash;

  // Pick-one race screens (Clock Reader, Mirror or Not) share this shape.
  const pickScreen = (how, body, options) => {
    const mod = { inputScreens };
    mod.screen = (s, me) => {
      const w = waitScreen(s, how) || resultsScreen(s, me);
      if (w) return w;
      if (s.phase !== 'play') return finalScoresPhone(s, me);
      const m = s.me;
      return { key: `play:${m.idx}`, html: `<div class="rc-top"><span>${icon('check')} ${m.right}</span><b>${m.pts} pts</b></div>${bar(s.endsAt, s.windowMs)}
        <div class="${flash(s).trim()}">${body(m.item, s)}</div>
        <div class="pk-opts">${options(m.item).map(o => `<button class="pk-opt" data-v="${esc(o.v)}">${o.html}</button>`).join('')}</div>` };
    };
    mod.wire = (key, s) => {
      if (!key.startsWith('play')) return;
      document.querySelectorAll('.pk-opt').forEach(b => {
        b.onclick = () => { if (serverNow() < (s.me.lockUntil || 0)) return; act('move', { idx: s.me.idx, value: b.dataset.v }); };
      });
    };
    return mod;
  };

  // ---- Clock Reader ----
  function clockSVG(it) {
    const hand = (deg, len, w, cls) => `<line class="${cls}" x1="50" y1="50" x2="${50 + len * Math.sin(deg * Math.PI / 180)}" y2="${50 - len * Math.cos(deg * Math.PI / 180)}" stroke-width="${w}" stroke-linecap="round"/>`;
    const ticks = Array.from({ length: 60 }, (_, i) => {
      const a = i * 6 * Math.PI / 180, big = i % 5 === 0, r1 = big ? 40 : 43;
      return `<line x1="${50 + r1 * Math.sin(a)}" y1="${50 - r1 * Math.cos(a)}" x2="${50 + 46 * Math.sin(a)}" y2="${50 - 46 * Math.cos(a)}" stroke-width="${big ? 1.8 : .6}"/>`;
    }).join('');
    const nums = it.numbers ? Array.from({ length: 12 }, (_, i) => {
      const n = i + 1, a = n * 30 * Math.PI / 180;
      return `<text x="${50 + 33 * Math.sin(a)}" y="${50 - 33 * Math.cos(a) + 3.4}">${n}</text>`;
    }).join('') : '';
    return `<svg class="ck-face" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48"/><g class="ck-ticks">${ticks}</g>${nums}
      ${hand(((it.h % 12) + it.m / 60) * 30, 22, 4.5, 'ck-h')}${hand(it.m * 6, 36, 2.6, 'ck-m')}<circle cx="50" cy="50" r="2.6" class="ck-pin"/></svg>`;
  }
  GAMES.clock.phone = pickScreen('Read the clock and tap the time it shows.', it => clockSVG(it), it => it.options.map(o => ({ v: o, html: o })));

  // ---- Mirror or Not ----
  const tf = (deg, flip) => `transform:rotate(${deg}deg)${flip ? ' scaleX(-1)' : ''}`;
  GAMES.mirror.phone = pickScreen('Is the second picture the same one turned, or a mirror image?',
    it => `<div class="mr-pair"><span class="mr-pic" style="${tf(it.a, false)}">${it.e}</span><span class="mr-pic" style="${tf(it.b, it.mirror)}">${it.e}</span></div>`,
    () => [{ v: 'same', html: `${icon('rotate-ccw')} Same, turned` }, { v: 'mirror', html: '⇋ Mirror image' }]);

  // ---- Coin Count ----
  const COIN = { 1: ['1¢', 'copper', 0.82], 5: ['5¢', 'silver', 0.95], 10: ['10¢', 'silver', 0.78], 25: ['25¢', 'silver', 1.08], 50: ['50¢', 'silver', 1.25] };
  const cc = { inputScreens };
  let ctyped = '', ctIdx = -1;
  cc.screen = (s, me) => {
    const w = waitScreen(s, 'Add up the coins and type the total in cents.') || resultsScreen(s, me);
    if (w) return w;
    if (s.phase !== 'play') return finalScoresPhone(s, me);
    const m = s.me;
    if (m.idx !== ctIdx) { ctIdx = m.idx; ctyped = ''; }
    return { key: `play:${m.idx}`, html: `<div class="rc-top"><span>${icon('check')} ${m.right}</span><b>${m.pts} pts</b></div>${bar(s.endsAt, s.windowMs)}
      <div class="co-pile${flash(s)}">${m.item.coins.map(c => `<span class="co ${COIN[c][1]}" style="--s:${COIN[c][2]}">${COIN[c][0]}</span>`).join('')}</div>
      <div class="cb-entry" id="coEntry">${esc(ctyped) || '<span class="ph">?</span>'}<small>¢</small></div>
      <div class="cb-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="cb-key" data-k="${n}">${n}</button>`).join('')}
        <button class="cb-key fn" data-k="del" aria-label="Delete">${icon('x')}</button><button class="cb-key" data-k="0">0</button>
        <button class="cb-key go" data-k="go" aria-label="Check">${icon('check')}</button></div>` };
  };
  cc.wire = (key, s) => {
    if (!key.startsWith('play')) return;
    const show = () => { const el = $('#coEntry'); if (el) el.innerHTML = `${esc(ctyped) || '<span class="ph">?</span>'}<small>¢</small>`; };
    const submit = () => { if (!ctyped) return; const value = Number(ctyped); ctyped = ''; show(); act('move', { idx: s.me.idx, value }); };
    document.querySelectorAll('.cb-key').forEach(b => {
      b.onclick = () => {
        if (serverNow() < (s.me.lockUntil || 0)) return;
        const k = b.dataset.k;
        if (k === 'del') ctyped = ctyped.slice(0, -1);
        else if (k === 'go') { submit(); return; }
        else if (ctyped.length < 4) ctyped += k;
        show();
        if (ctyped.length >= s.me.item.digits) submit();
      };
    });
  };
  GAMES.coins.phone = cc;
})();
