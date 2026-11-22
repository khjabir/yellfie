import { C, clamp, rand, pick, circle, blob, text, emoji, median, rrect } from '../util.js';

const MAX = 60;
const PROMPTS = [
  'do your best chicken dance 🐔', 'whisper "moist" very slowly', 'make a fish face 🐟', 'tell your worst joke',
  'do a dramatic slow-motion fall', 'sing Happy Birthday like an opera singer', 'pretend to be a dinosaur 🦖',
  'do a runway walk 💅', 'talk like a pirate 🏴‍☠️', 'act like a cat that saw a cucumber 🥒', 'do a robot dance 🤖',
];
const STAGES = [[3, 'googly'], [9, 'stache'], [15, 'nose'], [21, 'hat'], [28, 'ears']];

export default {
  id: 'poker', name: 'Poker Face', emoji: '😐', kind: 'camera', needs: ['face'],
  tagline: "Don't smile. Don't laugh. Don't crack.",
  howTo: ['Keep a straight face for as long as you can.', 'Smiling or laughing fills the crack meter. When it is full, you are out.', 'The screen will gradually make you look ridiculous. Ignore it. If you can.'],
  crowd: 'Everyone else: do whatever the screen tells you. Make them crack!',
  ready: 'Face the camera, close up. Start with a relaxed, neutral face.',
  unit: 'seconds',
  format: (s) => s.toFixed(1),
  quip(s) { return s >= MAX ? 'A face carved from granite.' : s >= 30 ? 'Professional poker player energy.' : s >= 10 ? 'Held it together… for a while.' : 'Cracked like an egg.'; },
  create(api) {
    let phase = 'calib', pt = 0, bs = [], bj = [], bSmile = 0.05, bJaw = 0.05, t = 0, meter = 0, over = false;
    let prompt = pick(PROMPTS), promptT = 0, gagT = 4, parade = null;
    const goog = [{ ox: 0, oy: 0, vx: 0, vy: 0, last: null }, { ox: 0, oy: 0, vx: 0, vy: 0, last: null }];
    const has = (k) => STAGES.some(([s, n]) => n === k && t >= s);
    function crack() {
      if (over) return; over = true;
      const f = api.vision.face;
      if (f) { const c = api.pt({ x: (f.box.x0 + f.box.x1) / 2, y: (f.box.y0 + f.box.y1) / 2 }); api.keep(api.snap(c.x, c.y - api.len(f.box.w) * 0.15, api.len(f.box.w) * 2, { emoji: '🤣', label: 'Cracked!', score: t })); }
      api.sfx.fail(); api.banner('CRACKED!', { color: C.pink }); setTimeout(() => api.end(t), 1500);
    }
    return {
      update(dt) {
        pt += dt; const f = api.vision.face;
        const smile = f ? ((f.blend.mouthSmileLeft || 0) + (f.blend.mouthSmileRight || 0)) / 2 : 0, jaw = f?.blend.jawOpen || 0;
        if (phase === 'calib') {
          api.hint('Neutral face… measuring'); if (f) { bs.push(smile); bj.push(jaw); }
          if (pt > 1.5) { bSmile = Math.min(0.35, median(bs)); bJaw = Math.min(0.3, median(bj)); phase = 'go'; api.hint(''); api.banner('Poker face!', { color: C.mint, size: 90 * api.u }); }
          return;
        }
        if (over) return;
        t += dt; api.setScore(t);
        api.hint(f ? `Crowd: ${prompt}` : "We can't see your face!");
        const inten = clamp((smile - bSmile - 0.16) / 0.45, 0, 2) + clamp((jaw - bJaw - 0.22) / 0.5, 0, 1.5);
        meter = inten > 0 ? meter + inten * 1.15 * dt : Math.max(0, meter - 0.1 * dt);
        if (meter >= 1) crack();
        if (t >= MAX) { over = true; api.sfx.fanfare(); api.banner('Stone cold!', { color: C.sun }); if (f) { const c = api.pt(f.nose); api.keep(api.snap(c.x, c.y, api.len(f.box.w) * 2, { emoji: '😐', label: 'Unbreakable', score: t })); } setTimeout(() => api.end(MAX), 1500); }
        promptT += dt; if (promptT > 6.5) { promptT = 0; prompt = pick(PROMPTS); api.sfx.point(); }
        gagT -= dt;
        if (gagT <= 0) { const k = pick(['fart', 'fart', 'boing', 'honk', 'parade']); if (k === 'parade') parade = { t: 0 }; else api.sfx[k](); gagT = rand(4, 7); }
        if (parade) { parade.t += dt; if (parade.t > 4) parade = null; }
        // googly-eye physics
        if (f) [f.eyeL, f.eyeR].forEach((e, k) => {
          const p = api.pt(e), gg = goog[k]; const r = api.len(f.box.w) * 0.13;
          const step = Math.max(dt, 0.008);
          if (gg.last) { gg.vx -= ((p.x - gg.last.x) / step) * 0.5; gg.vy -= ((p.y - gg.last.y) / step) * 0.5; }
          gg.last = p; gg.vy += 2200 * dt; gg.vx *= 0.92; gg.vy *= 0.92; gg.ox += gg.vx * dt; gg.oy += gg.vy * dt;
          const lim = r * 0.5, d = Math.hypot(gg.ox, gg.oy); if (d > lim) { gg.ox *= lim / d; gg.oy *= lim / d; gg.vx *= -0.4; gg.vy *= -0.4; }
        });
      },
      draw(g, W, H) {
        const u = api.u; api.camera(g); const f = api.vision.face;
        if (f && phase === 'go') {
          const fw = api.len(f.box.w); const roll = f.roll;
          if (has('ears')) { const top = api.pt(f.pts[10]); for (const s of [-1, 1]) { g.save(); g.translate(top.x + s * fw * 0.32, top.y - fw * 0.12); g.rotate(roll + s * 0.3); g.beginPath(); g.moveTo(-fw * 0.12, 0); g.lineTo(0, -fw * 0.3); g.lineTo(fw * 0.12, 0); g.closePath(); g.fillStyle = C.pink; g.fill(); g.lineWidth = 5; g.strokeStyle = C.ink; g.stroke(); g.restore(); } }
          if (has('hat')) { const top = api.pt(f.pts[10]); g.save(); g.translate(top.x, top.y - fw * 0.05); g.rotate(roll - 0.15); g.beginPath(); g.moveTo(-fw * 0.22, 0); g.lineTo(0, -fw * 0.62); g.lineTo(fw * 0.22, 0); g.closePath(); g.fillStyle = C.sky; g.fill(); g.lineWidth = 5; g.strokeStyle = C.ink; g.stroke(); g.strokeStyle = C.sun; g.lineWidth = 7; g.beginPath(); g.moveTo(-fw * 0.12, -fw * 0.2); g.lineTo(fw * 0.14, -fw * 0.26); g.moveTo(-fw * 0.06, -fw * 0.4); g.lineTo(fw * 0.08, -fw * 0.44); g.stroke(); circle(g, 0, -fw * 0.64, fw * 0.06, C.pink, { lw: 4 }); g.restore(); }
          if (has('googly')) [f.eyeL, f.eyeR].forEach((e, k) => { const p = api.pt(e), r = fw * 0.13; circle(g, p.x, p.y, r, '#fff', { lw: 5 }); circle(g, p.x + goog[k].ox, p.y + goog[k].oy, r * 0.45, C.ink, { lw: 0 }); });
          if (has('nose')) { const n = api.pt(f.nose); circle(g, n.x, n.y, fw * 0.1, C.red, { lw: 5 }); circle(g, n.x - fw * 0.03, n.y - fw * 0.03, fw * 0.025, '#fff', { lw: 0 }); }
          if (has('stache')) {
            const m = api.pt(f.pts[164] || f.pts[0]); const w = fw * 0.42; g.save(); g.translate(m.x, m.y); g.rotate(roll);
            g.beginPath(); g.moveTo(0, -w * 0.06);
            g.bezierCurveTo(-w * 0.2, -w * 0.2, -w * 0.45, -w * 0.05, -w * 0.5, -w * 0.22); g.bezierCurveTo(-w * 0.55, w * 0.05, -w * 0.25, w * 0.12, 0, w * 0.02);
            g.bezierCurveTo(w * 0.25, w * 0.12, w * 0.55, w * 0.05, w * 0.5, -w * 0.22); g.bezierCurveTo(w * 0.45, -w * 0.05, w * 0.2, -w * 0.2, 0, -w * 0.06);
            g.fillStyle = '#3A2414'; g.fill(); g.lineWidth = 3; g.strokeStyle = C.ink; g.stroke(); g.restore();
          }
        }
        if (parade) for (let k = 0; k < 6; k++) emoji(g, ['💃', '🕺', '🐸', '🦆', '🐧', '🦩'][k], -100 + ((parade.t * 260 * u + k * 140 * u) % (W + 200)), H * 0.8 + Math.abs(Math.sin(parade.t * 8 + k)) * -40 * u, 80 * u);
        // crack-o-meter
        const mh = H * 0.5, mx = W - 70 * u, my = H * 0.22;
        blob(g, mx, my, 40 * u, mh, 20 * u, C.cream, { lw: 5 });
        const fh = (mh - 10) * clamp(meter); blob(g, mx + 5, my + mh - 5 - fh, 40 * u - 10, Math.max(0, fh), 15 * u, meter > 0.7 ? C.red : meter > 0.35 ? C.orange : C.mint, { lw: 0 });
        emoji(g, meter > 0.7 ? '🤭' : meter > 0.35 ? '🙂' : '😐', mx + 20 * u, my - 34 * u, 48 * u);
        if (phase === 'go') text(g, `${t.toFixed(1)}s`, W / 2, H * 0.13, { size: 80 * u, color: C.sun });
      },
    };
  },
};
