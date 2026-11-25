import { C, clamp, rand, pick, lerp, dist, circle, text, emoji, emojiHalf, segDist } from '../util.js';
import { handScreen, drawHand } from './body.js';

const FRUITS = [['🍉', '#FF4D5E'], ['🍊', '#FF9F1C'], ['🍎', '#E63946'], ['🍍', '#FFD23F'], ['🥝', '#9BF54A'], ['🍓', '#FF2E55'], ['🍌', '#FFE66D'], ['🍇', '#9B5DE5'], ['🍑', '#FFA07A'], ['🥥', '#F1E3D3']];
const BLADE_COLORS = [C.mint, C.pink];
// sword length = finger length × factor, kept between min and max (in UI units)
const BLADES = { tip: [0, 0, 0], small: [0.55, 28, 80], medium: [1.05, 50, 140], large: [1.6, 70, 210] };
const DUR = 40;

export default {
  id: 'fruit', name: 'Fruit Karate', emoji: '🍉', kind: 'camera', needs: ['hands'],
  tagline: 'Your index finger is a sword. Chop the flying fruit.',
  howTo: ['Point your index finger at the screen. A glowing sword grows out of your fingertip. Pick its length below.', 'Swipe the blade through the fruit, fast. Both hands work. Slice several at once for combos. Stars are worth 5.', 'Bombs cost a heart. Lose three hearts and you are out.'],
  crowd: 'Everyone else: shout "HIYAA!" on every chop.',
  ready: "Stand about an arm's length back and point your index finger at the screen.",
  unit: 'fruit',
  options: [{ key: 'blade', label: 'Sword length', default: 'small', choices: [['tip', 'Fingertip only'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']] }],
  create(api) {
    let items = [], halves = [], t = 0, spawnT = 1.4, lives = 3, combo = [], over = false;
    const tracks = []; // one per visible hand: { tip, end, P, t, seen, trail, color }
    const grav = () => api.H * 1.25;

    function spawn() {
      const n = 1 + (t > 10 ? 1 : 0) + (t > 24 && Math.random() < 0.4 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const bombP = clamp(0.08 + (t / DUR) * 0.14); const r = rand(1) < 0.05 ? 'star' : rand(1) < bombP ? 'bomb' : 'fruit';
        const x = rand(0.15, 0.85) * api.W; const peak = rand(0.35, 0.8) * api.H;
        const [ch, juice] = r === 'bomb' ? ['💣', '#333'] : r === 'star' ? ['🌟', C.sun] : pick(FRUITS);
        items.push({ ch, juice, kind: r, x, y: api.H + 60 * api.u, vx: (api.W / 2 - x) * rand(0.1, 0.5), vy: -Math.sqrt(2 * grav() * peak), r: 54 * api.u, rot: rand(6), vr: rand(-3, 3) });
      }
      spawnT = rand(0.7, 1.15) * (t > 25 ? 0.8 : 1);
    }

    // blade = fingertip (landmark 8) extended along the finger (5 → 8); length from the game option
    const [bk, bmin, bmax] = BLADES[api.option('blade')] || BLADES.small;
    const hitPad = (bk ? 6 : 16) * api.u; // a bare fingertip gets a slightly bigger hit zone
    function blade(P) {
      const tip = P[8], base = P[5]; let dx = tip.x - base.x, dy = tip.y - base.y; const fl = Math.hypot(dx, dy) || 1; dx /= fl; dy /= fl;
      const len = bk ? clamp(Math.max(fl, dist(P[0], P[9]) * 0.8) * bk, bmin * api.u, bmax * api.u) : 0;
      return { tip, end: { x: tip.x + dx * len, y: tip.y + dy * len } };
    }
    function trackHands(now) {
      const hands = api.vision.hands || []; const used = new Set();
      for (const h of hands) {
        const P = handScreen(api, h); const b = blade(P);
        let tr = null, bd = api.W * 0.4;
        for (const c of tracks) if (!used.has(c) && c.tip && dist(c.tip, b.tip) < bd) { bd = dist(c.tip, b.tip); tr = c; }
        if (!tr && tracks.length < 2) { tr = { trail: [], color: BLADE_COLORS.find((c) => !tracks.some((x) => x.color === c)) || C.mint }; tracks.push(tr); }
        if (!tr) continue; used.add(tr); tr.seen = now; tr.P = P;
        if (tr.t === h.t) continue; // same camera frame as last time
        if (tr.tip && h.t - tr.t < 180 && !over) {
          const dtd = (h.t - tr.t) / 1000; const speed = Math.max(dist(tr.tip, b.tip), dist(tr.end, b.end)) / dtd;
          if (speed > api.H * 0.45) {
            const mid0 = { x: (tr.tip.x + tr.end.x) / 2, y: (tr.tip.y + tr.end.y) / 2 }, mid1 = { x: (b.tip.x + b.end.x) / 2, y: (b.tip.y + b.end.y) / 2 };
            const segs = [[tr.tip, b.tip], [tr.end, b.end], [mid0, mid1], [b.tip, b.end]];
            for (const it of items) if (!it.cut && segs.some(([a, c]) => segDist(it, a, c) < it.r * 0.9 + hitPad)) slice(it, { x: b.tip.x - tr.tip.x, y: b.tip.y - tr.tip.y });
          }
        }
        tr.tip = b.tip; tr.end = b.end; tr.t = h.t; tr.trail.push({ tip: b.tip, end: b.end, at: now });
      }
      for (let i = tracks.length - 1; i >= 0; i--) if (now - tracks[i].seen > 350) tracks.splice(i, 1);
      for (const tr of tracks) tr.trail = tr.trail.filter((q) => now - q.at < 150);
    }
    function slice(it, dir) {
      it.cut = true;
      if (it.kind === 'bomb') {
        lives--; api.sfx.crash(); api.fx.flash(C.red, 0.35); api.fx.shake(24, 0.5); api.fx.burst(it.x, it.y, { n: 16, emojis: ['💥', '🔥'], speed: 500 });
        api.fx.float(it.x, it.y - 40, '-1 ❤️', { color: C.red });
        if (lives <= 0) { over = true; api.banner('Boom! Out!', { color: C.red }); setTimeout(() => api.end(), 1200); }
        return;
      }
      const pts = it.kind === 'star' ? 5 : 1;
      api.add(pts, it.x, it.y - 50 * api.u); api.sfx.slice(); api.sfx.splat();
      api.fx.burst(it.x, it.y, { n: 14, colors: [it.juice, C.cream], speed: 380, size: 7 });
      const ang = Math.atan2(dir.y, dir.x);
      for (const side of [-1, 1]) halves.push({ ch: it.ch, x: it.x, y: it.y, vx: it.vx + side * 160 + dir.x * 2, vy: it.vy * 0.3 - 150, rot: ang + Math.PI / 2, vr: side * 5, side, r: it.r });
      combo.push(t); combo = combo.filter((c) => t - c < 0.45);
      if (combo.length >= 3) { const b = combo.length; api.add(b, api.W / 2, api.H * 0.3, `COMBO x${b}! +${b}`, C.pink); api.sfx.success(); combo = []; }
    }
    return {
      idle(dt, now) { trackHands(now); },
      start() { api.banner('Point your finger!', { color: C.mint, size: 80 * api.u }); },
      update(dt, now) {
        t += dt; trackHands(now);
        api.hint(tracks.length ? '' : 'Hold up your hand and point your index finger at the screen');
        if (!over) { spawnT -= dt; if (spawnT <= 0 && t < DUR - 1.5) spawn(); }
        const G = grav();
        for (const it of items) { it.vy += G * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.rot += it.vr * dt; }
        for (const h of halves) { h.vy += G * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.vr * dt; }
        items = items.filter((it) => !it.cut && !(it.vy > 0 && it.y > api.H + 100)); halves = halves.filter((h) => h.y < api.H + 120);
        api.timer(1 - t / DUR);
        if (t >= DUR && !over) { over = true; api.banner('Time!', { color: C.sun }); setTimeout(() => api.end(), 700); }
      },
      draw(g, W, H) {
        const u = api.u; api.camera(g); g.fillStyle = 'rgba(26,16,51,.28)'; g.fillRect(0, 0, W, H);
        for (const h of halves) emojiHalf(g, h.ch, h.x, h.y, h.r * 2, h.rot, h.side);
        for (const it of items) { if (it.kind === 'bomb') circle(g, it.x, it.y, it.r * 1.05, 'rgba(255,77,94,.25)', { lw: 0 }); emoji(g, it.ch, it.x, it.y, it.r * 2, it.rot); }
        for (const tr of tracks) {
          if (api.outlines && tr.P) drawHand(g, tr.P, { color: tr.color, lw: Math.max(3, 4 * u) });
          if (!bk) {
            // fingertip only: a glowing trail behind the tip
            g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
            for (let k = 1; k < tr.trail.length; k++) { const a = tr.trail[k - 1].tip, b = tr.trail[k].tip, f = k / tr.trail.length; g.globalAlpha = f; g.strokeStyle = tr.color; g.lineWidth = 22 * u * f; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
            g.restore();
            if (tr.tip) { circle(g, tr.tip.x, tr.tip.y, 18 * u, tr.color, { lw: 4 }); circle(g, tr.tip.x, tr.tip.y, 7 * u, '#fff', { lw: 0 }); }
            continue;
          }
          // sweep ribbon
          g.save(); g.fillStyle = tr.color;
          for (let k = 1; k < tr.trail.length; k++) {
            const a = tr.trail[k - 1], b = tr.trail[k]; g.globalAlpha = (k / tr.trail.length) * 0.45;
            g.beginPath(); g.moveTo(a.tip.x, a.tip.y); g.lineTo(a.end.x, a.end.y); g.lineTo(b.end.x, b.end.y); g.lineTo(b.tip.x, b.tip.y); g.closePath(); g.fill();
          }
          g.restore();
          if (!tr.tip) continue;
          g.save(); g.lineCap = 'round';
          g.beginPath(); g.moveTo(tr.tip.x, tr.tip.y); g.lineTo(tr.end.x, tr.end.y);
          g.strokeStyle = C.ink; g.lineWidth = 16 * u; g.stroke(); g.strokeStyle = tr.color; g.lineWidth = 11 * u; g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 4 * u; g.stroke();
          g.restore();
          circle(g, tr.tip.x, tr.tip.y, 9 * u, C.sun, { lw: 3 });
        }
        for (let i = 0; i < 3; i++) emoji(g, i < lives ? '❤️' : '🖤', W / 2 - 40 * u + i * 40 * u, 96 * u, 30 * u);
        if (!tracks.length) emoji(g, '☝️', W / 2, H * 0.55 + Math.sin(performance.now() / 200) * 10 * u, 130 * u);
      },
    };
  },
};
