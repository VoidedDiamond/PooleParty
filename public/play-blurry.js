'use strict';
(() => {
  const mod = {};
  let sentRound = -1;
  mod.screen = (s, me) => {
    if (s.phase === 'question') {
      if (s.myAnswer || sentRound === s.round) {
        return { key: 'locked', html: `<div class="hero-check">${icon('check')}</div><p class="say">Locked in${s.myAnswer ? `: ${esc(s.myAnswer.name)}` : ''}</p>
          <p class="note">${(s.answeredIds || []).length} of ${s.players.filter(p => p.connected).length} answered.</p>` };
      }
      return { key: 'ask', html: `<p class="kicker">Round ${s.round} of ${s.rounds}</p><p class="say">What's the picture on the TV?</p>${bar(s.endsAt, s.windowMs)}
        <p class="note">One guess. The sooner you get it right, the more it's worth.</p>
        <div class="vlist">${s.options.map(o => `<button class="choice bl-opt" data-name="${esc(o.name)}"><span>${esc(o.name)}</span></button>`).join('')}</div>` };
    }
    if (s.phase === 'reveal') {
      const m = s.myAnswer;
      const v = !m ? { cls: 'miss', ic: 'x', t: 'Out of time' } : m.correct ? { cls: 'good', ic: 'check', t: `Correct! +${m.pts}` } : { cls: 'bad', ic: 'x', t: 'Not quite' };
      return { key: 'reveal', html: `<div class="verdict ${v.cls}">${icon(v.ic)}</div><p class="say">${v.t}</p>
        <p class="note">It was a ${esc(s.answer.name)} <span class="mf-emoji">${s.answer.e}</span></p>` };
    }
    return finalScoresPhone(s, me);
  };
  mod.wire = (key, s) => {
    if (key !== 'ask') return;
    document.querySelectorAll('.bl-opt').forEach(b => {
      b.onclick = async () => { sentRound = s.round; render(); if (await act('answer', { name: b.dataset.name })) { sentRound = -1; render(); } };
    });
  };
  GAMES.blurry.phone = mod;
})();
