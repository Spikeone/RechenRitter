// Pure game logic: no DOM, no timers, no storage. The clock is pushed in from
// outside via advance(elapsedMs), and the random source is injected, so the
// whole run is reproducible in tests.
//
// Every mutator returns a list of events describing what happened. main.js turns
// those into rendering, sound and effects; game.js never knows about any of that.

import {
  LIVES, FACT_MIN, FACT_MAX, XY_MISSING_FROM_LEVEL, MISSING_POOL_LATE,
  TRUE_FALSE_FROM_LEVEL, TRUE_FALSE_CHANCE, CORRECT_HOLD_MS, LEVEL_HOLD_MS,
  enemyCount, enemyHp, isBossLevel, waveMs, rate,
} from './config.js';
import { biomeFor, enemyKindsFor as defaultEnemyKinds } from './biomes.js';

const NO_EVENTS = Object.freeze([]);

const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

function pickFrom(rng, list) {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

// A believable wrong result for a Richtig/Falsch card: near the real one, and
// usually a result the player could reach by a small slip.
function distractor(rng, x, y) {
  const z = x * y;
  const candidates = [
    z + x, z - x, z + y, z - y, z + 1, z - 1, z + 10, z - 10,
    (x + 1) * y, (x - 1) * y, x * (y + 1), x * (y - 1),
  ].filter((v) => v !== z && v >= 1 && v <= FACT_MAX * FACT_MAX);
  if (candidates.length === 0) return z === 1 ? 2 : z - 1;
  return pickFrom(rng, candidates);
}

export function createGame(options) {
  const opts = options || {};
  const rng = opts.rng || Math.random;
  const picker = opts.picker;
  const enemyKindsFor = opts.enemyKindsFor || defaultEnemyKinds;
  // A setting, not run state: with it off only the result is ever missing, so
  // the player never has to divide to get there.
  let allowMissingFactor = opts.allowMissingFactor !== false;

  const state = {
    phase: 'idle',       // idle | running | hold | solution | paused | over
    level: 1,
    maxLevel: 1,
    lives: LIVES,
    skin: opts.skin || 'knight',
    biome: biomeFor(1).id,
    enemies: [],
    questions: [],
    focus: 0,
    waveMs: 0,
    waveMaxMs: 0,
    holdMs: 0,
    pendingLevelUp: false,
    streakExcellent: 0,
    streakCorrect: 0,
    solution: null,
    run: {
      correct: 0, wrong: 0, timeouts: 0,
      excellent: 0, perfect: 0, good: 0, slow: 0,
      clearedTwoEnemyLevel: false, clearedBossLevel: false,
      startedAt: 0,
    },
  };

  const nextFact = () => (picker ? picker.pick(rng)
    : { x: randInt(rng, FACT_MIN, FACT_MAX), y: randInt(rng, FACT_MIN, FACT_MAX) });

  function makeQuestion(enemyIndex) {
    const fact = nextFact();
    const x = fact.x;
    const y = fact.y;
    const z = x * y;
    const useTf = state.level >= TRUE_FALSE_FROM_LEVEL && rng() < TRUE_FALSE_CHANCE;

    if (useTf) {
      const isTrue = rng() < 0.5;
      return {
        kind: 'tf',
        x, y, z,
        missing: null,
        shown: isTrue ? z : distractor(rng, x, y),
        isTrue,
        answer: null,
        digits: 0,
        typed: '',
        chosen: null,
        enemy: enemyIndex,
        thinkMs: 0,
        done: false,
        correct: null,
      };
    }

    const missing = (allowMissingFactor && state.level >= XY_MISSING_FROM_LEVEL)
      ? pickFrom(rng, MISSING_POOL_LATE)
      : 'z';
    const answer = missing === 'z' ? z : (missing === 'x' ? x : y);
    return {
      kind: 'fill',
      x, y, z,
      missing,
      shown: null,
      isTrue: null,
      answer,
      digits: String(answer).length,
      typed: '',
      chosen: null,
      enemy: enemyIndex,
      thinkMs: 0,
      done: false,
      correct: null,
    };
  }

  function spawnEnemies() {
    const count = enemyCount(state.level);
    const kinds = enemyKindsFor(state.level, count, rng);
    const boss = isBossLevel(state.level);
    state.enemies = kinds.map((kind) => {
      const hp = enemyHp(state.level, count);
      return { kind, hp, maxHp: hp, alive: true, boss };
    });
    state.biome = biomeFor(state.level).id;
  }

  function dealWave(events) {
    state.questions = [];
    state.enemies.forEach((enemy, i) => {
      if (enemy.alive) state.questions.push(makeQuestion(i));
    });
    state.focus = 0;
    state.waveMaxMs = waveMs(state.level, state.questions.length);
    state.waveMs = state.waveMaxMs;
    state.phase = 'running';
    events.push({ type: 'dealt', questions: state.questions.slice() });
  }

  const aliveCount = () => state.enemies.filter((e) => e.alive).length;

  function advanceFocus() {
    const next = state.questions.findIndex((q) => !q.done);
    if (next !== -1 && next !== state.focus) {
      state.focus = next;
      return true;
    }
    if (next !== -1) state.focus = next;
    return false;
  }

  function loseLife(events, cause) {
    state.lives -= 1;
    state.streakExcellent = 0;
    state.streakCorrect = 0;
    events.push({ type: 'lifeLost', lives: state.lives, cause });
    if (state.lives <= 0) {
      state.lives = 0;
      state.phase = 'over';
      state.questions = [];
      state.solution = null;
      events.push({ type: 'gameOver', level: state.level, maxLevel: state.maxLevel });
      return true;
    }
    return false;
  }

  function enterSolution(events, payload) {
    state.phase = 'solution';
    state.solution = payload;
    state.questions = [];
    events.push({ type: 'showSolution', solution: payload });
  }

  // Called once every question of the wave is done and the player is still alive.
  // The level is only advanced when the hold ends, so the beaten enemy stays in
  // state while its death animation plays.
  function afterWave() {
    state.phase = 'hold';
    if (aliveCount() === 0) {
      state.pendingLevelUp = true;
      state.holdMs = LEVEL_HOLD_MS;
    } else {
      state.holdMs = CORRECT_HOLD_MS;
    }
  }

  function finishLevel(events) {
    state.pendingLevelUp = false;
    state.level += 1;
    if (state.level > state.maxLevel) state.maxLevel = state.level;
    const prevBiome = state.biome;
    spawnEnemies();
    const biome = biomeFor(state.level);
    events.push({
      type: 'levelUp',
      level: state.level,
      biome: biome.id,
      biomeName: biome.name,
      biomeChanged: biome.id !== prevBiome,
      boss: isBossLevel(state.level),
      twoEnemies: state.enemies.length > 1,
    });
  }

  function resolve(question, events) {
    const q = question;
    const fact = { x: q.x, y: q.y, z: q.z, missing: q.missing, kind: q.kind, shown: q.shown };
    const correct = q.kind === 'tf'
      ? q.chosen === q.isTrue
      : Number(q.typed) === q.answer;

    q.done = true;
    q.correct = correct;

    if (correct) {
      const rating = rate(state.level, q.thinkMs, q.kind);
      state.run.correct += 1;
      state.run[rating.id] += 1;
      state.streakCorrect += 1;
      state.streakExcellent = rating.id === 'excellent' ? state.streakExcellent + 1 : 0;
      if (picker) picker.reportCorrect(fact);

      events.push({
        type: 'answered',
        correct: true,
        question: q,
        fact,
        rating,
        damage: rating.damage,
        thinkMs: q.thinkMs,
      });

      const enemy = state.enemies[q.enemy];
      if (enemy && enemy.alive) {
        enemy.hp = Math.max(0, enemy.hp - rating.damage);
        events.push({
          type: 'enemyHit',
          index: q.enemy,
          enemy,
          damage: rating.damage,
          rating,
          hp: enemy.hp,
        });
        if (enemy.hp === 0) {
          enemy.alive = false;
          events.push({ type: 'enemyDefeated', index: q.enemy, enemy });
          if (state.enemies.length > 1) state.run.clearedTwoEnemyLevel = true;
          if (enemy.boss) state.run.clearedBossLevel = true;
          // A dead enemy takes its pending question with it.
          for (const other of state.questions) {
            if (other !== q && other.enemy === q.enemy) other.done = true;
          }
        }
      }

      if (state.questions.every((item) => item.done)) {
        afterWave();
      } else {
        advanceFocus();
        events.push({ type: 'focus', index: state.focus });
      }
      return;
    }

    // Wrong: costs a life and stops the wave; the solution card explains it.
    state.run.wrong += 1;
    if (picker) picker.reportMiss(fact);
    events.push({
      type: 'answered',
      correct: false,
      question: q,
      fact,
      rating: null,
      damage: 0,
      thinkMs: q.thinkMs,
      given: q.kind === 'tf' ? q.chosen : q.typed,
    });
    if (loseLife(events, 'wrong')) return;
    enterSolution(events, {
      cause: 'wrong',
      facts: [fact],
      given: q.kind === 'tf' ? q.chosen : q.typed,
    });
  }

  const focused = () => state.questions[state.focus] || null;
  const canInput = () => state.phase === 'running' && focused() && !focused().done;

  // ---------------- public API ----------------

  function start() {
    const events = [];
    state.phase = 'running';
    state.level = 1;
    state.maxLevel = 1;
    state.lives = LIVES;
    state.streakExcellent = 0;
    state.streakCorrect = 0;
    state.solution = null;
    state.holdMs = 0;
    state.pendingLevelUp = false;
    state.run = {
      correct: 0, wrong: 0, timeouts: 0,
      excellent: 0, perfect: 0, good: 0, slow: 0,
      clearedTwoEnemyLevel: false, clearedBossLevel: false,
      startedAt: Date.now(),
    };
    spawnEnemies();
    events.push({ type: 'gameStarted', level: state.level, biome: state.biome });
    dealWave(events);
    return events;
  }

  function typeDigit(digit) {
    if (!canInput()) return NO_EVENTS;
    const q = focused();
    if (q.kind !== 'fill') return NO_EVENTS;
    const d = Number(digit);
    if (!(d >= 0 && d <= 9)) return NO_EVENTS;
    if (q.typed === '' && d === 0) {
      // Leading zeros would break the "as many digits as the result" rule.
      return [{ type: 'rejected', index: state.focus, reason: 'leadingZero' }];
    }
    if (q.typed.length >= q.digits) return NO_EVENTS;

    q.typed += String(d);
    const events = [{ type: 'typed', index: state.focus, typed: q.typed }];
    if (q.typed.length === q.digits) resolve(q, events);
    return events;
  }

  function backspace() {
    if (!canInput()) return NO_EVENTS;
    const q = focused();
    if (q.kind !== 'fill' || q.typed === '') return NO_EVENTS;
    q.typed = q.typed.slice(0, -1);
    return [{ type: 'typed', index: state.focus, typed: q.typed }];
  }

  // The OK key: commits a shorter answer than the result has digits.
  function submit() {
    if (!canInput()) return NO_EVENTS;
    const q = focused();
    if (q.kind !== 'fill' || q.typed === '') return NO_EVENTS;
    const events = [];
    resolve(q, events);
    return events;
  }

  function answerBool(value) {
    if (!canInput()) return NO_EVENTS;
    const q = focused();
    if (q.kind !== 'tf') return NO_EVENTS;
    q.chosen = !!value;
    const events = [];
    resolve(q, events);
    return events;
  }

  function focusQuestion(index) {
    if (state.phase !== 'running') return NO_EVENTS;
    const q = state.questions[index];
    if (!q || q.done || index === state.focus) return NO_EVENTS;
    state.focus = index;
    return [{ type: 'focus', index }];
  }

  // Leaves the solution card and deals the next wave.
  function next() {
    if (state.phase !== 'solution') return NO_EVENTS;
    state.solution = null;
    const events = [];
    dealWave(events);
    return events;
  }

  function advance(elapsedMs) {
    if (elapsedMs <= 0) return NO_EVENTS;

    if (state.phase === 'hold') {
      state.holdMs -= elapsedMs;
      if (state.holdMs > 0) return NO_EVENTS;
      state.holdMs = 0;
      const events = [];
      if (state.pendingLevelUp) finishLevel(events);
      dealWave(events);
      return events;
    }

    if (state.phase !== 'running') return NO_EVENTS;

    const q = focused();
    if (q && !q.done) q.thinkMs += elapsedMs;
    state.waveMs -= elapsedMs;
    if (state.waveMs > 0) return NO_EVENTS;

    state.waveMs = 0;
    const events = [];
    const unanswered = state.questions.filter((item) => !item.done);
    state.run.timeouts += 1;
    if (picker) for (const item of unanswered) picker.reportMiss({ x: item.x, y: item.y });
    events.push({ type: 'timeout', unanswered: unanswered.slice() });
    if (loseLife(events, 'timeout')) return events;
    enterSolution(events, {
      cause: 'timeout',
      facts: unanswered.map((item) => ({
        x: item.x, y: item.y, z: item.z,
        missing: item.missing, kind: item.kind, shown: item.shown,
      })),
      given: null,
    });
    return events;
  }

  // Pausing hides the formulas on purpose — resuming deals new ones so the
  // pause cannot be used to think for free.
  function pause() {
    if (state.phase !== 'running' && state.phase !== 'hold' && state.phase !== 'solution') {
      return NO_EVENTS;
    }
    // A level cleared just before the pause still counts once play resumes.
    const events = [];
    if (state.pendingLevelUp) finishLevel(events);
    state.phase = 'paused';
    state.questions = [];
    state.solution = null;
    state.holdMs = 0;
    events.push({ type: 'paused' });
    return events;
  }

  function resume() {
    if (state.phase !== 'paused') return NO_EVENTS;
    const events = [{ type: 'resumed' }];
    dealWave(events);
    return events;
  }

  function snapshot() {
    return {
      v: 1,
      level: state.level,
      maxLevel: state.maxLevel,
      lives: state.lives,
      skin: state.skin,
      biome: state.biome,
      enemies: state.enemies.map((e) => ({
        kind: e.kind, hp: e.hp, maxHp: e.maxHp, alive: e.alive, boss: e.boss,
      })),
      streakExcellent: state.streakExcellent,
      streakCorrect: state.streakCorrect,
      run: Object.assign({}, state.run),
      savedAt: Date.now(),
    };
  }

  // Restores a saved run and deals a fresh wave — the live question is never
  // part of a snapshot.
  function loadState(snap) {
    if (!snap || typeof snap !== 'object') return NO_EVENTS;
    state.level = Math.max(1, snap.level || 1);
    state.maxLevel = Math.max(state.level, snap.maxLevel || state.level);
    state.lives = Math.max(1, Math.min(LIVES, snap.lives || LIVES));
    state.skin = snap.skin || state.skin;
    state.streakExcellent = snap.streakExcellent || 0;
    state.streakCorrect = snap.streakCorrect || 0;
    state.solution = null;
    state.holdMs = 0;
    state.pendingLevelUp = false;
    state.run = Object.assign({
      correct: 0, wrong: 0, timeouts: 0,
      excellent: 0, perfect: 0, good: 0, slow: 0,
      clearedTwoEnemyLevel: false, clearedBossLevel: false, startedAt: Date.now(),
    }, snap.run || {});

    if (Array.isArray(snap.enemies) && snap.enemies.length > 0) {
      state.enemies = snap.enemies.map((e) => ({
        kind: e.kind,
        maxHp: Math.max(1, e.maxHp || 1),
        hp: Math.max(0, Math.min(e.maxHp || 1, e.hp)),
        alive: e.alive !== false && e.hp > 0,
        boss: !!e.boss,
      }));
      state.biome = snap.biome || biomeFor(state.level).id;
      if (state.enemies.every((e) => !e.alive)) spawnEnemies();
    } else {
      spawnEnemies();
    }

    const events = [{ type: 'loaded', level: state.level }];
    dealWave(events);
    return events;
  }

  // Debug helper (#debug hook) — jumps to a level with fresh enemies.
  function setLevel(level) {
    state.pendingLevelUp = false;
    state.holdMs = 0;
    state.solution = null;
    state.level = Math.max(1, Math.floor(level));
    if (state.level > state.maxLevel) state.maxLevel = state.level;
    spawnEnemies();
    const events = [{
      type: 'levelUp',
      level: state.level,
      biome: state.biome,
      biomeName: biomeFor(state.level).name,
      biomeChanged: true,
      boss: isBossLevel(state.level),
      twoEnemies: state.enemies.length > 1,
    }];
    dealWave(events);
    return events;
  }

  // Takes effect on the next question dealt, so a running wave is never rewritten.
  function setAllowMissingFactor(value) {
    allowMissingFactor = value !== false;
  }

  return {
    state,
    start,
    setAllowMissingFactor,
    typeDigit,
    backspace,
    submit,
    answerBool,
    focusQuestion,
    next,
    advance,
    pause,
    resume,
    snapshot,
    loadState,
    setLevel,
  };
}
