import { C, clamp, rand, lerp, circle, blob, text, emoji, makeStars, median } from '../util.js';

const DUR = 40;
export default {
  id: 'pitch', name: 'Pitch Pilot', emoji: '🚀', kind: 'voice', needs: ['mic'],
  tagline: 'Hum high to climb, hum low to dive.',
  howTo: ['First, hum your lowest note, then your highest. That sets your flying range.', 'Your rocket follows your pitch. Go quiet and it sinks.', 'Grab stars, slip through the asteroid gaps. You have three shields.'],
  crowd: 'Everyone else: keep it down. A stray giggle can send the rocket into a rock.',
  unit: 'points',
  create(api) {
    let phase = 'calLow', pt = 0, lows = [], highs = [], lo = 110, hi = 300;
    const ship = { x: 0, y: 0, inv: 0, trail: [] };
    let gates = [], stars = [], shields = 3, t = 0, gateT = 0, starT = 1.2, scroll = 0;
    const field = makeStars(140, 11);
    ship.y = api.H * 0.5;

    const playTop = () => 120 * api.u, playBot = () => api.H - 70 * api.u;
    function yForPitch(f) { const k = clamp((Math.log(f) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))); return lerp(playBot() - 30 * api.u, playTop() + 30 * api.u, k); }
    function finishCal() {
      const l = lows.length > 4 ? median(lows) : 0, h = highs.length > 4 ? median(highs) : 0;
      lo = l || (h ? h / 2.2 : 110); hi = h || lo * 2.3;
      if (hi < lo * 1.5) hi = lo * 1.8;
      lo *= 1.05; hi /= 1.05;
      phase = 'fly'; t = 0; api.banner('Fly!', { color: C.mint });
    }
    return {
      start() { phase = 'calLow'; pt = 0; },
      update(dt) {
        const u = api.u, W = api.W, H = api.H; pt += dt; scroll += dt * (phase === 'fly' ? 260 : 60) * u;
        const f = api.mic.pitch;
        if (phase === 'calLow') {
          api.hint('Hum your LOWEST comfy note…'); if (f) lows.push(f);
          if (pt > 2.6) { phase = 'calHigh'; pt = 0; api.sfx.point(); }
          ship.y = lerp(ship.y, playBot() - 40 * u, 0.1); return;
        }
        if (phase === 'calHigh') {
          api.hint('Now your HIGHEST note!'); if (f) highs.push(f);
          if (pt > 2.6) finishCal();
          ship.y = lerp(ship.y, playTop() + 40 * u, 0.1); return;
        }
        if (phase === 'dead') return;
        t += dt; api.timer(1 - t / DUR); api.hint('');
        ship.x = W * 0.22;
        if (f) ship.y = lerp(ship.y, yForPitch(f), clamp(dt * 7));
        else ship.y = Math.min(playBot() - 20 * u, ship.y + 0.22 * H * dt);
        ship.trail.push({ x: ship.x, y: ship.y }); if (ship.trail.length > 40) ship.trail.shift();
        ship.inv -= dt;
        const speed = (270 + t * 3) * u;
        gateT -= dt; starT -= dt;
        if (gateT <= 0) { const gap = lerp(0.42, 0.3, t / DUR) * (playBot() - playTop()); gates.push({ x: W + 40 * u, w: 70 * u, cy: rand(playTop() + gap / 2, playBot() - gap / 2), gap, passed: false, hit: false }); gateT = 2.3; }
        if (starT <= 0) { stars.push({ x: W + 40 * u, y: rand(playTop() + 30 * u, playBot() - 30 * u), got: false, ph: rand(6) }); starT = rand(0.7, 1.3); }
        for (const g of gates) g.x -= speed * dt; for (const s of stars) s.x -= speed * dt;
        gates = gates.filter((g) => g.x > -100 * u); stars = stars.filter((s) => s.x > -50 && !s.got);
        const r = 26 * u;
        for (const g of gates) {
          if (!g.passed && g.x + g.w < ship.x) { g.passed = true; if (!g.hit) api.add(1, ship.x, ship.y - 50 * u, '+1 gate', C.mint); }
          const inX = ship.x + r > g.x && ship.x - r < g.x + g.w;
          if (inX && !g.hit && ship.inv <= 0 && (ship.y - r < g.cy - g.gap / 2 || ship.y + r > g.cy + g.gap / 2)) {
            g.hit = true; shields--; ship.inv = 1.4; api.sfx.hit(); api.fx.shake(14); api.fx.burst(ship.x, ship.y, { colors: [C.orange, C.sun, C.red], n: 22 });
            if (shields <= 0) { api.banner('Shields down!', { color: C.red }); setTimeout(() => api.end(), 900); phase = 'dead'; }
          }
        }
        for (const s of stars) if (!s.got && Math.hypot(s.x - ship.x, s.y - ship.y) < 46 * u) { s.got = true; api.add(1, s.x, s.y - 30 * u); api.sfx.coin(); api.fx.burst(s.x, s.y, { colors: [C.sun, C.cream], n: 10, speed: 200 }); }
        if (t >= DUR) { api.banner('Landed!', { color: C.mint }); phase = 'dead'; api.end(); }
      },
      idle(dt) { scroll += dt * 60 * api.u; ship.x = api.W * 0.22; ship.y = api.H * 0.5 + Math.sin(performance.now() / 400) * 20 * api.u; },
      draw(g, W, H) {
        const u = api.u;
        const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#12062E'); bg.addColorStop(1, '#3B1678'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
        for (const s of field) { const x = ((s.x * W - scroll * s.z * 0.6) % W + W) % W; g.fillStyle = `rgba(255,246,232,${0.35 + s.z * 0.6})`; g.fillRect(x, s.y * H, s.s * u * 2, s.s * u * 2); }
        circle(g, W * 0.86 - (scroll * 0.02) % (W * 1.4), H * 0.3, 90 * u, C.pink, { lw: 5 }); g.save(); g.beginPath(); g.ellipse(W * 0.86 - (scroll * 0.02) % (W * 1.4), H * 0.3, 140 * u, 26 * u, -0.3, 0, Math.PI * 2); g.strokeStyle = C.sun; g.lineWidth = 8 * u; g.stroke(); g.restore();
        for (const gt of gates) {
          const top = gt.cy - gt.gap / 2, bot = gt.cy + gt.gap / 2;
          rock(g, gt.x, playTop() - 200 * u, gt.w, top - playTop() + 200 * u, u, gt.hit); rock(g, gt.x, bot, gt.w, H - bot + 30, u, gt.hit);
        }
        for (const s of stars) emoji(g, '⭐', s.x, s.y + Math.sin(performance.now() / 200 + s.ph) * 5 * u, 46 * u);
        // trail
        g.lineCap = 'round';
        for (let i = 1; i < ship.trail.length; i++) { const a = ship.trail[i - 1], b = ship.trail[i]; const k = i / ship.trail.length; g.strokeStyle = `rgba(61,245,196,${k * 0.5})`; g.lineWidth = 10 * u * k; g.beginPath(); g.moveTo(a.x - (ship.trail.length - i) * 6 * u, a.y); g.lineTo(b.x - (ship.trail.length - i - 1) * 6 * u, b.y); g.stroke(); }
        if (ship.inv <= 0 || Math.floor(ship.inv * 10) % 2 === 0) {
          emoji(g, '🔥', ship.x - 42 * u, ship.y + 2 * u, (26 + Math.random() * 10) * u, -Math.PI / 2);
          emoji(g, '🚀', ship.x, ship.y, 64 * u, Math.PI / 4);
        }
        // shields
        for (let i = 0; i < 3; i++) emoji(g, i < shields ? '🛡️' : '▫️', W / 2 - 40 * u + i * 40 * u, 96 * u, 30 * u);
        // pitch ladder
        const lx = 30 * u; blob(g, lx, playTop(), 22 * u, playBot() - playTop(), 11 * u, 'rgba(255,246,232,.15)', { lw: 3, stroke: C.cream });
        if (api.mic.pitch && phase !== 'calLow' && phase !== 'calHigh') circle(g, lx + 11 * u, yForPitch(api.mic.pitch), 13 * u, C.mint, { lw: 4 });
        if (phase === 'calLow' || phase === 'calHigh') {
          const low = phase === 'calLow';
          text(g, low ? 'Lowest note' : 'Highest note', W / 2, H * 0.36, { size: 72 * u, color: low ? C.sky : C.pink });
          emoji(g, low ? '⬇️' : '⬆️', W / 2, H * 0.52 + Math.sin(performance.now() / 150) * 10 * u, 80 * u);
          text(g, api.mic.pitch ? `${Math.round(api.mic.pitch)} Hz` : 'hmmmm…', W / 2, H * 0.68, { size: 40 * u, color: C.cream });
          const p = clamp(pt / 2.6); blob(g, W / 2 - 160 * u, H * 0.76, 320 * u, 18 * u, 9 * u, C.cream, { lw: 3 }); blob(g, W / 2 - 160 * u, H * 0.76, 320 * u * p, 18 * u, 9 * u, C.sun, { lw: 3 });
        }
      },
    };
  },
};

function rock(g, x, y, w, h, u, hit) {
  blob(g, x, y, w, h, 18 * u, hit ? '#7a4d8f' : '#6B4BA8', { lw: 5 });
  g.fillStyle = 'rgba(26,16,51,.35)';
  for (let k = 0; k < h / (60 * u); k++) { g.beginPath(); g.arc(x + w * (k % 2 ? 0.35 : 0.65), y + 30 * u + k * 60 * u, 9 * u, 0, Math.PI * 2); g.fill(); }
}
