'use strict';
(() => {
  const mod = {};
  mod.inputScreens = new Set(['draw']);

  let canvasObj = null;
  let currentColor = '#141414';
  let submitted = false;
  let submittedForEndsAt = null; // which round's drawing timer `submitted` applies to

  function toolbarHTML() {
    const colors = ['#141414', '#e53e3e', '#3182ce', '#38a169', '#d69e2e'];
    return `<div class="ptoolbar">
      ${colors.map(c => `<button class="pswatch ${c === currentColor ? 'sel' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
      <button class="ghost" id="tundo">Undo</button>
      <button class="ghost" id="tclear">Clear</button>
    </div>`;
  }

  mod.screen = (s, me) => {
    if (s.phase === 'drawing') {
      // each round gets a fresh drawing timer (endsAt); a new one means a new round started,
      // so any "submitted" flag left over from the previous round no longer applies.
      if (s.endsAt !== submittedForEndsAt) { submitted = false; submittedForEndsAt = s.endsAt; }
      if (submitted) {
        return { key: 'draw-wait', html: `<p class="say">Design submitted!</p>
          <p class="note">Waiting for everyone else (${s.doneCount}/${s.totalCount} done)\u2026</p>` };
      }
      return { key: 'draw', html: `<p class="say">${esc(s.prompt)}</p>${bar(s.endsAt, s.windowMs)}
        <div class="pcanvaswrap phone-canvas">${tshirtTemplateHTML()}<canvas id="tcanvas"></canvas></div>
        ${toolbarHTML()}
        <button class="primary" id="tdone">I'm Done</button>` };
    }

    if (s.phase === 'voting') {
      const myVote = s.myVote;
      if (myVote) {
        return { key: 'vote-wait', html: `<p class="say">Vote submitted!</p>
          <p class="note">Check the TV to see all the designs while we wait for everyone.</p>` };
      }
      return { key: 'vote', html: `<p class="say">Vote for your favorite!</p>
        <p class="note">Check the TV to see all the designs.</p>
        <div class="vlist">${(s.voteOptions || []).map(o => `<button class="choice vchoice" data-id="${o.id}">${icon('heart')} ${esc(o.name)}</button>`).join('')}</div>` };
    }

    if (s.phase === 'results') {
      const mine = (s.results || []).find(r => r.id === me.id);
      return { key: 'results', html: `<p class="say">Results are in!</p>
        <p class="note">${mine ? `Your design got ${mine.votes} vote${mine.votes === 1 ? '' : 's'}!` : ''}</p>
        <p class="note">Check the TV for the full gallery.</p>` };
    }

    return finalScoresPhone(s, me);
  };

  mod.wire = (key) => {
    if (key === 'draw') {
      submitted = false;
      const canvasEl = $('#tcanvas');
      canvasObj = makeCanvas(canvasEl, { interactive: true, size: 7, color: currentColor });
      document.querySelectorAll('.pswatch').forEach(b => {
        b.onclick = () => {
          currentColor = b.dataset.color;
          if (canvasObj) canvasObj.setColor(currentColor);
          document.querySelectorAll('.pswatch').forEach(x => x.classList.remove('sel'));
          b.classList.add('sel');
        };
      });
      if ($('#tclear')) $('#tclear').onclick = () => { if (canvasObj) canvasObj.clear(); };
      if ($('#tundo')) $('#tundo').onclick = () => { if (canvasObj) canvasObj.undo(); };
      if ($('#tdone')) $('#tdone').onclick = () => {
        submitted = true;
        act('submitDrawing', { strokes: canvasObj ? canvasObj.toWire() : [] });
      };
    }
    if (key === 'vote') {
      document.querySelectorAll('.vchoice').forEach(b => {
        b.onclick = () => act('vote', { targetId: b.dataset.id });
      });
    }
  };

  GAMES.tshirt.phone = mod;
})();
