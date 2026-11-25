'use strict';
(() => {
  const mod = {};
  mod.inputScreens = new Set(['cnclue']);
  const COLOR_CLASS = c => c === 0 ? 'red' : c === 1 ? 'blue' : c === 'assassin' ? 'assassin' : 'neutral';

  function gridHTML(s, tappable) {
    const cells = s.board.map(c => {
      const known = c.color != null;
      const cls = c.revealed ? `cn-pcell revealed ${COLOR_CLASS(c.color)}` : known ? `cn-pcell known ${COLOR_CLASS(c.color)}` : 'cn-pcell';
      const disabled = !tappable || c.revealed ? 'disabled' : '';
      return `<button class="${cls}" data-idx="${c.i}" ${disabled}>${known || c.revealed ? '<i class="cn-mark"></i>' : ''}${esc(c.word)}</button>`;
    }).join('');
    return `<div class="cn-pgrid">${cells}</div>${cbToggleHTML()}`;
  }

  // Colorblind mode (per phone, remembered): stripes on red cards, a solid fill on blue ones, a
  // plain grey for neutral, and bigger shape marks, so no card relies on red vs beige alone.
  const CB_KEY = 'pg_colorblind';
  const cbOn = () => { try { return localStorage.getItem(CB_KEY) === '1'; } catch { return false; } };
  const applyCb = () => document.documentElement.classList.toggle('cb', cbOn());
  const cbToggleHTML = () => `<button class="ghost cb-toggle" id="cbToggle">${cbOn() ? 'Colorblind mode: on' : 'Colorblind mode: off'}</button>`;
  applyCb();

  mod.screen = (s, me) => {
    if (s.phase === 'teams') {
      const mine = s.players.find(p => p.id === me.id);
      if (mine && mine.team != null) {
        return { key: 'cnwait', html: `<p class="say">You're on ${mine.team === 0 ? 'Red' : 'Blue'}</p><p class="note">Waiting for everyone to choose…</p>` };
      }
      return { key: 'cnteams', html: `<p class="say">Choose your team</p>${bar(s.endsAt, s.windowMs)}
        <div class="row"><button class="primary cnred" data-team="0"><i class="cn-mark red"></i> Red</button><button class="primary cnblue" data-team="1"><i class="cn-mark blue"></i> Blue</button></div>` };
    }

    if (s.phase === 'roles') {
      const mine = s.players.find(p => p.id === me.id);
      if (mine && mine.role) {
        return { key: 'cnrolewait', html: `<p class="say">You're ${mine.role === 'spy' ? 'giving hints' : 'guessing'}</p><p class="note">Waiting for everyone to choose…</p>` };
      }
      const teamInfo = s.teams.find(t => t.id === (mine ? mine.team : null));
      const spyTaken = teamInfo && teamInfo.spyTakenBy != null;
      return { key: 'cnroles', html: `<p class="say">Pick your role</p>${bar(s.endsAt, s.windowMs)}
        <p class="note">Only one hint-giver (spymaster) per team. Everyone else guesses.</p>
        <div class="row">
          <button class="primary" id="rolespy" ${spyTaken ? 'disabled' : ''}>${spyTaken ? 'Hint-giver taken' : 'Give hints'}</button>
          <button class="primary" id="roleguess">Guess words</button>
        </div>` };
    }

    const myTeam = s.players.find(p => p.id === me.id)?.team;
    const isSpymaster = s.isSpymaster;
    const onTurn = myTeam === s.turn;

    if (s.phase === 'end') {
      const w = s.teams[s.winner];
      return { key: 'cnend', html: `<p class="say">${esc(w.name)} wins!</p><p class="note">${esc(s.reason || '')}</p>${gridHTML(s, false)}` };
    }

    // 2-player games: your team has no one else, so you give yourself the clue and guess too.
    const soloSelf = isSpymaster && onTurn && s.soloTeam;

    if (isSpymaster) {
      if (s.phase === 'clue' && onTurn) {
        return { key: 'cnclue', html: `<p class="say">Give a one-word clue</p>
          <div class="row cn-clueform"><input id="clueword" type="text" maxlength="24" autocomplete="off" autocapitalize="characters" placeholder="Clue word">
          <input id="cluenum" type="number" inputmode="numeric" min="0" max="9" value="1" aria-label="How many words"></div>
          <button class="primary" id="sendclue">Give clue</button>${bar(s.endsAt, s.windowMs)}${gridHTML(s, false)}` };
      }
      if (s.phase === 'guess' && soloSelf) {
        return { key: 'cnguess', html: `<p class="say">Clue: "${esc(s.clue.word)}" (${s.clue.number})</p>
          <p class="note">${s.clue.guessesMade} guess${s.clue.guessesMade === 1 ? '' : 'es'} so far. Keep guessing as long as you're right — playing solo, tap a word to guess it.</p>
          ${gridHTML(s, true)}<button class="ghost big" id="stopguess">Stop guessing</button>` };
      }
      return { key: 'cnspywatch', html: `<p class="say">${s.phase === 'clue' ? "The other spymaster is thinking" : `${esc(s.teams[s.turn].name)} is guessing`}</p>
        <p class="note">You can see every color. Don't say anything!</p>${gridHTML(s, false)}` };
    }

    if (s.phase === 'clue') {
      const spy = findPlayer(s, s.teams[s.turn].spymaster);
      return { key: 'cnwaitclue', html: `<p class="say">${esc(spy ? spy.name : 'The spymaster')} is thinking of a clue</p><p class="note">${esc(s.teams[s.turn].name)}'s turn. Hang tight.</p>` };
    }

    // guess phase
    if (onTurn) {
      return { key: 'cnguess', html: `<p class="say">Clue: "${esc(s.clue.word)}" (${s.clue.number})</p>
        <p class="note">${s.clue.guessesMade} guess${s.clue.guessesMade === 1 ? '' : 'es'} so far. Keep guessing as long as you're right — tap a word to guess it.</p>
        ${gridHTML(s, true)}<button class="ghost big" id="stopguess">Stop guessing</button>` };
    }
    return { key: 'cnotherwatch', html: `<p class="say">${esc(s.teams[s.turn].name)} is guessing</p><p class="note">Watch the TV and discuss.</p>` };
  };

  mod.wire = (key) => {
    applyCb();
    if ($('#cbToggle')) $('#cbToggle').onclick = () => {
      try { localStorage.setItem(CB_KEY, cbOn() ? '0' : '1'); } catch { /* private mode: session only */ }
      applyCb();
      $('#cbToggle').textContent = cbOn() ? 'Colorblind mode: on' : 'Colorblind mode: off';
    };
    document.querySelectorAll('[data-team]').forEach(b => { b.onclick = () => act('pickTeam', { team: Number(b.dataset.team) }); });
    if ($('#rolespy') && !$('#rolespy').disabled) $('#rolespy').onclick = () => act('pickRole', { role: 'spy' });
    if ($('#roleguess')) $('#roleguess').onclick = () => act('pickRole', { role: 'guess' });
    if (key === 'cnclue' && $('#sendclue')) {
      $('#sendclue').onclick = () => act('giveClue', { word: $('#clueword').value, number: Number($('#cluenum').value) });
    }
    document.querySelectorAll('.cn-pgrid button[data-idx]:not([disabled])').forEach(b => {
      b.onclick = () => act('guess', { idx: Number(b.dataset.idx) });
    });
    if ($('#stopguess')) $('#stopguess').onclick = () => act('stopGuessing');
  };

  GAMES.codenames.phone = mod;
})();
