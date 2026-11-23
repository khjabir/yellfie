// Keeps the screen from dimming or locking while the party is on (Screen Wake Lock API).
// Browsers drop the lock whenever the tab is hidden, so it is requested again when you come back.
export const wake = { supported: 'wakeLock' in navigator, active: false, error: '' };

let lock = null, wanted = false, pending = false;

async function acquire() {
  if (!wanted || !wake.supported || pending || document.visibilityState !== 'visible') return;
  if (lock && !lock.released) return;
  pending = true;
  try {
    lock = await navigator.wakeLock.request('screen');
    wake.active = true; wake.error = '';
    lock.addEventListener('release', () => { wake.active = false; lock = null; });
    if (!wanted) release(); // switched off while the request was in flight
  } catch (e) {
    // e.g. NotAllowedError when battery saver is on, or no user interaction yet on some browsers
    wake.active = false; wake.error = e?.name || 'Error';
  } finally { pending = false; }
}

async function release() {
  const l = lock; lock = null; wake.active = false;
  try { await l?.release(); } catch { /* already released */ }
}

export function keepAwake(on) { wanted = !!on; if (wanted) acquire(); else release(); }

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') acquire(); });
// retry on the next tap if an earlier request was refused
['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { if (wanted && !wake.active) acquire(); }, { passive: true }));

export function wakeStatus() {
  if (!wake.supported) return window.isSecureContext
    ? "This browser can't keep the screen on. Set your phone's Auto-Lock / Screen timeout to a longer time while you play."
    : 'Only works on https:// or localhost pages.';
  if (!wanted) return 'Off. The screen follows your device\'s timeout.';
  if (wake.active) return 'On. The screen will stay awake while Yellfie is open.';
  if (wake.error === 'NotAllowedError') return 'Your device refused, usually because battery saver is on. Turn it off, or set a longer screen timeout.';
  return 'Will switch on at your next tap.';
}
