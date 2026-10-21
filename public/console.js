'use strict';
const app = $('#app');
const key = new URLSearchParams(location.search).get('key') || '';
let state = null;
let wagerDraft = '';

const socket = connect({ role: 'console', key }, s => { state = s; render(); });
socket.on('denied', () => {
  app.innerHTML = '<div class="wrap"><div class="panel"><h2>Access denied</h2><p>Open the console link printed in the server terminal. It includes the host key.</p></div></div>';
});

const btn = (label, attrs, cls = '') => `<button class="btn ${cls}" ${attrs}>${label}</button>`;

// ---- menu ----------------------------------------------------------------
function hubPanel(s) {
  return `<div class="panel"><h2>Pick a game</h2>
    <div class="btns">
      ${btn('Jeopardy: type answers', 'data-act="startGame" data-type="jeopardy" data-mode="typed"', 'gold big')}
      ${btn('Jeopardy: multiple choice', 'data-act="startGame" data-type="jeopardy" data-mode="choice"', 'gold big')}
      ${btn('Family Feud', 'data-act="startGame" data-type="feud"', 'gold big')}
      ${btn('Wheel of Fortune', 'data-act="startGame" data-type="wheel"', 'gold big')}
      ${btn('Wavelength', 'data-act="startGame" data-type="wavelength"', 'gold big')}
      ${btn('Pictionary', 'data-act="startGame" data-type="pictionary"', 'gold big')}
      ${btn('T-Shirt Wars', 'data-act="startGame" data-type="tshirt"', 'gold big')}
      ${btn('Trivia Night (hard)', 'data-act="startGame" data-type="trivia" data-pack="general"', 'gold big')}
      ${btn('5th Grade Trivia', 'data-act="startGame" data-type="trivia" data-pack="fifthgrade"', 'gold big')}
      ${btn('Disney Trivia', 'data-act="startGame" data-type="trivia" data-pack="disney"', 'gold big')}
      ${btn('Name That Disney Movie', 'data-act="startGame" data-type="moviereveal"', 'gold big')}
      ${btn('Codenames', 'data-act="startGame" data-type="codenames" data-team-mode="random"', 'gold big')}
      ${btn('Password', 'data-act="startGame" data-type="password"', 'gold big')}
      ${btn('Scattergories', 'data-act="startGame" data-type="scattergories"', 'gold big')}
      ${btn('Hangman', 'data-act="startGame" data-type="hangman"', 'gold big')}
      ${btn('Count the Cubes', 'data-act="startGame" data-type="cubes" data-level="normal"', 'gold big')}
      ${btn('Count the Cubes (hard)', 'data-act="startGame" data-type="cubes" data-level="hard"', 'gold big')}
      ${btn('Tip the Scales', 'data-act="startGame" data-type="scales"', 'gold big')}
      ${btn('Memory Flash', 'data-act="startGame" data-type="memory"', 'gold big')}
      ${btn('Quick Math', 'data-act="startGame" data-type="quickmath"', 'gold big')}
      ${btn('Pop in Order', 'data-act="startGame" data-type="popinorder"', 'gold big')}
      ${btn('Odd One Out', 'data-act="startGame" data-type="oddoneout"', 'gold big')}
      ${btn('Color Clash', 'data-act="startGame" data-type="colorclash"', 'gold big')}
      ${btn('Blurry Picture', 'data-act="startGame" data-type="blurry"', 'gold big')}
      ${btn('Flip 7', 'data-act="startGame" data-type="flip7" data-variant="classic"', 'gold big')}
      ${btn('Flip 7: With a Vengeance', 'data-act="startGame" data-type="flip7" data-variant="vengeance" data-rules="flip7v"', 'gold big')}
      ${btn('Neanderthals', 'data-act="startGame" data-type="neanderthals"', 'gold big')}
    </div>
    <div class="meta">Jeopardy: ${esc(s.content.jeopardy)}. Family Feud: ${esc(s.content.feud)} (needs 2 or more players). Wheel: ${esc(s.content.wheel)}. Wavelength: ${esc(s.content.wavelength)} (needs 2 or more players). Pictionary: ${esc(s.content.pictionary)} (needs 2 or more players). T-Shirt Wars: ${esc(s.content.tshirt)} (needs 2 or more players). Movie Reveal: ${esc(s.content.moviereveal)}. Codenames: ${esc(s.content.codenames)} (needs 2 or more players). Password: ${esc(s.content.password)} (needs 2 or more players). Scattergories: ${esc(s.content.scattergories)}. Hangman: ${esc(s.content.hangman)} (needs 2 or more players). Neanderthals: ${esc(s.content.neanderthals)} (needs 2 or more players).</div>
    <div class="meta">Players join at <b>${esc(s.joinUrl)}</b></div></div>`;
}

// ---- Jeopardy ------------------------------------------------------------
function jeopardyPanel(s) {
  if (s.phase === 'board') {
    return `<div class="panel"><h2>Board. Players pick from their phones, or you can pick here.</h2>${boardHTML(s, { pick: true })}
      <div class="btns">${btn('Go to Final Jeopardy', 'data-act="startFinal"', 'quiet')}</div></div>`;
  }
  if (s.phase === 'clue') {
    const c = s.current;
    const who = findPlayer(s, c.buzzedId);
    let controls = '';
    let note = '';
    switch (c.stage) {
      case 'wager':
        note = `Daily Double. Max wager ${money(c.wagerMax)}. The player wagers on their phone, or you can set it here.`;
        controls = `<input type="number" id="wager" min="5" max="${c.wagerMax}" placeholder="Wager" value="${esc(wagerDraft)}">${btn('Set wager', 'data-act="wager"', 'gold')}`;
        break;
      case 'reading':
        note = 'Reading. Buzzers open automatically.';
        controls = btn('Open buzzers now (Space)', 'data-act="openNow"', 'gold') + btn('Skip clue (S)', 'data-act="skip"', 'quiet');
        break;
      case 'open': note = 'Buzzers are open.'; controls = btn('Skip clue (S)', 'data-act="skip"', 'quiet'); break;
      case 'answering':
        note = `${esc(who ? who.name : 'Someone')} is answering for ${money(c.value)}. The computer judges automatically. Use these to override.`;
        controls = btn('Mark correct (C)', 'data-act="judge" data-correct="1"', 'good') + btn('Mark incorrect (X)', 'data-act="judge" data-correct="0"', 'bad') + btn('Skip (S)', 'data-act="skip"', 'quiet');
        break;
      case 'revealed':
        note = c.challenge && !c.challenge.result ? 'A challenge is being voted on.' : 'Answer is on the TV. The board returns automatically.';
        controls = btn('Back to board (Space)', 'data-act="next"', 'gold');
        break;
    }
    const rulings = c.rulings.map(r => `<div class="meta">${esc((findPlayer(s, r.pid) || {}).name)}: "${esc(r.guess)}" ${r.correct ? 'correct' : 'incorrect'}</div>`).join('');
    return `<div class="panel"><h2>${esc(c.category)} for ${money(c.value)}${c.dd ? ' (Daily Double)' : ''}</h2>
      <div class="clue">${esc(c.clue || '(hidden until the wager is set)')}</div>
      <div class="ans">${esc(c.answer)}</div><div class="meta">${note}</div>${rulings}<div class="btns">${controls}</div></div>`;
  }
  if (s.phase === 'end') return '<div class="panel"><h2>Game over</h2></div>';
  const f = s.final;
  const rows = f.entries.map(e => {
    const p = findPlayer(s, e.id);
    return `<tr><td>${esc(p ? p.name : '?')}</td><td>${e.wager === null ? '-' : money(e.wager)}</td>
      <td>${e.answer === null ? '-' : esc(e.answer || '(blank)')}</td><td>${e.result === null ? '' : e.result ? 'Correct' : 'Incorrect'}</td></tr>`;
  }).join('');
  let action = '';
  if (s.phase === 'final_wager') action = btn('Skip waiting: missing wagers become $0', 'data-act="forceFinalNext"', 'gold');
  else if (s.phase === 'final_answer') action = btn('End answering now', 'data-act="forceFinalNext"', 'gold');
  else action = '<div class="meta">Answers are judged automatically.</div>';
  return `<div class="panel"><h2>Final Jeopardy: ${esc(f.category)}</h2><div class="clue">${esc(f.clue)}</div>
    ${f.answer ? `<div class="ans">${esc(f.answer)}</div>` : ''}
    <table><tr><th>Player</th><th>Wager</th><th>Answer</th><th></th></tr>${rows}</table><div class="btns">${action}</div></div>`;
}

// ---- Family Feud ---------------------------------------------------------
function feudPanel(s) {
  const answers = s.answers.map(a => `<tr><td>${a.n}</td><td>${esc(a.text)}</td><td class="num">${a.revealed ? a.pts : ''}</td></tr>`).join('');
  return `<div class="panel"><h2>Round ${s.round} of ${s.rounds}. Phase: ${esc(s.phase)}</h2>
    <div class="clue">${esc(s.question)}</div>
    <table>${answers}</table>
    <div class="meta">Answers are matched automatically. Skip forces a timeout, a strike, or the next round.</div>
    <div class="btns">${btn('Skip (S)', 'data-act="skip"', 'gold')}</div></div>
    <div class="panel"><h2>Teams</h2><table>${s.teams.map(t => `<tr><td style="border-left:6px solid ${t.color}">${esc(t.name)}</td><td class="num">${t.score}</td>
      <td class="btns">${btn('-50', `data-act="adjust" data-team="${t.id}" data-delta="-50"`, 'quiet')}${btn('+50', `data-act="adjust" data-team="${t.id}" data-delta="50"`, 'quiet')}</td></tr>`).join('')}</table></div>`;
}

// ---- Wheel ---------------------------------------------------------------
function wheelPanel(s) {
  const p = findPlayer(s, s.turnPid);
  return `<div class="panel"><h2>Round ${s.round} of ${s.rounds}. Phase: ${esc(s.phase)}</h2>
    <div class="meta">${esc(s.category)}</div><div class="ans">${esc(s.solution)}</div>
    <div class="meta">${p ? `Turn: ${esc(p.name)}. ` : ''}${esc(s.msg)}</div>
    <div class="btns">${btn(s.phase === 'roundEnd' ? 'Next round (S)' : 'Skip this turn (S)', 'data-act="skip"', 'gold')}</div></div>`;
}

// ---- Wavelength ------------------------------------------------------------
function wavelengthPanel(s) {
  const psy = findPlayer(s, s.psychicId);
  const gue = findPlayer(s, s.guesserId);
  return `<div class="panel"><h2>Round ${s.round} of ${s.rounds}. Phase: ${esc(s.phase)}</h2>
    <div class="clue">${esc(s.left)} &harr; ${esc(s.right)}</div>
    <div class="meta">Psychic: ${esc(psy ? psy.name : '?')}. Guesser: ${esc(gue ? gue.name : '?')}.</div>
    <div class="ans">Target: ${s.target === null ? '(hidden)' : s.target}${s.result ? `. Guess ${s.guess}, off by ${s.result.diff}, ${s.result.pts} points` : ` (current dial ${s.guess})`}</div>
    <div class="btns">${btn('Skip (S)', 'data-act="skip"', 'gold')}</div></div>`;
}

// ---- Count the Cubes ---------------------------------------------------------
function cubesPanel(s) {
  return `<div class="panel"><h2>Round ${s.round} of ${s.rounds}. Phase: ${esc(s.phase)}</h2>
    <div class="ans">${s.count} cubes</div>
    <div class="meta">${(s.answeredIds || []).length} answered.</div>
    <div class="btns">${btn('Skip ahead (S)', 'data-act="skip"', 'gold')}</div></div>`;
}

// ---- Tip the Scales ----------------------------------------------------------
function scalesPanel(s) {
  return `<div class="panel"><h2>Round ${s.round} of ${s.rounds}. Phase: ${esc(s.phase)}</h2>
    <div class="ans">The ${esc(s.ask)}: ${esc(s.answer)}</div>
    <div class="meta">Heaviest to lightest: ${esc((s.order || []).join(', '))}. ${(s.answeredIds || []).length} answered.</div>
    <div class="btns">${btn('Skip ahead (S)', 'data-act="skip"', 'gold')}</div></div>`;
}

// ---- Memory Flash, Quick Math, Pop in Order ---------------------------------------
function brainPanel(s) {
  return `<div class="panel"><h2>Round ${s.round} of ${s.rounds}. Phase: ${esc(s.phase)}</h2>
    ${s.game === 'memory' && s.answer ? `<div class="ans">${s.kind === 'where' ? `The ${esc(s.ask.name)} is in spot ${s.answer.cell + 1}` : `Answer: ${esc(s.answer.name)}`}</div>` : ''}
    <div class="btns">${btn('Skip ahead (S)', 'data-act="skip"', 'gold')}</div></div>`;
}

function playersPanel(s) {
  const plainScore = ['wavelength', 'pictionary', 'tshirt', 'trivia', 'moviereveal', 'cubes', 'scales', 'memory', 'quickmath', 'popinorder', 'flip7', 'oddoneout', 'colorclash', 'blurry'].includes(s.game);
  const adjustable = s.game === 'jeopardy' || s.game === 'wheel' || s.game === 'wavelength'
    || s.game === 'pictionary' || s.game === 'tshirt' || s.game === 'trivia' || s.game === 'moviereveal' || ['cubes', 'scales', 'memory', 'quickmath', 'popinorder', 'flip7', 'oddoneout', 'colorclash', 'blurry'].includes(s.game);
  const rows = s.players.map(p => `<tr>
    <td style="border-left:6px solid ${p.color}">${esc(p.name)}${p.connected ? '' : ' <span class="meta">(offline)</span>'}${p.id === s.controllerId ? ' <span class="meta">(has control)</span>' : ''}</td>
    <td class="num ${p.score < 0 ? 'neg' : ''}">${p.score === undefined ? '' : (plainScore ? p.score : money(p.score))}</td>
    <td class="btns">
      ${adjustable ? btn('-100', `data-act="adjust" data-player-id="${p.id}" data-delta="-100"`, 'quiet') + btn('+100', `data-act="adjust" data-player-id="${p.id}" data-delta="100"`, 'quiet') : ''}
      ${btn('Remove', `data-act="kick" data-player-id="${p.id}"`, 'quiet')}
    </td></tr>`).join('');
  return `<div class="panel"><h2>Players (${s.players.length})</h2>
    ${s.players.length ? `<table>${rows}</table>` : '<div class="meta">No one has joined yet.</div>'}</div>`;
}

function render() {
  const s = state;
  if (!s) return;
  const keep = document.activeElement && document.activeElement.id === 'wager';
  let main = '';
  if (s.phase === 'intro') {
    main = `<div class="panel"><h2>Showing the how-to-play screen</h2>
      <div class="btns">${btn('Start the game now', 'data-act="startNow"', 'gold big')}</div></div>`;
  } else if (s.game === 'hub') main = hubPanel(s);
  else if (s.game === 'jeopardy') main = jeopardyPanel(s);
  else if (s.game === 'feud') main = feudPanel(s);
  else if (s.game === 'wheel') main = wheelPanel(s);
  else if (s.game === 'wavelength') main = wavelengthPanel(s);
  else if (s.game === 'cubes') main = cubesPanel(s);
  else if (s.game === 'scales') main = scalesPanel(s);
  else if (['memory', 'quickmath', 'popinorder', 'oddoneout', 'colorclash', 'blurry'].includes(s.game)) main = brainPanel(s);
  else if (s.game === 'flip7') main = `<div class="panel"><h2>${esc(s.title)}. Round ${s.round}. Phase: ${esc(s.phase)}</h2>
    <div class="meta">${esc((s.log || []).map(l => l.text).join(' '))}</div>
    <div class="btns">${btn(s.phase === 'roundEnd' ? 'Next round (S)' : 'Hurry the current player (S)', 'data-act="skip"', 'gold')}</div></div>`;
  const footer = s.game === 'hub' ? '' : `<div class="btns">${btn('Restart this game', 'data-act="reset"', 'quiet')}${btn('Back to game menu', 'data-act="toMenu"', 'quiet')}</div>`;
  app.innerHTML = `<div class="wrap">
    <h1>Host console <small>${esc(s.title)}${s.mode ? ` (${s.mode === 'choice' ? 'multiple choice' : 'typed answers'})` : ''}</small></h1>
    ${main}${playersPanel(s)}${footer}
    <div class="keys">Keys: C correct, X incorrect, S skip, Space open buzzers or continue.</div>
  </div>`;
  if (keep) { const w = $('#wager'); if (w) { w.focus(); w.setSelectionRange(w.value.length, w.value.length); } }
}

app.addEventListener('input', e => { if (e.target.id === 'wager') wagerDraft = e.target.value; });

async function run(act, payload = {}) {
  if ((act === 'reset' || act === 'toMenu') && !confirm('End the current game?')) return;
  if (act === 'wager') payload.amount = wagerDraft;
  const err = await send(socket, act, payload);
  if (err) toast(err);
  else if (act === 'wager') wagerDraft = '';
}

app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const d = { ...b.dataset };
  const act = d.act;
  delete d.act;
  for (const k of ['ci', 'ri', 'delta', 'team']) if (k in d) d[k] = Number(d[k]);
  if ('correct' in d) d.correct = d.correct === '1';
  run(act, d);
});

document.addEventListener('keydown', e => {
  if (!state || e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (state.game === 'jeopardy' && state.phase === 'clue') {
    const c = state.current;
    if (k === 'c' && c.stage === 'answering') run('judge', { correct: true });
    else if (k === 'x' && c.stage === 'answering') run('judge', { correct: false });
    else if (k === 's') run('skip');
    else if (k === ' ') {
      e.preventDefault();
      if (c.stage === 'reading') run('openNow');
      else if (c.stage === 'revealed') run('next');
    }
  } else if (['feud', 'wheel', 'wavelength', 'pictionary', 'tshirt', 'trivia', 'moviereveal', 'codenames', 'password', 'scattergories', 'hangman', 'neanderthals', 'cubes', 'scales', 'memory', 'quickmath', 'popinorder', 'flip7', 'oddoneout', 'colorclash', 'blurry'].includes(state.game) && k === 's') run('skip');
});
