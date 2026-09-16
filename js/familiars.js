// The Season 1 collection: 28 creatures in jars, one sheet, 7 x 4 cells.
// Pure data — no DOM, safe to import from node tests.
//
// Every jar in the pack has an identical outline and the artwork has no partial
// transparency, so a locked one can simply be drawn black: the silhouette gives
// away nothing about what is inside.

export const FAMILIAR_SHEET = 'assets/familiars/familiars.png';
export const FAMILIAR_W = 72;
export const FAMILIAR_H = 84;
export const FAMILIAR_COLS = 7;
export const FAMILIAR_ROWS = 4;

// A season is a collection plus the one daily goal that fills it. Season 2 would
// bring its own creatures and its own goal.
export const SEASON = {
  id: 1,
  name: 'Saison 1',
  title: 'Die Glasgefährten',
  quest: { target: 30, title: '30 richtige Antworten' },
};

// Order is the sheet order, left to right, top to bottom.
export const FAMILIARS = [
  { id: 'spawn', name: 'Froschlaich' },
  { id: 'black-newt', name: 'Schwarzer Molch' },
  { id: 'orange-octopus', name: 'Tintenfisch' },
  { id: 'imp', name: 'Teufelchen' },
  { id: 'tadpole', name: 'Kaulquappe' },
  { id: 'gnome', name: 'Gartenzwerg' },
  { id: 'betta', name: 'Kampffisch' },

  { id: 'alien', name: 'Außerirdischer' },
  { id: 'fairy', name: 'Fee' },
  { id: 'frog', name: 'Frosch' },
  { id: 'clownfish', name: 'Clownfisch' },
  { id: 'ghost', name: 'Geist' },
  { id: 'seahorse', name: 'Seepferdchen' },
  { id: 'beholder', name: 'Schwebeauge' },

  { id: 'homunculus', name: 'Homunkulus' },
  { id: 'shadow-kraken', name: 'Schattenkrake' },
  { id: 'goblin-familiar', name: 'Kobold' },
  { id: 'anglerfish', name: 'Anglerfisch' },
  { id: 'pet-rock', name: 'Stein' },
  { id: 'red-octopus', name: 'Oktopus' },
  { id: 'pufferfish', name: 'Kugelfisch' },

  { id: 'jellyfish', name: 'Qualle' },
  { id: 'goby', name: 'Grundel' },
  { id: 'leeches', name: 'Blutegel' },
  { id: 'snake', name: 'Schlange' },
  { id: 'axolotl', name: 'Axolotl' },
  { id: 'eel', name: 'Aal' },
  { id: 'lobster', name: 'Hummer' },
].map((f, i) => ({
  ...f,
  index: i,
  col: i % FAMILIAR_COLS,
  row: Math.floor(i / FAMILIAR_COLS),
}));

export const FAMILIAR_COUNT = FAMILIARS.length;

const BY_ID = {};
for (const f of FAMILIARS) BY_ID[f.id] = f;

export const familiarById = (id) => BY_ID[id] || null;

export const isUnlocked = (owned, id) => !!(owned && owned[id]);

export const ownedCount = (owned) =>
  FAMILIARS.reduce((n, f) => n + (isUnlocked(owned, f.id) ? 1 : 0), 0);

export const lockedFamiliars = (owned) =>
  FAMILIARS.filter((f) => !isUnlocked(owned, f.id));

// Picks the next one to hand over. Random among those still missing, so the
// order is a surprise, and null once the collection is complete.
export function drawFamiliar(owned, rng) {
  const locked = lockedFamiliars(owned);
  if (locked.length === 0) return null;
  const roll = typeof rng === 'function' ? rng() : Math.random();
  return locked[Math.min(locked.length - 1, Math.floor(roll * locked.length))];
}
