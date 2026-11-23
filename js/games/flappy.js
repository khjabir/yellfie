import { C, clamp, rand, lerp, circle, rrect, blob, text, emoji } from '../util.js';

export default {
  id: 'flappy', name: 'Flappy Holler', emoji: '🐤', kind: 'voice', needs: ['mic'],
  tagline: 'Make noise to fly, go quiet to drop.',
  howTo: ['Any sound lifts the bird: hum, sing, shout, "aaaah".', 'Go quiet and it drops.', 'Fly through the gaps. One bump and your turn is over.'],
  crowd: 'Everyone else, stay quiet. Your noise lifts the bird too, so laughing counts against them.',
  unit: 'gaps',
  quip(s) { return s >= 20 ? 'Absolute lungs of steel.' : s >= 10 ? 'That bird has frequent-flyer miles now.' : s >= 4 ? 'Wings were flapping, the voice was cracking.' : null; },
  create(api) {
    const bird = { x: 0, y: 0, vy: 0, rot: 0, flap: 0, dead: false, deadT: 0 };
    let pipes = [], passed = 0, t = 0, groundX = 0, armed = false;
    const clouds = Array.from({ length: 7 }, () => ({ x: rand(1), y: rand(0.05, 0.5), s: rand(0.6, 1.3) }));
    const ground = () => api.H - 80 * api.u;
    bird.x = api.W * 0.27; bird.y = api.H * 0.42;

    function spawn() {
      const u = api.u, H = api.H; const gap = lerp(0.42, 0.28, clamp(passed / 24)) * (ground());
      const prev = pipes.length ? pipes[pipes.length - 1].cy : H * 0.45;
      const lo = 40 * u + gap / 2, hi = ground() - 40 * u - gap / 2;
      pipes.push({ x: api.W + 60 * u, w: 96 * u, cy: clamp(prev + rand(-0.28, 0.28) * H, lo, hi), gap, passed: false });
    }
    function die() {
      if (bird.dead) return; bird.dead = true; bird.vy = -320 * api.u;
      api.sfx.setDuck(1); api.sfx.hit(); api.sfx.setDuck(0.3);
      api.fx.shake(16); api.fx.burst(bird.x, bird.y, { n: 18, colors: [C.sun, C.cream, C.orange] }); api.banner('Bonk!', { color: C.red });
    }
    function hits(p) {
      const r = 26 * api.u, bx = bird.x, by = bird.y;
      const inX = bx + r > p.x && bx - r < p.x + p.w;
      return inX && (by - r < p.cy - p.gap / 2 || by + r > p.cy + p.gap / 2);
    }
    return {
      start() { t = 0; },
      idle(dt) { bird.x = api.W * 0.27; bird.y = api.H * 0.42 + Math.sin(performance.now() / 280) * 12 * api.u; bird.flap += dt * 8; groundX += dt * 120 * api.u; },
      update(dt) {
        const u = api.u; t += dt; bird.x = api.W * 0.27;
        const speed = Math.min(430, 235 + passed * 7) * u;
        const lv = api.mic.level;
        // hover until the player first makes a sound (or 1.5 s pass) so nobody dies on "Go!"
        if (!armed) { if (lv > 0.05 || t > 1.5) armed = true; else { bird.y = api.H * 0.42 + Math.sin(t * 5) * 10 * u; bird.flap += dt * 8; api.hint('Make some noise!'); return; } }
        if (!bird.dead) {
          const g = 1500 * u;
          bird.vy += g * dt;
          if (lv > 0.04) { bird.vy -= g * 2.6 * Math.pow(lv, 0.8) * dt; bird.vy *= 1 - 1.4 * dt; bird.flap += dt * (10 + lv * 30); }
          bird.vy = clamp(bird.vy, -560 * u, 680 * u); bird.y += bird.vy * dt;
          if (bird.y < 26 * u) { bird.y = 26 * u; bird.vy = Math.max(0, bird.vy); }
          bird.rot = lerp(bird.rot, clamp(bird.vy / (700 * u), -0.5, 1), 0.2);
          groundX += speed * dt;
          for (const p of pipes) p.x -= speed * dt;
          pipes = pipes.filter((p) => p.x + p.w > -20);
          const lastX = pipes.length ? pipes[pipes.length - 1].x : -1e9;
          if (t > 1.0 && lastX < api.W - 400 * u) spawn();
          for (const p of pipes) {
            if (!p.passed && p.x + p.w < bird.x) { p.passed = true; passed++; api.add(1, bird.x, bird.y - 60 * u); api.sfx.coin(); if (passed % 10 === 0) api.banner(`${passed}!`); }
            if (hits(p)) die();
          }
          if (bird.y + 24 * u > ground()) { bird.y = ground() - 24 * u; die(); }
          api.hint(t < 3 && lv < 0.05 ? 'Make some noise!' : '');
        } else {
          bird.deadT += dt; bird.vy += 1800 * u * dt; bird.y = Math.min(ground() - 24 * u, bird.y + bird.vy * dt); bird.rot += dt * 8;
          if (bird.deadT > 1.1) api.end(passed);
        }
        if (t > 150 && !bird.dead) api.end(passed);
      },
      draw(g, W, H) {
        const u = api.u, gy = ground();
        const sky = g.createLinearGradient(0, 0, 0, gy); sky.addColorStop(0, '#4DA8FF'); sky.addColorStop(1, '#B9E2FF');
        g.fillStyle = sky; g.fillRect(0, 0, W, gy);
        circle(g, W * 0.82, H * 0.2, 60 * u, C.sun, { lw: 5 });
        for (const c of clouds) {
          const x = ((c.x * W - groundX * 0.15 * c.s) % (W + 300 * u) + W + 300 * u) % (W + 300 * u) - 150 * u, y = c.y * H, s = c.s * u;
          g.fillStyle = C.cream; g.strokeStyle = C.ink; g.lineWidth = 4;
          g.beginPath(); g.arc(x, y, 34 * s, Math.PI * 0.5, Math.PI * 1.5); g.arc(x + 40 * s, y - 22 * s, 38 * s, Math.PI, 0); g.arc(x + 86 * s, y, 32 * s, Math.PI * 1.5, Math.PI * 0.5); g.closePath(); g.fill(); g.stroke();
        }
        for (const p of pipes) {
          const top = p.cy - p.gap / 2, bot = p.cy + p.gap / 2;
          blob(g, p.x, -10, p.w, top + 10, 10, C.mint, { lw: 5 }); blob(g, p.x - 10 * u, top - 34 * u, p.w + 20 * u, 34 * u, 10 * u, C.mint, { lw: 5 });
          blob(g, p.x, bot, p.w, gy - bot + 10, 10, C.mint, { lw: 5 }); blob(g, p.x - 10 * u, bot, p.w + 20 * u, 34 * u, 10 * u, C.mint, { lw: 5 });
          g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(p.x + 12 * u, -10, 12 * u, top - 34 * u + 10); g.fillRect(p.x + 12 * u, bot + 34 * u, 12 * u, gy - bot);
        }
        // ground
        g.fillStyle = C.lime; g.fillRect(0, gy, W, H - gy); g.fillStyle = '#6CCB2E';
        const st = 48 * u; for (let x = -((groundX) % (st * 2)); x < W; x += st * 2) { g.beginPath(); g.moveTo(x, gy + 22 * u); g.lineTo(x + st, gy + 22 * u); g.lineTo(x + st * 0.7, H); g.lineTo(x - st * 0.3, H); g.fill(); }
        g.fillStyle = C.ink; g.fillRect(0, gy - 3, W, 6);
        // bird
        g.save(); g.translate(bird.x, bird.y); g.rotate(bird.rot); const r = 30 * u;
        circle(g, 0, 0, r, C.sun, { lw: 5 });
        const wing = Math.sin(bird.flap) * 0.6;
        g.save(); g.translate(-r * 0.25, r * 0.15); g.rotate(wing); g.beginPath(); g.ellipse(-r * 0.3, 0, r * 0.55, r * 0.32, 0, 0, Math.PI * 2); g.fillStyle = '#FFB300'; g.fill(); g.lineWidth = 4; g.strokeStyle = C.ink; g.stroke(); g.restore();
        circle(g, r * 0.38, -r * 0.3, r * 0.3, '#fff', { lw: 3.5 }); circle(g, r * 0.48, -r * 0.3, r * 0.13, C.ink, { lw: 0 });
        const open = bird.dead ? 0.5 : clamp(api.mic.level * 1.4);
        g.fillStyle = C.orange; g.strokeStyle = C.ink; g.lineWidth = 4; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(r * 0.7, -r * 0.02); g.lineTo(r * 1.35, r * 0.1 - open * r * 0.15); g.lineTo(r * 0.72, r * 0.22); g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(r * 0.7, r * 0.26); g.lineTo(r * 1.2, r * 0.3 + open * r * 0.4); g.lineTo(r * 0.68, r * 0.42); g.closePath(); g.fill(); g.stroke();
        g.restore();
        if (api.mic.level > 0.3 && !bird.dead) text(g, api.mic.level > 0.75 ? 'AAAH!' : 'aah', bird.x + 50 * u, bird.y - 55 * u, { size: 24 * u + 10 * api.mic.level * u, color: C.cream });
        meter(g, api, 36 * u, H * 0.3, 0.3);
      },
    };
  },
};

// vertical voice meter shared by voice games
export function meter(g, api, x, y, mark = null, h = null) {
  const u = api.u; y = Math.max(y, 132); h = Math.min(h ?? api.H * 0.38, api.H - y - 60 * u); const w = 26 * u; // stay below the Quit button
  blob(g, x, y, w, h, w / 2, C.cream, { lw: 4 });
  const lv = clamp(api.mic.level); const fh = (h - 8) * lv;
  rrect(g, x + 4, y + h - 4 - fh, w - 8, fh, (w - 8) / 2); g.fillStyle = C.pink; g.fill();
  if (mark != null) { const my = y + h - 4 - (h - 8) * mark; g.strokeStyle = C.ink; g.lineWidth = 3; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(x - 6, my); g.lineTo(x + w + 6, my); g.stroke(); g.setLineDash([]); }
  emoji(g, '🎤', x + w / 2, y + h + 26 * u, 34 * u);
}
