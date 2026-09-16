// The daily quest: one goal per day, drawn from a pool, worth one familiar.
// Pure — no DOM, no storage, no clock of its own. The day key and the rng are
// passed in so the whole thing is testable.

import { dayKey } from './stats.js';

// Which counter a quest watches. main.js feeds these from the same game events
// the statistics already listen to.
export function emptyCounters() {
  return {
    correct: 0,
    excellent: 0,
    defeated: 0,
    bosses: 0,
    games: 0,
    playMs: 0,
    tfCorrect: 0,
    bestLevel: 1,
    bestStreak: 0,
  };
}

// `target` is what the counter has to reach. Keep the wording short — it has to
// fit on the start screen under the title.
export const QUESTS = [
  { id: 'correct-40', track: 'correct', target: 40, title: '40 richtige Antworten' },
  { id: 'correct-75', track: 'correct', target: 75, title: '75 richtige Antworten' },
  { id: 'excellent-15', track: 'excellent', target: 15, title: '15× Exzellent' },
  { id: 'excellent-30', track: 'excellent', target: 30, title: '30× Exzellent' },
  { id: 'defeated-15', track: 'defeated', target: 15, title: '15 Gegner besiegen' },
  { id: 'bosses-3', track: 'bosses', target: 3, title: '3 Bosse besiegen' },
  { id: 'level-12', track: 'bestLevel', target: 12, title: 'Level 12 erreichen' },
  { id: 'level-20', track: 'bestLevel', target: 20, title: 'Level 20 erreichen' },
  { id: 'games-3', track: 'games', target: 3, title: '3 Runden spielen' },
  { id: 'streak-5', track: 'bestStreak', target: 5, title: '5× Exzellent in Folge' },
  { id: 'tf-15', track: 'tfCorrect', target: 15, title: '15× Richtig oder Falsch' },
  { id: 'playtime-10', track: 'playMs', target: 10 * 60 * 1000, title: '10 Minuten spielen', unit: 'time' },
];

const BY_ID = {};
for (const q of QUESTS) BY_ID[q.id] = q;
export const questById = (id) => BY_ID[id] || null;

// The day's quest is a hash of the date, not a random draw: the start screen,
// a reload and a second device all have to name the same goal.
function hashDay(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function questForDay(key) {
  return QUESTS[hashDay(key) % QUESTS.length];
}

export function emptyDaily(key) {
  const day = key || dayKey();
  return {
    v: 1,
    day,
    questId: questForDay(day).id,
    counters: emptyCounters(),
    claimed: false,
    announced: false,
    reward: null,
  };
}

// Rolls over at midnight: a new day means a new goal and a clean sheet.
export function normalize(raw, key) {
  const day = key || dayKey();
  if (!raw || typeof raw !== 'object' || raw.day !== day) return emptyDaily(day);
  const fresh = emptyDaily(day);
  const counters = fresh.counters;
  if (raw.counters && typeof raw.counters === 'object') {
    for (const k of Object.keys(counters)) {
      const v = raw.counters[k];
      if (typeof v === 'number' && isFinite(v) && v >= 0) counters[k] = v;
    }
  }
  return {
    v: 1,
    day,
    questId: questById(raw.questId) ? raw.questId : fresh.questId,
    counters,
    claimed: !!raw.claimed,
    announced: !!raw.announced,
    reward: typeof raw.reward === 'string' ? raw.reward : null,
  };
}

export const progressOf = (daily) => {
  const quest = questById(daily.questId);
  if (!quest) return 0;
  return Math.min(quest.target, daily.counters[quest.track] || 0);
};

export const isComplete = (daily) => {
  const quest = questById(daily.questId);
  return !!quest && (daily.counters[quest.track] || 0) >= quest.target;
};

// Done, but the reward has not been fetched yet — the state the menu offers to
// hand in. Claiming is deliberately not automatic: it would otherwise drop a
// full-screen reveal in the middle of a fight.
export const isClaimable = (daily) => isComplete(daily) && !daily.claimed;

// Folds one game event into the day's counters. Mirrors stats.recordEvent, but
// only for the handful of things a quest can ask about.
export function recordEvent(daily, ev, state) {
  const c = daily.counters;
  switch (ev.type) {
    case 'answered':
      if (!ev.correct) break;
      c.correct += 1;
      if (ev.rating && ev.rating.id === 'excellent') c.excellent += 1;
      if (ev.question && ev.question.kind === 'tf') c.tfCorrect += 1;
      if (state.streakExcellent > c.bestStreak) c.bestStreak = state.streakExcellent;
      break;
    case 'enemyDefeated':
      c.defeated += 1;
      if (ev.enemy && ev.enemy.boss) c.bosses += 1;
      break;
    case 'levelUp':
      if (state.level > c.bestLevel) c.bestLevel = state.level;
      break;
    case 'gameStarted':
      c.games += 1;
      break;
    default:
      break;
  }
}

export function addPlayTime(daily, ms) {
  if (ms > 0) daily.counters.playMs += ms;
}

// "32 / 40" or "6:10 / 10:00" for the timed one.
export function progressText(daily) {
  const quest = questById(daily.questId);
  if (!quest) return '';
  const done = progressOf(daily);
  if (quest.unit === 'time') {
    const fmt = (ms) => {
      const total = Math.floor(ms / 1000);
      const m = Math.floor(total / 60);
      const s = total % 60;
      return m + ':' + (s < 10 ? '0' + s : s);
    };
    return fmt(done) + ' / ' + fmt(quest.target);
  }
  return done + ' / ' + quest.target;
}
