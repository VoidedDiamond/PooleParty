'use strict';
(() => {
  const LETTERS = ['A', 'B', 'C', 'D'];

  function choicesHTML(s, reveal) {
    return `<div class="tchoices">${(s.choices || []).map((c, i) => `<div class="tchoice${reveal ? (i === s.correct ? ' right' : ' faded') : ''}">
      <span class="letter">${LETTERS[i]}</span><span>${esc(c)}</span></div>`).join('')}</div>`;
  }

  // Who has answered (no picks shown while the question is open), then who got it right.
  function answeredHTML(s, reveal) {
    const done = new Set(s.answeredIds || []);
    const res = new Map((s.results || []).map(r => [r.id, r]));
    return `<ul class="pchips tanswered">${s.players.filter(p => p.connected || done.has(p.id)).map(p => {
      const r = reveal ? res.get(p.id) : null;
      const cls = reveal ? (r && r.correct ? ' right' : ' wrong') : done.has(p.id) ? ' in' : '';
      const tail = reveal ? (r && r.correct ? `<b>+${r.pts}</b>` : icon('x')) : done.has(p.id) ? icon('check') : '';
      return `<li class="pchip${cls}" style="--color:${p.color}"><span class="dot"></span>${esc(p.name)}${tail}</li>`;
    }).join('')}</ul>`;
  }

  function questionHTML(s, reveal) {
    return `<div class="stage"><div class="tv-header">
        <div><div class="kicker">Question ${s.qIndex} of ${s.totalQuestions} \u00b7 ${esc(s.topic || '')}</div>
        ${s.tierLabel && s.tierLabel !== s.topic ? `<span class="badge">${esc(s.tierLabel)}</span>` : ''}</div>
        ${reveal ? '' : bar(s.endsAt, s.windowMs)}
      </div>
      <div class="main"><div class="cluebox">
        <div class="cluetext small">${esc(s.question)}</div>
        ${choicesHTML(s, reveal)}
        ${answeredHTML(s, reveal)}
      </div></div>${scoreboardHTML(s, { plain: true })}</div>`;
  }

  GAMES.trivia.tv = {
    update(app, s) {
      if (s.phase === 'end') app.innerHTML = finalScoresTV(s);
      else app.innerHTML = questionHTML(s, s.phase === 'reveal');
    },
    sounds(a, b) {
      if (!a) return;
      if (b.phase === 'question' && a.phase !== 'question') sfx.splash();
      if (b.phase === 'reveal' && a.phase !== 'reveal') sfx.pop();
    },
  };
})();
