'use strict';
(() => {
  const mod = {};
  mod.inputScreens = new Set(['wturn', 'wbsolve']);
  const sel = { c: [], v: null };
  const CONSONANTS = 'BCDFGHJKLMNPQRSTVWXYZ'.split('');
  const VOWELS = 'AEIOU'.split('');

  const keys = (letters, s) => `<div class="keys">${letters.map(l =>
    `<button class="key" data-letter="${l}" ${s.called.includes(l) ? 'disabled' : ''}>${l}</button>`).join('')}</div>`;

  // A pocket copy of the puzzle board, so nobody has to squint at the TV while deciding.
  const puzzleBits = s => `<div class="wmini"><p class="kicker">${esc(s.category)}</p><div class="wmini-board">${s.words.map(w =>
    `<span class="wmw">${w.map(t => (t.letter ? `<i class="${t.shown ? 'on' : ''}">${t.shown ? t.ch : ''}</i>` : `<b>${esc(t.ch)}</b>`)).join('')}</span>`).join('')}</div></div>`;

  mod.screen = (s, me) => {
    const you = s.players.find(p => p.id === me.id);
    const head = `<div class="me" style="--color:${me.color}"><b>${esc(me.name)}</b><span>${money(you.score)} <small>+ ${money(you.bank)}</small></span></div>`;
    const mine = s.turnPid === me.id;
    const msg = s.msg ? `<p class="note">${esc(s.msg)}</p>` : '';
    let out;
    switch (s.phase) {
      case 'turn':
        if (!mine) { const p = findPlayer(s, s.turnPid); out = { key: 'wwait', html: `<p class="say">${esc(p ? p.name : 'Someone')}'s turn</p>${msg}${puzzleBits(s)}` }; break; }
        out = { key: 'wturn', html: `<p class="say">Your turn</p>${msg}${puzzleBits(s)}
          <button class="primary" id="spin" ${s.consonantsLeft === false ? 'disabled' : ''}>${s.consonantsLeft === false ? 'No consonants left' : 'Spin the wheel'}</button>
          <button class="ghost big" id="buy" ${you.bank < s.vowelCost ? 'disabled' : ''}>Buy a vowel (${money(s.vowelCost)})</button>
          <input id="solve" type="text" maxlength="80" autocomplete="off" autocapitalize="off" placeholder="Think you know it? Type the answer" value="${esc(draft.answer)}">
          <button class="ghost big" id="sendsolve">Solve the puzzle</button>` };
        break;
      case 'spinning': out = { key: 'wspin', html: `<p class="say">${mine ? 'Spinning…' : 'The wheel is spinning'}</p><p class="note">Watch the TV.</p>${puzzleBits(s)}` }; break;
      case 'consonant':
        out = mine ? { key: 'wcons', html: `<p class="say">${esc(s.wedge ? s.wedge.label : '')}</p><p class="note">Call a consonant.</p>${keys(CONSONANTS, s)}${puzzleBits(s)}` }
          : { key: 'wwait2', html: `<p class="say">${esc((findPlayer(s, s.turnPid) || {}).name || 'Someone')} is calling a letter</p>${msg}${puzzleBits(s)}` };
        break;
      case 'vowel':
        out = mine ? { key: 'wvowel', html: `<p class="say">Call a vowel</p>${keys(VOWELS, s)}${puzzleBits(s)}` }
          : { key: 'wwait3', html: `<p class="say">${esc((findPlayer(s, s.turnPid) || {}).name || 'Someone')} is buying a vowel</p>${msg}${puzzleBits(s)}` };
        break;
      case 'bonus_pick': {
        if (!mine) { out = { key: 'wbwait', html: `<p class="say">Bonus round</p><p class="note">${esc(s.msg)}. Watch the TV.</p>` }; break; }
        const bad = 'RSTLNE';
        const cons = CONSONANTS.filter(c => !bad.includes(c));
        const ok = sel.c.length === 3 && sel.v;
        out = { key: 'wbpick', html: `<p class="say">Bonus round</p>${bar(s.endsAt, s.windowMs)}
          <p class="note">R S T L N E are free. Pick 3 consonants (${sel.c.length}/3).</p>
          <div class="keys">${cons.map(l => `<button class="key ${sel.c.includes(l) ? 'sel' : ''}" data-bc="${l}">${l}</button>`).join('')}</div>
          <p class="note">Pick 1 vowel.</p>
          <div class="keys">${['A', 'I', 'O', 'U'].map(l => `<button class="key ${sel.v === l ? 'sel' : ''}" data-bv="${l}">${l}</button>`).join('')}</div>
          <button class="primary" id="bonuslock" ${ok ? '' : 'disabled'}>Lock in letters</button>` };
        break;
      }
      case 'bonus_solve':
        out = mine ? { key: 'wbsolve', html: `<p class="say">Solve it!</p>${bar(s.endsAt, s.windowMs)}${puzzleBits(s)}
            <input id="solve" type="text" maxlength="80" autocomplete="off" autocapitalize="off" placeholder="Type the answer" value="${esc(draft.answer)}">
            <button class="primary" id="sendbonus">Submit</button>` }
          : { key: 'wbwait2', html: `<p class="say">Bonus round</p><p class="note">${esc(s.msg)}</p>` };
        break;
      case 'bonus_end': out = { key: 'wbend', html: `<p class="say">Bonus round over</p><p class="note">${esc(s.msg)}</p>` }; break;
      case 'roundEnd': out = { key: 'wend', html: `<p class="say">Round over</p>${msg}${puzzleBits(s)}` }; break;
      default: out = finalScoresPhone(s, me, { fmt: money });
    }
    out.head = head;
    return out;
  };

  mod.wire = () => {
    if ($('#spin')) $('#spin').onclick = () => act('spin');
    if ($('#buy')) $('#buy').onclick = () => act('buyVowel');
    const solve = wireInput('solve', 'answer');
    const send = async () => { if (!(await act('solve', { text: draft.answer }))) draft.answer = ''; };
    if ($('#sendsolve')) { $('#sendsolve').onclick = send; onEnter(solve, send); }
    document.querySelectorAll('.key[data-letter]').forEach(b => { b.onclick = () => act('letter', { letter: b.dataset.letter }); });
    document.querySelectorAll('[data-bc]').forEach(b => {
      b.onclick = () => {
        const l = b.dataset.bc;
        sel.c = sel.c.includes(l) ? sel.c.filter(x => x !== l) : (sel.c.length < 3 ? [...sel.c, l] : sel.c);
        render();
      };
    });
    document.querySelectorAll('[data-bv]').forEach(b => { b.onclick = () => { sel.v = b.dataset.bv; render(); }; });
    if ($('#bonuslock')) $('#bonuslock').onclick = async () => { if (!(await act('bonusPick', { letters: sel.c.join(''), vowel: sel.v }))) { sel.c = []; sel.v = null; } };
    const bs = $('#sendbonus');
    if (bs) { bs.onclick = async () => { if (!(await act('bonusSolve', { text: draft.answer }))) draft.answer = ''; }; onEnter(solve, () => bs.click()); }
  };

  GAMES.wheel.phone = mod;
})();
