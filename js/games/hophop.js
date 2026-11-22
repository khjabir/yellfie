import { C, clamp, rand, lerp, circle, blob, text, emoji } from '../util.js';
import { meter } from './flappy.js';

const DUR = 60;
export default {
  id: 'hop', name: 'Hup Hop', emoji: '🐸', kind: 'voice', needs: ['mic'],
  tagline: 'Shout "HUP!" to jump the logs. Stay quiet under the bees.',
  howTo: ['A short loud sound ("hup!", "hey!", a clap) makes the frog jump.', 'Hold the sound a bit longer for a bigger jump.', 'Jump over logs. Do NOT jump into the bees. Grab flies for +5.'],
  crowd: 'Everyone else: stay quiet, a stray shout makes the frog jump.',
  unit: 'metres',
  create(api) {
    const frog = { y: 0, vy: 0, ground: true, hold: 0, squash: 0, inv: 0 };
    let obs = [], flies = [], t = 0, dist = 0, bonus = 0, lives = 3, spawnT = 1.2, prevLv = 0, scroll = 0, over = false;
    const G = () => api.H * 0.78, FX = () => api.W * 0.22;
    function hitBox(o) { const u = api.u; const fx = FX(), fy = G() + frog.y; const fw = 34 * u, fh = 56 * u; return fx + fw > o.x && fx - fw < o.x + o.w && fy > o.y && fy - fh < o.y + o.h; }
    return {
      update(dt) {
        const u = api.u; t += dt; if (over) return;
        const speed = lerp(330, 600, clamp(t / DUR)) * u;
        const lv = api.mic.level;
        // jump on a rising edge of loudness
        if (frog.ground && lv > 0.3 && prevLv < 0.22) { frog.vy = -930 * u; frog.ground = false; frog.hold = 0; frog.squash = 1; api.fx.burst(FX(), G(), { n: 6, colors: [C.lime, C.cream], speed: 150, size: 5 }); }
        prevLv = lv;
        if (!frog.ground) {
          const grav = 2700 * u * (frog.vy < 0 && lv > 0.22 && frog.hold < 0.22 ? 0.42 : 1); frog.hold += dt;
          frog.vy += grav * dt; frog.y += frog.vy * dt;
          if (frog.y >= 0) { frog.y = 0; frog.vy = 0; frog.ground = true; frog.squash = -0.6; }
        }
        frog.squash *= 0.86; frog.inv -= dt;
        scroll += speed * dt; dist += speed * dt / (70 * u); api.setScore(Math.floor(dist) + bonus);
        spawnT -= dt;
        if (spawnT <= 0) {
          const bee = t > 6 && Math.random() < 0.3;
          if (bee) obs.push({ k: 'bee', x: api.W + 40, w: 56 * u, h: 50 * u, y: G() - rand(140, 165) * u, ph: rand(6) });
          else { const w = rand(60, 110) * u, h = rand(46, 70) * u; obs.push({ k: 'log', x: api.W + 40, w, h, y: G() - h }); if (Math.random() < 0.45) flies.push({ x: api.W + 40 + w / 2, y: G() - h - rand(110, 170) * u, ph: rand(6) }); }
          spawnT = rand(0.95, 1.7) * lerp(1, 0.75, clamp(t / DUR));
        }
        for (const o of obs) o.x -= speed * dt; for (const f of flies) f.x -= speed * dt;
        obs = obs.filter((o) => o.x + o.w > -60); flies = flies.filter((f) => f.x > -60 && !f.got);
        for (const o of obs) {
          if (!o.hit && frog.inv <= 0 && hitBox(o)) {
            o.hit = true; lives--; frog.inv = 1.3; api.sfx.setDuck(1); api.sfx.hit(); api.sfx.setDuck(0.3); api.fx.shake(14);
            api.fx.float(FX(), G() - 120 * u, o.k === 'bee' ? 'Ouch, bee!' : 'Bonk!', { color: C.red, size: 40 * u });
            if (lives <= 0) { over = true; api.banner('Splat!', { color: C.red }); setTimeout(() => api.end(), 1100); }
          }
        }
        for (const f of flies) if (!f.got && Math.hypot(f.x - FX(), f.y - (G() + frog.y - 40 * u)) < 60 * u) { f.got = true; bonus += 5; api.fx.float(f.x, f.y, '+5 fly!', { size: 34 * u }); api.sfx.setDuck(1); api.sfx.coin(); api.sfx.setDuck(0.3); }
        api.timer(1 - t / DUR); api.hint(t < 3 ? 'Say "HUP!" to jump!' : '');
        if (t >= DUR) { over = true; api.banner('Finish line!', { color: C.mint }); setTimeout(() => api.end(), 900); }
      },
      idle(dt) { scroll += dt * 80 * api.u; },
      draw(g, W, H) {
        const u = api.u, gy = G();
        const sky = g.createLinearGradient(0, 0, 0, gy); sky.addColorStop(0, '#FF8FB1'); sky.addColorStop(1, '#FFD6A5'); g.fillStyle = sky; g.fillRect(0, 0, W, gy);
        circle(g, W * 0.7, gy - 40 * u, 120 * u, C.sun, { lw: 0 });
        g.fillStyle = '#B98CFF'; g.strokeStyle = C.ink; g.lineWidth = 4;
        for (let k = -1; k < 8; k++) { const x = k * 300 * u - (scroll * 0.2) % (300 * u); g.beginPath(); g.moveTo(x, gy); g.quadraticCurveTo(x + 150 * u, gy - 160 * u, x + 300 * u, gy); g.fill(); g.stroke(); }
        g.fillStyle = C.lime; g.fillRect(0, gy, W, H - gy); g.fillStyle = '#6CCB2E';
        for (let x = -(scroll % (60 * u)); x < W; x += 60 * u) { g.beginPath(); g.moveTo(x, gy); g.lineTo(x + 10 * u, gy - 14 * u); g.lineTo(x + 20 * u, gy); g.fill(); }
        g.fillStyle = '#4DA8FF'; g.fillRect(0, gy + 60 * u, W, H); g.fillStyle = C.ink; g.fillRect(0, gy - 2, W, 4); g.fillRect(0, gy + 58 * u, W, 4);
        for (const o of obs) {
          if (o.k === 'log') { blob(g, o.x, o.y, o.w, o.h, 14 * u, '#A0522D', { lw: 5 }); circle(g, o.x + o.w - 10 * u, o.y + o.h / 2, o.h * 0.32, '#DEB887', { lw: 4 }); }
          else emoji(g, '🐝', o.x + o.w / 2, o.y + o.h / 2 + Math.sin(performance.now() / 120 + o.ph) * 6 * u, 58 * u);
        }
        for (const f of flies) emoji(g, '🪰', f.x, f.y + Math.sin(performance.now() / 90 + f.ph) * 6 * u, 36 * u);
        // frog
        const fy = gy + frog.y; g.fillStyle = 'rgba(26,16,51,.3)'; g.beginPath(); g.ellipse(FX(), gy + 6 * u, 40 * u * (1 + frog.y / (400 * u)), 9 * u, 0, 0, Math.PI * 2); g.fill();
        if (frog.inv <= 0 || Math.floor(frog.inv * 10) % 2 === 0) {
          g.save(); g.translate(FX(), fy); g.scale(1 - frog.squash * 0.2, 1 + frog.squash * 0.25); emoji(g, '🐸', 0, -42 * u, 92 * u); g.restore();
        }
        for (let i = 0; i < 3; i++) emoji(g, i < lives ? '❤️' : '🤍', W / 2 - 40 * u + i * 40 * u, 96 * u, 30 * u);
        meter(g, api, 36 * u, H * 0.25, 0.3, H * 0.3);
      },
    };
  },
};
