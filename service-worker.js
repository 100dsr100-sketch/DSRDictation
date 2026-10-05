/* DSR Dictation - offline shell cache.
   Same-origin app files: network-first with cache:'no-cache' (a new deploy is picked up on the next open -
   a cheap 304 when nothing changed), the saved copy is the offline fallback.
   vendor/ (the on-device speech runtime, ~22 MB): cache-first - it only changes with a new library version,
   which gets a new VENDOR cache name. Network-first would re-save 22 MB into the cache on every visit.
   cdn.jsdelivr.net (spell dictionaries + nspell): cache-first so spell-check works offline after first use.
   The speech models themselves live in transformers.js's own 'transformers-cache' - never touched here. */
var CACHE  = 'dsr-dictation-v3a';
var VENDOR = 'dsr-dictation-vendor-tjs381';
var CDN    = 'dsr-dictation-cdn-v1';
var SHELL = ['./', './index.html', './app.js', './dsr-speech.js', './speech-worker.js', './manifest.json',
             './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './dsr-move.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).catch(function () {}).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      // only our own old caches - NOT 'transformers-cache' (the downloaded speech models)
      return Promise.all(keys.filter(function (k) { return k.indexOf('dsr-dictation-') === 0 && k !== CACHE && k !== CDN && k !== VENDOR; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function cacheFirst(name, req) {
  return caches.open(name).then(function (c) {
    return c.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) { if (res && res.ok) c.put(req, res.clone()); return res; });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  if (url.origin !== location.origin) {
    if (url.host === 'cdn.jsdelivr.net') e.respondWith(cacheFirst(CDN, req));
    return;
  }
  if (url.pathname.indexOf('/vendor/') >= 0) { e.respondWith(cacheFirst(VENDOR, req).then(withCOI)); return; }

  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return withCOI(res);
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) { return withCOI(hit) || caches.match('./index.html').then(withCOI); });
    })
  );
});

/* Cross-origin isolation (-> multi-threaded speech engine). The Pages site sends these headers itself
   (_headers); this is the backup for pages served from the offline cache. "credentialless" keeps
   cross-origin downloads (models, dictionaries) working without them needing CORP headers. */
function withCOI(res) {
  if (!res || res.status === 0 || res.type === 'opaque' || res.type === 'opaqueredirect') return res;
  var h = new Headers(res.headers);
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'credentialless');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
