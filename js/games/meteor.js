import { C, clamp, rand, lerp, circle, text, emoji, makeStars, median } from '../util.js';

const DUR = 45;
export default {
  id: 'meteor', name: 'Meteor Dodge', emoji: '☄️', kind: 'camera', needs: ['face'],
  tagline: 'Steer the rocket with your head. Dodge the space rocks.',
  howTo: ['Move your head left and right. The rocket follows your nose.', 'Every meteor you dodge is a point. Stars are worth 3.', 'Three shields. It speeds up, so stay sharp.'],
  crowd: 'Everyone else: shout "LEFT!" and "RIGHT!" — not always correctly.',
  ready: 'Sit in the middle of the camera view, face forward.',
  unit: 'points',
  create(api) {
    const ship = { x: api.W / 2, inv: 0 };
    let rocks = [], stars = [], t = 0, spawnT = 0.8, starT = 2, shields = 3, over = false, scroll = 0, baseX = [], centre = 0.5;
    const field = makeStars(160, 5);
    const SY = () => api.H * 0.8;
    return {
      idle(dt) { const f = api.vision.face; if (f) { baseX.push(f.nose.x); if (baseX.length > 60) baseX.shift(); centre = median(baseX); } scroll += dt * 60; },
      update(dt) {
        const W = api.W, H = api.H, u = api.u; t += dt; scroll += dt * (150 + t * 6);
        const f = api.vision.face;
        api.hint(f ? '' : "We can't see your face!");
        if (f) ship.x = lerp(ship.x, clamp(W / 2 + (f.nose.x - centre) * W * 2.4, 50 * u, W - 50 * u), clamp(dt * 12));
        ship.inv -= dt;
        const speed = (0.35 + t / DUR * 0.45) * H;
        spawnT -= dt;
        if (spawnT <= 0 && !over) { rocks.push({ x: rand(40, W - 40), y: -60, r: rand(26, 50) * u, vy: speed * rand(0.85, 1.2), rot: rand(6), vr: rand(-2, 2), passed: false }); spawnT = Math.max(0.28, 0.85 - t / DUR * 0.5) * rand(0.7, 1.2); }
        starT -= dt; if (starT <= 0 && !over) { stars.push({ x: rand(60, W - 60), y: -40, vy: speed * 0.8 }); starT = rand(2, 3.5); }
        for (const r of rocks) { r.y += r.vy * dt; r.rot += r.vr * dt; }
        for (const s of stars) s.y += s.vy * dt;
        for (const r of rocks) {
          if (!r.hit && ship.inv <= 0 && !over && Math.hypot(r.x - ship.x, r.y - SY()) < r.r + 30 * u) {
            r.hit = true; shields--; ship.inv = 1.3; api.sfx.hit(); api.fx.shake(18); api.fx.burst(ship.x, SY(), { colors: [C.orange, C.sun, C.red], n: 26 });
            if (shields <= 0) { over = true; api.banner('Kaboom!', { color: C.red }); setTimeout(() => api.end(), 1200); }
          }
          if (!r.passed && !r.hit && r.y > SY() + 40 * u) { r.passed = true; if (!over) api.add(1); }
        }
        for (const s of stars) if (!s.got && !over && Math.hypot(s.x - ship.x, s.y - SY()) < 60 * u) { s.got = true; api.add(3, s.x, s.y - 30 * u, '+3'); api.sfx.coin(); }
        rocks = rocks.filter((r) => r.y < H + 80); stars = stars.filter((s) => s.y < H + 60 && !s.got);
        api.timer(1 - t / DUR);
        if (t >= DUR && !over) { over = true; api.banner('Safe landing!', { color: C.mint }); setTimeout(() => api.end(), 1000); }
      },
      draw(g, W, H) {
        const u = api.u;
        const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0D0425'); bg.addColorStop(1, '#3B1678'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
        for (const s of field) { const y = ((s.y * H + scroll * s.z * 3) % H + H) % H; g.fillStyle = `rgba(255,246,232,${0.3 + s.z * 0.7})`; g.fillRect(s.x * W, y, s.s * u * 2, s.s * u * 2 + s.z * 6 * u); }
        for (const s of stars) emoji(g, '⭐', s.x, s.y, 50 * u, Math.sin(s.y / 40) * 0.3);
        for (const r of rocks) {
          g.save(); g.globalAlpha = 0.8; g.fillStyle = C.orange; g.beginPath(); g.moveTo(r.x - r.r * 0.8, r.y); g.lineTo(r.x, r.y - r.r * 3.2); g.lineTo(r.x + r.r * 0.8, r.y); g.fill(); g.fillStyle = C.sun; g.beginPath(); g.moveTo(r.x - r.r * 0.45, r.y); g.lineTo(r.x, r.y - r.r * 2); g.lineTo(r.x + r.r * 0.45, r.y); g.fill(); g.restore();
          circle(g, r.x, r.y, r.r, r.hit ? '#555' : '#8C6BB1', { lw: 5 });
          g.fillStyle = 'rgba(26,16,51,.4)'; for (let k = 0; k < 3; k++) { const a = r.rot + k * 2.1; g.beginPath(); g.arc(r.x + Math.cos(a) * r.r * 0.45, r.y + Math.sin(a) * r.r * 0.45, r.r * 0.2, 0, Math.PI * 2); g.fill(); }
        }
        if (ship.inv <= 0 || Math.floor(ship.inv * 10) % 2 === 0) {
          emoji(g, '🔥', ship.x, SY() + 50 * u, (28 + Math.random() * 12) * u, Math.PI);
          emoji(g, '🚀', ship.x, SY(), 76 * u, -Math.PI / 4);
        }
        for (let i = 0; i < 3; i++) emoji(g, i < shields ? '🛡️' : '▫️', W / 2 - 40 * u + i * 40 * u, 96 * u, 30 * u);
        // picture-in-picture so the player can see their head
        const pr = 90 * u, px = W - pr - 24 * u, py = H - pr - 24 * u;
        const k = (2.2 * pr) / Math.min(W, H);
        g.save(); g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.clip();
        g.fillStyle = C.ink; g.fill(); g.translate(px - (W / 2) * k, py - (H / 2) * k); g.scale(k, k); api.camera(g); g.restore();
        circle(g, px, py, pr, null, { lw: 6 });
        const f = api.vision.face; if (f) { const n = api.pt(f.nose); circle(g, px + (n.x - W / 2) * k, py + (n.y - H / 2) * k, 8 * u, C.pink, { lw: 3 }); }
      },
    };
  },
};
