'use strict';
(() => {
  const mod = {};
  mod.inputScreens = new Set();

  const RESULT = { 1: '+1', 3: '+3', skip: 'Pass −1', no: 'NO! −1', '1+no': '+1, NO! −1' };

  const cardHTML = c => `<div class="ncard">
    <div class="ncard-row"><span class="ncard-pts">1</span><span class="ncard-word${c.stage === 'three' ? ' done' : ''}">${esc(c.one)}</span></div>
    ${c.three ? `<div class="ncard-row three"><span class="ncard-pts">3</span><span class="ncard-word">${esc(c.three)}</span></div>` : ''}
    ${c.ban && c.ban.length ? `<div class="ncard-ban"><b>Don't say</b>${c.ban.map(w => `<span>${esc(w)}</span>`).join('')}</div>` : ''}
  </div>`;

  const noButton = s => `<button class="nno" id="nno" data-card="${s.cardSeq}">NO!</button>`;
  const teamName = (s, t) => (s.teams && s.teams[t] ? s.teams[t].name : '');

  mod.screen = (s, me) => {
    const poet = findPlayer(s, s.poetId);
    const isPoet = s.poetId === me.id;
    const teams = s.mode === 'teams';
    const mySide = teams && s.myTeam === s.poetTeam;

    if (s.phase === 'end') {
      if (!teams) return finalScoresPhone(s, me);
      const [a, b] = s.teams;
      const tie = a.score === b.score;
      const w = a.score > b.score ? a : b;
      return { key: 'nend', html: `<p class="kicker">Game over</p><p class="say">${tie ? "It's a tie!" : w.id === s.myTeam ? 'Your team wins!' : `${esc(w.name)} wins`}</p>
        <ol class="ranking">${[...s.teams].sort((x, y) => y.score - x.score).map((t, i) => `<li class="${t.id === s.myTeam ? 'me-row' : ''}" style="--color:${t.color}">
          <span class="place">${tie ? 1 : i + 1}</span><span class="name">${esc(t.name)}</span><b>${t.score}</b></li>`).join('')}</ol>` };
    }

    if (s.phase === 'ready') {
      if (isPoet) {
        return { key: 'nready-poet', html: `<p class="kicker">You're the Poet${teams ? ` for ${esc(teamName(s, s.poetTeam))}` : ''}</p>
          <p class="say">90 seconds. As many cards as you can.</p>
          <ul class="nrules"><li>One-syllable words only</li><li>No word (or part of a word) from the card</li><li>No gestures, rhymes, spelling or initials</li><li>Pass a card: −1. Break a rule: NO! −1</li></ul>
          <button class="primary" id="nstart">Start my turn</button>${bar(s.endsAt, s.windowMs)}` };
      }
      const role = teams ? (mySide ? 'Get ready to guess! Shout out answers.' : `You're judging. Hit NO! if ${esc(poet ? poet.name : 'they')} slips.`)
        : 'Get ready to shout guesses. Hit NO! if they use a long word.';
      return { key: 'nready', html: `<p class="kicker">Turn ${s.turn} of ${s.turns}</p><p class="say">${esc(poet ? poet.name : 'Someone')} is up</p><p class="note">${role}</p>` };
    }

    if (s.phase === 'turn') {
      if (isPoet && s.card) {
        const c = s.card;
        const others = s.players.filter(p => p.connected && p.id !== me.id);
        const needWho = !teams && others.length > 1;
        return { key: `npoet:${c.seq}:${c.stage}`, html: `${bar(s.endsAt, s.windowMs)}${cardHTML(c)}
          <div class="nbtns">
            ${c.stage === 'one' ? `<button class="primary ngot" data-pts="1">They said "${esc(c.one)}" +1</button>` : ''}
            ${c.three ? `<button class="primary ngot three" data-pts="3">They said "${esc(c.three)}" +${c.stage === 'one' ? 3 : 2}</button>` : ''}
            <div class="row">${c.stage === 'one' ? '<button class="ghost big" id="npass">Pass −1</button>' : '<button class="ghost big" id="npass">Next card</button>'}
              <button class="ghost big nslip" id="nslip">I slipped −1</button></div>
          </div>
          <p class="note">This turn: ${s.turnPts >= 0 ? '+' : ''}${s.turnPts}</p>
          ${needWho ? `<div class="nwho" id="nwho" hidden><p class="say">Who said it?</p><div class="choices">${others.map(p => `<button class="choice" data-who="${p.id}"><span class="dot" style="--color:${p.color}"></span>${esc(p.name)}</button>`).join('')}</div>
            <button class="ghost big" id="nwhocancel">Cancel</button></div>` : ''}` };
      }
      if (teams && !mySide && s.card) {
        return { key: `njudge:${s.card.seq}:${s.card.stage}`, html: `<p class="kicker">You're judging ${esc(poet ? poet.name : '')}</p>${bar(s.endsAt, s.windowMs)}${cardHTML(s.card)}
          <p class="note">Two-syllable word, a word from the card, a gesture? Smack it.</p>${noButton(s)}` };
      }
      return { key: `nguess:${s.cardSeq}`, html: `<p class="kicker">${esc(poet ? poet.name : 'The Poet')} is the Poet</p><p class="say">Shout your guesses!</p>${bar(s.endsAt, s.windowMs)}
        <p class="note">${teams ? 'The other team is watching for slip-ups.' : 'Caught a word with more than one syllable? Smack it.'}</p>${teams ? '' : noButton(s)}` };
    }

    // turnEnd
    const rows = (s.log || []).map(l => `<div class="nlog ${l.pts > 0 ? 'ok' : 'no'}"><span>${esc(l.result === '3' ? l.three : l.one)}</span><b>${RESULT[l.result] || ''}</b></div>`).join('');
    return { key: 'nturnend', html: `<p class="kicker">Turn over</p><p class="say">${esc(poet ? poet.name : 'The Poet')}: ${s.turnPts >= 0 ? '+' : ''}${s.turnPts}</p>
      <div class="nlogs">${rows || '<p class="note">No cards this turn.</p>'}</div>` };
  };

  mod.wire = (key, s) => {
    if ($('#nstart')) $('#nstart').onclick = () => act('start');
    if ($('#npass')) $('#npass').onclick = () => act(s.card && s.card.stage === 'three' ? 'next' : 'pass');
    if ($('#nslip')) $('#nslip').onclick = () => act('no', { card: s.cardSeq });
    if ($('#nno')) $('#nno').addEventListener('pointerdown', e => {
      e.preventDefault();
      if (navigator.vibrate) navigator.vibrate(40);
      act('no', { card: Number(e.currentTarget.dataset.card) });
    });
    // Scoring: in teams the whole team guesses, so one tap. Everyone for themselves: say who.
    let pending = null;
    const who = $('#nwho');
    document.querySelectorAll('.ngot').forEach(b => {
      b.onclick = () => {
        const type = b.dataset.pts === '1' ? 'got1' : 'got3';
        if (!who) { act(type); return; }
        pending = type;
        who.hidden = false;
      };
    });
    document.querySelectorAll('[data-who]').forEach(b => { b.onclick = () => { if (pending) act(pending, { guesser: b.dataset.who }); }; });
    if ($('#nwhocancel')) $('#nwhocancel').onclick = () => { pending = null; who.hidden = true; };
  };

  GAMES.neanderthals.phone = mod;
})();
