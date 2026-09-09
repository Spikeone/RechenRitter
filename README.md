# Rechenritter

A small browser game for practising the multiplication table (German *Einmaleins*,
1×1 to 10×10). Built for a 12-year-old on a phone: you are a knight, the enemies
have health bars, and the faster you answer the harder you hit.

The UI is German. Everything is vanilla ES modules — no build step, no
dependencies, no framework. It is a static site, so GitHub Pages serves it as is.

## How it plays

- **Format** — always `x · y = z` with exactly one number missing. Up to level 9
  only the result is missing; from level 10 the first or second factor can be
  missing too, which can be switched off in the settings (`3 · ? = 30` is really
  a division). From level 5, some cards are **Richtig oder Falsch**: a complete
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
- **Timer** — 30 s per wave at level 1, shrinking by 0.8 s per level down to a hard
  floor of 10 s (reached at level 26). It freezes while the solution card is up.
- **Levels** — beating an enemy raises the level and the next enemy has more health.
  Each enemy's bar shows its remaining hit points as a number.
  Every 10th level is a single tougher **boss**. From level 15 two enemies appear at
  once: both formulas are visible, the first is preselected, and answering it moves
  the focus to the second. One shared countdown covers the pair.
- **Regions** — the scenery and the enemy pool change every 10 levels: Wald, Schnee,
  Wüste, Sumpf, Dunkelwald, Gebirge, Sturmsee, Vulkan, Arkane Arena, Ruinen, Leere.
  Dragons only live in the volcano. After the last region it starts over and the
  pools mix.
- **Adaptive questions** — a fact answered wrong or slowly becomes up to three times
  as likely to come back, and a fact just missed returns within the next few
  questions. Unknown facts stay neutral, so the game never feels like drilling.
- **Pause** hides the formula and deals a new one on resume, so it cannot be used to
  think for free. The run is saved continuously — closing the tab and coming back
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
- **Einstellungen** — sound and music volume, mute, timer bar on/off, missing
  factor on/off, character selection, and two-tap resets for the saved run and
  the statistics.

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

Append `#debug` to the URL to get `window.rr` in the console: `rr.state`,
`rr.level = 15`, `rr.newGame()`, `rr.unlockAll()`, `rr.resetAll()`.

### Layout of the code

| File | Responsibility |
|---|---|
| `js/config.js` | every tunable number and the German strings |
| `js/game.js` | pure run logic — no DOM, no timers; returns events |
| `js/picker.js` | which fact to ask next (adaptive bias, re-ask queue) |
| `js/biomes.js` | region rotation: backgrounds, enemy pools, bosses |
| `js/stats.js`, `js/achievements.js` | pure accumulation and unlock rules |
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

It copies the three 32×32 tile sheets, downscales the biome backgrounds from
1344×768 PNG to 672×384 WebP (37 MB of source becomes about 1 MB of assets) and
renders the PWA icons. It needs Pillow. The built files under `assets/` and
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
- Font: **Press Start 2P** by CodeMan38, via Google Fonts (SIL Open Font License).
- Sound effects and music are synthesized at runtime with the Web Audio API — no
  audio files.

## Deploying to GitHub Pages

The repository root is the site root, so no workflow or build is needed.

```bash
git init && git add -A && git commit -m "Rechenritter"
```

```bash
gh repo create rechenritter --public --source=. --push
```

Without the `gh` CLI, create the repository on github.com and then:

```bash
git remote add origin https://github.com/<user>/rechenritter.git && git branch -M main && git push -u origin main
```

Then in the repository: **Settings › Pages › Build and deployment › Deploy from a
branch**, branch `main`, folder `/ (root)`. The game appears at
`https://<user>.github.io/rechenritter/` after a minute. All paths are relative,
so the project subpath works.

On the phone, open that URL and use *Add to home screen* — it installs as a
full-screen app and works offline.

### Release ritual

The service worker precaches everything, so **after every change bump `CACHE` in
`sw.js`** (`rechenritter-v1` → `-v2`) before committing. Without the bump, browsers
that already visited keep serving the old version.
