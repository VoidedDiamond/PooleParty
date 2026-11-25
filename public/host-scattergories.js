'use strict';
(() => {
  function writingHTML(s) {
    return `<div class="stage"><div class="main">
      <div class="sg-letterwrap"><div class="sg-die">${esc(s.letter)}</div></div>
      <div class="sg-catlist">${s.categories.map((c, i) => `<div class="sg-cat"><b>${i + 1}.</b> ${esc(c)}</div>`).join('')}</div>
      <div class="status">${s.doneCount}/${s.totalCount} done</div>
      ${bar(s.endsAt, s.windowMs)}
    </div></div>`;
  }

  function entryRow(e, showCount) {
    const flags = showCount && e.challengeCount ? `<span class="sg-flags">${icon('flag')}${e.challengeCount}</span>` : '';
    return `<div class="sg-entry"><span class="sg-who">${esc(e.name)}</span><span class="sg-ans">${esc(e.text)}</span>${flags}</div>`;
  }

  function judgingHTML(s) {
    return `<div class="stage"><div class="main">
      <div class="sg-catbar"><div class="sg-die small">${esc(s.letter)}</div><div class="sg-catnow">Category ${s.catIdx + 1} of ${s.categories.length}: ${esc(s.category)}</div></div>
      <div class="sg-entries">${(s.entries || []).map(e => entryRow(e, true)).join('') || '<div class="note center">Nobody wrote an answer for this one.</div>'}</div>
      <div class="status">Challenge on your phone, or tap "no challenge" to move on (${s.respondedCount || 0}/${s.voterCount || 0} done)</div>${bar(s.endsAt, s.windowMs)}
    </div></div>`;
  }

  function resultHTML(s) {
    const rows = (s.verdicts || []).map(v => `<div class="sg-entry ${v.valid ? 'ok' : 'no'}">
      <span class="sg-who">${esc(v.name)}</span><span class="sg-ans">${esc(v.text)}</span>
      <span class="sg-pts">${v.valid ? `+${v.points}` : icon('x')}</span></div>`).join('');
    return `<div class="stage"><div class="main">
      <div class="sg-catbar"><div class="sg-die small">${esc(s.letter)}</div><div class="sg-catnow">${esc(s.category)}</div></div>
      <div class="sg-entries">${rows || '<div class="note center">No answers.</div>'}</div>
    </div></div>`;
  }

  function roundEndHTML(s) {
    return `<div class="stage"><div class="main"><div class="cluebox">
      <div class="cluemeta">Round ${s.round} of ${s.rounds} complete</div>
      <div class="cluetext small">${s.round < s.rounds ? 'New letter coming up' : 'Final scores coming up'}</div>
      ${bar(s.endsAt, s.windowMs)}
    </div></div>${scoreboardHTML(s, { plain: true })}</div>`;
  }

  GAMES.scattergories.tv = {
    html(s) {
      if (s.phase === 'writing') return writingHTML(s);
      if (s.phase === 'judging') return judgingHTML(s);
      if (s.phase === 'catResult') return resultHTML(s);
      if (s.phase === 'roundEnd') return roundEndHTML(s);
      return finalScoresTV(s);
    },
    sounds(a, b) {
      if (!a) return;
      if (b.phase === 'writing' && a.phase !== 'writing') sfx.start();
      if (b.phase === 'judging' && a.phase !== 'judging') sfx.pop();
      if (b.phase === 'catResult' && a.phase !== 'catResult') sfx.flip();
      if (b.phase === 'roundEnd' && a.phase !== 'roundEnd') sfx.kaching();
    },
  };
})();
