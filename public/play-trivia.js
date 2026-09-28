'use strict';
(() => {
  const mod = {};
  const LETTERS = ['A', 'B', 'C', 'D'];
  let answeredThisQuestion = false;
  let lastQIndex = -1;

  mod.screen = (s, me) => {
    if (s.phase === 'question') {
      if (s.qIndex !== lastQIndex) { lastQIndex = s.qIndex; answeredThisQuestion = false; }
      if (answeredThisQuestion || s.myAnswer) {
        const pick = s.myAnswer ? s.myAnswer.idx : null;
        return { key: 'answered', html: `<p class="kicker">Answer locked in</p>
          ${pick != null ? `<p class="reveal-word"><span class="letter">${LETTERS[pick]}</span>${esc((s.choices || [])[pick] || '')}</p>` : ''}
          <p class="note">${s.answeredCount} of ${s.players.filter(p => p.connected).length} answered. Faster right answers score more.</p>` };
      }
      return { key: 'question', html: `<p class="kicker">Question ${s.qIndex} of ${s.totalQuestions} \u00b7 ${esc(s.tierLabel)}</p>
        <p class="qtext">${esc(s.question)}</p>${bar(s.endsAt, s.windowMs)}
        <div class="vlist">${(s.choices || []).map((c, i) => `<button class="choice tanswer" data-i="${i}">
          <span class="letter">${LETTERS[i]}</span><span>${esc(c)}</span></button>`).join('')}</div>` };
    }

    if (s.phase === 'reveal') {
      const letter = LETTERS[s.correct];
      const mine = s.myAnswer;
      const verdict = !mine ? { cls: 'miss', title: 'Out of time', note: 'No answer this round.' }
        : mine.correct ? { cls: 'good', title: 'Correct!', note: `+${mine.pts} points` }
          : { cls: 'bad', title: 'Not quite', note: `You picked ${LETTERS[mine.idx]}.` };
      return { key: 'reveal', html: `<div class="verdict ${verdict.cls}">${icon(mine && mine.correct ? 'check' : 'x')}</div>
        <p class="say">${verdict.title}</p><p class="note">${esc(verdict.note)}</p>
        <p class="kicker">The answer was</p>
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
