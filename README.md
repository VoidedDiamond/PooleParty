# Poole Party

Jackbox-style game night on your own network. One laptop runs the server and shows the game on the TV. Everyone else plays from their phone browser. No account, no app, no internet needed once it is set up.

Twelve games in one app, 1-10 players depending on the game: Jeopardy, Family Feud, Wheel of Fortune, Wavelength, Pictionary, Disney Pictionary, T-Shirt Wars, Trivia (5th Grade or Disney), Name That Disney Movie, Codenames, Password, and Scattergories. No human judge is needed anywhere — typed answers are checked by a fuzzy matcher, drawing/trivia games are scored automatically, and Scattergories answers are settled by a quick group challenge vote instead of one person adjudicating.

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

**No admin rights (school or work computer)?** You don't need to install Node. If it isn't
installed, `Poole Party.bat` downloads the official zip from nodejs.org into a `node` folder next to
it the first time (about 35 MB, checked against nodejs.org's published checksum) and uses that.
Nothing is installed; delete the `node` folder to remove it. To set it up by hand instead, download
the Windows "Standalone Binary (.zip)" from https://nodejs.org/en/download, unzip it, and rename the
folder inside to `node` so that `node\node.exe` sits next to `Poole Party.bat`. For the `npm`
commands above in PowerShell, first run `$env:Path = "$PWD\node;$env:Path"` in this folder.
Allowing Node through the firewall (below) can need an admin password, so on a locked-down computer
phones may not be able to connect even though the TV screen works.

**Sharing it with friends (no install at all):** friends who don't want to touch Node or npm can
download one file and double-click it, the way you'd start any other game: `PooleParty.exe` on
Windows, or `PooleParty-Mac.zip` for Macs with Apple chips. Send them
https://github.com/VoidedDiamond/PooleParty/releases/latest, which has step-by-step instructions
(`.github/release-notes.md`) above the download links. To publish a new version from whatever is on
main, open the repo's **Actions** tab, pick **Downloads**, and click **Run workflow**; it builds both
files on GitHub's Windows and Mac machines, checks that they start, and adds them as a new release.
To build just for the computer you're on, run `node tools/build-release.js` (Node 20.12 or newer),
which writes `dist/PooleParty.exe` (or `dist/PooleParty`) and test-launches it. The download is
the Node runtime with the app packed inside (`tools/launcher.js` unpacks it to the user's app-data
folder on first run and after updates, keeping their settings), so it's about 100 MB. It isn't
code-signed, so Windows and macOS warn about it the first time; the release notes walk through that.

The terminal prints the addresses:

- TV display: `http://localhost:3000/host` (fullscreen on the TV, F11)
- Players: `http://<laptop-ip>:3000` (a QR code is on the TV menu)

Windows will ask to allow Node through the firewall the first time. Allow it on Private networks.
If phones cannot connect, the router may have client isolation on. Run the laptop as a mobile hotspot instead.

If guests aren't on your Wi-Fi yet, start the server with `--wifi-ssid=` (and `--wifi-pass=` if it's not open) to show a second QR code on the TV that joins the network directly, no typing a password required:

    npm start -- --wifi-ssid="Our House" --wifi-pass="hunter2"

(env vars `WIFI_SSID` / `WIFI_PASSWORD` / `WIFI_HIDDEN=true` work the same way.) It's a second, separate QR code — scan it first for Wi-Fi, then the regular QR to join the game.

## Playing

There's no separate admin screen. Everyone joins from their phone by scanning the QR code on the TV and typing a name. Whoever joins first is the host: their phone shows a game picker (and a Disney Night toggle, if you've kept the Disney content) instead of "waiting for host". They tap a game once everyone's in. If the host's phone drops out mid-game (locked, closed, out of battery), the next connected player quietly becomes host, with no setup needed. During a game the host's phone has a small Menu / Restart bar at the bottom; everyone else's phone doesn't show it, since only the host can use it.

For real households where nobody wants that much control, an advanced `/console` page still exists (open it on any browser on the same machine, or from a phone with the `?key=` link the terminal prints) with score adjustments, manual judging overrides, and a kick-player button. It's optional. Day to day, nobody needs to open it.

### Jeopardy
- Choose typed answers or multiple choice when you start.
- Wait for the buzzers to open, then tap BUZZ. Buzzing early locks you out briefly.
- Typed mode: you type the answer and the matcher rules on it. Multiple choice: four options appear on your phone only.
- Wrong answers cost points and reopen the buzzers for the others. The player who answers correctly picks next.
- Challenge: if a clue ends with nobody right and you think you were, tap Challenge. The other players vote on their phones. If they accept, you get the points.
- Daily Double and Final Jeopardy (secret wagers, auto-judged) are included.
- A board is 5 random categories from the bank, five clues each.

### Family Feud
- Needs 2 or more players. Players are split into two teams in join order. Two players means 1 v 1.
- Each round starts with a face-off: one player from each team types their answer at the same time. The higher-ranked answer wins control.
- The controlling team takes turns typing answers. Three strikes and the other team gets one steal attempt.
- The face-off winner chooses to play or pass.
- Four rounds. Points count double in round 3 and triple in round 4.
- Fast Money: the leading team plays. Each player gets 5 survey questions typed on their phone (20 seconds for the first player, 25 for the second, and the second player cannot repeat the first player's answer). Answers are revealed one at a time and 200 points wins. It does not change the game score.
- Answers on the board are matched leniently ("sun screen" finds "sunscreen", "beach hat" finds "sun hat").

### Wavelength

No teams: everyone plays for themselves, and roles rotate through the group in join order over one round per player (2 players means 2 rounds, 5 players means 5 rounds).

- Each round has a Psychic and a Guesser, both chosen in turn order, so everyone gets exactly one turn at each role. Anyone else that round just watches the TV.
- The Psychic's phone privately shows a hidden target on a spectrum between two words (like "Hot" and "Cold") and a single button once they've said their clue **out loud**. There is nothing to type; say the clue the way you would around the table.
- Once the clue is given, the Guesser drags a slider on their phone to where the group thinks the target is, live on the TV, then locks it in.
- Landing dead center scores 4 points, a bit off scores 3 or 2, and a miss scores 0. Both the Psychic and the Guesser get the same points that round, since it took both of them.
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
- The drawer picks 1 of 3 word choices, then draws on their phone — it streams live to the TV as they draw, using a smooth pressure-simulated freehand line (the same rendering approach as tldraw and Excalidraw), vendored locally in `public/vendor/perfect-freehand.js` so it needs no internet.
- Everyone else types guesses on their own phone; guesses are fuzzy-matched by `games/match.js`, so small typos still count. First correct guess scores the most; the drawer scores a little for every correct guess.
- Pick "Disney Pictionary" from the host's picker (or the Disney Night toggle) for an all-Disney word list: characters, movies, magic objects, and park moments.

### T-Shirt Wars
- Everyone gets the same silly design prompt (e.g. "a shirt for a superhero whose only power is finding parking spots") and draws their own shirt design at the same time, privately, on their own phone.
- Once everyone taps "I'm Done" (or time runs out), the TV reveals every design and each phone gets a "vote for your favorite" screen — you can't vote for your own.
- Whoever gets the most votes that round scores the most points. Plays 3 rounds, then a final scoreboard.

### Trivia: 5th Grade / Disney
- A set of 10 multiple-choice questions. 5th Grade cycles grade 1 up through grade 5 (then loops); Disney Trivia cycles Easy → Medium → Hard, covering movies, characters, songs, villains, parks, and Pixar.
- Everyone answers on their own phone at the same time; the TV just shows the question and a running "answered" count so nobody can see picks before the reveal.
- Correct answers score 100-200 points depending on how fast you answered.

### Name That Disney Movie
- The TV (and every phone) shows a vague clue about a Disney movie's plot. Every several seconds a more specific clue is added, up to 4 total.
- Anyone can type a guess on their phone at any time (fuzzy-matched, so small typos count); guessing right on an early, vague clue is worth more (400 points) than guessing once it's obvious (down to 100).
- First correct guess ends the round and reveals the title; if nobody gets it, the movie is revealed once all clues run out. Plays 8 rounds, then a final scoreboard.

### Codenames
- 3+ players: choose Random Teams or Pick Your Team when you start it (2 players just get one per side automatically). Each team's first member becomes its spymaster.
- The spymaster sees every word's secret color on their own phone and types a one-word clue plus a number; their teammates tap words on their phones to guess (the TV board only reveals colors as they're actually guessed, so nobody else can peek).
- Guessing the other team's word or a neutral word ends your turn; guessing the black assassin word loses instantly. First team to find all of their own words wins.

### Password
- Rotates a hinter/guesser pair each round (everyone gets a turn). The hinter privately sees the password and types one-word clues; the guesser says guesses out loud — no typing needed.
- The hinter taps "They got it!" to award the current point total (starts at 10, drops by 2 per extra clue) or "Nope, new clue" to try again. Both the hinter and guesser score when it's guessed. Plays 8 rounds.

### Scattergories
- Each round reveals a letter and 8 categories; everyone privately types an answer starting with that letter for every category, against the clock.
- Then the group judges it together, one category at a time: every answer is valid by default, but anyone (other than its author) can challenge one they don't buy. If a majority of the other players challenge it, it's thrown out — no single judge, no typing "valid/invalid" on every single answer.
- Valid answers score 2 points, or 1 if another player wrote a near-identical valid answer in the same category. Plays 3 rounds with fresh letters and categories.

## Content

`npm run fetch-data` downloads two public datasets into `data/raw/` and builds banks in `content/`:

- Jeopardy: the Kids and Teen tournament clues from jwolle1/jeopardy_clue_dataset. About 1,950 five-clue categories. That dataset states that its clues belong to Jeopardy Productions, Inc. and asks that it not be used for public-facing sites or apps. Keep this for private use at home.
- Family Feud: about 6,000 surveys from ProtoQA (iesl/protoqa-data), licensed CC-BY-4.0.

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

`games/match.js` handles all typed answers, across Jeopardy, Family Feud, Pictionary guesses, and Movie Reveal guesses. It ignores case, punctuation, articles, "What is", plurals, and small typos. It accepts a part of a name ("Eisenhower" for "Dwight David Eisenhower") but not a lone generic word ("city" for "Kansas City"), and it never accepts a near-miss on numbers or roman numerals. It does not understand synonyms, so "sunblock" will not match "sunscreen". The Jeopardy challenge exists for those cases. `npm test` runs a few checks. If a ruling feels wrong, `ACCEPT` and the generic word list at the top of that file are the knobs.

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
    tools/                  data download and build scripts, family filter,
                             get-node.ps1 (portable Node for Poole Party.bat),
                             build-release.js + launcher.js (the no-install download)
    content/                sample content and generated banks (jeopardy/, feud/, wheel/,
                             wavelength/, pictionary/, tshirt/, trivia/, movie/)
    public/host*.js         TV views          public/play*.js     phone views
    public/console.js       host controls
    public/common.js        shared helpers: socket connection, scoreboard/timer HTML,
                             and the freehand drawing canvas (makeCanvas) used by
                             Pictionary and T-Shirt Wars
    public/vendor/           perfect-freehand.js, vendored for offline drawing
