/* Yellfie service worker
 *
 * Designed to add zero cost when online and never serve stale code:
 *  - App code (HTML, JS, CSS, icons, fonts) while ONLINE: not touched. The browser loads it exactly
 *    as it would without a service worker. After each load the page asks us to keep a copy of the
 *    files it just used (straight from the browser's cache, no extra download) for offline use.
 *  - App code while OFFLINE (or when the page itself couldn't be reached): served from that copy.
 *  - Tracking engine + models (vendor/ and the MediaPipe CDN fallbacks, ~32 MB): CACHE-FIRST.
 *    They are pinned versions, so once downloaded they are reused instead of re-checked.
 *    Nothing large is downloaded up front — each file is cached the first time a game needs it,
 *    or all at once from Settings → Offline play.
 *
 * If you change anything inside vendor/ (e.g. a new MediaPipe version), bump TRACKERS below.
 */
const APP = 'yellfie-app-v1';
const TRACKERS = 'yellfie-trackers-mp1.2.3-v1';
const KEEP = [APP, TRACKERS];

const BASE = new URL('./', self.location).pathname;          // "/" locally, "/yellfie/" on GitHub Pages
const ROOT = new URL('./', self.location).href;
const APP_FILE = /\.(?:html|js|mjs|css|svg|png|jpg|jpeg|webp|woff2|webmanifest|json)$/i;
const offlineClients = new Set();                            // pages that had to start from the offline copy

const isTracker = (url) =>
  (url.origin === self.location.origin && url.pathname.startsWith(BASE + 'vendor/')) ||
  url.href.startsWith('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@') ||
  url.href.startsWith('https://storage.googleapis.com/mediapipe-models/');
const isAppRoot = (url) => url.pathname === BASE || url.pathname === BASE + 'index.html';
const sameVersion = (a, b) => ['etag', 'last-modified', 'content-length'].every((h) => a.headers.get(h) === b.headers.get(h));

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('yellfie-') && !KEEP.includes(key)) await caches.delete(key);
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch { /* unsupported */ } }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' && req.method !== 'HEAD') return;
  const url = new URL(req.url);
  if (isTracker(url)) { event.respondWith(trackerFirst(event, url)); return; }
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (req.mode === 'navigate') { event.respondWith(navigate(event, url)); return; }
  if (req.method !== 'GET' || !APP_FILE.test(url.pathname)) return;
  // online: hands off — the browser loads it exactly as without a service worker
  if (self.navigator.onLine !== false && !offlineClients.has(event.clientId)) return;
  event.respondWith(fromCopy(event, url));
});

// After a page loads (and the browser is idle) it sends the files it used; keep the same versions for offline play.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'warm') return;
  event.waitUntil((async () => {
    const cache = await caches.open(APP);
    for (const { url: u, fresh } of event.data.files || []) {
      const url = new URL(u, ROOT);
      if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE) || isTracker(url)) continue;
      if (!isAppRoot(url) && !APP_FILE.test(url.pathname)) continue;
      const key = isAppRoot(url) ? ROOT : url.origin + url.pathname;
      if (!fresh && await cache.match(key)) continue;   // unchanged since we copied it
      try {
        const res = await fetch(key);           // normally answered by the browser's cache: no extra download
        if (!res.ok || res.type !== 'basic') continue;
        const old = await cache.match(key);
        if (!old || !sameVersion(old, res)) await cache.put(key, res);
      } catch { /* offline: keep the copy we have */ }
    }
  })());
});

async function navigate(event, url) {
  try {
    const res = (await event.preloadResponse) || await fetch(event.request);
    if (res.ok && isAppRoot(url)) { const copy = res.clone(); event.waitUntil(caches.open(APP).then((c) => c.put(ROOT, copy))); }
    return res;
  } catch (e) {
    const copy = await caches.match(ROOT, { cacheName: APP });
    if (copy && event.resultingClientId) offlineClients.add(event.resultingClientId);
    return copy || Response.error();
  }
}

async function fromCopy(event, url) {
  const key = url.origin + url.pathname;
  try { return await fetch(event.request); }
  catch (e) { return (await caches.match(key, { cacheName: APP })) || Response.error(); }
}

async function trackerFirst(event, url) {
  const cache = await caches.open(TRACKERS);
  const key = url.href.split('#')[0];
  const hit = await cache.match(key);
  // the app checks whether bundled files exist with HEAD requests, so answer those from the cache too
  if (hit) return event.request.method === 'HEAD' ? new Response(null, { status: 200, headers: hit.headers }) : hit;
  const res = await fetch(event.request);
  if (event.request.method === 'GET' && res.ok && (res.type === 'basic' || res.type === 'cors')) {
    const copy = res.clone(); event.waitUntil(cache.put(key, copy));
  }
  return res;
}
