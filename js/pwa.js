// Installable app support: service worker registration, install prompt, offline tracker download.
import { trackerUrls } from './vision.js';

const TRACKERS = 'yellfie-trackers-mp1.2.3-v1'; // keep in sync with sw.js
const standalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const pwa = {
  get installed() { return standalone(); },
  canPrompt: false,                                     // Chrome / Edge / Android offer a native install dialog
  get iosManual() { return ios && !standalone(); },     // iPhone / iPad: Share → Add to Home Screen
  offlineCapable: 'serviceWorker' in navigator && 'caches' in window && window.isSecureContext,
};

let deferred = null, listeners = [];
const idle = (fn) => setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 4000 }) : fn()), 1500);
const changed = () => listeners.forEach((f) => f());
export const onPwaChange = (f) => listeners.push(f);

export function initPwa() {
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; pwa.canPrompt = true; changed(); });
  addEventListener('appinstalled', () => { deferred = null; pwa.canPrompt = false; changed(); });
  if (!pwa.offlineCapable) return;
  // ?nosw switches the service worker off (handy while developing on a shared localhost port)
  if (new URLSearchParams(location.search).has('nosw')) {
    const wipe = () => caches.keys().then((ks) => ks.filter((k) => k.startsWith('yellfie-')).forEach((k) => caches.delete(k)));
    navigator.serviceWorker.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister()))).then(wipe);
    addEventListener('load', () => setTimeout(wipe, 500), { once: true });
    return;
  }
  const register = () => navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => idle(() => {
      // keep an offline copy of exactly the files this page used. Files the browser served from its own
      // cache haven't changed, so only freshly downloaded (or never copied) ones need any work.
      const files = performance.getEntriesByType('resource')
        .filter((e) => e.name.startsWith(location.origin) && !e.name.includes('/vendor/'))
        .map((e) => ({ url: e.name, fresh: !(e.transferSize >= 0) || e.transferSize > e.encodedBodySize }));
      reg.active?.postMessage({ type: 'warm', files });
    }))
    .catch((e) => console.warn('[yellfie] service worker not registered', e));
  // register after the page has loaded so it never competes with the first paint
  if (document.readyState === 'complete') register(); else addEventListener('load', register, { once: true });
}

export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }));
  deferred = null; pwa.canPrompt = false; changed();
  return outcome === 'accepted';
}

// ---------- offline trackers ----------
export async function offlineStatus() {
  if (!pwa.offlineCapable) return { saved: 0, total: 0 };
  const urls = await trackerUrls(); const cache = await caches.open(TRACKERS);
  let saved = 0; for (const u of urls) if (await cache.match(u)) saved++;
  return { saved, total: urls.length };
}

export async function downloadTrackers(onProgress) {
  const urls = await trackerUrls(); const cache = await caches.open(TRACKERS);
  const todo = []; for (const u of urls) if (!(await cache.match(u))) todo.push(u);
  const sizes = await Promise.all(todo.map((u) => fetch(u, { method: 'HEAD' }).then((r) => +r.headers.get('content-length') || 0).catch(() => 0)));
  const total = sizes.reduce((a, b) => a + b, 0) || 1; let done = 0;
  for (const u of todo) {
    const res = await fetch(u, { mode: 'cors' });
    if (!res.ok) throw new Error(`${u} → HTTP ${res.status}`);
    // with a service worker in control it saves the file as it streams through; otherwise save it here
    const viaSw = !!navigator.serviceWorker?.controller;
    const [a, b] = res.body.tee();
    const save = viaSw ? b.cancel() : cache.put(u, new Response(b, { headers: res.headers }));
    const reader = a.getReader();
    for (;;) { const { done: end, value } = await reader.read(); if (end) break; done += value.length; onProgress?.(Math.min(0.99, done / total)); }
    await save;
    for (let k = 0; k < 80 && !(await cache.match(u)); k++) await new Promise((r) => setTimeout(r, 100));
  }
  onProgress?.(1);
  return offlineStatus();
}
