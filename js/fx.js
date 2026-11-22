// Particles, floating text, banners, screen shake and flashes for the game canvas.
import { C, rand, pick, text, emoji, circle, clamp, ease } from './util.js';

export class Fx {
  constructor() { this.parts = []; this.shakeT = 0; this.shakeMag = 0; this.flashT = 0; this.flashMax = 1; this.flashColor = '#fff'; }
  clear() { this.parts.length = 0; this.shakeT = 0; this.flashT = 0; }
  burst(x, y, { n = 16, colors = [C.sun, C.pink, C.mint, C.sky], speed = 320, size = 7, life = 0.8, grav = 700, emojis = null, spread = Math.PI * 2, dir = -Math.PI / 2 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread; const v = speed * (0.35 + Math.random() * 0.8);
      this.parts.push({ k: emojis ? 'emoji' : 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, t: 0, grav, size: size * (0.6 + Math.random() * 0.8), color: pick(colors), ch: emojis ? pick(emojis) : null, rot: rand(-3, 3), vr: rand(-8, 8) });
    }
  }
  float(x, y, str, { color = C.sun, size = 38, life = 0.9 } = {}) { this.parts.push({ k: 'text', x, y, vy: -90, str, color, size, life, t: 0 }); }
  ring(x, y, { color = C.cream, r0 = 10, r1 = 120, life = 0.45, lw = 8 } = {}) { this.parts.push({ k: 'ring', x, y, color, r0, r1, life, lw, t: 0 }); }
  banner(str, { color = C.sun, size = 110, life = 1.1, y = null, sub = null } = {}) { this.parts.push({ k: 'banner', str, color, size, life, t: 0, y, sub }); }
  shake(mag = 12, t = 0.35) { this.shakeMag = Math.max(this.shakeMag, mag); this.shakeT = Math.max(this.shakeT, t); }
  flash(color = '#fff', t = 0.25) { this.flashColor = color; this.flashT = t; this.flashMax = t; }
  offset() {
    if (this.shakeT <= 0) return { x: 0, y: 0 };
    const m = this.shakeMag * clamp(this.shakeT / 0.35); return { x: rand(-m, m), y: rand(-m, m) };
  }
  update(dt) {
    this.shakeT -= dt; if (this.shakeT <= 0) this.shakeMag = 0; this.flashT -= dt;
    for (const p of this.parts) {
      p.t += dt;
      if (p.k === 'dot' || p.k === 'emoji') { p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
      else if (p.k === 'text') { p.y += p.vy * dt; p.vy *= 0.96; }
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
  }
  draw(g, W, H) {
    for (const p of this.parts) {
      const k = p.t / p.life;
      if (p.k === 'dot') circle(g, p.x, p.y, p.size * (1 - k * 0.6), p.color, { lw: 2.5 });
      else if (p.k === 'emoji') emoji(g, p.ch, p.x, p.y, p.size * 4, p.rot, 1 - k * k);
      else if (p.k === 'text') text(g, p.str, p.x, p.y, { size: p.size * (k < 0.15 ? 0.6 + k * 2.7 : 1), color: p.color, alpha: 1 - Math.max(0, k - 0.6) / 0.4 });
      else if (p.k === 'ring') { g.save(); g.globalAlpha = 1 - k; g.beginPath(); g.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * ease.out(k), 0, Math.PI * 2); g.lineWidth = p.lw; g.strokeStyle = p.color; g.stroke(); g.restore(); }
      else if (p.k === 'banner') {
        const s = k < 0.18 ? ease.back(k / 0.18) : 1; const a = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
        const size = Math.min(p.size, W / Math.max(4, p.str.length * 0.62));
        g.save(); g.translate(W / 2, p.y ?? H * 0.42); g.scale(s, s); g.rotate(-0.04);
        text(g, p.str, 0, 0, { size, color: p.color, alpha: a, sw: size * 0.2 });
        if (p.sub) text(g, p.sub, 0, size * 0.75, { size: size * 0.32, color: C.cream, alpha: a });
        g.restore();
      }
    }
    if (this.flashT > 0) { g.save(); g.globalAlpha = clamp(this.flashT / this.flashMax) * 0.6; g.fillStyle = this.flashColor; g.fillRect(0, 0, W, H); g.restore(); }
  }
}

// Full-page confetti for the results screen
export function confetti(canvas, { n = 180, dur = 3800 } = {}) {
  const g = canvas.getContext('2d'); const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cols = [C.sun, C.pink, C.mint, C.sky, C.orange, C.cream];
  const ps = Array.from({ length: n }, () => ({ x: rand(innerWidth), y: rand(-innerHeight * 0.6, -10), vx: rand(-60, 60), vy: rand(120, 320), w: rand(8, 14), h: rand(12, 22), r: rand(6), vr: rand(-6, 6), c: pick(cols), sway: rand(2, 5), ph: rand(6) }));
  const t0 = performance.now(); let last = t0;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; const el = now - t0;
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of ps) {
      p.x += (p.vx + Math.sin(el / 1000 * p.sway + p.ph) * 40) * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.scale(1, Math.sin(el / 160 + p.ph));
      g.fillStyle = p.c; g.strokeStyle = C.ink; g.lineWidth = 2; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
    }
    if (el < dur) requestAnimationFrame(tick); else g.clearRect(0, 0, innerWidth, innerHeight);
  }
  requestAnimationFrame(tick);
}
