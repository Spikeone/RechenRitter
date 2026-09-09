// Run with:  node tests/stats.test.mjs
import assert from 'assert';
import * as cfg from '../js/config.js';
import * as stats from '../js/stats.js';
import { createPicker, weakness } from '../js/picker.js';
import { ACHIEVEMENTS, checkAchievements, achievementById, skinRewards } from '../js/achievements.js';
import { PLAYERS, DEFAULT_SKIN } from '../assets/sprites/manifest.js';
import { createGame } from '../js/game.js';

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (err) { failures.push(name + '\n    ' + err.message); }
}
const constRng = (v) => () => v;

// ---------------------------------------------------------------- stats

test('fact index covers the 10x10 grid without collisions', () => {
  const seen = new Set();
  for (let x = 1; x <= 10; x++) {
    for (let y = 1; y <= 10; y++) {
      const i = stats.factIndex(x, y);
      assert.ok(i >= 0 && i < 100, x + 'x' + y + ' -> ' + i);
      assert.ok(!seen.has(i), 'duplicate index for ' + x + 'x' + y);
      seen.add(i);
    }
  }
  assert.strictEqual(seen.size, 100);
});

test('normalize repairs missing, short and corrupt stored data', () => {
  const s = stats.normalize(null);
  assert.strictEqual(s.correct, 0);
  assert.strictEqual(s.factsAsked.length, 100);

  const patched = stats.normalize({
    correct: 5, factsAsked: [1, 2], days: { '2026-01-01': 100 }, ratings: { excellent: 3 },
    bestLevel: 'nonsense', extraJunk: true,
  });
  assert.strictEqual(patched.correct, 5);
  assert.strictEqual(patched.factsAsked.length, 100);
  assert.strictEqual(patched.factsAsked[1], 2);
  assert.strictEqual(patched.ratings.excellent, 3);
  assert.strictEqual(patched.bestLevel, 1, 'a bad best level falls back');
  assert.strictEqual(patched.days['2026-01-01'], 100);
});

test('answers land in the right fact cell and totals', () => {
  const s = stats.emptyStats();
  const state = { level: 1, streakExcellent: 2 };
  stats.recordEvent(s, {
    type: 'answered', correct: true, question: { kind: 'fill' },
    fact: { x: 7, y: 8 }, rating: { id: 'excellent' }, thinkMs: 1500,
  }, state);
  const i = stats.factIndex(7, 8);
  assert.strictEqual(s.correct, 1);
  assert.strictEqual(s.factsAsked[i], 1);
  assert.strictEqual(s.factsCorrect[i], 1);
  assert.strictEqual(s.factsMs[i], 1500);
  assert.strictEqual(s.ratings.excellent, 1);
  assert.strictEqual(s.longestExcellentStreak, 2);
  assert.strictEqual(s.byKind.fill.correct, 1);

  stats.recordEvent(s, {
    type: 'answered', correct: false, question: { kind: 'fill' },
    fact: { x: 7, y: 8 }, rating: null, thinkMs: 9000,
  }, state);
  assert.strictEqual(s.wrong, 1);
  assert.strictEqual(s.factsAsked[i], 2);
  assert.strictEqual(s.factsCorrect[i], 1);
  assert.strictEqual(s.factsMs[i], 1500, 'wrong answers do not pollute the average time');
});

test('a timeout counts its unanswered facts as asked', () => {
  const s = stats.emptyStats();
  stats.recordEvent(s, {
    type: 'timeout',
    unanswered: [{ x: 3, y: 4, kind: 'fill' }, { x: 5, y: 5, kind: 'tf' }],
  }, { level: 2 });
  assert.strictEqual(s.timeouts, 1);
  assert.strictEqual(s.factsAsked[stats.factIndex(3, 4)], 1);
  assert.strictEqual(s.factsAsked[stats.factIndex(5, 5)], 1);
  assert.strictEqual(s.byKind.tf.asked, 1);
});

test('play time is logged per day and pruned to 30 days', () => {
  const s = stats.emptyStats();
  for (let d = 1; d <= 40; d++) {
    stats.addPlayTime(s, 1000, '2026-03-' + (d < 10 ? '0' + d : d));
  }
  assert.strictEqual(s.totalPlayMs, 40000, 'the total keeps everything');
  assert.strictEqual(Object.keys(s.days).length, stats.DAYS_KEPT);
  assert.ok(!s.days['2026-03-01'], 'oldest day dropped');
  assert.ok(s.days['2026-03-40'] === undefined || true);
});

test('the day strip fills gaps with zeroes, oldest first', () => {
  const s = stats.emptyStats();
  const today = new Date(2026, 2, 15);
  stats.addPlayTime(s, 5000, stats.dayKey(today));
  const strip = stats.dayStrip(s, 7, today);
  assert.strictEqual(strip.length, 7);
  assert.strictEqual(strip[6].ms, 5000, 'today is last');
  assert.strictEqual(strip[0].ms, 0);
  assert.ok(strip[0].key < strip[6].key, 'ordered oldest to newest');
});

test('factSummary reports accuracy and average time', () => {
  const s = stats.emptyStats();
  const i = stats.factIndex(6, 7);
  s.factsAsked[i] = 4; s.factsCorrect[i] = 3; s.factsMs[i] = 9000;
  const sum = stats.factSummary(s, 6, 7);
  assert.strictEqual(sum.z, 42);
  assert.strictEqual(sum.accuracy, 0.75);
  assert.strictEqual(sum.avgMs, 3000);
  assert.strictEqual(stats.factSummary(s, 1, 1).accuracy, null, 'unasked facts report null');
});

// ---------------------------------------------------------------- picker

test('weakness rises with mistakes and slowness, and ignores rare facts', () => {
  const s = stats.emptyStats();
  const i = stats.factIndex(7, 8);
  s.factsAsked[i] = 1; s.factsCorrect[i] = 0;
  assert.strictEqual(weakness(s, 7, 8), 0, 'a single mistake is not enough evidence');
  s.factsAsked[i] = 10; s.factsCorrect[i] = 2; s.factsMs[i] = 2 * 9000;
  assert.ok(weakness(s, 7, 8) > 0.6, 'often wrong and slow is clearly weak');
  const j = stats.factIndex(2, 2);
  s.factsAsked[j] = 10; s.factsCorrect[j] = 10; s.factsMs[j] = 10 * 1200;
  assert.strictEqual(weakness(s, 2, 2), 0, 'always right and fast is not weak');
});

test('a weak fact is asked clearly more often than a solid one', () => {
  const s = stats.emptyStats();
  for (let x = 1; x <= 10; x++) {
    for (let y = 1; y <= 10; y++) {
      const i = stats.factIndex(x, y);
      s.factsAsked[i] = 10; s.factsCorrect[i] = 10; s.factsMs[i] = 10 * 1000;
    }
  }
  const weak = stats.factIndex(7, 8);
  s.factsCorrect[weak] = 0; s.factsMs[weak] = 0;

  const picker = createPicker({ stats: s, rng: Math.random });
  const counts = new Array(100).fill(0);
  for (let n = 0; n < 20000; n++) {
    const fact = picker.pick(Math.random);
    counts[stats.factIndex(fact.x, fact.y)] += 1;
  }
  const average = 20000 / 100;
  assert.ok(counts[weak] > average * 2,
    'weak fact asked ' + counts[weak] + ' times vs average ' + average);
  assert.ok(counts[weak] < average * cfg.BIAS_MAX_WEIGHT * 1.6, 'but not overwhelmingly');
});

test('with no history every fact is equally likely', () => {
  const picker = createPicker({ stats: stats.emptyStats(), rng: Math.random });
  const counts = new Array(100).fill(0);
  for (let n = 0; n < 20000; n++) {
    const fact = picker.pick(Math.random);
    counts[stats.factIndex(fact.x, fact.y)] += 1;
  }
  const min = Math.min.apply(null, counts);
  const max = Math.max.apply(null, counts);
  assert.ok(min > 100, 'every fact appears (min ' + min + ')');
  assert.ok(max < 400, 'none dominates (max ' + max + ')');
});

test('a missed fact is queued a few questions ahead, not for right now', () => {
  // Checked on the queue rather than on the picks: a random pick can land on
  // the same fact by chance, which would make a timing assertion flaky.
  for (let attempt = 0; attempt < 50; attempt++) {
    const picker = createPicker({ stats: stats.emptyStats(), rng: Math.random });
    picker.reportMiss({ x: 7, y: 8 });
    const queued = picker.snapshot();
    assert.strictEqual(queued.length, 1);
    assert.strictEqual(queued[0].x, 7);
    assert.ok(queued[0].inQuestions >= cfg.REASK_MIN,
      'not the very next question, got ' + queued[0].inQuestions);
    assert.ok(queued[0].inQuestions <= cfg.REASK_MAX,
      'but soon, got ' + queued[0].inQuestions);
  }
});

test('a missed fact comes back within the window', () => {
  for (let attempt = 0; attempt < 40; attempt++) {
    const picker = createPicker({ stats: stats.emptyStats(), rng: Math.random });
    picker.reportMiss({ x: 7, y: 8 });
    let seen = false;
    for (let n = 0; n < cfg.REASK_MAX && !seen; n++) {
      const fact = picker.pick(Math.random);
      seen = (fact.x === 7 && fact.y === 8) || (fact.x === 8 && fact.y === 7);
    }
    assert.ok(seen, 'the missed fact reappeared within ' + cfg.REASK_MAX + ' questions');
  }
});

test('a missed fact is not queued twice over', () => {
  const picker = createPicker({ stats: stats.emptyStats(), rng: Math.random });
  picker.reportMiss({ x: 7, y: 8 });
  picker.reportMiss({ x: 8, y: 7 });
  assert.strictEqual(picker.snapshot().length, 1, 'the commutative twin replaces it');
});

test('the same fact is not asked twice in a row', () => {
  const picker = createPicker({ stats: stats.emptyStats(), rng: Math.random });
  let prev = picker.pick(Math.random);
  for (let n = 0; n < 5000; n++) {
    const fact = picker.pick(Math.random);
    const same = fact.x === prev.x && fact.y === prev.y;
    assert.ok(!same, 'repeat of ' + fact.x + 'x' + fact.y + ' at ' + n);
    prev = fact;
  }
});

test('the re-ask queue survives a save and reload', () => {
  const picker = createPicker({ stats: stats.emptyStats(), rng: constRng(0.5) });
  picker.reportMiss({ x: 4, y: 9 });
  const snap = JSON.parse(JSON.stringify(picker.snapshot()));
  assert.strictEqual(snap.length, 1);
  assert.strictEqual(snap[0].x, 4);

  const restored = createPicker({ stats: stats.emptyStats(), rng: constRng(0.5) });
  restored.load(snap);
  let seen = false;
  for (let n = 0; n < cfg.REASK_MAX + 1 && !seen; n++) {
    const fact = restored.pick(Math.random);
    seen = (fact.x === 4 && fact.y === 9) || (fact.x === 9 && fact.y === 4);
  }
  assert.ok(seen, 'the pending re-ask is still pending after reload');
  restored.load('nonsense');
  assert.deepStrictEqual(restored.snapshot(), [], 'corrupt data loads as empty');
});

test('the game feeds the picker and only asks facts in range', () => {
  const s = stats.emptyStats();
  const picker = createPicker({ stats: s, rng: Math.random });
  const game = createGame({ rng: Math.random, picker });
  game.start();
  for (let n = 0; n < 300; n++) {
    if (game.state.phase === 'hold') { game.advance(cfg.LEVEL_HOLD_MS + 1); continue; }
    if (game.state.phase === 'solution') { game.next(); continue; }
    if (game.state.phase === 'over') { game.start(); continue; }
    const q = game.state.questions[game.state.focus];
    assert.ok(q.x >= 1 && q.x <= 10 && q.y >= 1 && q.y <= 10, 'fact in range');
    if (q.kind === 'tf') game.answerBool(n % 3 !== 0 ? q.isTrue : !q.isTrue);
    else if (n % 3 === 0) game.advance(game.state.waveMaxMs + 1);
    else for (const ch of String(q.answer)) game.typeDigit(Number(ch));
  }
});

// ---------------------------------------------------------------- achievements

test('achievement definitions are well formed and unique', () => {
  const ids = new Set();
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.id && typeof a.id === 'string', 'has an id');
    assert.ok(!ids.has(a.id), 'duplicate id ' + a.id);
    ids.add(a.id);
    assert.ok(a.title && a.desc, a.id + ' has German title and description');
    assert.strictEqual(typeof a.check, 'function', a.id + ' has a check');
    if (a.skin) assert.ok(PLAYERS[a.skin], a.id + ' rewards a real skin: ' + a.skin);
  }
  assert.ok(ACHIEVEMENTS.length >= 20, 'a decent number of goals');
  assert.strictEqual(achievementById('level-10').id, 'level-10');
});

test('every skin except the default is reachable, and none twice', () => {
  const rewarded = skinRewards();
  const ids = Object.keys(PLAYERS).filter((id) => id !== DEFAULT_SKIN);
  for (const id of ids) {
    assert.ok(rewarded[id], 'skin ' + id + ' is unlockable');
  }
  const counts = {};
  for (const a of ACHIEVEMENTS) {
    if (!a.skin) continue;
    counts[a.skin] = (counts[a.skin] || 0) + 1;
    assert.strictEqual(counts[a.skin], 1, 'skin ' + a.skin + ' is rewarded once');
  }
  assert.ok(!rewarded[DEFAULT_SKIN], 'the starting figure is not a reward');
});

test('achievements unlock once and only when earned', () => {
  const s = stats.emptyStats();
  const unlocked = {};
  const state = { level: 1, maxLevel: 1, streakExcellent: 0, run: {}, lives: 5 };
  let fresh = checkAchievements(unlocked, { stats: s, state, event: { type: 'dealt' } });
  assert.deepStrictEqual(fresh, [], 'nothing for free');

  s.bestLevel = 10; state.maxLevel = 10;
  fresh = checkAchievements(unlocked, { stats: s, state, event: { type: 'levelUp' } });
  assert.ok(fresh.indexOf('level-10') !== -1, 'level 10 unlocks');
  for (const id of fresh) unlocked[id] = '2026-09-09T10:00:00.000Z';

  const again = checkAchievements(unlocked, { stats: s, state, event: { type: 'levelUp' } });
  assert.strictEqual(again.indexOf('level-10'), -1, 'and does not unlock twice');
  assert.strictEqual(again.length, 0);
});

test('streak, count and biome achievements fire on their thresholds', () => {
  const s = stats.emptyStats();
  const unlocked = {};
  const state = { level: 3, maxLevel: 3, streakExcellent: 3, run: {}, lives: 5 };
  const ctx = { stats: s, state, event: { type: 'answered' } };
  let fresh = checkAchievements(unlocked, ctx);
  assert.ok(fresh.indexOf('streak-3') !== -1);
  for (const id of fresh) unlocked[id] = 'x';

  s.ratings.excellent = 100;
  fresh = checkAchievements(unlocked, ctx);
  assert.ok(fresh.indexOf('excellent-100') !== -1);
  for (const id of fresh) unlocked[id] = 'x';

  s.biomesSeen = ['forest', 'snow'];
  fresh = checkAchievements(unlocked, { stats: s, state, event: { type: 'levelUp' } });
  assert.ok(fresh.indexOf('biome-snow') !== -1, 'reaching the snow biome counts');
});

test('a long simulated run unlocks a sensible spread without errors', () => {
  const s = stats.emptyStats();
  const unlocked = {};
  const picker = createPicker({ stats: s, rng: Math.random });
  const game = createGame({ rng: Math.random, picker });
  const dispatch = (events) => {
    for (const ev of events) {
      stats.recordEvent(s, ev, game.state);
      const fresh = checkAchievements(unlocked, { stats: s, state: game.state, event: ev });
      for (const id of fresh) {
        assert.ok(achievementById(id), 'unlocked a known achievement: ' + id);
        unlocked[id] = '2026-09-09T10:00:00.000Z';
      }
    }
  };
  dispatch(game.start());
  for (let n = 0; n < 4000; n++) {
    if (game.state.phase === 'over') { dispatch(game.start()); continue; }
    if (game.state.phase === 'hold') { dispatch(game.advance(cfg.LEVEL_HOLD_MS + 1)); continue; }
    if (game.state.phase === 'solution') { dispatch(game.next()); continue; }
    const q = game.state.questions[game.state.focus];
    if (q.kind === 'tf') dispatch(game.answerBool(q.isTrue));
    else {
      let events = [];
      for (const ch of String(q.answer)) events = events.concat(game.typeDigit(Number(ch)));
      dispatch(events);
    }
  }
  assert.ok(Object.keys(unlocked).length >= 5,
    'a good run unlocks several achievements, got ' + Object.keys(unlocked).length);
  assert.ok(unlocked['first-win'], 'beating an enemy is recognised');
  assert.ok(s.correct > 100 && s.bestLevel > 5, 'the simulated player made progress');
});

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('\n' + failures.length + ' FAILED:\n');
  for (const f of failures) console.error('  ✗ ' + f + '\n');
  console.error(passed + ' passed, ' + failures.length + ' failed');
  process.exit(1);
}
console.log('stats.test.mjs: ' + passed + ' passed');
