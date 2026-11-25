'use strict';
(() => {
  const pname = (s, id) => { const p = findPlayer(s, id); return p ? esc(p.name) : 'Someone'; };

  function headHTML(s) {
    return `<div class="pw-pair"><div class="pw-role"><small>Hinter</small>${pname(s, s.hinterId)}</div>
      <div class="pw-key">${gameBadge('password', 'lg')}</div>
      <div class="pw-role"><small>Guesser</small>${pname(s, s.guesserId)}</div></div>`;
  }

  function bodyHTML(s) {
    if (s.phase === 'clue') {
      return `<div class="big">${pname(s, s.hinterId)} is thinking of a one-word clue</div>
        <div class="pw-points">${s.points} points on the table</div>${bar(s.endsAt, s.windowMs)}`;
    }
    if (s.phase === 'guessing') {
      return `<div class="pw-clue">${esc(s.clue)}</div>
        <div class="pw-points">${s.points} points</div>
        <div>Shout out your guess, ${pname(s, s.guesserId)}!</div>${bar(s.endsAt, s.windowMs)}`;
    }
    if (s.phase === 'reveal') {
      return `<div class="cluemeta">The password was</div><div class="pw-word">${esc(s.word)}</div>
        <div class="big ${s.awarded > 0 ? 'win' : ''}">${s.awarded > 0 ? `+${s.awarded} points!` : 'No points this time'}</div>`;
    }
    return '';
  }

  GAMES.password.tv = {
    html(s) {
      if (s.phase === 'end') return finalScoresTV(s);
      return `<div class="stage"><div class="main">
        <div class="kicker center">Round ${s.round} of ${s.rounds}</div>
        ${headHTML(s)}
        <div class="cluebox pw-box">${bodyHTML(s)}</div>
      </div>${scoreboardHTML(s, { plain: true })}</div>`;
    },
    sounds(a, b) {
      if (!a) return;
      if (b.phase === 'guessing' && a.phase !== 'guessing') sfx.tick();
      if (b.phase === 'clue' && a.phase !== 'clue') sfx.pop();
      if (b.phase === 'reveal' && a.phase !== 'reveal') sfx[b.awarded > 0 ? 'right' : 'lose']();
    },
  };
})();
