'use strict';
(() => {
  const mod = {};
  let sentRound = -1;

  const askWord = s => (s.ask === 'lightest' ? 'lightest' : 'heaviest');

  mod.screen = (s, me) => {
    if (s.phase === 'question') {
      if (s.myAnswer || sentRound === s.round) {
        const pick = s.myAnswer && s.shapes.find(x => x.id === s.myAnswer.shape);
        return { key: 'locked', html: `<p class="kicker">Locked in</p>
          ${pick ? `<div class="sc-pick">${shapeSVG(pick.id, pick.color)}</div><p class="say">${esc(shapeName(pick.id))}</p>` : ''}
          <p class="note">${(s.answeredIds || []).length} of ${s.players.filter(p => p.connected).length} answered.</p>` };
      }
      return { key: 'ask', html: `<p class="kicker">Round ${s.round} of ${s.rounds}</p>
        <p class="say">Which is the <span class="sc-ask ${s.ask}">${askWord(s)}</span>?</p>${bar(s.endsAt, s.windowMs)}
        <p class="note">Look at the seesaws on the TV.</p>
        <div class="sc-choices n${s.shapes.length}">${s.shapes.map(x => `<button class="sc-choice" data-shape="${x.id}">${shapeSVG(x.id, x.color)}<span>${esc(shapeName(x.id))}</span></button>`).join('')}</div>` };
    }

    if (s.phase === 'reveal') {
      const m = s.myAnswer;
      const ans = s.shapes.find(x => x.id === s.answer);
      const v = !m ? { cls: 'miss', ic: 'x', title: 'Out of time', note: 'No answer this round.' }
        : m.correct ? { cls: 'good', ic: 'check', title: 'Correct!', note: `+${m.pts} points` }
          : { cls: 'bad', ic: 'x', title: 'Not quite', note: `You picked the ${m.shape}.` };
      return { key: 'reveal', html: `<div class="verdict ${v.cls}">${icon(v.ic)}</div>
        <p class="say">${v.title}</p><p class="note">${esc(v.note)}</p>
        <p class="kicker">The ${askWord(s)} was</p>
        ${ans ? `<div class="sc-pick">${shapeSVG(ans.id, ans.color)}</div><p class="say">${esc(shapeName(ans.id))}</p>` : ''}` };
    }

    return finalScoresPhone(s, me);
  };

  mod.wire = (key, s) => {
    if (key !== 'ask') return;
    document.querySelectorAll('.sc-choice').forEach(b => {
      b.onclick = async () => {
        sentRound = s.round;
        render();
        if (await act('answer', { shape: b.dataset.shape })) { sentRound = -1; render(); }
      };
    });
  };

  GAMES.scales.phone = mod;
})();
