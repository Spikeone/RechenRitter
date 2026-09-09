// Chooses which multiplication fact to ask next.
//
// Two mechanisms, both mild on purpose — the game should still feel random:
//  1. Weighting: a fact the player gets wrong often, or answers slowly, becomes
//     up to BIAS_MAX_WEIGHT times as likely as a well-known one.
//  2. Re-ask queue: a fact just answered wrong comes back after a few questions,
//     while the correct result is still fresh.
//
// Pure module — no DOM, no timers, rng injected. Safe to import from node tests.

import {
  FACT_MIN, FACT_MAX, BIAS_MAX_WEIGHT, BIAS_MIN_ASKED, BIAS_SLOW_MS,
  REASK_MIN, REASK_MAX,
} from './config.js';
import { factIndex } from './stats.js';

const SPAN = FACT_MAX - FACT_MIN + 1;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// 0 = fact is solid, 1 = fact is weak. Facts asked rarely stay neutral so a
// single early mistake does not dominate the pool.
export function weakness(stats, x, y) {
  const i = factIndex(x, y);
  const asked = stats.factsAsked[i] || 0;
  if (asked < BIAS_MIN_ASKED) return 0;
  const correct = stats.factsCorrect[i] || 0;
  const accuracy = correct / asked;
  const avgMs = correct > 0 ? (stats.factsMs[i] || 0) / correct : BIAS_SLOW_MS;
  const slowness = clamp01((avgMs - 2000) / BIAS_SLOW_MS);
  return clamp01(0.6 * (1 - accuracy) + 0.4 * slowness);
}

export function createPicker({ stats, rng = Math.random }) {
  // weights[i] mirrors the fact grid; rebuilt when the stats have moved on.
  const weights = new Array(SPAN * SPAN).fill(1);
  let total = weights.length;
  let queue = [];          // [{ x, y, inQuestions }] — counts down per pick
  let last = null;         // previous fact, to avoid immediate repeats

  function rebuild() {
    total = 0;
    for (let x = FACT_MIN; x <= FACT_MAX; x++) {
      for (let y = FACT_MIN; y <= FACT_MAX; y++) {
        const i = factIndex(x, y);
        const w = 1 + (BIAS_MAX_WEIGHT - 1) * weakness(stats, x, y);
        weights[i] = w;
        total += w;
      }
    }
  }

  const isRepeat = (x, y) =>
    last !== null && ((last.x === x && last.y === y) || (last.x === y && last.y === x));

  function weightedPick(rng) {
    let r = rng() * total;
    for (let x = FACT_MIN; x <= FACT_MAX; x++) {
      for (let y = FACT_MIN; y <= FACT_MAX; y++) {
        r -= weights[factIndex(x, y)];
        if (r <= 0) return { x, y };
      }
    }
    return { x: FACT_MAX, y: FACT_MAX };
  }

  function pick(rng) {
    // Tick the re-ask queue; a due fact wins over a random one.
    let due = null;
    for (const entry of queue) {
      entry.inQuestions -= 1;
      if (due === null && entry.inQuestions <= 0) due = entry;
    }
    queue = queue.filter((e) => e !== due && e.inQuestions > 0);

    let fact;
    if (due) {
      // Swap the operands half the time so it is not literally the same card.
      fact = rng() < 0.5 ? { x: due.x, y: due.y } : { x: due.y, y: due.x };
    } else {
      fact = weightedPick(rng);
      for (let tries = 0; tries < 4 && isRepeat(fact.x, fact.y); tries++) {
        fact = weightedPick(rng);
      }
    }
    last = fact;
    return fact;
  }

  function reportMiss(fact) {
    if (!fact) return;
    const delay = REASK_MIN + Math.floor(rng() * (REASK_MAX - REASK_MIN + 1));
    // Replace an existing entry for the same fact instead of stacking them up.
    queue = queue.filter((e) => !((e.x === fact.x && e.y === fact.y)
      || (e.x === fact.y && e.y === fact.x)));
    queue.push({ x: fact.x, y: fact.y, inQuestions: delay });
    rebuild();
  }

  function reportCorrect() {
    rebuild();
  }

  rebuild();

  return {
    pick,
    reportMiss,
    reportCorrect,
    rebuild,
    // The queue travels with the run snapshot so a reload keeps pending re-asks.
    snapshot: () => queue.map((e) => ({ x: e.x, y: e.y, inQuestions: e.inQuestions })),
    load(snap) {
      queue = Array.isArray(snap)
        ? snap.filter((e) => e && e.x >= FACT_MIN && e.x <= FACT_MAX
            && e.y >= FACT_MIN && e.y <= FACT_MAX)
          .map((e) => ({ x: e.x, y: e.y, inQuestions: Math.max(1, e.inQuestions | 0) }))
        : [];
      last = null;
    },
    // Exposed for tests and the #debug hook.
    debugWeights: () => weights.slice(),
  };
}
