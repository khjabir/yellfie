// Shared math + canvas drawing helpers.
export const C = {
  ink: '#1A1033', grape: '#2A0E5C', grape2: '#3B1678', pink: '#FF2E88', mint: '#3DF5C4',
  sun: '#FFD23F', sky: '#4DA8FF', cream: '#FFF6E8', orange: '#FF7A3D', red: '#FF4D5E', lime: '#9BF54A',
};
export const DISPLAY = "'Bagel Fat One', 'Arial Rounded MT Bold', system-ui, sans-serif";
export const UI = "'Gabarito', system-ui, sans-serif";
export const EMOJI = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";

export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const ease = { out: (t) => 1 - (1 - t) ** 3, in: (t) => t * t * t, inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2), back: (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2 };
export function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function sample(arr, n) { return shuffle(arr).slice(0, n); }
export function median(arr) { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
export function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// distance from point p to segment ab
export function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y; const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0; t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
// does segment ab pass within r of point c
export const segHitsCircle = (a, b, c, r) => segDist(c, a, b) <= r;
export const angleOf = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
export function angleDiff(a, b) { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; }
export const deg = (d) => (d * Math.PI) / 180;

// ---------- drawing ----------
export function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export function blob(g, x, y, w, h, r, fill, { stroke = C.ink, lw = 4, shadow = 0 } = {}) {
  if (shadow) { rrect(g, x + shadow, y + shadow, w, h, r); g.fillStyle = C.ink; g.fill(); }
  rrect(g, x, y, w, h, r); g.fillStyle = fill; g.fill();
  if (lw) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}
export function circle(g, x, y, r, fill, { stroke = C.ink, lw = 4 } = {}) {
  g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (lw) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}
export function text(g, str, x, y, { size = 48, color = C.cream, stroke = C.ink, sw, align = 'center', base = 'middle', font = DISPLAY, weight = '400', alpha = 1, maxWidth } = {}) {
  g.save(); g.globalAlpha *= alpha;
  g.font = `${weight} ${size}px ${font}`; g.textAlign = align; g.textBaseline = base; g.lineJoin = 'round';
  if (stroke) { g.lineWidth = sw ?? Math.max(3, size * 0.18); g.strokeStyle = stroke; g.strokeText(str, x, y, maxWidth); }
  g.fillStyle = color; g.fillText(str, x, y, maxWidth); g.restore();
}

// emoji are rasterised once per size so drawing dozens per frame stays cheap
const emojiCache = new Map();
export function emojiSprite(ch, size) {
  const s = Math.max(8, Math.round(size / 4) * 4); const key = ch + '|' + s;
  let c = emojiCache.get(key);
  if (!c) {
    c = document.createElement('canvas'); const pad = Math.ceil(s * 0.25); c.width = c.height = s + pad * 2;
    const x = c.getContext('2d'); x.font = `${s}px ${EMOJI}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(ch, c.width / 2, c.height / 2 + s * 0.06); c._s = s; emojiCache.set(key, c);
    if (emojiCache.size > 400) emojiCache.delete(emojiCache.keys().next().value);
  }
  return c;
}
export function emoji(g, ch, x, y, size, rot = 0, alpha = 1) {
  const sp = emojiSprite(ch, size); const k = size / sp._s;
  g.save(); g.globalAlpha *= alpha; g.translate(x, y); if (rot) g.rotate(rot); g.scale(k, k);
  g.drawImage(sp, -sp.width / 2, -sp.height / 2); g.restore();
}
export function emojiHalf(g, ch, x, y, size, rot, side) {
  const sp = emojiSprite(ch, size); const k = size / sp._s;
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(k, k);
  g.beginPath(); side < 0 ? g.rect(-sp.width / 2, -sp.height / 2, sp.width / 2, sp.height) : g.rect(0, -sp.height / 2, sp.width / 2, sp.height); g.clip();
  g.drawImage(sp, -sp.width / 2, -sp.height / 2); g.restore();
}

// simple pseudo-random generator for repeatable layouts
export function rng(seed = 1) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// star field helper
export function makeStars(n, seed = 7) { const r = rng(seed); return Array.from({ length: n }, () => ({ x: r(), y: r(), s: 0.4 + r() * 1.8, z: 0.2 + r() * 0.8 })); }
