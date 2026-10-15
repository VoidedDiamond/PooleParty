'use strict';
// The host voice: one short spoken line for each big game moment (a wild Feud answer, a
// Bankrupt, a bullseye, the winner). The TV spots the moments and speaks the lines; this module
// decides what to say.
//   classic - a pre-written line for that kind of moment (instant, offline, free)
//   ai      - Claude writes a line about what actually happened ("A GIRAFFE?"), falling back
//             to a classic line if the internet is down, the key is wrong, or it's too slow
//   off     - silent
// The Claude client and the API key live in claude.js; the chosen mode is saved in settings.
const claude = require('./claude');
const { settings, update } = require('./settings');

const AI_WAIT_MS = 5000;     // longer than this and the moment has passed: say a classic line instead
const AI_WAIT_BIG_MS = 9000; // welcome / game over can wait a little longer
const QUIET_MS = 3500;       // minor moments are skipped if the host spoke this recently

// The host's characters. The host's phone picks one (or 'mix': a new one each game). Each has a
// personality for the AI lines and a few classic lines of its own for the big moments; the TV
// picks a voice and delivery to match (public/announcer.js).
const STYLES = {
  gameshow: {
    label: 'Game show host',
    persona: 'a big-hearted, loud, quick-witted TV game-show host. Playful disbelief at wild answers, big hype for great ones, warm sympathy for bad luck.',
    lines: {},
  },
  sports: {
    label: 'Sports announcer',
    persona: 'an over-the-top sports play-by-play announcer calling game night like the final seconds of a championship: fast, punchy, sports metaphors, instant replays, crowd going wild.',
    lines: {
      welcome: ["Welcome to {game}, folks! The crowd is on its feet!", "It's game time! {game}, live from the living room!"],
      test: ['Check, check! Your announcer is in the booth and ready to call it!'],
      right: ['{name} drains it! Nothing but net!', 'What a play by {name}!', '{name} with the clutch answer!'],
      wrong: ['Ohh, {name} airballs it!', "Flag on the play! That's a miss, {name}.", '{name} swings and misses!'],
      nobody: ['Nobody scores on that possession!', 'A total shutout on that one, folks!'],
      gameover: ["And that's the final whistle! {name} takes the championship!", '{name} wins it! Unbelievable!'],
      tie: ["It's all tied up at the final whistle! {name}, co-champions!"],
    },
  },
  trailer: {
    label: 'Movie trailer narrator',
    persona: 'a dramatic movie-trailer narrator: deep, slow, epic. Every moment of game night is a blockbuster. Use "In a world..." style sparingly, and dramatic pauses written as ellipses.',
    lines: {
      welcome: ['In a world... where only one player can win... this is {game}.', 'This fall... one living room... {game}.'],
      test: ['This summer... your host... is ready.'],
      right: ['{name}... has done the impossible.', 'Against all odds... {name} was right.'],
      wrong: ['{name} chose... poorly.', 'One wrong answer... changed everything for {name}.'],
      nobody: ['No one... saw it coming.', 'The answer... remained a mystery.'],
      gameover: ['In the end... there could be only one. {name}.', '{name}... the legend is born.'],
      tie: ['Two champions... one destiny. {name}.'],
    },
  },
  grandma: {
    label: 'Grandma',
    persona: 'a sweet but sassy grandma hosting game night: warm, teasing, proud of everyone, calls players sweetie or honey, sometimes mentions cookies or knitting.',
    lines: {
      welcome: ["Gather round, sweeties, it's time for {game}!", "Oh, how fun! Let's play {game}, my darlings."],
      test: ["Can you hear me, dears? Grandma's got her hearing aid in!"],
      right: ["That's my smart cookie, {name}!", "Oh {name}, I'm so proud of you, honey!"],
      wrong: ['Oh, bless your heart, {name}.', 'Not quite, sweetie. Grandma still loves you, {name}.'],
      nobody: ['Nobody? Oh dear, oh dear.', 'Well, that one fooled all of you, sweethearts.'],
      gameover: ['{name} wins! Somebody get that child a cookie!', 'Congratulations, {name}, you made Grandma proud!'],
      tie: ["A tie! Grandma doesn't pick favorites. Well done, {name}!"],
    },
  },
  pirate: {
    label: 'Pirate captain',
    persona: 'a jolly pirate captain hosting game night: says arr, ahoy and matey, jokes about treasure, the plank and the seven seas. Family friendly.',
    lines: {
      welcome: ['Ahoy, crew! Hoist the sails for {game}!', 'All hands on deck! It be time for {game}!'],
      test: ['Ahoy! Yer captain be ready to sail!'],
      right: ['Arr, {name} struck gold!', 'Shiver me timbers, {name} got it!'],
      wrong: ['Walk the plank, {name}! That be wrong!', 'Arr, {name}, that answer be lost at sea.'],
      nobody: ['Not one of ye? Arr, the treasure stays buried!'],
      gameover: ['{name} claims the treasure! Yo ho ho!', 'Captain {name} rules the seven seas!'],
      tie: ['Split the treasure, mateys! {name}, ye both win!'],
    },
  },
};
const STYLE_IDS = Object.keys(STYLES);

const systemFor = style => `You are the host of Poole Party, a family game night played on a TV with phones as controllers.
You are ${(STYLES[style] || STYLES.gameshow).persona}
You react to the moment described with ONE short spoken line.
Rules:
- One sentence, at most 16 words. It is read aloud by a text-to-speech voice: no emojis, stage directions, hashtags, or quotes around the line.
- Family friendly. Tease the answer, never the person.
- Use the player's name when one is given.
- Never reveal an answer the moment says is still secret.
- If a player's answer is rude or inappropriate, don't repeat it; react to it vaguely.
Reply with only the line.`;

// Classic lines by kind of moment. {name}, {answer}, {game} are filled in.
const LINES = {
  welcome: ['Welcome, welcome, welcome to {game}!', "Alright everybody, it's time for {game}! Let's go!", 'Phones out, game faces on. This is {game}!', "Get comfortable, folks. {game} starts now!"],
  test: ["Testing, testing. Your host is warmed up and ready to go!", "Can everybody hear me? Good. Let's play some games!"],
  right: ['{name}, yes! That is what I am talking about!', 'Oh, look at {name} go!', 'Nailed it, {name}! High fives all around!', '{name} came to play tonight!', 'Big brain energy from {name}!'],
  wrong: ['{name}... I love you, but no.', 'Oh {name}, what were you thinking?', 'Hmm. I respect the confidence, {name}.', 'Bold choice, {name}. Wrong, but bold.', 'I had to read that twice, {name}.'],
  faceoff: ['{name} takes control!', 'Fastest fingers in the house: {name}!', '{name} wins the face-off. Play or pass?'],
  strike3: ['Three strikes! Ohhh, that hurts.', "That's three! Other team, here's your shot to steal it.", 'Strike three. Somebody hold me.'],
  steal: ['{name} steals it! Oh, that is cold!', 'Stolen! {name}, you thief!', 'And {name} takes the whole bank. Wow!'],
  stealfail: ['No steal! The points stay put.', 'Ohh, so close on the steal.', "The steal falls short. Sorry, {name}."],
  bankrupt: ['Bankrupt! Oh no, {name}!', "{name}, I'm so sorry. Bankrupt.", 'There goes the money! Bankrupt!'],
  loseturn: ['Lose a turn. Better luck next spin, {name}.', 'Oof. That wheel did not like you, {name}.'],
  solved: ['{name} solved it! Beautiful!', 'And {name} gets it! Pay that player!', 'Look at {name}, reading minds and puzzles!'],
  nobody: ['Nobody? Not a single one of you?', 'Wow. That one stumped the whole room!', 'Not one of you! I need a minute.', "The answer was {answer}. I'll give you a minute to be embarrassed.", 'Tough one! It was {answer}.', 'Stumped the whole room. It was {answer}.'],
  dailydouble: ["It's a Daily Double! {name}, how brave are you feeling?", 'Daily Double! Bet big or go home, {name}!'],
  no: ['NO! {name}, that was not one syllable!', 'Bonk! Caveman rules, {name}!', 'Ooh, {name} slipped. That costs you!'],
  assassin: ['The assassin! Oh, that is the worst word on the board!', "{name} found the assassin. That's game!", 'Of all the words... the assassin!'],
  miss: ['Ooh. Nobody was even close!', 'Way off, everybody! {name}, I think that clue needs work.', 'Not a single point on the board. Wow.'],
  bullseye: ['Bullseye! {name} is on the same wavelength!', '{name}, are you a mind reader?', 'Dead center! Unbelievable, {name}!'],
  thrownout: ['The group says no to {name}. Tough crowd!', "Thrown out! Sorry {name}, they didn't buy it."],
  bust: ['Bust! {name}, you got greedy!', 'Ohh, a double! Sorry, {name}.', '{name} flew too close to the sun!'],
  flipseven: ['Flip 7! {name}, you legend!', 'Seven cards! {name} cleans up!', 'FLIP SEVEN! Give it up for {name}!'],
  roundwin: ['Big round for {name}!', '{name} is heating up!', 'Somebody stop {name}!'],
  gameover: ['And the winner is... {name}! Congratulations!', "That's the game! {name}, take a bow!", '{name} wins it all tonight! Give it up!', 'Game over! {name}, you are the champion!'],
  tie: ["It's a tie! {name}, you share the crown!", 'We have a tie! Give it up for {name}!', 'Nobody could break the tie. Congratulations, {name}!'],
};
// Extra lines that only make sense in one game.
const GAME_LINES = {
  'Family Feud': {
    right: ['Survey says... {name} is a genius!', 'Good answer, {name}! Good answer!'],
    wrong: ['{name}, the people did not say that. Not one of them.', 'Somewhere out there, {name}, a survey taker is laughing.'],
  },
};
const BIG = new Set(['welcome', 'gameover', 'tie', 'test']);

class Announcer {
  constructor() {
    this.lastSaidAt = 0;
    this.inFlight = 0;
    this.recentEvents = new Map(); // event key -> time, so two TVs don't double up
    this.recentLines = [];
    this.lastPick = {};
    this.mixStyle = STYLE_IDS[Math.floor(Math.random() * STYLE_IDS.length)];
  }

  // The character speaking now: the chosen one, or this game's pick when it's 'mix'.
  get style() { return settings.hostStyle === 'mix' ? this.mixStyle : (STYLES[settings.hostStyle] ? settings.hostStyle : 'gameshow'); }

  // 'mix' picks a different character for each game.
  newGame() {
    if (settings.hostStyle !== 'mix') return;
    const others = STYLE_IDS.filter(id => id !== this.mixStyle);
    this.mixStyle = others[Math.floor(Math.random() * others.length)];
  }

  get mode() {
    const m = settings.voiceMode || 'ai';
    return m === 'ai' && !claude.hasKey() ? 'classic' : m;
  }

  status() {
    return {
      mode: this.mode, ai: claude.hasKey(), keyWhere: claude.keyWhere, error: claude.lastError,
      style: this.style, styleChoice: settings.hostStyle, voiceName: settings.voiceName, readAloud: settings.readAloud,
    };
  }

  setMode(mode) {
    if (!['off', 'classic', 'ai'].includes(mode)) return 'Unknown host mode';
    // Re-read the key every time AI is picked, so a fixed key file works without a restart.
    if (mode === 'ai') {
      claude.clearError();
      if (!claude.load()) return claude.lastError || claude.NO_KEY;
    }
    update({ voiceMode: mode });
    return null;
  }

  // ev: { key, kind, game, pri (1 minor, 2 normal, 3 big), name, answer, fact }
  // Resolves to { text, kind } to speak, or null to stay quiet.
  async lineFor(ev, players) {
    if (this.mode === 'off' || !ev || !LINES[ev.kind]) return null;
    const now = Date.now();
    for (const [k, t] of this.recentEvents) if (now - t > 60000) this.recentEvents.delete(k);
    if (ev.key && this.recentEvents.has(ev.key)) return null;
    if (ev.key) this.recentEvents.set(ev.key, now);
    const pri = ev.pri || 2;
    if (pri < 2 && (now - this.lastSaidAt < QUIET_MS || this.inFlight)) return null;

    let text = null;
    // Claude writes lines for the moments that matter (pri 2-3); quick, frequent ones (a right
    // Feud answer, a Pictionary guess) get a free classic line, which keeps a game night cheap.
    const ai = this.mode === 'ai' && claude.ready() && ev.fact && pri >= 2 && !(this.inFlight && pri < 3);
    if (ai) text = await this.aiLine(ev, players, pri);
    if (!text) text = this.classic(ev);
    this.lastSaidAt = Date.now();
    this.recentLines = [text, ...this.recentLines].slice(0, 4);
    return { text, kind: ev.kind };
  }

  classic(ev) {
    const own = (STYLES[this.style] || STYLES.gameshow).lines[ev.kind];
    let list = own && own.length ? own.slice() : [...LINES[ev.kind], ...((GAME_LINES[ev.game] || {})[ev.kind] || [])];
    // Read an answer out only when it's short enough to sound natural, and skip lines that need
    // a name or answer the moment doesn't have.
    let answer = String(ev.answer || '').trim().replace(/[.!?]+$/, '');
    if (answer.length > 28 || answer.split(/\s+/).length > 4) answer = '';
    if (answer && !/[a-z]/.test(answer)) { // PLAYING HIDE AND SEEK -> Playing Hide and Seek
      answer = answer.toLowerCase().replace(/\b[a-z]+/g, (w, at) => (at && /^(a|an|and|the|of|in|on|to|for|or)$/.test(w) ? w : w[0].toUpperCase() + w.slice(1)));
    }
    const usable = list.filter(l => (ev.name || !l.includes('{name}')) && (answer || !l.includes('{answer}')));
    if (usable.length) list = usable;
    const key = `${this.style}:${ev.game}:${ev.kind}`;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && list[i] === this.lastPick[key]) i = (i + 1) % list.length; // no back-to-back repeats
    this.lastPick[key] = list[i];
    return list[i]
      .replace(/\{name\}/g, ev.name || 'my friend')
      .replace(/\{answer\}/g, answer || 'that')
      .replace(/\{game\}/g, ev.game || 'Poole Party');
  }

  async aiLine(ev, players, pri) {
    const wait = BIG.has(ev.kind) || pri >= 3 ? AI_WAIT_BIG_MS : AI_WAIT_MS;
    const prompt = [
      `Game: ${ev.game || 'Poole Party'}`,
      players && players.length ? `Players: ${players.join(', ')}` : '',
      `What just happened: ${ev.fact}`,
      this.recentLines.length ? `Your last few lines (don't reuse their jokes): ${this.recentLines.map(l => `"${l}"`).join(' ')}` : '',
    ].filter(Boolean).join('\n');
    this.inFlight += 1;
    try {
      const text = await claude.ask({ system: systemFor(this.style), prompt, wait, feature: 'host' });
      if (!text) return null;
      const line = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean)[0] || '';
      return line.replace(/^["'“”]+|["'“”]+$/g, '').replace(/[*_#]/g, '').trim().slice(0, 200) || null;
    } finally {
      this.inFlight -= 1;
    }
  }
}

module.exports = { Announcer, LINES, STYLES };
