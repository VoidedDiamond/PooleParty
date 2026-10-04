'use strict';
(() => {
  const mod = {};
  mod.inputScreens = new Set(['ddwager', 'fwager', 'fanswer', 'answer']);

  const choicesHTML = choices => `<div class="choices">${choices.map((c, i) =>
    `<button class="choice" data-choice="${i}">${esc(c)}</button>`).join('')}</div>`;

  mod.screen = (s, me) => {
    const c = s.current;
    const isCtl = s.controllerId === me.id;
    const f = s.final;
    const fe = f && f.entries.find(e => e.id === me.id);

    // The clue itself, for whoever is holding a phone instead of looking at the TV.
    const clueLine = c && c.clue ? `<p class="kicker">${esc(c.category)} · ${money(c.value)}</p><p class="qtext">${esc(c.clue)}</p>` : '';

    switch (s.phase) {
      case 'board': {
        if (isCtl) return { key: 'pick', html: `<p class="say">Your pick</p>${bar(s.boardEndsAt, s.boardWindowMs)}${boardHTML(s, { pick: true })}` };
        const ctl = findPlayer(s, s.controllerId);
        return { key: 'wait-pick', html: `<p class="say">${esc(ctl ? ctl.name : 'Someone')} is picking</p><p class="note">Watch the TV.</p>` };
      }
      case 'clue': {
        if (c.stage === 'wager') {
          if (!isCtl) {
            const ctl = findPlayer(s, s.controllerId);
            return { key: 'ddwait', html: `<p class="say">Daily Double</p><p class="note">${esc(ctl ? ctl.name : 'A player')} is choosing a wager.</p>` };
          }
          return { key: 'ddwager', html: `<p class="say">Daily Double</p>${bar(c.endsAt, c.windowMs)}
            <p class="note">Wager between $5 and ${money(c.wagerMax)}.</p>
            <input id="wager" type="number" inputmode="numeric" min="5" max="${c.wagerMax}" placeholder="Wager" value="${esc(draft.wager)}">
            <div class="row"><button class="ghost" data-fill="5">Min</button><button class="ghost" data-fill="${c.wagerMax}">Max</button></div>
            <button id="sendwager" class="primary">Lock in wager</button>` };
        }
        if (c.stage === 'answering') {
          if (c.buzzedId === me.id) {
            if (c.choices) return { key: 'choose', html: `${clueLine}${bar(c.endsAt, c.windowMs)}${choicesHTML(c.choices)}` };
            return { key: 'answer', html: `<p class="say">${c.dd ? 'Daily Double' : 'You buzzed in!'}</p>${clueLine}${bar(c.endsAt, c.windowMs)}
              <input id="answer" type="text" maxlength="80" autocomplete="off" autocapitalize="off" placeholder="Type your answer" value="${esc(draft.answer)}">
              <button id="sendanswer" class="primary">Submit answer</button>` };
          }
          const who = findPlayer(s, c.buzzedId);
          return { key: 'other', html: `${clueLine}<button class="buzz" disabled>${esc(who ? who.name : 'Someone')} is answering</button>` };
        }
        if (c.stage === 'revealed') return revealedScreen(s, me, c);
        if (c.dd) return { key: 'ddwatch', html: '<p class="say">Daily Double</p><p class="note">Watch the TV.</p>' };
        if (c.lockedOut.includes(me.id)) return { key: 'out', html: `${clueLine}<button class="buzz out" disabled>Locked out</button>` };
        if (c.stage === 'open') return { key: 'open', html: `${clueLine}<button class="buzz ready" id="buzz">BUZZ</button>` };
        return { key: 'read', html: `${clueLine}<button class="buzz" id="buzz">Wait for it…</button>` };
      }
      case 'final_wager':
        if (!fe) return { key: 'fwatch', html: `<p class="say">Final Jeopardy</p><p class="note">Category: ${esc(f.category)}. You need a positive score to play. Watch the TV.</p>` };
        if (fe.wagerLocked) return { key: 'fwlocked', html: '<p class="say">Wager locked in</p><p class="note">Waiting for the others.</p>' };
        return { key: 'fwager', html: `<p class="say">Final Jeopardy</p>${bar(f.endsAt, f.windowMs)}
          <p class="note">Category: ${esc(f.category)}. Wager between $0 and ${money(me.score)}.</p>
          <input id="wager" type="number" inputmode="numeric" min="0" max="${me.score}" placeholder="Wager" value="${esc(draft.wager)}">
          <div class="row"><button class="ghost" data-fill="0">$0</button><button class="ghost" data-fill="${me.score}">All in</button></div>
          <button id="sendfwager" class="primary">Lock in wager</button>` };
      case 'final_answer':
        if (!fe) return { key: 'fwatch2', html: '<p class="say">Final Jeopardy</p><p class="note">Watch the TV.</p>' };
        if (fe.answerLocked) return { key: 'falocked', html: '<p class="say">Answer locked in</p><p class="note">Waiting for the others.</p>' };
        if (f.choices) return { key: 'fchoose', html: `<p class="say">${esc(f.category)}</p>${bar(f.endsAt, f.windowMs)}${choicesHTML(f.choices)}` };
        return { key: 'fanswer', html: `<p class="say">${esc(f.category)}</p>${bar(f.endsAt, f.windowMs)}
          <input id="answer" type="text" maxlength="80" autocomplete="off" autocapitalize="off" placeholder="Type your answer" value="${esc(draft.answer)}">
          <button id="sendfanswer" class="primary">Lock in answer</button>` };
      case 'final_judge': return { key: 'fjudge', html: '<p class="say">Judging</p><p class="note">Watch the TV.</p>' };
      case 'end': return finalScoresPhone(s, me, { fmt: money });
    }
    return { key: 'x', html: '' };
  };

  function revealedScreen(s, me, c) {
    const ch = c.challenge;
    if (ch && !ch.result) {
      if (ch.pid === me.id) return { key: 'chwait', html: '<p class="say">Challenge sent</p><p class="note">The other players are voting.</p>' };
      if (ch.voters.includes(me.id) && !ch.youVoted) {
        const who = findPlayer(s, ch.pid);
        const r = c.rulings.filter(x => x.pid === ch.pid).pop();
        return { key: 'chvote', html: `<p class="say">${esc(who ? who.name : 'A player')} challenges</p>
          <p class="note">They answered "${esc(r ? r.guess : '')}". The answer was:</p><p class="say">${esc(c.answer)}</p>
          <p class="note">Should it count as correct?</p>
          <div class="row"><button class="primary" data-vote="1">Yes, count it</button><button class="ghost" data-vote="0">No</button></div>` };
      }
      return { key: 'chwait2', html: '<p class="note">Vote counted. Waiting for the result.</p>' };
    }
    const mine = c.rulings.filter(r => r.pid === me.id).pop();
    let extra = '';
    if (c.challengeable.includes(me.id) && !c.challenge && mine) {
      extra = `<p class="note">You answered "${esc(mine.guess || 'nothing')}".</p>
        <button class="primary" id="challenge">Challenge: I was right</button>
        <p class="note">If the others reject it, you lose half the clue's value.</p>`;
    }
    if (ch && ch.result) extra += `<p class="note">${ch.result === 'accepted' ? 'Challenge accepted.' : `Challenge rejected${ch.pid === me.id ? `: you lose ${money(ch.penalty)}` : ''}.`}</p>`;
    return { key: 'rev', html: `<p class="note">The answer</p><p class="say">${esc(c.answer)}</p>${extra}` };
  }

  mod.wire = (key, s) => {
    const buzz = $('#buzz');
    if (buzz) buzz.addEventListener('pointerdown', async e => {
      e.preventDefault();
      if (navigator.vibrate) navigator.vibrate(25);
      await act('buzz');
    });
    document.querySelectorAll('.tile[data-act="pick"]').forEach(b => {
      b.onclick = () => act('pick', { ci: Number(b.dataset.ci), ri: Number(b.dataset.ri) });
    });
    document.querySelectorAll('.choice').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('.choice').forEach(x => { x.disabled = true; });
        act(s.phase === 'clue' ? 'answer' : 'finalAnswer', { choice: Number(b.dataset.choice) });
      };
    });
    document.querySelectorAll('[data-vote]').forEach(b => { b.onclick = () => act('challengeVote', { yes: b.dataset.vote === '1' }); });
    if ($('#challenge')) $('#challenge').onclick = () => act('challenge');

    const wager = wireInput('wager', 'wager');
    if (wager) document.querySelectorAll('[data-fill]').forEach(b => { b.onclick = () => { wager.value = b.dataset.fill; draft.wager = wager.value; }; });
    if ($('#sendwager')) $('#sendwager').onclick = async () => { if (!(await act('wager', { amount: draft.wager }))) draft.wager = ''; };
    if ($('#sendfwager')) $('#sendfwager').onclick = async () => { if (!(await act('finalWager', { amount: draft.wager }))) draft.wager = ''; };

    const ans = wireInput('answer', 'answer');
    const send = type => async () => { if (!(await act(type, { text: draft.answer }))) draft.answer = ''; };
    if ($('#sendanswer')) { $('#sendanswer').onclick = send('answer'); onEnter(ans, send('answer')); }
    if ($('#sendfanswer')) { $('#sendfanswer').onclick = send('finalAnswer'); onEnter(ans, send('finalAnswer')); }
  };

  GAMES.jeopardy.phone = mod;
})();
