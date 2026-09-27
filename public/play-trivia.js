'use strict';
(() => {
  const mod = {};
  const LETTERS = ['A', 'B', 'C', 'D'];
  let answeredThisQuestion = false;
  let lastQIndex = -1;

  mod.screen = (s, me) => {
    if (s.phase === 'question') {
      if (s.qIndex !== lastQIndex) { lastQIndex = s.qIndex; answeredThisQuestion = false; }
      if (answeredThisQuestion) {
        return { key: 'answered', html: `<p class="say">Answer locked in!</p>
          <p class="note">${s.answeredCount} player${s.answeredCount === 1 ? '' : 's'} answered\u2026</p>` };
      }
      return { key: 'question', html: `<p class="kicker">Question ${s.qIndex} of ${s.totalQuestions} \u00b7 ${esc(s.tierLabel)}</p>
        <p class="qtext">${esc(s.question)}</p>${bar(s.endsAt, s.windowMs)}
        <div class="vlist">${(s.choices || []).map((c, i) => `<button class="choice tanswer" data-i="${i}">
          <span class="letter">${LETTERS[i]}</span><span>${esc(c)}</span></button>`).join('')}</div>` };
    }

    if (s.phase === 'reveal') {
      const letter = LETTERS[s.correct];
      return { key: 'reveal', html: `<p class="kicker">The answer was</p>
        <p class="reveal-word"><span class="letter">${letter}</span>${esc((s.choices || [])[s.correct] || '')}</p>` };
    }

    return finalScoresPhone(s, me);
  };

  mod.wire = key => {
    if (key === 'question') {
      document.querySelectorAll('.tanswer').forEach(b => {
        b.onclick = async () => {
          answeredThisQuestion = true;
          render();
          if (await act('answer', { choice: Number(b.dataset.i) })) { answeredThisQuestion = false; render(); }
        };
      });
    }
  };

  GAMES.trivia.phone = mod;
})();
