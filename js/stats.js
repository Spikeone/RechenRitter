// Lifetime statistics. Pure accumulation — no DOM, no storage access, so it can
// be unit tested and reused by the picker.
//
// The three fact arrays are flat 10x10 grids indexed by factIndex(x, y). They
// drive both the heat map on the statistics screen and the adaptive bias.

import { FACT_MIN, FACT_MAX } from './config.js';

const SPAN = FACT_MAX - FACT_MIN + 1;
const FACT_SLOTS = SPAN * SPAN;
export const DAYS_KEPT = 30;

export const factIndex = (x, y) => (x - FACT_MIN) * SPAN + (y - FACT_MIN);

export function emptyStats() {
  return {
    v: 1,
    totalPlayMs: 0,
    gamesPlayed: 0,
    correct: 0,
    wrong: 0,
    timeouts: 0,
    ratings: { excellent: 0, perfect: 0, good: 0, slow: 0 },
    byKind: { fill: { asked: 0, correct: 0 }, tf: { asked: 0, correct: 0 } },
    bestLevel: 1,
    longestExcellentStreak: 0,
    biomesSeen: [],
    factsAsked: new Array(FACT_SLOTS).fill(0),
    factsCorrect: new Array(FACT_SLOTS).fill(0),
    factsMs: new Array(FACT_SLOTS).fill(0),
    days: {},
  };
}

const num = (v, fallback) => (typeof v === 'number' && isFinite(v) ? v : fallback);

function normalizeArray(raw) {
  const out = new Array(FACT_SLOTS).fill(0);
  if (Array.isArray(raw)) {
    for (let i = 0; i < FACT_SLOTS && i < raw.length; i++) out[i] = num(raw[i], 0);
  }
  return out;
}

// Merges a stored (possibly older or corrupt) object into the current shape.
export function normalize(raw) {
  const s = emptyStats();
  if (!raw || typeof raw !== 'object') return s;
  s.totalPlayMs = num(raw.totalPlayMs, 0);
  s.gamesPlayed = num(raw.gamesPlayed, 0);
  s.correct = num(raw.correct, 0);
  s.wrong = num(raw.wrong, 0);
  s.timeouts = num(raw.timeouts, 0);
  s.bestLevel = Math.max(1, num(raw.bestLevel, 1));
  s.longestExcellentStreak = num(raw.longestExcellentStreak, 0);
  if (raw.ratings) {
    for (const k of Object.keys(s.ratings)) s.ratings[k] = num(raw.ratings[k], 0);
  }
  if (raw.byKind) {
    for (const k of Object.keys(s.byKind)) {
      if (raw.byKind[k]) {
        s.byKind[k].asked = num(raw.byKind[k].asked, 0);
        s.byKind[k].correct = num(raw.byKind[k].correct, 0);
      }
    }
  }
  if (Array.isArray(raw.biomesSeen)) s.biomesSeen = raw.biomesSeen.slice();
  s.factsAsked = normalizeArray(raw.factsAsked);
  s.factsCorrect = normalizeArray(raw.factsCorrect);
  s.factsMs = normalizeArray(raw.factsMs);
  if (raw.days && typeof raw.days === 'object') {
    for (const key of Object.keys(raw.days)) s.days[key] = num(raw.days[key], 0);
  }
  return s;
}

export const dayKey = (date) => {
  const d = date || new Date();
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};

export function addPlayTime(stats, ms, key) {
  if (!(ms > 0)) return;
  stats.totalPlayMs += ms;
  stats.days[key] = (stats.days[key] || 0) + ms;
  const keys = Object.keys(stats.days).sort();
  while (keys.length > DAYS_KEPT) delete stats.days[keys.shift()];
}

// Folds one game event into the lifetime totals.
export function recordEvent(stats, ev, state) {
  switch (ev.type) {
    case 'answered': {
      const kind = ev.question.kind === 'tf' ? 'tf' : 'fill';
      stats.byKind[kind].asked += 1;
      const i = factIndex(ev.fact.x, ev.fact.y);
      stats.factsAsked[i] += 1;
      if (ev.correct) {
        stats.correct += 1;
        stats.byKind[kind].correct += 1;
        stats.factsCorrect[i] += 1;
        stats.factsMs[i] += ev.thinkMs;
        if (ev.rating) stats.ratings[ev.rating.id] = (stats.ratings[ev.rating.id] || 0) + 1;
        if (state.streakExcellent > stats.longestExcellentStreak) {
          stats.longestExcellentStreak = state.streakExcellent;
        }
      } else {
        stats.wrong += 1;
      }
      break;
    }
    case 'timeout':
      stats.timeouts += 1;
      // Unanswered questions still count as asked, so the heat map shows them.
      for (const q of ev.unanswered) {
        stats.factsAsked[factIndex(q.x, q.y)] += 1;
        stats.byKind[q.kind === 'tf' ? 'tf' : 'fill'].asked += 1;
      }
      break;
    case 'levelUp':
      if (state.level > stats.bestLevel) stats.bestLevel = state.level;
      if (ev.biome && stats.biomesSeen.indexOf(ev.biome) === -1) {
        stats.biomesSeen.push(ev.biome);
      }
      break;
    case 'gameStarted':
      stats.gamesPlayed += 1;
      if (ev.biome && stats.biomesSeen.indexOf(ev.biome) === -1) {
        stats.biomesSeen.push(ev.biome);
      }
      break;
    default:
      break;
  }
}

export function factSummary(stats, x, y) {
  const i = factIndex(x, y);
  const asked = stats.factsAsked[i] || 0;
  const correct = stats.factsCorrect[i] || 0;
  return {
    x,
    y,
    z: x * y,
    asked,
    correct,
    accuracy: asked > 0 ? correct / asked : null,
    avgMs: correct > 0 ? (stats.factsMs[i] || 0) / correct : null,
  };
}

export const totalAnswers = (stats) => stats.correct + stats.wrong;
export const accuracy = (stats) =>
  totalAnswers(stats) > 0 ? stats.correct / totalAnswers(stats) : null;

// Last `days` calendar days, oldest first — the statistics screen renders this
// as a bar strip, so missing days must be present with 0.
export function dayStrip(stats, days, today) {
  const out = [];
  const base = today ? new Date(today.getTime()) : new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base.getTime());
    d.setDate(base.getDate() - i);
    const key = dayKey(d);
    out.push({ key, ms: stats.days[key] || 0, date: d });
  }
  return out;
}
