import { C, clamp, rand, lerp, circle, blob, text, emoji } from '../util.js';
import { meter } from './flappy.js';

const COLORS = [C.pink, C.sky, C.orange];
export default {
  id: 'balloon', name: "Don't Pop It", emoji: '🎈', kind: 'voice', needs: ['mic'],
  tagline: 'Blow the balloon up to the line without popping it.',
  howTo: ['Hum, blow or "ooooh" into the mic to inflate the balloon.', 'Stop when it fills the dotted ring, then stay quiet to tie it off.', 'Too much air and it POPS. Balloon 3 is a blind one: the ring disappears!'],
  crowd: 'Everyone else: shout "MORE!" or "STOP!", whichever is least helpful.',
  unit: 'points',
  variety: 'balloon sizes',
  create(api) {
    const targets = (api.shared.balloons ||= [rand(0.45, 0.75), rand(0.55, 0.85), rand(0.5, 0.85)]);
    let i = 0, b = fresh(), wob = 0;
    function fresh() { return { air: 0, phase: 'blow', quietT: 0, t: 0, resT: 0, pts: 0 }; }
    const maxR = () => Math.min(api.W, api.H) * 0.3, minR = () => maxR() * 0.14;
    const R = (air) => minR() + (maxR() - minR()) * Math.cbrt(clamp(air, 0, 1.2));
    function lock() {
      // judged on size as the players see it
      const d = Math.abs(Math.cbrt(b.air) - Math.cbrt(targets[i]));
      b.pts = d < 0.025 ? 100 : Math.max(0, Math.round(100 - d * 330));
      b.phase = 'tied'; b.resT = 0; api.add(b.pts, api.W / 2, api.H * 0.2, b.pts === 100 ? 'PERFECT +100' : `+${b.pts}`);
      api.sfx.setDuck(1); b.pts >= 90 ? api.sfx.success() : api.sfx.squeak(); api.sfx.setDuck(0.3);
      api.banner(b.pts === 100 ? 'Perfect!' : b.pts >= 80 ? 'So close!' : b.pts >= 50 ? 'Not bad' : 'Way off!', { color: b.pts >= 80 ? C.mint : C.sun });
    }
    return {
      update(dt) {
        b.t += dt; wob += dt * (3 + api.mic.level * 20);
        const cx = api.W / 2, cy = api.H * 0.52;
        if (b.phase === 'blow') {
          const lv = api.mic.level;
          if (lv > 0.04) { b.air += Math.pow(lv, 1.15) * 0.4 * dt; b.quietT = 0; } else if (b.air > 0.04) b.quietT += dt;
          api.hint(b.air < 0.03 ? (i === 2 ? 'Blind balloon! The ring hides once you start.' : 'Make a sound to blow it up!') : b.quietT > 0.2 ? `Tying it off… ${Math.max(0, 1.2 - b.quietT).toFixed(1)}` : '');
          if (b.air > 1) {
            b.phase = 'popped'; b.resT = 0; api.sfx.setDuck(1); api.sfx.pop(); api.sfx.setDuck(0.3);
            api.fx.burst(cx, cy, { n: 40, colors: [COLORS[i], C.cream], speed: 700, size: 9 }); api.fx.shake(20); api.banner('POP!', { color: C.red }); api.hint('');
          } else if (b.quietT > 1.2 || b.t > 14) { api.hint(''); lock(); }
        } else {
          b.resT += dt;
          if (b.resT > 1.8) { i++; if (i >= 3) { api.end(); return; } b = fresh(); }
        }
        api.timer(b.phase === 'blow' ? 1 - b.t / 14 : null);
      },
      draw(g, W, H) {
        const u = api.u;
        // circus tent stripes
        const sw = 90 * u; for (let x = 0, k = 0; x < W; x += sw, k++) { g.fillStyle = k % 2 ? '#FFE3EE' : C.cream; g.fillRect(x, 0, sw, H); }
        g.fillStyle = C.pink; g.beginPath(); g.moveTo(0, 0); for (let x = 0; x <= W + sw; x += sw) g.quadraticCurveTo(x + sw / 2, 70 * u, x + sw, 0); g.lineTo(W, 0); g.fill();
        g.strokeStyle = C.ink; g.lineWidth = 4; g.stroke();
        g.fillStyle = '#E7D3FF'; g.fillRect(0, H * 0.86, W, H); g.fillStyle = C.ink; g.fillRect(0, H * 0.86 - 2, W, 4);
        const cx = W / 2, cy = H * 0.5;
        // pop line + target ring
        g.save(); g.setLineDash([10, 10]); g.lineWidth = 5;
        g.strokeStyle = C.red; g.beginPath(); g.arc(cx, cy, R(1) + 6, 0, Math.PI * 2); g.stroke();
        const blind = i === 2 && b.air > 0.08 && b.phase === 'blow';
        if (!blind || b.phase !== 'blow') { g.strokeStyle = C.ink; g.lineWidth = 7; g.beginPath(); g.arc(cx, cy, R(targets[i]), 0, Math.PI * 2); g.stroke(); g.lineWidth = 3; g.strokeStyle = C.mint; g.beginPath(); g.arc(cx, cy, R(targets[i]), 0, Math.PI * 2); g.stroke(); }
        g.restore();
        text(g, 'POP LINE', cx + R(1) * 0.72, cy - R(1) * 0.78, { size: 20 * u, color: C.red, sw: 6 });
        if (b.phase !== 'popped') {
          const r = R(b.air) * (1 + Math.sin(wob) * 0.015), wx = Math.sin(wob * 0.7) * 6 * u;
          // string
          g.strokeStyle = C.ink; g.lineWidth = 3; g.beginPath(); g.moveTo(cx + wx, cy + r * 1.08);
          g.bezierCurveTo(cx + 30 * u, cy + r + 60 * u, cx - 30 * u, cy + r + 110 * u, cx, H * 0.86); g.stroke();
          g.beginPath(); g.ellipse(cx + wx, cy, r * 0.92, r * 1.04, 0, 0, Math.PI * 2); g.fillStyle = COLORS[i]; g.fill(); g.lineWidth = 6; g.stroke();
          g.beginPath(); g.moveTo(cx + wx - 12 * u, cy + r * 1.04 + 14 * u); g.lineTo(cx + wx + 12 * u, cy + r * 1.04 + 14 * u); g.lineTo(cx + wx, cy + r * 1.02); g.closePath(); g.fill(); g.stroke();
          g.beginPath(); g.ellipse(cx + wx - r * 0.38, cy - r * 0.45, r * 0.12, r * 0.24, -0.5, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.6)'; g.fill();
          // nervous face
          const worry = clamp((b.air - 0.6) / 0.4), es = r * 0.09 * (1 + worry * 0.8);
          circle(g, cx + wx - r * 0.25, cy - r * 0.05, es, '#fff', { lw: 3 }); circle(g, cx + wx + r * 0.25, cy - r * 0.05, es, '#fff', { lw: 3 });
          circle(g, cx + wx - r * 0.25, cy - r * 0.05, es * 0.45, C.ink, { lw: 0 }); circle(g, cx + wx + r * 0.25, cy - r * 0.05, es * 0.45, C.ink, { lw: 0 });
          g.beginPath(); g.lineWidth = 4; g.strokeStyle = C.ink;
          if (worry > 0.5) { g.ellipse(cx + wx, cy + r * 0.25, r * 0.1, r * 0.12 * worry, 0, 0, Math.PI * 2); g.stroke(); }
          else { g.arc(cx + wx, cy + r * 0.18, r * 0.16, 0.2, Math.PI - 0.2); g.stroke(); }
          if (worry > 0.7) emoji(g, '💦', cx + wx + r * 0.7, cy - r * 0.6, 34 * u);
        } else emoji(g, '💥', cx, cy, 160 * u);
        // balloon tracker
        for (let k = 0; k < 3; k++) { const x = W / 2 - 60 * u + k * 60 * u; emoji(g, k < i ? '✅' : k === i ? '🎈' : '⚪', x, 100 * u, 40 * u); }
        if (b.phase === 'tied') text(g, `${b.pts}`, cx, cy, { size: 110 * u, color: C.sun });
        meter(g, api, 36 * u, H * 0.3);
      },
    };
  },
};
