'use strict';
(() => {
  const mod = {};
  mod.inputScreens = new Set(['foinput', 'fturn', 'fsteal', 'fminput']);

  const inputHTML = (title, note, s) => `<p class="say">${title}</p><p class="qtext">${esc(s.question)}</p><p class="note">${note}</p>${bar(s.endsAt, s.windowMs)}
    <input id="answer" type="text" maxlength="60" autocomplete="off" autocapitalize="off" placeholder="Type your answer" value="${esc(draft.answer)}">
    <button id="sendanswer" class="primary">Submit answer</button>`;

  mod.screen = (s, me) => {
    const myTeam = s.teams[s.players.find(p => p.id === me.id).team];
    // Your name, with your team's color and score (a solo "team" is just you).
    const teamTag = myTeam.name === me.name ? '' : ` <small>· ${esc(myTeam.name)}</small>`;
    const head = `<div class="me" style="--color:${myTeam.color}"><b>${esc(me.name)}${teamTag}</b><span>${myTeam.score}</span></div>`;
    const q = `<p class="qtext">${esc(s.question)}</p>`;
    const done = key => ({ key, head, html: '' });
    let out;
    switch (s.phase) {
      case 'faceoff': {
        const f = s.face;
        if (f.ids.includes(me.id) && !f.resolved) {
          if (f.submitted[me.id]) out = { key: 'foLocked', html: `<p class="say">Answer locked in</p>${q}<p class="note">Waiting for the other player.</p>` };
          else out = { key: 'foinput', html: inputHTML('Face-off', 'Give the answer you think most people said.', s) };
        } else out = { key: 'foWatch', html: `<p class="say">Face-off</p>${q}<p class="note">Watch the TV.</p>` };
        break;
      }
      case 'choice':
        if (s.choice && s.choice.pid === me.id) out = { key: 'fchoice', html: `<p class="say">Your team won the face-off</p>${q}${bar(s.endsAt, s.windowMs)}
          <button class="primary" data-play="1">Play</button><button class="ghost big" data-play="0">Pass to the other team</button>` };
        else out = { key: 'fchoicewait', html: `<p class="say">Play or pass?</p>${q}<p class="note">The face-off winner is deciding.</p>` };
        break;
      case 'fastmoney': {
        const f = s.fm;
        const mineTurn = f.ids[f.step] === me.id;
        if (f.stage === 'play' && mineTurn) {
          out = { key: 'fminput', html: `<p class="note">Fast Money. Question ${f.idx + 1} of 5</p><p class="say">${esc(f.question)}</p>${bar(f.endsAt, f.windowMs)}
            <input id="answer" type="text" maxlength="60" autocomplete="off" autocapitalize="off" placeholder="Type your answer" value="${esc(draft.answer)}">
            <button id="sendfm" class="primary">Submit answer</button><button class="ghost big" id="passfm">Pass</button>` };
        } else if (f.stage === 'intro' || f.stage === 'between') {
          out = { key: 'fmintro', html: `<p class="say">Fast Money</p><p class="note">${f.ids.includes(me.id) ? `Get ${f.target} points. Get ready.` : 'Watch the TV.'}</p>` };
        } else if (f.stage === 'play') {
          out = { key: 'fmwait', html: `<p class="say">Fast Money</p><p class="note">${f.ids.includes(me.id) ? 'Wait for your turn. Do not peek at the TV.' : 'Watch the TV.'}</p>` };
        } else {
          // reveal / done: mirror the TV's per-player answer columns and running totals, so
          // everyone (not just whoever's holding the TV remote) can follow the score live.
          const cols = f.ids.map((id, pi) => {
            const p = findPlayer(s, id);
            const rows = (f.rows || []).filter(r => r.pi === pi).map(r => r.shown
              ? `<div class="fmprow"><span>${esc(r.text || '(pass)')}</span><b>${r.pts}</b></div>`
              : '').join('');
            const subtotal = (f.subtotals && f.subtotals[pi]) || 0;
            return `<div class="fmpcol"><div class="fmpname">${esc(p ? p.name : 'Player')} — ${subtotal} pt${subtotal === 1 ? '' : 's'}</div>${rows}</div>`;
          }).join('');
          const doneMsg = f.stage === 'done' ? `<p class="say">${f.win ? `${f.total} points. You win!` : `${f.total} points. ${f.total >= f.target * 0.6 ? 'So close!' : 'Better luck next time.'}`}</p>` : '<p class="say">Survey says...</p>';
          out = { key: 'fmrev', html: `${doneMsg}<p class="note">Total ${f.total} / ${f.target}</p>${cols}` };
        }
        break;
      }
      case 'play':
        if (s.turnPid === me.id) out = { key: 'fturn', html: inputHTML('Your turn', 'Name something on the board.', s) };
        else {
          const p = findPlayer(s, s.turnPid);
          out = { key: 'fwait', html: `<p class="say">${esc(p ? p.name : 'A teammate')} is answering</p>${q}` };
        }
        break;
      case 'steal':
        if (s.stealPid === me.id) out = { key: 'fsteal', html: inputHTML('Steal!', 'One answer. Get it right to take the points.', s) };
        else out = { key: 'fsteal-wait', html: `<p class="say">Steal attempt</p>${q}<p class="note">Watch the TV.</p>` };
        break;
      case 'strikeout': out = { key: 'fstrikeout', html: '<p class="say">Three strikes!</p><p class="note">Watch the TV.</p>' }; break;
      case 'reveal': {
        const t = s.award && s.teams[s.award.team];
        const note = t ? (s.award.points ? `${esc(t.name)} ${t.id === s.players.find(x => x.id === me.id).team ? '(your team) ' : ''}banks ${s.award.points} points.` : 'No points this round.') : '';
        out = { key: 'freveal', html: `<p class="say">Round over</p><p class="note">${note}</p>` };
        break;
      }
      default: {
        const [a, b] = s.teams;
        const tie = a.score === b.score;
        const w = a.score > b.score ? a : b;
        const headline = tie ? "It's a tie!" : w.id === myTeam.id ? 'Your team wins!' : `${esc(w.name)} wins`;
        out = { key: 'fend', html: `<p class="kicker">Game over</p><p class="say">${headline}</p>
          <ol class="ranking">${[...s.teams].sort((x, y) => y.score - x.score).map((t, i) => `<li class="${t.id === myTeam.id ? 'me-row' : ''}" style="--color:${t.color}">
            <span class="place">${tie ? 1 : i + 1}</span><span class="name">${esc(t.name)}</span><b>${t.score}</b></li>`).join('')}</ol>` };
      }
    }
    out.head = head;
    return out;
  };

  mod.wire = () => {
    const ans = wireInput('answer', 'answer');
    const send = async () => { if (!(await act('answer', { text: draft.answer }))) draft.answer = ''; };
    if ($('#sendanswer')) { $('#sendanswer').onclick = send; onEnter(ans, send); }
    if ($('#sendfm')) { $('#sendfm').onclick = send; onEnter(ans, send); }
    if ($('#passfm')) $('#passfm').onclick = async () => { await act('fmPass'); draft.answer = ''; const el = $('#answer'); if (el) el.value = ''; };
    document.querySelectorAll('[data-play]').forEach(b => { b.onclick = () => act('choose', { play: b.dataset.play === '1' }); });
  };

  GAMES.feud.phone = mod;
})();
