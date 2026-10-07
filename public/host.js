'use strict';
const app = $('#app');
let prev = null;

// ---- sound (unlocks on the first click or key press on this page) --------
// Music and effects live in audio.js. Game modules call sfx.<name>().
const sfx = Sound.sfx;
['click', 'keydown', 'pointerdown'].forEach(ev => document.addEventListener(ev, () => Sound.unlock()));

// Browsers keep a page silent (music, sound effects and the host voice) until someone clicks it
// or presses a key once. Say so on the TV until that happens.
function soundHint() {
  const active = navigator.userActivation ? navigator.userActivation.hasBeenActive : false;
  let el = $('#soundhint');
  if (active) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'soundhint';
    el.innerHTML = `${icon('volume-2')} Click or press any key to turn on sound`;
    document.body.appendChild(el);
  }
}
['click', 'keydown', 'pointerdown'].forEach(ev => document.addEventListener(ev, () => setTimeout(soundHint, 0)));
setTimeout(soundHint, 1500);

// Which loop plays: the menu theme in the lobby, each game's own theme, a victory loop on the
// final scores.
function musicFor(s) {
  if (s.game === 'hub') return 'lobby';
  if (s.phase === 'end') return 'victory';
  return s.game;
}

// ---- lobby ----------------------------------------------------------------
// Left: the logo, the join QR code and who's in. Right: the game grid, mirroring the host's phone.
function playersHTML(s) {
  const live = s.players.filter(p => p.connected).length;
  const list = s.players.length
    ? `<ul class="pchips">${s.players.map(p => `<li class="pchip${p.connected ? '' : ' away'}" style="--color:${p.color}"><span class="dot"></span>${esc(p.name)}</li>`).join('')}</ul>`
    : '<p class="side-empty">Nobody yet. Scan the code to join.</p>';
  return `<div class="side-label">${icon('users')} Players <span class="count">${live}</span></div>${list}`;
}

function pickerHTML(s) {
  const host = findPlayer(s, s.hostId);
  return host && host.connected ? `${icon('smartphone')}<span><b>${esc(host.name)}</b> is choosing a game</span>` : `${icon('smartphone')}<span>The first player to join picks the game</span>`;
}

function joinHTML(s) {
  const url = esc(String(s.joinUrl || '').replace(/^https?:\/\//, ''));
  if (s.wifiSsid) {
    return `<div class="join-steps">
      <figure class="qrcard"><img src="/wifi-qr.svg" alt="QR code to join the Wi-Fi"><figcaption><b>1</b>Join Wi-Fi<span>${esc(s.wifiSsid)}</span></figcaption></figure>
      <figure class="qrcard"><img src="/qr.svg" alt="QR code to join the game"><figcaption><b>2</b>Join the game<span>${url}</span></figcaption></figure>
    </div>`;
  }
  return `<figure class="qrcard solo"><img src="/qr.svg" alt="QR code to join the game"></figure>
    <div class="join-url">${icon('smartphone')}${url}</div>`;
}

function menuHTML(s) {
  const entry = s.hubMenu && GAME_MENU.find(g => g.id === s.hubMenu);
  if (entry) {
    const variants = gameVariants(entry, s) || [{ key: 'go', label: 'Ready to start' }];
    const host = findPlayer(s, s.hostId);
    return `<div class="hubdetail">
      ${gameBadge(entry.id, 'xl')}
      <div class="hubdetail-name">${esc(entry.name)}</div>
      <div class="hubdetail-tag">${esc(entry.tagline)}</div>
      <div class="hubdetail-variants">${variants.map(v => `<span class="vchip">${esc(v.label)}</span>`).join('')}</div>
      <div class="hubdetail-hint">${icon('smartphone')} Choosing on ${esc(host ? host.name : 'the host')}'s phone</div>
    </div>`;
  }
  return `<div class="kicker menu-kicker">Pick a game</div><div class="hubgrid">${GAME_MENU.map(g => {
    const ready = s.players.length >= g.min;
    return `<div class="gtile${ready ? '' : ' locked'}">${gameBadge(g.id)}
      <div class="gtile-name">${esc(g.name)}</div>
      <div class="gtile-meta">${ready ? esc(g.tagline) : `${icon('lock')} Needs ${g.min}+ players`}</div></div>`;
  }).join('')}</div>`;
}

function hubHTML(s) {
  return `<div class="lobby">
    <aside class="lobby-side">
      <div class="lobby-brand">${brandMark()}</div>
      <div class="lobby-join"><div class="side-label">${icon('smartphone')} Join on your phone</div>${joinHTML(s)}</div>
      <div class="lobby-players" id="roster">${playersHTML(s)}</div>
      <div class="lobby-picker" id="picker">${pickerHTML(s)}</div>
    </aside>
    <main class="lobby-main" id="hubmenu">${menuHTML(s)}</main>
  </div>`;
}

// ---- intro ----------------------------------------------------------------
// The server holds each new game in phase 'intro' (rules on screen, no game clock running) until
// the host taps Start or the intro timer runs out.
function introScreenHTML(s) {
  const host = findPlayer(s, s.hostId);
  return `<div class="stage intro-stage">${introHTML(s.game)}
    <div class="intro-foot">${bar(s.endsAt, s.windowMs)}
      <div class="intro-hint">${icon('smartphone')} ${host ? `${esc(host.name)} can start it now from their phone` : 'Starting in a moment'}</div></div>
  </div>`;
}

function render(s) {
  document.documentElement.dataset.game = s.game;
  Sound.setVolumes(s.sound);
  Announcer.configure(s.voice);
  Sound.music(musicFor(s));
  if (s.phase === 'intro') {
    // prev is left alone on purpose: the game's first real state then renders as a fresh start.
    const key = `${s.game}:${s.endsAt}`;
    if (app.dataset.intro !== key) { app.dataset.intro = key; app.innerHTML = introScreenHTML(s); sfx.pop(); Announcer.welcome(s); }
    return;
  }
  app.dataset.intro = '';
  const g = GAMES[s.game];
  const same = prev && prev.game === s.game;
  if (prev && !same) {
    if (s.game !== 'hub') sfx.whoosh(); // a new game just started
    else if (prev.game !== 'hub') sfx.pop(); // back to the menu
  }
  if (prev && prev.phase !== 'end' && s.phase === 'end') sfx.fanfare();
  if (prev && s.game === 'hub' && prev.game === 'hub') {
    const live = x => x.players.filter(p => p.connected).length;
    if (live(s) > live(prev)) sfx.join();
    else if (live(s) < live(prev)) sfx.leave();
    if (s.hubMenu !== prev.hubMenu) sfx[s.hubMenu ? 'select' : 'swoosh']();
  }
  if (s.game === 'hub') {
    if (same && $('#roster')) {
      $('#roster').innerHTML = playersHTML(s);
      $('#picker').innerHTML = pickerHTML(s);
      $('#hubmenu').innerHTML = menuHTML(s);
    } else app.innerHTML = hubHTML(s);
  } else if (g && g.tv) {
    if (!same) app.innerHTML = '';
    if (g.tv.update) g.tv.update(app, s, same ? prev : null);
    else app.innerHTML = g.tv.html(s);
    if (g.tv.sounds) g.tv.sounds(same ? prev : null, s);
    Announcer.observe(same ? prev : null, s);
  }
  prev = s;
}

// The last five seconds of any countdown tick out loud, one tick per second, independent of
// state broadcasts (which only arrive on events).
let lastTick = null;
setInterval(() => {
  const s = prev;
  if (!s) return;
  const endsAt = s.endsAt || (s.current && s.current.endsAt) || (s.fm && s.fm.endsAt) || (s.final && s.final.endsAt);
  if (!endsAt || s.phase === 'intro') return;
  const left = Math.ceil((endsAt - serverNow()) / 1000);
  if (left < 1 || left > 5) return;
  const key = `${endsAt}:${left}`;
  if (lastTick === key) return;
  lastTick = key;
  if (left <= 2) sfx.tock(); else sfx.tick();
}, 100);

connect({ role: 'display' }, render);
