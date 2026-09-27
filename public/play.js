'use strict';
const app = $('#app');
const LS_TOKEN = 'pg_token';
const LS_NAME = 'pg_name';

let state = null;
let lastScreen = '';
let draft = { wager: '', answer: '' };

const socket = connect({ role: 'player' }, s => { state = s; render(); });

socket.on('connect', () => {
  const token = localStorage.getItem(LS_TOKEN);
  const name = localStorage.getItem(LS_NAME);
  if (token && name) doJoin(name);
  else showJoin();
});
socket.on('kicked', () => {
  localStorage.removeItem(LS_TOKEN);
  state = null;
  showJoin('You were removed from the game.');
});

function showJoin(err) {
  lastScreen = 'join';
  app.innerHTML = `<div class="wrap join">
    <div class="join-hero">${brandMark()}<p class="join-tag">Game night, poolside</p></div>
    <div class="card join-card">
      <label for="name">Your name</label>
      <input id="name" maxlength="14" autocomplete="off" autocapitalize="words" placeholder="e.g. Sam" value="${esc(localStorage.getItem(LS_NAME) || '')}">
      <button id="go" class="primary">Join the party</button>
      <p class="err">${esc(err || '')}</p>
    </div>
  </div>`;
  const go = () => {
    const name = $('#name').value.trim();
    if (!name) { $('.err').textContent = 'Enter a name first.'; return; }
    doJoin(name);
  };
  $('#go').onclick = go;
  $('#name').onkeydown = e => { if (e.key === 'Enter') go(); };
}

function doJoin(name) {
  socket.emit('join', { name, token: localStorage.getItem(LS_TOKEN) }, res => {
    if (!res || res.error) { showJoin(res ? res.error : 'Could not join.'); return; }
    localStorage.setItem(LS_TOKEN, res.token);
    localStorage.setItem(LS_NAME, res.name);
  });
}

async function act(type, payload) {
  const err = await send(socket, type, payload);
  if (err) toast(err);
  return err;
}

// ---- hub: the first connected player hosts, right from their phone -------
const rosterHTML = s => `<ul class="pchips">${s.players.map(p =>
  `<li class="pchip${p.connected ? '' : ' away'}" style="--color:${p.color}"><span class="dot"></span>${esc(p.name)}</li>`).join('')}</ul>`;

function hostPickerHTML(s) {
  const entry = s.hubMenu && GAME_MENU.find(g => g.id === s.hubMenu);
  if (entry) {
    const variants = gameVariants(entry, s) || [{ key: 'go', label: 'Start game', opts: {} }];
    return `<div class="detail-head">${gameBadge(entry.id, 'lg')}<div><p class="say">${esc(entry.name)}</p><p class="note">${esc(entry.tagline)}</p></div></div>
      <p class="kicker">${variants.length > 1 ? 'Choose how to play' : 'Ready?'}</p>
      <div class="choices">${variants.map(v => `<button class="choice variant" data-variant="${v.key}">${icon('play')}<span>${esc(v.label)}</span></button>`).join('')}</div>
      <button class="ghost big" id="menuBack">Back to games</button>`;
  }
  return `<p class="kicker">You're the host</p><p class="say">Pick a game</p>
    ${rosterHTML(s)}
    <div class="gamegrid">${GAME_MENU.map(g => {
      const ready = s.players.length >= g.min;
      return `<button class="gametile${ready ? '' : ' locked'}" data-open="${g.id}" ${ready ? '' : 'disabled'}>
        ${gameBadge(g.id)}<span class="gtile-name">${esc(g.name)}</span>
        <span class="gtile-meta">${ready ? esc(g.tagline) : `Needs ${g.min}+ players`}</span></button>`;
    }).join('')}</div>`;
}

function hubScreen(s, amHost) {
  if (!amHost) {
    const host = findPlayer(s, s.hostId);
    return { key: 'hub-wait', html: `<div class="hero-check">${icon('check')}</div>
      <p class="say">You're in!</p>
      <p class="note">${host ? `${esc(host.name)} is picking` : 'The first player to join picks'} a game. Keep an eye on the TV.</p>
      ${rosterHTML(s)}` };
  }
  return { key: `hub-host:${s.hubMenu || ''}`, html: hostPickerHTML(s) };
}

function wireHub(s) {
  document.querySelectorAll('.gametile[data-open]').forEach(b => {
    b.onclick = () => act('hubMenu', { game: b.dataset.open });
  });
  if ($('#menuBack')) $('#menuBack').onclick = () => act('hubMenu', { game: null });
  document.querySelectorAll('.choice[data-variant]').forEach(b => {
    b.onclick = () => {
      const entry = GAME_MENU.find(g => g.id === s.hubMenu);
      const variants = (entry && gameVariants(entry, s)) || [{ key: 'go', label: 'Start', opts: {} }];
      const v = variants.find(x => x.key === b.dataset.variant);
      act('startGame', { type: s.hubMenu, ...(v ? v.opts : {}) });
    };
  });
}

// ---- intro: rules on every phone; the host can start early -------------------
function introScreen(s, amHost) {
  const host = findPlayer(s, s.hostId);
  const action = amHost
    ? `<button class="primary" id="startNow">${icon('play')} Start the game</button>`
    : `<p class="note">Get ready. ${host ? esc(host.name) : 'The host'} will start it any second.</p>`;
  return `${introHTML(s.game)}${action}${bar(s.endsAt, s.windowMs)}`;
}

// ---- a small bar so the host can end or restart a game from their phone --
function hostBarHTML(s) {
  if (s.game === 'hub') return '';
  return `<div class="hostbar">
    <button class="ghost" id="hostRestart">${icon('rotate-ccw')} Restart</button>
    <button class="ghost" id="hostMenu">${icon('house')} Menu</button>
  </div>`;
}
function wireHostBar() {
  if ($('#hostMenu')) $('#hostMenu').onclick = () => { if (confirm('End this game and go back to the game menu?')) act('toMenu'); };
  if ($('#hostRestart')) $('#hostRestart').onclick = () => { if (confirm('Restart this game from the beginning?')) act('reset'); };
}

const POINT_GAMES = ['wavelength', 'pictionary', 'tshirt', 'trivia', 'moviereveal', 'codenames', 'password', 'scattergories', 'hangman', 'neanderthals'];
const headHTML = (me, score) => `<div class="me" style="--color:${me.color}"><b>${esc(me.name)}</b>${score == null ? '' : `<span class="${score.neg ? 'neg' : ''}">${score.text}</span>`}</div>`;

function render() {
  const s = state;
  if (!s) return;
  document.documentElement.dataset.game = s.game;
  const me = findPlayer(s, s.you);
  if (!me) { if (lastScreen !== 'join') showJoin(); return; }
  const amHost = !!(s.you && s.hostId && s.you === s.hostId);

  if (s.phase === 'intro') {
    const sig = `intro:${s.game}:${s.endsAt}:${amHost}`;
    if (lastScreen === sig) return;
    lastScreen = sig;
    app.innerHTML = `<div class="wrap">${headHTML(me, null)}${introScreen(s, amHost)}${amHost ? hostBarHTML(s) : ''}</div>`;
    if ($('#startNow')) $('#startNow').onclick = () => act('startNow');
    if (amHost) wireHostBar();
    return;
  }

  const mod = GAMES[s.game] && GAMES[s.game].phone;
  const screen = s.game === 'hub' || !mod ? hubScreen(s, amHost) : mod.screen(s, me);
  const inputs = (mod && mod.inputScreens) || new Set();
  const stamp = (s.fm && `${s.fm.stage}:${s.fm.step}:${s.fm.idx}`) || (s.current && s.current.endsAt) || (s.final && s.final.endsAt) || s.endsAt || '';
  // Movie Reveal's clue list grows mid-round while endsAt stays fixed; fold the clue count into
  // the signature so a newly-revealed clue still gets through even while the guess input is
  // protected from being wiped mid-keystroke.
  const extra = Array.isArray(s.clues) ? s.clues.length : '';
  const sig = `${s.game}:${screen.key}:${stamp}:${extra}:${amHost}`;
  if (inputs.has(screen.key) && sig === lastScreen) {
    // Don't wipe what's being typed; a module can still patch live bits (feeds, counters) in place.
    if (mod && mod.refresh) mod.refresh(screen.key, s, me);
    return;
  }
  lastScreen = sig;
  const fmt = POINT_GAMES.includes(s.game) ? String : money; // points, not dollars
  const head = screen.head || headHTML(me, me.score === undefined ? null : { text: fmt(me.score), neg: me.score < 0 });
  app.innerHTML = `<div class="wrap">${head}${screen.html}${amHost ? hostBarHTML(s) : ''}</div>`;
  if (s.game === 'hub') wireHub(s);
  else if (mod && mod.wire) mod.wire(screen.key, s, me);
  if (amHost) wireHostBar();
}

// Helpers the game modules share.
function wireInput(id, key) {
  const el = $('#' + id);
  if (el) el.oninput = () => { draft[key] = el.value; };
  return el;
}
function onEnter(el, fn) { if (el) el.onkeydown = e => { if (e.key === 'Enter') fn(); }; }
