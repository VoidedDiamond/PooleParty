'use strict';
(() => {
  const mod = {};
  // What's been typed on the keypad this round (kept across screen redraws).
  let typed = '';
  let typedRound = -1;
  let sent = false;

  const keypadHTML = () => `<div class="cb-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="cb-key" data-k="${n}">${n}</button>`).join('')}
    <button class="cb-key fn" data-k="del" aria-label="Delete">${icon('x')}</button><button class="cb-key" data-k="0">0</button>
    <button class="cb-key go" data-k="go" aria-label="Lock it in">${icon('check')}</button></div>`;

  mod.inputScreens = new Set(['pad']);

  mod.screen = (s, me) => {
    if (s.round !== typedRound) { typedRound = s.round; typed = ''; sent = false; }

    if (s.phase === 'show' || s.phase === 'guess') {
      if (s.myAnswer || sent) {
        const n = s.myAnswer ? s.myAnswer.n : typed;
        return { key: 'locked', html: `<p class="kicker">Locked in</p><div class="cb-locked">${esc(n)}</div>
          <p class="note">${(s.answeredIds || []).length} of ${s.players.filter(p => p.connected).length} answered. Exact and fast scores the most.</p>` };
      }
      return { key: 'pad', html: `<p class="kicker">Round ${s.round} of ${s.rounds}</p>
        <p class="say">${s.phase === 'show' ? 'Count the cubes on the TV!' : 'How many cubes?'}</p>
        ${bar(s.endsAt, s.windowMs)}
        <div class="cb-entry" id="cbEntry">${esc(typed) || '<span class="ph">0</span>'}</div>
        ${keypadHTML()}` };
    }

    if (s.phase === 'count') {
      return { key: 'count', html: `<p class="kicker">Counting…</p><p class="say">Watch the TV</p>
        ${s.myAnswer ? `<p class="note">You said</p><div class="cb-locked">${s.myAnswer.n}</div>` : '<p class="note">No answer this round.</p>'}` };
    }

    if (s.phase === 'reveal') {
      const m = s.myAnswer;
      const v = !m ? { cls: 'miss', ic: 'x', title: 'No answer', note: 'Too slow this round.' }
        : m.off === 0 ? { cls: 'good', ic: 'check', title: 'Exactly right!', note: `+${m.pts} points` }
          : m.pts ? { cls: 'good', ic: 'check', title: 'So close!', note: `Off by ${m.off}. +${m.pts} points` }
            : { cls: 'bad', ic: 'x', title: 'Not quite', note: `You said ${m.n}, off by ${m.off}.` };
      return { key: 'reveal', html: `<div class="verdict ${v.cls}">${icon(v.ic)}</div>
        <p class="say">${v.title}</p><p class="note">${esc(v.note)}</p>
        <p class="kicker">There were</p><div class="cb-locked">${s.count}</div>` };
    }

    return finalScoresPhone(s, me);
  };

  mod.wire = key => {
    if (key !== 'pad') return;
    const show = () => { const el = $('#cbEntry'); if (el) el.innerHTML = esc(typed) || '<span class="ph">0</span>'; };
    document.querySelectorAll('.cb-key').forEach(b => {
      b.onclick = async () => {
        const k = b.dataset.k;
        if (k === 'del') typed = typed.slice(0, -1);
        else if (k === 'go') {
          if (!typed) return;
          sent = true;
          render();
          if (await act('answer', { n: Number(typed) })) { sent = false; render(); }
          return;
        } else if (typed.length < 3) typed = (typed === '0' ? '' : typed) + k;
        show();
      };
    });
  };

  GAMES.cubes.phone = mod;
})();
