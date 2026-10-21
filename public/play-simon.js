'use strict';
(() => {
  const PADS = [['#ff5d5d', '▲'], ['#4fa8ff', '●'], ['#ffd43b', '■'], ['#51cf66', '★']];
  const mod = { inputScreens: new Set(['repeat']) };
  let taps = [], tapRound = -1, sent = -1;

  mod.screen = (s, me) => {
    if (s.round !== tapRound) { tapRound = s.round; taps = []; }
    if (s.phase === 'watch') return { key: 'watch', html: `<p class="kicker">Round ${s.round} of ${s.rounds}</p><p class="say">Watch the TV!</p><p class="note">${s.length} steps to remember.</p>` };
    if (s.phase === 'repeat') {
      if (s.myAnswer || sent === s.round) return { key: 'locked', html: `<div class="hero-check">${icon('check')}</div><p class="say">Locked in</p><p class="note">${(s.answeredIds || []).length} of ${s.players.filter(p => p.connected).length} done.</p>` };
      return { key: 'repeat', html: `<p class="kicker">Round ${s.round} of ${s.rounds}</p><p class="say">Repeat the pattern</p>${bar(s.endsAt, s.windowMs)}
        <div class="sm-progress" id="smProg">${Array.from({ length: s.length }, (_, i) => `<i class="${i < taps.length ? 'on' : ''}"></i>`).join('')}</div>
        <div class="sm-pads phone">${PADS.map(([c, sym], i) => `<button class="sm-pad" data-pad="${i}" style="--c:${c}"><span>${sym}</span></button>`).join('')}</div>
        <button class="ghost big" id="smUndo">${icon('rotate-ccw')} Undo last</button>` };
    }
    if (s.phase === 'reveal') {
      const m = s.myAnswer;
      const v = !m ? { cls: 'miss', ic: 'x', t: 'Out of time' } : m.correct ? { cls: 'good', ic: 'check', t: `Perfect! +${m.pts}` } : { cls: 'bad', ic: 'x', t: `Slipped at step ${m.upTo + 1}` };
      return { key: 'reveal', html: `<div class="verdict ${v.cls}">${icon(v.ic)}</div><p class="say">${v.t}</p><p class="note">The full pattern is on the TV.</p>` };
    }
    return finalScoresPhone(s, me);
  };

  mod.wire = (key, s) => {
    if (key !== 'repeat') return;
    const prog = () => { const el = $('#smProg'); if (el) el.innerHTML = Array.from({ length: s.length }, (_, i) => `<i class="${i < taps.length ? 'on' : ''}"></i>`).join(''); };
    document.querySelectorAll('.sm-pad').forEach(b => {
      b.onclick = async () => {
        if (taps.length >= s.length) return;
        taps.push(Number(b.dataset.pad));
        b.classList.add('lit');
        setTimeout(() => b.classList.remove('lit'), 180);
        prog();
        if (taps.length === s.length) {
          sent = s.round;
          render();
          if (await act('answer', { seq: taps })) { sent = -1; taps = []; render(); }
        }
      };
    });
    if ($('#smUndo')) $('#smUndo').onclick = () => { taps.pop(); prog(); };
  };

  GAMES.simon.phone = mod;
})();
