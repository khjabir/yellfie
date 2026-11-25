import { C, clamp, rand, lerp, circle, blob, emoji } from '../util.js';
import { screenBody, noBodyHint } from './body.js';

const DUR = 50;

export default {
  id: 'wings', name: 'Wing It', emoji: '🐔', kind: 'camera', needs: ['pose'],
  tagline: 'Flap your arms like wings to fly through the gaps.',
  howTo: ['Hold your arms out and flap. Every downward flap lifts the chicken; bigger flaps lift more.', 'Stop flapping and it sinks. Fly through the gaps between the trees.', 'Three bumps and the chicken is grounded.'],
  crowd: 'Everyone else: cluck. Loudly. It definitely helps.',
  ready: 'Step back until your head and both arms are on screen, arms out like wings.',
  unit: 'gaps',
  quip(s) { return s >= 18 ? 'That chicken can FLY. Science is baffled.' : s >= 9 ? 'Majestic. Sweaty, but majestic.' : s >= 3 ? 'More of a controlled fall.' : 'Chickens: confirmed flightless.'; },
  create(api) {
    const bird = { y: api.H * 0.45, vy: 0, inv: 0 };
    let t = 0, gaps = [], passed = 0, lives = 3, over = false, armed = false, scroll = 0, sb = null, prevWy = null, wing = 0, flapFx = 0;
    const floor = () => api.H - 70 * api.u, roof = () => Math.max(96 * api.u, 84);
    let poseT = 0;
    // Returns how far the wrists swept DOWN since the last camera frame, in shoulder widths (0 if they
    // rose, or moved slower than about one shoulder width a second, so shaky tracking can't fly).
    function arms() {
      const pose = api.vision.pose; sb = screenBody(api);
      if (!sb || !pose) { prevWy = null; return 0; }
      if (pose.t === poseT) return 0;                       // no new camera frame yet
      const dtp = Math.max(0.008, (pose.t - poseT) / 1000); poseT = pose.t;
      const ws = [sb.L.w, sb.R.w].filter((p) => p && p.v > 0.35); if (!ws.length) { prevWy = null; return 0; }
      const wy = ws.reduce((a, p) => a + p.y, 0) / ws.length / sb.sw;
      wing = lerp(wing, clamp((sb.mid.y / sb.sw - wy) / 0.9, -1, 1), 0.5);
      const down = prevWy === null || dtp > 0.4 ? 0 : wy - prevWy; prevWy = wy;
      return down > 0 && down / dtp > 1.1 ? Math.min(down, 0.7) : 0;
    }
    return {
      peek: () => ({ y: bird.y, vy: bird.vy, passed, lives }), // for automated tests
      idle() { arms(); },
      update(dt) {
        const u = api.u, H = api.H, W = api.W; t += dt; bird.inv -= dt; flapFx = Math.max(0, flapFx - dt * 4);
        const flap = arms(); noBodyHint(api, sb);
        if (!armed) { if (flap > 0 || t > 2.5) armed = true; else { bird.y = H * 0.45 + Math.sin(t * 5) * 10 * u; if (sb) api.hint('Flap your arms to take off!'); return; } }
        if (over) { bird.vy += H * 1.6 * dt; bird.y = Math.min(floor(), bird.y + bird.vy * dt); return; }
        if (flap) { bird.vy -= H * 0.72 * flap; flapFx = 1; }
        bird.vy += H * 1.0 * dt; bird.vy = clamp(bird.vy, -0.85 * H, 0.9 * H); bird.y += bird.vy * dt;
        if (bird.y < roof() + 30 * u) { bird.y = roof() + 30 * u; bird.vy = Math.max(0, bird.vy); }
        const speed = Math.min(310, 190 + passed * 6) * u; scroll += speed * dt;
        for (const p of gaps) p.x -= speed * dt; gaps = gaps.filter((p) => p.x + p.w > -30);
        const lastX = gaps.length ? gaps[gaps.length - 1].x : -1e9;
        if (t > 1.5 && lastX < W - 470 * u) {
          const span = floor() - roof(), gap = lerp(0.5, 0.38, clamp(passed / 20)) * span, prev = gaps.length ? gaps[gaps.length - 1].cy : H * 0.45;
          gaps.push({ x: W + 50 * u, w: 100 * u, gap, cy: clamp(prev + rand(-0.25, 0.25) * span, roof() + gap / 2 + 20 * u, floor() - gap / 2 - 20 * u), done: false });
        }
        const bx = W * 0.27, r = 30 * u; let bump = false;
        for (const p of gaps) {
          if (!p.done && p.x + p.w < bx) { p.done = true; passed++; api.add(1, bx, bird.y - 70 * u); api.sfx.coin(); if (passed % 5 === 0) api.banner(`${passed}!`, { color: C.sun }); }
          if (bx + r > p.x && bx - r < p.x + p.w && (bird.y - r < p.cy - p.gap / 2 || bird.y + r > p.cy + p.gap / 2)) bump = true;
        }
        if (bird.y + r > floor()) { bird.y = floor() - r; bird.vy = -0.5 * H; bump = true; }
        if (bump && bird.inv <= 0) {
          lives--; bird.inv = 1.4; api.sfx.hit(); api.fx.shake(14); api.fx.burst(bx, bird.y, { n: 14, emojis: ['🪶'], speed: 320, size: 6 });
          if (lives <= 0) { over = true; api.banner('Grounded!', { color: C.red }); setTimeout(() => api.end(passed), 1200); }
        }
        api.timer(1 - t / DUR);
        if (t >= DUR && !over) { over = true; bird.vy = 0; api.banner('Landed safely!', { color: C.mint }); setTimeout(() => api.end(passed), 900); }
      },
      draw(g, W, H) {
        const u = api.u, fy = floor(), bx = W * 0.27;
        const sky = g.createLinearGradient(0, 0, 0, fy); sky.addColorStop(0, '#FFB36B'); sky.addColorStop(0.6, '#FFD9A0'); sky.addColorStop(1, '#FFF1C9'); g.fillStyle = sky; g.fillRect(0, 0, W, fy);
        circle(g, W * 0.8, H * 0.22, 64 * u, C.cream, { lw: 0 });
        g.fillStyle = '#E8A15A'; for (let k = -1; k < 7; k++) { const x = k * 380 * u - (scroll * 0.25) % (380 * u); g.beginPath(); g.moveTo(x, fy); g.quadraticCurveTo(x + 190 * u, fy - 190 * u, x + 380 * u, fy); g.fill(); }
        for (const p of gaps) { // tree trunks with leafy ends
          const top = p.cy - p.gap / 2, bot = p.cy + p.gap / 2;
          blob(g, p.x + 20 * u, -10, p.w - 40 * u, top + 10, 8, '#8B5A2B', { lw: 5 }); blob(g, p.x - 12 * u, top - 60 * u, p.w + 24 * u, 60 * u, 28 * u, '#3FA34D', { lw: 5 });
          blob(g, p.x + 20 * u, bot, p.w - 40 * u, fy - bot + 10, 8, '#8B5A2B', { lw: 5 }); blob(g, p.x - 12 * u, bot, p.w + 24 * u, 60 * u, 28 * u, '#3FA34D', { lw: 5 });
        }
        g.fillStyle = '#7BC950'; g.fillRect(0, fy, W, H - fy); g.fillStyle = C.ink; g.fillRect(0, fy - 3, W, 6);
        g.fillStyle = '#5FAE3A'; for (let x = -(scroll % (70 * u)); x < W; x += 70 * u) { g.beginPath(); g.moveTo(x, fy); g.lineTo(x + 12 * u, fy - 16 * u); g.lineTo(x + 24 * u, fy); g.fill(); }
        // the chicken: its wings copy your arms
        if (bird.inv <= 0 || Math.floor(bird.inv * 10) % 2 === 0) {
          g.save(); g.translate(bx, bird.y); g.rotate(clamp(bird.vy / (H * 1.2), -0.4, 0.6));
          for (const s of [-1, 1]) { g.save(); g.scale(s, 1); g.translate(18 * u, 6 * u); g.rotate(-wing * 0.9); g.beginPath(); g.ellipse(34 * u, 0, 40 * u, 16 * u, 0, 0, Math.PI * 2); g.fillStyle = C.cream; g.fill(); g.lineWidth = 4; g.strokeStyle = C.ink; g.stroke(); g.restore(); }
          emoji(g, '🐔', 0, 0, 84 * u); g.restore();
          if (flapFx > 0) { g.strokeStyle = `rgba(255,255,255,${flapFx})`; g.lineWidth = 5 * u; g.lineCap = 'round'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(bx + s * 40 * u, bird.y + 50 * u); g.lineTo(bx + s * 52 * u, bird.y + 80 * u); g.stroke(); } }
        }
        for (let i = 0; i < 3; i++) emoji(g, i < lives ? '🪶' : '▫️', W / 2 - 40 * u + i * 40 * u, roof() + 6 * u, 30 * u);
        // little mirror so you can see your own flapping
        const pr = Math.max(64, 88 * u), px = W - pr - 20 * u, py = H - pr - 20 * u, k = (2.2 * pr) / Math.min(W, H);
        g.save(); g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.clip(); g.fillStyle = C.ink; g.fill(); g.translate(px - (W / 2) * k, py - (H / 2) * k); g.scale(k, k); api.camera(g);
        if (sb && api.outlines) { g.lineCap = 'round'; g.strokeStyle = C.sun; g.lineWidth = 14; for (const a of [sb.L, sb.R]) { g.beginPath(); g.moveTo(a.s.x, a.s.y); g.lineTo(a.e.x, a.e.y); g.lineTo(a.w.x, a.w.y); g.stroke(); } }
        g.restore(); circle(g, px, py, pr, null, { lw: 6 });
      },
    };
  },
};
