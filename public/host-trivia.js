'use strict';
(() => {
  const LETTERS = ['A', 'B', 'C', 'D'];

  function choicesHTML(s, reveal) {
    return `<div class="tchoices">${(s.choices || []).map((c, i) => `<div class="tchoice${reveal ? (i === s.correct ? ' right' : ' faded') : ''}">
      <span class="letter">${LETTERS[i]}</span><span>${esc(c)}</span></div>`).join('')}</div>`;
  }

  function questionHTML(s, reveal) {
    return `<div class="stage"><div class="tv-header">
        <div><div class="kicker">Question ${s.qIndex} of ${s.totalQuestions} \u00b7 ${esc(s.topic || '')}</div>
        <span class="badge">${esc(s.tierLabel || `Tier ${s.tier}`)}</span></div>
        ${reveal ? '' : bar(s.endsAt, s.windowMs)}
      </div>
      <div class="main"><div class="cluebox">
        <div class="cluetext small">${esc(s.question)}</div>
        ${choicesHTML(s, reveal)}
        <div class="status">${reveal ? `${s.answeredCount} answered` : `${s.answeredCount} answered\u2026`}</div>
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
