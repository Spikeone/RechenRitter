// The daily quest. A season sets one goal and keeps it: in Season 1 that is
// answering SEASON.quest.target questions correctly in a day, worth one
// familiar. A later season brings its own goal with its own collection.
//
// Pure: no DOM, no storage, and the day key is passed in rather than read from a
// clock, so the whole thing is testable.

import { SEASON } from './familiars.js';
import { dayKey } from './stats.js';

export const QUEST = SEASON.quest;

export function emptyDaily(key) {
  return {
    v: 2,
    day: key || dayKey(),
    correct: 0,
    claimed: false,
    announced: false,
    reward: null,
  };
}

// Rolls over at midnight: a new day starts from zero and can be claimed again.
export function normalize(raw, key) {
  const day = key || dayKey();
  if (!raw || typeof raw !== 'object' || raw.day !== day) return emptyDaily(day);
  const fresh = emptyDaily(day);
  // A v1 save kept the count under counters.correct, next to a rotating quest.
  const stored = typeof raw.correct === 'number'
    ? raw.correct
    : (raw.counters && raw.counters.correct);
  if (typeof stored === 'number' && isFinite(stored) && stored > 0) {
    fresh.correct = Math.floor(stored);
  }
  fresh.claimed = !!raw.claimed;
  fresh.announced = !!raw.announced;
  fresh.reward = typeof raw.reward === 'string' ? raw.reward : null;
  return fresh;
}

export const progressOf = (daily) => Math.min(QUEST.target, daily.correct);

export const isComplete = (daily) => daily.correct >= QUEST.target;

// Done, but the reward has not been fetched yet — the state the menu offers to
// hand in. Claiming is deliberately not automatic: it would otherwise drop a
// full-screen reveal into the middle of a fight.
export const isClaimable = (daily) => isComplete(daily) && !daily.claimed;

// Folds one game event into the day. Only correct answers count; a wrong one
// already costs a life, which is penalty enough.
export function recordEvent(daily, ev) {
  if (ev.type === 'answered' && ev.correct) daily.correct += 1;
}

export const progressText = (daily) => progressOf(daily) + ' / ' + QUEST.target;
