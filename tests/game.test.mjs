// Run with:  node tests/game.test.mjs
import assert from 'assert';
import * as cfg from '../js/config.js';
import { createGame } from '../js/game.js';
import { biomeFor, backgroundFor, isBiomeStart, enemyKindsFor, allBackgrounds, BIOMES, BIOME_LENGTH, TOUR_LENGTH } from '../js/biomes.js';
import { ENEMIES } from '../assets/sprites/manifest.js';

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (err) { failures.push(name + '\n    ' + err.message); }
}

// A deterministic rng: replays the given values, then cycles.
const seq = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};
const constRng = (v) => () => v;

// Drives the game until the wave hold expires and a new wave is dealt, and
// returns the events that produced (the level up lands here, not on the hit).
const flushHold = (game) => {
  let events = [];
  let guard = 0;
  while (game.state.phase === 'hold' && guard++ < 10) {
    events = events.concat(game.advance(cfg.LEVEL_HOLD_MS + 10));
  }
  return events;
};

// ---------------------------------------------------------------- config

test('timer starts at 30s and never drops below the 10s floor', () => {
  assert.strictEqual(cfg.timerMs(1), 30000);
  assert.strictEqual(cfg.timerMs(2), 29200);
  assert.strictEqual(cfg.timerMs(26), 10000);
  for (let l = 1; l <= 200; l++) assert.ok(cfg.timerMs(l) >= cfg.TIMER_MIN_MS);
});

test('rating bands stay ordered and reachable at every level', () => {
  for (let l = 1; l <= 100; l++) {
    for (const kind of ['fill', 'tf']) {
      const bands = cfg.ratingBands(l, kind);
      assert.ok(bands[0].maxMs < bands[1].maxMs, 'excellent < perfect at ' + l);
      assert.ok(bands[1].maxMs < bands[2].maxMs, 'perfect < good at ' + l);
      assert.ok(bands[2].maxMs <= cfg.waveMs(l, 1) || l >= 26, 'good reachable at ' + l);
    }
  }
});

test('true/false bands are tighter than fill bands', () => {
  assert.ok(cfg.ratingBands(1, 'tf')[0].maxMs < cfg.ratingBands(1, 'fill')[0].maxMs);
  assert.strictEqual(cfg.rate(1, 2900, 'fill').id, 'excellent');
  assert.strictEqual(cfg.rate(1, 2900, 'tf').id, 'perfect');
});

test('holding two formulas widens the rating limits for the first answered', () => {
  const solo = cfg.ratingBands(15, 'fill', 1);
  const pair = cfg.ratingBands(15, 'fill', 2);
  for (let i = 0; i < solo.length; i++) {
    assert.ok(pair[i].maxMs > solo[i].maxMs, pair[i].id + ' is more generous with two open');
  }
  assert.strictEqual(cfg.rate(15, 8000, 'fill', 1).id, 'slow', 'harsh when only one is open');
  assert.strictEqual(cfg.rate(15, 8000, 'fill', 2).id, 'good', 'fair while both are open');
  assert.deepStrictEqual(cfg.ratingBands(15, 'fill'), solo, 'one open is the default');
});

test('the first card of a pair is not charged for reading the second', () => {
  const game = createGame({ rng: constRng(0.5) });
  game.setLevel(15);
  // Eight seconds to take in both formulas and answer the first.
  game.advance(8000);
  const first = solve(game).find((e) => e.type === 'answered');
  assert.strictEqual(first.rating.id, 'good');
  assert.ok(first.damage > 0, 'the first enemy takes damage too');
  const second = solve(game).find((e) => e.type === 'answered');
  assert.strictEqual(second.rating.id, 'excellent', 'the second is rated on its own clock');
  assert.ok(game.state.enemies.every((e) => e.hp < e.maxHp), 'both enemies were hit');
});

test('rate maps think time to damage', () => {
  assert.strictEqual(cfg.rate(1, 500).damage, 3);
  assert.strictEqual(cfg.rate(1, 5000).damage, 2);
  assert.strictEqual(cfg.rate(1, 10000).damage, 1);
  assert.strictEqual(cfg.rate(1, 25000).damage, 0);
  assert.strictEqual(cfg.rate(1, 25000).id, 'slow');
});

test('enemy count and hp follow the level rules', () => {
  assert.strictEqual(cfg.enemyCount(1), 1);
  assert.strictEqual(cfg.enemyCount(cfg.TWO_ENEMIES_FROM_LEVEL - 1), 1);
  for (let l = 1; l <= 200; l++) {
    const solo = cfg.enemyCount(l) === 1;
    if (cfg.isBossLevel(l)) assert.ok(solo, 'boss levels are single enemies, level ' + l);
    else if (l >= cfg.TWO_ENEMIES_FROM_LEVEL) {
      assert.strictEqual(cfg.enemyCount(l), 2, 'two enemies from level '
        + cfg.TWO_ENEMIES_FROM_LEVEL + ', level ' + l);
    }
    assert.ok(cfg.enemyHp(l, cfg.enemyCount(l)) >= 1);
    assert.ok(cfg.enemyHp(l, 1) <= cfg.HP_MAX * cfg.BOSS_HP_FACTOR + 1);
  }
  assert.strictEqual(cfg.enemyHp(1, 1), 3);
  // a boss carries more than one of a pair on the level just before it
  const boss = cfg.BOSS_EVERY * 3;
  assert.ok(cfg.enemyHp(boss, 1) > cfg.enemyHp(boss - 1, 2),
    'boss is tougher than one of a pair');
});

test('every region ends on its own boss level', () => {
  assert.strictEqual(cfg.BOSS_EVERY, BIOME_LENGTH,
    'the boss rule and the region length are the same number');
  for (let i = 0; i < BIOMES.length * 3; i++) {
    const last = (i + 1) * BIOME_LENGTH;
    assert.ok(cfg.isBossLevel(last), 'level ' + last + ' closes a region and is a boss');
    assert.ok(!cfg.isBossLevel(last - 1), 'level ' + (last - 1) + ' is not');
  }
});

test('wave time scales for two questions', () => {
  assert.strictEqual(cfg.waveMs(1, 1), 30000);
  assert.strictEqual(cfg.waveMs(1, 2), 52500);
});

// ---------------------------------------------------------------- biomes

test('the first lap is the fixed tour, BIOME_LENGTH levels each', () => {
  assert.strictEqual(TOUR_LENGTH, BIOMES.length * BIOME_LENGTH);
  for (let i = 0; i < BIOMES.length; i++) {
    const first = i * BIOME_LENGTH + 1;
    for (let l = first; l < first + BIOME_LENGTH; l++) {
      assert.strictEqual(biomeFor(l).id, BIOMES[i].id, 'level ' + l);
    }
  }
  assert.ok(isBiomeStart(1) && isBiomeStart(BIOME_LENGTH + 1));
  assert.ok(!isBiomeStart(2) && !isBiomeStart(BIOME_LENGTH));
});

test('past the tour each lap is every zone again, shuffled', () => {
  const zonesOfLap = (lap) => {
    const out = [];
    for (let i = 0; i < BIOMES.length; i++) {
      out.push(biomeFor((lap * BIOMES.length + i) * BIOME_LENGTH + 1).id);
    }
    return out;
  };
  const tour = zonesOfLap(0);
  assert.deepStrictEqual(tour, BIOMES.map((b) => b.id), 'lap 0 is the tour in order');

  let differsFromTour = 0;
  for (let lap = 1; lap <= 8; lap++) {
    const zones = zonesOfLap(lap);
    assert.strictEqual(new Set(zones).size, BIOMES.length,
      'lap ' + lap + ' visits every zone exactly once');
    if (zones.join() !== tour.join()) differsFromTour++;
  }
  assert.strictEqual(differsFromTour, 8, 'and never simply replays the tour');
});

test('a zone never follows itself, tour and laps alike', () => {
  let prev = null;
  for (let block = 0; block < 400; block++) {
    const id = biomeFor(block * BIOME_LENGTH + 1).id;
    assert.notStrictEqual(id, prev, 'repeat at block ' + block);
    prev = id;
  }
});

test('the zone for a level never changes between calls', () => {
  // The header, the background and the enemies all ask separately, and a saved
  // run asks again after a reload — they have to agree.
  for (const level of [5, 111, 250, 700, 1234, 4321]) {
    const first = biomeFor(level).id;
    for (let n = 0; n < 20; n++) assert.strictEqual(biomeFor(level).id, first, 'level ' + level);
    assert.strictEqual(backgroundFor(level), backgroundFor(level));
  }
});

test('every zone comes up equally often over many laps', () => {
  const counts = {};
  const laps = 20;
  for (let block = 0; block < laps * BIOMES.length; block++) {
    const id = biomeFor(block * BIOME_LENGTH + 1).id;
    counts[id] = (counts[id] || 0) + 1;
  }
  for (const b of BIOMES) {
    assert.strictEqual(counts[b.id], laps, b.id + ' appears once per lap');
  }
});

test('enemies stay in their own zone, even past the tour', () => {
  for (const level of [15, 115, 335, 777, 2222]) {
    const biome = biomeFor(level);
    for (let n = 0; n < 60; n++) {
      for (const kind of enemyKindsFor(level, 2, Math.random)) {
        assert.ok(biome.enemies.indexOf(kind) !== -1,
          kind + ' does not belong in ' + biome.id + ' at level ' + level);
      }
    }
  }
  // the dragon is the volcano boss and must not turn up anywhere else
  for (let level = 1; level <= 600; level++) {
    if (level % 10 !== 0) continue;
    const kinds = enemyKindsFor(level, 1, Math.random);
    if (kinds.indexOf('dragon') !== -1) {
      assert.strictEqual(biomeFor(level).id, 'volcano', 'dragon at level ' + level);
    }
  }
});

test('backgrounds differ between halves and use the arena on boss levels', () => {
  assert.notStrictEqual(backgroundFor(1), backgroundFor(BIOME_LENGTH - 1),
    'the scenery changes partway through a region');
  for (let i = 1; i <= BIOMES.length * 2; i++) {
    const boss = i * BIOME_LENGTH;
    assert.strictEqual(backgroundFor(boss), biomeFor(boss).bossBg, 'arena at level ' + boss);
  }
  for (let l = 1; l <= 400; l++) assert.ok(/^bg\/[a-z0-9-]+\.webp$/.test(backgroundFor(l)));
});

test('every biome enemy and boss id exists in the sprite manifest', () => {
  for (const biome of BIOMES) {
    for (const id of biome.enemies.concat(biome.bosses)) {
      assert.ok(ENEMIES[id], 'missing sprite for ' + id + ' (' + biome.id + ')');
    }
  }
});

test('boss levels draw a boss, normal levels draw from the biome pool', () => {
  const rng = constRng(0.5);
  const boss = BIOME_LENGTH;
  assert.deepStrictEqual(enemyKindsFor(boss, 1, rng), biomeFor(boss).bosses.slice(0, 1));
  const level = cfg.TWO_ENEMIES_FROM_LEVEL + (cfg.isBossLevel(cfg.TWO_ENEMIES_FROM_LEVEL) ? 1 : 0);
  const pair = enemyKindsFor(level, 2, seq([0.1, 0.1]));
  assert.strictEqual(pair.length, 2);
  assert.notStrictEqual(pair[0], pair[1], 'two enemies should differ');
  for (const kind of pair) assert.ok(biomeFor(level).enemies.indexOf(kind) !== -1);
});

// ---------------------------------------------------------------- questions

test('below level 10 only the result is missing', () => {
  const game = createGame({ rng: seq([0.9, 0.31, 0.71, 0.05]) });
  for (let i = 0; i < 40; i++) {
    game.start();
    assert.strictEqual(game.state.questions[0].missing, 'z');
    assert.strictEqual(game.state.questions[0].kind, 'fill');
  }
});

test('from level 10 x and y can be missing too', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const game = createGame({ rng: Math.random });
    game.setLevel(12);
    const q = game.state.questions[0];
    if (q.kind === 'fill') seen.add(q.missing);
  }
  assert.ok(seen.has('z') && seen.has('x') && seen.has('y'),
    'expected all three missing slots, saw ' + Array.from(seen).join(','));
});

test('the answer matches the missing operand and its digit count', () => {
  for (let i = 0; i < 300; i++) {
    const game = createGame({ rng: Math.random });
    game.setLevel(12);
    const q = game.state.questions[0];
    if (q.kind !== 'fill') continue;
    assert.strictEqual(q.x * q.y, q.z);
    const expected = q.missing === 'z' ? q.z : (q.missing === 'x' ? q.x : q.y);
    assert.strictEqual(q.answer, expected);
    assert.strictEqual(q.digits, String(expected).length);
  }
});

test('with the missing-factor option off only the result is ever missing', () => {
  for (let i = 0; i < 200; i++) {
    const game = createGame({ rng: Math.random, allowMissingFactor: false });
    game.setLevel(12 + (i % 30));
    for (const q of game.state.questions) {
      if (q.kind === 'fill') assert.strictEqual(q.missing, 'z', 'no factor is hidden');
    }
  }
});

test('the missing-factor option can be switched during a run', () => {
  const game = createGame({ rng: Math.random, allowMissingFactor: false });
  game.setLevel(20);
  assert.strictEqual(game.state.questions[0].kind === 'fill'
    ? game.state.questions[0].missing : 'z', 'z');
  game.setAllowMissingFactor(true);
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    game.setLevel(20);
    const q = game.state.questions[0];
    if (q.kind === 'fill') seen.add(q.missing);
  }
  assert.ok(seen.has('x') || seen.has('y'), 'factors are hidden again once it is on');
  game.setAllowMissingFactor(false);
  for (let i = 0; i < 200; i++) {
    game.setLevel(20);
    const q = game.state.questions[0];
    if (q.kind === 'fill') assert.strictEqual(q.missing, 'z', 'and hidden no more once it is off');
  }
});

test('true/false cards appear from level 5 and their shown value is consistent', () => {
  let tfSeen = 0;
  for (let i = 0; i < 400; i++) {
    const game = createGame({ rng: Math.random });
    game.setLevel(6);
    const q = game.state.questions[0];
    if (q.kind !== 'tf') continue;
    tfSeen++;
    assert.strictEqual(q.isTrue, q.shown === q.z);
    assert.ok(q.shown >= 1 && q.shown <= 100, 'shown value in range: ' + q.shown);
  }
  assert.ok(tfSeen > 20, 'expected a good number of true/false cards, got ' + tfSeen);
  const early = createGame({ rng: constRng(0.01) });
  early.start();
  assert.strictEqual(early.state.questions[0].kind, 'fill', 'no tf below level 5');
});

// ---------------------------------------------------------------- input

test('answer auto-submits once the digit count is reached', () => {
  const game = createGame({ rng: constRng(0.5) });
  game.start();
  const q = game.state.questions[0];
  const digits = String(q.answer).split('');
  for (let i = 0; i < digits.length - 1; i++) {
    const events = game.typeDigit(Number(digits[i]));
    assert.ok(events.every((e) => e.type === 'typed'), 'no resolve before the last digit');
  }
  const last = game.typeDigit(Number(digits[digits.length - 1]));
  const answered = last.find((e) => e.type === 'answered');
  assert.ok(answered && answered.correct, 'the full correct answer resolves as correct');
});

test('a leading zero is rejected without consuming a life', () => {
  const game = createGame({ rng: constRng(0.5) });
  game.start();
  const events = game.typeDigit(0);
  assert.strictEqual(events[0].type, 'rejected');
  assert.strictEqual(game.state.questions[0].typed, '');
  assert.strictEqual(game.state.lives, cfg.LIVES);
});

test('backspace removes the last digit only', () => {
  const game = createGame({ rng: Math.random });
  let guard = 0;
  while ((game.state.questions.length === 0
      || game.state.questions[0].kind !== 'fill'
      || game.state.questions[0].digits < 2) && guard++ < 500) {
    game.setLevel(12);
  }
  assert.ok(guard < 500, 'found a two-digit fill question');
  game.typeDigit(1);
  assert.strictEqual(game.state.questions[0].typed, '1');
  game.backspace();
  assert.strictEqual(game.state.questions[0].typed, '');
  assert.strictEqual(game.backspace().length, 0, 'backspace on empty does nothing');
});

test('submit commits a short answer and counts it wrong', () => {
  const game = createGame({ rng: Math.random });
  let guard = 0;
  do { game.setLevel(12); guard++; }
  while ((game.state.questions[0].kind !== 'fill' || game.state.questions[0].digits !== 2) && guard < 500);
  game.typeDigit(1);
  const events = game.submit();
  const answered = events.find((e) => e.type === 'answered');
  assert.ok(answered && !answered.correct);
  assert.strictEqual(game.state.lives, cfg.LIVES - 1);
  assert.strictEqual(game.state.phase, 'solution');
});

test('true/false is answered with answerBool and ignores digits', () => {
  const game = createGame({ rng: Math.random });
  let guard = 0;
  do { game.setLevel(6); guard++; } while (game.state.questions[0].kind !== 'tf' && guard < 500);
  const q = game.state.questions[0];
  assert.strictEqual(game.typeDigit(4).length, 0, 'digits do nothing on a tf card');
  const events = game.answerBool(q.isTrue);
  const answered = events.find((e) => e.type === 'answered');
  assert.ok(answered.correct, 'answering with the truth is correct');
});

// ---------------------------------------------------------------- combat

// Types the whole correct answer, digit by digit.
function solve(game) {
  const q = game.state.questions[game.state.focus];
  if (q.kind === 'tf') return game.answerBool(q.isTrue);
  let events = [];
  for (const ch of String(q.answer)) events = events.concat(game.typeDigit(Number(ch)));
  return events;
}

// Gives a wrong answer with the same number of digits, so it auto-submits.
function fail(game) {
  const q = game.state.questions[game.state.focus];
  if (q.kind === 'tf') return game.answerBool(!q.isTrue);
  let wrong = q.answer + 1;
  if (String(wrong).length !== q.digits) wrong = q.answer - 1;
  let events = [];
  for (const ch of String(wrong)) events = events.concat(game.typeDigit(Number(ch)));
  return events;
}

test('a fast correct answer deals 3 damage, a slow one deals none', () => {
  const game = createGame({ rng: constRng(0.5) });
  game.start();
  const before = game.state.enemies[0].hp;
  const events = solve(game);
  const hit = events.find((e) => e.type === 'enemyHit');
  assert.strictEqual(hit.damage, 3);
  assert.strictEqual(hit.hp, before - 3);

  const slowGame = createGame({ rng: constRng(0.5) });
  slowGame.start();
  slowGame.advance(20000);
  const hpBefore = slowGame.state.enemies[0].hp;
  const slowEvents = solve(slowGame);
  const answered = slowEvents.find((e) => e.type === 'answered');
  assert.ok(answered.correct, 'still correct');
  assert.strictEqual(answered.rating.id, 'slow');
  assert.strictEqual(slowGame.state.enemies[0].hp, hpBefore, 'slow deals no damage');
  assert.strictEqual(slowGame.state.lives, cfg.LIVES, 'slow costs no life');
});

test('defeating the enemy raises the level and spawns a tougher one', () => {
  const game = createGame({ rng: constRng(0.5) });
  game.start();
  let levelUp = null;
  let guard = 0;
  while (!levelUp && guard++ < 20) {
    solve(game);
    if (game.state.phase !== 'hold') continue;
    assert.ok(game.state.enemies.every((e) => !e.alive) === game.state.pendingLevelUp,
      'the beaten enemy stays in state while the hold runs');
    levelUp = flushHold(game).find((e) => e.type === 'levelUp');
  }
  assert.ok(levelUp, 'enemy dies within a few hits');
  assert.strictEqual(game.state.level, 2);
  assert.strictEqual(game.state.phase, 'running');
  assert.strictEqual(game.state.enemies.length, 1);
  assert.ok(game.state.enemies[0].alive);
  assert.strictEqual(game.state.questions.length, 1);
});

test('a wrong answer costs a life and shows the solution', () => {
  const game = createGame({ rng: constRng(0.5) });
  game.start();
  const q = game.state.questions[0];
  const events = fail(game);
  assert.strictEqual(game.state.lives, cfg.LIVES - 1);
  assert.strictEqual(game.state.phase, 'solution');
  const shown = events.find((e) => e.type === 'showSolution');
  assert.strictEqual(shown.solution.cause, 'wrong');
  assert.strictEqual(shown.solution.facts[0].z, q.z);
  assert.ok(game.state.questions[0].done, 'the question it was given on is settled');

  const nextEvents = game.next();
  assert.ok(nextEvents.find((e) => e.type === 'dealt'), 'the only question was settled, so a new wave comes');
  assert.strictEqual(game.state.phase, 'running');
  assert.strictEqual(game.state.waveMs, game.state.waveMaxMs, 'the timer restarts');
});

test('the timer freezes while the solution card is up', () => {
  const game = createGame({ rng: constRng(0.5) });
  game.start();
  fail(game);
  assert.strictEqual(game.state.phase, 'solution');
  const events = game.advance(60000);
  assert.strictEqual(events.length, 0, 'time does not pass on the solution card');
  assert.strictEqual(game.state.lives, cfg.LIVES - 1, 'and it cannot time out again');
});

test('running out of time costs a life and explains the answer', () => {
  const game = createGame({ rng: constRng(0.5) });
  game.start();
  const q = game.state.questions[0];
  const events = game.advance(game.state.waveMaxMs + 1);
  assert.ok(events.find((e) => e.type === 'timeout'));
  assert.strictEqual(game.state.lives, cfg.LIVES - 1);
  assert.strictEqual(game.state.run.timeouts, 1);
  const shown = events.find((e) => e.type === 'showSolution');
  assert.strictEqual(shown.solution.cause, 'timeout');
  assert.strictEqual(shown.solution.facts[0].z, q.z);
});

test('a wrong answer on one of two cards leaves the other answerable', () => {
  const game = createGame({ rng: constRng(0.5) });
  game.setLevel(15);
  assert.strictEqual(game.state.questions.length, 2);
  const other = game.state.questions[1];
  const enemyHpBefore = game.state.enemies[1].hp;

  fail(game);
  assert.strictEqual(game.state.phase, 'solution');
  assert.strictEqual(game.state.lives, cfg.LIVES - 1);
  assert.ok(game.state.questions[0].done, 'the card that was wrong is settled');
  assert.ok(!game.state.questions[1].done, 'the other card is untouched');
  assert.strictEqual(game.state.questions[1], other, 'and it is the very same question');

  const events = game.next();
  assert.ok(!events.find((e) => e.type === 'dealt'), 'no fresh wave is dealt');
  assert.ok(events.find((e) => e.type === 'waveResumed'));
  assert.strictEqual(game.state.phase, 'running');
  assert.strictEqual(game.state.focus, 1, 'focus moves to the open card');
  assert.strictEqual(game.state.questions[1], other);

  solve(game);
  const hit = game.state.enemies[1].hp;
  assert.ok(hit < enemyHpBefore, 'answering it still damages its enemy');
  assert.strictEqual(game.state.phase, 'hold', 'and now the wave is over');
});

test('the wave clock keeps its remaining time across a solution', () => {
  const game = createGame({ rng: constRng(0.5) });
  game.setLevel(15);
  game.advance(5000);
  const left = game.state.waveMs;
  fail(game);
  assert.strictEqual(game.advance(9000).length, 0, 'frozen while the solution is up');
  assert.strictEqual(game.state.waveMs, left, 'no time is lost reading it');
  game.next();
  assert.strictEqual(game.state.waveMs, left, 'and the wave carries on with what was left');
  assert.ok(game.state.waveMs < game.state.waveMaxMs);
});

test('a timeout forfeits every open card on the wave', () => {
  const game = createGame({ rng: constRng(0.5) });
  game.setLevel(15);
  game.advance(game.state.waveMaxMs + 1);
  assert.strictEqual(game.state.phase, 'solution');
  assert.ok(game.state.questions.every((q) => q.done), 'nothing is left to answer');
  const events = game.next();
  assert.ok(events.find((e) => e.type === 'dealt'), 'so Weiter deals a fresh wave');
  assert.strictEqual(game.state.waveMs, game.state.waveMaxMs);
});

test('losing every life ends the game', () => {
  const game = createGame({ rng: constRng(0.5) });
  game.start();
  for (let i = 0; i < cfg.LIVES; i++) {
    assert.strictEqual(game.state.phase, 'running');
    fail(game);
    if (game.state.phase === 'solution') game.next();
  }
  assert.strictEqual(game.state.phase, 'over');
  assert.strictEqual(game.state.lives, 0);
  assert.strictEqual(game.state.questions.length, 0);
  assert.strictEqual(game.advance(5000).length, 0, 'a finished game does not tick');
});

// ---------------------------------------------------------------- two enemies

test('level 15 deals two questions with one shared timer', () => {
  const game = createGame({ rng: constRng(0.5) });
  game.setLevel(15);
  assert.strictEqual(game.state.enemies.length, 2);
  assert.strictEqual(game.state.questions.length, 2);
  assert.strictEqual(game.state.focus, 0);
  assert.strictEqual(game.state.waveMaxMs, cfg.waveMs(15, 2));
  assert.ok(game.state.waveMaxMs > cfg.waveMs(15, 1));
});

test('think time only accrues on the focused card', () => {
  const game = createGame({ rng: constRng(0.5) });
  game.setLevel(15);
  game.advance(3000);
  assert.strictEqual(game.state.questions[0].thinkMs, 3000);
  assert.strictEqual(game.state.questions[1].thinkMs, 0);
  game.focusQuestion(1);
  game.advance(2000);
  assert.strictEqual(game.state.questions[0].thinkMs, 3000, 'unfocused card is not penalised');
  assert.strictEqual(game.state.questions[1].thinkMs, 2000);
});

test('solving the first card moves focus to the second', () => {
  const game = createGame({ rng: constRng(0.5) });
  game.setLevel(15);
  const events = solve(game);
  const focus = events.find((e) => e.type === 'focus');
  assert.ok(focus, 'focus event emitted');
  assert.strictEqual(game.state.focus, 1);
  assert.strictEqual(game.state.phase, 'running', 'the wave continues');
  assert.ok(game.state.questions[0].done && !game.state.questions[1].done);
});

test('a dead enemy drops out and later waves are single questions', () => {
  const game = createGame({ rng: constRng(0.5) });
  game.setLevel(15);
  const hp = game.state.enemies[0].maxHp;
  let guard = 0;
  // Hit the first enemy hard and stall on the second one, so the first falls first.
  while (game.state.enemies[0].alive && guard++ < 20) {
    if (game.state.phase === 'hold') { flushHold(game); continue; }
    if (game.state.phase !== 'running') break;
    const idx = game.state.questions.findIndex((q) => q.enemy === 0 && !q.done);
    if (idx !== -1) { game.focusQuestion(idx); solve(game); }
    const other = game.state.questions.findIndex((q) => !q.done);
    if (other !== -1) {
      game.focusQuestion(other);
      game.advance(9000);          // slow on purpose: correct, but no damage
      solve(game);
    }
  }
  assert.ok(!game.state.enemies[0].alive, 'first enemy defeated');
  assert.ok(game.state.enemies[1].alive, 'second still standing');
  assert.strictEqual(game.state.enemies[1].hp, hp, 'slow answers dealt it no damage');
  assert.strictEqual(game.state.level, 15, 'the level is not cleared yet');
  if (game.state.phase === 'hold') flushHold(game);
  assert.strictEqual(game.state.questions.length, 1, 'only the living enemy asks');
  assert.strictEqual(game.state.questions[0].enemy, 1);
  assert.strictEqual(game.state.waveMaxMs, cfg.waveMs(15, 1), 'and it gets a single-question timer');
});

test('clearing both enemies levels up and flags the double duel', () => {
  const game = createGame({ rng: constRng(0.5) });
  game.setLevel(15);
  let levelUp = null;
  let guard = 0;
  while (!levelUp && guard++ < 60) {
    if (game.state.phase === 'hold') {
      levelUp = flushHold(game).find((e) => e.type === 'levelUp');
      continue;
    }
    if (game.state.phase !== 'running') break;
    solve(game);
  }
  assert.ok(levelUp, 'both enemies fall');
  assert.strictEqual(game.state.level, 16);
  assert.ok(game.state.run.clearedTwoEnemyLevel);
});

// ---------------------------------------------------------------- pause / save

test('pause hides the formulas and resume deals new ones', () => {
  const game = createGame({ rng: Math.random });
  game.start();
  const before = game.state.questions[0];
  game.advance(4000);
  game.pause();
  assert.strictEqual(game.state.phase, 'paused');
  assert.strictEqual(game.state.questions.length, 0);
  assert.strictEqual(game.advance(9999).length, 0, 'a paused game does not tick');

  const events = game.resume();
  assert.ok(events.find((e) => e.type === 'dealt'));
  assert.strictEqual(game.state.questions.length, 1);
  assert.strictEqual(game.state.waveMs, game.state.waveMaxMs, 'full time after resuming');
  assert.strictEqual(game.state.questions[0].thinkMs, 0, 'and a fresh think clock');
  assert.notStrictEqual(game.state.questions[0], before);
});

test('pause works from the solution card too', () => {
  const game = createGame({ rng: constRng(0.5) });
  game.start();
  fail(game);
  assert.strictEqual(game.state.phase, 'solution');
  game.pause();
  assert.strictEqual(game.state.phase, 'paused');
  assert.strictEqual(game.state.solution, null);
});

test('a snapshot carries the run but never the live question', () => {
  const game = createGame({ rng: constRng(0.5) });
  game.setLevel(17);
  game.advance(1500);
  const snap = game.snapshot();
  assert.strictEqual(snap.questions, undefined);
  assert.strictEqual(snap.waveMs, undefined);
  assert.strictEqual(snap.level, 17);
  assert.strictEqual(snap.enemies.length, 2);
  assert.strictEqual(JSON.parse(JSON.stringify(snap)).level, 17, 'survives JSON');

  const restored = createGame({ rng: constRng(0.5) });
  restored.loadState(JSON.parse(JSON.stringify(snap)));
  assert.strictEqual(restored.state.level, 17);
  assert.strictEqual(restored.state.lives, snap.lives);
  assert.deepStrictEqual(
    restored.state.enemies.map((e) => e.hp), snap.enemies.map((e) => e.hp));
  assert.strictEqual(restored.state.phase, 'running');
  assert.strictEqual(restored.state.questions.length, 2, 'a fresh wave is dealt');
});

test('a snapshot whose enemies are all dead spawns a fresh set', () => {
  const game = createGame({ rng: constRng(0.5) });
  const restored = createGame({ rng: constRng(0.5) });
  game.start();
  const snap = game.snapshot();
  snap.enemies = snap.enemies.map((e) => ({ ...e, hp: 0, alive: false }));
  restored.loadState(snap);
  assert.ok(restored.state.enemies.every((e) => e.alive && e.hp > 0));
});

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('\n' + failures.length + ' FAILED:\n');
  for (const f of failures) console.error('  ✗ ' + f + '\n');
  console.error(passed + ' passed, ' + failures.length + ' failed');
  process.exit(1);
}
console.log('game.test.mjs: ' + passed + ' passed');
