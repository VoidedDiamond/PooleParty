'use strict';
(() => {
  const who = (s, id) => { const p = findPlayer(s, id); return p ? esc(p.name) : 'Someone'; };

  function rulingsHTML(s, c) {
    return c.rulings.map(r => {
      const guess = r.guess ? `"${esc(r.guess)}"` : 'no answer';
      const cls = r.correct ? 'ok' : 'no';
      const label = r.correct ? (r.overruled ? 'Correct (overruled)' : 'Correct') : 'Incorrect';
      return `<div class="ruling ${cls}">${who(s, r.pid)}: ${guess}. ${label}</div>`;
    }).join('');
  }

  function clueHTML(s) {
    const c = s.current;
    const ctl = findPlayer(s, s.controllerId);
    if (c.stage === 'wager') {
      return `<div class="cluebox"><div class="cluemeta">${esc(c.category)}</div><div class="bigtitle">Daily Double</div>
        <div class="status">${esc(ctl ? ctl.name : 'A player')} is choosing a wager</div>${bar(c.endsAt, c.windowMs)}</div>`;
    }
    const meta = c.dd ? `${esc(c.category)}. Daily Double for ${money(c.value)}` : `${esc(c.category)} for ${money(c.value)}`;
    let status = '';
    let extra = '';
    if (c.stage === 'open') { status = 'Buzzers are open'; extra = bar(c.endsAt, c.windowMs); }
    else if (c.stage === 'answering') {
      status = `<span class="who">${who(s, c.buzzedId)}</span> is ${c.answerMode === 'choice' ? 'choosing an answer' : 'typing an answer'}`;
      extra = bar(c.endsAt, c.windowMs);
    } else if (c.stage === 'revealed') {
      if (c.challenge) {
        if (c.challenge.result) status = `Challenge ${c.challenge.result}`;
        else { status = `${who(s, c.challenge.pid)} challenges the ruling. Other players vote on their phones.`; extra = bar(c.endsAt, c.windowMs); }
      } else if (c.challengeable.length) {
        status = 'Ruled wrong but you were right? Challenge on your phone.';
        extra = bar(c.endsAt, c.windowMs);
      } else extra = bar(c.endsAt, c.windowMs);
    }
    return `<div class="cluebox">
      <div class="cluemeta">${meta}</div>
      <p class="cluetext">${esc(c.clue)}</p>
      ${c.stage === 'revealed' ? `<div class="answer">${esc(c.answer)}</div>` : ''}
      <div class="status">${status}</div>
      <div class="rulings">${rulingsHTML(s, c)}</div>
      ${extra}
    </div>`;
  }

  function finalHTML(s) {
    const f = s.final;
    const total = f.entries.length;
    if (s.phase === 'final_wager') {
      const n = f.entries.filter(e => e.wagerLocked).length;
      return `<div class="cluebox"><div class="cluemeta">Final Jeopardy</div>
        <div class="bigtitle">${esc(f.category)}</div>
        <div class="status">Wagers locked in: ${n} of ${total}</div>${bar(f.endsAt, f.windowMs)}</div>`;
    }
    if (s.phase === 'final_answer') {
      const n = f.entries.filter(e => e.answerLocked).length;
      return `<div class="cluebox"><div class="cluemeta">Final Jeopardy. ${esc(f.category)}</div>
        <p class="cluetext">${esc(f.clue)}</p>
        <div class="status">Answers locked in: ${n} of ${total}</div>${bar(f.endsAt, f.windowMs)}</div>`;
    }
    const rows = f.entries.filter(e => e.revealed).map(e => {
      const p = findPlayer(s, e.id);
      const res = e.result === null ? '' : e.result ? '<span class="ok">Correct</span>' : '<span class="no">Incorrect</span>';
      return `<div class="final-row ${e.id === f.currentId ? 'current' : ''}" style="--color:${p ? p.color : '#888'}">
        <span>${esc(p ? p.name : '?')} <span class="ans">${esc(e.answer || '(no answer)')}</span></span>
        <span>Wager ${money(e.wager || 0)}</span><span>${res}</span></div>`;
    }).join('');
    return `<div class="cluebox"><div class="cluemeta">Final Jeopardy. ${esc(f.category)}</div>
      <p class="cluetext">${esc(f.clue)}</p><div class="answer">${esc(f.answer)}</div>
      <div class="final-list">${rows}</div></div>`;
  }

  GAMES.jeopardy.tv = {
    html(s) {
      if (s.phase === 'end') return finalScoresTV(s, { fmt: money });
      let main = '';
      let turnId = null;
      let buzzedId = null;
      switch (s.phase) {
        case 'board': {
          const ctl = findPlayer(s, s.controllerId);
          turnId = s.controllerId;
          main = boardHTML(s) + `<div class="picker">${ctl ? `<b>${esc(ctl.name)}</b> picks the next clue` : ''}${bar(s.boardEndsAt, s.boardWindowMs)}</div>`;
          break;
        }
        case 'clue': main = clueHTML(s); buzzedId = s.current.buzzedId; break;
        default: main = finalHTML(s);
      }
      return `<div class="stage"><div class="main">${main}</div>${scoreboardHTML(s, { turnId, buzzedId })}</div>`;
    },
    sounds(a, b) {
      if (!a) return;
      const ca = a.current, cb = b.current;
      if (cb && (!ca || ca.ci !== cb.ci || ca.ri !== cb.ri) && cb.dd) sfx.dd();
      if (ca && cb && ca.stage !== 'answering' && cb.stage === 'answering' && !cb.dd) sfx.buzz();
      if (ca && cb && cb.rulings.length > ca.rulings.length) {
        sfx[cb.rulings[cb.rulings.length - 1].correct ? 'right' : 'wrong']();
      } else if (ca && cb && cb.challenge && cb.challenge.result === 'accepted' && !(ca.challenge && ca.challenge.result)) sfx.right();
    },
  };
})();
