'use strict';
(() => {
  const mod = {};
  let sentRound = -1;

  mod.screen = (s, me) => {
    if (s.phase === 'show') {
      return { key: 'watch', html: `<p class="kicker">Round ${s.round} of ${s.rounds}</p><p class="say">Remember the pictures on the TV!</p>${bar(s.endsAt, s.windowMs)}` };
    }
    if (s.phase === 'question') {
      if (s.myAnswer || sentRound === s.round) {
        return { key: 'locked', html: `<div class="hero-check">${icon('check')}</div><p class="say">Locked in</p>
          <p class="note">${(s.answeredIds || []).length} of ${s.players.filter(p => p.connected).length} answered.</p>` };
      }
      if (s.kind === 'where') {
        return { key: 'where', html: `<p class="kicker">Round ${s.round} of ${s.rounds}</p>
          <p class="say">Where was the <span class="mf-emoji">${s.ask.e}</span> ${esc(s.ask.name)}?</p>${bar(s.endsAt, s.windowMs)}
          <div class="mf-pgrid" style="--cols:${s.cols}">${Array.from({ length: s.cols * s.rows }, (_, i) => `<button class="mf-cell" data-cell="${i}">?</button>`).join('')}</div>` };
      }
      return { key: 'what', html: `<p class="kicker">Round ${s.round} of ${s.rounds}</p>
        <p class="say">What was in the glowing spot on the TV?</p>${bar(s.endsAt, s.windowMs)}
        <div class="mf-opts">${(s.options || []).map(o => `<button class="mf-opt" data-name="${esc(o.name)}"><span class="mf-emoji big">${o.e}</span><span>${esc(o.name)}</span></button>`).join('')}</div>` };
    }
    if (s.phase === 'reveal') {
      const m = s.myAnswer;
      const v = !m ? { cls: 'miss', ic: 'x', title: 'Out of time' } : m.correct ? { cls: 'good', ic: 'check', title: `Correct! +${m.pts}` } : { cls: 'bad', ic: 'x', title: 'Not quite' };
      const ans = s.kind === 'where' ? `The ${esc(s.ask.name)} is lit up on the TV.` : `It was the <span class="mf-emoji">${s.answer.e}</span> ${esc(s.answer.name)}.`;
      return { key: 'reveal', html: `<div class="verdict ${v.cls}">${icon(v.ic)}</div><p class="say">${v.title}</p><p class="note">${ans}</p>` };
    }
    return finalScoresPhone(s, me);
  };

  mod.wire = (key, s) => {
    const send = async payload => {
      sentRound = s.round;
      render();
      if (await act('answer', payload)) { sentRound = -1; render(); }
    };
    if (key === 'where') document.querySelectorAll('.mf-cell').forEach(b => { b.onclick = () => send({ cell: Number(b.dataset.cell) }); });
    if (key === 'what') document.querySelectorAll('.mf-opt').forEach(b => { b.onclick = () => send({ name: b.dataset.name }); });
  };

  GAMES.memory.phone = mod;
})();
