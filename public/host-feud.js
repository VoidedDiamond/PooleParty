'use strict';
(() => {
  const pname = (s, id) => { const p = findPlayer(s, id); return p ? esc(p.name) : 'Someone'; };
  const team = (s, t) => s.teams[t];

  function slotsHTML(s) {
    const n = s.answers.length;
    const rows = Math.ceil(n / 2);
    const slots = s.answers.map(a => {
      if (!a.revealed) return `<div class="slot"><span class="num">${a.n}</span></div>`;
      const col = a.team != null ? team(s, a.team).color : 'transparent';
      return `<div class="slot open ${a.missed ? 'missed' : ''}" style="--tc:${col}">
        <span class="txt">${esc(a.text)}</span><span class="pts">${a.pts}</span></div>`;
    }).join('');
    return `<div class="fboard" style="--rows:${rows}">${slots}</div>`;
  }

  function strikesHTML(s) {
    return `<div class="strikes">${[0, 1, 2].map(i => `<span class="x ${i < s.strikes ? 'on' : ''}">X</span>`).join('')}</div>`;
  }

  function guessLine(s) {
    const g = s.lastGuess;
    if (!g) return '';
    const who = g.pid ? pname(s, g.pid) : 'Someone';
    if (g.kind === 'hit') return `<span class="ok">${who}: "${esc(g.text)}". On the board.</span>`;
    if (g.kind === 'timeout') return `<span class="no">${who} ran out of time. Strike.</span>`;
    return `<span class="no">${who}: "${esc(g.text)}". Not on the board.</span>`;
  }

  function statusHTML(s) {
    switch (s.phase) {
      case 'faceoff': {
        const f = s.face;
        if (f.resolved) {
          const lines = (f.results || []).filter(r => r.id).map(r => {
            const what = r.guess ? (r.idx >= 0 ? `#${r.idx + 1} on the board` : 'not on the board') : 'no answer';
            return `${pname(s, r.id)}: ${r.guess ? `"${esc(r.guess)}"` : ''} ${what}`;
          });
          const w = f.winner;
          const wt = w ? s.players.find(p => p.id === w) : null;
          return `<div>${lines.join('<br>')}</div><div class="big">${wt ? esc(team(s, wt.team).name) : 'A team'} takes control</div>`;
        }
        const names = f.ids.filter(Boolean).map(id => `${pname(s, id)}${f.submitted[id] ? ' (locked in)' : ''}`);
        return `<div class="big">Face-off: ${names.join(' vs ')}</div><div>Type your answer on your phone</div>${bar(s.endsAt, s.windowMs)}`;
      }
      case 'choice': {
        const w = s.choice && findPlayer(s, s.choice.pid);
        return `<div class="big">${w ? esc(team(s, w.team).name) : 'A team'} won the face-off. Play or pass?</div>${bar(s.endsAt, s.windowMs)}`;
      }
      case 'play':
        return `<div class="big"><b>${pname(s, s.turnPid)}</b> is up</div><div>${guessLine(s)}</div>${bar(s.endsAt, s.windowMs)}`;
      case 'strikeout':
        return `<div class="big steal">THREE STRIKES!</div><div>${guessLine(s)}</div>`;
      case 'steal':
        return `<div class="big steal">STEAL! ${pname(s, s.stealPid)} gets one answer</div>${bar(s.endsAt, s.windowMs)}`;
      case 'reveal': {
        const a = s.award;
        return `<div class="big">${a ? `${esc(team(s, a.team).name)} wins ${a.points}${s.mult > 1 ? ` (x${s.mult})` : ''}` : ''}</div><div>${guessLine(s)}</div>`;
      }
      default: return '';
    }
  }

  function teamsHTML(s) {
    return `<div class="teams">${s.teams.map(t => `
      <div class="team ${s.control === t.id && ['play', 'steal'].includes(s.phase) ? 'control' : ''}" style="--color:${t.color}">
        <div class="tname">${esc(t.name)}</div><div class="tscore">${t.score}</div></div>`).join('')}</div>`;
  }

  function fmHTML(s) {
    const f = s.fm;
    const t = team(s, f.team);
    const cur = pname(s, f.ids[f.step]);
    let head = '';
    if (f.stage === 'intro') head = `<div class="big">${esc(t.name)} plays Fast Money</div><div>Reach ${f.target} points to win. ${pname(s, f.ids[0])} goes first.</div>${bar(f.endsAt, f.windowMs)}`;
    else if (f.stage === 'play') head = `<div class="big"><b>${cur}</b> is answering</div><div>Question ${f.idx + 1} of 5. ${f.ids.length > 1 && f.step === 0 ? `${pname(s, f.ids[1])}, look away!` : ''}</div>${bar(f.endsAt, f.windowMs)}`;
    else if (f.stage === 'between') head = `<div class="big">${pname(s, f.ids[f.step])} is up next</div>${bar(f.endsAt, f.windowMs)}`;
    else if (f.stage === 'reveal') head = '<div class="big">Survey says...</div>';
    else head = f.win ? `<div class="big win">${f.total} points. ${esc(t.name)} wins Fast Money!</div>` : `<div class="big">${f.total} points. ${f.total === 0 ? 'Not this time.' : f.total >= f.target * 0.6 ? 'So close!' : 'Better luck next time.'}</div>`;

    const cols = f.ids.map((id, pi) => {
      const rows = f.rows.filter(r => r.pi === pi).map(r => r.shown
        ? `<div class="fmrow open"><span class="fmq">${esc(r.q)}</span><span class="fmans"><span class="txt">${esc(r.text || '(pass)')}</span><span class="pts">${r.pts}</span></span></div>`
        : '<div class="fmrow"></div>').join('');
      const subtotal = (f.subtotals && f.subtotals[pi]) || 0;
      return `<div class="fmcol"><div class="fmname">${pname(s, id)}<span class="fmsub">${subtotal} pt${subtotal === 1 ? '' : 's'}</span></div>${rows}</div>`;
    }).join('');
    return `<div class="stage feud"><div class="main">
      <div class="fq"><small>Fast Money</small><div>${esc(t.name)}</div></div>
      <div class="fmgrid">${cols}</div>
      <div class="fmid"><div class="bank">Total ${f.total} / ${f.target}</div></div>
      <div class="fstatus">${head}</div></div>${teamsHTML(s)}</div>`;
  }

  GAMES.feud.tv = {
    html(s) {
      if (s.phase === 'fastmoney') return fmHTML(s);
      if (s.phase === 'end') {
        const [a, b] = s.teams;
        const tie = a.score === b.score;
        const w = a.score > b.score ? a : b;
        const ranked = [...s.teams].sort((x, y) => y.score - x.score);
        return `<div class="stage"><div class="results">
          <div class="results-kicker">${icon('crown')} ${tie ? "It's a tie" : 'Winners'}</div>
          <div class="results-winner">${tie ? 'Both teams' : esc(w.name)}</div>
          <ol class="results-list">${ranked.map((t, i) => `<li class="${!tie && t.id === w.id ? 'top' : ''}" style="--color:${t.color}">
            <span class="place">${tie ? 1 : i + 1}</span><span class="dot"></span><span class="name">${esc(t.name)}</span><span class="pts">${t.score}</span></li>`).join('')}</ol>
        </div></div>`;
      }
      return `<div class="stage feud"><div class="main">
        <div class="fq"><small>Round ${s.round} of ${s.rounds}${s.mult > 1 ? `. Points x${s.mult}` : ''}</small><div>${esc(s.question)}</div></div>
        ${slotsHTML(s)}
        <div class="fmid">${strikesHTML(s)}<div class="bank">Bank ${s.bank}</div></div>
        <div class="fstatus">${statusHTML(s)}</div>
      </div>${teamsHTML(s)}</div>`;
    },
    sounds(a, b) {
      if (!a) return;
      if (a.fm && b.fm) {
        const sa = a.fm.rows.filter(r => r.shown).length;
        const rb = b.fm.rows.filter(r => r.shown);
        if (rb.length > sa) sfx[rb[rb.length - 1].pts > 0 ? 'right' : 'wrong']();
        if (b.fm.win && !a.fm.win) sfx.dd();
      }
      if (b.answers.filter(x => x.revealed && !x.missed).length > a.answers.filter(x => x.revealed && !x.missed).length) sfx.right();
      if (b.strikes > a.strikes) sfx.wrong();
    },
  };
})();
