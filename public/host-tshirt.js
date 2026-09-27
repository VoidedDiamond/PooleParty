'use strict';
(() => {
  function drawingHTML(s) {
    return `<div class="stage"><div class="main"><div class="cluebox">
      <div class="cluemeta">Round ${s.roundNum} of ${s.totalRounds} — Design a shirt for:</div>
      <div class="cluetext">${esc(s.prompt)}</div>
      <div class="status">${s.doneCount}/${s.totalCount} done</div>
      ${bar(s.endsAt, s.windowMs)}
    </div></div></div>`;
  }

  function renderGallery(app, designs, votesById, topVotes) {
    const grid = document.createElement('div');
    grid.className = 'tgrid';
    designs.forEach(d => {
      const card = document.createElement('div');
      const votes = votesById ? (votesById.get(d.id) || 0) : null;
      card.className = 'tcard' + (votesById && topVotes > 0 && votes === topVotes ? ' winner' : '');
      card.insertAdjacentHTML('afterbegin', tshirtTemplateHTML());
      const canvasEl = document.createElement('canvas');
      card.appendChild(canvasEl);
      const label = document.createElement('div');
      label.className = 'tlabel';
      label.innerHTML = `<span>${esc(d.name)}</span>${votes != null ? `<span>${votes} ${icon('heart')}</span>` : ''}`;
      card.appendChild(label);
      grid.appendChild(card);
      requestAnimationFrame(() => { makeCanvas(canvasEl, { interactive: false, size: 6 }).renderStatic(d.strokes); });
    });
    app.appendChild(grid);
  }


  GAMES.tshirt.tv = {
    sounds(a, b) {
      if (!a) return;
      if (b.phase === 'drawing' && a.phase !== 'drawing') sfx.splash();
      if (b.phase === 'voting' && a.phase !== 'voting') sfx.whoosh();
      if (b.phase === 'results' && a.phase !== 'results') sfx.pop();
      if (b.doneCount > a.doneCount) sfx.tick();
    },
    update(app, s) {
      if (s.phase === 'drawing') { app.innerHTML = drawingHTML(s); return; }
      if (s.phase === 'end') { app.innerHTML = finalScoresTV(s); return; }

      if (s.phase === 'voting') {
        app.innerHTML = `<div class="stage"><div class="tv-header"><div><div class="kicker">Vote on your phone</div>
          <div class="bigtitle small">${esc(s.prompt)}</div></div>${bar(s.endsAt, s.windowMs)}</div></div>`;
        renderGallery($('.stage', app), s.designs || [], null, 0);
        return;
      }

      // results
      const votesById = new Map((s.results || []).map(r => [r.id, r.votes]));
      const topVotes = Math.max(0, ...((s.results || []).map(r => r.votes)));
      app.innerHTML = `<div class="stage"><div class="tv-header"><div><div class="kicker">Round ${s.roundNum} of ${s.totalRounds} results</div>
        <div class="bigtitle small">${esc(s.prompt)}</div></div></div></div>`;
      renderGallery($('.stage', app), s.designs || [], votesById, topVotes);
    },
  };
})();
