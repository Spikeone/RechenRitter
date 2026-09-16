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

test('the season sets one goal and keeps it', () => {
  assert.strictEqual(daily.QUEST, SEASON.quest, 'the quest belongs to the season');
  assert.ok(daily.QUEST.target > 0, 'it has a target');
  assert.ok(daily.QUEST.title, 'and a German title');
  assert.ok(daily.QUEST.title.indexOf(String(daily.QUEST.target)) !== -1,
    'the title names the number it asks for');
});

test('a new day clears the count and can be claimed again', () => {
  const yesterday = daily.emptyDaily('2026-09-15');
  yesterday.correct = daily.QUEST.target;
  yesterday.claimed = true;
  yesterday.announced = true;
  yesterday.reward = 'frog';

  const kept = daily.normalize(yesterday, '2026-09-15');
  assert.strictEqual(kept.correct, daily.QUEST.target, 'the same day keeps its progress');
  assert.strictEqual(kept.claimed, true);
  assert.strictEqual(kept.reward, 'frog');

  const today = daily.normalize(yesterday, '2026-09-16');
  assert.strictEqual(today.day, '2026-09-16');
  assert.strictEqual(today.correct, 0, 'a new day starts from zero');
  assert.strictEqual(today.claimed, false, 'and is worth another familiar');
  assert.strictEqual(today.announced, false);
  assert.strictEqual(today.reward, null);
});

test('normalize survives missing and corrupt stored data', () => {
  for (const bad of [null, undefined, 'nonsense', 42, [], { day: '2026-09-16', correct: 'x' }]) {
    const d = daily.normalize(bad, '2026-09-16');
    assert.strictEqual(d.day, '2026-09-16');
    assert.strictEqual(d.correct, 0);
    assert.strictEqual(d.claimed, false);
  }
  const negative = daily.normalize({ day: '2026-09-16', correct: -5 }, '2026-09-16');
  assert.strictEqual(negative.correct, 0, 'a negative count is dropped');
});

test('a day saved by the older rotating version keeps its progress', () => {
  const v1 = {
    v: 1, day: '2026-09-16', questId: 'excellent-30',
    counters: { correct: 12, excellent: 4 }, claimed: false,
  };
  const migrated = daily.normalize(v1, '2026-09-16');
  assert.strictEqual(migrated.correct, 12, 'the correct answers carry over');
  assert.strictEqual(migrated.v, 2);
});

test('only correct answers count towards the day', () => {
  const d = daily.emptyDaily('2026-09-16');
  daily.recordEvent(d, { type: 'answered', correct: true });
  daily.recordEvent(d, { type: 'answered', correct: true });
  assert.strictEqual(d.correct, 2);

  daily.recordEvent(d, { type: 'answered', correct: false });
  assert.strictEqual(d.correct, 2, 'a wrong answer counts for nothing');

  for (const other of ['enemyDefeated', 'levelUp', 'gameStarted', 'timeout', 'dealt']) {
    daily.recordEvent(d, { type: other });
  }
  assert.strictEqual(d.correct, 2, 'and neither does anything else');
});

test('the goal completes exactly on target and the bar never overfills', () => {
  const d = daily.emptyDaily('2026-09-16');
  for (let i = 0; i < daily.QUEST.target - 1; i++) {
    daily.recordEvent(d, { type: 'answered', correct: true });
  }
  assert.ok(!daily.isComplete(d), 'one short is not done');
  assert.ok(!daily.isClaimable(d));
  assert.strictEqual(daily.progressText(d),
    (daily.QUEST.target - 1) + ' / ' + daily.QUEST.target);

  daily.recordEvent(d, { type: 'answered', correct: true });
  assert.ok(daily.isComplete(d), 'the target finishes it');
  assert.ok(daily.isClaimable(d), 'and it is waiting to be handed in');

  for (let i = 0; i < 50; i++) daily.recordEvent(d, { type: 'answered', correct: true });
  assert.strictEqual(daily.progressOf(d), daily.QUEST.target, 'the bar stops at the target');
  assert.strictEqual(daily.progressText(d), daily.QUEST.target + ' / ' + daily.QUEST.target);
});

test('a handed-in day is no longer claimable', () => {
  const d = daily.emptyDaily('2026-09-16');
  d.correct = daily.QUEST.target;
  assert.ok(daily.isClaimable(d));
  d.claimed = true;
  assert.ok(daily.isComplete(d), 'still done');
  assert.ok(!daily.isClaimable(d), 'but not a second time');
});

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('\n' + failures.length + ' FAILED:\n');
  for (const f of failures) console.error('  ✗ ' + f + '\n');
  console.error(passed + ' passed, ' + failures.length + ' failed');
  process.exit(1);
}
console.log('daily.test.mjs: ' + passed + ' passed');
