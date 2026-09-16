// Run with:  node tests/daily.test.mjs
import assert from 'assert';
import * as daily from '../js/daily.js';
import {
  FAMILIARS, FAMILIAR_COUNT, FAMILIAR_COLS, FAMILIAR_ROWS,
  familiarById, drawFamiliar, lockedFamiliars, ownedCount, isUnlocked, SEASON,
} from '../js/familiars.js';

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (err) { failures.push(name + '\n    ' + err.message); }
}

// ---------------------------------------------------------------- familiars

test('the collection fills the sheet exactly, with unique ids and cells', () => {
  assert.strictEqual(FAMILIAR_COUNT, FAMILIAR_COLS * FAMILIAR_ROWS,
    'one entry per jar on the sheet');
  const ids = new Set();
  const cells = new Set();
  for (const f of FAMILIARS) {
    assert.ok(f.id && f.name, 'every familiar has an id and a German name');
    assert.ok(!ids.has(f.id), 'duplicate id ' + f.id);
    ids.add(f.id);
    const cell = f.col + ',' + f.row;
    assert.ok(!cells.has(cell), 'two familiars share cell ' + cell);
    cells.add(cell);
    assert.ok(f.col >= 0 && f.col < FAMILIAR_COLS, f.id + ' column in range');
    assert.ok(f.row >= 0 && f.row < FAMILIAR_ROWS, f.id + ' row in range');
    assert.strictEqual(familiarById(f.id), f);
  }
  assert.ok(SEASON.name && SEASON.title);
});

test('drawing hands out only what is missing, and stops when complete', () => {
  const owned = {};
  const got = [];
  for (let i = 0; i < FAMILIAR_COUNT; i++) {
    const prize = drawFamiliar(owned, Math.random);
    assert.ok(prize, 'still something to give after ' + i);
    assert.ok(!isUnlocked(owned, prize.id), 'never hands out a duplicate');
    owned[prize.id] = 'now';
    got.push(prize.id);
  }
  assert.strictEqual(new Set(got).size, FAMILIAR_COUNT, 'every one came up exactly once');
  assert.strictEqual(ownedCount(owned), FAMILIAR_COUNT);
  assert.strictEqual(lockedFamiliars(owned).length, 0);
  assert.strictEqual(drawFamiliar(owned, Math.random), null, 'nothing left to give');
});

test('an extreme rng roll still lands inside the list', () => {
  const owned = {};
  assert.ok(drawFamiliar(owned, () => 0.999999999));
  assert.ok(drawFamiliar(owned, () => 0));
});

// ---------------------------------------------------------------- the quest

test('every quest is well formed and watches a real counter', () => {
  const counters = daily.emptyCounters();
  const ids = new Set();
  for (const q of daily.QUESTS) {
    assert.ok(q.id && q.title, 'id and German title');
    assert.ok(!ids.has(q.id), 'duplicate quest ' + q.id);
    ids.add(q.id);
    assert.ok(q.target > 0, q.id + ' has a target');
    assert.ok(Object.prototype.hasOwnProperty.call(counters, q.track),
      q.id + ' tracks a counter that exists: ' + q.track);
    assert.strictEqual(daily.questById(q.id), q);
  }
  assert.ok(daily.QUESTS.length >= 8, 'enough variety not to repeat every other day');
});

test('the day decides the quest, so everyone asking gets the same answer', () => {
  for (const key of ['2026-09-16', '2026-01-01', '2027-12-31']) {
    const first = daily.questForDay(key);
    for (let n = 0; n < 20; n++) assert.strictEqual(daily.questForDay(key), first, key);
  }
  // and it does move around across a month
  const seen = new Set();
  for (let d = 1; d <= 31; d++) {
    seen.add(daily.questForDay('2026-03-' + (d < 10 ? '0' + d : d)).id);
  }
  assert.ok(seen.size >= 5, 'a month brings a decent spread, got ' + seen.size);
});

test('a new day clears the counters and brings a new goal', () => {
  const yesterday = daily.emptyDaily('2026-09-15');
  yesterday.counters.correct = 40;
  yesterday.claimed = true;
  yesterday.reward = 'frog';

  const kept = daily.normalize(yesterday, '2026-09-15');
  assert.strictEqual(kept.counters.correct, 40, 'same day keeps its progress');
  assert.strictEqual(kept.claimed, true);

  const today = daily.normalize(yesterday, '2026-09-16');
  assert.strictEqual(today.day, '2026-09-16');
  assert.strictEqual(today.counters.correct, 0, 'a new day starts from zero');
  assert.strictEqual(today.claimed, false, 'and can be claimed again');
  assert.strictEqual(today.questId, daily.questForDay('2026-09-16').id);
});

test('normalize survives missing and corrupt stored data', () => {
  for (const bad of [null, undefined, 'nonsense', 42, [], { day: '2026-09-16', counters: 'x' }]) {
    const d = daily.normalize(bad, '2026-09-16');
    assert.strictEqual(d.day, '2026-09-16');
    assert.ok(daily.questById(d.questId), 'always ends up with a real quest');
    assert.strictEqual(d.counters.correct, 0);
  }
  const negative = daily.normalize(
    { day: '2026-09-16', questId: 'correct-40', counters: { correct: -5, excellent: 3 } },
    '2026-09-16');
  assert.strictEqual(negative.counters.correct, 0, 'a negative count is dropped');
  assert.strictEqual(negative.counters.excellent, 3);
});

test('answers, kills and levels move the right counters', () => {
  const d = daily.emptyDaily('2026-09-16');
  const state = { level: 4, streakExcellent: 3 };
  daily.recordEvent(d, {
    type: 'answered', correct: true, question: { kind: 'fill' },
    rating: { id: 'excellent' },
  }, state);
  assert.strictEqual(d.counters.correct, 1);
  assert.strictEqual(d.counters.excellent, 1);
  assert.strictEqual(d.counters.bestStreak, 3);
  assert.strictEqual(d.counters.tfCorrect, 0);

  daily.recordEvent(d, {
    type: 'answered', correct: true, question: { kind: 'tf' }, rating: { id: 'good' },
  }, state);
  assert.strictEqual(d.counters.tfCorrect, 1);
  assert.strictEqual(d.counters.excellent, 1, 'good is not excellent');

  daily.recordEvent(d, { type: 'answered', correct: false, question: { kind: 'fill' } }, state);
  assert.strictEqual(d.counters.correct, 2, 'a wrong answer counts for nothing');

  daily.recordEvent(d, { type: 'enemyDefeated', enemy: { boss: false } }, state);
  daily.recordEvent(d, { type: 'enemyDefeated', enemy: { boss: true } }, state);
  assert.strictEqual(d.counters.defeated, 2);
  assert.strictEqual(d.counters.bosses, 1);

  daily.recordEvent(d, { type: 'levelUp' }, { level: 9, streakExcellent: 0 });
  assert.strictEqual(d.counters.bestLevel, 9);
  daily.recordEvent(d, { type: 'levelUp' }, { level: 2, streakExcellent: 0 });
  assert.strictEqual(d.counters.bestLevel, 9, 'the best of the day, not the latest');

  daily.recordEvent(d, { type: 'gameStarted' }, state);
  assert.strictEqual(d.counters.games, 1);

  daily.addPlayTime(d, 4000);
  daily.addPlayTime(d, -10);
  assert.strictEqual(d.counters.playMs, 4000);
});

test('progress caps at the target and reads as text', () => {
  const d = daily.emptyDaily('2026-09-16');
  const quest = daily.questById(d.questId);
  assert.strictEqual(daily.progressOf(d), 0);
  assert.ok(!daily.isComplete(d));

  d.counters[quest.track] = quest.target - 1;
  assert.ok(!daily.isComplete(d), 'one short is not done');

  d.counters[quest.track] = quest.target * 3;
  assert.ok(daily.isComplete(d));
  assert.strictEqual(daily.progressOf(d), quest.target, 'the bar never overfills');
});

test('the timed quest reads as minutes and seconds', () => {
  const d = daily.emptyDaily('2026-09-16');
  d.questId = 'playtime-10';
  d.counters.playMs = 6 * 60 * 1000 + 10 * 1000;
  assert.strictEqual(daily.progressText(d), '6:10 / 10:00');
  d.counters.playMs = 5 * 1000;
  assert.strictEqual(daily.progressText(d), '0:05 / 10:00');
});

test('a counting quest reads as a plain fraction', () => {
  const d = daily.emptyDaily('2026-09-16');
  d.questId = 'correct-40';
  d.counters.correct = 32;
  assert.strictEqual(daily.progressText(d), '32 / 40');
});

test('every quest can actually be finished by playing', () => {
  // Drives each quest's counter up the way the game would and checks it lands.
  for (const quest of daily.QUESTS) {
    const d = daily.emptyDaily('2026-09-16');
    d.questId = quest.id;
    const state = { level: 1, streakExcellent: 0 };
    let guard = 0;
    while (!daily.isComplete(d) && guard++ < 5000) {
      switch (quest.track) {
        case 'correct':
        case 'excellent':
        case 'tfCorrect':
        case 'bestStreak':
          state.streakExcellent += 1;
          daily.recordEvent(d, {
            type: 'answered', correct: true,
            question: { kind: quest.track === 'tfCorrect' ? 'tf' : 'fill' },
            rating: { id: 'excellent' },
          }, state);
          break;
        case 'defeated':
        case 'bosses':
          daily.recordEvent(d, {
            type: 'enemyDefeated', enemy: { boss: quest.track === 'bosses' },
          }, state);
          break;
        case 'bestLevel':
          state.level += 1;
          daily.recordEvent(d, { type: 'levelUp' }, state);
          break;
        case 'games':
          daily.recordEvent(d, { type: 'gameStarted' }, state);
          break;
        case 'playMs':
          daily.addPlayTime(d, 1000);
          break;
        default:
          throw new Error('no way to advance ' + quest.track);
      }
    }
    assert.ok(daily.isComplete(d), quest.id + ' is reachable');
    assert.ok(guard < 5000, quest.id + ' does not take absurdly long');
  }
});

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('\n' + failures.length + ' FAILED:\n');
  for (const f of failures) console.error('  ✗ ' + f + '\n');
  console.error(passed + ' passed, ' + failures.length + ' failed');
  process.exit(1);
}
console.log('daily.test.mjs: ' + passed + ' passed');
