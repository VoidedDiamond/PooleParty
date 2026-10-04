'use strict';
(() => {
  const pname = (s, id) => { const p = findPlayer(s, id); return p ? esc(p.name) : 'Someone'; };
  const COLOR_CLASS = c => c === 0 ? 'red' : c === 1 ? 'blue' : c === 'assassin' ? 'assassin' : 'neutral';

  function teamsHTML(s) {
    const list = s.players.map(p => `<div class="cnpick-row"><span>${esc(p.name)}</span>
      <span class="cnpick-status">${p.team === 0 ? 'RED' : p.team === 1 ? 'BLUE' : (s.picked || []).includes(p.id) ? '' : 'choosing…'}</span></div>`).join('');
    return `<div class="stage"><div class="main"><div class="cluebox">
      <div class="cluemeta">Choose your team</div>
      <div class="cluetext small">Pick Red or Blue on your phone</div>
      <div class="cnpick-list">${list}</div>${bar(s.endsAt, s.windowMs)}
    </div></div></div>`;
  }

  function rolesHTML(s) {
    const roleLabel = p => p.role === 'spy' ? 'GIVING HINTS' : p.role === 'guess' ? 'GUESSING' : (s.picked || []).includes(p.id) ? '' : 'choosing…';
    const list = s.players.map(p => `<div class="cnpick-row"><span>${esc(p.name)}</span><span class="cnpick-status">${roleLabel(p)}</span></div>`).join('');
    return `<div class="stage"><div class="main"><div class="cluebox">
      <div class="cluemeta">Pick a role</div>
      <div class="cluetext small">Each team picks one spymaster (hint-giver). Everyone else guesses.</div>
      <div class="cnpick-list">${list}</div>${bar(s.endsAt, s.windowMs)}
    </div></div></div>`;
  }

  function boardHTML(s) {
    const cells = s.board.map(c => {
      const cls = c.revealed ? `cn-cell revealed ${COLOR_CLASS(c.color)}` : 'cn-cell hidden';
      return `<div class="${cls}">${c.revealed ? '<i class="cn-mark"></i>' : ''}<span>${esc(c.word)}</span></div>`;
    }).join('');
    return `<div class="cn-board">${cells}</div>`;
  }

  function statusHTML(s) {
    const t = s.teams[s.turn];
    if (s.phase === 'clue') {
      return `<div class="big" style="color:${t.color}">${pname(s, t.spymaster)} is thinking of a clue for ${esc(t.name)}</div>${bar(s.endsAt, s.windowMs)}`;
    }
    if (s.phase === 'guess') {
      return `<div class="big" style="color:${t.color}">Clue: "${esc(s.clue.word)}" (${s.clue.number})</div>
        <div class="note">${esc(t.name)} has made ${s.clue.guessesMade} guess${s.clue.guessesMade === 1 ? '' : 'es'}. Keep going while you're right.</div>${bar(s.endsAt, s.windowMs)}`;
    }
    if (s.phase === 'end') {
      const w = s.teams[s.winner];
      return `<div class="big win" style="color:${w.color}">${esc(w.name)} wins! ${esc(s.reason || '')}</div>`;
    }
    return '';
  }

  function logHTML(s) {
    return (s.log || []).map(l => {
      if (l.kind === 'clue') return `<div class="cnlog">${esc(s.teams[l.team].name)} spymaster: "${esc(l.word)}" (${l.number})</div>`;
      const good = typeof l.color === 'number' ? (l.color === l.team) : false;
      return `<div class="cnlog ${good ? 'ok' : 'no'}">${esc(l.by)} guessed "${esc(l.word)}"</div>`;
    }).join('');
  }

  GAMES.codenames.tv = {
    html(s) {
      if (s.phase === 'teams') return teamsHTML(s);
      if (s.phase === 'roles') return rolesHTML(s);
      const remain = `<div class="cn-scores">${s.teams.map(t => `<div class="cn-score" style="--color:${t.color}">
        <span><i class="cn-mark ${t.id === 0 ? 'red' : 'blue'}"></i> ${esc(t.name)}</span><b>${s.remaining[t.id]}</b></div>`).join('')}</div>`;
      return `<div class="stage"><div class="main">
        ${remain}
        ${boardHTML(s)}
        <div class="fstatus">${statusHTML(s)}</div>
        <div class="cnfeed">${logHTML(s)}</div>
      </div></div>`;
    },
    sounds(a, b) {
      if (!a) return;
      const l = b.log && b.log[0];
      if (l && l.kind === 'guess' && (!a.log || !a.log[0] || l.word !== a.log[0].word)) {
        sfx[typeof l.color === 'number' && l.color === l.team ? 'right' : 'wrong']();
      }
      if (b.phase === 'end' && a.phase !== 'end') sfx[b.winner != null ? 'fanfare' : 'wrong']();
    },
  };
})();
