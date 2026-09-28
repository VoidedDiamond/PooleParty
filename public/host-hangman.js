'use strict';
(() => {
  const pname = (s, id) => { const p = findPlayer(s, id); return p ? esc(p.name) : 'Someone'; };

  // Classic six-part figure, one piece per wrong guess: head, torso, two arms, two legs.
  const PARTS = [
    '<circle cx="130" cy="60" r="14" class="hm-part"></circle>',
    '<line x1="130" y1="74" x2="130" y2="120" class="hm-part"></line>',
    '<line x1="130" y1="85" x2="110" y2="105" class="hm-part"></line>',
    '<line x1="130" y1="85" x2="150" y2="105" class="hm-part"></line>',
    '<line x1="130" y1="120" x2="112" y2="150" class="hm-part"></line>',
    '<line x1="130" y1="120" x2="148" y2="150" class="hm-part"></line>',
  ];
  function gallowsSVG(wrongCount) {
    const parts = PARTS.slice(0, wrongCount).join('');
    return `<svg viewBox="0 0 200 200" class="hm-gallows">
      <line x1="20" y1="185" x2="100" y2="185" class="hm-post"></line>
      <line x1="45" y1="185" x2="45" y2="20" class="hm-post"></line>
      <line x1="45" y1="20" x2="130" y2="20" class="hm-post"></line>
      <line x1="130" y1="20" x2="130" y2="46" class="hm-post"></line>
      ${parts}
    </svg>`;
  }

  function blanksHTML(s) {
    return hangmanBlanksHTML(s.blanks);
  }

  function chooseHTML(s) {
    return `<div class="stage"><div class="main"><div class="cluebox">
      <div class="cluemeta">Round ${s.round} of ${s.rounds}</div>
      <div class="cluetext">${esc(s.giverName)} is picking a theme</div>
      ${bar(s.endsAt, s.windowMs)}
    </div></div>${scoreboardHTML(s, { turnId: s.giverId, plain: true })}</div>`;
  }

  function guessingHTML(s) {
    const missed = (s.wrongLetters || []).map(l => `<span>${esc(l)}</span>`).join('');
    return `<div class="stage"><div class="main hm-main">
      <div class="hm-side">${gallowsSVG(s.wrongCount)}<div class="hm-count">${s.wrongCount} of ${s.maxWrong} misses</div></div>
      <div class="hm-center">
        <div class="kicker">Theme from ${esc(s.giverName)}</div>
        <div class="hm-theme">${esc(s.theme)}</div>
        ${blanksHTML(s)}
        <div class="hm-missed">${missed ? `Missed ${missed}` : 'No misses yet'}</div>
        ${bar(s.endsAt, s.windowMs)}
        <div class="note center">The longer it takes, the more ${esc(s.giverName)} earns.</div>
      </div>
    </div>${scoreboardHTML(s, { turnId: s.giverId, plain: true })}</div>`;
  }

  function revealHTML(s) {
    const a = s.awarded || {};
    return `<div class="stage"><div class="main"><div class="cluebox">
      <div class="cluemeta">${a.won ? 'Solved' : 'Nobody got it'}</div>
      <div class="winner">${esc(s.word)}</div>
      <div class="status">${esc(s.giverName)} earns ${a.giverPts} pts${a.solverName ? `. ${esc(a.solverName)} called the whole word for a bonus.` : ''}</div>
    </div></div>${scoreboardHTML(s, { plain: true })}</div>`;
  }


  GAMES.hangman.tv = {
    html(s) {
      if (s.phase === 'choosing') return chooseHTML(s);
      if (s.phase === 'guessing') return guessingHTML(s);
      if (s.phase === 'reveal') return revealHTML(s);
      return finalScoresTV(s);
    },
    sounds(a, b) {
      if (!a) return;
      if (b.wrongCount > a.wrongCount) sfx.wrong();
      if ((b.guessedLetters || []).length > (a.guessedLetters || []).length) sfx.right();
      if (b.phase === 'reveal' && a.phase !== 'reveal') sfx[(b.awarded || {}).won ? 'fanfare' : 'buzz']();
    },
  };
})();
