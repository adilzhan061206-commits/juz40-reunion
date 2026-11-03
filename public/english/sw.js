/* Offline cache for the 625-words app. Scope: this folder. */
var VERSION = 'w30-v1';
var SHELL = VERSION + '-shell';
var IMAGES = 'w30-images';
var FILES = ['./', 'index.html', 'style.css', 'app.js', 'words.json', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== SHELL && k !== IMAGES; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // App files: serve from cache instantly, refresh in the background.
  if (url.origin === self.location.origin) {
    e.respondWith(caches.open(SHELL).then(function (cache) {
      return cache.match(req, { ignoreSearch: true }).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(function () { return hit || (req.mode === 'navigate' ? cache.match('index.html') : undefined); });
        return hit || net;
      });
    }));
    return;
  }

  // Real photos (cross-origin <img>): cache-first so they show again offline.
  if (req.destination === 'image') {
    e.respondWith(caches.open(IMAGES).then(function (cache) {
      return cache.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        });
      });
    }));
  }
  // Photo search APIs: network only (results are remembered in localStorage).
});
