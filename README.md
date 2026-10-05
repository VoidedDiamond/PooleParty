# Poole Party

Jackbox-style game night on your own network. One laptop runs the server and shows the game on the TV. Everyone else plays from their phone browser. No account, no app, no internet needed once it is set up.

Thirteen games in one app, 1-10 players depending on the game: Jeopardy, Family Feud, Wheel of Fortune, Wavelength, Pictionary (with a Disney word list), T-Shirt Wars, Trivia (5th Grade or Disney), Name That Disney Movie, Codenames, Password, Scattergories, Hangman, and Neanderthals. No human judge is needed anywhere — typed answers are checked by a fuzzy matcher, drawing/trivia games are scored automatically, and Scattergories answers are settled by a quick group challenge vote instead of one person adjudicating.

## Run it

Requires Node 18 or newer.

    npm install
    npm run fetch-data     (one time, downloads the question banks, needs internet)
    npm start

Without `fetch-data` the games still work, using the small sample content that ships in `content/`.

**Desktop shortcut (Windows):** double-click `Poole Party.bat` (or the "Poole Party" shortcut it
creates on the Desktop) instead of the commands above — it installs dependencies the first time,
starts the server, and opens the TV screen in your browser automatically after a few seconds.
Leave its console window open while you play; closing it stops the game. Re-run
`node tools/make-icon.js` if you ever want to regenerate `Poole Party.ico`.

The terminal prints the addresses:

- TV display: `http://localhost:3000/host` (fullscreen on the TV, F11)
- Players: `http://<laptop-ip>:3000` (a QR code is on the TV menu)

Windows will ask to allow Node through the firewall the first time. Allow it on Private networks.
If phones cannot connect, the router may have client isolation on. Run the laptop as a mobile hotspot instead.

If guests aren't on your Wi-Fi yet, start the server with `--wifi-ssid=` (and `--wifi-pass=` if it's not open) to show a second QR code on the TV that joins the network directly, no typing a password required:

    npm start -- --wifi-ssid="Our House" --wifi-pass="hunter2"

(env vars `WIFI_SSID` / `WIFI_PASSWORD` / `WIFI_HIDDEN=true` work the same way.) It's a second, separate QR code — scan it first for Wi-Fi, then the regular QR to join the game.

## Playing

There's no separate admin screen. Everyone joins from their phone by scanning the QR code on the TV and typing a name. Whoever joins first is the host: their phone shows a game picker (and a Disney Night toggle, if you've kept the Disney content) instead of "waiting for host". They tap a game once everyone's in. Anyone can fix their name from the lobby with the Change name button. If the host's phone drops out mid-game (locked, closed, out of battery), the next connected player quietly becomes host, with no setup needed. During a game the host's phone has a small Menu / Restart bar at the bottom; everyone else's phone doesn't show it, since only the host can use it.

For real households where nobody wants that much control, an advanced `/console` page still exists (open it on any browser on the same machine, or from a phone with the `?key=` link the terminal prints) with score adjustments, manual judging overrides, and a kick-player button. It's optional. Day to day, nobody needs to open it.

### Jeopardy
- Choose typed answers or multiple choice when you start.
- Wait for the buzzers to open, then tap BUZZ. Buzzing early locks you out briefly.
- Typed mode: you type the answer and the matcher rules on it. Multiple choice: four options appear on your phone only.
- Wrong answers cost points and reopen the buzzers for the others. The player who answers correctly picks next.
- Challenge: if a clue ends with nobody right and you think you were, tap Challenge. The other players vote on their phones. If they accept, you get the points; if they reject it, you lose half the clue's value.
- Daily Double and Final Jeopardy (secret wagers, auto-judged) are included.
- A board is 5 random categories from the bank, five clues each.

### Family Feud
- Needs 2 or more players. Players are split into two teams in join order. Two players means 1 v 1.
- Each round starts with a face-off: one player from each team types their answer at the same time. The higher-ranked answer wins control.
- The controlling team takes turns typing answers. Three strikes and the other team gets one steal attempt.
- The face-off winner chooses to play or pass.
- Four rounds. Points count double in round 3 and triple in round 4.
- Fast Money: the leading team plays. Each player gets 5 survey questions typed on their phone (30 seconds for the first player, 35 for the second, and the second player cannot repeat the first player's answer). Answers are revealed one at a time and 200 points wins. It does not change the game score.
- Answers on the board are matched leniently ("sun screen" finds "sunscreen", "beach hat" finds "sun hat").

### Wavelength

No teams: everyone plays for themselves. The Psychic role rotates through the group in join order, one round per player (2 players means 2 rounds, 5 players means 5 rounds).

- The Psychic's phone privately shows a hidden bullseye on a dial between two words (like "Hot" and "Cold") and a single button once they've said their clue **out loud**. There is nothing to type; say the clue the way you would around the table.
- Everyone else then drags the needle on their own phone's dial to where they think the bullseye is and locks it in. Guesses stay private until the reveal, when every needle appears on the TV.
- Landing dead center scores 4 points, a bit off scores 3 or 2, and a miss scores 0. The Psychic earns the average of what the guessers scored, so a clearer clue pays off.
- Scores are individual and carry across the whole game; there's a ranked list at the end.

Wavelength itself is a physical board game (Asmodee/CMYK, 2019), not a Jackbox title — Jackbox's closest game, Blather 'Round, is actually a Taboo-style word game, not a spectrum-guessing one. The 239 spectrum pairs bundled here (`content/wavelength/pairs.json`) and the scoring math (a 4-point zone 4.5% of the scale wide, with 3- and 2-point zones 3x and 5x that) are adapted from two MIT-licensed open source clones, [Hamatti/taajuus](https://github.com/Hamatti/taajuus) and [gjeuken/telewave](https://github.com/gjeuken/telewave), which it builds on. Add your own pairs by editing that file, or point at your own with `--wavelength=file.json`; format is `{ "pairs": [{ "left": "Hot", "right": "Cold" }] }`. The Standard/Disney toggle doesn't have a Disney pack for this game yet, so it always uses the standard set.

### Disney Night

If a Disney pack is present, the host's phone shows a Standard / Disney Night toggle before picking a game. It swaps in a fixed Disney-themed board for Jeopardy, Disney survey questions for Family Feud, Disney puzzles for Wheel of Fortune, and a Disney word list for Pictionary, all bundled in `content/*/disney.json`. It's separate from the downloaded banks, so it works even without running `fetch-data`. Edit those files to add your own categories, questions, puzzles, or words; the format matches the sample files described below.

### Wheel of Fortune
- Three rounds. On your turn: spin and call a consonant, buy a vowel for $250, or solve.
- Bankrupt and Lose a Turn are on the wheel. Correct letters earn the wedge value per letter.
- Solving wins the round. The winner banks their round total, with a $1,000 minimum.
- After three rounds the leader plays a bonus round: R S T L N E are given, pick 3 more consonants and a vowel, then 25 seconds to solve for a prize that is added to their score.
- The wheel animation is simple on purpose.

### Pictionary / Disney Pictionary
- No teams: the drawer rotates so everyone draws exactly once per game (2 players means 2 rounds, 5 players means 5 rounds).
- The drawer picks 1 of 3 word choices, then draws on their phone — it streams live to the TV as they draw, using a smooth pressure-simulated freehand line (the same rendering approach as tldraw and Excalidraw), vendored locally in `public/vendor/perfect-freehand.js` so it needs no internet. Five pen colors, Undo and Clear; the drawing is square on every screen, so what the drawer sees is exactly what the TV shows.
- Everyone else types guesses on their own phone; guesses are fuzzy-matched by `games/match.js`, so small typos still count. First correct guess scores the most; the drawer scores a little for every correct guess.
- Pick "Disney Pictionary" from the host's picker (or the Disney Night toggle) for an all-Disney word list: characters, movies, magic objects, and park moments.

### T-Shirt Wars
- Everyone gets the same silly design prompt (e.g. "a shirt for a superhero whose only power is finding parking spots") and draws their own shirt design at the same time, privately, on their own phone.
- Once everyone taps "I'm Done" (or time runs out), the TV reveals every design and each phone gets a "vote for your favorite" screen — you can't vote for your own.
- Designs are shown as Shirt A, B, C… while voting; names appear with the results.
- Pen tools: five quick colors, a "+" for 24 more (or any color via the phone's picker), Undo and Clear.
- Whoever gets the most votes that round scores the most points. Plays 3 rounds, then a final scoreboard.

### Trivia: Trivia Night / 5th Grade / Disney
- A set of 10 multiple-choice questions. **Trivia Night** (the default, and the hard one) draws from about 13,600 grown-up questions and visits ten subjects per game: History, Geography, Science, Movies, Music, Television, Sports, Books & Arts, Animals and a Potluck. 5th Grade cycles grade 1 up through grade 5; Disney Trivia gets harder as it goes.
- Everyone answers on their own phone at the same time; the TV just shows the question and a running "answered" count so nobody can see picks before the reveal.
- Correct answers score 100-200 points depending on how fast you answered (25 seconds per question). Your phone tells you if you were right; the TV shows who got it.

### Name That Disney Movie
- The TV (and every phone) shows a vague clue about a Disney movie's plot. Every several seconds a more specific clue is added, up to 4 total.
- Anyone can type a guess on their phone at any time (fuzzy-matched, so small typos count); guessing right on an early, vague clue is worth more (400 points) than guessing once it's obvious (down to 100).
- First correct guess ends the round and reveals the title; if nobody gets it, the movie is revealed once all clues run out. Plays 8 rounds, then a final scoreboard.

### Codenames
- 3+ players: choose Random Teams or Pick Your Team when you start it (2 players just get one per side automatically). Each team's first member becomes its spymaster.
- The spymaster sees every word's secret color on their own phone and types a one-word clue plus a number; their teammates tap words on their phones to guess (the TV board only reveals colors as they're actually guessed, so nobody else can peek).
- Guessing the other team's word or a neutral word ends your turn; guessing the black assassin word loses instantly. First team to find all of their own words wins.
- Colorblind friendly: every card whose color is known carries a shape (red ▲, blue ■, neutral —, assassin ✕), and each phone has a Colorblind mode switch that adds stripes and stronger contrast.

### Password
- Rotates a hinter/guesser pair each round (everyone gets a turn). The hinter privately sees the password and types one-word clues; the guesser says guesses out loud — no typing needed.
- The hinter taps "They got it!" to award the current point total (starts at 10, drops by 2 per extra clue) or "Nope, new clue" to try again. Both the hinter and guesser score when it's guessed. The game is a whole number of laps around the group (about 8 rounds), so everyone hints and guesses equally often, odd-sized groups included.

### Scattergories
- Each round reveals a letter and 8 categories; everyone privately types an answer starting with that letter for every category, against the clock.
- Then the group judges it together, one category at a time: every answer is valid by default, but anyone (other than its author) can challenge one they don't buy. If a majority of the other players challenge it, it's thrown out — no single judge, no typing "valid/invalid" on every single answer.
- Valid answers score 2 points, or 1 if another player wrote a near-identical valid answer in the same category. Plays 3 rounds with fresh letters and categories.

### Hangman
- One player per round picks a theme (from 3 choices) and a secret word from it is drawn automatically. Everyone else taps letters on their phone or types a guess for the whole thing.
- Six misses completes the figure and ends the round. Guessers score for each letter they found, plus a bonus for solving, and lose 10 points for a wrong letter (25 for a wrong solve); the theme picker scores more the longer the group struggles.

### Neanderthals
Based on the rules of Poetry for Neanderthals. Two ways to play: **Teams** (Team Glad vs Team Mad, 4+ players) or **Everyone for themselves**.
- Players take turns as the Poet, an equal number of turns each (teams get the same number of turns). A turn is 90 seconds: get through as many cards as you can. The TV shows one big countdown bar.
- Each card has a 1-point word and a 3-point phrase, plus a short "don't say" list. Get the word (+1), then go for the phrase (+2 more) or tap Next card. Going straight for the phrase scores 3.
- Speak in one-syllable words only, as many as you like. Never say a word from the card or any part of one, or anything on the don't-say list. No gestures, rhymes, spelling or initials.
- Passing a fresh card costs 1 point. Breaking a rule earns a NO! (−1, card lost): in Teams the other team sees the card on their phones and smacks the NO! button; everyone for themselves, any guesser can call it. The Poet can also tap "I slipped". Penalties only ever cost the Poet's side, never the guesser.
- Everyone for themselves: the Poet taps who said it, and both score. Cards live in `content/neanderthals/cards.json` (`{ "cards": [{ "one": "Fork", "three": "Pitchfork", "ban": ["eat", "spoon"] }] }`); `--neanderthals=file.json` loads your own.

## Music and sound

The TV plays background music: a laid-back theme on the menu, its own theme for every game (game
show disco for Family Feud, spy jazz for Codenames, a whistled western for Hangman, cave drums for
Neanderthals...), and a victory loop on the final scores. On top of that are sound effects for the
big moments: buzz-ins, board reveals, strike buzzers, the wheel clicking past each wedge, Bankrupt,
drumrolls before a reveal, applause, a ticking clock for the last five seconds. All of it is
synthesized live in the browser, so it works offline, and every tune is original. The music dips
while the host is talking.

Browsers only allow sound after you interact with the page, so **click the TV screen once** (or
press a key) after it opens. A banner at the top reminds you until you do.

**Volumes:** the host's phone has a **Sound & host** button in the lobby (and a speaker button
next to Menu / Restart during a game) with sliders for **Music**, **Sound effects** and **Host
voice**. The settings are saved on the laptop (`data/settings.json`), so they stick between game
nights.

## Host voice

The TV has a game-show host who reacts out loud to the big moments: a wild Family Feud answer, a
Bankrupt, a Wavelength bullseye, nobody getting a trivia question, the winner. The line is spoken
by the TV browser's built-in voice and shown as a caption in the bottom corner.

Pick the mode in **Sound & host** on the host's phone (Host voice: **Off / Classic / AI**, plus a
**Test** button):

- **Classic** - pre-written lines. Free, instant, works offline. This is the default without a key.
- **AI** - Claude writes a fresh line about what actually happened ("Spaghetti? For a
  Shakespeare character?"). If the internet drops, the key is wrong, or Claude takes more than a
  few seconds, that moment falls back to a classic line, and the reason shows on the host's phone.
- **Off** - silent.

For the most natural voice, open the TV page in Microsoft Edge (its "Natural" voices sound far
better than the older Windows ones); the host picks the best English voice the browser has.

## AI answers

Typed answers are first checked by the built-in matcher, which forgives typos, plurals and extra
words but not different words. With an API key, answers it rejects get a second look from Claude,
which accepts answers that mean the same thing: "boot" for **Shoes** on a Family Feud board,
"sofa" for "couch" in Pictionary, "JFK" for "John F. Kennedy" in Jeopardy, an alternate movie
title in Name That Disney Movie. The TV shows "Checking with the judges" while it decides (the
turn clock stops), and marks answers it accepted ("The judges count it as Shoes").

It covers Family Feud (face-offs, turns, steals, Fast Money), Jeopardy (including Final
Jeopardy), Pictionary, and Name That Disney Movie. Password, Hangman and Wheel of Fortune still
need the exact word, since that's the point of those games. If Claude is slow or offline, the
answer is ruled by the built-in matcher alone. Jeopardy's challenge vote still works either way.

**Tougher multiple-choice Jeopardy.** Without the API, a clue's wrong options come from the clue
bank (mostly the other answers in the same column, plus answers to related clues from other
boards), so a sharp player can solve some clues by elimination. With the API, Claude writes three
believable wrong options for every clue on the board as the game starts: the same kind of thing
as the right answer, fitting the clue, and never another answer from the board. A clue picked
before its options arrive starts with clue-bank options and switches over if Claude's arrive
before anyone answers.

Both are under **AI answers** in **Sound & host** on the host's phone.

## Setting up the AI features (optional)

The AI host and AI answers need a Claude API key. The game looks for it in a text file named
`anthropic-api-key.txt` **on the Desktop** of the laptop running the game (a OneDrive Desktop
works too). Keeping it on the Desktop, outside the game folder, means updates and GitHub never
touch it, and anyone else who downloads Poole Party sets it up the same way with their own key.

1. Go to https://platform.claude.com (the Claude Console) and sign in or make an account. The API
   is billed separately from a Claude.ai subscription: add a few dollars of credit under
   **Billing**, and set a monthly spend limit there if you want a hard cap.
2. Open **API Keys**, click **Create Key**, name it "Poole Party", and copy it. It starts with
   `sk-ant-` and is only shown once.
3. Save it on the Desktop. Easiest is PowerShell, which finds the right Desktop even when OneDrive
   moved it:

       Set-Content "$([Environment]::GetFolderPath('Desktop'))\anthropic-api-key.txt" 'sk-ant-...paste-your-key...'

   Or open Notepad, paste the key, and **Save As** `anthropic-api-key.txt` on the Desktop.
4. Start Poole Party. The game window says `Claude key: found on your Desktop (…abcd)` with the
   last four characters, so you can tell which key it picked up. If the game is already running,
   tap **AI** under Host voice (or **On** under AI answers) on the host's phone; it re-reads the file.

The key never leaves the laptop: phones and the TV only ever see "AI on/off" and error messages,
never the key. Treat the file like a password (anyone using that laptop can open it), and if it
ever gets out, delete the key in the Console and make a new one. The game also accepts the
`ANTHROPIC_API_KEY` environment variable, or `anthropic-api-key.txt` inside the game folder (it's
in `.gitignore`).

**Keeping it cheap.** Each host line or answer check is a tiny request, around half a cent, and
the game is built to make as few as possible:

- **A spending cap per session.** Under **AI spending** in **Sound & host** on the host's phone:
  $0.50, $1 (the default), $2, $5, or no cap. Once a session reaches it, the free offline host and
  judge take over until you raise the cap or restart the game. The same panel shows what this
  session and this month have cost, and the game window prints the month total at startup. These
  are estimates from the published prices; the real bill is in the Claude Console, where you
  can also set a monthly spend limit as a hard backstop.
- **Never paying twice.** Every answer ruling and every set of Jeopardy options Claude writes is
  saved on the laptop (`data/ai-cache.json`), so the same guess or clue is free on later nights.
- **Batching.** Pictionary and Name That Disney Movie guesses that arrive together are checked
  in one request, with a few requests per round at most.
- **AI lines only for the big moments.** Quick, frequent moments (a right Feud answer, a Wheel
  letter) get a free pre-written line; Claude writes lines for wrong answers, steals, Bankrupts,
  winners and the like.
- **Quick thinking.** Every request runs at the lowest effort setting, which is plenty for one
  sentence or a yes/no ruling.

## Content

`npm run fetch-data` downloads two public datasets into `data/raw/` and builds banks in `content/`:

- Jeopardy: the Kids and Teen tournament clues from jwolle1/jeopardy_clue_dataset. About 1,950 five-clue categories. That dataset states that its clues belong to Jeopardy Productions, Inc. and asks that it not be used for public-facing sites or apps. Keep this for private use at home.
- Family Feud: about 6,000 surveys from ProtoQA (iesl/protoqa-data), licensed CC-BY-4.0.
- Trivia Night: questions from OpenTriviaQA (uberspot/OpenTriviaQA), licensed CC BY-SA 4.0, filtered by `tools/build-trivia-pack.js` (four distinct choices, no giveaways or dated questions, family filter) into `content/trivia/general.json`. `npm run fetch-data -- trivia` rebuilds it.

For the whole Jeopardy archive instead of just the Kids and Teen games, run `npm run fetch-data -- --full`. It downloads about 80 MB, keeps the family-friendly categories (about 45,000 boards), and saves a random 15,000 of them to `content/jeopardy/bank-full.json`. Regular-show clues are much harder, so multiple choice mode is friendlier. Delete `bank-full.json` to go back to the Kids and Teen set.

Both go through a blocklist filter (`tools/family-filter.js`) that drops alcohol, violence, crude and adult topics. It is best-effort, so skim what you play with kids.

Custom content:

- Jeopardy: copy `content/jeopardy/sample.json` and run `npm start -- --jeopardy=content/jeopardy/mine.json`. Each clue needs `value`, `clue`, `answer`. Add `"dailyDouble": true` to place one.
- Family Feud: same idea with `--feud=file.json`. Format: `{ "questions": [{ "q": "Name a pet.", "a": [["dog", 45], ["cat", 37]] }] }`.
- Wheel: `--wheel=file.json` with `{ "puzzles": [{ "cat": "PHRASE", "text": "BREAK THE ICE" }] }`. To import a CSV with category and puzzle columns: `npm run import-wheel -- puzzles.csv`.
- Pictionary: `--pictionary=file.json` with `{ "categories": { "easy": ["cat", "dog"], "hard": ["gramophone"] } }` — any number of category keys, all pooled together (except a `disney` key, which is reserved for the Disney toggle content).
- T-Shirt Wars: `--tshirt=file.json` with `{ "prompts": ["A shirt for...", ...] }`.
- Trivia: edit `content/trivia/fifthgrade.json` or `content/trivia/disney.json` directly (no `--flag` override yet). Each question needs `tier` (1-5 or 1-3), `topic`, `q`, 4 `choices`, and `correct` (the correct choice's index). `maxTier` and `tierLabels` at the top control the escalation and the badge text shown on screen.
- Movie Reveal: edit `content/movie/disney.json` directly. Each entry needs a `title` and a `clues` array of 3-5 strings ordered vague → specific.
- Codenames: `--codenames=file.json` with `{ "words": ["AGENT", "BEACH", ...] }` — needs at least 25 words.
- Password: `--password=file.json` with `{ "words": ["APPLE", "BRIDGE", ...] }`.
- Scattergories: `--scattergories=file.json` with `{ "letters": ["A", "B", ...], "categories": ["Types of fruit", ...] }`.

## How answers are judged

`games/match.js` handles all typed answers, across Jeopardy, Family Feud, Pictionary guesses, and Movie Reveal guesses. It ignores case, punctuation, articles, "What is", plurals, and small typos. It accepts a part of a name ("Eisenhower" for "Dwight David Eisenhower") but not a lone generic word ("city" for "Kansas City"), and it never accepts a near-miss on numbers or roman numerals. On its own it does not understand synonyms, so "sunblock" will not match "sunscreen"; with an API key, the AI answer judge (`games/judge.js`, above) takes a second look at those. Without one, the Jeopardy challenge exists for those cases. `npm test` runs a few checks. If a ruling feels wrong, `ACCEPT` and the generic word list at the top of that file are the knobs.

## Credits

The look of each game borrows color palettes and layout ideas (no code) from open source projects: joshzcold/Friendly-Feud (MIT) for Family Feud, StoneMoney/jeopardy for Jeopardy, dylhof/wheel-of-fortune for Wheel of Fortune, and Hamatti/taajuus and gjeuken/telewave (both MIT) for Wavelength, whose content and scoring math this one also reuses (see the Wavelength section above). Pictionary and T-Shirt Wars draw with [perfect-freehand](https://github.com/steveruizok/perfect-freehand) (MIT), vendored as a plain browser script in `public/vendor/perfect-freehand.js`. The themes are in the last block of `public/style.css`, driven by the `data-game` attribute, so you can change any palette in one place. The Bebas Neue font is used if it is installed, with Impact as the fallback.

## Learning the code

A good reading order, easiest first: `games/match.js` (pure functions, no network), `games/wavelength.js` (the smallest game engine, no answer-matching at all), `games/trivia.js` and `games/moviereveal.js` (similar shape, slightly more state), `games/pictionary.js` and `games/tshirt.js` (the drawing games — see the note on the stroke relay below), `server.js`, then `public/play-wavelength.js`.

Easy first edits:

- In `games/wavelength.js`, change `ZONE` (how forgiving the scoring is) or the round timers.
- In `games/wheel.js`, change `VOWEL_COST`, or add or remove entries in `WEDGES`.
- In `games/jeopardy.js`, change `BUZZ_WINDOW_MS` or `ANSWER_MS`.
- In `games/pictionary.js`, `games/tshirt.js`, `games/trivia.js`, or `games/moviereveal.js`, the round-length and scoring constants are all named constants at the top of each file.
- Add your own puzzles to `content/wheel/puzzles.json`, your own spectrum pairs to `content/wavelength/pairs.json`, or your own words/prompts/questions/clues to any of the `content/` files listed above.
- Add a test line to `tools/self-test.js` for an answer you want the matcher to accept, then run `npm test`.

After editing anything in `games/` or `server.js`, restart the server (or use `npm run dev`, which restarts by itself). Files in `public/` only need a browser refresh.

### How live drawing works (Pictionary)

Everywhere else in this app, an action goes through the same round trip: a player taps something, the server updates game state, then `broadcast()` sends the full state to everyone. That's too slow and too heavy for individual pen strokes — dozens of points a second, most of them only relevant to the TV. So Pictionary's strokes travel on their own socket event (`'stroke'`, wired up in `server.js` and `public/common.js`'s `onStroke`/`sendStroke` helpers), relayed straight from the drawer's phone to the TV with no game-state round trip in between. The game module only gets involved at the start and end of each stroke (`recordStroke()`), just enough to rebuild the picture for a TV that reconnects mid-round. T-Shirt Wars, by contrast, doesn't need any of this: each design stays private until everyone's done, so it's just drawn locally and sent once, whole, as a normal action.

## Layout

    server.js               sockets, players, game menu, reconnect tokens, live-stroke relay
    games/                  jeopardy.js, feud.js, wheel.js, wavelength.js,
                             pictionary.js, tshirt.js, trivia.js, moviereveal.js,
                             match.js, content.js
    games/announcer.js      host voice lines (classic, or written by Claude)
    games/judge.js          the AI answer judge (second look at rejected answers)
    games/quizmaker.js      Claude-written wrong options for multiple-choice Jeopardy
    games/claude.js         the shared Claude client: finds the key on the Desktop, meters spending
    games/aicache.js        remembered AI rulings and options (data/ai-cache.json)
    games/settings.js       volumes and host settings, saved to data/settings.json
    tools/                  data download and build scripts, family filter
    content/                sample content and generated banks (jeopardy/, feud/, wheel/,
                             wavelength/, pictionary/, tshirt/, trivia/, movie/)
    public/host*.js         TV views          public/play*.js     phone views
    public/announcer.js     host voice on the TV: spots big moments, speaks, captions
    public/audio.js         music themes and sound effects, synthesized with Web Audio
    public/console.js       host controls
    public/common.js        shared helpers: socket connection, scoreboard/timer HTML,
                             and the freehand drawing canvas (makeCanvas) used by
                             Pictionary and T-Shirt Wars
    public/vendor/           perfect-freehand.js, vendored for offline drawing
