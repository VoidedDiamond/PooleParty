'use strict';
// Flip 7 card faces, shared by the TV and phones.
const F7 = (() => {
  // Number cards get a color per value, like the real deck's rainbow.
  const NUM_COLORS = ['#868e96', '#e03131', '#f76707', '#f59f00', '#74b816', '#37b24d', '#0ca678', '#1098ad', '#1c7ed6', '#4263eb', '#7048e8', '#ae3ec9', '#d6336c', '#c92a2a'];
  const ACT_ICONS = {
    freeze: '❄', flip3: '3', second: '♥', justone: '+1', flip4: '4', steal: '✋', discard: '✕', swap: '⇄',
  };
  function card(c, extra = '') {
    if (!c) return '';
    if (c.kind === 'num') {
      const sp = c.sp ? ` sp ${c.sp}` : '';
      const label = c.sp === 'zero' ? '0' : String(c.v);
      const tag = c.sp === 'unlucky7' ? '<small>Unlucky</small>' : c.sp === 'lucky13' ? '<small>Lucky</small>' : c.sp === 'zero' ? '<small>The Zero</small>' : '';
      return `<span class="f7c num${sp}${extra}" style="--cc:${NUM_COLORS[c.v] || '#555'}" data-card="${c.id}"><b>${label}</b>${tag}</span>`;
    }
    if (c.kind === 'mod') return `<span class="f7c mod ${c.op}${extra}" data-card="${c.id}"><b>${esc(c.label)}</b></span>`;
    return `<span class="f7c act ${c.act}${extra}" data-card="${c.id}"><i>${ACT_ICONS[c.act] || '!'}</i><small>${esc(c.label)}</small></span>`;
  }
  const HOW = {
    freeze: 'Freeze someone: they bank their points and are out of the round.',
    flip3: 'Pick who has to flip three cards in a row.',
    second: 'You already have a Second Chance. Give this one to another player.',
    justone: 'Pick who flips just one more card, then has to stay.',
    flip4: 'Pick who has to flip four cards in a row.',
    steal: "Steal a card from another player's row.",
    discard: 'Throw away any card on the table.',
    swap: 'Pick two cards from two different players to swap.',
  };
  const howTo = c => (c.kind === 'mod' ? `Put ${c.label} on any player still in the round.` : HOW[c.act] || '');
  return { card, howTo };
})();
