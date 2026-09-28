'use strict';
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { Jeopardy } = require('./games/jeopardy');
const { Feud } = require('./games/feud');
const { Wheel } = require('./games/wheel');
const { Wavelength } = require('./games/wavelength');
const { Pictionary } = require('./games/pictionary');
const { Tshirt } = require('./games/tshirt');
const { Trivia } = require('./games/trivia');
const { MovieReveal } = require('./games/moviereveal');
const { Codenames } = require('./games/codenames');
const { Password } = require('./games/password');
const { Scattergories } = require('./games/scattergories');
const { Hangman } = require('./games/hangman');
const { Neanderthals } = require('./games/neanderthals');
const content = require('./games/content');

const PORT = Number(process.env.PORT) || 3000;
const HOST_KEY = process.env.HOST_KEY || crypto.randomBytes(3).toString('hex');
const flag = name => { const a = process.argv.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; };
const MAX_PLAYERS = 10;
const LOBBY_AWAY_PRUNE_MS = 60000;
const COLORS = ['#ff5d5d', '#4fd18b', '#5aa9ff', '#ffa94d', '#c084fc', '#38d5e8', '#ff7ac6', '#c6e23b'];

function lanAddress() {
  const candidates = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) candidates.push(i.address);
    }
  }
  const isPrivate = a => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a);
  return candidates.find(isPrivate) || candidates[0] || 'localhost';
}
const LAN_IP = lanAddress();
const JOIN_URL = `http://${LAN_IP}:${PORT}`;

// Optional: show a second QR code that joins the house Wi-Fi, for guests who aren't on it yet.
// Set via --wifi-ssid=/--wifi-pass= flags or WIFI_SSID/WIFI_PASSWORD env vars.
const WIFI_SSID = flag('wifi-ssid') || process.env.WIFI_SSID || '';
const WIFI_PASS = flag('wifi-pass') || process.env.WIFI_PASSWORD || '';
const WIFI_HIDDEN = flag('wifi-hidden') === 'true' || process.env.WIFI_HIDDEN === 'true';
const wifiQrEscape = s => String(s).replace(/([\\;,:"])/g, '\\$1');
const WIFI_QR_PAYLOAD = WIFI_SSID
  ? `WIFI:T:${WIFI_PASS ? 'WPA' : 'nopass'};S:${wifiQrEscape(WIFI_SSID)};${WIFI_PASS ? `P:${wifiQrEscape(WIFI_PASS)};` : ''}${WIFI_HIDDEN ? 'H:true;' : ''};`
  : null;

const isLoopback = a => a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';

// ---- state ---------------------------------------------------------------
const players = new Map(); // id -> { id, token, name, color, score, connected, socketId }
let seq = 0;

const sources = {
  jeopardy: content.loadJeopardySource(flag('jeopardy')),
  feud: content.loadFeudSource(flag('feud')),
  wheel: content.loadWheelSource(flag('wheel')),
  wavelength: content.loadWavelengthSource(flag('wavelength')),
  pictionary: content.loadPictionarySource(flag('pictionary')),
  tshirt: content.loadTshirtSource(flag('tshirt')),
  moviereveal: content.loadMovieSource(flag('movie')),
  codenames: content.loadCodenamesSource(flag('codenames')),
  password: content.loadPasswordSource(flag('password')),
  scattergories: content.loadScattergoriesSource(flag('scattergories')),
  hangman: content.loadHangmanSource(flag('hangman')),
  neanderthals: content.loadNeanderthalsSource(flag('neanderthals')),
};

// A bundled Disney-themed pack for each game, offered as a toggle alongside the normal content.
// Loaded once at startup; missing or broken files just mean the toggle has nothing to switch to.
function tryLoad(fn, file) {
  try { return fn(path.join(__dirname, file)); } catch (e) { console.warn(`Disney content (${file}) did not load: ${e.message}`); return null; }
}
const disneySources = {
  jeopardy: tryLoad(content.loadJeopardySource, 'content/jeopardy/disney.json'),
  feud: tryLoad(content.loadFeudSource, 'content/feud/disney.json'),
  wheel: tryLoad(content.loadWheelSource, 'content/wheel/disney.json'),
  pictionary: tryLoad(content.loadPictionarySource, 'content/pictionary/disney.json'),
};

// Trivia ships two independent packs (not a toggle on one game, since the question sets are
// unrelated): 5th Grade and Disney. Both use the same game module.
const triviaSources = {
  fifthgrade: tryLoad(content.loadTriviaSource, 'content/trivia/fifthgrade.json'),
  disney: tryLoad(content.loadTriviaSource, 'content/trivia/disney.json'),
};

function pickSource(game, opts) {
  if (opts.theme === 'disney' && disneySources[game]) return disneySources[game];
  return sources[game];
}

const GAMES = {
  jeopardy: { min: 1, make: (opts) => new Jeopardy(players, broadcast, { source: pickSource('jeopardy', opts), mode: opts.mode }) },
  feud: { min: 2, make: (opts) => new Feud(players, broadcast, { source: pickSource('feud', opts), rounds: 4 }) },
  wheel: { min: 1, make: (opts) => new Wheel(players, broadcast, { source: pickSource('wheel', opts), rounds: 3 }) },
  wavelength: { min: 2, make: (opts) => new Wavelength(players, broadcast, { source: pickSource('wavelength', opts) }) },
  pictionary: { min: 2, make: (opts) => new Pictionary(players, broadcast, { source: pickSource('pictionary', opts) }) },
  tshirt: { min: 2, make: (opts) => new Tshirt(players, broadcast, { source: sources.tshirt }) },
  trivia: { min: 1, make: (opts) => new Trivia(players, broadcast, { source: triviaSources[opts.pack] || triviaSources.fifthgrade }) },
  moviereveal: { min: 1, make: (opts) => new MovieReveal(players, broadcast, { source: sources.moviereveal }) },
  codenames: { min: 2, make: (opts) => new Codenames(players, broadcast, { source: sources.codenames, teamMode: opts.teamMode }) },
  password: { min: 2, make: (opts) => new Password(players, broadcast, { source: sources.password }) },
  scattergories: { min: 1, make: (opts) => new Scattergories(players, broadcast, { source: sources.scattergories }) },
  hangman: { min: 2, make: (opts) => new Hangman(players, broadcast, { source: sources.hangman }) },
  neanderthals: { min: 2, make: (opts) => new Neanderthals(players, broadcast, { source: sources.neanderthals }) },
};

let game = null; // null means the menu (or a game's intro) is showing
let lastStart = null;
let hubMenu = null; // which game's options the host currently has open on their phone, mirrored on the TV

// Every game opens on a "how to play" screen. The game itself isn't constructed until the intro
// ends (host taps Start, or it times out), so no game clock runs while people are still reading.
const INTRO_MS = 25000;
let intro = null; // { type, opts, endsAt, timer }

function startGame(type, opts = {}, { skipIntro = false } = {}) {
  const def = GAMES[type];
  if (!def) return 'Unknown game';
  if (players.size < def.min) return `Need at least ${def.min} player${def.min > 1 ? 's' : ''} for this game`;
  if (game) game.dispose();
  game = null;
  clearIntro();
  lastStart = { type, opts };
  hubMenu = null;
  if (skipIntro) { game = def.make(opts); return null; }
  intro = { type, opts, endsAt: Date.now() + INTRO_MS, timer: setTimeout(() => { beginGame(); broadcast(); }, INTRO_MS) };
  return null;
}

function beginGame() {
  if (!intro) return;
  const { type, opts } = intro;
  clearIntro();
  game = GAMES[type].make(opts);
}

function clearIntro() {
  if (intro) clearTimeout(intro.timer);
  intro = null;
}

function toMenu() {
  if (game) game.dispose();
  game = null;
  clearIntro();
  lastStart = null;
  hubMenu = null;
  pruneAway();
}

// Players whose phone has gone away are kept during a game (they may reconnect), but in the lobby
// they'd otherwise linger forever as stale names. A returning phone just rejoins under its name.
function pruneAway() {
  if (game || intro) return false;
  let changed = false;
  for (const p of [...players.values()]) if (!p.connected) { players.delete(p.id); changed = true; }
  return changed;
}

function introView() {
  return {
    game: intro.type, phase: 'intro', endsAt: intro.endsAt, windowMs: INTRO_MS,
    players: [...players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, connected: p.connected, score: 0 })),
  };
}

function hubView() {
  return {
    game: 'hub', title: 'Poole Party', phase: 'hub', hubMenu,
    players: [...players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, connected: p.connected })),
  };
}

// The host is whichever joined player is currently connected and has been in the game longest
// (players is a Map, so insertion order is preserved). If that player's phone drops, the next
// connected player quietly takes over; there is nothing to configure.
function currentHostId() {
  for (const p of players.values()) if (p.connected) return p.id;
  const first = players.keys().next();
  return first.done ? null : first.value;
}

// ---- http ----------------------------------------------------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/qr.svg', async (req, res) => {
  const svg = await QRCode.toString(JOIN_URL, { type: 'svg', margin: 1 });
  res.type('image/svg+xml').send(svg);
});
app.get('/wifi-qr.svg', async (req, res) => {
  if (!WIFI_QR_PAYLOAD) return res.status(404).end();
  const svg = await QRCode.toString(WIFI_QR_PAYLOAD, { type: 'svg', margin: 1 });
  res.type('image/svg+xml').send(svg);
});
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('/', (req, res) => res.redirect('/play'));

// ---- sockets -------------------------------------------------------------
function broadcast() {
  const labels = {
    jeopardy: sources.jeopardy.label, feud: sources.feud.label, wheel: sources.wheel.label,
    wavelength: sources.wavelength.label, pictionary: sources.pictionary.label,
    tshirt: sources.tshirt.label, moviereveal: sources.moviereveal.label,
    codenames: sources.codenames.label, password: sources.password.label, scattergories: sources.scattergories.label,
    hangman: sources.hangman.label, neanderthals: sources.neanderthals.label,
    disney: { jeopardy: !!disneySources.jeopardy, feud: !!disneySources.feud, wheel: !!disneySources.wheel, pictionary: !!disneySources.pictionary },
  };
  const hostId = currentHostId();
  for (const s of io.sockets.sockets.values()) {
    const role = s.data.role;
    if (role !== 'display' && role !== 'console' && role !== 'player') continue;
    const view = game ? game.view(role, s.data.playerId || null) : intro ? introView() : hubView();
    s.emit('state', {
      ...view, role, you: s.data.playerId || null, hostId, joinUrl: JOIN_URL,
      wifiSsid: WIFI_SSID || null, content: labels, now: Date.now(),
    });
  }
}

function uniqueName(raw) {
  const base = String(raw || '').trim().slice(0, 14) || 'Player';
  const taken = new Set([...players.values()].map(p => p.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base.slice(0, 12)} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

function nextColor() {
  const used = new Set([...players.values()].map(p => p.color));
  return COLORS.find(c => !used.has(c)) || COLORS[players.size % COLORS.length];
}

io.on('connection', socket => {
  const { role, key } = socket.handshake.auth || {};

  if (role === 'display') {
    socket.data.role = 'display';
  } else if (role === 'console') {
    if (key === HOST_KEY || isLoopback(socket.handshake.address)) socket.data.role = 'console';
    else { socket.emit('denied'); socket.disconnect(true); return; }
  } else if (role === 'player') {
    socket.data.role = 'player-pending';
  } else {
    socket.disconnect(true);
    return;
  }

  socket.on('join', (data, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    if (socket.data.role !== 'player' && socket.data.role !== 'player-pending') return ack({ error: 'Not a player connection' });
    const { token, name } = data || {};
    let p = token && [...players.values()].find(x => x.token === token);
    if (p) {
      p.socketId = socket.id;
      p.connected = true;
    } else {
      if (players.size >= MAX_PLAYERS) return ack({ error: 'Game is full' });
      p = {
        id: `p${++seq}`,
        token: crypto.randomBytes(8).toString('hex'),
        name: uniqueName(name),
        color: nextColor(),
        score: 0,
        connected: true,
        socketId: socket.id,
      };
      players.set(p.id, p);
    }
    socket.data.role = 'player';
    socket.data.playerId = p.id;
    ack({ token: p.token, name: p.name });
    broadcast();
  });

  socket.on('action', (type, payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const r = socket.data.role;
    if (r !== 'console' && r !== 'player') return ack('Not allowed');
    const isHost = r === 'player' && !!socket.data.playerId && socket.data.playerId === currentHostId();
    const HOST_ACTIONS = new Set(['startGame', 'startNow', 'toMenu', 'reset', 'kick', 'hubMenu']);
    let err = null;
    try {
      if (HOST_ACTIONS.has(type) && r !== 'console' && !isHost) {
        err = 'Only the host can do that';
      } else if (type === 'hubMenu') {
        if (!game && !intro) hubMenu = (payload && payload.game) || null;
      } else if (type === 'startGame') {
        err = startGame(payload && payload.type, payload || {});
      } else if (type === 'startNow') {
        if (intro) beginGame(); else err = 'Already started';
      } else if (type === 'toMenu') {
        toMenu();
      } else if (type === 'reset') {
        // Everyone just saw how to play; a restart goes straight back into the game.
        if (lastStart) err = startGame(lastStart.type, lastStart.opts, { skipIntro: true });
      } else if (type === 'kick') {
        const p = players.get(payload && payload.playerId);
        if (p) {
          players.delete(p.id);
          const s = io.sockets.sockets.get(p.socketId);
          if (s) { s.emit('kicked'); s.data.role = 'player-pending'; s.data.playerId = null; }
          if (game && game.onPlayerRemoved) game.onPlayerRemoved(p.id);
        }
      } else if (intro) {
        err = 'The game is about to start';
      } else if (!game) {
        err = 'No game is running';
      } else {
        err = game.handle({ role: r, playerId: socket.data.playerId, isHost }, type, payload);
      }
    } catch (e) {
      console.error(e);
      err = 'Server error';
    }
    ack(err || null);
    broadcast();
  });

  // Live drawing points (Pictionary). Bypasses the action/broadcast round trip: relayed straight
  // to the display for minimal latency, and only triggers a full state broadcast() at stroke
  // boundaries (end/clear), so a reconnecting TV can resync without every single point costing
  // a full re-render for all connected clients.
  socket.on('stroke', (msg) => {
    if (socket.data.role !== 'player' || !game || typeof game.canDraw !== 'function') return;
    const pid = socket.data.playerId;
    if (!msg || !game.canDraw(pid)) return;
    for (const s of io.sockets.sockets.values()) {
      if (s.data.role === 'display') s.emit('stroke', msg);
    }
    if (typeof game.recordStroke === 'function' && ['start', 'point', 'clear', 'undo'].includes(msg.kind)) {
      game.recordStroke(msg.kind, msg.point, msg.color);
    }
    if (msg.kind === 'end' || msg.kind === 'clear' || msg.kind === 'undo') broadcast();
  });

  socket.on('disconnect', () => {
    const id = socket.data.playerId;
    const p = id && players.get(id);
    if (p && p.socketId === socket.id) {
      p.connected = false;
      broadcast();
      setTimeout(() => { if (!p.connected && pruneAway()) broadcast(); }, LOBBY_AWAY_PRUNE_MS);
    }
  });

  if (socket.data.role !== 'player-pending') broadcast();
});

server.listen(PORT, '0.0.0.0', () => {
  const line = '-'.repeat(60);
  console.log(line);
  console.log(`Jeopardy:      ${sources.jeopardy.label}`);
  console.log(`Family Feud:   ${sources.feud.label}`);
  console.log(`Wheel:         ${sources.wheel.label}`);
  console.log(`Wavelength:    ${sources.wavelength.label}`);
  console.log(`Pictionary:    ${sources.pictionary.label}`);
  console.log(`T-Shirt Wars:  ${sources.tshirt.label}`);
  console.log(`Movie Reveal:  ${sources.moviereveal.label}`);
  console.log(`Trivia packs:  ${['fifthgrade', 'disney'].filter(k => triviaSources[k]).join(', ') || 'none loaded'}`);
  console.log(`Codenames:     ${sources.codenames.label}`);
  console.log(`Password:      ${sources.password.label}`);
  console.log(`Scattergories: ${sources.scattergories.label}`);
  console.log(`Hangman:       ${sources.hangman.label}`);
  console.log(`Neanderthals:  ${sources.neanderthals.label}`);
  console.log(`Disney night:  ${['jeopardy', 'feud', 'wheel', 'pictionary'].filter(g => disneySources[g]).join(', ') || 'not loaded'}`);
  console.log(`TV display:    http://localhost:${PORT}/host`);
  console.log(`Host console:  http://localhost:${PORT}/console`);
  console.log(`  from phone:  ${JOIN_URL}/console?key=${HOST_KEY}`);
  console.log(`Players join:  ${JOIN_URL}   (QR code is on the TV lobby)`);
  console.log(line);
});
