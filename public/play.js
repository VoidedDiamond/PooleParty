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
    ${rosterHTML(s)}${settingsRowHTML(s)}
    <div class="gamegrid">${GAME_MENU.map(g => {
      const ready = s.players.length >= g.min;
      return `<button class="gametile${ready ? '' : ' locked'}" data-open="${g.id}" ${ready ? '' : 'disabled'}>
        ${gameBadge(g.id)}<span class="gtile-name">${esc(g.name)}</span>
        <span class="gtile-meta">${ready ? esc(g.tagline) : `Needs ${g.min}+ players`}</span></button>`;
    }).join('')}</div>`;
}

// ---- Sound & host settings (host's phone) ------------------------------------
// A sheet over the screen, so screen re-renders don't interrupt a slider mid-drag. The API key
// itself lives on the laptop; the phone only switches things on and off.
function settingsRowHTML(s) {
  const snd = s.sound || {};
  const v = s.voice || { mode: 'off' };
  const voice = { off: 'Host off', classic: 'Classic host', ai: 'AI host' }[v.mode] || '';
  return `<button class="setrow" id="openSettings">${icon('sliders')}<span><b>Sound & host</b>
    <small>Music ${snd.music ?? 0}% · Effects ${snd.sfx ?? 0}% · ${voice}${s.aiJudge ? ' · AI answers' : ''}</small></span>${icon('volume-2')}</button>`;
}

const STYLE_CHOICES = [['gameshow', 'Game show'], ['sports', 'Sports'], ['trailer', 'Trailer'], ['grandma', 'Grandma'], ['pirate', 'Pirate'], ['mix', 'Mix']];
const STYLE_NOTES = {
  gameshow: 'A big-hearted game show host.', sports: 'A play-by-play sports announcer.', trailer: 'A dramatic movie-trailer narrator.',
  grandma: 'A sweet, sassy grandma.', pirate: 'A jolly pirate captain.', mix: 'A different host every game.',
};
const COUNTRY = { 'United States': 'US', 'United Kingdom': 'UK', Australia: 'Australia', Canada: 'Canada', India: 'India', Ireland: 'Ireland', 'New Zealand': 'NZ', 'South Africa': 'South Africa' };
// "Microsoft Andrew Online (Natural) - English (United States)" -> "Andrew (US)"
function voiceLabel(name) {
  const m = /^Microsoft (\w+)(?: Online)?(?: \(Natural\))? - English \(([^)]+)\)/.exec(name);
  return m ? `${m[1]} (${COUNTRY[m[2]] || m[2]})` : name.replace(/^Microsoft /, '');
}
const segBtn = (attr, val, cur, label) => `<button class="seg${cur === val ? ' sel' : ''}" data-${attr}="${val}">${label}</button>`;

// The host: on/off and AI, character, voice, reading aloud.
function hostSettingsHTML(s) {
  const v = s.voice || { mode: 'off', ai: false };
  const voiceNote = v.mode === 'ai' ? 'Claude writes a fresh line for each big moment.'
    : v.mode === 'classic' ? (v.ai ? 'Pre-written lines. Switch to AI for lines about what actually happened.' : 'Pre-written lines. Save anthropic-api-key.txt on the laptop\'s Desktop to unlock the AI host.')
      : 'The host is quiet.';
  const voices = s.tvVoices || [];
  const natural = voices.filter(x => x.natural);
  const other = voices.filter(x => !x.natural);
  const opt = x => `<option value="${esc(x.name)}"${v.voiceName === x.name ? ' selected' : ''}>${esc(voiceLabel(x.name))}</option>`;
  const voiceNoteText = !voices.length ? "The TV hasn't listed its voices yet. Open the TV page and click it once."
    : natural.length ? 'Natural voices sound most lifelike.'
      : 'These voices sound robotic. For lifelike ones, open the TV page in Microsoft Edge.';
  const choice = v.styleChoice || 'gameshow';
  return `<div class="voicebox-head">${icon('mic')}<b>Host voice</b><button class="ghost voicetest" id="voiceTest" ${v.mode === 'off' ? 'disabled' : ''}>${icon('volume-2')} Test</button></div>
    <div class="seggroup">${segBtn('voice', 'off', v.mode, 'Off')}${segBtn('voice', 'classic', v.mode, 'Classic')}${segBtn('voice', 'ai', v.mode, 'AI')}</div>
    <p class="note">${voiceNote}</p>
    <div class="voicebox-head">${icon('mic')}<b>How often the host talks</b></div>
    <div class="seggroup">${segBtn('chat', 'less', v.chat || 'normal', 'Less')}${segBtn('chat', 'normal', v.chat || 'normal', 'Normal')}${segBtn('chat', 'more', v.chat || 'normal', 'More')}</div>
    <p class="note">${{ less: 'Only the big moments, and a comment now and then.', normal: 'Big moments, plus a comment every so often.', more: 'Reacts to most answers.' }[v.chat || 'normal']}</p>
    <div class="voicebox-head">${icon('users')}<b>Host character</b></div>
    <div class="seggroup">${STYLE_CHOICES.map(([id, label]) => segBtn('style', id, choice, label)).join('')}</div>
    <p class="note">${STYLE_NOTES[choice] || ''}${choice === 'mix' && v.style ? ` This game: ${esc((STYLE_CHOICES.find(x => x[0] === v.style) || [])[1] || '')}.` : ''}</p>
    <label class="voicepick">${icon('volume-2')}<select id="voiceSel">
      <option value="">Auto: best voice for the character</option>
      ${natural.length ? `<optgroup label="Natural voices">${natural.map(opt).join('')}</optgroup>` : ''}
      ${other.length ? `<optgroup label="${natural.length ? 'Other voices' : 'Voices on this TV'}">${other.map(opt).join('')}</optgroup>` : ''}
    </select></label>
    <p class="note">${voiceNoteText}</p>
    <div class="voicebox-head">${icon('list-checks')}<b>Read questions aloud</b></div>
    <div class="seggroup two">${segBtn('read', 'off', v.readAloud === false ? 'off' : 'on', 'Off')}${segBtn('read', 'on', v.readAloud === false ? 'off' : 'on', 'On')}</div>
    <p class="note">The host reads out questions, clues and categories, like a real game show.</p>`;
}

// AI answers, spending, and any Claude problem.
function aiSettingsHTML(s) {
  const v = s.voice || { mode: 'off', ai: false };
  const judgeNote = !v.ai ? 'Needs anthropic-api-key.txt on the laptop\'s Desktop. Without it, answers are checked by spelling only.'
    : s.aiJudge ? 'Claude checks answers that look wrong ("boot" for "Shoes") and writes tougher multiple-choice options for Jeopardy.'
      : 'Answers are checked by spelling only, and Jeopardy options come from the clue bank.';
  return `<div class="voicebox-head">${icon('sparkles')}<b>AI answers</b></div>
    <div class="seggroup two">${segBtn('judge', 'off', s.aiJudge ? 'on' : 'off', 'Off')}${segBtn('judge', 'on', s.aiJudge ? 'on' : 'off', 'On')}</div>
    <p class="note">${judgeNote}</p>
    ${aiSpendHTML(s)}
    ${v.error ? `<p class="note no">${esc(v.error)}</p>` : v.ai && v.keyWhere ? `<p class="note">${icon('check')} API key found on ${esc(v.keyWhere.replace('your ', "the laptop's "))}.</p>` : ''}`;
}

// What Claude has cost so far, and the cap after which the free offline host and judge take over.
const dollars = n => `$${(n || 0) < 10 ? (n || 0).toFixed(2) : Math.round(n)}`;
function aiSpendHTML(s) {
  const a = s.ai;
  if (!a) return '';
  const cap = a.budget || 0;
  const pct = cap ? Math.min(100, Math.round((a.session / cap) * 100)) : 0;
  const opt = (val, label) => `<button class="seg${cap === val ? ' sel' : ''}" data-budget="${val}">${label}</button>`;
  return `<div class="voicebox-head">${icon('timer')}<b>AI spending</b></div>
    <div class="spend"><b>${dollars(a.session)}</b> this session${cap ? ` of ${dollars(cap)}` : ''} · ${a.requests} request${a.requests === 1 ? '' : 's'} · ${dollars(a.month)} this month</div>
    ${cap ? `<div class="spendbar"><i style="width:${pct}%"></i></div>` : ''}
    <div class="seggroup five">${opt(0.5, '$0.50')}${opt(1, '$1')}${opt(2, '$2')}${opt(5, '$5')}${opt(0, 'No cap')}</div>
    <p class="note">The most one session can spend on AI. After that the free offline host and judge take over.</p>`;
}

const SLIDERS = [['music', 'music', 'Music'], ['sfx', 'bell', 'Sound effects'], ['voice', 'mic', 'Host voice']];

function openSettings() {
  if ($('#settingsSheet')) return;
  const snd = (state && state.sound) || {};
  const el = document.createElement('div');
  el.className = 'sheet-backdrop';
  el.id = 'settingsSheet';
  el.innerHTML = `<div class="sheet settings" role="dialog" aria-modal="true"><p class="say">Sound & host</p>
    <div class="sliders">${SLIDERS.map(([k, ic, label]) => `<label class="slider">${icon(ic)}<span>${label}</span>
      <input type="range" min="0" max="100" step="5" data-vol="${k}" value="${snd[k] ?? 0}"><output>${snd[k] ?? 0}</output></label>`).join('')}</div>
    <div id="setHost" class="setpart">${hostSettingsHTML(state)}</div>
    <div id="setAi" class="setpart">${aiSettingsHTML(state)}</div>
    <button class="primary" data-done>Done</button></div>`;
  const close = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 180); };
  // Volume changes go out a few times a second while dragging, and once more on release.
  const timers = {};
  el.querySelectorAll('[data-vol]').forEach(r => {
    const out = r.nextElementSibling;
    const push = () => act('sound', { [r.dataset.vol]: Number(r.value) });
    r.oninput = () => {
      out.textContent = r.value;
      if (!timers[r.dataset.vol]) timers[r.dataset.vol] = setTimeout(() => { timers[r.dataset.vol] = null; push(); }, 150);
    };
    r.onchange = push;
  });
  el.addEventListener('change', e => { if (e.target.id === 'voiceSel') act('voiceName', { name: e.target.value || null }); });
  el.onclick = e => {
    const b = e.target.closest('button');
    if (e.target === el || (b && b.hasAttribute('data-done'))) { close(); return; }
    if (!b) return;
    if (b.dataset.voice) act('voiceMode', { mode: b.dataset.voice });
    else if (b.dataset.style) act('hostStyle', { style: b.dataset.style });
    else if (b.dataset.read) act('readAloud', { on: b.dataset.read === 'on' });
    else if (b.dataset.chat) act('hostChat', { chat: b.dataset.chat });
    else if (b.dataset.judge) act('aiJudge', { on: b.dataset.judge === 'on' });
    else if (b.dataset.budget !== undefined) act('aiBudget', { budget: Number(b.dataset.budget) });
    else if (b.id === 'voiceTest') act('voiceTest');
  };
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
}

// Keep an open sheet in step with the server (another tap, an error), without touching a
// slider that's being dragged.
function refreshSettings(s) {
  const el = $('#settingsSheet');
  if (!el) return;
  const amHost = !!(s.you && s.hostId && s.you === s.hostId);
  if (!amHost) { el.remove(); return; }
  // Each part redraws only when it changed, so an open voice list isn't closed by the spending meter.
  for (const [id, fn] of [['setHost', hostSettingsHTML], ['setAi', aiSettingsHTML]]) {
    const part = $(`#${id}`, el);
    const html = fn(s);
    if (part.dataset.html !== html && !(id === 'setHost' && document.activeElement && document.activeElement.id === 'voiceSel')) { part.innerHTML = html; part.dataset.html = html; }
  }
  el.querySelectorAll('[data-vol]').forEach(r => {
    const v = (s.sound || {})[r.dataset.vol];
    if (v != null && document.activeElement !== r && Number(r.value) !== v) { r.value = v; r.nextElementSibling.textContent = v; }
  });
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
  if ($('#openSettings')) $('#openSettings').onclick = openSettings;
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
  return `${introHTML(s.game, s.rules)}${action}${bar(s.endsAt, s.windowMs)}`;
}

// ---- a small bar so the host can end or restart a game from their phone --
function hostBarHTML(s) {
  if (s.game === 'hub') return '';
  return `<div class="hostbar">
    <button class="ghost" id="hostRestart">${icon('rotate-ccw')} Restart</button>
    <button class="ghost" id="hostMenu">${icon('house')} Menu</button>
    <button class="ghost icononly" id="hostSound" aria-label="Sound and host settings">${icon('volume-2')}</button>
  </div>`;
}
// An in-app confirmation sheet (instead of the browser's confirm() box). Resolves true or false.
function confirmSheet(title, note, okLabel) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'sheet-backdrop';
    el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><p class="say">${esc(title)}</p><p class="note">${esc(note)}</p>
      <button class="primary" data-ok>${esc(okLabel)}</button><button class="ghost big" data-cancel>Keep playing</button></div>`;
    const done = ok => { el.classList.remove('show'); setTimeout(() => el.remove(), 180); resolve(ok); };
    el.onclick = e => {
      if (e.target.closest('[data-ok]')) done(true);
      else if (e.target === el || e.target.closest('[data-cancel]')) done(false);
    };
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
  });
}
// Lobby only: a sheet with the name box, prefilled.
function wireRename(me) {
  const b = $('#renameBtn');
  if (!b) return;
  b.onclick = () => {
    const el = document.createElement('div');
    el.className = 'sheet-backdrop';
    el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><p class="say">Change your name</p>
      <input id="newName" maxlength="14" autocomplete="off" autocapitalize="words" value="${esc(me.name)}">
      <p class="err" id="renameErr"></p>
      <button class="primary" data-ok>Save</button><button class="ghost big" data-cancel>Cancel</button></div>`;
    const close = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 180); };
    const save = async () => {
      const name = $('#newName', el).value.trim();
      if (!name) { $('#renameErr', el).textContent = 'Type a name first.'; return; }
      const err = await send(socket, 'rename', { name });
      if (err) { $('#renameErr', el).textContent = err; return; }
      localStorage.setItem(LS_NAME, name);
      close();
    };
    el.onclick = e => {
      if (e.target.closest('[data-ok]')) save();
      else if (e.target === el || e.target.closest('[data-cancel]')) close();
    };
    $('#newName', el).onkeydown = e => { if (e.key === 'Enter') save(); };
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.classList.add('show'); $('#newName', el).select(); });
  };
}

function wireHostBar() {
  if ($('#hostMenu')) $('#hostMenu').onclick = async () => { if (await confirmSheet('End this game?', 'Everyone goes back to the game menu. Scores from this game are cleared.', 'End game')) act('toMenu'); };
  if ($('#hostRestart')) $('#hostRestart').onclick = async () => { if (await confirmSheet('Restart this game?', 'It starts over from round one with fresh content.', 'Restart')) act('reset'); };
  if ($('#hostSound')) $('#hostSound').onclick = openSettings;
}

const POINT_GAMES = ['wavelength', 'pictionary', 'tshirt', 'trivia', 'moviereveal', 'codenames', 'password', 'scattergories', 'hangman', 'neanderthals', 'cubes', 'scales', 'memory', 'quickmath', 'popinorder', 'flip7', 'oddoneout', 'colorclash', 'blurry'];
const headHTML = (me, score, editable = false) => `<div class="me" style="--color:${me.color}"><b>${esc(me.name)}</b>${editable
  ? `<button class="ghost me-edit" id="renameBtn">${icon('pencil')} Change name</button>`
  : score == null ? '' : `<span class="${score.neg ? 'neg' : ''}">${score.text}</span>`}</div>`;

function render() {
  const s = state;
  if (!s) return;
  refreshSettings(s);
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
  const sig = `${s.game}:${screen.key}:${stamp}:${amHost}`;
  if (inputs.has(screen.key) && sig === lastScreen) {
    // Don't wipe what's being typed; a module can still patch live bits (feeds, counters) in place.
    if (mod && mod.refresh) mod.refresh(screen.key, s, me);
    return;
  }
  lastScreen = sig;
  const fmt = POINT_GAMES.includes(s.game) ? String : money; // points, not dollars
  const head = screen.head || headHTML(me, me.score === undefined ? null : { text: fmt(me.score), neg: me.score < 0 }, s.game === 'hub');
  app.innerHTML = `<div class="wrap">${teamBarHTML(s, me)}${head}<main class="screen">${screen.html}</main>${amHost ? hostBarHTML(s) : ''}</div>`;
  markIdle();
  if (s.game === 'hub') { wireHub(s); wireRename(me); }
  else if (mod && mod.wire) mod.wire(screen.key, s, me);
  if (amHost) wireHostBar();
}

// In team games (Codenames, Family Feud, Neanderthals teams): a bar in your team's color across
// the top of the phone and a matching frame around the edge, so you always know your side.
function teamOf(s, me) {
  if (!s.teams || !Array.isArray(s.teams)) return null;
  const mine = (s.players || []).find(p => p.id === me.id);
  const t = mine && mine.team != null ? s.teams[mine.team] : null;
  return t && t.color ? t : null;
}
function teamBarHTML(s, me) {
  const t = teamOf(s, me);
  document.body.classList.toggle('onteam', !!t);
  if (!t) return '';
  document.body.style.setProperty('--teamc', t.color);
  // "Team Red", "Team Glad", "Avery's team" stay as they are; Feud's one-player "Blake" reads "Blake's team".
  const name = /team/i.test(t.name) ? t.name : `${t.name}'s team`;
  return `<div class="teambar" style="--tc:${t.color}">${icon('users')} You're on <b>${esc(name)}</b></div>`;
}

function markIdle() {
  const el = $('.screen');
  if (!el || el.querySelector('button, input, canvas, .wldial.live')) return;
  el.classList.add('idle');
  const busy = el.querySelector('.hero-check, .verdict, .reveal-word, .pw-word-phone, .ranking, .wldial, .wmini, .cn-pgrid, .intro, .hm-tvblanks, .mclues, .fmpcol, .sg-prow, .qtext');
  if (!busy) el.insertAdjacentHTML('afterbegin', `<div class="idle-mark">${icon('tv')}</div>`);
}

// Helpers the game modules share.
function wireInput(id, key) {
  const el = $('#' + id);
  if (el) el.oninput = () => { draft[key] = el.value; };
  return el;
}
// Some Android keyboards report Enter only as keyCode 13, not as e.key.
function onEnter(el, fn) {
  if (!el) return;
  el.setAttribute('enterkeyhint', 'send');
  el.onkeydown = e => { if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); fn(); } };
}
