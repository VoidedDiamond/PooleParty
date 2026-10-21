'use strict';
// Per-game client modules register here: GAMES.<name>.tv, .phone, .console
const GAMES = {
  jeopardy: {}, feud: {}, wheel: {}, wavelength: {}, pictionary: {}, tshirt: {}, trivia: {}, moviereveal: {},
  codenames: {}, password: {}, scattergories: {}, hangman: {}, neanderthals: {}, cubes: {}, scales: {}, memory: {}, quickmath: {}, popinorder: {}, flip7: {}, oddoneout: {}, colorclash: {}, blurry: {}, clock: {}, coins: {}, mirror: {}, simon: {},
};
const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString();
const findPlayer = (s, id) => s.players.find(p => p.id === id);

// One icon language across the whole app: Lucide glyphs (ISC license, public/vendor/LICENSE-lucide.txt)
// drawn as 2px strokes in currentColor on a 24px grid. Hangman has no Lucide equivalent, so it's
// drawn by hand on the same grid with the same stroke rules.
const GLYPHS = {
  'circle-help': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'ferris-wheel': '<circle cx="12" cy="12" r="2"/><path d="M12 2v4"/><path d="m6.8 15-3.5 2"/><path d="m20.7 7-3.5 2"/><path d="M6.8 9 3.3 7"/><path d="m20.7 17-3.5-2"/><path d="m9 22 3-8 3 8"/><path d="M8 22h8"/><path d="M18 18.7a9 9 0 1 0-12 0"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  palette: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
  shirt: '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
  lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  clapperboard: '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  'venetian-mask': '<path d="M2 12a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V7h-5a8 8 0 0 0-5 2 8 8 0 0 0-5-2H2Z"/><path d="M6 11c1.5 0 3 .5 3 2-2 0-3 0-3-2Z"/><path d="M18 11c-1.5 0-3 .5-3 2 2 0 3 0 3-2Z"/>',
  'key-round': '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
  'list-checks': '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  bone: '<path d="M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z"/>',
  gallows: '<path d="M3 21h8"/><path d="M7 21V3h9v3"/><circle cx="16" cy="8.5" r="2.5"/><path d="M16 11v5"/><path d="m13.5 14.5 2.5-2 2.5 2"/><path d="m14 19.5 2-3.5 2 3.5"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/>',
  droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
  'flip-horizontal': '<path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/>',
  'grid-2x2': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 12h18"/><path d="M12 3v18"/>',
  cards: '<rect width="12" height="16" x="3" y="6" rx="2"/><path d="M9 3.5 17.7 2a2 2 0 0 1 2.3 1.6l2 11.8a2 2 0 0 1-1.6 2.3L18 18"/><path d="M9 11h.01"/>',
  brain: '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/>',
  'layout-grid': '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  calculator: '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>',
  bubbles: '<circle cx="8" cy="15" r="5"/><circle cx="17" cy="8" r="4"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  crown: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
  timer: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  house: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  'trash-2': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
  'volume-2': '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
  tv: '<rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/>',
  smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
};

// Each game's identity: its glyph and badge color (the colored tile behind the glyph in menus,
// intros and headers). Keep these distinct around the color wheel so no two games read alike.
const GAME_META = {
  jeopardy: { glyph: 'circle-help', color: '#3b5bdb' },
  feud: { glyph: 'users', color: '#f76707' },
  wheel: { glyph: 'ferris-wheel', color: '#7048e8' },
  wavelength: { glyph: 'gauge', color: '#d6336c' },
  pictionary: { glyph: 'palette', color: '#f59f00' },
  tshirt: { glyph: 'shirt', color: '#0ca678' },
  trivia: { glyph: 'lightbulb', color: '#37b24d' },
  moviereveal: { glyph: 'clapperboard', color: '#ae3ec9' },
  codenames: { glyph: 'venetian-mask', color: '#e03131' },
  password: { glyph: 'key-round', color: '#1098ad' },
  scattergories: { glyph: 'list-checks', color: '#74b816' },
  hangman: { glyph: 'gallows', color: '#1c7ed6' },
  neanderthals: { glyph: 'bone', color: '#c2410c' },
  cubes: { glyph: 'box', color: '#343a40' },
  scales: { glyph: 'scale', color: '#a61e4d' },
  memory: { glyph: 'layout-grid', color: '#4263eb' },
  quickmath: { glyph: 'calculator', color: '#e67700' },
  popinorder: { glyph: 'bubbles', color: '#12b886' },
  brain: { glyph: 'brain', color: '#f06595' },
  flip7: { glyph: 'cards', color: '#e8590c' },
  oddoneout: { glyph: 'scan', color: '#0c8599' },
  colorclash: { glyph: 'droplet', color: '#d6336c' },
  blurry: { glyph: 'eye', color: '#5f3dc4' },
  clock: { glyph: 'clock', color: '#1971c2' },
  coins: { glyph: 'coins', color: '#e67700' },
  mirror: { glyph: 'flip-horizontal', color: '#0ca678' },
  simon: { glyph: 'grid-2x2', color: '#c92a2a' },
};

// icon('crown') -> a stroke glyph that inherits the surrounding text color; icon('jeopardy') ->
// that game's glyph. Default size is 1em (the .icn rule), containers override it.
const icon = (name, cls) => {
  const key = GAME_META[name] ? GAME_META[name].glyph : name;
  return `<svg class="icn${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[key] || ''}</svg>`;
};
// A game's glyph in white on its identity color, like an app icon.
const gameBadge = (id, cls) => `<span class="gbadge${cls ? ' ' + cls : ''}" style="--gc:${(GAME_META[id] || {}).color || '#555'}">${icon(id)}</span>`;

// The Poole Party logo: a striped pool float ring and the wordmark, used on the TV lobby and the
// phone join screen. The ring is two concentric strokes: solid white, then red dashes over it.
const brandMark = () => `<span class="brand-mark">
  <svg class="brand-ring" viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="16" fill="none" stroke="#fff" stroke-width="11"/>
    <circle cx="24" cy="24" r="16" fill="none" stroke="#ff5a5f" stroke-width="11" stroke-dasharray="12.566 12.566" transform="rotate(-22.5 24 24)"/>
    <circle cx="24" cy="24" r="21.5" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="1"/>
  </svg>
  <span class="brand-word">Poole <b>Party</b></span>
</span>`;

// Competition ranking: tied scores share a place (1, 2, 2, 4).
function rankPlayers(players) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  return ranked.map(p => ({ ...p, place: 1 + ranked.filter(o => o.score > p.score).length }));
}

// The shared end-of-game screen on the TV: a crowned winner line and the ranked final scores.
function finalScoresTV(s, { fmt = String } = {}) {
  const ranked = rankPlayers(s.players);
  const winners = ranked.filter(p => p.place === 1);
  return `<div class="stage"><div class="results">
    <div class="results-kicker">${icon('crown')} ${winners.length > 1 ? "It's a tie" : 'Winner'}</div>
    <div class="results-winner">${winners.map(p => esc(p.name)).join(' & ') || 'No winner'}</div>
    <ol class="results-list">${ranked.map(p => `<li class="${p.place === 1 ? 'top' : ''}" style="--color:${p.color}">
      <span class="place">${p.place}</span><span class="dot"></span><span class="name">${esc(p.name)}</span>
      <span class="pts${p.score < 0 ? ' neg' : ''}">${fmt(p.score)}</span></li>`).join('')}</ol>
  </div></div>`;
}

// The same results on a phone, told from that player's point of view.
function finalScoresPhone(s, me, { fmt = String } = {}) {
  const ranked = rankPlayers(s.players);
  const mine = ranked.find(p => p.id === me.id);
  const winners = ranked.filter(p => p.place === 1);
  const headline = mine && mine.place === 1 ? (winners.length > 1 ? 'You tied for the win!' : 'You win!')
    : `${winners.map(p => esc(p.name)).join(' & ')} win${winners.length > 1 ? '' : 's'}`;
  return { key: 'final-results', html: `<p class="kicker">Game over</p><p class="say">${headline}</p>
    <ol class="ranking">${ranked.map(p => `<li class="${p.id === me.id ? 'me-row' : ''}" style="--color:${p.color}">
      <span class="place">${p.place}</span><span class="name">${esc(p.name)}</span><b class="${p.score < 0 ? 'neg' : ''}">${fmt(p.score)}</b></li>`).join('')}</ol>` };
}

// The game picker (host's phone + the TV lobby mirror). One entry per game: an icon, its
// minimum player count, and — for games with more than one way to play — a `variants` list.
// A game with no variants starts the moment its tile is tapped; one with variants opens a
// second screen listing them. `dynamic` builds variants that depend on live state (Disney
// content actually being loaded, or how many players are in).
const GAME_MENU = [
  { id: 'jeopardy', name: 'Jeopardy', tagline: 'Buzz in and answer', min: 1, dynamic: s => {
    const v = [{ key: 'typed', label: 'Type Answers', opts: { mode: 'typed' } }, { key: 'choice', label: 'Multiple Choice', opts: { mode: 'choice' } }];
    if (s.content.disney && s.content.disney.jeopardy) v.push({ key: 'disney', label: 'Disney Night', opts: { mode: 'typed', theme: 'disney' } });
    return v;
  } },
  { id: 'feud', name: 'Family Feud', tagline: 'Guess what the survey said', min: 2, dynamic: s =>
    (s.content.disney && s.content.disney.feud) ? [{ key: 'std', label: 'Standard', opts: {} }, { key: 'disney', label: 'Disney Night', opts: { theme: 'disney' } }] : null },
  { id: 'wheel', name: 'Wheel of Fortune', tagline: 'Spin, call letters, solve', min: 1, dynamic: s =>
    (s.content.disney && s.content.disney.wheel) ? [{ key: 'std', label: 'Standard', opts: {} }, { key: 'disney', label: 'Disney Night', opts: { theme: 'disney' } }] : null },
  { id: 'wavelength', name: 'Wavelength', tagline: "Read your friends' minds", min: 2 },
  { id: 'pictionary', name: 'Pictionary', tagline: 'Draw it, they guess it', min: 2, dynamic: s =>
    (s.content.disney && s.content.disney.pictionary) ? [{ key: 'std', label: 'Standard', opts: {} }, { key: 'disney', label: 'Disney Words', opts: { theme: 'disney' } }] : null },
  { id: 'tshirt', name: 'T-Shirt Wars', tagline: 'Design shirts, vote a winner', min: 2 },
  { id: 'trivia', name: 'Trivia', tagline: 'Quick-fire multiple choice', min: 1, dynamic: () => [
    { key: 'general', label: 'Trivia Night (hard)', opts: { pack: 'general' } },
    { key: 'fifthgrade', label: '5th Grade', opts: { pack: 'fifthgrade' } }, { key: 'disney', label: 'Disney', opts: { pack: 'disney' } },
  ] },
  { id: 'moviereveal', name: 'Name That Disney Movie', tagline: 'Crack it from the clues', min: 1 },
  { id: 'codenames', name: 'Codenames', tagline: 'Spies and one-word clues', min: 2, dynamic: s =>
    s.players.length > 2 ? [{ key: 'random', label: 'Random Teams', opts: { teamMode: 'random' } }, { key: 'pick', label: 'Pick Your Team', opts: { teamMode: 'pick' } }] : null },
  { id: 'password', name: 'Password', tagline: 'One-word clues, fast guesses', min: 2 },
  { id: 'scattergories', name: 'Scattergories', tagline: 'One letter, eight categories', min: 1 },
  { id: 'hangman', name: 'Hangman', tagline: 'Crack the word letter by letter', min: 2 },
  { id: 'neanderthals', name: 'Neanderthals', tagline: 'Hint in one syllable. Ugh.', min: 2, dynamic: s =>
    s.players.length >= 4 ? [{ key: 'teams', label: 'Teams: Glad vs Mad', opts: { mode: 'teams' } }, { key: 'solo', label: 'Everyone for themselves', opts: { mode: 'solo' } }] : null },
  { id: 'flip7', name: 'Flip 7', tagline: 'Push your luck. Don\'t flip a double!', min: 2, dynamic: () => [
    { key: 'classic', label: 'Flip 7', opts: { variant: 'classic', target: 200 } },
    { key: 'classic100', label: 'Flip 7 (quick, to 100)', opts: { variant: 'classic', target: 100 } },
    { key: 'vengeance', label: 'With a Vengeance', opts: { variant: 'vengeance', target: 200, rules: 'flip7v' } },
    { key: 'vengeance100', label: 'With a Vengeance (quick, to 100)', opts: { variant: 'vengeance', target: 100, rules: 'flip7v' } },
  ] },
  // Brain Games: one tile, each variant starts its own game (opts.type picks it).
  { id: 'brain', name: 'Brain Games', tagline: 'Quick puzzles: count, weigh, remember, race', min: 1, dynamic: () => [
    { key: 'cubes', label: 'Count the Cubes', opts: { type: 'cubes', level: 'normal' } },
    { key: 'cubeshard', label: 'Count the Cubes (Hard)', opts: { type: 'cubes', level: 'hard' } },
    { key: 'scales', label: 'Tip the Scales', opts: { type: 'scales' } },
    { key: 'memory', label: 'Memory Flash', opts: { type: 'memory' } },
    { key: 'quickmath', label: 'Quick Math', opts: { type: 'quickmath' } },
    { key: 'popinorder', label: 'Pop in Order', opts: { type: 'popinorder' } },
    { key: 'oddoneout', label: 'Odd One Out', opts: { type: 'oddoneout' } },
    { key: 'colorclash', label: 'Color Clash', opts: { type: 'colorclash' } },
    { key: 'blurry', label: 'Blurry Picture', opts: { type: 'blurry' } },
    { key: 'simon', label: 'Simon Says', opts: { type: 'simon' } },
    { key: 'clock', label: 'Clock Reader', opts: { type: 'clock' } },
    { key: 'coins', label: 'Coin Count', opts: { type: 'coins' } },
    { key: 'mirror', label: 'Mirror or Not', opts: { type: 'mirror' } },
  ] },
];
const gameVariants = (entry, s) => (entry.dynamic ? entry.dynamic(s) : null);

// The "how to play" rules shown during every game's intro phase (server.js holds the game in
// phase 'intro' until the host taps Start or the intro timer runs out).
const GAME_INSTRUCTIONS = {
  jeopardy: { title: 'Jeopardy', rules: [
    'Wait for the buzzers to open, then tap BUZZ. Buzzing early locks you out briefly.',
    'Typed mode: type your answer. Multiple choice: pick from four options on your phone.',
    'Wrong answers cost points and reopen the buzzers. Whoever answers right picks next.',
    'Ruled wrong but sure you were right? Challenge it: the others vote. A rejected challenge costs half the clue’s value.',
    'Watch for the Daily Double and Final Jeopardy — secret wagers, auto-judged.',
  ] },
  feud: { title: 'Family Feud', rules: [
    'Two teams, split automatically. Each round starts with a face-off: type the answer you think is most popular.',
    'The winning team takes turns naming answers. Three strikes and the other team gets one steal.',
    'The face-off winner can choose to play or pass to the other team.',
    'Fast Money at the end: the leading team answers 5 quick questions each for a bonus (doesn’t affect the main score).',
  ] },
  wheel: { title: 'Wheel of Fortune', rules: [
    'On your turn: spin and call a consonant, buy a vowel for $250, or solve the puzzle.',
    'Bankrupt and Lose a Turn are on the wheel, so a bad spin can cost you everything that turn.',
    'Solve it first to bank your round total. Three rounds, then a bonus round for the leader.',
  ] },
  wavelength: { title: 'Wavelength', rules: [
    'No teams — everyone gets a turn as the Psychic and a turn guessing.',
    'The Psychic sees a hidden target on a spectrum (like Hot ↔ Cold) and gives a clue out loud.',
    'Everyone else drags their own dial on their phone to where they think the target is.',
    'Closer to the target scores more. The Psychic’s score is the average of everyone’s guesses.',
  ] },
  pictionary: { title: 'Pictionary', rules: [
    'The drawer rotates each round — everyone draws exactly once.',
    'The drawer picks one of 3 words and draws it on their phone; it streams live to the TV.',
    'Everyone else types guesses on their own phone. First correct guess scores the most.',
    'The drawer also scores a little for every correct guess.',
  ] },
  tshirt: { title: 'T-Shirt Wars', rules: [
    'Everyone gets the same silly prompt and draws their own shirt design at the same time, privately.',
    'A blank shirt outline is already in the drawing box — just decorate it.',
    'Once everyone’s done, vote for your favorite design (not your own).',
    'Most votes that round wins the most points. Three rounds, then a final score.',
  ] },
  trivia: { title: 'Trivia', rules: [
    'Everyone answers the same multiple-choice question on their own phone at the same time.',
    'The TV just shows the question and how many people have answered — no peeking at picks.',
    'Faster correct answers score more. Questions get harder as the game goes on.',
  ] },
  moviereveal: { title: 'Name That Disney Movie', rules: [
    'A vague clue about a Disney movie shows up first, with a more specific clue added every few seconds.',
    'Type a guess on your phone any time — small typos are fine.',
    'Guessing right on an early, vague clue is worth a lot more than guessing once it’s obvious.',
  ] },
  codenames: { title: 'Codenames', rules: [
    '3+ players: pick teams (or go random). Each team picks one hint-giver (spymaster); everyone else guesses.',
    'The hint-giver sees every word’s secret color and gives a one-word clue plus a number.',
    'Teammates tap words on their phones to guess. Keep guessing as long as you’re right.',
    'The other team’s word or a neutral word ends your turn; the black assassin word loses instantly.',
  ] },
  password: { title: 'Password', rules: [
    'Rotating hinter/guesser pairs — everyone gets a turn at each role.',
    'The hinter privately sees the password and types one-word clues. No rhymes, no spelling it out!',
    'The guesser says their guess out loud, not typed. The hinter judges "got it" or "new clue".',
    'Points start at 10 and drop with every extra clue, so a fast guess is worth more.',
  ] },
  scattergories: { title: 'Scattergories', rules: [
    'Each round gives a letter and 8 categories. Type an answer starting with that letter for every category.',
    'Whatever you’ve typed is submitted automatically when the timer runs out, even if you’re not done.',
    'Then the group judges together: anyone can challenge an answer they don’t buy, or agree to move on faster.',
    'Valid answers score 2 points, or 1 if someone else wrote a near-identical one.',
  ] },
  hangman: { title: 'Hangman', rules: [
    'Each round, one player (the theme giver) rotates through and picks a theme/category.',
    'A secret word from that theme is chosen automatically — everyone else guesses letters or the whole word.',
    'Six wrong guesses and the hangman is complete — the round ends either way.',
    'Guessers score per correct letter, plus a bonus for solving. A wrong letter costs you 10 points, a wrong solve 25.',
    'The theme giver scores more the longer it takes and the more wrong guesses happen.',
  ] },
  cubes: { title: 'Count the Cubes', rules: [
    'A stack of cubes flashes up on the TV for a few seconds, then disappears.',
    'Type how many cubes there were on your phone. Count the hidden ones too: every cube sits on the floor or on another cube, and the top of every column is always in sight.',
    'Exactly right scores 100, plus up to 50 for answering fast. Off by one scores 50, off by two scores 20.',
    'Ten rounds. The stacks get bigger and the flashes get shorter.',
  ] },
  scales: { title: 'Tip the Scales', rules: [
    'Seesaws on the TV show which shape outweighs which. The heavier side goes down.',
    'Work out which shape is the heaviest and tap it on your phone. You may need to chain the seesaws together.',
    'Read the question: from round 4, some rounds ask for the lightest instead.',
    'Right answers score 100, plus up to 50 for answering fast. Ten rounds, with more shapes as you go.',
  ] },
  flip7: { title: 'Flip 7', rules: [
    'On your turn, HIT to flip a card or STAY to bank your points for the round.',
    'Flip a number you already have and you BUST: no points this round. Collect 7 different numbers to FLIP 7: +15, and the round ends.',
    'Bonus cards: +2 to +10, and x2 doubles your numbers. Freeze makes someone bank and sit out, Flip Three makes someone flip three in a row, Second Chance saves you from one duplicate.',
    'First to 200 (or 100 in the quick game) after a round wins.',
  ] },
  flip7v: { title: 'Flip 7: With a Vengeance', rules: [
    'Same as Flip 7: HIT or STAY, a duplicate number busts you, 7 numbers is a FLIP 7 (+15). Numbers go up to 13.',
    'Modifiers hurt: −2 to −10 and ÷2. Whoever flips one puts it on any player still in the round, even someone who stayed.',
    'Just One More, Flip Four, Steal, Discard and Swap let you mess with anyone still in, stayed or not.',
    'The Zero: your round scores 0 unless you Flip 7. Unlucky 7: throw away your numbers and modifiers. Lucky 13: you can hold two 13s.',
  ] },
  oddoneout: { title: 'Odd One Out', rules: [
    'A grid of pictures appears on your phone. They are all the same, except one. Tap it!',
    'Round 1: a look-alike. Round 2: one is a mirror image. Round 3: one is slightly tilted, in a bigger grid.',
    'Right: +10. Wrong: −5 and a one-second freeze. Three 40-second rounds; everyone gets the same grids.',
  ] },
  colorclash: { title: 'Color Clash', rules: [
    'A color word appears in a different color ink, like RED written in blue. Tap the color of the INK.',
    'Round 2: the buttons are color words in the wrong ink too. Round 3: some cards ask for the WORD instead, so read the question.',
    'Right: +10. Wrong: −5 and a short freeze. Three 40-second rounds.',
  ] },
  blurry: { title: 'Blurry Picture', rules: [
    'A picture starts blurry and zoomed in on the TV, and slowly comes into focus.',
    'Pick what it is from four choices on your phone. One guess only.',
    'The sooner you get it right, the more it is worth: up to 200, down to 50 once it is sharp. Ten rounds.',
  ] },
  clock: { title: 'Clock Reader', rules: [
    'An analog clock appears on your phone. Tap the time it shows, from four choices.',
    'Round 1: o\'clock, quarter and half past. Round 2: any five minutes. Round 3: the numbers disappear.',
    'Right: +10. Wrong: −5 and a short freeze. Three 40-second rounds; everyone races at once.',
  ] },
  coins: { title: 'Coin Count', rules: [
    'A pile of coins appears on your phone. Type how many cents they add up to.',
    'The keypad checks as soon as you\'ve typed as many digits as the answer has.',
    'Right: +10. Wrong: a short freeze. Round 1: pennies, nickels and dimes. Round 2: quarters. Round 3: bigger piles and half dollars.',
  ] },
  mirror: { title: 'Mirror or Not', rules: [
    'Two copies of a picture, the second one turned around. Is it the same picture turned, or a mirror image?',
    'Round 1: quarter turns. Round 2: any angle. Round 3: both pictures are turned.',
    'Right: +10. Wrong: −5 and a short freeze. Three 40-second rounds; everyone races at once.',
  ] },
  simon: { title: 'Simon Says', rules: [
    'Four pads light up in a pattern on the TV. Watch closely!',
    'Then repeat the pattern by tapping the pads on your phone. Each pad has a color and a shape.',
    'The pattern starts at 3 steps and grows by one each round. A perfect pattern scores 20 per step, plus a bonus for speed.',
  ] },
  memory: { title: 'Memory Flash', rules: [
    'A grid of pictures flashes up on the TV for a few seconds, then the cards turn over.',
    'Then one question: "Where was the apple?" (tap the spot on your phone) or "What was in the glowing spot?" (pick the picture).',
    'Right answers score 100, plus up to 50 for answering fast. Ten rounds, and the grid grows.',
  ] },
  quickmath: { title: 'Quick Math', rules: [
    'Everyone races through the same sums on their own phone. The TV shows the race.',
    'Type the answer on the keypad. It checks as soon as you finish typing.',
    'Right: +10. Wrong: a short freeze, then the next sum. Three 40-second rounds, each harder.',
  ] },
  popinorder: { title: 'Pop in Order', rules: [
    'Bubbles with numbers appear on your phone. Pop them from smallest to largest.',
    'Each right pop scores 2, a finished set adds 10. A wrong pop costs 5 and freezes you for a second.',
    'Three 40-second rounds: small numbers, bigger numbers, then little sums to work out.',
  ] },
  neanderthals: { title: 'Neanderthals', rules: [
    'Take turns as the Poet: 90 seconds to get through as many cards as you can. Everyone is the Poet equally often.',
    'Each card has a 1-point word and a 3-point phrase. Get the word, then go for the phrase or move on.',
    'Speak in ONE-SYLLABLE words only, as many as you like. Never say a word from the card or any part of one, and nothing on the “don’t say” list. No gestures, rhymes, spelling or initials.',
    'Slip up and you get a NO! (−1, card lost). Passing a card is −1 too. Penalties hit the Poet, never the guesser.',
  ] },
};
// The intro card (badge, title, numbered rules), shared by the TV and phone intro screens.
function introHTML(gameId, rulesKey) {
  const info = GAME_INSTRUCTIONS[rulesKey] || GAME_INSTRUCTIONS[gameId];
  if (!info) return '';
  return `<div class="intro">
    <div class="intro-head">${gameBadge(gameId, 'lg')}<div><div class="kicker">How to play</div><div class="intro-title">${esc(info.title)}</div></div></div>
    <ol class="intro-rules">${info.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ol>
  </div>`;
}

let clockSkew = 0;
const serverNow = () => Date.now() + clockSkew;

let mainSocket = null;
const queuedStrokeHandlers = [];
const queuedHostSayHandlers = [];

function connect(auth, onState) {
  const socket = io({ auth });
  mainSocket = socket;
  queuedStrokeHandlers.forEach(h => socket.on('stroke', h));
  queuedHostSayHandlers.forEach(h => socket.on('hostSay', h));
  socket.on('state', s => { clockSkew = s.now - Date.now(); onState(s); });
  return socket;
}

// Live drawing points (Pictionary) travel on their own socket event, separate from the
// state/action system, for minimal latency. onStroke can be called before connect() has run
// (script load order), so handlers are queued until the socket exists.
function onStroke(handler) {
  if (mainSocket) mainSocket.on('stroke', handler);
  else queuedStrokeHandlers.push(handler);
}
// Lines from the host voice (TV only), same queue-until-connected pattern as onStroke.
function onHostSay(handler) {
  if (mainSocket) mainSocket.on('hostSay', handler);
  else queuedHostSayHandlers.push(handler);
}
function sendStroke(kind, point, color) {
  if (mainSocket) mainSocket.emit('stroke', { kind, point: point ? [point.x, point.y, point.p] : undefined, color });
}

// Resolves with null on success or an error string.
function send(socket, type, payload) {
  return new Promise(resolve => socket.emit('action', type, payload || {}, resolve));
}

// Draining timer bar. Animation restarts on each render with the true remaining time.
// Tip the Scales shapes, drawn in a 100x100 box (shared by the TV and phones).
const SCALE_SHAPES = (() => {
  const star = Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 19 : 46, a = -Math.PI / 2 + i * Math.PI / 5; return `${(50 + r * Math.cos(a)).toFixed(1)},${(53 + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
  const hex = Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 6 + i * Math.PI / 3; return `${(50 + 44 * Math.cos(a)).toFixed(1)},${(50 + 44 * Math.sin(a)).toFixed(1)}`; }).join(' ');
  return {
    circle: '<circle cx="50" cy="50" r="42"/>',
    square: '<rect x="11" y="11" width="78" height="78" rx="9"/>',
    triangle: '<polygon points="50,8 93,88 7,88" stroke-linejoin="round"/>',
    star: `<polygon points="${star}" stroke-linejoin="round"/>`,
    heart: '<path d="M50 90C22 68 6 52 9 32 12 13 37 8 50 27 63 8 88 13 91 32 94 52 78 68 50 90Z"/>',
    diamond: '<polygon points="50,5 91,50 50,95 9,50" stroke-linejoin="round"/>',
    moon: '<path d="M60 7A44 44 0 1 0 93 66 34 34 0 1 1 60 7Z" stroke-linejoin="round"/>',
    hexagon: `<polygon points="${hex}" stroke-linejoin="round"/>`,
  };
})();
const shapeName = id => id.charAt(0).toUpperCase() + id.slice(1);
// The shape's SVG content in its 100x100 box: the shape, plus two little eyes.
function shapeInner(id, color) {
  const ey = id === 'triangle' ? 62 : 50;
  return `<g fill="${color}" stroke="rgba(0,0,0,.45)" stroke-width="4">${SCALE_SHAPES[id] || ''}</g>
    <circle cx="40" cy="${ey}" r="4.5" fill="#1b1b1b"/><circle cx="60" cy="${ey}" r="4.5" fill="#1b1b1b"/>`;
}
const shapeSVG = (id, color, cls = '') => `<svg class="shape ${cls}" viewBox="0 0 100 100" role="img" aria-label="${shapeName(id)}">${shapeInner(id, color)}</svg>`;

function bar(endsAt, totalMs) {
  if (!endsAt) return '';
  const left = Math.max(0, endsAt - serverNow());
  const start = Math.max(0, Math.min(100, (left / totalMs) * 100));
  return `<div class="bar"><i style="--start:${start}%;animation-duration:${left}ms"></i></div>`;
}

// Shown while Claude double-checks an answer the built-in matcher missed.
function checkingHTML(label) {
  return `<div class="checking"><span class="spin"></span><span>${label}</span></div>`;
}

function boardHTML(s, { pick = false } = {}) {
  const cols = s.board.length;
  const rows = Math.max(...s.board.map(c => c.clues.length));
  let h = `<div class="board" style="--cols:${cols};--rows:${rows}">`;
  for (const c of s.board) h += `<div class="cat">${esc(c.name)}</div>`;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cl = s.board[c].clues[r];
      if (!cl || cl.used) h += '<div class="tile gone"></div>';
      else if (pick) h += `<button class="tile" data-act="pick" data-ci="${c}" data-ri="${r}">$${cl.value}</button>`;
      else h += `<div class="tile">$${cl.value}</div>`;
    }
  }
  return h + '</div>';
}

function scoreboardHTML(s, { turnId = null, buzzedId = null, youId = null, plain = false } = {}) {
  const fmt = plain ? String : money;
  return `<div class="scores">${s.players.map(p => {
    const cls = ['score'];
    if (!p.connected) cls.push('away');
    if (p.id === turnId) cls.push('turn');
    if (p.id === buzzedId) cls.push('buzzed');
    if (p.id === youId) cls.push('you');
    return `<div class="${cls.join(' ')}" style="--color:${p.color}">
      <div class="pname"><span class="dot"></span>${esc(p.name)}</div>
      <div class="pscore${p.score < 0 ? ' neg' : ''}">${fmt(p.score)}</div>
    </div>`;
  }).join('')}</div>`;
}

// Renders a word's blank layout (letters hidden, spacing/punctuation kept) as boxed underscores
// grouped per word, so it's easy to see at a glance how many words there are and how long each
// one is — a flat run of "_ _ _ _" makes multi-word phrases hard to parse.
function wordBlanksHTML(shape) {
  if (!shape) return '';
  return `<div class="pblanks">${shape.split(' ').map(word => {
    const letters = [...word].map(ch => ch === '_' ? '<span class="pletter"></span>' : `<span class="pchar">${esc(ch)}</span>`).join('');
    return `<span class="pword">${letters}</span>`;
  }).join('')}</div>`;
}

// ---- Wavelength dial ---------------------------------------------------------
// The real Wavelength board is a big semicircle: a needle sweeps a 180 degree arc, and on reveal,
// colored scoring bands light up centered on the hidden target. The TV and the phones draw the
// same SVG (viewBox 0 0 300 160). -90deg = far left of the scale, 0 = straight up, +90 = far right.
const WL = (() => {
  const CX = 150, CY = 150, R_OUT = 148, R_IN = 80;
  // Zone widths as a percentage of the 0-1000 scale; must match games/wavelength.js (SCALE=1000, ZONE=45).
  const PCT = { four: 4.5, three: 13.5, two: 22.5 };
  const f = n => n.toFixed(2);
  const toDeg = v => Math.max(-90, Math.min(90, (v / 1000 - 0.5) * 180));
  const pointAt = (deg, r) => {
    const rad = deg * Math.PI / 180;
    return [CX + r * Math.sin(rad), CY - r * Math.cos(rad)];
  };
  const sectorPath = (startDeg, endDeg, rIn, rOut) => {
    const [x1, y1] = pointAt(startDeg, rOut);
    const [x2, y2] = pointAt(endDeg, rOut);
    const [x3, y3] = pointAt(endDeg, rIn);
    const [x4, y4] = pointAt(startDeg, rIn);
    const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${f(x1)} ${f(y1)} A ${rOut} ${rOut} 0 ${large} 1 ${f(x2)} ${f(y2)} L ${f(x3)} ${f(y3)} A ${rIn} ${rIn} 0 ${large} 0 ${f(x4)} ${f(y4)} Z`;
  };
  const zones = target => {
    const t = toDeg(target);
    const band = (pct, cls) => {
      const half = (pct / 100) * 90;
      return `<path class="wlzone ${cls}" d="${sectorPath(Math.max(-90, t - half), Math.min(90, t + half), R_IN, R_OUT)}"></path>`;
    };
    return band(PCT.two, 'z2') + band(PCT.three, 'z3') + band(PCT.four, 'z4');
  };
  const targetLine = target => {
    const [x1, y1] = pointAt(toDeg(target), R_IN);
    const [x2, y2] = pointAt(toDeg(target), R_OUT);
    return `<line class="wltargetline" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"></line>`;
  };
  const needle = (value, color, cls = '') => {
    const [x, y] = pointAt(toDeg(value), R_OUT - 18);
    return `<g class="wlneedle ${cls}"><line x1="${CX}" y1="${CY}" x2="${f(x)}" y2="${f(y)}" stroke="${color}"></line></g>`;
  };
  const ticks = () => [-90, -45, 0, 45, 90].map(d => {
    const [x1, y1] = pointAt(d, R_IN - 8); const [x2, y2] = pointAt(d, R_IN - 18);
    return `<line class="wltick" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"></line>`;
  }).join('');
  // Full dial. inner: extra SVG (zones, needles) drawn between the track and the hub.
  const svg = (inner = '', id = '') => `<svg viewBox="0 0 300 160" class="wlarc"${id ? ` id="${id}"` : ''}>
    <path class="wlarc-track" d="${sectorPath(-90, 90, R_IN, R_OUT)}"></path>${inner}
    <path class="wlarc-outline" d="${sectorPath(-90, 90, R_IN, R_OUT)}"></path>${ticks()}
    <circle cx="${CX}" cy="${CY}" r="10" class="wlneedle-hub"></circle></svg>`;
  // Screen point -> 0..1000 on the scale (for dragging the needle on a phone).
  const valueAt = (svgEl, clientX, clientY) => {
    const pt = svgEl.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const p = pt.matrixTransform(svgEl.getScreenCTM().inverse());
    const deg = Math.max(-90, Math.min(90, Math.atan2(p.x - CX, CY - p.y) * 180 / Math.PI));
    return Math.round((deg / 180 + 0.5) * 1000);
  };
  return { zones, targetLine, needle, svg, valueAt, toDeg };
})();

function hangmanBlanksHTML(blanks, cls = '') {
  const words = String(blanks || '').split(' ');
  const longest = Math.max(1, ...words.map(w => w.length));
  return `<div class="hm-tvblanks${cls ? ' ' + cls : ''}" style="--n:${longest}">${words.map(w => `<span class="hm-word">${[...w].map(c =>
    `<span class="hm-cell">${c === '_' ? '' : esc(c)}</span>`).join('')}</span>`).join('')}</div>`;
}

function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

// A plain t-shirt outline, scaled (via its tight-cropped viewBox) to fill as much of its box as
// possible — sits behind the transparent drawing canvas in T-Shirt Wars so there's already a
// shirt to decorate instead of everyone drawing their own outline first.
function tshirtTemplateHTML() {
  return `<svg class="tshirt-template" viewBox="25 10 250 270" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <path d="M90,40 L130,20 Q150,40 170,20 L210,40 L260,90 L225,125 L205,105 L205,270 L95,270 L95,105 L75,125 L40,90 Z"/>
  </svg>`;
}

// ---- pen toolbar (Pictionary drawer, T-Shirt Wars) ----------------------------
// Five quick colors, a "+" swatch that opens a bigger palette (plus the phone's own color picker),
// then Undo and Clear. The chosen color sticks for the rest of the game on that phone.
const PEN_COLORS = ['#141414', '#e53e3e', '#3182ce', '#38a169', '#d69e2e'];
const MORE_PEN_COLORS = [
  '#ffffff', '#9ca3af', '#4b5563', '#7c2d12', '#a16207', '#fde047',
  '#f97316', '#fb7185', '#ec4899', '#be185d', '#a855f7', '#6d28d9',
  '#1e3a8a', '#0ea5e9', '#22d3ee', '#14b8a6', '#065f46', '#84cc16',
  '#fca5a5', '#fed7aa', '#d9f99d', '#bae6fd', '#ddd6fe', '#f5d0fe',
];
let penColor = PEN_COLORS[0];

function penToolbarHTML() {
  const extra = !PEN_COLORS.includes(penColor);
  return `<div class="ptoolbar">
    ${PEN_COLORS.map(c => `<button class="pswatch${c === penColor ? ' sel' : ''}" data-color="${c}" style="background:${c}" aria-label="Pen color"></button>`).join('')}
    <button class="pswatch more${extra ? ' sel' : ''}" id="pmore" style="${extra ? `background:${penColor}` : ''}" aria-label="More colors">${extra ? '' : icon('plus')}</button>
    <button class="ghost ptool" id="pundo" aria-label="Undo">${icon('rotate-ccw')}</button>
    <button class="ghost ptool" id="pclear" aria-label="Clear">${icon('trash-2')}</button>
  </div>`;
}

// getCanvas: () => the makeCanvas() object for the current drawing.
function wirePenToolbar(getCanvas) {
  const pick = c => {
    penColor = c;
    const cv = getCanvas(); if (cv) cv.setColor(c);
    const bar = $('.ptoolbar');
    if (bar) bar.outerHTML = penToolbarHTML();
    wirePenToolbar(getCanvas);
  };
  document.querySelectorAll('.ptoolbar .pswatch[data-color]').forEach(b => { b.onclick = () => pick(b.dataset.color); });
  if ($('#pundo')) $('#pundo').onclick = () => { const cv = getCanvas(); if (cv) cv.undo(); };
  if ($('#pclear')) $('#pclear').onclick = () => { const cv = getCanvas(); if (cv) cv.clear(); };
  if ($('#pmore')) $('#pmore').onclick = () => {
    const el = document.createElement('div');
    el.className = 'sheet-backdrop';
    el.innerHTML = `<div class="sheet"><p class="say">More colors</p>
      <div class="pmore-grid">${MORE_PEN_COLORS.map(c => `<button class="pswatch${c === penColor ? ' sel' : ''}" data-c="${c}" style="background:${c}" aria-label="Pen color"></button>`).join('')}</div>
      <label class="ghost big pcustom">Pick any color<input type="color" value="${penColor}"></label>
      <button class="ghost big" data-cancel>Done</button></div>`;
    const close = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 180); };
    el.onclick = e => {
      const sw = e.target.closest('[data-c]');
      if (sw) { pick(sw.dataset.c); close(); }
      else if (e.target === el || e.target.closest('[data-cancel]')) close();
    };
    el.querySelector('input[type=color]').oninput = e => pick(e.target.value);
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
  };
}

// ---- shared freehand drawing surface (Pictionary, T-Shirt Wars) ----------
// Points are normalized 0..1 of the canvas's own box, not raw pixels, so a
// stroke drawn on one canvas (e.g. a phone) lines up correctly when replayed
// onto a differently-sized canvas (e.g. the TV or a gallery thumbnail).
const STROKE_OPTS = { thinning: 0.6, smoothing: 0.55, streamline: 0.55, simulatePressure: true };

function strokePath(points, size) {
  if (!points.length) return null;
  const outline = PerfectFreehand.getStroke(points, { ...STROKE_OPTS, size });
  if (!outline.length) return null;
  const path = new Path2D();
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) path.lineTo(outline[i][0], outline[i][1]);
  path.closePath();
  return path;
}

function makeCanvas(canvas, { color = '#111', size = 8, interactive = false, onPoint = null } = {}) {
  const ctx = canvas.getContext('2d');
  const committed = document.createElement('canvas');
  const cctx = committed.getContext('2d');
  let current = [];
  let currentColor = color;
  let activePointerId = null;
  let col = color;
  const exported = []; // { c: color, s: normalized-space points[] }, kept in parallel for toWire()

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    if (canvas.width === w * dpr && canvas.height === h * dpr) return;
    const prev = document.createElement('canvas');
    prev.width = committed.width; prev.height = committed.height;
    prev.getContext('2d').drawImage(committed, 0, 0);
    canvas.width = w * dpr; canvas.height = h * dpr; // CSS keeps the element at 100% of its box
    committed.width = w * dpr; committed.height = h * dpr;
    if (prev.width > 0 && prev.height > 0) {
      cctx.drawImage(prev, 0, 0, prev.width, prev.height, 0, 0, committed.width, committed.height);
    }
    redraw();
  }

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(committed, 0, 0);
    if (current.length) { const p = strokePath(current, size); if (p) { ctx.fillStyle = col; ctx.fill(p); } }
  }

  // point = { x, y, p } (normalized 0..1) or [x, y, p]. `fromLocal` means the interactive
  // user drove this directly (as opposed to a remote point replayed from the network).
  function startStroke(point, fromLocal) {
    const [nx, ny, p] = Array.isArray(point) ? point : [point.x, point.y, point.p];
    current = [[nx * canvas.width, ny * canvas.height, p]];
    currentColor = col;
    redraw();
    if (fromLocal) {
      exported.push({ c: col, s: [[nx, ny, p]] });
      if (onPoint) onPoint('start', { x: nx, y: ny, p }, col);
    }
  }
  function addPoint(point, fromLocal) {
    if (!current.length) return;
    const [nx, ny, p] = Array.isArray(point) ? point : [point.x, point.y, point.p];
    current.push([nx * canvas.width, ny * canvas.height, p]);
    redraw();
    if (fromLocal) {
      const s = exported[exported.length - 1]; if (s) s.s.push([nx, ny, p]);
      if (onPoint) onPoint('point', { x: nx, y: ny, p });
    }
  }
  function endStroke(fromLocal) {
    if (current.length) { const p = strokePath(current, size); if (p) { cctx.fillStyle = currentColor; cctx.fill(p); } }
    current = [];
    redraw();
    if (fromLocal && onPoint) onPoint('end', null);
  }
  function clear(fromLocal) {
    current = [];
    cctx.clearRect(0, 0, committed.width, committed.height);
    redraw();
    if (fromLocal) {
      exported.length = 0;
      if (onPoint) onPoint('clear', null);
    }
  }
  function repaintCommitted() {
    cctx.clearRect(0, 0, committed.width, committed.height);
    for (const stroke of exported) {
      const pts = stroke.s.map(([x, y, p]) => [x * committed.width, y * committed.height, p]);
      const path = strokePath(pts, size);
      if (path) { cctx.fillStyle = stroke.c; cctx.fill(path); }
    }
  }
  function undo(fromLocal) {
    if (!fromLocal || !exported.length) return;
    exported.pop();
    repaintCommitted();
    current = [];
    redraw();
    if (onPoint) onPoint('undo', null);
  }
  function renderStatic(strokes) {
    clear(false);
    for (const stroke of strokes || []) {
      const pts = (Array.isArray(stroke) ? stroke : stroke.s).map(pt => {
        const nx = pt[0] ?? pt.x, ny = pt[1] ?? pt.y, pr = pt[2] ?? pt.p ?? 0.5;
        return [nx * committed.width, ny * committed.height, pr];
      });
      const strokeColor = Array.isArray(stroke) ? col : (stroke.c || col);
      const p = strokePath(pts, size);
      if (p) { cctx.fillStyle = strokeColor; cctx.fill(p); }
    }
    redraw();
  }

  if (interactive) {
    canvas.style.touchAction = 'none';
    // A long press on iOS/Android otherwise starts a text selection that highlights the page.
    canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('selectstart', e => e.preventDefault());
    const toPoint = e => {
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const p = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
      return { x, y, p };
    };
    canvas.addEventListener('pointerdown', e => {
      if (activePointerId !== null) return;
      activePointerId = e.pointerId; canvas.setPointerCapture(e.pointerId);
      startStroke(toPoint(e), true);
    });
    canvas.addEventListener('pointermove', e => {
      if (e.pointerId !== activePointerId) return;
      addPoint(toPoint(e), true);
    });
    const end = e => { if (e.pointerId !== activePointerId) return; activePointerId = null; endStroke(true); };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', end);
  }

  // Track the box, not the window: layouts settle after the canvas is made (a scoreboard filling
  // in below it, a phone rotating), and a canvas stuck at its first size draws strokes off-target.
  resize();
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => { if (!canvas.isConnected) ro.disconnect(); else resize(); });
    ro.observe(canvas.parentElement);
  } else window.addEventListener('resize', resize);

  return {
    setColor: c => { col = c; },
    startStroke, addPoint, endStroke,
    clear: () => clear(true),
    clearRemote: () => clear(false),
    undo: () => undo(true),
    canUndo: () => exported.length > 0,
    renderStatic,
    toWire: () => exported.map(s => ({ c: s.c, s: s.s.slice() })),
  };
}
