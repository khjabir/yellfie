import { C, clamp, rand, lerp, text, emoji } from '../util.js';
import { drawFaceOutline } from './body.js';

const DUR = 45;

export default {
  id: 'header', name: 'Header Hero', emoji: '⚽', kind: 'camera', needs: ['face'],
  tagline: 'Keep the ball in the air with your head.',
  howTo: ['A ball drops from the top. Get your head under it and bounce it back up.', 'Every header is a point. Five in a row without dropping and each one counts double.', 'Drop it three times and your turn is over.'],
  crowd: 'Everyone else: count the headers out loud. "ONE! TWO! THREE!"',
  ready: 'Stand so your head is in the lower half of the screen, with room to move sideways.',
  unit: 'points',
  quip(s) { return s >= 40 ? 'Sign them up for the national team!' : s >= 20 ? 'Silky skills. Solid forehead.' : s >= 8 ? 'A few good bounces in there.' : 'The ball has filed a complaint.'; },
  create(api) {
    const ball = { x: 0, y: -100, vx: 0, vy: 0, rot: 0, live: false };
    let t = 0, lives = 3, streak = 0, best = 0, wait = 0.8, cool = 0, over = false, prev = null, hv = { x: 0, y: 0 }, lastT = 0;
    const r = () => Math.min(api.W, api.H) * 0.065;
    function head() {
      const f = api.vision.face; if (!f) return null;
      const c = api.pt({ x: (f.box.x0 + f.box.x1) / 2, y: f.box.y0 + f.box.h * 0.3 });
      return { x: c.x, y: c.y, r: api.len(f.box.w) * 0.56, t: f.t };
    }
    function drop() { ball.x = api.W * rand(0.35, 0.65); ball.y = -r(); ball.vx = rand(-0.08, 0.08) * api.W; ball.vy = api.H * 0.12; ball.live = true; }
    return {
      peek: () => ({ ball: { x: ball.x, y: ball.y, live: ball.live }, lives, streak }), // for automated tests
      update(dt) {
        const W = api.W, H = api.H, u = api.u, G = H * 1.35, R = r(); t += dt; cool -= dt;
        const hd = head();
        if (hd && hd.t !== lastT) { // head speed, measured once per camera frame
          if (prev) { const k = Math.max(0.016, (hd.t - lastT) / 1000); hv.x = lerp(hv.x, (hd.x - prev.x) / k, 0.5); hv.y = lerp(hv.y, (hd.y - prev.y) / k, 0.5); }
          prev = { x: hd.x, y: hd.y }; lastT = hd.t;
        }
        api.hint(hd ? '' : "We can't see your face. Step into view!");
        if (!ball.live) { wait -= dt; if (wait <= 0 && !over) drop(); }
        else {
          ball.vy += G * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.rot += (ball.vx / R) * dt;
          if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx) * 0.8; } else if (ball.x > W - R) { ball.x = W - R; ball.vx = -Math.abs(ball.vx) * 0.8; }
          const roof = Math.max(96 * u, 84) + R; if (ball.y < roof && ball.vy < 0) { ball.y = roof; ball.vy = -ball.vy * 0.4; }
          if (hd && cool <= 0) {
            const dx = ball.x - hd.x, dy = ball.y - hd.y, d = Math.hypot(dx, dy) || 1;
            if (d < hd.r + R && dy < hd.r * 0.35) {
              const nx = dx / d, ny = dy / d;
              ball.x = hd.x + nx * (hd.r + R); ball.y = hd.y + ny * (hd.r + R);
              ball.vy = -clamp(0.92 * H + Math.max(0, -hv.y) * 0.5, 0.85 * H, 1.25 * H);   // heading upward adds power
              ball.vx = clamp(nx * 0.55 * H + hv.x * 0.35 + ball.vx * 0.25, -0.7 * W, 0.7 * W);
              cool = 0.22; streak++; best = Math.max(best, streak);
              const pts = streak >= 5 ? 2 : 1; api.add(pts, ball.x, ball.y - R * 1.6, streak >= 5 ? `+2 streak x${streak}` : '+1');
              api.sfx.boing(); api.fx.ring(ball.x, ball.y + R, { r1: R * 2.4, color: C.sun });
              if (streak === 5) api.banner('On fire!', { color: C.orange, size: 90 * u });
            }
          }
          if (ball.y > H + R * 2) {
            ball.live = false; lives--; streak = 0; wait = 0.9; api.sfx.fail(); api.fx.shake(10);
            if (lives <= 0) { over = true; api.banner('Dropped it!', { color: C.red }); setTimeout(() => api.end(), 1100); }
          }
        }
        api.timer(1 - t / DUR);
        if (t >= DUR && !over) { over = true; api.banner('Full time!', { color: C.sun }); setTimeout(() => api.end(), 900); }
      },
      draw(g, W, H) {
        const u = api.u, R = r(); api.camera(g); g.fillStyle = 'rgba(20,90,50,.25)'; g.fillRect(0, 0, W, H);
        if (api.outlines && api.vision.face) drawFaceOutline(g, api, api.vision.face);
        const hd = head(); if (hd) { g.save(); g.setLineDash([10, 8]); g.beginPath(); g.arc(hd.x, hd.y, hd.r, Math.PI * 1.08, Math.PI * 1.92); g.lineWidth = 7; g.strokeStyle = C.sun; g.stroke(); g.restore(); }
        if (ball.live) {
          const gy = H - 12 * u, k = clamp(1 - (gy - ball.y) / H); g.fillStyle = `rgba(0,0,0,${0.12 + k * 0.2})`; g.beginPath(); g.ellipse(ball.x, gy, R * (0.5 + k * 0.6), R * 0.16, 0, 0, Math.PI * 2); g.fill();
          emoji(g, '⚽', ball.x, ball.y, R * 2.1, ball.rot);
        } else if (!over) text(g, 'Ready…', W / 2, H * 0.3, { size: 60 * u, color: C.cream });
        const top = Math.max(100 * u, 88);
        for (let i = 0; i < 3; i++) emoji(g, i < lives ? '⚽' : '❌', W / 2 - 44 * u + i * 44 * u, top, 32 * u);
        if (streak >= 2) text(g, `${streak} in a row`, W / 2, top + 50 * u, { size: 34 * u, color: streak >= 5 ? C.orange : C.cream });
      },
    };
  },
};
