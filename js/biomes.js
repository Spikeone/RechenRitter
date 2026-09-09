// Biome rotation: every BIOME_LENGTH levels the scenery and the enemy pool
// change. The first lap is a fixed tour through all eleven zones; after that
// each further lap visits them all again in a shuffled order.
// Background slugs match the files produced by tools/build-assets.py.
// Pure module — no DOM, safe to import from node tests.

import { isBossLevel, BIOME_LENGTH } from './config.js';

// Re-exported so callers can reach it from here, where the regions live.
export { BIOME_LENGTH };

export const BIOMES = [
  {
    id: 'forest',
    name: 'Wald',
    bg: ['bg/forest-1.webp', 'bg/forest-2.webp'],
    bossBg: 'bg/forest-2.webp',
    enemies: ['giant-rat', 'boar', 'fox', 'goblin', 'small-slime', 'goblin-archer'],
    bosses: ['goblin-brute'],
  },
  {
    id: 'snow',
    name: 'Schnee',
    bg: ['bg/snow-1.webp', 'bg/snow-2.webp'],
    bossBg: 'bg/snow-boss.webp',
    enemies: ['polar-bear', 'warg', 'yak', 'reindeer', 'skeleton', 'wendigo'],
    bosses: ['troll'],
  },
  {
    id: 'desert',
    name: 'Wüste',
    bg: ['bg/desert-1.webp', 'bg/desert-2.webp'],
    bossBg: 'bg/desert-boss.webp',
    enemies: ['giant-ant', 'cobra', 'giant-spider', 'monitor-lizard', 'naga', 'camel'],
    bosses: ['manticore'],
  },
  {
    id: 'swamp',
    name: 'Sumpf',
    bg: ['bg/swamp-1.webp', 'bg/swamp-2.webp'],
    bossBg: 'bg/swamp-2.webp',
    enemies: ['big-slime', 'lampreymander', 'giant-earthworm', 'alligator', 'zombie', 'ghoul'],
    bosses: ['witch'],
  },
  {
    id: 'darkforest',
    name: 'Dunkelwald',
    bg: ['bg/darkforest-1.webp', 'bg/darkforest-2.webp'],
    bossBg: 'bg/darkforest-2.webp',
    enemies: ['giant-bat', 'giant-centipede', 'lycanthrope', 'satyr', 'cultist', 'dryad', 'forest-spirit'],
    bosses: ['banshee'],
  },
  {
    id: 'mountain',
    name: 'Gebirge',
    bg: ['bg/mountain-1.webp', 'bg/mountain-2.webp'],
    bossBg: 'bg/mountain-1.webp',
    enemies: ['mountain-goat', 'harpy', 'ettin', 'rock-golem', 'minotaur', 'centaur'],
    bosses: ['two-headed-ettin'],
  },
  {
    id: 'ocean',
    name: 'Sturmsee',
    bg: ['bg/ocean-1.webp', 'bg/ocean-2.webp'],
    bossBg: 'bg/ocean-boss.webp',
    enemies: ['skeleton-archer', 'wraith', 'snapping-turtle', 'alligator-turtle', 'death-knight', 'seagull'],
    bosses: ['reaper'],
  },
  {
    id: 'volcano',
    name: 'Vulkan',
    bg: ['bg/volcano-1.webp', 'bg/volcano-2.webp'],
    bossBg: 'bg/volcano-boss.webp',
    enemies: ['lizardfolk', 'kobold', 'imp', 'cockatrice', 'basilisk', 'drake'],
    bosses: ['dragon'],
  },
  {
    id: 'arcane',
    name: 'Arkane Arena',
    bg: ['bg/arcane-1.webp', 'bg/arcane-2.webp'],
    bossBg: 'bg/arcane-2.webp',
    enemies: ['orc-wizard', 'goblin-mage', 'lich', 'gorgon', 'faceless-monk', 'orc-blademaster'],
    bosses: ['unholy-cardinal'],
  },
  {
    id: 'ruins',
    name: 'Ruinen',
    bg: ['bg/ruins-1.webp', 'bg/ruins-2.webp'],
    bossBg: 'bg/ruins-1.webp',
    enemies: ['orc', 'small-myconid', 'large-myconid', 'slime-body', 'hyena', 'zombie'],
    bosses: ['orc-warchief'],
  },
  {
    id: 'void',
    name: 'Leere',
    bg: ['bg/void-1.webp', 'bg/void-2.webp'],
    bossBg: 'bg/void-1.webp',
    enemies: ['writhing-mass', 'large-writhing-mass', 'writhing-humanoid', 'merged-slimebodies', 'wraith'],
    bosses: ['angel'],
  },
];

export const BIOME_IDS = BIOMES.map((b) => b.id);

const blockOf = (level) => Math.floor((Math.max(1, level) - 1) / BIOME_LENGTH);

// The zone for a block has to be the same every time it is asked, or the header,
// the background and the enemies would disagree and a reloaded save could land
// somewhere else. So the draw is a hash of the lap number, not a live random.
function lapSeed(lap) {
  let h = Math.imul(lap + 1, 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return h >>> 0;
}

// Every zone once, in an order decided by the lap number alone.
function shuffleFor(lap) {
  const order = BIOMES.map((_, i) => i);
  let seed = lapSeed(lap);
  for (let i = order.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;
  }
  return order;
}

// One lap is every zone once, so the endless part keeps visiting all of them
// rather than favouring a few.
function lapOrder(lap) {
  const order = shuffleFor(lap);
  // Don't open a lap with the zone that just closed the one before it. Swapping
  // the first two keeps every zone in the lap exactly once; because it never
  // touches the last entry, the previous lap can be read from the raw shuffle
  // and this stays a single step rather than a walk back to the first lap.
  const prevLast = lap === 1
    ? BIOMES.length - 1
    : shuffleFor(lap - 1)[BIOMES.length - 1];
  if (order.length > 2 && order[0] === prevLast) {
    const swap = order[0];
    order[0] = order[1];
    order[1] = swap;
  }
  return order;
}

function biomeIndex(level) {
  const block = blockOf(level);
  // The first lap is the fixed tour, Wald through Leere.
  if (block < BIOMES.length) return block;
  const lap = Math.floor(block / BIOMES.length);
  return lapOrder(lap)[block % BIOMES.length];
}

export const biomeFor = (level) => BIOMES[biomeIndex(level)];

// Where the fixed tour ends and the shuffled laps begin.
export const TOUR_LENGTH = BIOMES.length * BIOME_LENGTH;

// True when this level starts a new biome.
export const isBiomeStart = (level) => (level - 1) % BIOME_LENGTH === 0;

// The level a region of the fixed tour begins on — used for the achievement
// texts, so they cannot drift when BIOME_LENGTH changes.
export function biomeStartLevel(id) {
  const index = BIOMES.findIndex((b) => b.id === id);
  return index < 0 ? 1 : index * BIOME_LENGTH + 1;
}

// Which background this level shows: first half / second half of the block, and
// the dedicated arena on boss levels.
export function backgroundFor(level) {
  const biome = biomeFor(level);
  if (isBossLevel(level)) return biome.bossBg;
  const within = (level - 1) % BIOME_LENGTH;   // 0..9
  return biome.bg[within < BIOME_LENGTH / 2 ? 0 : 1];
}

// All backgrounds, for preloading and the service worker asset list.
export function allBackgrounds() {
  const set = new Set();
  for (const b of BIOMES) {
    for (const bg of b.bg) set.add(bg);
    set.add(b.bossBg);
  }
  return Array.from(set).sort();
}

// Enemy kinds for a level. Boss levels always draw from the boss list. Each zone
// keeps strictly to its own creatures — the variety past the tour comes from the
// shuffled zone order, so a dragon still only ever turns up in the volcano.
export function enemyKindsFor(level, count, rng) {
  const biome = biomeFor(level);
  if (isBossLevel(level)) {
    const pool = biome.bosses;
    return [pool[Math.floor(rng() * pool.length) % pool.length]];
  }
  const pool = biome.enemies;
  const picked = [];
  for (let i = 0; i < count; i++) {
    let kind = pool[Math.floor(rng() * pool.length) % pool.length];
    // Prefer two different enemies side by side, but never loop forever.
    if (picked.indexOf(kind) !== -1 && pool.length > 1) {
      kind = pool[(pool.indexOf(kind) + 1) % pool.length];
    }
    picked.push(kind);
  }
  return picked;
}
