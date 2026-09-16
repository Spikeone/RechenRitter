// localStorage wrapper. Every access is guarded — Safari in private mode throws
// on setItem, and a corrupt value must never stop the game from starting.

import { normalize as normalizeStats, emptyStats } from './stats.js';
import { DEFAULT_SKIN } from '../assets/sprites/manifest.js';

const PREFIX = 'rechenritter.';

function get(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function set(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (err) {
    return false;
  }
}

function remove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch (err) { /* ignore */ }
}

// ----- the running game -----
export function loadRun() {
  const run = get('run', null);
  if (!run || typeof run !== 'object' || !run.level) return null;
  return run;
}
export const saveRun = (snap) => set('run', snap);
export const clearRun = () => remove('run');

// ----- lifetime statistics -----
export const loadStats = () => normalizeStats(get('stats', null));
export const saveStats = (s) => set('stats', s);
export function resetStats() {
  const fresh = emptyStats();
  set('stats', fresh);
  return fresh;
}

// The collection is part of the record, so it goes with the statistics.
export function resetFamiliars() {
  set('familiars', {});
  remove('daily');
  return {};
}

// ----- achievements: { id: ISO timestamp } -----
export function loadAchievements() {
  const raw = get('achievements', {});
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}
export const saveAchievements = (a) => set('achievements', a);

// ----- the daily quest (one day's goal and progress) -----
export const loadDailyRaw = () => get('daily', null);
export const saveDaily = (d) => set('daily', d);

// ----- the familiar collection: { id: ISO timestamp } -----
export function loadFamiliars() {
  const raw = get('familiars', {});
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}
export const saveFamiliars = (f) => set('familiars', f);

// ----- settings -----
const DEFAULT_SETTINGS = {
  muted: false,
  sfx: 0.8,
  music: 0.35,
  skin: DEFAULT_SKIN,
  showTimerBar: true,
  missingFactor: true,
};

export function loadSettings() {
  const stored = get('settings', {});
  const out = Object.assign({}, DEFAULT_SETTINGS);
  if (stored && typeof stored === 'object') {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (typeof stored[key] === typeof DEFAULT_SETTINGS[key]) out[key] = stored[key];
    }
  }
  out.sfx = Math.max(0, Math.min(1, out.sfx));
  out.music = Math.max(0, Math.min(1, out.music));
  return out;
}
export const saveSettings = (s) => set('settings', s);

export function resetAll() {
  for (const key of ['run', 'stats', 'achievements', 'settings', 'daily', 'familiars']) {
    remove(key);
  }
}
