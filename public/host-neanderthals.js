'use strict';
(() => {
  const pname = (s, id) => { const p = findPlayer(s, id); return p ? esc(p.name) : 'Someone'; };
  const RESULT = { 1: '+1', 3: '+3', skip: 'Pass −1', no: 'NO! −1', '1+no': '+1 / NO! −1' };
  let flashedAt = 0;
  let clock = null;

  // One long bar for the Poet's whole turn, with the seconds left counting down beside it.
  function bigBar(s) {
    return `<div class="nbigbar">${bar(s.endsAt, s.windowMs)}<div class="nsecs" id="nsecs"></div></div>`;
  }
  function tickClock(endsAt) {
    clearInterval(clock);
    const draw = () => {
      const el = $('#nsecs');
      if (!el) { clearInterval(clock); return; }
      el.textContent = Math.max(0, Math.ceil((endsAt - serverNow()) / 1000));
    };
    draw();
    clock = setInterval(draw, 250);
  }

  function teamsHTML(s) {
    if (s.mode !== 'teams') return scoreboardHTML(s, { turnId: s.poetId, plain: true });
    return `<div class="teams">${s.teams.map(t => `<div class="team${t.id === s.poetTeam && s.phase !== 'end' ? ' control' : ''}" style="--color:${t.color}">
      <span class="tname">${esc(t.name)} <small>${t.players.map(id => pname(s, id)).join(', ')}</small></span><span class="tscore">${t.score}</span></div>`).join('')}</div>`;
  }

  function tallyHTML(s) {
    return `<div class="ntally">${(s.log || []).map(l => `<span class="ntick ${l.pts > 0 ? 'ok' : 'no'}">${RESULT[l.result] || ''}</span>`).join('') || '<span class="note">No cards yet</span>'}</div>`;
  }

  function bodyHTML(s) {
    const team = s.mode === 'teams' ? ` for <span style="color:${s.teams[s.poetTeam].color}">${esc(s.teams[s.poetTeam].name)}</span>` : '';
    if (s.phase === 'ready') {
      return `<div class="kicker">Turn ${s.turn} of ${s.turns}</div><div class="bigtitle small">${pname(s, s.poetId)} is the Poet${team}</div>
        <div class="note">One-syllable words only. Nothing from the card. No gestures.</div>
        <div class="note">${pname(s, s.poetId)}: tap Start on your phone.</div>${bar(s.endsAt, s.windowMs)}`;
    }
    if (s.phase === 'turn') {
      return `<div class="kicker">${pname(s, s.poetId)} is the Poet${team}</div>${bigBar(s)}
        <div class="nturnpts"><b>${s.turnPts >= 0 ? '+' : ''}${s.turnPts}</b> this turn</div>${tallyHTML(s)}`;
    }
    // turnEnd: the cards from that turn, now safe to show
    return `<div class="kicker">Turn over</div><div class="bigtitle small">${pname(s, s.poetId)}: ${s.turnPts >= 0 ? '+' : ''}${s.turnPts}</div>
      <div class="nlogs tv">${(s.log || []).map(l => `<div class="nlog ${l.pts > 0 ? 'ok' : 'no'}"><span>${esc(l.result === '3' ? l.three : l.one)}${l.by ? ` <small>${esc(l.by)}</small>` : ''}</span><b>${RESULT[l.result] || ''}</b></div>`).join('') || '<div class="note">No cards this turn.</div>'}</div>
      ${bar(s.endsAt, s.windowMs)}`;
  }

  function endHTML(s) {
    if (s.mode !== 'teams') return finalScoresTV(s);
    const [a, b] = s.teams;
    const tie = a.score === b.score;
    const w = a.score > b.score ? a : b;
    return `<div class="stage"><div class="results">
      <div class="results-kicker">${icon('crown')} ${tie ? "It's a tie" : 'Winner'}</div>
      <div class="results-winner">${tie ? `${esc(a.name)} & ${esc(b.name)}` : esc(w.name)}</div>
      <ol class="results-list">${[...s.teams].sort((x, y) => y.score - x.score).map((t, i) => `<li class="${!tie && i === 0 ? 'top' : ''}" style="--color:${t.color}">
        <span class="place">${tie ? 1 : i + 1}</span><span class="dot"></span><span class="name">${esc(t.name)}</span><span class="pts">${t.score}</span></li>`).join('')}</ol>
    </div></div>`;
  }

  GAMES.neanderthals.tv = {
    update(app, s) {
      if (s.phase === 'end') { app.innerHTML = endHTML(s); return; }
      const flash = s.lastNo && s.lastNo.at !== flashedAt && serverNow() - s.lastNo.at < 2500;
      if (flash) flashedAt = s.lastNo.at;
      app.innerHTML = `<div class="stage"><div class="main"><div class="cluebox nbox">${bodyHTML(s)}</div></div>${teamsHTML(s)}
        ${flash ? `<div class="nflash"><b>NO!</b><span>${s.lastNo.self ? `${esc(s.lastNo.by)} owned up` : `called by ${esc(s.lastNo.by)}`} · −1</span></div>` : ''}</div>`;
      if (s.phase === 'turn') tickClock(s.endsAt);
    },
    sounds(a, b) {
      if (!a) return;
      if (b.phase === 'turn' && a.phase !== 'turn') sfx.start();
      if (b.phase === 'turnEnd' && a.phase !== 'turnEnd') sfx.timesup();
      if (b.lastNo && (!a.lastNo || a.lastNo.at !== b.lastNo.at)) { sfx.no(); return; }
      const la = (a.log || []).length, lb = (b.log || []).length;
      const last = (b.log || [])[lb - 1];
      if (lb > la || (last && a.log && a.log[lb - 1] && a.log[lb - 1].result !== last.result)) {
        if (!last) return;
        if (last.pts > 0) sfx[last.result === '3' ? 'kaching' : 'right']();
        else if (last.result === 'skip') sfx.swoosh();
      }
    },
  };
})();
