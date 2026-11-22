import { C, clamp, rand, pick, circle, text, emoji, dist } from '../util.js';
import { drawFaceOutline } from './body.js';

const GOOD = ['🍩', '🍕', '🍔', '🍟', '🍪', '🧁', '🍓', '🍦', '🌮', '🍿', '🥨', '🍰'];
const BAD = [['🌶️', 'Too spicy!', -3], ['🧦', 'A sock?!', -2], ['🧅', 'Onion breath!', -2]];
const DUR = 40;

export default {
  id: 'chomp', name: 'Chomp Champ', emoji: '🍩', kind: 'camera', needs: ['face'],
  tagline: 'Catch falling snacks in your open mouth.',
  howTo: ['Move your head to get under the falling food.', 'Open your mouth wide to chomp it. Closed mouths bounce food away.', 'Avoid chilli, socks and onions. A golden cake is worth 5.'],
  crowd: 'Everyone else: shout "NOM!" with every bite.',
  ready: 'Face the camera with room to move your head around.',
  unit: 'snacks',
  create(api) {
    let items = [], t = 0, spawnT = 0.5, over = false, spicy = 0, chew = 0;
    function mouthInfo() {
      const f = api.vision.face; if (!f) return null;
      const m = api.pt(f.mouth), fw = api.len(f.box.w), jaw = f.blend.jawOpen || 0;
      return { m, fw, jaw, open: jaw > 0.28, nose: api.pt(f.nose) };
    }
    return {
      update(dt) {
        t += dt; spicy = Math.max(0, spicy - dt); chew = Math.max(0, chew - dt * 3);
        const W = api.W, H = api.H, u = api.u;
        spawnT -= dt;
        if (spawnT <= 0 && t < DUR - 1) {
          const r = Math.random(); const golden = r < 0.05, bad = !golden && r < 0.25;
          const b = bad ? pick(BAD) : null;
          items.push({ ch: golden ? '🎂' : bad ? b[0] : pick(GOOD), bad, golden, msg: b?.[1], pts: golden ? 5 : bad ? b[2] : 1, x: rand(0.12, 0.88) * W, y: -40 * u, vy: (0.25 + t / DUR * 0.25) * H * rand(0.85, 1.15), vx: rand(-40, 40) * u, rot: rand(6), vr: rand(-2, 2), r: 42 * u, ph: rand(6), bounced: false });
          spawnT = rand(0.55, 0.95) * (1 - t / DUR * 0.45);
        }
        const mi = mouthInfo();
        api.hint(mi ? '' : "We can't see your face. Come closer!");
        for (const it of items) {
          it.y += it.vy * dt; it.x += it.vx * dt + Math.sin(t * 3 + it.ph) * 30 * u * dt; it.rot += it.vr * dt;
          if (!mi || it.gone || over) continue;
          const reach = Math.max(it.r * 0.9, mi.fw * 0.3);
          if (mi.open && dist(it, mi.m) < reach) {
            it.gone = true; chew = 1; api.add(it.pts, mi.m.x, mi.m.y - mi.fw * 0.6, it.bad ? it.msg : it.golden ? '+5 golden!' : pick(['NOM!', '+1', 'Yum!', '+1']), it.bad ? C.red : C.sun);
            if (it.bad) { spicy = 1.4; api.sfx.wrong(); api.fx.burst(mi.m.x, mi.m.y, { n: 10, emojis: ['💨', '🔥'], speed: 300, dir: -Math.PI / 2, spread: 1.4 }); }
            else { api.sfx.chomp(); api.fx.burst(mi.m.x, mi.m.y, { n: 8, colors: [C.sun, C.cream, C.pink], speed: 250, size: 5 }); if (it.golden) api.sfx.success(); }
          } else if (!mi.open && !it.bounced && dist(it, mi.nose) < mi.fw * 0.5 && it.vy > 0) {
            it.bounced = true; it.vy = -it.vy * 0.55; it.vx = (it.x - mi.nose.x) * 4; it.vr = 8; api.sfx.boing();
          }
          if (it.bounced) it.vy += H * 1.2 * dt;
        }
        items = items.filter((it) => !it.gone && it.y < H + 80 && it.y > -300);
        api.timer(1 - t / DUR);
        if (t >= DUR && !over) { over = true; api.banner('Full!', { color: C.mint }); setTimeout(() => api.end(), 800); }
      },
      draw(g, W, H) {
        const u = api.u; api.camera(g);
        if (api.outlines && api.vision.face) drawFaceOutline(g, api, api.vision.face);
        if (spicy > 0) { g.fillStyle = `rgba(255,77,94,${spicy * 0.25})`; g.fillRect(0, 0, W, H); }
        const mi = mouthInfo();
        if (mi) {
          const rr = Math.max(26 * u, mi.fw * (0.12 + mi.jaw * 0.25)) * (1 + chew * 0.2);
          g.save(); g.setLineDash(mi.open ? [] : [8, 8]); circle(g, mi.m.x, mi.m.y, rr, null, { lw: 7, stroke: mi.open ? C.pink : C.cream }); g.restore();
          if (!mi.open) text(g, 'open wide!', mi.m.x, mi.m.y + rr + 24 * u, { size: 22 * u, color: C.cream });
        }
        for (const it of items) { if (it.golden) circle(g, it.x, it.y, it.r * 1.2, 'rgba(255,210,63,.35)', { lw: 0 }); emoji(g, it.ch, it.x, it.y, it.r * 2, it.rot); }
      },
    };
  },
};
