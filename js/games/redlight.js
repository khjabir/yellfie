import { C, clamp, rand, lerp, circle, blob, text, emoji } from '../util.js';
import { meter } from './flappy.js';

const DUR = 35, GRACE = 0.5, BACK = 10;

export default {
  id: 'redlight', name: 'Red Light, Loud Light', emoji: '🚦', kind: 'voice', needs: ['mic'],
  tagline: 'Yell to run on green. Total silence on red.',
  howTo: ['While the light is green, make noise to run. Louder is faster.', 'The moment it turns red, go silent. Any sound and the guard sends you back 10 metres.', 'Get as far as you can in 35 seconds.'],
  crowd: 'Everyone else: cheer on green… then try to make them laugh on red.',
  unit: 'metres',
  variety: 'light timings',
  quip(s) { return s >= 150 ? 'A sprinting, screaming legend.' : s >= 90 ? 'Fast feet, big lungs.' : s >= 40 ? 'Got there… eventually.' : 'The guard barely had to look up.'; },
  create(api) {
    // the whole light sequence is decided up front, so "same for everyone" rounds are fair
    const lights = (api.shared.lights ||= (() => { const a = []; let t = 0; while (t < DUR + 8) { const g = rand(1.8, 3.8), r = rand(1.4, 3); a.push([t, true], [t + g, false]); t += g + r; } return a; })());
    let t = 0, d = 0, shown = 0, idx = 0, green = true, since = 0, safe = 0, stride = 0, over = false;
    return {
      peek: () => ({ green, d, since }), // for automated tests
      update(dt) {
        if (over) return;
        t += dt; since += dt; safe -= dt; const lv = api.mic.level;
        while (idx + 1 < lights.length && lights[idx + 1][0] <= t) { idx++; green = lights[idx][1]; since = 0; green ? api.sfx.go() : api.sfx.beep(); }
        if (green) { if (lv > 0.1) { const v = 3 + 9 * clamp(lv); d += v * dt; stride += dt * (8 + lv * 14); } }
        else if (since > GRACE && lv > 0.14 && safe <= 0) {
          d = Math.max(0, d - BACK); safe = 1.3;
          api.sfx.setDuck(1); api.sfx.wrong(); api.sfx.setDuck(0.3);
          api.fx.shake(14); api.fx.flash(C.red, 0.3); api.banner('Caught!', { color: C.red, size: 90 * api.u, sub: `back ${BACK} metres` });
        }
        shown = lerp(shown, d, clamp(dt * 8)); api.setScore(Math.floor(d)); api.timer(1 - t / DUR);
        api.hint(green ? (lv < 0.1 ? 'GREEN: make some noise!' : '') : 'RED: shhh!');
        if (t >= DUR) { over = true; api.hint(''); api.banner('Finish!', { color: C.sun }); setTimeout(() => api.end(Math.floor(d)), 900); }
      },
      draw(g, W, H) {
        const u = api.u, gy = H * 0.74, px = 46 * u; // px = screen pixels per metre
        g.fillStyle = green ? '#1F8A5B' : '#8A1F3C'; g.fillRect(0, 0, W, H);
        g.fillStyle = green ? '#2FB37A' : '#B3304F'; for (let k = 0; k < 9; k++) { const x = ((k * 260 * u - shown * px * 0.3) % (W + 260 * u) + W + 260 * u) % (W + 260 * u) - 130 * u; g.beginPath(); g.moveTo(x - 110 * u, gy); g.lineTo(x, gy - (120 + (k % 3) * 60) * u); g.lineTo(x + 110 * u, gy); g.fill(); }
        // road
        g.fillStyle = '#2B2440'; g.fillRect(0, gy, W, H - gy); g.fillStyle = C.ink; g.fillRect(0, gy - 3, W, 6);
        g.fillStyle = C.cream; for (let x = -((shown * px) % (120 * u)); x < W; x += 120 * u) g.fillRect(x, gy + (H - gy) * 0.45, 60 * u, 8 * u);
        // distance flags every 10 m
        const rx = W * 0.28;
        for (let m = Math.ceil((shown - 8) / 10) * 10; m < shown + 30; m += 10) {
          if (m <= 0) continue; const x = rx + (m - shown) * px;
          g.fillStyle = C.ink; g.fillRect(x - 3, gy - 70 * u, 6, 70 * u); blob(g, x, gy - 96 * u, 64 * u, 34 * u, 8 * u, C.sun, { lw: 4 }); text(g, `${m}m`, x + 32 * u, gy - 79 * u, { size: 20 * u, color: C.ink, stroke: null });
        }
        // runner (drawn flipped so they face the way they run)
        const running = green && api.mic.level > 0.1, bob = running ? Math.abs(Math.sin(stride)) * 16 * u : 0;
        g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(rx, gy + 8 * u, 36 * u, 9 * u, 0, 0, Math.PI * 2); g.fill();
        g.save(); g.translate(rx, gy - 52 * u - bob); g.scale(-1, 1); emoji(g, running ? '🏃' : '🧍', 0, 0, 110 * u, running ? Math.sin(stride) * 0.08 : 0); g.restore();
        if (safe > 0) emoji(g, '💫', rx, gy - 130 * u, 50 * u, performance.now() / 200);
        // guard
        const gx = W * 0.84; emoji(g, '👮', gx, gy - 70 * u, 130 * u, green ? 0.12 : 0);
        emoji(g, green ? '💤' : '👀', gx + (green ? 50 * u : 0), gy - 160 * u, 60 * u);
        // traffic light
        const lw = 92 * u, lh = 236 * u, lx = W / 2 - lw / 2, ly = Math.max(96 * u, 84);
        blob(g, lx, ly, lw, lh, 22 * u, C.ink, { lw: 5, stroke: C.cream });
        circle(g, W / 2, ly + lh * 0.2, 30 * u, !green ? C.red : '#4A1420', { lw: 3 });
        circle(g, W / 2, ly + lh * 0.5, 30 * u, '#4A3A14', { lw: 3 });
        circle(g, W / 2, ly + lh * 0.8, 30 * u, green ? '#3DF58A' : '#144A2A', { lw: 3 });
        text(g, green ? 'GO! GO! GO!' : 'SHHH!', W / 2, ly + lh + 44 * u, { size: 56 * u, color: green ? C.mint : C.cream });
        if (!green && since < GRACE) text(g, 'quiet…', W / 2, ly + lh + 92 * u, { size: 26 * u, color: C.sun });
        meter(g, api, 36 * u, H * 0.3, 0.14, H * 0.3);
      },
    };
  },
};
