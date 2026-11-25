import { C, clamp, rand, lerp, blob, text, emoji } from '../util.js';
import { screenBody, drawSkeleton, noBodyHint } from './body.js';

const ROUNDS = 5, GRACE = 0.6, STILL = 0.5;
const BASS = [110, 110, 146.83, 110, 130.81, 110, 164.81, 146.83], RIFF = [440, 0, 523.25, 587.33, 0, 659.25, 587.33, 523.25];

export default {
  id: 'freeze', name: 'Freeze Dance', emoji: '🕺', kind: 'camera', needs: ['pose'],
  tagline: 'Dance while the music plays. Freeze when it stops.',
  howTo: ['When the music plays, dance! The wilder you move, the faster your points climb.', 'When it stops, FREEZE like a statue. Wobble and you lose points.', 'Hold still until the music returns for a statue bonus. Five rounds.'],
  crowd: 'Everyone else: dance along, and judge every wobble without mercy.',
  ready: 'Step back until your head and both arms are on screen. Give yourself room to dance.',
  unit: 'points',
  variety: 'stop-start timings',
  quip(s) { return s >= 520 ? 'Dance floor royalty with nerves of steel.' : s >= 360 ? 'Great moves, solid freezes.' : s >= 180 ? 'Enthusiastic, if a bit wobbly.' : 'More of a gentle sway, really.'; },
  create(api) {
    const seq = (api.shared.freeze ||= Array.from({ length: ROUNDS }, () => [rand(3.6, 6), rand(2.4, 3.8)]));
    let i = 0, dancing = true, pt = 0, m = 0, sb = null, prev = null, poseT = 0, busted = false, beat = 0, step = 0, hue = 0, frozenShot = false;
    function motion() { // average joint speed, in shoulder widths per second
      const pose = api.vision.pose; sb = screenBody(api);
      if (!sb || !pose) { prev = null; return; }
      if (pose.t === poseT) return;
      const dtp = Math.max(0.008, (pose.t - poseT) / 1000); poseT = pose.t;
      const pts = [sb.nose, sb.L.s, sb.R.s, sb.L.e, sb.R.e, sb.L.w, sb.R.w];
      if (prev && dtp < 0.4) {
        let sum = 0, n = 0;
        pts.forEach((p, k) => { const q = prev[k]; if (p && q && p.v > 0.35 && q.v > 0.35) { sum += Math.hypot(p.x - q.x, p.y - q.y); n++; } });
        if (n) m = lerp(m, sum / n / sb.sw / dtp, 0.35);
      }
      prev = pts.map((p) => (p ? { x: p.x, y: p.y, v: p.v } : null));
    }
    function groove(dt) { // a tiny synthesised dance loop, eight steps to the bar
      beat += dt; const len = 0.235;
      while (beat >= len) {
        beat -= len; const k = step % 8;
        if (k % 2 === 0) api.sfx.note(BASS[(step >> 1) % 8], 0.2); if (k === 2 || k === 6) api.sfx.clap(); api.sfx.tick();
        if (RIFF[k]) api.sfx.note(RIFF[k] * (step % 32 >= 16 ? 1.125 : 1), 0.16);
        step++;
      }
    }
    return {
      peek: () => ({ dancing, m, i }), // for automated tests
      idle() { motion(); },
      update(dt) {
        pt += dt; motion(); noBodyHint(api, sb); hue += dt * (dancing ? 120 : 0);
        const [play, stop] = seq[i];
        if (dancing) {
          groove(dt);
          const k = clamp(m / 1.6); api.add(24 * k * dt);
          api.timer(null); if (sb) api.hint(k < 0.25 ? 'Dance! Move those arms!' : '');
          if (pt >= play) { dancing = false; pt = 0; busted = false; frozenShot = false; api.sfx.whoosh(); api.sfx.squeak(); api.fx.flash('#9AD8FF', 0.3); api.banner('FREEZE!', { color: C.sky }); }
        } else {
          api.timer(1 - pt / stop); if (sb) api.hint(busted ? '' : 'Freeze! Not a muscle!');
          if (pt > GRACE && !frozenShot && sb) { frozenShot = true; api.keep(api.snap(sb.mid.x, sb.mid.y + sb.sw * 0.2, sb.sw * 4.2, { emoji: '🗿', label: 'Freeze!', score: i })); }
          if (pt > GRACE && !busted && m > STILL) { busted = true; api.add(-12, api.W / 2, api.H * 0.35, 'Moved! -12', C.red); api.sfx.wrong(); api.fx.shake(12); }
          if (pt >= stop) {
            if (!busted) { api.add(20, api.W / 2, api.H * 0.35, 'Statue! +20', C.mint); api.sfx.success(); }
            i++; if (i >= ROUNDS) { api.timer(null); api.hint(''); api.end(); return; }
            dancing = true; pt = 0; beat = 0;
          }
        }
      },
      draw(g, W, H) {
        const u = api.u; api.camera(g);
        if (dancing) { // disco lights
          for (let k = 0; k < 3; k++) { const x = W * (0.2 + k * 0.3) + Math.sin(performance.now() / 500 + k * 2) * W * 0.12; const gr = g.createRadialGradient(x, 0, 10, x, H * 0.5, H * 0.9); gr.addColorStop(0, `hsla(${(hue + k * 120) % 360}, 95%, 60%, .45)`); gr.addColorStop(1, 'hsla(0,0%,0%,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
        } else { g.fillStyle = 'rgba(60,140,255,.28)'; g.fillRect(0, 0, W, H); }
        if (api.outlines) drawSkeleton(g, sb, { color: dancing ? C.pink : busted ? C.red : C.sky, lw: sb ? Math.max(5, sb.sw * 0.05) : 6 });
        const top = Math.max(100 * u, 88);
        text(g, dancing ? 'DANCE!' : 'FREEZE!', W / 2, top + 26 * u, { size: (dancing ? 64 + Math.sin(performance.now() / 120) * 6 : 72) * u, color: dancing ? C.sun : C.sky });
        for (let k = 0; k < ROUNDS; k++) emoji(g, k < i ? '✅' : k === i ? (dancing ? '🎵' : '🧊') : '⚪', W / 2 - (ROUNDS - 1) * 22 * u + k * 44 * u, top + 80 * u, 30 * u);
        // movement meter
        const mh = Math.min(H * 0.4, H - 260 * u), mx = W - 62 * u, my = Math.max(H * 0.3, 150), mw = 34 * u, k = clamp(m / 1.6);
        blob(g, mx, my, mw, mh, mw / 2, C.cream, { lw: 4 });
        if (k > 0.02) blob(g, mx + 4, my + mh - 4 - (mh - 8) * k, mw - 8, Math.max(mw - 8, (mh - 8) * k), (mw - 8) / 2, dancing ? C.pink : m > STILL ? C.red : C.sky, { lw: 0 });
        if (!dancing) { const ly = my + mh - 4 - (mh - 8) * clamp(STILL / 1.6); g.fillStyle = C.red; g.fillRect(mx - 8 * u, ly - 2, mw + 16 * u, 4); }
        emoji(g, dancing ? '💃' : '🗿', mx + mw / 2, my - 30 * u, 44 * u);
      },
    };
  },
};
