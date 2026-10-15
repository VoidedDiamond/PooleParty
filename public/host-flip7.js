'use strict';
(() => {
  const STATUS = {
    active: '', stayed: '<span class="f7-tag stayed">Stayed</span>', busted: '<span class="f7-tag bust">Bust</span>',
  };

  function rowHTML(s, row) {
    const fresh = c => (s.flipped && s.flipped.card.id === c.id && serverNow() - s.flipped.at < 1500 ? ' fresh' : '');
    const p = findPlayer(s, row.id) || { name: '?', color: '#888', score: 0 };
    const turn = s.wait && s.wait.pid === row.id;
    const res = s.results && s.results.find(r => r.id === row.id);
    const tag = row.flip7 ? '<span class="f7-tag flip7">Flip 7!</span>' : STATUS[row.status] || '';
    const pts = s.phase === 'play' ? (row.status === 'busted' ? '0' : row.roundPts) : res ? `+${res.pts}` : '';
    return `<div class="f7-row${turn ? ' turn' : ''} ${row.status}" style="--color:${p.color}">
      <div class="f7-who"><span class="dot"></span><span class="nm">${esc(p.name)}</span>${s.dealerId === row.id ? '<span class="f7-dealer">D</span>' : ''}<b class="tot">${p.score}</b></div>
      <div class="f7-cards">${row.nums.map(c => F7.card(c, (c.id === row.bustCard ? ' bustcard' : '') + fresh(c))).join('')}
        ${row.mods.length ? `<span class="f7-gap"></span>${row.mods.map(c => F7.card(c, fresh(c))).join('')}` : ''}
        ${row.second ? `<span class="f7-gap"></span>${F7.card({ kind: 'act', act: 'second', label: '2nd Chance' })}` : ''}</div>
      <div class="f7-side">${tag}<b class="f7-pts">${pts}</b></div></div>`;
  }

  function promptHTML(s) {
    if (s.phase === 'roundEnd') return `${icon('flag')} Round ${s.round} is over. Next round in a moment.`;
    const w = s.wait;
    if (!w) return '';
    const p = findPlayer(s, w.pid);
    const n = esc(p ? p.name : 'Someone');
    if (w.type === 'turn') return `${icon('smartphone')} <b>${n}</b>: hit or stay?`;
    return `${icon('smartphone')} <b>${n}</b> is playing ${esc(w.card.label)}…`;
  }

  function screenHTML(s) {
    const f = s.flipped;
    const fp = f && findPlayer(s, f.pid);
    return `<div class="stage f7 ${s.variant}">
      <div class="tv-header"><div><div class="kicker">${esc(s.title)} · Round ${s.round} · First to ${s.target}</div>
        <div class="f7-prompt" id="f7Prompt">${promptHTML(s)}</div></div>${s.wait || s.phase === 'roundEnd' ? bar(s.endsAt, s.windowMs) : ''}</div>
      <div class="main f7-main">
        <div class="f7-table">${s.rows.map(r => rowHTML(s, r)).join('')}</div>
        <aside class="f7-aside">
          <div class="f7-deck"><span class="f7-back">${s.deckCount}</span><span class="f7-flip">${f ? F7.card(f.card, ' big') : ''}</span></div>
          ${fp ? `<div class="f7-who-flipped" style="--color:${fp.color}">${esc(fp.name)}</div>` : ''}
          <ul class="f7-log">${s.log.slice().reverse().map((l, i) => `<li class="${i ? '' : 'new'}">${esc(l.text)}</li>`).join('')}</ul>
        </aside>
      </div></div>`;
  }

  GAMES.flip7.tv = {
    update(app, s) {
      app.innerHTML = s.phase === 'end' ? finalScoresTV(s) : screenHTML(s);
    },
    sounds(a, b) {
      if (!a) return;
      if (b.flipped && (!a.flipped || a.flipped.at !== b.flipped.at)) sfx.flip();
      const was = new Map(a.rows.map(r => [r.id, r]));
      for (const r of b.rows) {
        const o = was.get(r.id);
        if (!o) continue;
        if (r.flip7 && !o.flip7) sfx.bullseye();
        else if (r.status === 'busted' && o.status !== 'busted') sfx.strike();
        else if (r.status === 'stayed' && o.status === 'active') sfx.click();
      }
      if (b.phase === 'roundEnd' && a.phase === 'play') sfx.reveal();
    },
  };
})();
