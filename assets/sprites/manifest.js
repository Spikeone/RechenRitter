// Sprite catalogue for the 32rogues pack (Seth Boyles).
// Every sheet is a plain grid of 32x32 tiles, no animation frames — motion is
// done in CSS. Coordinates are (col, row), zero-based, and were verified against
// the pack's rogues.txt / monsters.txt / animals.txt indexes.
//
// Swapping in a different pack means editing this file (and sw.js ASSETS) only.

export const TILE = 32;

// Every sheet in this pack is drawn facing left, so `facesLeft` is true
// throughout; the flag exists for packs that mix directions.
export const SHEETS = {
  rogues: { file: 'assets/sprites/rogues.png', cols: 7, rows: 7, facesLeft: true },
  monsters: { file: 'assets/sprites/monsters.png', cols: 12, rows: 13, facesLeft: true },
  animals: { file: 'assets/sprites/animals.png', cols: 9, rows: 16, facesLeft: true },
};

// Playable characters. `knight` is unlocked from the start, the rest are
// achievement rewards (the ids must match js/achievements.js).
export const PLAYERS = {
  knight: { name: 'Ritter', sheet: 'rogues', col: 0, row: 1 },
  ranger: { name: 'Waldläufer', sheet: 'rogues', col: 2, row: 0 },
  'shield-knight': { name: 'Schildritter', sheet: 'rogues', col: 4, row: 1 },
  barbarian: { name: 'Barbar', sheet: 'rogues', col: 0, row: 3 },
  elf: { name: 'Elf', sheet: 'rogues', col: 1, row: 0 },
  templar: { name: 'Templer', sheet: 'rogues', col: 4, row: 2 },
  fencer: { name: 'Fechterin', sheet: 'rogues', col: 4, row: 3 },
  wizard: { name: 'Magier', sheet: 'rogues', col: 1, row: 4 },
  druid: { name: 'Druidin', sheet: 'rogues', col: 2, row: 4 },
  cleric: { name: 'Kriegerpriesterin', sheet: 'rogues', col: 2, row: 2 },
};

export const PLAYER_ORDER = Object.keys(PLAYERS);
export const DEFAULT_SKIN = 'knight';

// Enemies, grouped by habitat; js/biomes.js picks from these ids.
export const ENEMIES = {
  // --- forest ---
  'giant-rat': { name: 'Riesenratte', sheet: 'monsters', col: 11, row: 6 },
  boar: { name: 'Wildschwein', sheet: 'animals', col: 7, row: 9 },
  wolf: { name: 'Wolf', sheet: 'animals', col: 6, row: 4 },
  fox: { name: 'Fuchs', sheet: 'animals', col: 3, row: 4 },
  goblin: { name: 'Goblin', sheet: 'monsters', col: 2, row: 0 },
  'small-slime': { name: 'Schleim', sheet: 'monsters', col: 0, row: 2 },
  'goblin-archer': { name: 'Goblin-Schütze', sheet: 'monsters', col: 5, row: 0 },
  'goblin-brute': { name: 'Goblin-Schläger', sheet: 'monsters', col: 7, row: 0 },
  // --- snow ---
  'polar-bear': { name: 'Eisbär', sheet: 'animals', col: 2, row: 0 },
  warg: { name: 'Schattenwolf', sheet: 'monsters', col: 10, row: 6 },
  yak: { name: 'Yak', sheet: 'animals', col: 3, row: 10 },
  reindeer: { name: 'Rentier', sheet: 'animals', col: 1, row: 10 },
  skeleton: { name: 'Skelett', sheet: 'monsters', col: 0, row: 4 },
  wendigo: { name: 'Wendigo', sheet: 'monsters', col: 1, row: 7 },
  troll: { name: 'Troll', sheet: 'monsters', col: 2, row: 1 },
  // --- desert ---
  'giant-ant': { name: 'Riesenameise', sheet: 'monsters', col: 4, row: 6 },
  cobra: { name: 'Kobra', sheet: 'animals', col: 1, row: 7 },
  'giant-spider': { name: 'Riesenspinne', sheet: 'monsters', col: 8, row: 6 },
  'monitor-lizard': { name: 'Waran', sheet: 'animals', col: 1, row: 8 },
  naga: { name: 'Naga', sheet: 'monsters', col: 4, row: 7 },
  camel: { name: 'Kamel', sheet: 'animals', col: 0, row: 10 },
  manticore: { name: 'Mantikor', sheet: 'monsters', col: 3, row: 6 },
  // --- swamp ---
  'big-slime': { name: 'Großer Schleim', sheet: 'monsters', col: 1, row: 2 },
  lampreymander: { name: 'Neunaugenmolch', sheet: 'monsters', col: 1, row: 6 },
  'giant-earthworm': { name: 'Riesenwurm', sheet: 'monsters', col: 2, row: 6 },
  alligator: { name: 'Alligator', sheet: 'animals', col: 0, row: 8 },
  zombie: { name: 'Zombie', sheet: 'monsters', col: 4, row: 4 },
  ghoul: { name: 'Ghul', sheet: 'monsters', col: 5, row: 4 },
  witch: { name: 'Sumpfhexe', sheet: 'monsters', col: 4, row: 5 },
  // --- dark forest ---
  'giant-bat': { name: 'Riesenfledermaus', sheet: 'monsters', col: 6, row: 6 },
  'giant-centipede': { name: 'Riesenläufer', sheet: 'monsters', col: 0, row: 6 },
  lycanthrope: { name: 'Werwolf', sheet: 'monsters', col: 5, row: 6 },
  satyr: { name: 'Satyr', sheet: 'monsters', col: 6, row: 7 },
  cultist: { name: 'Kultist', sheet: 'monsters', col: 3, row: 5 },
  dryad: { name: 'Dryade', sheet: 'monsters', col: 0, row: 7 },
  'forest-spirit': { name: 'Waldgeist', sheet: 'monsters', col: 5, row: 7 },
  banshee: { name: 'Todesfee', sheet: 'monsters', col: 0, row: 5 },
  // --- mountain ---
  'mountain-goat': { name: 'Steinbock', sheet: 'animals', col: 2, row: 15 },
  harpy: { name: 'Harpyie', sheet: 'monsters', col: 8, row: 7 },
  ettin: { name: 'Ettin', sheet: 'monsters', col: 0, row: 1 },
  'rock-golem': { name: 'Steingolem', sheet: 'monsters', col: 2, row: 7 },
  minotaur: { name: 'Minotaurus', sheet: 'monsters', col: 7, row: 7 },
  centaur: { name: 'Zentaur', sheet: 'monsters', col: 3, row: 7 },
  'two-headed-ettin': { name: 'Zweiköpfiger Ettin', sheet: 'monsters', col: 1, row: 1 },
  // --- ocean / storm ---
  'skeleton-archer': { name: 'Skelett-Schütze', sheet: 'monsters', col: 1, row: 4 },
  wraith: { name: 'Schemen', sheet: 'monsters', col: 2, row: 5 },
  'snapping-turtle': { name: 'Schnappschildkröte', sheet: 'animals', col: 4, row: 8 },
  'alligator-turtle': { name: 'Geierschildkröte', sheet: 'animals', col: 5, row: 8 },
  'death-knight': { name: 'Todesritter', sheet: 'monsters', col: 3, row: 4 },
  seagull: { name: 'Sturmmöwe', sheet: 'animals', col: 0, row: 11 },
  reaper: { name: 'Schnitter', sheet: 'monsters', col: 1, row: 5 },
  // --- volcano ---
  lizardfolk: { name: 'Echsenmensch', sheet: 'monsters', col: 0, row: 8 },
  kobold: { name: 'Kobold', sheet: 'monsters', col: 1, row: 9 },
  imp: { name: 'Teufelchen', sheet: 'monsters', col: 1, row: 11 },
  cockatrice: { name: 'Hahnenbasilisk', sheet: 'monsters', col: 3, row: 8 },
  basilisk: { name: 'Basilisk', sheet: 'monsters', col: 4, row: 8 },
  drake: { name: 'Drakon', sheet: 'monsters', col: 1, row: 8 },
  dragon: { name: 'Drache', sheet: 'monsters', col: 2, row: 8 },
  // --- arcane arena ---
  'orc-wizard': { name: 'Ork-Hexer', sheet: 'monsters', col: 1, row: 0 },
  'goblin-mage': { name: 'Goblin-Magier', sheet: 'monsters', col: 6, row: 0 },
  lich: { name: 'Lich', sheet: 'monsters', col: 2, row: 4 },
  gorgon: { name: 'Gorgone', sheet: 'monsters', col: 9, row: 7 },
  'faceless-monk': { name: 'Gesichtsloser Mönch', sheet: 'monsters', col: 0, row: 3 },
  'orc-blademaster': { name: 'Ork-Klingenmeister', sheet: 'monsters', col: 3, row: 0 },
  'unholy-cardinal': { name: 'Unheiliger Kardinal', sheet: 'monsters', col: 1, row: 3 },
  // --- ruins ---
  orc: { name: 'Ork', sheet: 'monsters', col: 0, row: 0 },
  'small-myconid': { name: 'Kleiner Pilzling', sheet: 'monsters', col: 0, row: 10 },
  'large-myconid': { name: 'Großer Pilzling', sheet: 'monsters', col: 1, row: 10 },
  'slime-body': { name: 'Schleimwesen', sheet: 'monsters', col: 2, row: 2 },
  hyena: { name: 'Hyäne', sheet: 'animals', col: 2, row: 4 },
  'orc-warchief': { name: 'Ork-Kriegsherr', sheet: 'monsters', col: 4, row: 0 },
  // --- void ---
  'writhing-mass': { name: 'Windende Masse', sheet: 'monsters', col: 0, row: 12 },
  'large-writhing-mass': { name: 'Große windende Masse', sheet: 'monsters', col: 1, row: 12 },
  'writhing-humanoid': { name: 'Windender Wandler', sheet: 'monsters', col: 2, row: 12 },
  'merged-slimebodies': { name: 'Verschmolzener Schleim', sheet: 'monsters', col: 3, row: 2 },
  angel: { name: 'Erzengel', sheet: 'monsters', col: 0, row: 11 },
};

export function spriteDef(id) {
  return PLAYERS[id] || ENEMIES[id] || null;
}
