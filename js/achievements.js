// Achievement definitions and the check that runs after every batch of events.
// Pure: a check only reads the lifetime stats and the current run state.
//
// `skin` names a character in assets/sprites/manifest.js that the achievement
// unlocks. Every skin except the starting knight is behind one of these.

const HOUR_MS = 60 * 60 * 1000;

const seen = (stats, biome) => stats.biomesSeen.indexOf(biome) !== -1;

export const ACHIEVEMENTS = [
  {
    id: 'first-win',
    title: 'Erster Sieg',
    desc: 'Besiege deinen ersten Gegner.',
    icon: '⚔️',
    check: (ctx) => ctx.event.type === 'enemyDefeated',
  },
  {
    id: 'level-10',
    title: 'Zehnkämpfer',
    desc: 'Erreiche Level 10.',
    icon: '🔟',
    check: (ctx) => ctx.stats.bestLevel >= 10 || ctx.state.maxLevel >= 10,
  },
  {
    id: 'level-20',
    title: 'Zwanzig!',
    desc: 'Erreiche Level 20.',
    icon: '🏅',
    check: (ctx) => ctx.stats.bestLevel >= 20 || ctx.state.maxLevel >= 20,
  },
  {
    id: 'level-30',
    title: 'Dreißiger-Club',
    desc: 'Erreiche Level 30.',
    icon: '🎖️',
    check: (ctx) => ctx.stats.bestLevel >= 30 || ctx.state.maxLevel >= 30,
  },
  {
    id: 'level-40',
    title: 'Vierzig Stufen',
    desc: 'Erreiche Level 40.',
    icon: '🏆',
    check: (ctx) => ctx.stats.bestLevel >= 40 || ctx.state.maxLevel >= 40,
  },
  {
    id: 'level-50',
    title: 'Halbes Hundert',
    desc: 'Erreiche Level 50.',
    icon: '👑',
    check: (ctx) => ctx.stats.bestLevel >= 50 || ctx.state.maxLevel >= 50,
  },
  // --- biomes (each new region rewards a new figure) ---
  {
    id: 'biome-snow',
    title: 'Schneewanderer',
    desc: 'Erreiche das Schneegebiet (Level 11).',
    icon: '❄️',
    skin: 'ranger',
    check: (ctx) => seen(ctx.stats, 'snow'),
  },
  {
    id: 'biome-desert',
    title: 'Wüstenläufer',
    desc: 'Erreiche die Wüste (Level 21).',
    icon: '🏜️',
    skin: 'shield-knight',
    check: (ctx) => seen(ctx.stats, 'desert'),
  },
  {
    id: 'biome-swamp',
    title: 'Sumpfbezwinger',
    desc: 'Erreiche den Sumpf (Level 31).',
    icon: '🐊',
    skin: 'barbarian',
    check: (ctx) => seen(ctx.stats, 'swamp'),
  },
  {
    id: 'biome-darkforest',
    title: 'Dunkelwanderer',
    desc: 'Erreiche den Dunkelwald (Level 41).',
    icon: '🌲',
    skin: 'elf',
    check: (ctx) => seen(ctx.stats, 'darkforest'),
  },
  {
    id: 'biome-mountain',
    title: 'Gipfelstürmer',
    desc: 'Erreiche das Gebirge (Level 51).',
    icon: '⛰️',
    skin: 'templar',
    check: (ctx) => seen(ctx.stats, 'mountain'),
  },
  {
    id: 'biome-ocean',
    title: 'Sturmsegler',
    desc: 'Erreiche die Sturmsee (Level 61).',
    icon: '🌊',
    skin: 'fencer',
    check: (ctx) => seen(ctx.stats, 'ocean'),
  },
  {
    id: 'biome-volcano',
    title: 'Drachentöter',
    desc: 'Erreiche den Vulkan (Level 71).',
    icon: '🌋',
    skin: 'wizard',
    check: (ctx) => seen(ctx.stats, 'volcano'),
  },
  {
    id: 'biome-arcane',
    title: 'Arkaner Held',
    desc: 'Erreiche die Arkane Arena (Level 81).',
    icon: '🔮',
    skin: 'druid',
    check: (ctx) => seen(ctx.stats, 'arcane'),
  },
  {
    id: 'biome-ruins',
    title: 'Ruinenforscher',
    desc: 'Erreiche die Ruinen (Level 91).',
    icon: '🏚️',
    skin: 'cleric',
    check: (ctx) => seen(ctx.stats, 'ruins'),
  },
  // --- skill ---
  {
    id: 'boss-first',
    title: 'Bossjäger',
    desc: 'Besiege deinen ersten Boss.',
    icon: '💀',
    check: (ctx) => !!ctx.state.run.clearedBossLevel,
  },
  {
    id: 'first-double',
    title: 'Doppelschlag',
    desc: 'Gewinne ein Doppel-Duell gegen zwei Gegner.',
    icon: '⚔️',
    check: (ctx) => !!ctx.state.run.clearedTwoEnemyLevel,
  },
  {
    id: 'flawless-10',
    title: 'Makellos',
    desc: 'Erreiche Level 10 ohne ein Leben zu verlieren.',
    icon: '✨',
    check: (ctx) => ctx.event.type === 'levelUp' && ctx.state.level >= 10
      && ctx.state.lives >= 5,
  },
  {
    id: 'streak-3',
    title: 'Dreifach exzellent',
    desc: '3× hintereinander Exzellent.',
    icon: '🔥',
    check: (ctx) => ctx.state.streakExcellent >= 3,
  },
  {
    id: 'streak-5',
    title: 'Fünferkette',
    desc: '5× hintereinander Exzellent.',
    icon: '🔥',
    check: (ctx) => ctx.state.streakExcellent >= 5,
  },
  {
    id: 'streak-10',
    title: 'Unaufhaltsam',
    desc: '10× hintereinander Exzellent.',
    icon: '☄️',
    check: (ctx) => ctx.state.streakExcellent >= 10,
  },
  {
    id: 'excellent-100',
    title: 'Blitzrechner',
    desc: '100× Exzellent insgesamt.',
    icon: '⚡',
    check: (ctx) => ctx.stats.ratings.excellent >= 100,
  },
  {
    id: 'excellent-250',
    title: 'Turbo-Hirn',
    desc: '250× Exzellent insgesamt.',
    icon: '⚡',
    check: (ctx) => ctx.stats.ratings.excellent >= 250,
  },
  {
    id: 'excellent-500',
    title: 'Rechenrakete',
    desc: '500× Exzellent insgesamt.',
    icon: '🚀',
    check: (ctx) => ctx.stats.ratings.excellent >= 500,
  },
  {
    id: 'excellent-1000',
    title: 'Einmaleins-Meister',
    desc: '1000× Exzellent insgesamt.',
    icon: '🌟',
    check: (ctx) => ctx.stats.ratings.excellent >= 1000,
  },
  {
    id: 'correct-100',
    title: 'Hundert richtig',
    desc: '100 richtige Antworten.',
    icon: '💯',
    check: (ctx) => ctx.stats.correct >= 100,
  },
  {
    id: 'correct-1000',
    title: 'Tausendsassa',
    desc: '1000 richtige Antworten.',
    icon: '🎯',
    check: (ctx) => ctx.stats.correct >= 1000,
  },
  {
    id: 'tf-50',
    title: 'Wahrheitsdetektor',
    desc: '50 Richtig-oder-Falsch-Aufgaben richtig gelöst.',
    icon: '🔍',
    check: (ctx) => ctx.stats.byKind.tf.correct >= 50,
  },
  {
    id: 'all-facts',
    title: 'Alle Reihen',
    desc: 'Löse jede Aufgabe des Einmaleins mindestens einmal richtig.',
    icon: '📗',
    check: (ctx) => ctx.stats.factsCorrect.every((c) => c > 0),
  },
  {
    id: 'playtime-1h',
    title: 'Ausdauer',
    desc: 'Spiele insgesamt eine Stunde.',
    icon: '⏳',
    check: (ctx) => ctx.stats.totalPlayMs >= HOUR_MS,
  },
  {
    id: 'days-7',
    title: 'Fleißig',
    desc: 'Spiele an 7 verschiedenen Tagen.',
    icon: '📅',
    check: (ctx) => Object.keys(ctx.stats.days).length >= 7,
  },
  {
    id: 'games-10',
    title: 'Stehaufmännchen',
    desc: 'Spiele 10 Runden.',
    icon: '🔄',
    check: (ctx) => ctx.stats.gamesPlayed >= 10,
  },
];

const BY_ID = {};
for (const a of ACHIEVEMENTS) BY_ID[a.id] = a;

export const achievementById = (id) => BY_ID[id] || null;

// { skinId: achievement } for everything a skin can be earned from.
export function skinRewards() {
  const out = {};
  for (const a of ACHIEVEMENTS) if (a.skin) out[a.skin] = a;
  return out;
}

// Returns the ids unlocked by this event, without mutating `unlocked`.
export function checkAchievements(unlocked, ctx) {
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (unlocked[a.id]) continue;
    let hit = false;
    try {
      hit = !!a.check(ctx);
    } catch (err) {
      hit = false;   // a malformed state must never break the game loop
    }
    if (hit) fresh.push(a.id);
  }
  return fresh;
}

// Which skins the player may choose right now.
export function unlockedSkins(unlocked, defaultSkin) {
  const skins = [defaultSkin];
  for (const a of ACHIEVEMENTS) {
    if (a.skin && unlocked[a.id] && skins.indexOf(a.skin) === -1) skins.push(a.skin);
  }
  return skins;
}
