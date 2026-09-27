'use strict';
// Best-effort filter for content that is awkward with kids or mixed company.
// It is a blocklist, so skim any board or survey you plan to play with kids.

const WORDS = [
  // sex and body
  'sex', 'sexy', 'sexual', 'naked', 'nude', 'nudity', 'strip', 'stripper', 'striptease', 'underwear', 'panties', 'panty',
  'bra', 'bras', 'thong', 'lingerie', 'boob', 'boobs', 'breast', 'breasts', 'butt', 'ass', 'penis', 'vagina', 'condom',
  'condoms', 'porn', 'erotic', 'orgasm', 'virgin', 'prostitute', 'hooker', 'mistress', 'affair', 'adultery', 'cheat',
  'cheating', 'cheater', 'kiss', 'kissing', 'makeout', 'hickey', 'pregnant', 'pregnancy', 'menstrual', 'period',
  'genitals', 'private parts', 'testicles', 'nipple', 'nipples', 'buttocks', 'crotch', 'diaper',
  // alcohol, drugs, smoking, gambling
  'alcohol', 'alcoholic', 'beer', 'wine', 'drunk', 'drinking', 'booze', 'liquor', 'whiskey', 'whisky', 'vodka',
  'tequila', 'rum', 'hangover', 'champagne', 'bourbon', 'margarita', 'cocktail', 'bartender', 'bar', 'bars', 'pub',
  'drug', 'drugs', 'marijuana', 'weed', 'cocaine', 'heroin', 'meth', 'stoned', 'cigarette', 'cigarettes', 'cigar',
  'smoke', 'smoking', 'smoker', 'tobacco', 'nicotine', 'vape', 'vaping', 'gambling', 'casino', 'lottery',
  // violence and death
  'kill', 'killed', 'killing', 'murder', 'murdered', 'gun', 'guns', 'weapon', 'weapons', 'shoot', 'shot', 'shooting',
  'die', 'died', 'dying', 'death', 'dead', 'suicide', 'rape', 'abuse', 'abused', 'kidnap', 'terrorist', 'bomb', 'stab',
  'blood', 'funeral', 'coffin', 'corpse', 'jail', 'prison', 'arrested', 'arrest', 'crime', 'criminal', 'thief', 'steal',
  'robbery', 'burglar', 'slapped', 'slap', 'punch', 'fight', 'fired', 'divorce', 'divorced', 'lawsuit',
  // crude, insults, other
  'fart', 'farts', 'poop', 'pee', 'pissed', 'piss', 'crap', 'damn', 'hell', 'bitch', 'bastard', 'shit', 'fuck', 'dick',
  'sucks', 'stupid', 'idiot', 'ugly', 'fat', 'dumb', 'hate', 'racist', 'slave', 'slavery', 'nazi', 'hitler',
  'cussing', 'swear', 'swearing', 'curse', 'insult', 'lie', 'lying', 'liar', 'gross', 'disgusting', 'vomit', 'puke',
  'toilet paper', 'wedgie', 'zit', 'pimple', 'wet the bed', 'hooters',
];

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RE = new RegExp(`\\b(?:${WORDS.map(escape).join('|')})\\b`, 'i');

const isFamilyFriendly = (...texts) => !texts.some(t => RE.test(String(t || '')));

module.exports = { isFamilyFriendly };
