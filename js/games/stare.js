import { C, clamp, rand, pick, circle, blob, text, emoji, median } from '../util.js';
import { drawFaceOutline } from './body.js';

const MAX = 60;
const PRANKS = ['fly', 'boo', 'spider', 'party', 'fakeout', 'honk', 'eyedrops'];

export default {
  id: 'stare', name: 'Staring Contest', emoji: '👀', kind: 'camera', needs: ['face'],
  tagline: "Don't blink. Seriously. Don't.",
  howTo: ['Look at the camera with your eyes open.', 'The clock runs until you blink or look away. Then you get a photo of the moment it happened.', 'The game will try to make you blink. So will your friends.'],
  crowd: 'Everyone else: make them blink. Pull faces, tell jokes. No touching, no blowing in eyes.',
  ready: 'Face the camera, nice and close, with good light on your face.',
  unit: 'seconds',
  format: (s) => s.toFixed(1),
  quip(s) { return s >= MAX ? 'Unblinkable. Are you even human?' : s >= 30 ? 'Eyes of a hawk. A dry, dry hawk.' : s >= 12 ? 'Respectable staring.' : 'Blink and you lose. You blinked.'; },
  create(api) {
    let phase = 'calib', pt = 0, base = [], thr = 0.45, t = 0, over = false, closedFrames = 0, lostT = 0, nextPrank = 4, prank = null, lastFrame = 0;
    function lose(why) {
      if (over) return; over = true;
      const f = api.vision.face;
      if (f) { const c = api.pt({ x: (f.box.x0 + f.box.x1) / 2, y: (f.box.y0 + f.box.y1) / 2 }); api.keep(api.snap(c.x, c.y, api.len(f.box.w) * 1.7, { emoji: why === 'blink' ? '😑' : '🙈', label: why === 'blink' ? 'Blinked!' : 'Looked away', score: t })); }
      api.sfx.fail(); api.banner(why === 'blink' ? 'BLINK!' : 'Looked away!', { color: C.red });
      setTimeout(() => api.end(t), 1500);
    }
    function startPrank() {
      const k = pick(PRANKS); prank = { k, t: 0 };
      if (k === 'fly') api.sfx.buzz(3);
      if (k === 'boo') api.sfx.boo();
      if (k === 'honk') api.sfx.honk();
      if (k === 'party') api.fx.burst(api.W / 2, api.H, { n: 40, emojis: ['🎉', '🎈', '✨', '🎊'], speed: 900, spread: 1.2 });
      if (k === 'fakeout') { api.banner('YOU BLINKED!', { color: C.red }); api.sfx.wrong(); }
    }
    return {
      update(dt, now) {
        pt += dt; const f = api.vision.face;
        const bl = f ? ((f.blend.eyeBlinkLeft || 0) + (f.blend.eyeBlinkRight || 0)) / 2 : 0;
        if (phase === 'calib') {
          api.hint('Eyes wide open… measuring your stare');
          if (f) base.push(bl);
          if (pt > 1.3) { thr = clamp(median(base) + 0.3, 0.38, 0.62); phase = 'go'; pt = 0; api.hint(''); api.banner('Stare!', { color: C.mint, size: 100 * api.u }); }
          return;
        }
        if (over) return;
        t += dt; api.setScore(t);
        if (!f) { lostT += dt; if (lostT > 1.0) lose('away'); } else lostT = 0;
        if (f && f.t !== lastFrame) { lastFrame = f.t; closedFrames = bl > thr ? closedFrames + 1 : 0; if (closedFrames >= 2) lose('blink'); }
        if (t >= MAX) { over = true; api.sfx.fanfare(); api.banner('Unblinkable!', { color: C.sun }); setTimeout(() => api.end(MAX), 1500); }
        if (t > nextPrank && !prank) { startPrank(); nextPrank = t + rand(3.5, 6.5) * (1 - t / 120); }
        if (prank) { prank.t += dt; if (prank.k === 'fakeout' && prank.t > 1.2 && !prank.done) { prank.done = true; api.banner('…just kidding 😜', { color: C.sun, size: 70 * api.u }); } if (prank.t > 3) prank = null; }
      },
      draw(g, W, H) {
        const u = api.u; api.camera(g);
        const f = api.vision.face;
        if (api.outlines && api.vision.face) drawFaceOutline(g, api, api.vision.face);
        g.fillStyle = 'rgba(26,16,51,.15)'; g.fillRect(0, 0, W, H);
        if (f) {
          for (const [e, k] of [[f.eyeL, 'eyeBlinkLeft'], [f.eyeR, 'eyeBlinkRight']]) {
            const p = api.pt(e); const open = 1 - clamp((f.blend[k] || 0) / thr);
            g.save(); g.setLineDash([6, 6]); circle(g, p.x, p.y, api.len(f.box.w) * 0.13, null, { lw: 4, stroke: open > 0.3 ? C.mint : C.red }); g.restore();
          }
        }
        if (phase === 'go' || over) text(g, `${t.toFixed(1)}s`, W / 2, H * 0.13, { size: 90 * u, color: C.sun });
        // pranks
        if (prank && !over) {
          const k = prank.t;
          const fc = f ? api.pt(f.nose) : { x: W / 2, y: H / 2 };
          if (prank.k === 'fly') emoji(g, '🪰', fc.x + Math.sin(k * 7) * 160 * u, fc.y - 60 * u + Math.cos(k * 11) * 90 * u, 56 * u, Math.sin(k * 20) * 0.5);
          if (prank.k === 'boo' && k < 1) { const s = clamp(k * 4); emoji(g, '👻', W / 2, H / 2, 380 * u * s, 0, 1 - Math.max(0, k - 0.6) / 0.4); }
          if (prank.k === 'spider') { const y = Math.min(fc.y - 120 * u, -40 + k * 300 * u); g.strokeStyle = C.cream; g.lineWidth = 2; g.beginPath(); g.moveTo(fc.x + 70 * u, 0); g.lineTo(fc.x + 70 * u, y); g.stroke(); emoji(g, '🕷️', fc.x + 70 * u, y + 20 * u, 80 * u); }
          if (prank.k === 'honk' && k < 1.2) emoji(g, '📯', W * 0.2, H * 0.6, 160 * u, Math.sin(k * 30) * 0.2);
          if (prank.k === 'eyedrops') text(g, 'Eyes getting dry yet? 💧', W / 2, H * 0.85, { size: 44 * u, color: C.cream });
        }
        if (phase === 'calib') text(g, 'Get ready to stare…', W / 2, H * 0.15, { size: 56 * u, color: C.cream });
      },
    };
  },
};
