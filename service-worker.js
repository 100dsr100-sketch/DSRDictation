/* DSR Dictation - offline shell cache.
   Same-origin: network-first (new deploys picked up immediately), cache fallback offline.
   cdn.jsdelivr.net (spell dictionaries + nspell): cache-first so spell-check works offline
   after the first use. Anything else cross-origin: passthrough. */
var CACHE = 'dsr-dictation-v12';
var CDN   = 'dsr-dictation-cdn-v1';
var SHELL = ['./', './index.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './whisper-worker.js', './vendor/transformers.min.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      // only our own old shell caches – NOT 'transformers-cache' (the downloaded Whisper models),
      // which this used to wipe on every app update, forcing a full re-download
      return Promise.all(keys.filter(function (k) { return k.indexOf('dsr-dictation-') === 0 && k !== CACHE && k !== CDN; })
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
      return withCOI(res);
    }).catch(function () {
      return caches.match(req).then(function (hit) { return withCOI(hit) || caches.match('./index.html').then(withCOI); });
    })
  );
});

/* Cross-origin isolation. GitHub Pages can't send COOP/COEP headers, so we add them here.
   Isolation unlocks SharedArrayBuffer → multi-threaded WASM for the offline Whisper engine
   (single-threaded, a phone took over a minute per phrase). COEP "credentialless" keeps
   cross-origin CDN/model downloads working without them needing CORP headers. */
function withCOI(res) {
  if (!res || res.status === 0 || res.type === 'opaque' || res.type === 'opaqueredirect') return res;
  var h = new Headers(res.headers);
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'credentialless');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
