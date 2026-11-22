import { C, clamp, lerp, rand, circle, blob, text, emoji, median } from '../util.js';
import { cents } from '../mic.js';

export default {
  id: 'tightrope', name: 'Tightrope Tenor', emoji: '🎶', kind: 'voice', needs: ['mic'],
  tagline: 'Hold one steady note to walk the rope.',
  howTo: ['Sing or hum any note you like and hold it.', 'Your walker moves while the note stays steady.', 'Wobble off the note, or run out of breath, and down they go.'],
  crowd: 'Everyone else: quiet please. Pulling faces is allowed.',
  unit: 'metres',
  format: (s) => Math.floor(s).toString(),
  quip(s) { return s >= 60 ? 'Lungs like a pair of opera bagpipes.' : s >= 35 ? 'Smooth, steady, slightly smug.' : s >= 15 ? 'A wobbly but heroic crossing.' : 'The rope wins this time.'; },
  create(api) {
    let phase = 'wait', pt = 0, ref = 0, warm = [], dist = 0, lean = 0, offT = 0, silentT = 0, fallT = 0, fallV = 0, fy = 0, birds = [];
    const flags = [];
    return {
      update(dt) {
        pt += dt; const f = api.mic.pitch;
        if (phase === 'wait') {
          api.hint(warm.length ? 'Hold it…' : 'Start singing any note!');
          if (f) { warm.push(f); if (warm.length > 20) { ref = median(warm); phase = 'walk'; api.hint(''); api.banner('Walk!', { color: C.mint, size: 90 * api.u }); } }
          else if (warm.length && pt > 0.5) warm = [];
          if (pt > 10) { phase = 'fall'; api.banner('No note?', { color: C.red }); }
          return;
        }
        if (phase === 'walk') {
          let dev = 0;
          if (f) { dev = cents(f, ref); silentT = 0; } else silentT += dt;
          const off = Math.abs(dev) > 110;
          offT = off ? offT + dt : Math.max(0, offT - dt * 2);
          lean = lerp(lean, clamp(dev / 110, -1.4, 1.4) + Math.sin(pt * 3) * 0.08, clamp(dt * 6));
          const speed = Math.abs(dev) > 60 ? 2.4 : 4.6;
          if (f) dist += speed * dt;
          api.setScore(dist);
          api.hint(silentT > 0.15 ? 'Keep singing!' : off ? (dev > 0 ? 'Too high!' : 'Too low!') : '');
          if (silentT > 0.5 || offT > 0.45) { phase = 'fall'; fallT = 0; fy = 0; fallV = 0; api.sfx.setDuck(1); api.sfx.fail(); api.banner('Whoaaa!', { color: C.red }); api.hint(''); }
          if (dist >= 150) { phase = 'win'; api.banner('Legend!', { color: C.sun }); api.sfx.setDuck(1); api.sfx.fanfare(); setTimeout(() => api.end(dist), 1600); }
        } else if (phase === 'fall') {
          fallT += dt; fallV += 1600 * api.u * dt; fy += fallV * dt; lean += (lean >= 0 ? 1 : -1) * dt * 3;
          if (fallT > 1.4) api.end(dist);
        }
      },
      draw(g, W, H) {
        const u = api.u, scroll = dist * 60 * u;
        const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#FF7A3D'); sky.addColorStop(0.55, '#FF2E88'); sky.addColorStop(1, '#2A0E5C'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
        circle(g, W * 0.75, H * 0.62, 110 * u, C.sun, { lw: 0 });
        // canyon walls
        g.fillStyle = '#5A1E6E'; g.strokeStyle = C.ink; g.lineWidth = 5;
        for (let k = -1; k < 6; k++) { const x = k * 520 * u - (scroll * 0.4) % (520 * u); g.beginPath(); g.moveTo(x, H); g.lineTo(x + 80 * u, H * 0.72); g.lineTo(x + 200 * u, H * 0.78); g.lineTo(x + 300 * u, H * 0.68); g.lineTo(x + 420 * u, H); g.closePath(); g.fill(); g.stroke(); }
        // rope + flags
        const ry = H * 0.55, wx = W * 0.38;
        g.strokeStyle = C.ink; g.lineWidth = 6; g.beginPath(); g.moveTo(0, ry); g.quadraticCurveTo(wx, ry + 26 * u, W, ry); g.stroke();
        g.strokeStyle = C.cream; g.lineWidth = 2.5; g.stroke();
        for (let m = 25; m <= 150; m += 25) {
          const fx = wx + (m - dist) * 60 * u; if (fx < -50 || fx > W + 50) continue;
          g.strokeStyle = C.ink; g.lineWidth = 4; g.beginPath(); g.moveTo(fx, ry + 10 * u); g.lineTo(fx, ry - 80 * u); g.stroke();
          g.fillStyle = m % 50 ? C.mint : C.sun; g.beginPath(); g.moveTo(fx, ry - 80 * u); g.lineTo(fx + 50 * u, ry - 66 * u); g.lineTo(fx, ry - 52 * u); g.closePath(); g.fill(); g.stroke();
          text(g, `${m}m`, fx, ry - 100 * u, { size: 22 * u });
        }
        // walker
        g.save(); g.translate(wx, ry + 13 * u + fy); g.rotate(lean * 0.45);
        const step = Math.sin(dist * 3);
        g.strokeStyle = C.ink; g.lineCap = 'round'; g.lineWidth = 8 * u;
        g.beginPath(); g.moveTo(0, -60 * u); g.lineTo(-12 * u + step * 10 * u, 0); g.moveTo(0, -60 * u); g.lineTo(12 * u - step * 10 * u, 0); g.stroke();
        g.beginPath(); g.moveTo(0, -60 * u); g.lineTo(0, -120 * u); g.stroke();
        g.save(); g.translate(0, -100 * u); g.rotate(-lean * 0.3); g.strokeStyle = C.ink; g.lineWidth = 9 * u; g.beginPath(); g.moveTo(-130 * u, 0); g.lineTo(130 * u, 0); g.stroke(); g.strokeStyle = C.sun; g.lineWidth = 4 * u; g.stroke();
        circle(g, -130 * u, 0, 9 * u, C.pink, { lw: 3 }); circle(g, 130 * u, 0, 9 * u, C.pink, { lw: 3 }); g.restore();
        circle(g, 0, -148 * u, 28 * u, C.cream, { lw: 5 });
        g.lineWidth = 3.5; g.strokeStyle = C.ink; g.beginPath();
        if (phase === 'fall') { g.arc(0, -138 * u, 9 * u, 0, Math.PI * 2); } else { g.ellipse(0, -138 * u, 8 * u, 6 * u + api.mic.level * 8 * u, 0, 0, Math.PI * 2); }
        g.stroke(); circle(g, -10 * u, -154 * u, 3.5 * u, C.ink, { lw: 0 }); circle(g, 10 * u, -154 * u, 3.5 * u, C.ink, { lw: 0 });
        if (api.mic.pitch && phase === 'walk') emoji(g, '🎵', 40 * u, -190 * u + Math.sin(pt * 6) * 8 * u, 34 * u);
        g.restore();
        // steadiness gauge
        if (phase === 'walk' || phase === 'wait') {
          const gw = 420 * u, gx = W / 2 - gw / 2, gy = 100 * u;
          blob(g, gx, gy, gw, 34 * u, 17 * u, C.cream, { lw: 4 }); blob(g, W / 2 - gw * 0.13, gy + 4, gw * 0.26, 34 * u - 8, 13 * u, C.mint, { lw: 0 });
          const dev = phase === 'walk' && api.mic.pitch ? clamp(cents(api.mic.pitch, ref) / 200, -1, 1) : 0;
          const nx = W / 2 + dev * gw / 2; g.fillStyle = C.ink; g.beginPath(); g.moveTo(nx, gy + 30 * u); g.lineTo(nx - 12 * u, gy - 12 * u); g.lineTo(nx + 12 * u, gy - 12 * u); g.closePath(); g.fill();
          text(g, 'low', gx - 12 * u, gy + 17 * u, { size: 20 * u, align: 'right' }); text(g, 'high', gx + gw + 12 * u, gy + 17 * u, { size: 20 * u, align: 'left' });
        }
      },
    };
  },
};
