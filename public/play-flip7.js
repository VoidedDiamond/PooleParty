'use strict';
(() => {
  const mod = {};
  let swapFirst = null; // first card picked for a Swap
  let sending = false;

  const nameOf = (s, id) => { const p = findPlayer(s, id); return p ? p.name : '?'; };
  const cardById = (s, id) => {
    for (const r of s.rows) { const c = r.nums.concat(r.mods).find(x => x.id === id); if (c) return c; }
    return null;
  };

  function myRowHTML(s, me) {
    const row = s.rows.find(r => r.id === me.id);
    if (!row) return '<p class="note">You join at the next round.</p>';
    const status = row.flip7 ? 'Flip 7!' : row.status === 'busted' ? 'Bust! No points this round.' : row.status === 'stayed' ? `Stayed with ${row.roundPts}` : `This round: ${row.roundPts}`;
    return `<div class="f7-mine ${row.status}"><div class="f7-cards">${row.nums.map(c => F7.card(c, c.id === row.bustCard ? ' bustcard' : '')).join('') || '<span class="note">No cards yet</span>'}
      ${row.mods.map(c => F7.card(c)).join('')}${row.second ? F7.card({ kind: 'act', act: 'second', label: '2nd Chance' }) : ''}</div>
      <p class="f7-status">${status}</p></div>`;
  }

  function chooseHTML(s, w) {
    const head = `<p class="kicker">You flipped ${esc(w.card.label)}</p><div class="f7-big">${F7.card(w.card, ' big')}</div><p class="note">${esc(F7.howTo(w.card))}</p>${bar(s.endsAt, s.windowMs)}`;
    if (w.pick === 'player') {
      return `${head}<div class="vlist">${w.players.map(id => `<button class="choice f7-target" data-target="${id}">
        <span class="dot" style="background:${(findPlayer(s, id) || {}).color}"></span><span>${id === s.you ? 'Me' : esc(nameOf(s, id))}</span></button>`).join('')}</div>`;
    }
    // A card pick: the cards grouped by player.
    const groups = new Map();
    for (const c of w.cards) { if (!groups.has(c.pid)) groups.set(c.pid, []); groups.get(c.pid).push(c.cardId); }
    const step = w.pick === 'two' ? (swapFirst ? 'Now pick a card from a different player.' : 'Pick the first card.') : '';
    return `${head}${step ? `<p class="say small">${step}</p>` : ''}<div class="f7-pickgroups">${[...groups.entries()].map(([pid, ids]) => {
      const off = w.pick === 'two' && swapFirst && swapFirst.pid === pid;
      return `<div class="f7-pickgroup${off ? ' off' : ''}"><div class="f7-pickname">${pid === s.you ? 'Me' : esc(nameOf(s, pid))}</div>
        <div class="f7-cards">${ids.map(id => `<button class="f7-pick${swapFirst && swapFirst.cardId === id ? ' sel' : ''}" data-pid="${pid}" data-card="${id}" ${off ? 'disabled' : ''}>${F7.card(cardById(s, id) || { kind: 'num', v: 0, id })}</button>`).join('')}</div></div>`;
    }).join('')}</div>`;
  }

  mod.screen = (s, me) => {
    if (s.phase === 'end') return finalScoresPhone(s, me);
    const w = s.wait;
    const mine = w && w.pid === me.id;
    if (!(mine && w.type === 'choose' && w.pick === 'two')) swapFirst = null;
    if (s.phase === 'roundEnd') {
      const r = (s.results || []).find(x => x.id === me.id);
      return { key: `re:${s.round}`, html: `<p class="kicker">Round ${s.round} over</p>
        <p class="say">${r ? (r.flip7 ? `Flip 7! +${r.pts}` : r.busted ? 'Bust: +0' : `+${r.pts} points`) : 'Next round soon'}</p>${myRowHTML(s, me)}
        <p class="note">First to ${s.target} wins.</p>` };
    }
    if (mine && w.type === 'turn') {
      return { key: `turn:${s.round}:${w.pid}:${s.endsAt}`, html: `<p class="kicker">Your turn</p>${myRowHTML(s, me)}${bar(s.endsAt, s.windowMs)}
        <div class="f7-buttons"><button class="f7-hit" id="f7Hit">Hit</button><button class="f7-stay" id="f7Stay">Stay</button></div>
        <p class="note">Hit to flip a card (a number you already have busts you). Stay to bank your points.</p>` };
    }
    if (mine && w.type === 'choose') {
      return { key: `choose:${s.round}:${w.card.id}:${swapFirst ? swapFirst.cardId : ''}`, html: chooseHTML(s, w) };
    }
    const who = w ? nameOf(s, w.pid) : '';
    const waitText = !w ? 'Cards are being flipped…' : w.type === 'turn' ? `${esc(who)} is deciding: hit or stay?` : `${esc(who)} is playing ${esc(w.card.label)}…`;
    return { key: `watch:${s.round}:${JSON.stringify(s.rows.find(r => r.id === me.id) || {})}:${waitText}`, html: `<p class="kicker">Round ${s.round} · First to ${s.target}</p>${myRowHTML(s, me)}
      <p class="note">${waitText}</p>` };
  };

  mod.wire = (key, s) => {
    const go = async (type, payload) => {
      if (sending) return;
      sending = true;
      await act(type, payload);
      sending = false;
    };
    if ($('#f7Hit')) $('#f7Hit').onclick = () => go('hit');
    if ($('#f7Stay')) $('#f7Stay').onclick = () => go('stay');
    document.querySelectorAll('.f7-target').forEach(b => { b.onclick = () => go('choose', { target: b.dataset.target }); });
    document.querySelectorAll('.f7-pick').forEach(b => {
      b.onclick = () => {
        const w = s.wait;
        const pick = { pid: b.dataset.pid, cardId: Number(b.dataset.card) };
        if (w.pick === 'card') { go('choose', { cardId: pick.cardId }); return; }
        if (!swapFirst) { swapFirst = pick; render(); return; }
        if (swapFirst.cardId === pick.cardId) { swapFirst = null; render(); return; }
        const first = swapFirst;
        swapFirst = null;
        go('choose', { cardId: first.cardId, cardId2: pick.cardId });
      };
    });
  };

  GAMES.flip7.phone = mod;
})();
