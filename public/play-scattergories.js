'use strict';
(() => {
  const mod = {};
  mod.inputScreens = new Set(['sgwrite']);
  let draftAnswers = [];
  let draftForEndsAt = null; // which round's writing timer the draft/submitted flags apply to
  let challenged = new Set();
  let autoSubmitTimer = null;
  let submitted = false;
  let lastDraftSync = 0;
  let visHooked = false;

  // Streams the draft to the server as the player types (throttled), so the last thing they
  // typed is already saved there even if their phone locks/backgrounds before the timer ends —
  // a client-side setTimeout can't be trusted to fire once the tab isn't visible.
  function syncDraft(force) {
    const now = Date.now();
    if (!force && now - lastDraftSync < 600) return;
    lastDraftSync = now;
    send(socket, 'updateDraft', { answers: draftAnswers });
  }

  mod.screen = (s, me) => {
    if (s.phase === 'writing') {
      // Each round gets a fresh writing timer (endsAt); a new one means a new round started, so
      // last round's draft text and submitted flag no longer apply.
      if (s.endsAt !== draftForEndsAt) { draftForEndsAt = s.endsAt; draftAnswers = s.categories.map(() => ''); submitted = false; }
      if (s.mySubmitted) {
        return { key: 'sgwait', html: `<p class="say">Answers locked in!</p><p class="note">Waiting for everyone else (${s.doneCount}/${s.totalCount} done)…</p>` };
      }
      const rows = s.categories.map((c, i) => `<div class="sg-field">
        <label>${i + 1}. ${esc(c)}</label>
        <input type="text" data-i="${i}" maxlength="40" autocomplete="off" placeholder="${esc(s.letter)}…" value="${esc(draftAnswers[i] || '')}">
      </div>`).join('');
      return { key: 'sgwrite', html: `<div class="sg-letterline"><span class="sg-die small">${esc(s.letter)}</span><span>Every answer starts with <b>${esc(s.letter)}</b></span></div>${bar(s.endsAt, s.windowMs)}
        <div class="sg-form">${rows}</div>
        <button class="primary" id="sgsubmit">Submit answers</button>` };
    }

    if (s.phase === 'judging') {
      challenged = challenged.id === s.catIdx ? challenged : new Set();
      challenged.id = s.catIdx;
      const rows = (s.entries || []).map(e => {
        if (e.mine) return `<div class="sg-prow"><span>${esc(e.text)}</span><span class="note">(yours)</span></div>`;
        const done = e.challengedByMe || challenged.has(e.pid);
        return `<div class="sg-prow"><span>${esc(e.text)}</span>
          <button class="ghost sg-challenge ${done ? 'sel' : ''}" data-target="${e.pid}" ${done ? 'disabled' : ''}>${done ? 'Challenged' : 'Challenge'}</button></div>`;
      }).join('');
      const agreeBtn = s.myResponded
        ? `<p class="note">Waiting on everyone else (${s.respondedCount}/${s.voterCount})…</p>`
        : `<button class="ghost big" id="sgagree">No challenge from me — move on</button>`;
      return { key: 'sgjudge', html: `<p class="kicker">Category ${s.catIdx + 1} of ${s.categories.length}</p><p class="say">${esc(s.category)}</p><p class="note">Flag any answer that shouldn't count.</p>
        ${rows || '<p class="note">No answers to judge.</p>'}${bar(s.endsAt, s.windowMs)}
        ${agreeBtn}` };
    }

    if (s.phase === 'catResult') {
      const rows = (s.verdicts || []).map(v => `<div class="sg-prow ${v.valid ? 'ok' : 'no'}">
        <span>${esc(v.name)}: ${esc(v.text)}</span><span>${v.valid ? `+${v.points}` : 'out'}</span></div>`).join('');
      return { key: 'sgresult', html: `<p class="say">${esc(s.category)}</p>${rows}` };
    }

    if (s.phase === 'roundEnd') {
      return { key: 'sground', html: `<p class="say">Round ${s.round} of ${s.rounds} done</p><p class="note">Next round starting soon…</p>` };
    }

    return finalScoresPhone(s, me);
  };

  mod.wire = (key, s) => {
    if (key === 'sgwrite') {
      document.querySelectorAll('.sg-field input').forEach(inp => {
        inp.oninput = () => { draftAnswers[Number(inp.dataset.i)] = inp.value; syncDraft(false); };
        inp.onblur = () => syncDraft(true);
      });
      const doSubmit = () => {
        if (submitted) return;
        submitted = true;
        clearTimeout(autoSubmitTimer);
        act('submitAnswers', { answers: draftAnswers });
      };
      if ($('#sgsubmit')) $('#sgsubmit').onclick = doSubmit;
      // Most players won't click "Submit" before time runs out — auto-submit whatever they've
      // typed so far right as the clock hits zero, instead of losing it. This is a nice-to-have:
      // the real safety net is that syncDraft() has already been streaming the draft to the
      // server on every keystroke, so the round is scored off that even if this timer never
      // fires (e.g. the phone's screen locked and the browser paused this timeout).
      clearTimeout(autoSubmitTimer);
      if (s && s.endsAt) {
        const remain = s.endsAt - serverNow();
        autoSubmitTimer = setTimeout(doSubmit, Math.max(0, remain + 150));
      }
      if (!visHooked) { visHooked = true; document.addEventListener('visibilitychange', () => { if (document.hidden) syncDraft(true); }); }
    }
    if (key === 'sgjudge') {
      document.querySelectorAll('.sg-challenge').forEach(b => {
        b.onclick = async () => {
          const target = b.dataset.target;
          if (!(await act('challenge', { target }))) { challenged.add(target); render(); }
        };
      });
      if ($('#sgagree')) $('#sgagree').onclick = () => act('agree');
    }
  };

  GAMES.scattergories.phone = mod;
})();
