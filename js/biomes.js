// Biome rotation: every 10 levels the scenery and the enemy pool change.
// Background slugs match the files produced by tools/build-assets.py.
// Pure module — no DOM, safe to import from node tests.

import { isBossLevel } from './config.js';

export const BIOME_LENGTH = 10;

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

const biomeIndex = (level) =>
  Math.floor((Math.max(1, level) - 1) / BIOME_LENGTH) % BIOMES.length;

export const biomeFor = (level) => BIOMES[biomeIndex(level)];

// True when this level starts a new biome (level 1, 11, 21, ...).
export const isBiomeStart = (level) => (level - 1) % BIOME_LENGTH === 0;

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

// Enemy kinds for a level. Boss levels always draw from the boss list; from the
// second lap through the biomes the previous biome's pool mixes in for variety.
export function enemyKindsFor(level, count, rng) {
  const biome = biomeFor(level);
  if (isBossLevel(level)) {
    const pool = biome.bosses;
    return [pool[Math.floor(rng() * pool.length) % pool.length]];
  }
  let pool = biome.enemies;
  if (level > BIOMES.length * BIOME_LENGTH) {
    const prev = BIOMES[(biomeIndex(level) + BIOMES.length - 1) % BIOMES.length];
    pool = pool.concat(prev.enemies);
  }
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
