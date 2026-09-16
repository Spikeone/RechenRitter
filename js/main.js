// Bootstrap and driver: owns the clock, turns game events into rendering, sound
// and effects, and keeps everything saved.

import { INPUT_LOCK_MS, LOW_TIMER_FRAC, STATS_RESET_CODE, label, LABELS } from './config.js';
import { createGame } from './game.js';
import { createPicker } from './picker.js';
import { createUi } from './ui.js';
import { biomeFor } from './biomes.js';
import * as storage from './storage.js';
import * as statsLib from './stats.js';
import * as audio from './audio.js';
import * as music from './music.js';
import * as fx from './fx.js';
import { preloadSheets } from './sprites.js';
import { ACHIEVEMENTS, checkAchievements, achievementById, unlockedSkins } from './achievements.js';
import * as dailyLib from './daily.js';
import { drawFamiliar, familiarById, FAMILIARS } from './familiars.js';
import { DEFAULT_SKIN, PLAYERS } from '../assets/sprites/manifest.js';

let settings = storage.loadSettings();
let stats = storage.loadStats();
let unlocked = storage.loadAchievements();
let daily = dailyLib.normalize(storage.loadDailyRaw(), statsLib.dayKey());
let familiars = storage.loadFamiliars();
let picker = createPicker({ stats });
let game = createGame({
  rng: Math.random, picker, skin: settings.skin,
  allowMissingFactor: settings.missingFactor !== false,
});
let ui = null;

let lastFrame = 0;
let statsDirty = 0;
let lowWarned = false;
let inputLockUntil = 0;
let pausedAt = 0;
let returnOverlay = 'overlay-start';
// Set while wiping storage, so the save-on-unload handlers cannot write the
// old in-memory state straight back over the reset.
let persistDisabled = false;
let lastDayCheck = 0;
// A newer version has been fetched and is waiting for a quiet moment.
let updateReady = false;

const now = () => (window.performance ? performance.now() : Date.now());
const locked = () => now() < inputLockUntil;

// ---------------------------------------------------------------- persistence

function persistRun() {
  if (persistDisabled) return;
  if (game.state.phase === 'idle' || game.state.phase === 'over') return;
  const snap = game.snapshot();
  snap.picker = picker.snapshot();
  snap.skin = settings.skin;
  storage.saveRun(snap);
}

function persistDaily() {
  if (persistDisabled) return;
  storage.saveDaily(daily);
}

function persistStats(force) {
  if (persistDisabled) return;
  const t = now();
  if (!force && t - statsDirty < 1000) return;
  statsDirty = t;
  storage.saveStats(stats);
}

// ---------------------------------------------------------------- event handling

function unlockAchievements(event) {
  const fresh = checkAchievements(unlocked, { stats, state: game.state, event });
  if (fresh.length === 0) return;
  const stamp = new Date().toISOString();
  for (const id of fresh) {
    unlocked[id] = stamp;
    const def = achievementById(id);
    if (!def) continue;
    const desc = def.skin && PLAYERS[def.skin]
      ? label('unlocksSkin', { name: PLAYERS[def.skin].name })
      : def.desc;
    fx.toast({ icon: def.icon, title: def.title, desc });
    audio.playSfx('achievement');
  }
  storage.saveAchievements(unlocked);
}

// Rolls the day over if the app was left open past midnight.
function refreshDay() {
  const today = statsLib.dayKey();
  if (daily.day === today) return false;
  daily = dailyLib.emptyDaily(today);
  persistDaily();
  return true;
}

// Says once, quietly, that the goal is met. The reward itself is fetched from
// the menu, so a full-screen reveal never lands in the middle of a fight.
function announceDailyDone() {
  if (daily.announced || !dailyLib.isClaimable(daily)) return;
  daily.announced = true;
  persistDaily();
  audio.playSfx('achievement');
  fx.toast({ icon: '🎁', title: LABELS.dailyReadyTitle, desc: LABELS.dailyReadyDesc });
}

// Hand in the day's goal for one familiar that is still missing, with the full
// reveal. Only ever once per day, because `claimed` is part of the day.
function claimDailyReward() {
  if (daily.claimed || !dailyLib.isComplete(daily)) return;
  daily.claimed = true;
  const prize = drawFamiliar(familiars, Math.random);
  if (prize) {
    familiars[prize.id] = new Date().toISOString();
    daily.reward = prize.id;
    storage.saveFamiliars(familiars);
  }
  persistDaily();

  if (!prize) {
    // Nothing left to give — say so rather than opening an empty reveal.
    audio.playSfx('achievement');
    fx.toast({ icon: '🐾', title: LABELS.dailyDone, desc: LABELS.dailyAllCollected });
    ui.renderDaily(daily, familiars);
    return;
  }
  audio.playSfx('levelUp');
  music.setDucked(true);
  ui.showLoot(prize, () => {
    music.setDucked(game.state.phase !== 'running');
    ui.renderDaily(daily, familiars);
  });
}

function onAnswered(ev) {
  const card = ui.cardAt(ev.index);
  if (ev.correct) {
    fx.ratingPopup(ev.rating.id);
    audio.playSfx(ev.rating.id);
    fx.attackSprite(ui.playerSprite());
    if (ev.question.kind === 'tf') fx.tfStamp(card, true);
    ui.renderTyped(game.state);
  } else {
    fx.ratingPopup('wrong');
    audio.playSfx('wrong');
    ui.markCardFailed(ev.index, ev.question);
    if (ev.question.kind === 'tf') fx.tfStamp(card, false);
    fx.cardEffect(card, 'shake', 300);
    inputLockUntil = now() + INPUT_LOCK_MS;
  }
  ui.renderFocus(game.state);
}

function onEnemyHit(ev) {
  const node = ui.enemyNode(ev.index);
  const target = node ? node.sprite : null;
  fx.damageNumber(ev.damage, target);
  ui.renderHp(game.state);
  if (ev.damage > 0) {
    audio.playSfx('hit');
    fx.slash(target, ev.damage >= 3);
    fx.hitSprite(target);
    fx.burst(target, ev.damage >= 3 ? '#ffd45e' : '#ff8f6b', ev.damage >= 3 ? 16 : 10);
    fx.shake(ev.damage);
  }
}

function onLifeLost(ev) {
  const heart = ui.heartAt(ev.lives);
  fx.heartBreak(heart);
  audio.playSfx('lifeLost');
  fx.shake(2);
  setTimeout(() => ui.renderHud(game.state), 600);
}

function onLevelUp(ev) {
  audio.playSfx(ev.boss ? 'boss' : 'levelUp');
  const sub = ev.boss ? LABELS.boss
    : (ev.biomeChanged ? label('newBiome', { name: ev.biomeName })
      : (ev.twoEnemies ? LABELS.doubleDuel : ''));
  fx.banner(label('levelUp', { n: ev.level }), sub, ev.boss ? 'boss' : '');
  ui.renderHud(game.state);
  ui.renderBackground(game.state.level);
  ui.renderEnemies(game.state, true);
  lowWarned = false;
}

function dispatch(events) {
  if (!events || events.length === 0) return;
  for (const ev of events) {
    statsLib.recordEvent(stats, ev, game.state);
    dailyLib.recordEvent(daily, ev);
    switch (ev.type) {
      case 'gameStarted':
        ui.renderHud(game.state);
        ui.renderBackground(game.state.level, true);
        ui.renderPlayer(settings.skin);
        ui.renderEnemies(game.state, true);
        ui.hideSolution();
        break;
      case 'loaded':
        ui.renderHud(game.state);
        ui.renderBackground(game.state.level, true);
        ui.renderPlayer(settings.skin);
        ui.renderEnemies(game.state, true);
        ui.hideSolution();
        break;
      case 'dealt':
        ui.hideSolution();
        ui.renderQuestions(game.state);
        lowWarned = false;
        // A fresh question always accepts input, whatever the last one did.
        inputLockUntil = 0;
        break;
      case 'typed':
        ui.renderTyped(game.state, ev.index);
        audio.playSfx('key');
        break;
      case 'rejected':
        fx.cardEffect(ui.cardAt(ev.index), 'shake', 300);
        break;
      case 'focus':
        ui.renderFocus(game.state);
        break;
      case 'answered':
        onAnswered(ev);
        break;
      case 'enemyHit':
        onEnemyHit(ev);
        break;
      case 'enemyDefeated': {
        const node = ui.enemyNode(ev.index);
        audio.playSfx('enemyDeath');
        if (node) {
          fx.burst(node.sprite, '#ff5c72', 20);
          fx.dieSprite(node.root);
        }
        break;
      }
      case 'timeout':
        fx.ratingPopup('timeout');
        audio.playSfx('timeout');
        inputLockUntil = now() + INPUT_LOCK_MS;
        break;
      case 'showSolution':
        ui.showSolution(ev.solution);
        music.setDucked(true);
        break;
      case 'lifeLost':
        onLifeLost(ev);
        break;
      case 'levelUp':
        onLevelUp(ev);
        break;
      case 'gameOver':
        onGameOver();
        break;
      case 'paused':
        // The formula is cleared from the DOM, not just covered by the overlay.
        ui.renderQuestions(game.state);
        ui.hideSolution();
        ui.showOverlay('overlay-pause');
        music.setDucked(true);
        break;
      case 'resumed':
        ui.hideOverlays();
        music.setDucked(false);
        break;
      case 'waveResumed':
        // Back to the questions that are still open on this wave.
        ui.hideSolution();
        ui.renderPad(game.state);
        music.setDucked(false);
        break;
      default:
        break;
    }
    unlockAchievements(ev);
  }

  if (game.state.phase === 'running' && !ui.isLootOpen()) music.setDucked(false);
  if (game.state.phase === 'over') storage.clearRun();
  else persistRun();
  persistStats(false);
  persistDaily();
  announceDailyDone();
}

function onGameOver() {
  const isRecord = game.state.level >= stats.bestLevel && game.state.level > 1;
  if (game.state.level > stats.bestLevel) stats.bestLevel = game.state.level;
  persistStats(true);
  storage.clearRun();
  audio.playSfx('gameOver');
  music.setDucked(true);
  // Let the last hit and the heart animation finish before the screen covers it.
  setTimeout(() => ui.showGameOver(game.state, stats, isRecord), 900);
}

// ---------------------------------------------------------------- clock

function step(timestamp) {
  const phase = game.state.phase;
  if (phase !== 'running' && phase !== 'hold' && phase !== 'solution') {
    lastFrame = timestamp;
    return;
  }
  // The reward reveal covers the screen, so the wave clock has to stop with it —
  // otherwise a life is lost to watching the animation.
  if (ui.isLootOpen()) {
    lastFrame = timestamp;
    return;
  }
  // Midnight has to land even mid-game, or answers given after it would be
  // counted onto yesterday and then thrown away at the next visit to the menu.
  // Once a second is plenty and keeps the date work off the frame.
  if (timestamp - lastDayCheck >= 1000) {
    lastDayCheck = timestamp;
    if (refreshDay()) ui.renderDaily(daily, familiars);
  }

  const elapsed = Math.min(1000, Math.max(0, timestamp - lastFrame));
  lastFrame = timestamp;
  if (elapsed === 0) return;

  statsLib.addPlayTime(stats, elapsed, statsLib.dayKey());
  dispatch(game.advance(elapsed));
  announceDailyDone();
  ui.renderTimer(game.state, settings);

  // A short warning tick when the wave is nearly over.
  if (game.state.phase === 'running' && !lowWarned
      && game.state.waveMaxMs > 0
      && game.state.waveMs / game.state.waveMaxMs <= LOW_TIMER_FRAC) {
    lowWarned = true;
    audio.playSfx('tick');
  }
  persistStats(false);
}

function frame(timestamp) {
  requestAnimationFrame(frame);
  step(timestamp);
}

// ---------------------------------------------------------------- actions

function startAudio() {
  if (audio.unlock()) {
    audio.applySettings(settings);
    if (!music.isPlaying()) music.start();
  }
}

function newGame() {
  startAudio();
  fx.clearToasts();
  picker = createPicker({ stats });
  game = createGame({
    rng: Math.random, picker, skin: settings.skin,
    allowMissingFactor: settings.missingFactor !== false,
  });
  ui.hideOverlays();
  lastFrame = now();
  dispatch(game.start());
}

function continueGame() {
  const snap = storage.loadRun();
  if (!snap) { newGame(); return; }
  startAudio();
  fx.clearToasts();
  picker = createPicker({ stats });
  picker.load(snap.picker);
  game = createGame({
    rng: Math.random, picker, skin: snap.skin || settings.skin,
    allowMissingFactor: settings.missingFactor !== false,
  });
  ui.hideOverlays();
  lastFrame = now();
  dispatch(game.loadState(snap));
}

function toMenu() {
  if (game.state.phase !== 'idle' && game.state.phase !== 'over') {
    dispatch(game.pause());
  }
  persistStats(true);
  music.setDucked(true);
  showStartScreen();
}

// Reloading is how the new version actually reaches the screen. The run is
// saved continuously, so it comes back on "Weiter spielen".
function applyUpdate() {
  persistRun();
  persistStats(true);
  persistDaily();
  location.reload();
}

const isPlaying = () => game.state.phase !== 'idle' && game.state.phase !== 'over';

function showStartScreen() {
  // Back at the menu is the moment to take a waiting update.
  if (updateReady) { applyUpdate(); return; }
  refreshDay();
  ui.renderStartScreen(storage.loadRun(), stats, settings.skin);
  ui.renderDaily(daily, familiars);
  ui.showOverlay('overlay-start');
}

// Two-tap confirmation for anything destructive, like veco's save slots.
function armButton(button, labelText, action) {
  if (button.dataset.armed === '1') {
    clearTimeout(Number(button.dataset.timer));
    button.dataset.armed = '0';
    button.classList.remove('armed');
    button.textContent = labelText;
    action();
    return;
  }
  button.dataset.armed = '1';
  button.classList.add('armed');
  const original = labelText;
  button.textContent = LABELS.confirmAgain;
  const timer = setTimeout(() => {
    button.dataset.armed = '0';
    button.classList.remove('armed');
    button.textContent = original;
  }, 2500);
  button.dataset.timer = String(timer);
}

// ---------------------------------------------------------------- callbacks

const callbacks = {
  onKey(key) {
    if (locked()) return;
    startAudio();
    if (key === 'back') dispatch(game.backspace());
    else if (key === 'ok') dispatch(game.submit());
    else dispatch(game.typeDigit(key));
  },
  onBool(value) {
    if (locked()) return;
    startAudio();
    dispatch(game.answerBool(value));
  },
  onEnter() {
    if (game.state.phase === 'solution') { callbacks.onNext(); return; }
    if (locked()) return;
    dispatch(game.submit());
  },
  onNext() {
    startAudio();
    music.setDucked(false);
    dispatch(game.next());
  },
  onFocusQuestion(index) {
    dispatch(game.focusQuestion(index));
  },
  onCycleFocus() {
    const questions = game.state.questions;
    for (let i = 1; i <= questions.length; i++) {
      const index = (game.state.focus + i) % questions.length;
      if (!questions[index].done) { dispatch(game.focusQuestion(index)); return; }
    }
  },
  onPause() {
    if (ui.isOverlayOpen()) {
      if (!$isPauseOpen()) return;
      callbacks.onResume();
      return;
    }
    if (game.state.phase === 'idle' || game.state.phase === 'over') return;
    pausedAt = now();
    persistStats(true);
    dispatch(game.pause());
  },
  onResume() {
    // Swallow the ghost click iOS fires right after the pause tap.
    if (now() - pausedAt < 350) return;
    startAudio();
    lastFrame = now();
    dispatch(game.resume());
  },
  onNewGame() {
    const existing = storage.loadRun();
    const button = document.getElementById('btn-new');
    if (existing && !$isGameOverOpen()) {
      armButton(button, LABELS.newGame, newGame);
      return;
    }
    newGame();
  },
  onContinue: continueGame,
  onMenu: toMenu,
  onOpen(overlayId) {
    returnOverlay = $isPauseOpen() ? 'overlay-pause' : 'overlay-start';
    if (overlayId === 'overlay-stats') ui.renderStats(stats);
    if (overlayId === 'overlay-achievements') ui.renderAchievements(unlocked);
    if (overlayId === 'overlay-familiars') ui.renderFamiliars(familiars, daily.reward);
    if (overlayId === 'overlay-settings') {
      ui.renderSettings(settings, unlockedSkins(unlocked, DEFAULT_SKIN));
    }
    ui.showOverlay(overlayId);
  },
  onClose() {
    if (returnOverlay === 'overlay-pause') ui.showOverlay('overlay-pause');
    else showStartScreen();
  },
  onClaimDaily() {
    startAudio();
    claimDailyReward();
  },
  onSetting(key, value) {
    settings[key] = value;
    storage.saveSettings(settings);
    if (key === 'muted' || key === 'sfx' || key === 'music') {
      startAudio();
      audio.applySettings(settings);
      if (key === 'sfx') audio.playSfx('key');
    }
    if (key === 'showTimerBar') ui.renderTimer(game.state, settings);
    // Applies from the next question on, so the current one is not rewritten.
    if (key === 'missingFactor') game.setAllowMissingFactor(value);
  },
  onSkinSelect(id) {
    settings.skin = id;
    storage.saveSettings(settings);
    game.state.skin = id;
    ui.renderPlayer(id);
    ui.renderSettings(settings, unlockedSkins(unlocked, DEFAULT_SKIN));
    persistRun();
    audio.playSfx('good');
  },
  onResetRun(button) {
    armButton(button, LABELS.resetRun, () => {
      storage.clearRun();
      game = createGame({
        rng: Math.random, picker, skin: settings.skin,
        allowMissingFactor: settings.missingFactor !== false,
      });
      ui.renderStartScreen(null, stats, settings.skin);
      ui.renderDaily(daily, familiars);
      ui.showOverlay('overlay-start');
    });
  },
  // Wiping the statistics needs the code, so it cannot happen by accident.
  onResetStats() {
    ui.openStatsLock();
  },
  onStatsCode(entered) {
    if (String(entered).trim() !== STATS_RESET_CODE) {
      ui.statsLockError();
      return;
    }
    stats = storage.resetStats();
    unlocked = {};
    storage.saveAchievements(unlocked);
    familiars = storage.resetFamiliars();
    daily = dailyLib.emptyDaily(statsLib.dayKey());
    persistDaily();
    picker = createPicker({ stats });
    // The achievements go with the statistics, so every other figure is locked
    // again — the chosen one has to come back to the starting knight with them.
    settings.skin = DEFAULT_SKIN;
    storage.saveSettings(settings);
    game.state.skin = DEFAULT_SKIN;
    ui.renderPlayer(DEFAULT_SKIN);
    persistRun();
    ui.renderSettings(settings, unlockedSkins(unlocked, DEFAULT_SKIN));
    ui.statsLockDone();
  },
};

const $isPauseOpen = () => {
  const el = document.getElementById('overlay-pause');
  return el && !el.classList.contains('hidden');
};
const $isGameOverOpen = () => {
  const el = document.getElementById('overlay-gameover');
  return el && !el.classList.contains('hidden');
};

// ---------------------------------------------------------------- boot

function boot() {
  fx.init();
  ui = createUi(callbacks);
  audio.applySettings(settings);
  ui.renderHud(game.state);
  ui.renderPlayer(settings.skin);
  ui.renderBackground(1, true);
  ui.renderTimer(game.state, settings);
  showStartScreen();

  preloadSheets().then(() => {
    // Redraw once the sheets are known, so placeholders are replaced.
    ui.renderPlayer(settings.skin);
    if (game.state.enemies.length) ui.renderEnemies(game.state, false);
  });

  lastFrame = now();
  requestAnimationFrame(frame);
  // A throttled tab still gets a tick, so the timer cannot silently stall.
  setInterval(() => step(now()), 250);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      persistStats(true);
      persistRun();
      if (game.state.phase === 'running' || game.state.phase === 'hold') {
        pausedAt = now();
        dispatch(game.pause());
      }
    } else {
      lastFrame = now();
      if (refreshDay()) ui.renderDaily(daily, familiars);
    }
  });

  window.addEventListener('pagehide', () => {
    persistStats(true);
    persistRun();
  });

  // The worker is a cache-first precache, which would serve stale files during
  // development — so it is only installed on the deployed site.
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0 && !isLocal) {
    // A new worker claims the page as soon as it installs, but the document and
    // its scripts in front of the player are still the old ones — without this
    // the update only shows on a second reload. Taking it automatically means
    // one reload is enough, and waiting for the menu means it never happens
    // mid-question.
    const hadWorker = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // A first install has nothing to replace, so there is nothing to reload.
      if (!hadWorker || updateReady) return;
      updateReady = true;
      if (!isPlaying()) applyUpdate();
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  } else if ('serviceWorker' in navigator && isLocal) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.forEach((reg) => reg.unregister()))
      .catch(() => {});
  }

  if (location.hash === '#debug') {
    window.rr = {
      get game() { return game; },
      get state() { return game.state; },
      get stats() { return stats; },
      get unlocked() { return unlocked; },
      get settings() { return settings; },
      set level(n) { ui.hideOverlays(); lastFrame = now(); dispatch(game.setLevel(n)); },
      newGame,
      unlockAll() {
        const stamp = new Date().toISOString();
        for (const a of ACHIEVEMENTS) unlocked[a.id] = stamp;
        storage.saveAchievements(unlocked);
        ui.renderSettings(settings, unlockedSkins(unlocked, DEFAULT_SKIN));
      },
      achievements: ACHIEVEMENTS,
      get daily() { return daily; },
      get familiars() { return familiars; },
      // finish today's goal on the spot, to see the reveal
      // Fills today's goal but leaves it to be handed in from the menu.
      finishDaily() {
        daily.correct = dailyLib.QUEST.target;
        persistDaily();
        ui.renderDaily(daily, familiars);
        announceDailyDone();
      },
      claimDaily() { claimDailyReward(); },
      lockFamiliars() {
        familiars = {};
        storage.saveFamiliars(familiars);
        daily.claimed = false;
        daily.reward = null;
        persistDaily();
      },
      resetAll() {
        persistDisabled = true;
        storage.resetAll();
        location.reload();
      },
      picker: () => picker,
      biomeFor,
    };
    console.log('Rechenritter debug: window.rr');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
