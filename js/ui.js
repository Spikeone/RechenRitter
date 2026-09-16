// Everything that touches the DOM. main.js hands in a bag of callbacks and then
// only calls render functions; no game rules live here.

import { LABELS, label, LIVES, LOW_TIMER_FRAC, APP_VERSION } from './config.js';
import { biomeFor, backgroundFor } from './biomes.js';
import { createSprite, displayName } from './sprites.js';
import { PLAYERS, PLAYER_ORDER, DEFAULT_SKIN } from '../assets/sprites/manifest.js';
import { ACHIEVEMENTS, skinRewards } from './achievements.js';
import {
  FAMILIARS, FAMILIAR_COLS, FAMILIAR_ROWS, SEASON, FAMILIAR_COUNT,
  isUnlocked, ownedCount,
} from './familiars.js';
import { QUEST, progressOf, progressText, isComplete, isClaimable } from './daily.js';
import * as stats from './stats.js';

const $ = (id) => document.getElementById(id);
const MULT = '·';

const OVERLAYS = ['overlay-start', 'overlay-pause', 'overlay-gameover',
  'overlay-stats', 'overlay-achievements', 'overlay-familiars', 'overlay-settings'];

// One sheet holds every jar, so a cell is addressed the way a CSS sprite is:
// the background is blown up to the full grid and shifted to the wanted cell.
function jarPosition(el, familiar) {
  const x = FAMILIAR_COLS > 1 ? (familiar.col / (FAMILIAR_COLS - 1)) * 100 : 0;
  const y = FAMILIAR_ROWS > 1 ? (familiar.row / (FAMILIAR_ROWS - 1)) * 100 : 0;
  el.style.backgroundPosition = x + '% ' + y + '%';
}

function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return hours + ' h ' + minutes + ' min';
  if (minutes > 0) return minutes + ' min ' + seconds + ' s';
  return seconds + ' s';
}

const formatSeconds = (ms) => (ms / 1000).toFixed(1).replace('.', ',') + ' s';

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
}

export function createUi(callbacks) {
  const cb = callbacks;
  const els = {
    hudLevel: $('hud-level'),
    hudBiome: $('hud-biome'),
    lives: $('hud-lives'),
    timerBar: $('timer-bar'),
    timerFill: $('timer-fill'),
    arena: $('arena'),
    bgA: $('bg-a'),
    bgB: $('bg-b'),
    playerSlot: $('player-slot'),
    enemySlots: $('enemy-slots'),
    questions: $('questions'),
    solution: $('solution-card'),
    solutionCause: $('solution-cause'),
    solutionFormulas: $('solution-formulas'),
    solutionGiven: $('solution-given'),
    numpad: $('numpad'),
    boolpad: $('boolpad'),
    factDetail: $('fact-detail'),
    dailyCard: $('daily-card'),
    dailyTitle: $('daily-title'),
    dailyCount: $('daily-count'),
    dailyFill: $('daily-fill'),
    familiarGrid: $('familiar-grid'),
    familiarDetail: $('familiar-detail'),
    seasonLine: $('season-line'),
    loot: $('loot'),
    lootJar: $('loot-jar'),
    lootName: $('loot-name'),
    statsLock: $('stats-lock'),
    statsCode: $('stats-code'),
    statsLockMsg: $('stats-lock-msg'),
  };

  let playerSprite = null;
  let enemyNodes = [];       // { root, sprite, fill, hp }
  let cardNodes = [];
  let activeBg = 'a';
  let currentBg = '';
  let inputLocked = false;
  let currentSkin = DEFAULT_SKIN;

  // ---------------- overlays ----------------
  function showOverlay(name) {
    for (const id of OVERLAYS) {
      const el = $(id);
      if (el) el.classList.toggle('hidden', id !== name);
    }
  }
  const hideOverlays = () => showOverlay(null);
  const isOverlayOpen = () => OVERLAYS.some((id) => {
    const el = $(id);
    return el && !el.classList.contains('hidden');
  });

  // ---------------- HUD ----------------
  function renderHud(state) {
    els.hudLevel.textContent = LABELS.level + ' ' + state.level;
    els.hudBiome.textContent = biomeFor(state.level).name;
    if (els.lives.children.length !== LIVES) {
      els.lives.innerHTML = '';
      for (let i = 0; i < LIVES; i++) {
        const heart = document.createElement('div');
        heart.className = 'heart';
        els.lives.appendChild(heart);
      }
    }
    for (let i = 0; i < LIVES; i++) {
      els.lives.children[i].classList.toggle('empty', i >= state.lives);
    }
  }

  // The heart that is about to be lost, so it can shatter.
  const heartAt = (index) => els.lives.children[index] || null;

  function renderTimer(state, settings) {
    const show = !settings || settings.showTimerBar !== false;
    els.timerBar.classList.toggle('hidden', !show);
    if (!show) return;
    const frozen = state.phase === 'solution' || state.phase === 'hold';
    els.timerBar.classList.toggle('frozen', frozen);
    const ratio = state.waveMaxMs > 0 ? Math.max(0, state.waveMs / state.waveMaxMs) : 1;
    els.timerFill.style.transform = 'scaleX(' + ratio + ')';
    els.timerBar.classList.toggle('low', ratio <= LOW_TIMER_FRAC && !frozen);
  }

  // ---------------- arena ----------------
  function renderBackground(level, immediate) {
    const file = 'assets/' + backgroundFor(level);
    if (file === currentBg) return;
    currentBg = file;
    const incoming = activeBg === 'a' ? els.bgB : els.bgA;
    const outgoing = activeBg === 'a' ? els.bgA : els.bgB;
    incoming.style.backgroundImage = 'url("' + file + '")';
    if (immediate) {
      incoming.style.transition = 'none';
      void incoming.offsetWidth;
    }
    incoming.classList.add('active');
    outgoing.classList.remove('active');
    if (immediate) {
      requestAnimationFrame(() => { incoming.style.transition = ''; });
    }
    activeBg = activeBg === 'a' ? 'b' : 'a';
  }

  function renderPlayer(skin) {
    currentSkin = PLAYERS[skin] ? skin : DEFAULT_SKIN;
    els.playerSlot.innerHTML = '';
    playerSprite = createSprite(currentSkin, { faceLeft: false });
    els.playerSlot.appendChild(playerSprite);
  }

  function renderEnemies(state, animateEntry) {
    // Two enemies share the row with the player, so the arena drops to the
    // smaller sprite size to keep everyone clear of each other.
    els.arena.classList.toggle('pair', state.enemies.length > 1);
    els.enemySlots.innerHTML = '';
    enemyNodes = state.enemies.map((enemy) => {
      const root = document.createElement('div');
      root.className = 'enemy' + (enemy.boss ? ' boss' : '');
      if (animateEntry) root.classList.add('entering');

      const name = document.createElement('div');
      name.className = 'enemy-name';
      name.textContent = displayName(enemy.kind) + (enemy.boss ? ' ★' : '');

      const sprite = createSprite(enemy.kind, { faceLeft: true });

      const bar = document.createElement('div');
      bar.className = 'hp-bar';
      const fill = document.createElement('div');
      fill.className = 'hp-fill';
      fill.style.transform = 'scaleX(' + (enemy.hp / enemy.maxHp) + ')';
      const value = document.createElement('div');
      value.className = 'hp-text';
      value.textContent = enemy.hp + ' / ' + enemy.maxHp;
      bar.appendChild(fill);
      bar.appendChild(value);

      root.appendChild(name);
      root.appendChild(sprite);
      root.appendChild(bar);
      els.enemySlots.appendChild(root);
      if (animateEntry) setTimeout(() => root.classList.remove('entering'), 560);
      return { root, sprite, fill, value };
    });
  }

  function renderHp(state) {
    state.enemies.forEach((enemy, i) => {
      const node = enemyNodes[i];
      if (!node) return;
      node.fill.style.transform = 'scaleX(' + Math.max(0, enemy.hp / enemy.maxHp) + ')';
      node.value.textContent = enemy.hp + ' / ' + enemy.maxHp;
    });
  }

  const enemyNode = (index) => enemyNodes[index] || null;

  // ---------------- question cards ----------------
  function formulaNodes(q) {
    const frag = document.createDocumentFragment();
    const part = (text, cls) => {
      const span = document.createElement('span');
      if (cls) span.className = cls;
      span.textContent = text;
      return span;
    };
    if (q.kind === 'tf') {
      frag.appendChild(part(String(q.x)));
      frag.appendChild(part(MULT));
      frag.appendChild(part(String(q.y)));
      frag.appendChild(part('='));
      frag.appendChild(part(String(q.shown)));
      return frag;
    }
    const slot = document.createElement('span');
    slot.className = 'slot';
    slot.dataset.slot = '1';
    frag.appendChild(q.missing === 'x' ? slot : part(String(q.x)));
    frag.appendChild(part(MULT));
    if (q.missing === 'y') frag.appendChild(slot);
    else frag.appendChild(part(String(q.y)));
    frag.appendChild(part('='));
    if (q.missing === 'z') frag.appendChild(slot);
    else frag.appendChild(part(String(q.z)));
    return frag;
  }

  function renderQuestions(state) {
    els.questions.innerHTML = '';
    els.questions.classList.toggle('pair', state.questions.length > 1);
    cardNodes = state.questions.map((q, index) => {
      const card = document.createElement('div');
      card.className = 'question-card dealt' + (q.kind === 'tf' ? ' tf-question' : '');
      card.dataset.index = String(index);

      const cardLabel = document.createElement('div');
      cardLabel.className = 'card-label';
      cardLabel.textContent = q.kind === 'tf' ? 'Richtig oder falsch?' : 'Wie viel ist …';
      card.appendChild(cardLabel);

      const formula = document.createElement('div');
      formula.className = 'formula';
      formula.appendChild(formulaNodes(q));
      card.appendChild(formula);

      card.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        cb.onFocusQuestion(index);
      });
      els.questions.appendChild(card);
      return card;
    });
    renderTyped(state);
    renderFocus(state);
    setInputLocked(false);
  }

  // Draws what has been typed so far. Deliberately shows a single placeholder
  // rather than one per digit of the result — how long the answer is must not
  // be given away.
  function renderTyped(state, popIndex) {
    state.questions.forEach((q, index) => {
      const card = cardNodes[index];
      if (!card || q.kind === 'tf') return;
      const slot = card.querySelector('.slot');
      if (!slot) return;
      slot.innerHTML = '';
      slot.classList.toggle('filled', q.typed.length > 0);
      const shown = q.done ? String(q.answer) : q.typed;
      const chars = shown.length > 0 ? shown.split('') : ['_'];
      chars.forEach((ch, i) => {
        const span = document.createElement('span');
        span.className = 'digit';
        span.textContent = ch;
        if (index === popIndex && i === q.typed.length - 1) span.classList.add('pop');
        slot.appendChild(span);
      });
    });
  }

  function renderFocus(state) {
    cardNodes.forEach((card, index) => {
      const q = state.questions[index];
      // A resolved wave is already gone from state; leave those cards showing
      // whatever the last render put there instead of clearing them. Passing a
      // non-boolean to toggle() would flip the class rather than set it.
      if (!q) return;
      card.classList.toggle('focused', index === state.focus && !q.done);
      card.classList.toggle('solved', !!(q.done && q.correct));
      card.classList.toggle('failed', q.done && q.correct === false);
    });
    enemyNodes.forEach((node, i) => {
      const q = state.questions[state.focus];
      node.root.classList.toggle('target', !!q && q.enemy === i && state.questions.length > 1);
    });
    renderPad(state);
  }

  const cardAt = (index) => cardNodes[index] || null;

  // A wrong answer clears the wave before the UI runs, so renderTyped can no
  // longer finish the card. This writes the answer straight from the question
  // that came with the event, which matters because the card stays on screen
  // above the solution panel.
  function markCardFailed(index, question) {
    const card = cardNodes[index];
    if (!card || !question) return;
    card.classList.remove('focused');
    card.classList.add('failed');
    if (question.kind === 'tf') return;
    const slot = card.querySelector('.slot');
    if (!slot) return;
    slot.innerHTML = '';
    slot.classList.add('filled');
    const chars = question.typed.length > 0 ? question.typed.split('') : ['_'];
    for (const ch of chars) {
      const span = document.createElement('span');
      span.className = 'digit';
      span.textContent = ch;
      slot.appendChild(span);
    }
  }

  // ---------------- pads ----------------
  function renderPad(state) {
    const q = state.questions[state.focus];
    const isTf = !!q && q.kind === 'tf';
    // The solution panel covers this slot, so the keys go away underneath it.
    const hide = state.phase === 'solution' || state.phase === 'paused'
      || state.phase === 'over';
    els.numpad.classList.toggle('hidden', isTf || hide);
    els.boolpad.classList.toggle('hidden', !isTf || hide);
  }

  function setInputLocked(locked) {
    inputLocked = locked;
    els.numpad.classList.toggle('locked', locked);
    els.boolpad.classList.toggle('locked', locked);
  }

  // ---------------- solution card ----------------
  // Five cells that slot straight into the shared grid, so the operators of
  // several formulas line up underneath each other.
  function solutionLine(fact) {
    const line = document.createElement('div');
    line.className = 'solution-line';
    const parts = [
      { text: String(fact.x), col: 'col-x', hit: fact.missing === 'x' },
      { text: MULT, col: 'col-op', hit: false },
      { text: String(fact.y), col: 'col-y', hit: fact.missing === 'y' },
      { text: '=', col: 'col-eq', hit: false },
      { text: String(fact.z), col: 'col-z', hit: fact.missing === 'z' || fact.kind === 'tf' },
    ];
    for (const part of parts) {
      const span = document.createElement('span');
      span.className = part.col + (part.hit ? ' answer-part' : '');
      span.textContent = part.text;
      line.appendChild(span);
    }
    return line;
  }

  function showSolution(solution) {
    els.solutionCause.textContent = solution.cause === 'timeout' ? LABELS.timeout : LABELS.wrong;
    els.solutionFormulas.innerHTML = '';
    for (const fact of solution.facts) els.solutionFormulas.appendChild(solutionLine(fact));

    els.solutionGiven.innerHTML = '';
    const fact = solution.facts[0];
    if (solution.cause === 'wrong' && fact) {
      const wrap = document.createElement('span');
      wrap.appendChild(document.createTextNode(LABELS.yourAnswer + ': '));
      const s = document.createElement('s');
      if (fact.kind === 'tf') s.textContent = solution.given ? LABELS.yes : LABELS.no;
      else s.textContent = String(solution.given);
      wrap.appendChild(s);
      els.solutionGiven.appendChild(wrap);
    }

    els.solution.classList.remove('hidden');
    els.solution.classList.add('show');
    setTimeout(() => els.solution.classList.remove('show'), 340);
    renderPad({ phase: 'solution', questions: [], focus: 0 });
  }

  function hideSolution() {
    els.solution.classList.add('hidden');
  }

  // ---------------- start screen ----------------
  function renderStartScreen(runSnapshot, statsData, skin) {
    const hero = $('start-hero');
    hero.innerHTML = '';
    hero.appendChild(createSprite(skin, { faceLeft: false }));

    const continueBtn = $('btn-continue');
    if (runSnapshot) {
      continueBtn.classList.remove('hidden');
      const hearts = '♥'.repeat(Math.max(0, runSnapshot.lives));
      $('continue-info').textContent =
        LABELS.level + ' ' + runSnapshot.level + ' · '
        + biomeFor(runSnapshot.level).name + ' · ' + hearts;
    } else {
      continueBtn.classList.add('hidden');
    }
    $('start-best').textContent = statsData.bestLevel > 1
      ? LABELS.bestLevel + ': ' + statsData.bestLevel
      : '';
    $('start-version').textContent = label('version', { v: APP_VERSION })
      + ' · ' + SEASON.name;
    $('start-footer').classList.toggle('one-line', statsData.bestLevel <= 1);
  }

  function showGameOver(state, statsData, isRecord) {
    $('gameover-level').textContent = LABELS.level + ' ' + state.level;
    $('gameover-record').classList.toggle('hidden', !isRecord);
    const grid = $('gameover-stats');
    grid.innerHTML = '';
    const rows = [
      [LABELS.bestLevel, String(statsData.bestLevel)],
      [LABELS.correct, String(state.run.correct)],
      [LABELS.wrongAnswers, String(state.run.wrong)],
      [LABELS.excellent.replace('!', ''), String(state.run.excellent)],
    ];
    for (const row of rows) addRow(grid, row[0], row[1]);
    showOverlay('overlay-gameover');
  }

  function addRow(grid, key, value) {
    const k = document.createElement('div');
    k.className = 'k';
    k.textContent = key;
    const v = document.createElement('div');
    v.className = 'v';
    v.textContent = value;
    grid.appendChild(k);
    grid.appendChild(v);
  }

  // ---------------- statistics ----------------
  function renderStats(statsData) {
    const grid = $('stats-grid');
    grid.innerHTML = '';
    const answers = stats.totalAnswers(statsData);
    const acc = stats.accuracy(statsData);
    addRow(grid, LABELS.playTime, formatDuration(statsData.totalPlayMs));
    addRow(grid, LABELS.games, String(statsData.gamesPlayed));
    addRow(grid, LABELS.bestLevel, String(statsData.bestLevel));
    addRow(grid, LABELS.correct, String(statsData.correct));
    addRow(grid, LABELS.wrongAnswers, String(statsData.wrong));
    addRow(grid, LABELS.timeouts, String(statsData.timeouts));
    addRow(grid, LABELS.accuracy, acc === null ? '–' : Math.round(acc * 100) + ' %');
    addRow(grid, LABELS.excellent.replace('!', ''), String(statsData.ratings.excellent));
    addRow(grid, LABELS.perfect.replace('!', ''), String(statsData.ratings.perfect));
    addRow(grid, LABELS.good.replace('!', ''), String(statsData.ratings.good));
    addRow(grid, LABELS.longestStreak, String(statsData.longestExcellentStreak));
    if (answers === 0) addRow(grid, LABELS.noData, '');

    renderFactGrid(statsData);
    renderDayStrip(statsData);
    els.factDetail.innerHTML = '&nbsp;';
  }

  // Heat map: hue from accuracy, opacity from how often it was asked.
  function renderFactGrid(statsData) {
    const grid = $('fact-grid');
    grid.innerHTML = '';
    const corner = document.createElement('div');
    corner.className = 'fact-cell head';
    corner.textContent = MULT;
    grid.appendChild(corner);
    for (let y = 1; y <= 10; y++) {
      const head = document.createElement('div');
      head.className = 'fact-cell head';
      head.textContent = String(y);
      grid.appendChild(head);
    }
    for (let x = 1; x <= 10; x++) {
      const head = document.createElement('div');
      head.className = 'fact-cell head';
      head.textContent = String(x);
      grid.appendChild(head);
      for (let y = 1; y <= 10; y++) {
        const summary = stats.factSummary(statsData, x, y);
        const cell = document.createElement('div');
        cell.className = 'fact-cell';
        cell.textContent = String(summary.z);
        if (summary.asked > 0) {
          const hue = Math.round(summary.accuracy * 120);   // 0 red .. 120 green
          const strength = Math.min(1, 0.35 + summary.asked / 12);
          cell.style.background = 'hsla(' + hue + ', 65%, 42%, ' + strength + ')';
        }
        cell.addEventListener('click', () => {
          const selected = grid.querySelector('.fact-cell.selected');
          if (selected) selected.classList.remove('selected');
          cell.classList.add('selected');
          els.factDetail.textContent = summary.asked === 0
            ? label('factUnasked', { x, y, z: summary.z })
            : label('factDetail', {
              x, y, z: summary.z, asked: summary.asked, correct: summary.correct,
              avg: summary.avgMs === null ? '–' : formatSeconds(summary.avgMs),
            });
        });
        grid.appendChild(cell);
      }
    }
  }

  function renderDayStrip(statsData) {
    const strip = $('day-strip');
    strip.innerHTML = '';
    const days = stats.dayStrip(statsData, 30);
    const max = days.reduce((m, d) => Math.max(m, d.ms), 0);
    const todayKey = stats.dayKey();
    for (const day of days) {
      const bar = document.createElement('div');
      bar.className = 'day-bar' + (day.ms === 0 ? ' empty' : '')
        + (day.key === todayKey ? ' today' : '');
      bar.style.height = max > 0 ? Math.max(2, (day.ms / max) * 100) + '%' : '2px';
      bar.title = day.key + ': ' + formatDuration(day.ms);
      strip.appendChild(bar);
    }
  }

  // ---------------- achievements ----------------
  function renderAchievements(unlocked) {
    const list = $('achievement-list');
    list.innerHTML = '';
    let count = 0;
    for (const a of ACHIEVEMENTS) {
      const isUnlocked = !!unlocked[a.id];
      if (isUnlocked) count++;
      const row = document.createElement('div');
      row.className = 'achievement ' + (isUnlocked ? 'unlocked' : 'locked');

      const icon = document.createElement('div');
      icon.className = 'icon';
      icon.textContent = isUnlocked ? a.icon : '🔒';

      const body = document.createElement('div');
      body.className = 'body';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = a.title;
      const desc = document.createElement('div');
      desc.className = 'desc';
      desc.textContent = a.desc;
      body.appendChild(name);
      body.appendChild(desc);
      if (a.skin && PLAYERS[a.skin]) {
        const reward = document.createElement('div');
        reward.className = 'reward';
        reward.textContent = label('unlocksSkin', { name: PLAYERS[a.skin].name });
        body.appendChild(reward);
      }
      if (isUnlocked) {
        const when = document.createElement('div');
        when.className = 'when';
        when.textContent = label('unlockedOn', { date: formatDate(unlocked[a.id]) });
        body.appendChild(when);
      }
      row.appendChild(icon);
      row.appendChild(body);
      list.appendChild(row);
    }
    $('achievement-count').textContent = count + ' / ' + ACHIEVEMENTS.length;
  }

  // ---------------- settings ----------------
  // ---------------- daily quest ----------------
  function renderDaily(daily, familiarsOwned) {
    const claimable = isClaimable(daily);
    const done = isComplete(daily);
    const all = ownedCount(familiarsOwned) >= FAMILIAR_COUNT;
    els.dailyCard.classList.toggle('done', done && !claimable);
    els.dailyCard.classList.toggle('claimable', claimable);
    if (claimable) els.dailyTitle.textContent = LABELS.dailyClaim;
    else if (done) els.dailyTitle.textContent = all ? LABELS.dailyAllCollected : LABELS.dailyDone;
    else els.dailyTitle.textContent = QUEST.title;
    els.dailyCount.textContent = claimable ? '🎁' : (done ? '✓' : progressText(daily));
    const ratio = QUEST.target > 0 ? progressOf(daily) / QUEST.target : 0;
    els.dailyFill.style.transform = 'scaleX(' + Math.min(1, ratio) + ')';
  }

  function pulseDaily() {
    els.dailyCard.classList.remove('just-done');
    void els.dailyCard.offsetWidth;
    els.dailyCard.classList.add('just-done');
    setTimeout(() => els.dailyCard.classList.remove('just-done'), 800);
  }

  // ---------------- the collection ----------------
  function renderFamiliars(owned, freshId) {
    els.seasonLine.textContent = SEASON.name + ' · ' + SEASON.title + ' — '
      + label('collectionCount', { owned: ownedCount(owned), total: FAMILIAR_COUNT });
    els.familiarGrid.innerHTML = '';
    for (const familiar of FAMILIARS) {
      const has = isUnlocked(owned, familiar.id);
      const cell = document.createElement('div');
      cell.className = 'familiar ' + (has ? 'owned' : 'locked')
        + (has && familiar.id === freshId ? ' fresh' : '');

      const jar = document.createElement('div');
      jar.className = 'jar';
      jarPosition(jar, familiar);

      const name = document.createElement('div');
      name.className = 'familiar-name';
      // A locked jar stays nameless on purpose — the silhouette is the whole hint.
      name.textContent = has ? familiar.name : '???';

      cell.appendChild(jar);
      cell.appendChild(name);
      cell.addEventListener('click', () => {
        els.familiarDetail.textContent = has
          ? familiar.name + ' — ' + label('unlockedOn', { date: formatDate(owned[familiar.id]) })
          : LABELS.familiarLocked;
      });
      els.familiarGrid.appendChild(cell);
    }
    els.familiarDetail.innerHTML = '&nbsp;';
  }

  // ---------------- the reward reveal ----------------
  let lootDismiss = null;

  function showLoot(familiar, onDismiss) {
    jarPosition(els.lootJar, familiar);
    els.lootName.textContent = familiar.name;
    els.loot.classList.remove('hidden', 'pop');
    void els.loot.offsetWidth;
    els.loot.classList.add('pop');

    // A burst of sparks thrown out from the middle, like a chest opening.
    for (const old of els.loot.querySelectorAll('.spark')) old.remove();
    const reduce = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      for (let i = 0; i < 26; i++) {
        const spark = document.createElement('div');
        spark.className = 'spark';
        const angle = (Math.PI * 2 * i) / 26 + Math.random() * 0.3;
        const dist = 90 + Math.random() * 190;
        spark.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
        spark.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
        spark.style.setProperty('--c', i % 3 === 0 ? '#fff' : '#ffd45e');
        spark.style.setProperty('--dur', 700 + Math.random() * 600 + 'ms');
        spark.style.animationDelay = 380 + Math.random() * 120 + 'ms';
        els.loot.appendChild(spark);
      }
    }
    // Ignore taps during the reveal, or the animation is over before it is seen.
    lootDismiss = null;
    setTimeout(() => { lootDismiss = onDismiss || (() => {}); }, 1100);
  }

  function hideLoot() {
    els.loot.classList.add('hidden');
    els.loot.classList.remove('pop');
    lootDismiss = null;
  }

  const isLootOpen = () => !els.loot.classList.contains('hidden');

  els.loot.addEventListener('click', () => {
    if (!lootDismiss) return;
    const done = lootDismiss;
    hideLoot();
    done();
  });

  // ---------------- statistics child lock ----------------
  function openStatsLock() {
    els.statsLock.classList.remove('hidden');
    els.statsLockMsg.className = 'hint small';
    els.statsLockMsg.textContent = LABELS.statsCodePrompt;
    els.statsCode.value = '';
    els.statsCode.focus();
  }

  function closeStatsLock() {
    els.statsLock.classList.add('hidden');
    els.statsCode.value = '';
  }

  function statsLockError() {
    els.statsLockMsg.className = 'hint small error';
    els.statsLockMsg.textContent = LABELS.statsCodeWrong;
    els.statsCode.value = '';
    els.statsCode.focus();
    els.statsLock.classList.remove('shake');
    void els.statsLock.offsetWidth;
    els.statsLock.classList.add('shake');
  }

  function statsLockDone() {
    // renderSettings closes the panel on its way through, so make sure the
    // confirmation is actually visible whichever order the caller uses.
    els.statsLock.classList.remove('hidden');
    els.statsCode.value = '';
    els.statsLockMsg.className = 'hint small done';
    els.statsLockMsg.textContent = LABELS.statsCleared;
    setTimeout(closeStatsLock, 1800);
  }

  function renderSettings(settings, unlockedSkinIds) {
    closeStatsLock();
    // Rendered from the one string in config.js, so adding a pack cannot leave
    // a stale copy sitting in the markup.
    $('credits-line').textContent = LABELS.credits;
    $('set-muted').checked = !!settings.muted;
    $('set-sfx').value = settings.sfx;
    $('set-music').value = settings.music;
    $('set-timerbar').checked = settings.showTimerBar !== false;
    $('set-missingfactor').checked = settings.missingFactor !== false;

    const picker = $('skin-picker');
    picker.innerHTML = '';
    const rewards = skinRewards();
    for (const id of PLAYER_ORDER) {
      const def = PLAYERS[id];
      const isUnlocked = unlockedSkinIds.indexOf(id) !== -1;
      const option = document.createElement('button');
      option.className = 'skin-option'
        + (settings.skin === id ? ' selected' : '')
        + (isUnlocked ? '' : ' locked');
      option.appendChild(createSprite(id, { faceLeft: false, idle: false }));
      const name = document.createElement('div');
      name.className = 'skin-name';
      name.textContent = isUnlocked
        ? def.name
        : (rewards[id] ? rewards[id].title : LABELS.characterLocked);
      option.appendChild(name);
      if (isUnlocked) option.addEventListener('click', () => cb.onSkinSelect(id));
      picker.appendChild(option);
    }
  }

  // ---------------- input wiring ----------------
  function bindPad(pad, handler) {
    pad.addEventListener('pointerdown', (ev) => {
      const key = ev.target.closest ? ev.target.closest('[data-key]') : null;
      if (!key) return;
      ev.preventDefault();
      if (inputLocked) return;
      handler(key.dataset.key);
    });
  }

  bindPad(els.numpad, (key) => {
    if (key === 'back') cb.onKey('back');
    else if (key === 'ok') cb.onKey('ok');
    else cb.onKey(Number(key));
  });
  bindPad(els.boolpad, (key) => cb.onBool(key === 'yes'));

  $('btn-next').addEventListener('click', () => cb.onNext());
  $('btn-pause').addEventListener('click', () => cb.onPause());
  $('btn-continue').addEventListener('click', () => cb.onContinue());
  $('btn-new').addEventListener('click', () => cb.onNewGame());
  $('btn-stats').addEventListener('click', () => cb.onOpen('overlay-stats'));
  $('btn-achievements').addEventListener('click', () => cb.onOpen('overlay-achievements'));
  $('btn-familiars').addEventListener('click', () => cb.onOpen('overlay-familiars'));
  // A finished goal turns the card into the hand-in button; otherwise it is
  // just the way into the collection.
  els.dailyCard.addEventListener('click', () => {
    if (els.dailyCard.classList.contains('claimable')) cb.onClaimDaily();
    else cb.onOpen('overlay-familiars');
  });
  $('btn-settings').addEventListener('click', () => cb.onOpen('overlay-settings'));
  $('btn-again').addEventListener('click', () => cb.onNewGame());
  $('btn-gameover-menu').addEventListener('click', () => cb.onMenu());
  $('btn-pause-menu').addEventListener('click', () => cb.onMenu());
  $('btn-pause-settings').addEventListener('click', () => cb.onOpen('overlay-settings'));

  // Tap anywhere on the pause card (except its buttons) to resume.
  $('overlay-pause').addEventListener('click', (ev) => {
    if (ev.target.closest && ev.target.closest('.no-resume')) return;
    cb.onResume();
  });

  for (const el of document.querySelectorAll('[data-close]')) {
    el.addEventListener('click', () => cb.onClose(el.dataset.close));
  }

  $('set-muted').addEventListener('change', (ev) => cb.onSetting('muted', ev.target.checked));
  $('set-sfx').addEventListener('input', (ev) => cb.onSetting('sfx', Number(ev.target.value)));
  $('set-music').addEventListener('input', (ev) => cb.onSetting('music', Number(ev.target.value)));
  $('set-timerbar').addEventListener('change', (ev) => cb.onSetting('showTimerBar', ev.target.checked));
  $('set-missingfactor').addEventListener('change', (ev) => cb.onSetting('missingFactor', ev.target.checked));
  $('btn-reset-run').addEventListener('click', () => cb.onResetRun($('btn-reset-run')));
  $('btn-reset-stats').addEventListener('click', () => cb.onResetStats());
  $('btn-stats-confirm').addEventListener('click', () => cb.onStatsCode(els.statsCode.value));
  $('btn-stats-cancel').addEventListener('click', () => closeStatsLock());
  els.statsCode.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') cb.onStatsCode(els.statsCode.value);
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const key = ev.key;
    if (key === 'Escape' || key === 'p' || key === 'P') { ev.preventDefault(); cb.onPause(); return; }
    if (isOverlayOpen()) return;
    if (key >= '0' && key <= '9') { ev.preventDefault(); cb.onKey(Number(key)); return; }
    if (key === 'Backspace') { ev.preventDefault(); cb.onKey('back'); return; }
    if (key === 'Enter' || key === ' ') { ev.preventDefault(); cb.onEnter(); return; }
    if (key === 'j' || key === 'J' || key === 'ArrowRight') { ev.preventDefault(); cb.onBool(true); return; }
    if (key === 'n' || key === 'N' || key === 'ArrowLeft') { ev.preventDefault(); cb.onBool(false); return; }
    if (key === 'Tab') { ev.preventDefault(); cb.onCycleFocus(); }
  });

  // iOS pinch-zoom is not covered by the viewport meta tag.
  document.addEventListener('gesturestart', (ev) => ev.preventDefault());

  return {
    els,
    showOverlay,
    hideOverlays,
    isOverlayOpen,
    renderHud,
    renderTimer,
    renderBackground,
    renderPlayer,
    renderEnemies,
    renderHp,
    renderQuestions,
    renderTyped,
    renderFocus,
    markCardFailed,
    renderPad,
    setInputLocked,
    showSolution,
    hideSolution,
    renderStartScreen,
    showGameOver,
    renderStats,
    renderAchievements,
    renderSettings,
    renderDaily,
    pulseDaily,
    renderFamiliars,
    showLoot,
    hideLoot,
    isLootOpen,
    openStatsLock,
    closeStatsLock,
    statsLockError,
    statsLockDone,
    cardAt,
    enemyNode,
    heartAt,
    playerSprite: () => playerSprite,
    currentSkin: () => currentSkin,
  };
}
