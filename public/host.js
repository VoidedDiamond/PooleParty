'use strict';
const app = $('#app');
let prev = null;

// ---- sound (unlocks on the first click or key press on this page) --------
let audio = null;
function unlockAudio() {
  if (!audio) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audio = new AC(); }
  if (audio && audio.state === 'suspended') audio.resume();
}
['click', 'keydown', 'pointerdown'].forEach(ev => document.addEventListener(ev, unlockAudio));
function tone(freq, ms, type = 'square', vol = 0.07, delay = 0) {
  if (!audio || audio.state !== 'running') return;
  const t0 = audio.currentTime + delay / 1000;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  o.connect(g).connect(audio.destination);
  o.start(t0); o.stop(t0 + ms / 1000);
}
// A rising or falling pitch sweep, used for whoosh-y transitions (round start, reveal build-up).
function sweep(f0, f1, ms, type = 'sine', vol = 0.08, delay = 0) {
  if (!audio || audio.state !== 'running') return;
  const t0 = audio.currentTime + delay / 1000;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + ms / 1000);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  o.connect(g).connect(audio.destination);
  o.start(t0); o.stop(t0 + ms / 1000);
}
const sfx = {
  buzz: () => tone(880, 220, 'square'),
  right: () => { tone(660, 140, 'sine', 0.12); tone(990, 260, 'sine', 0.12, 140); },
  wrong: () => tone(150, 500, 'sawtooth', 0.09),
  dd: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 160, 'triangle', 0.1, i * 120)),
  // water-flavored additions: a splashy whoosh for new rounds, a droplet pop for reveals,
  // a soft tick for the last few seconds on the clock, and a fanfare for the win screen.
  tick: () => tone(1500, 60, 'square', 0.045),
  pop: () => { tone(520, 90, 'sine', 0.09); tone(780, 70, 'sine', 0.05, 40); },
  whoosh: () => sweep(200, 900, 300, 'sine', 0.06),
  splash: () => { sweep(700, 120, 220, 'sine', 0.09); tone(90, 180, 'triangle', 0.06, 120); },
  fanfare: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 260, 'triangle', 0.11, i * 130)),
};
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
  if (s.phase === 'intro') {
    // prev is left alone on purpose: the game's first real state then renders as a fresh start.
    const key = `${s.game}:${s.endsAt}`;
    if (app.dataset.intro !== key) { app.dataset.intro = key; app.innerHTML = introScreenHTML(s); sfx.pop(); }
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
  }
  prev = s;
}

// A last-few-seconds tick, independent of state broadcasts (which only arrive on events)
// so the clock actually ticks down in real time on whatever countdown is currently showing.
let tickedFor = null;
setInterval(() => {
  if (!prev || !prev.endsAt) return;
  const key = `${prev.game}:${prev.phase}:${prev.endsAt}`;
  if (tickedFor === key) return;
  const remain = prev.endsAt - serverNow();
  if (remain > 0 && remain <= 5000) { tickedFor = key; sfx.tick(); }
}, 400);

connect({ role: 'display' }, render);
