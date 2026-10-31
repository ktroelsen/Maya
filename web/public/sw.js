// Service worker: installable app, quick start, and offline use at the exhibition.
// - App shell (pages, built assets, icons): SHELL cache.
// - Content (/api/topic…, /api/health) and media (/media/…): CONTENT cache, filled as you read
//   and all at once by "Hent til offline" (offline.ts). It survives app updates.
// - Everything else under /api (the Google voice) always goes to the network.
const SHELL = 'maya-shell-v2';
const CONTENT = 'maya-content';
const PRECACHE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
const NETWORK_TIMEOUT = 4000; // ms before a slow network falls back to the saved copy

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== CONTENT).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isContent = (url) => url.pathname === '/api/health' || url.pathname === '/api/topic' || url.pathname.startsWith('/api/topic/');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Content: newest from the network, the saved copy when offline or the network is slow.
  if (isContent(url)) return event.respondWith(networkFirst(req, CONTENT));
  if (url.pathname.startsWith('/api/')) return;

  // Audio asks for byte ranges (iPhones insist on them): answer from the saved file if we have
  // it, otherwise let the request go to the network untouched.
  if (url.pathname.startsWith('/media/') && req.headers.has('range')) return event.respondWith(rangeFromCache(req));

  // Media: the saved copy at once (images rarely change), refreshed in the background.
  if (url.pathname.startsWith('/media/')) return event.respondWith(staleWhileRevalidate(req, CONTENT));

  // Pages: network first (always the newest app), the saved shell when offline.
  if (req.mode === 'navigate') {
    return event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/')),
    );
  }

  // Hashed build assets never change: saved copy first.
  if (url.pathname.startsWith('/assets/')) {
    return event.respondWith(caches.match(req).then((hit) => hit ?? fetchAndSave(req, SHELL)));
  }

  // Everything else (icons, manifest).
  event.respondWith(staleWhileRevalidate(req, SHELL));
});

function fetchAndSave(req, cacheName) {
  return fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(cacheName).then((c) => c.put(req, copy));
    }
    return res;
  });
}

function networkFirst(req, cacheName) {
  const network = fetchAndSave(req, cacheName);
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT));
  return Promise.race([network.catch(() => null), timeout]).then(async (res) => {
    if (res) return res;
    const hit = await caches.match(req, { cacheName });
    return hit ?? network; // nothing saved: wait for the network after all
  });
}

function staleWhileRevalidate(req, cacheName) {
  return caches.match(req, { cacheName }).then((hit) => {
    const fresh = fetchAndSave(req, cacheName).catch(() => hit);
    return hit ?? fresh;
  });
}

async function rangeFromCache(req) {
  const hit = await caches.match(req.url, { cacheName: CONTENT });
  if (!hit) return fetch(req);
  const blob = await hit.blob();
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  const size = blob.size;
  let start = m && m[1] ? Number(m[1]) : 0;
  let end = m && m[2] ? Number(m[2]) : size - 1;
  if (m && !m[1] && m[2]) [start, end] = [size - Number(m[2]), size - 1]; // "bytes=-500": the last 500
  if (start >= size || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  end = Math.min(end, size - 1);
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': hit.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
