// Precache-everything service worker.
// Release ritual: bump CACHE, commit, push. Without the bump, browsers keep
// serving the previous version from this cache.
const CACHE = 'rechenritter-v5';
const FONT_CACHE = 'rechenritter-fonts-v1';

// Kept in sync by hand with js/biomes.js — tools/build-assets.py writes these.
const BACKGROUNDS = [
  'arcane-1', 'arcane-2', 'darkforest-1', 'darkforest-2',
  'desert-1', 'desert-2', 'desert-boss', 'forest-1', 'forest-2',
  'mountain-1', 'mountain-2', 'ocean-1', 'ocean-2', 'ocean-boss',
  'ruins-1', 'ruins-2', 'snow-1', 'snow-2', 'snow-boss',
  'swamp-1', 'swamp-2', 'void-1', 'void-2',
  'volcano-1', 'volcano-2', 'volcano-boss',
].map((name) => './assets/bg/' + name + '.webp');

const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './css/effects.css',
  './js/main.js',
  './js/config.js',
  './js/game.js',
  './js/biomes.js',
  './js/picker.js',
  './js/stats.js',
  './js/achievements.js',
  './js/storage.js',
  './js/audio.js',
  './js/music.js',
  './js/sprites.js',
  './js/fx.js',
  './js/ui.js',
  './js/daily.js',
  './js/familiars.js',
  './assets/sprites/manifest.js',
  './assets/sprites/rogues.png',
  './assets/sprites/monsters.png',
  './assets/sprites/animals.png',
  './assets/familiars/familiars.png',
  './manifest.webmanifest',
  './favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
].concat(BACKGROUNDS);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache:'reload' bypasses the HTTP cache — without it a new worker can
      // precache stale copies (GitHub Pages serves max-age=600) into a fresh cache.
      .then((cache) => Promise.all(
        ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => null)),
      ))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE && key !== FONT_CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const isFont = (url) =>
  url.indexOf('https://fonts.googleapis.com') === 0
  || url.indexOf('https://fonts.gstatic.com') === 0;

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Google Fonts land in their own cache so the pixel font survives offline.
  if (isFont(event.request.url)) {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) => cache.match(event.request).then((hit) => hit
        || fetch(event.request).then((res) => {
          cache.put(event.request, res.clone());
          return res;
        }).catch(() => hit))),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then((cached) => cached || fetch(event.request)),
  );
});
