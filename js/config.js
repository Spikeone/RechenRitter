// Every tunable of the game lives here. Numbers were chosen for a 12-year-old
// practising the 1x1; adjust freely, the rest of the code reads them.

export const LIVES = 5;

// ----- timer -----
// Level 1 gives 30s per wave, shrinking by 800ms per level down to a hard floor
// of 10s (reached at level 26).
export const TIMER_BASE_MS = 30000;
export const TIMER_STEP_MS = 800;
export const TIMER_MIN_MS = 10000;
// Two questions at once get more than one question's time, but less than double.
export const PAIR_TIMER_FACTOR = 1.75;

// ----- enemies -----
export const HP_BASE = 3;
export const HP_PER_LEVEL = 0.5;
export const HP_MAX = 25;
export const TWO_ENEMY_HP_FACTOR = 0.6;   // each of two enemies is weaker than a solo one
export const BOSS_HP_FACTOR = 1.5;
export const TWO_ENEMIES_FROM_LEVEL = 15;
export const BOSS_EVERY = 10;             // every 10th level is a single, tougher enemy

// ----- questions -----
export const XY_MISSING_FROM_LEVEL = 10;  // before that only z is missing
export const MISSING_POOL_LATE = ['z', 'z', 'x', 'y'];
export const TRUE_FALSE_FROM_LEVEL = 5;
export const TRUE_FALSE_CHANCE = 0.25;
export const FACT_MIN = 1;
export const FACT_MAX = 10;

// ----- ratings -----
// A band's limit is a fraction of the current wave timer, but never below its
// floor — so the fast bands stay reachable once the timer has shrunk.
export const RATINGS = [
  { id: 'excellent', frac: 0.10, floorMs: 2500, damage: 3 },
  { id: 'perfect', frac: 0.20, floorMs: 4000, damage: 2 },
  { id: 'good', frac: 0.40, floorMs: 7000, damage: 1 },
];
export const SLOW_RATING = { id: 'slow', damage: 0 };
// Richtig/Falsch is a single tap, so it has to be answered faster for the same rating.
export const TRUE_FALSE_BAND_FACTOR = 0.6;

// ----- pacing -----
export const CORRECT_HOLD_MS = 900;   // green "solved" card before the next one appears
export const LEVEL_HOLD_MS = 1800;    // longer pause for death animation + level banner
export const INPUT_LOCK_MS = 450;     // swallow keys right after a resolve
export const LOW_TIMER_FRAC = 0.25;   // timer bar turns red and pulses below this

// ----- adaptive question bias (picker.js) -----
export const BIAS_MAX_WEIGHT = 3;     // a badly known fact is at most 3x as likely
export const BIAS_MIN_ASKED = 2;      // facts asked less often stay neutral
export const BIAS_SLOW_MS = 6000;     // answer time at which "slow" counts fully
export const REASK_MIN = 2;           // a missed fact comes back after 2..5 questions
export const REASK_MAX = 5;

// ----- derived -----
export const timerMs = (level) =>
  Math.max(TIMER_MIN_MS, TIMER_BASE_MS - (level - 1) * TIMER_STEP_MS);

export const isBossLevel = (level) => level % BOSS_EVERY === 0;

export const enemyCount = (level) =>
  (level >= TWO_ENEMIES_FROM_LEVEL && !isBossLevel(level)) ? 2 : 1;

export function enemyHp(level, count) {
  let hp = Math.min(HP_MAX, HP_BASE + Math.floor((level - 1) * HP_PER_LEVEL));
  if (isBossLevel(level)) hp = Math.ceil(hp * BOSS_HP_FACTOR);
  return count > 1 ? Math.ceil(hp * TWO_ENEMY_HP_FACTOR) : hp;
}

export const waveMs = (level, questionCount) =>
  Math.round(timerMs(level) * (questionCount > 1 ? PAIR_TIMER_FACTOR : 1));

export const ratingBands = (level, kind) => {
  const scale = kind === 'tf' ? TRUE_FALSE_BAND_FACTOR : 1;
  const t = timerMs(level);
  return RATINGS.map((r) => ({ ...r, maxMs: Math.max(r.floorMs, t * r.frac) * scale }));
};

export function rate(level, thinkMs, kind) {
  const band = ratingBands(level, kind).find((b) => thinkMs <= b.maxMs);
  return band || SLOW_RATING;
}

// ----- German UI strings -----
export const LABELS = {
  title: 'Rechenritter',
  subtitle: 'Das Einmaleins-Abenteuer',
  continue: 'Weiter spielen',
  newGame: 'Neues Spiel',
  newGameConfirm: 'Spielstand verwerfen? Nochmal tippen.',
  stats: 'Statistik',
  achievements: 'Erfolge',
  settings: 'Einstellungen',
  back: 'Zurück',
  menu: 'Menü',
  level: 'Level',
  paused: 'Pause',
  tapToResume: 'Tippen zum Weiterspielen',
  pauseHint: 'Nach der Pause kommt eine neue Aufgabe.',
  excellent: 'EXZELLENT!',
  perfect: 'PERFEKT!',
  good: 'GUT!',
  slow: 'GESCHAFFT',
  wrong: 'FALSCH',
  timeout: 'ZEIT ABGELAUFEN',
  next: 'Weiter',
  yourAnswer: 'Deine Antwort',
  levelUp: 'LEVEL {n}',
  boss: 'BOSS!',
  newBiome: 'Neues Gebiet: {name}',
  doubleDuel: 'Doppel-Duell!',
  bothQuestions: 'Beide Aufgaben lösen!',
  gameOver: 'Vorbei!',
  reachedLevel: 'Level erreicht',
  bestLevel: 'Bestes Level',
  newRecord: 'Neuer Rekord!',
  playAgain: 'Nochmal',
  yes: 'Richtig',
  no: 'Falsch',
  // statistics
  playTime: 'Spielzeit',
  games: 'Spiele',
  correct: 'Richtig',
  wrongAnswers: 'Falsch',
  timeouts: 'Zeit abgelaufen',
  longestStreak: 'Längste Exzellent-Serie',
  accuracy: 'Trefferquote',
  last30Days: 'Letzte 30 Tage',
  factGrid: 'Deine Aufgaben',
  factGridHint: 'Grün = sitzt, Rot = üben. Tippe auf ein Feld.',
  factDetail: '{x} · {y} = {z} — {asked}× gefragt, {correct} richtig, Ø {avg}',
  factUnasked: '{x} · {y} = {z} — noch nie gefragt',
  noData: 'Noch keine Daten.',
  // achievements
  unlockedOn: 'Freigeschaltet am {date}',
  locked: 'Noch gesperrt',
  newAchievement: 'Erfolg freigeschaltet!',
  unlocksSkin: 'Schaltet Figur frei: {name}',
  // settings
  sfx: 'Effekte',
  music: 'Musik',
  muted: 'Stumm',
  showTimerBar: 'Zeitbalken anzeigen',
  missingFactor: 'Fehlender Faktor',
  missingFactorHint: 'Aufgaben wie 3 · ? = 30 ab Level 10. Aus = es fehlt immer das Ergebnis.',
  character: 'Figur',
  characterLocked: 'Noch gesperrt',
  resetRun: 'Spielstand löschen',
  resetStats: 'Statistik zurücksetzen',
  confirmAgain: 'Wirklich? Nochmal tippen.',
  credits: 'Grafiken: 32rogues (Seth Boyles) · Rifts of the Nine Realms (Ronin Lab Studio)',
};

export function label(key, vars) {
  let s = LABELS[key] || key;
  if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}
