import { C, clamp, lerp, circle, blob, text, emoji, mean } from '../util.js';

const TIERS = [[0, 'Mouse', '🐭'], [150, 'Kitten', '🐱'], [300, 'Puppy', '🐶'], [450, 'Lion', '🦁'], [600, 'T-Rex', '🦖'], [750, 'Jet engine', '✈️'], [880, 'Volcano', '🌋']];
const tierOf = (s) => TIERS.filter((t) => s >= t[0]).pop();

export default {
  id: 'roar', name: 'Roar-o-Meter', emoji: '🦁', kind: 'voice', needs: ['mic'],
  tagline: 'One giant three-second ROAR. Ring the bell.',
  howTo: ['Take a deep breath when it says so.', 'When ROAR! appears, make the loudest sound you can for three seconds.', 'A long, steady roar beats a quick yelp. Hit 880 to ring the bell.'],
  crowd: 'Everyone else: total silence during the roar, then go wild.',
  unit: 'roar points',
  quip(s) { const t = tierOf(s); return `That's a ${t[1]} roar! ${t[2]}`; },
  create(api) {
    let phase = 'breath', pt = 0, samples = [], win = [], peak = 0, final = 0, puck = 0, rings = [];
    const READY = 1.4, ROAR = 3.0;
    return {
      start() { api.say('Deep breath…', { rate: 0.9 }); },
      update(dt) {
        pt += dt; const L = api.mic.loud;
        if (phase === 'breath') { api.hint('Deep breath…'); puck = lerp(puck, 0, 0.2); if (pt > READY) { phase = 'roar'; pt = 0; api.hint(''); } }
        else if (phase === 'roar') {
          samples.push(L); win.push(L); if (win.length > 18) win.shift();
          peak = Math.max(peak, mean(win)); puck = lerp(puck, L, 0.35);
          api.timer(1 - pt / ROAR);
          if (L > 0.35 && Math.random() < L) rings.push({ r: 0, a: 1 });
          if (pt > ROAR) {
            final = Math.round(1000 * clamp(0.55 * peak + 0.45 * mean(samples)));
            phase = 'result'; pt = 0; api.timer(null); api.setScore(final);
            api.sfx.setDuck(1);
            if (final >= 880) { api.sfx.ding(); api.fx.burst(api.W / 2, api.H * 0.14, { n: 50, speed: 600 }); api.banner('DING DING!', { color: C.sun }); }
            else { api.sfx.drumroll(0.5); }
          }
        } else if (phase === 'result') {
          puck = lerp(puck, final / 1000, 0.12);
          if (pt > 2.4) api.end(final);
        }
        for (const r of rings) { r.r += dt * 700 * api.u; r.a -= dt * 1.2; } rings = rings.filter((r) => r.a > 0);
      },
      draw(g, W, H) {
        const u = api.u;
        const bg = g.createRadialGradient(W / 2, H * 0.4, 50, W / 2, H * 0.4, Math.max(W, H) * 0.7); bg.addColorStop(0, '#5A2AA8'); bg.addColorStop(1, '#1A0838'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
        for (const r of rings) { g.strokeStyle = `rgba(255,46,136,${r.a})`; g.lineWidth = 8 * u; g.beginPath(); g.arc(W / 2, H * 0.92, r.r, Math.PI, 0); g.stroke(); }
        const tw = 90 * u, top = H * 0.22, bot = H * 0.86, x = W / 2 - tw / 2, h = bot - top;
        // tower
        blob(g, x - 14 * u, bot, tw + 28 * u, 40 * u, 10 * u, C.orange, { lw: 5 });
        blob(g, x, top, tw, h, tw / 2, C.cream, { lw: 6, shadow: 8 });
        const segs = [C.mint, C.lime, C.sun, C.orange, C.pink, C.red, '#B10F4F'];
        TIERS.forEach(([v, name, em], k) => {
          const y0 = bot - h * (v / 1000), y1 = bot - h * ((TIERS[k + 1]?.[0] ?? 1000) / 1000);
          g.save(); g.beginPath(); g.rect(x + 8 * u, y1, tw - 16 * u, y0 - y1); g.clip(); blob(g, x + 8 * u, top + 8 * u, tw - 16 * u, h - 16 * u, (tw - 16 * u) / 2, segs[k], { lw: 0 }); g.restore();
          g.strokeStyle = C.ink; g.lineWidth = 3; g.beginPath(); g.moveTo(x + 8 * u, y0); g.lineTo(x + tw - 8 * u, y0); g.stroke();
          const side = k % 2 ? 1 : -1;
          emoji(g, em, W / 2 + side * (tw / 2 + 56 * u), (y0 + y1) / 2, 44 * u);
          text(g, name, W / 2 + side * (tw / 2 + 96 * u), (y0 + y1) / 2, { size: 24 * u, align: side > 0 ? 'left' : 'right', color: C.cream });
        });
        // bell
        const ring = phase === 'result' && final >= 880;
        g.save(); g.translate(W / 2, top - 30 * u); if (ring) g.rotate(Math.sin(performance.now() / 50) * 0.3);
        g.beginPath(); g.moveTo(-46 * u, 30 * u); g.quadraticCurveTo(-44 * u, -40 * u, 0, -44 * u); g.quadraticCurveTo(44 * u, -40 * u, 46 * u, 30 * u); g.closePath(); g.fillStyle = C.sun; g.fill(); g.lineWidth = 6; g.strokeStyle = C.ink; g.stroke();
        circle(g, 0, 34 * u, 12 * u, C.sun, { lw: 5 }); g.restore();
        // puck
        const py = bot - h * clamp(puck) ;
        blob(g, W / 2 - tw * 0.7, py - 18 * u, tw * 1.4, 36 * u, 18 * u, C.pink, { lw: 5 });
        if (phase === 'roar') { const my = bot - h * peak; g.strokeStyle = C.sun; g.lineWidth = 5; g.beginPath(); g.moveTo(W / 2 - tw * 0.8, my); g.lineTo(W / 2 + tw * 0.8, my); g.stroke(); }
        emoji(g, '🔨', W / 2 + tw * 1.3, bot + 10 * u, 70 * u, -0.5);
        // readouts
        const db = Math.round(40 + api.mic.loud * 85);
        if (phase === 'breath') text(g, 'Deep breath…', W / 2, H * 0.5, { size: 80 * u, color: C.sky });
        if (phase === 'roar') { text(g, 'ROAR!', W / 2, H * 0.5, { size: (110 + api.mic.loud * 60) * u, color: C.sun }); text(g, `${db} dB`, W * 0.84, H * 0.5, { size: 54 * u, color: C.cream }); }
        if (phase === 'result') { const t = tierOf(final); text(g, `${final}`, W * 0.82, H * 0.42, { size: 110 * u, color: C.sun }); text(g, `${t[1]} ${t[2]}`, W * 0.82, H * 0.56, { size: 44 * u, color: C.cream, font: undefined }); }
      },
    };
  },
};
