'use strict';
// The host voice on the TV. Each game's detector compares the previous state with the new one
// and reports big moments to the server ('hostEvent'); the server answers with a line
// ('hostSay', classic or written by Claude) that is spoken here and shown as a caption.
// Every event carries a `fact`: a plain description of what happened, for the AI host. Facts
// never include an answer that's still hidden from the room.
const Announcer = (() => {
  const nm = (s, id) => { const p = s && s.players && s.players.find(x => x.id === id); return p ? p.name : null; };
  const title = s => (GAME_MENU.find(g => g.id === s.game) || {}).name || s.title || 'Poole Party';
  const q = t => `"${String(t || '').slice(0, 160)}"`;
  const list = names => names.length <= 1 ? (names[0] || '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  // ---- per-game moment detectors: (a = previous state, b = new state) -> events[] -----------
  const D = {
    feud(a, b) {
      const out = [];
      const ques = `Survey question: ${q(b.question)}.`;
      if (b.face && b.face.resolved && !(a.face && a.face.resolved) && b.face.results) {
        const said = b.face.results.filter(r => r.id).map(r => `${nm(b, r.id)} said ${q(r.guess || 'nothing')} (${r.idx >= 0 ? `#${r.idx + 1} on the board` : 'not on the board'})`).join('; ');
        out.push({ kind: 'faceoff', name: nm(b, b.face.winner), fact: `${ques} Face-off: ${said}. ${nm(b, b.face.winner) || 'Nobody'} wins control.` });
      }
      const la = JSON.stringify(a.lastGuess), lb = b.lastGuess;
      if (lb && JSON.stringify(lb) !== la && lb.pid && lb.kind !== 'dup') {
        const who = nm(b, lb.pid);
        const said = lb.text ? `${who} answered ${q(lb.text)}` : `${who} ran out of time`;
        const hit = lb.kind === 'hit' && b.answers[lb.idx];
        if (a.phase === 'steal') {
          out.push(hit ? { kind: 'steal', name: who, fact: `${ques} Steal attempt: ${said}, and it's on the board! They steal all ${b.bank} points.` }
            : { kind: 'stealfail', name: who, fact: `${ques} Steal attempt: ${said}. Not on the board, so the steal fails.` });
        } else if (hit) {
          out.push({ kind: 'right', name: who, answer: b.answers[lb.idx].text, pri: 1, fact: `${ques} ${said}. It's on the board at #${lb.idx + 1}, worth ${b.answers[lb.idx].pts} points.` });
        } else if (b.phase === 'strikeout') {
          out.push({ kind: 'strike3', name: who, fact: `${ques} ${said}. Not on the board: that's the third strike. The other team can now steal.` });
        } else {
          out.push({ kind: 'wrong', name: who, answer: lb.text, fact: `${ques} ${said}. Not on the board. Strike ${b.strikes}.` });
        }
      }
      if (b.fm && b.fm.stage === 'done' && !(a.fm && a.fm.stage === 'done')) {
        out.push({ kind: b.fm.win ? 'roundwin' : 'nobody', name: (b.teams[b.fm.team] || {}).name,
          fact: `Fast Money is over: ${(b.teams[b.fm.team] || {}).name} scored ${b.fm.total} of the 200 points needed. ${b.fm.win ? 'They won!' : 'Not enough.'}` });
      }
      return out;
    },

    jeopardy(a, b) {
      const out = [];
      const c = b.current, ca = a.current;
      if (c && c.dd && (!ca || ca.ci !== c.ci || ca.ri !== c.ri)) {
        out.push({ kind: 'dailydouble', name: nm(b, b.controllerId), fact: `${nm(b, b.controllerId)} found the Daily Double in the category ${q(c.category)}.` });
      }
      if (c && ca && ca.ci === c.ci && ca.ri === c.ri && c.rulings.length > ca.rulings.length) {
        const r = c.rulings[c.rulings.length - 1];
        const who = nm(b, r.pid);
        const said = r.guess ? `answered ${q(r.guess)}` : 'ran out of time';
        if (r.correct) out.push({ kind: 'right', name: who, fact: `Jeopardy clue for $${c.value} in ${q(c.category)}: ${q(c.clue)}. ${who} ${said}. Correct!` });
        else out.push({ kind: 'wrong', name: who, answer: r.guess, fact: `Jeopardy clue in ${q(c.category)}: ${q(c.clue)}. ${who} ${said}. Wrong, minus $${c.value}. (The right answer is still secret.)` });
      }
      if (c && ca && c.stage === 'revealed' && ca.stage !== 'revealed' && !c.rulings.length) {
        out.push({ kind: 'nobody', answer: c.answer, pri: 1, fact: `Nobody buzzed in on the clue ${q(c.clue)}. The answer was ${q(c.answer)}.` });
      }
      return out;
    },

    wheel(a, b) {
      const out = [];
      if (b.msg && b.msg !== a.msg) {
        const who = nm(b, a.turnPid);
        if (/BANKRUPT/.test(b.msg)) out.push({ kind: 'bankrupt', name: who, fact: `${who} spun the wheel and landed on BANKRUPT, losing their money this round.` });
        else if (/lost a turn/.test(b.msg)) out.push({ kind: 'loseturn', name: who, pri: 1, fact: `${who} landed on Lose a Turn.` });
        else if (/Not it/.test(b.msg)) out.push({ kind: 'wrong', name: who, pri: 1, fact: `${b.msg}. The puzzle is still unsolved (keep the answer secret).` });
      }
      if (b.phase === 'roundEnd' && a.phase !== 'roundEnd') {
        out.push({ kind: 'solved', name: nm(b, b.roundWinner), answer: b.solution, fact: `${b.msg}. The puzzle was ${q(b.solution)} in the category ${q(b.category)}.` });
      }
      if (b.phase === 'bonus_end' && a.phase !== 'bonus_end' && b.bonus) {
        out.push({ kind: b.bonus.won ? 'solved' : 'nobody', name: nm(b, b.bonus.pid), answer: b.solution,
          fact: `Bonus round: ${nm(b, b.bonus.pid)} ${b.bonus.won ? `solved it and won $${b.bonus.prize.toLocaleString()}` : 'did not solve it'}. The puzzle was ${q(b.solution)}.` });
      }
      return out;
    },

    wavelength(a, b) {
      if (b.phase !== 'reveal' || a.phase === 'reveal' || !b.result) return [];
      const gs = b.result.guesses || [];
      const bulls = gs.filter(g => g.pts === 4).map(g => g.name);
      const res = gs.map(g => `${g.name} ${g.pts} points`).join(', ');
      const base = `Wavelength: the spectrum was ${q(b.left)} to ${q(b.right)}, ${nm(b, b.psychicId)} gave the clue. Results: ${res}.`;
      if (bulls.length) return [{ kind: 'bullseye', name: list(bulls), fact: `${base} Bullseye for ${list(bulls)}!` }];
      if (gs.length && gs.every(g => g.pts === 0)) return [{ kind: 'miss', name: nm(b, b.psychicId), fact: `${base} Everyone missed completely.` }];
      return [];
    },

    pictionary(a, b) {
      const out = [];
      if (b.phase === 'drawing' && a.phase === 'drawing' && (b.guesses || []).length) {
        const g = b.guesses[0];
        if (!g.correct && JSON.stringify(g) !== JSON.stringify((a.guesses || [])[0])) {
          out.push({ kind: 'wrong', name: g.name, answer: g.text, pri: 1, fact: `Pictionary: ${b.drawerName} is drawing a secret word. ${g.name} guessed ${q(g.text)}, which is wrong. Do NOT hint at the real word.` });
        }
      }
      if (b.phase === 'reveal' && a.phase === 'drawing') {
        const firstRight = [...(b.guesses || [])].reverse().find(g => g.correct);
        out.push(b.correctCount ? { kind: 'right', name: firstRight && firstRight.name, fact: `Pictionary: ${b.drawerName} drew ${q(b.word)}. ${b.correctCount} guessed it; ${firstRight ? firstRight.name : 'someone'} was first.` }
          : { kind: 'nobody', answer: b.word, name: b.drawerName, fact: `Pictionary: ${b.drawerName} drew ${q(b.word)} and nobody guessed it in time.` });
      }
      return out;
    },

    tshirt(a, b) {
      if (b.phase !== 'results' || a.phase === 'results' || !b.results) return [];
      const top = Math.max(0, ...b.results.map(r => r.votes));
      const winners = b.results.filter(r => top > 0 && r.votes === top).map(r => nm(b, r.id)).filter(Boolean);
      if (!winners.length) return [];
      return [{ kind: 'roundwin', name: list(winners), fact: `T-Shirt Wars prompt: ${q(b.prompt)}. ${list(winners)} won the vote with ${top}.` }];
    },

    trivia(a, b) {
      if (b.phase !== 'reveal' || a.phase === 'reveal') return [];
      const ans = (b.choices || [])[b.correct];
      const right = (b.results || []).filter(r => r.correct).map(r => nm(b, r.id));
      const fact = `Trivia question: ${q(b.question)} The answer was ${q(ans)}. ${right.length ? `Got it: ${list(right)}.` : 'Nobody got it.'}`;
      if (!right.length) return [{ kind: 'nobody', answer: ans, fact }];
      return [{ kind: 'right', name: list(right), pri: 1, fact }];
    },

    cubes(a, b) {
      if (b.phase !== 'reveal' || a.phase === 'reveal') return [];
      const rs = b.results || [];
      const exact = rs.filter(r => r.off === 0).map(r => nm(b, r.id)).filter(Boolean);
      const said = rs.map(r => `${nm(b, r.id)} said ${r.n}`).join(', ');
      const fact = `Count the Cubes: a stack of cubes flashed on the TV and there were ${b.count}. ${said || 'Nobody answered'}. ${exact.length ? `Exactly right: ${list(exact)}.` : 'Nobody got it exactly.'}`;
      if (exact.length) return [{ kind: 'right', name: list(exact), pri: 1, fact }];
      const close = rs.slice().sort((x, y) => x.off - y.off)[0];
      return [close && close.pts ? { kind: 'right', name: nm(b, close.id), pri: 1, fact: `${fact} Closest: ${nm(b, close.id)}, off by ${close.off}.` } : { kind: 'nobody', answer: String(b.count), fact }];
    },

    scales(a, b) {
      if (b.phase !== 'reveal' || a.phase === 'reveal') return [];
      const right = (b.results || []).filter(r => r.correct).map(r => nm(b, r.id)).filter(Boolean);
      const fact = `Tip the Scales: seesaws compared shapes and the question was which is the ${b.ask}. It was the ${b.answer}. ${right.length ? `Got it: ${list(right)}.` : 'Nobody got it.'}`;
      return [right.length ? { kind: 'right', name: list(right), pri: 1, fact } : { kind: 'nobody', answer: `the ${b.answer}`, fact }];
    },

    memory(a, b) {
      if (b.phase !== 'reveal' || a.phase === 'reveal') return [];
      const right = (b.results || []).filter(r => r.correct).map(r => nm(b, r.id)).filter(Boolean);
      const what = b.kind === 'where' ? `where the ${b.ask.name} was` : `which picture was in the glowing spot (the ${b.answer.name})`;
      const fact = `Memory Flash: pictures flashed on the TV, then players had to remember ${what}. ${right.length ? `Got it: ${list(right)}.` : 'Nobody remembered.'}`;
      return [right.length ? { kind: 'right', name: list(right), pri: 1, fact } : { kind: 'nobody', fact }];
    },

    quickmath(a, b) { return D.racedone(a, b, 'Quick Math, a race to answer sums'); },
    popinorder(a, b) { return D.racedone(a, b, 'Pop in Order, a race to pop numbered bubbles from smallest to largest'); },
    racedone(a, b, what) {
      if (b.phase !== 'results' || a.phase === 'results') return [];
      const top = b.race.slice().sort((x, y) => y.pts - x.pts)[0];
      if (!top || top.pts <= 0) return [];
      const name = nm(b, top.id);
      return [{ kind: 'roundwin', name, fact: `${what}: ${name} won round ${b.round} with ${top.pts} points (${top.right} right).` }];
    },

    moviereveal(a, b) {
      if (b.phase !== 'reveal' || a.phase === 'reveal') return [];
      return [b.winnerName ? { kind: 'right', name: b.winnerName, fact: `Name That Disney Movie: ${b.winnerName} guessed ${q(b.movie)} after ${(b.clues || []).length} clue(s).` }
        : { kind: 'nobody', answer: b.movie, fact: `Name That Disney Movie: nobody guessed ${q(b.movie)}.` }];
    },

    codenames(a, b) {
      const l = (b.log || [])[0], la = (a.log || [])[0];
      if (l && l.kind === 'guess' && l.color === 'assassin' && JSON.stringify(l) !== JSON.stringify(la)) {
        return [{ kind: 'assassin', name: l.by, pri: 3, fact: `Codenames: ${l.by} tapped ${q(l.word)}, the assassin. Their team loses instantly.` }];
      }
      return [];
    },

    password(a, b) {
      if (b.phase !== 'reveal' || a.phase === 'reveal') return [];
      const pair = list([nm(b, b.hinterId), nm(b, b.guesserId)].filter(Boolean));
      return [b.awarded > 0 ? { kind: 'right', name: pair, pri: 1, fact: `Password: ${pair} got ${q(b.word)} for ${b.awarded} points.` }
        : { kind: 'nobody', answer: b.word, pri: 1, fact: `Password: ${pair} ran out of points. The password was ${q(b.word)}.` }];
    },

    scattergories(a, b) {
      if (b.phase !== 'catResult' || a.phase === 'catResult') return [];
      const out = (b.verdicts || []).find(v => !v.valid && /ruled it out/.test(v.reason || ''));
      return out ? [{ kind: 'thrownout', name: out.name, answer: out.text, pri: 1, fact: `Scattergories, letter ${b.letter}, category ${q(b.category)}: ${out.name} answered ${q(out.text)} and the group threw it out.` }] : [];
    },

    hangman(a, b) {
      const out = [];
      if (b.lastMiss && (!a.lastMiss || a.lastMiss.at !== b.lastMiss.at) && b.lastMiss.what && b.lastMiss.what.length > 1) {
        out.push({ kind: 'wrong', name: b.lastMiss.name, answer: b.lastMiss.what, pri: 1, fact: `Hangman, theme ${q(b.theme)}: ${b.lastMiss.name} tried to solve with ${q(b.lastMiss.what)}. Wrong (keep the word secret).` });
      }
      if (b.phase === 'reveal' && a.phase !== 'reveal' && b.awarded) {
        out.push(b.awarded.won ? { kind: 'solved', name: b.awarded.solverName || 'the group', fact: `Hangman: the word was ${q(b.word)} and ${b.awarded.solverName || 'the group'} got it.` }
          : { kind: 'nobody', answer: b.word, fact: `Hangman: nobody got it; the stick figure is complete. The word was ${q(b.word)}.` });
      }
      return out;
    },

    neanderthals(a, b) {
      const out = [];
      if (b.lastNo && (!a.lastNo || a.lastNo.at !== b.lastNo.at)) {
        out.push({ kind: 'no', name: nm(b, b.poetId), pri: 1, fact: `Poetry for Neanderthals: ${nm(b, b.poetId)}, the poet, broke the one-syllable rule and got bonked with the NO stick${b.lastNo.self ? ' (they owned up)' : ` by ${b.lastNo.by}`}.` });
      }
      if (b.phase === 'turnEnd' && a.phase === 'turn' && b.turnPts >= 5) {
        out.push({ kind: 'roundwin', name: nm(b, b.poetId), fact: `Poetry for Neanderthals: ${nm(b, b.poetId)} scored ${b.turnPts} points in one 90-second turn.` });
      }
      return out;
    },
  };

  // ---- read-aloud: what a real host reads out (questions, clues, categories) --------------------
  // (a = previous state of the same game, or {} for its first state; b = new state) -> text or null.
  // Only things already on the TV; never a secret answer.
  const R = {
    feud(a, b) {
      if (b.phase === 'faceoff' && (a.phase !== 'faceoff' || a.round !== b.round)) return `Round ${b.round}. We surveyed 100 people. ${b.question}`;
      return null;
    },
    jeopardy(a, b) {
      const c = b.current, ca = a.current;
      if (c && !c.dd && c.clue && (!ca || ca.ci !== c.ci || ca.ri !== c.ri)) return c.clue;
      if (c && c.dd && c.clue && c.stage === 'answering' && !(ca && ca.ci === c.ci && ca.ri === c.ri && ca.stage === 'answering')) return c.clue;
      const f = b.final, fa = a.final;
      if (f && b.phase === 'final_wager' && a.phase !== 'final_wager') return `Final Jeopardy. The category is ${f.category}. Make your wagers.`;
      if (f && f.clue && b.phase === 'final_answer' && a.phase !== 'final_answer') return f.clue;
      return null;
    },
    trivia(a, b) { return b.phase === 'question' && (a.phase !== 'question' || a.qIndex !== b.qIndex) ? b.question : null; },
    wheel(a, b) {
      const fresh = a.category !== b.category || a.round !== b.round;
      return b.phase === 'turn' && b.category && fresh ? `The category is ${b.category}.` : null;
    },
    wavelength(a, b) {
      return b.phase === 'clue' && (a.phase !== 'clue' || a.round !== b.round) ? `${nm(b, b.psychicId) || 'Psychic'}, give us a clue between ${b.left} and ${b.right}.` : null;
    },
    hangman(a, b) { return b.phase === 'guessing' && a.phase !== 'guessing' && b.theme ? `The theme is ${b.theme}.` : null; },
    moviereveal(a, b) {
      const cb = b.clues || [], ca = a.clues || [];
      if (b.phase !== 'clue' || !cb.length) return null;
      if (a.roundNum !== b.roundNum) return `Name that movie. ${cb[cb.length - 1]}`;
      return cb.length > ca.length ? cb[cb.length - 1] : null;
    },
    codenames(a, b) {
      const c = b.clue, ca = a.clue;
      return c && c.word && (!ca || ca.word !== c.word || ca.number !== c.number) ? `${(b.teams && b.teams[b.turn] || {}).name || 'Next team'}: ${c.word}, ${c.number}.` : null;
    },
    memory(a, b) {
      if (b.phase !== 'question' || a.phase === 'question') return null;
      return b.kind === 'where' ? `Where was the ${b.ask.name}?` : 'What was in the glowing spot?';
    },
    scales(a, b) { return b.phase === 'question' && (a.phase !== 'question' || a.round !== b.round) ? `Round ${b.round}. Which is the ${b.ask}?` : null; },
    cubes(a, b) { return b.phase === 'show' && (a.phase !== 'show' || a.round !== b.round) ? `Round ${b.round}. Count the cubes!` : null; },
    scattergories(a, b) { return b.phase === 'writing' && a.phase !== 'writing' && b.letter ? `The letter is ${b.letter}.` : null; },
    tshirt(a, b) { return b.phase === 'drawing' && a.phase !== 'drawing' && b.prompt ? `Your prompt: ${b.prompt}` : null; },
  };

  // Whoever is on top at the end, by player score or by team.
  function winners(s) {
    if (s.game === 'codenames' && s.winner != null && s.teams) return [s.teams[s.winner].name];
    if (Array.isArray(s.teams) && s.teams.length === 2 && s.teams.every(t => typeof t.score === 'number')) {
      const [x, y] = s.teams;
      return x.score === y.score ? [x.name, y.name] : [(x.score > y.score ? x : y).name];
    }
    const ps = (s.players || []).filter(p => typeof p.score === 'number');
    const top = Math.max(...ps.map(p => p.score));
    return ps.filter(p => p.score === top).map(p => p.name);
  }

  function report(ev, s) {
    if (!mainSocket) return;
    mainSocket.emit('hostEvent', { pri: 2, ...ev, game: title(s), key: ev.key || `${s.game}:${ev.kind}:${s.now}` });
  }

  function observe(a, b) {
    if (b.game === 'hub') return;
    if (prefs.readAloud && prefs.mode !== 'off' && R[b.game]) {
      try { const text = R[b.game](a && a.game === b.game ? a : {}, b); if (text) read(text); } catch (e) { console.warn('host read-aloud', e); }
    }
    if (!a || a.game !== b.game) return;
    if (b.phase === 'end' && a.phase !== 'end') {
      const ws = winners(b), w = list(ws);
      report({ kind: ws.length > 1 ? 'tie' : 'gameover', name: w, pri: 3, fact: `${title(b)} just ended. ${ws.length > 1 ? `It's a tie between ${w}` : `Winner: ${w}`}. Final scores: ${(b.teams && b.teams.every && b.teams.every(t => typeof t.score === 'number') ? b.teams : b.players).map(p => `${p.name} ${p.score ?? ''}`).join(', ')}.` }, b);
      return;
    }
    let evs = [];
    try { evs = (D[b.game] ? D[b.game](a, b) : []) || []; } catch (e) { console.warn('host voice detector', e); }
    // Several moments at once (a Feud answer and a strike): the biggest one speaks.
    if (evs.length) report(evs.sort((x, y) => (y.pri || 2) - (x.pri || 2))[0], b);
  }

  function welcome(s) {
    report({ kind: 'welcome', pri: 3, key: `welcome:${s.game}:${s.endsAt}`, fact: `A new game of ${title(s)} is about to start with ${list(s.players.map(p => p.name))}. Welcome everyone and hype it up.` }, s);
  }

  // ---- voices -----------------------------------------------------------------------------------
  // The voice comes from the TV's browser. Microsoft Edge has lifelike "Natural" voices; Chrome on
  // Windows mostly has older robotic ones. The host's phone can pick any of them by name; on Auto,
  // each character gets a voice that suits it.
  const prefs = { mode: 'classic', style: 'gameshow', voiceName: null, readAloud: true };
  const isNatural = v => /\b(Natural|Neural)\b/i.test(v.name);
  const STYLE_VOICES = {
    gameshow: [/(Andrew|Guy|Brian|Christopher|Eric)\b.*Natural/i],
    sports: [/(Guy|Eric|Brian|Andrew|Davis)\b.*Natural/i],
    trailer: [/(Christopher|Davis|Roger|Steffan|Guy)\b.*Natural/i],
    grandma: [/(Jenny|Aria|Michelle|Nancy|Jane|Ava|Emma)\b.*Natural/i, /Google US English/i, /Zira/i],
    pirate: [/(Ryan|Thomas|William|Guy|Davis)\b.*Natural/i, /Google UK English Male/i],
  };
  const FALLBACK = [/Natural.*English \(United States\)/i, /Natural/i, /Google US English/i, /Microsoft (Mark|David)/i];
  // How each character talks (natural voices sound wrong when pitched far, so keep it subtle).
  const DELIVERY = {
    gameshow: { rate: 1.08, pitch: 1 }, sports: { rate: 1.2, pitch: 1.03 }, trailer: { rate: 0.86, pitch: 0.86 },
    grandma: { rate: 0.96, pitch: 1.05 }, pirate: { rate: 1, pitch: 0.94 },
  };
  let voices = [];
  let voice = null;
  const english = () => (window.speechSynthesis ? speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)) : []);
  function pickVoice() {
    voices = english();
    voice = null;
    if (prefs.voiceName) voice = voices.find(v => v.name === prefs.voiceName) || null;
    if (!voice) {
      for (const re of [...(STYLE_VOICES[prefs.style] || []), ...FALLBACK]) { voice = voices.find(v => re.test(v.name)); if (voice) break; }
    }
    if (!voice) voice = voices.find(v => /en-US/i.test(v.lang)) || voices[0] || null;
  }
  // Tell the server which voices this TV has, natural ones first.
  let sentVoices = '';
  function reportVoices() {
    if (typeof mainSocket === 'undefined' || !mainSocket) return;
    const list = english().map(v => ({ name: v.name, lang: v.lang, natural: isNatural(v) }))
      .sort((x, y) => (y.natural - x.natural) || x.name.localeCompare(y.name));
    const sig = JSON.stringify(list);
    if (sig === sentVoices && mainSocket.connected) return;
    sentVoices = sig;
    mainSocket.emit('tvVoices', list);
  }
  if (window.speechSynthesis) {
    pickVoice();
    speechSynthesis.onvoiceschanged = () => { pickVoice(); reportVoices(); };
  }

  // Called with every state: the host's choices from the phone.
  function configure(v) {
    if (!v) return;
    const changed = v.style !== prefs.style || v.voiceName !== prefs.voiceName;
    Object.assign(prefs, { mode: v.mode, style: v.style || 'gameshow', voiceName: v.voiceName || null, readAloud: v.readAloud !== false });
    if (changed) pickVoice();
    if (!sentVoices) reportVoices();
  }
  setTimeout(reportVoices, 1500);
  setInterval(() => { if (typeof mainSocket !== 'undefined' && mainSocket && !mainSocket.connected) sentVoices = ''; else if (!sentVoices) reportVoices(); }, 5000);

  // ---- speech + caption -----------------------------------------------------------------------
  const queue = [];
  let speaking = false;

  function caption(text) {
    let el = $('#hostcap');
    if (!el) {
      el = document.createElement('div');
      el.id = 'hostcap';
      el.innerHTML = `<span class="hostcap-mic">${icon('mic')}</span><span class="hostcap-text"></span>`;
      document.body.appendChild(el);
    }
    clearTimeout(caption.t);
    if (!text) { caption.t = setTimeout(() => el.classList.remove('show'), 1600); return; }
    $('.hostcap-text', el).textContent = text;
    el.classList.add('show');
  }

  function next() {
    if (speaking || !queue.length) return;
    const line = queue.shift();
    if (Date.now() - line.at > (line.read ? 20000 : 9000)) { next(); return; } // the moment has passed
    speaking = true;
    if (!line.read) caption(line.text); // a question being read is already on the screen
    let finished = false;
    const done = () => { if (finished) return; finished = true; speaking = false; Sound.duck(false); if (!line.read) caption(null); setTimeout(next, 250); };
    // Volume 0 on the host's phone: captions only.
    if (!window.speechSynthesis || Sound.voiceVolume <= 0) { setTimeout(done, line.read ? 0 : 2500 + line.text.length * 45); return; }
    Sound.duck(true); // dip the music under the host
    const u = new SpeechSynthesisUtterance(line.text);
    u.volume = Math.min(1, Sound.voiceVolume);
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : 'en-US';
    const d = DELIVERY[prefs.style] || DELIVERY.gameshow;
    const natural = voice && isNatural(voice);
    u.rate = line.read ? Math.min(1.05, Math.max(0.9, d.rate)) : d.rate;
    u.pitch = natural ? d.pitch : d.pitch * 0.94;
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
    // Some browsers drop onend; never let the queue jam.
    setTimeout(done, 2500 + line.text.length * 120);
  }

  // A question or clue to read out: it waits for the current line, and older chatter is dropped.
  function read(text) {
    for (let i = queue.length - 1; i >= 0; i--) if (!queue[i].read) queue.splice(i, 1);
    queue.push({ text: String(text).slice(0, 400), at: Date.now(), read: true });
    next();
  }

  onHostSay(line => {
    if (!line || !line.text) return;
    const big = ['welcome', 'gameover', 'tie', 'test', 'assassin'].includes(line.kind);
    if (big) { for (let i = queue.length - 1; i >= 0; i--) if (!queue[i].read) queue.splice(i, 1); } // the big moment wins
    else if (queue.length >= 1) return;   // don't build up a backlog of stale reactions
    queue.push({ text: line.text, at: Date.now() });
    next();
  });

  return { observe, welcome, configure, get voiceName() { return voice ? voice.name : null; } };
})();
