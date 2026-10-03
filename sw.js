// Network-first: when online you always get the latest files (no need to bump
// a version after every edit); the cache is only the offline fallback.
const CACHE_NAME = 'solorpg-v8';
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'css/app.css',
  'js/util.js',
  'js/state.js',
  'js/storage.js',
  'js/oracle.js',
  'js/karteien.js',
  'js/links.js',
  'js/battle.js',
  'js/character.js',
  'js/statblock.js',
  'js/journal.js',
  'js/terrain.js',
  'js/map.js',
  'js/relations.js',
  'js/shell.js',
  'js/main.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((response) => {
      if (response && response.status === 200 && response.type === 'basic') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
      }
      return response;
    }).catch(() =>
      caches.match(e.request, { ignoreSearch: true }).then((cached) =>
        cached || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())
      )
    )
  );
});
