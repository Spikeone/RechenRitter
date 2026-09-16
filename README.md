# Rechenritter

A small browser game for practising the multiplication table (German *Einmaleins*,
1×1 to 10×10). Built for a 12-year-old on a phone: you are a knight, the enemies
have health bars, and the faster you answer the harder you hit.

The UI is German. Everything is vanilla ES modules — no build step, no
dependencies, no framework. It is a static site, so GitHub Pages serves it as is.

## How it plays

- **Format** — always `x · y = z` with exactly one number missing. Up to level 9
  only the result is missing; from level 10 the first or second factor can be
  missing too, which is off by default and can be switched on in the settings
  (`3 · ? = 30` is really a division, a step past the times tables). From level 5, some cards are **Richtig oder Falsch**: a complete
  statement to accept or reject with one tap.
- **Answering** — an on-screen numpad. The answer submits itself once it is
  complete; the field never shows how many digits the result has. `OK` commits a
  shorter answer, `⌫` deletes.
- **Speed is damage** — Exzellent 3, Perfekt 2, Gut 1. A correct but slow answer
  still counts as correct and costs no life, it simply deals no damage.
- **Lives** — 5 per run. A wrong answer or a timeout costs one, and then the
  **solution card** shows the complete formula and waits for *Weiter*, so there is
  time to read the right answer. At 0 lives the run ends and starts again at level 1;
  best level, statistics and achievements are kept.
- **Timer** — a full minute per wave for the whole first region, so a beginner has
  room to think. From level 7 it shortens by the same amount every level until it
  reaches its floor of 10 s at level 67, the first level past the fixed tour. It
  freezes while the solution card is up. The rating limits are fractions of that
  timer, so Exzellent starts at a forgiving 6 s and tightens to 2.5 s along with it.
- **Levels** — beating an enemy raises the level and the next enemy has more health.
  Each enemy's bar shows its remaining hit points as a number.
  The last level of every region is a single tougher **boss**. From level 15 two enemies appear at
  once: both formulas are visible, the first is preselected, and answering it moves
  the focus to the second. One shared countdown covers the pair, and while both are
  still open the rating limits are wider, so the first answer is not penalised for
  the time spent reading the second formula. A wrong answer settles only the card it
  was given on; the other one is still there after *Weiter*.
- **Regions** — the scenery and the enemy pool change every 6 levels
  (`BIOME_LENGTH` in `js/config.js`). The first 66 levels are a fixed tour
  through all eleven: Wald, Schnee, Wüste, Sumpf, Dunkelwald, Gebirge, Sturmsee,
  Vulkan, Arkane Arena, Ruinen, Leere. After that every further lap of eleven
  regions comes in a shuffled order, so the endless part is never the same twice,
  still visits each region once per lap, and never repeats one back to back.
  Which region a level belongs to is fixed for that level, so a saved run always
  resumes in the place it left. Each region keeps strictly to its own creatures —
  a dragon only ever turns up in the volcano. A region's last level is always its
  boss, in its own arena, and the background changes once partway through as well.
- **Adaptive questions** — a fact answered wrong or slowly becomes up to three times
  as likely to come back, and a fact just missed returns within the next few
  questions. Unknown facts stay neutral, so the game never feels like drilling.
- **Tagesaufgabe** — one goal, the same every day for the whole season: in
  Saison 1, answer 30 questions correctly. Only correct answers count, a wrong one
  already costs a life. Progress shows on the start screen. Finishing it does not
  interrupt the fight: it only says so with a small notice, and the card in the
  menu turns into a glowing *Belohnung abholen!* button. Handing it in plays the
  reveal and adds one **Gefährte** to the collection, once per day. The goal is a
  property of the season in `js/familiars.js`, so a later season brings its own
  along with its own creatures.
- **Pause** hides the formula and deals a new one on resume, so it cannot be used to
  think for free. The clock is held rather than refilled: the new question carries
  on with whatever time the old one had left, so pausing a nearly expired wave is
  no way to buy a fresh minute. The run is saved continuously — closing the tab and coming back
  offers *Weiter spielen*.

## Controls

| | |
|---|---|
| Numpad / `0`–`9` | enter digits |
| `⌫` / Backspace | delete a digit |
| `OK` / Enter | commit, and *Weiter* on the solution card |
| `J` / `→`, `N` / `←` | Richtig / Falsch |
| Tab | switch between the two cards |
| `P` / Esc | pause |

## Screens

- **Statistik** — play time, games, correct/wrong/timeouts, rating counts, best
  level, longest Exzellent streak, a 10×10 heat map of every fact (green = solid,
  red = needs practice, tap a cell for its details) and a 30-day play-time strip.
  Useful for a parent checking how much it actually gets used.
- **Erfolge** — 32 achievements. Nine of them unlock a new character.
- **Sammlung** — Saison 1, *Die Glasgefährten*: 28 creatures in jars, one a day
  from the daily quest, so the season runs four weeks. A creature already found shows its jar and its name; one
  still missing shows only a black jar and `???`. Every jar in the pack has the
  same outline and the artwork has no partial transparency, so the silhouette is
  simply the artwork painted black and gives nothing away.
- **Einstellungen** — sound and music volume, mute, timer bar on/off, missing
  factor on/off (off by default), character selection, a two-tap reset for the saved run, and a
  code-protected reset for the statistics, which also clears the achievements and
  puts the chosen figure back to the starting knight. The code is `STATS_RESET_CODE` in
  `js/config.js`. It is a child lock, not security: it stops an impulsive tap
  wiping months of history, but it sits in the source like every other setting
  and anyone who reads the code can find it.

## Development

```bash
python serve.py
```

Serves the project at <http://localhost:8080> with `Cache-Control: no-store`, so
edits show up on reload. The same command is wired into `.claude/launch.json` as
`rechenritter-static`. The service worker deliberately does not install on
localhost — it is a cache-first precache and would serve stale files while working.

Run the tests (no dependencies, plain `node`):

```bash
node tests/game.test.mjs
```

```bash
node tests/stats.test.mjs
```

```bash
node tests/daily.test.mjs
```

Append `#debug` to the URL to get `window.rr` in the console: `rr.state`,
`rr.level = 15`, `rr.newGame()`, `rr.unlockAll()`, `rr.resetAll()`. For the daily:
`rr.finishDaily()` fills today's goal so it can be handed in, `rr.claimDaily()`
opens the reveal straight away, and `rr.lockFamiliars()` empties the collection.

### Layout of the code

| File | Responsibility |
|---|---|
| `js/config.js` | every tunable number and the German strings |
| `js/game.js` | pure run logic — no DOM, no timers; returns events |
| `js/picker.js` | which fact to ask next (adaptive bias, re-ask queue) |
| `js/biomes.js` | region rotation: backgrounds, enemy pools, bosses |
| `js/stats.js`, `js/achievements.js` | pure accumulation and unlock rules |
| `js/daily.js`, `js/familiars.js` | the daily goal and the Season 1 collection |
| `js/ui.js`, `js/fx.js`, `js/sprites.js` | all DOM, effects and sprite rendering |
| `js/main.js` | the clock, event dispatch, saving |
| `js/audio.js`, `js/music.js` | synthesized effects and a chiptune loop |

`game.js` never touches the DOM and takes its clock from `advance(elapsedMs)`, so
the whole game is testable in node.

## Assets

Raw packs live in `DownloadedRaw/` (git-ignored). The build script extracts what
the game needs into `assets/`:

```bash
python tools/build-assets.py
```

It copies the three 32×32 tile sheets, cuts the 28 jars out of the familiars
artwork into one even sheet, downscales the biome backgrounds from 1344×768 PNG
to 672×384 WebP (37 MB of source becomes about 1 MB of assets) and renders the
PWA icons. It needs Pillow. The familiars pack ships as a preview image on an
uneven grid — the last column is missing its spacer and the last row sits five
pixels high — so the measured corners live at the top of the script. The built files under `assets/` and
`icons/` are committed, so a clean checkout runs without the raw packs.

`tools/sheet-viewer.html` shows a tile sheet with a coordinate grid — open it when
adding or correcting entries in `assets/sprites/manifest.js`.

### Swapping in a different pack

1. Drop the sheets into `assets/sprites/` and add them to `SHEETS` in
   `assets/sprites/manifest.js` with their column and row counts.
2. Point the `PLAYERS` and `ENEMIES` entries at the new tiles, verifying the
   coordinates with `tools/sheet-viewer.html`.
3. Add any new files to `ASSETS` in `sw.js` and bump `CACHE`.

Nothing else in the code knows about a specific pack. If a sheet is missing the
game still runs — sprites fall back to coloured blocks.

### Credits

- Characters and enemies: **32rogues** by Seth Boyles (itch.io). Its licence
  permits commercial and non-commercial use and forbids redistribution; the
  bundled `assets/sprites/32rogues-LICENSE.txt` has the full text. Note that it
  also excludes use "in conjunction with generative artificial intelligence
  projects or machine learning projects" — worth a read before publishing, since
  this code was written with an AI assistant.
- Backgrounds: **Rifts of the Nine Realms Biomes** by Ronin Lab Studio (itch.io).
- The collection: **Jar Familiars** by blaukeks (itch.io).
- Font: **Press Start 2P** by CodeMan38, via Google Fonts (SIL Open Font License).
- Sound effects and music are synthesized at runtime with the Web Audio API — no
  audio files.

## Deploying to GitHub Pages

Live at <https://spikeone.github.io/RechenRitter/>, served from
<https://github.com/Spikeone/RechenRitter>. The repository root is the site root,
so there is no workflow and no build step. Every path in the page is relative, so
the project subpath works.

Enable it once, under **Settings › Pages › Build and deployment**: source
*Deploy from a branch*, branch `main`, folder `/ (root)`. The first build takes
about a minute.

After that, publishing is just:

```bash
git push
```

On the phone, open the URL and use *Add to home screen*. It installs as a
full-screen app and works offline.

### Release ritual

The service worker precaches everything, so **after every change bump both
`APP_VERSION` in `js/config.js` and `CACHE` in `sw.js` to the same next number**
before committing. Without the bump, browsers that already visited keep serving
the old version. `tests/game.test.mjs` fails if the two drift apart.

The version also shows at the bottom of the start screen, so what a phone is
running can be read off it and compared with what was deployed.

### How an update reaches a phone

Push, wait for the Pages build, then open the game and let it sit on the start
screen for a moment. The sequence is:

1. Opening the app serves the old files instantly from the worker's cache, and in
   the background the browser re-fetches `sw.js`. That file is never taken from
   the HTTP cache, so the bumped `CACHE` is noticed straight away.
2. The new worker installs, precaches everything with `cache: 'reload'` so
   GitHub Pages' ten-minute `max-age` cannot poison it, then claims the page.
3. The page reloads itself, and that reload shows the new version.

Step 3 waits if a game is in progress and happens on the way back to the menu, so
an update never lands in the middle of a question. The run is saved continuously
and comes back on *Weiter spielen*.

If it ever seems stuck, reloading twice does the same thing by hand. On iOS a
home-screen app has to be closed from the app switcher rather than just
backgrounded.
