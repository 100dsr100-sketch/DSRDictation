/* DSR Dictation - offline shell cache.
   Same-origin: network-first (new deploys picked up immediately), cache fallback offline.
   cdn.jsdelivr.net (spell dictionaries + nspell): cache-first so spell-check works offline
   after the first use. Anything else cross-origin: passthrough. */
var CACHE = 'dsr-dictation-v5';
var CDN   = 'dsr-dictation-cdn-v1';
var SHELL = ['./', './index.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== CDN; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  if (url.origin !== location.origin) {
    if (url.host === 'cdn.jsdelivr.net') {
      e.respondWith(
        caches.open(CDN).then(function (c) {
          return c.match(req).then(function (hit) {
            var net = fetch(req).then(function (res) {
              if (res && res.ok) c.put(req, res.clone());
              return res;
            }).catch(function () { return hit; });
            return hit || net;
          });
        })
      );
    }
    return;
  }

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) { return hit || caches.match('./index.html'); });
    })
  );
});
