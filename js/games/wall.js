import { C, clamp, rand, sample, pick, median, segDist, text, emoji, rrect } from '../util.js';
import { POSES, screenBody, ghostJoints, drawSkeleton, noBodyHint } from './body.js';

const SHAPES = [
  { pose: 't', dx: 0, crouch: false, call: 'Arms out wide!' },
  { pose: 'y', dx: 0, crouch: false, call: 'Arms up in a Y!' },
  { pose: 'touchdown', dx: -0.18, crouch: false, call: 'Step left, arms up!' },
  { pose: 'scarecrow', dx: 0.18, crouch: false, call: 'Step right!' },
  { pose: 'flex', dx: 0, crouch: true, call: 'Duck and flex!' },
  { pose: 'disco', dx: -0.15, crouch: false, call: 'Disco, to the left!' },
  { pose: 'egypt', dx: 0.15, crouch: false, call: 'Egyptian, to the right!' },
  { pose: 'hero', dx: 0, crouch: true, call: 'Duck, superhero!' },
  { pose: 'm', dx: 0, crouch: false, call: 'Make an M!' },
  { pose: 'dab', dx: 0.1, crouch: false, call: 'Dab!' },
];
const N = 6;

export default {
  id: 'wall', name: 'Hole in the Wall', emoji: '🧱', kind: 'camera', needs: ['pose'],
  tagline: 'A wall is coming. Fit your body through the hole.',
  howTo: ['A brick wall with a body-shaped hole flies toward you.', 'Move, duck and pose so your head, shoulders and arms sit inside the hole.', 'Six walls, each faster than the last. Get it wrong and… SMASH.'],
  crowd: 'Everyone else: count it down out loud. "THREE… TWO… ONE…"',
  ready: 'Stand in the middle, about two steps back. Head and both arms on screen.',
  unit: 'points',
  variety: 'walls',
  create(api) {
    const walls = (api.shared.walls ||= api.deal('walls', SHAPES, N));
    let i = 0, pt = 0, phase = 'calib', swS = [], sw = 0, wallCv = null, hole = null, result = null, sb = null, bricks = [];
    const dur = () => 4.2 - i * 0.3;

    function buildHole() {
      const W = api.W, H = api.H, s = walls[i], pose = POSES.find((p) => p.id === s.pose);
      const cx = W * (0.5 + s.dx), sy = H * (s.crouch ? 0.6 : 0.44);
      const Ls = { x: cx - sw / 2, y: sy }, Rs = { x: cx + sw / 2, y: sy };
      const gh = ghostJoints(Ls, Rs, pose.a, sw);
      hole = { gh, cx, sy, thick: sw * 0.5, call: s.call };
      // brick wall with the body cut out
      wallCv = document.createElement('canvas'); wallCv.width = W; wallCv.height = H; const g = wallCv.getContext('2d');
      g.fillStyle = '#C8553D'; g.fillRect(0, 0, W, H); const bw = 90 * api.u, bh = 44 * api.u;
      g.strokeStyle = '#7A2E22'; g.lineWidth = 5;
      for (let y = 0, r = 0; y < H; y += bh, r++) for (let x = (r % 2) * -bw / 2; x < W; x += bw) { g.fillStyle = (Math.floor(x / bw) + r) % 3 ? '#D9663F' : '#C24E36'; g.fillRect(x + 2, y + 2, bw - 4, bh - 4); g.strokeRect(x + 2, y + 2, bw - 4, bh - 4); }
      g.globalCompositeOperation = 'source-atop'; shape(g, 8 * api.u, C.ink);
      g.globalCompositeOperation = 'destination-out'; shape(g, 0, '#000'); g.globalCompositeOperation = 'source-over';
    }
    function shape(g, grow, col) {
      const { gh, thick, cx, sy } = hole; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = thick + grow * 2;
      g.beginPath(); g.moveTo(gh.L.w.x, gh.L.w.y); g.lineTo(gh.L.e.x, gh.L.e.y); g.lineTo(gh.L.s.x, gh.L.s.y); g.lineTo(gh.R.s.x, gh.R.s.y); g.lineTo(gh.R.e.x, gh.R.e.y); g.lineTo(gh.R.w.x, gh.R.w.y); g.strokeStyle = col; g.stroke();
      g.beginPath(); g.arc(gh.head.x, gh.head.y, gh.head.r * 1.35 + grow, 0, Math.PI * 2); g.fillStyle = col; g.fill();
      g.beginPath(); g.arc(gh.L.w.x, gh.L.w.y, thick * 0.6 + grow, 0, Math.PI * 2); g.arc(gh.R.w.x, gh.R.w.y, thick * 0.6 + grow, 0, Math.PI * 2); g.fill();
      rrect(g, cx - sw * 0.62 - grow, sy - grow, sw * 1.24 + grow * 2, api.H, sw * 0.2); g.fill();
    }
    function inside(p, kind) {
      if (!p || p.v < 0.4) return false;
      const { gh, thick, cx, sy } = hole; const tol = sw * 0.12;
      if (kind === 'head') return Math.hypot(p.x - gh.head.x, p.y - gh.head.y) < gh.head.r * 1.35 + tol;
      if (Math.abs(p.x - cx) < sw * 0.62 + tol && p.y > sy - tol) return true;
      const segs = [[gh.L.w, gh.L.e], [gh.L.e, gh.L.s], [gh.L.s, gh.R.s], [gh.R.s, gh.R.e], [gh.R.e, gh.R.w]];
      return segs.some(([a, b]) => segDist(p, a, b) < thick / 2 + tol) || Math.hypot(p.x - gh.L.w.x, p.y - gh.L.w.y) < thick * 0.6 + tol || Math.hypot(p.x - gh.R.w.x, p.y - gh.R.w.y) < thick * 0.6 + tol;
    }
    function impact() {
      const pts = sb ? [[sb.nose, 'head'], [sb.L.s], [sb.R.s], [sb.L.e], [sb.R.e], [sb.L.w], [sb.R.w]] : [];
      const ok = pts.filter(([p, k]) => inside(p, k)).length; const frac = pts.length ? ok / pts.length : 0;
      const pass = frac >= 0.8;
      const pts2 = pass ? Math.round(100 * frac) : Math.round(40 * frac);
      api.add(pts2, api.W / 2, api.H * 0.25, `+${pts2}`);
      const photo = sb ? api.snap(hole.cx, hole.sy + sw * 0.2, sw * 4.4, { emoji: pass ? '😅' : '💥', label: pass ? 'Squeezed!' : 'Smashed!', score: frac }) : null;
      if (pass) { api.sfx.whoosh(); api.sfx.success(); api.banner(frac === 1 ? 'Perfect fit!' : 'Squeezed through!', { color: C.mint }); }
      else {
        api.sfx.crash(); api.fx.shake(26, 0.6); api.banner('SMASH!', { color: C.red });
        bricks = Array.from({ length: 40 }, () => ({ x: rand(api.W), y: rand(api.H), vx: rand(-500, 500), vy: rand(-700, -100), r: rand(6), vr: rand(-8, 8), w: rand(40, 90) * api.u }));
      }
      if (photo) api.keep(photo);
      result = { pass, frac }; phase = 'after'; pt = 0;
    }
    return {
      idle() { sb = screenBody(api); if (sb) { swS.push(sb.sw); if (swS.length > 60) swS.shift(); } },
      update(dt) {
        pt += dt; sb = screenBody(api);
        for (const b of bricks) { b.vy += 1800 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt; }
        if (phase === 'calib') {
          if (sb) swS.push(sb.sw);
          api.hint('Stand still for a second…');
          if (pt > 1.2) { sw = clamp(swS.length ? median(swS) : api.W * 0.14, api.W * 0.08, api.W * 0.22); buildHole(); phase = 'come'; pt = 0; api.hint(hole.call); api.say(hole.call, { rate: 1.15 }); }
          return;
        }
        if (phase === 'come') {
          noBodyHint(api, sb); if (sb) api.hint(hole.call);
          api.timer(1 - pt / dur());
          if (pt >= dur()) impact();
        } else if (phase === 'after') {
          api.timer(null);
          if (pt > 1.5) { i++; bricks = []; if (i >= N) { api.end(); return; } buildHole(); phase = 'come'; pt = 0; api.say(hole.call, { rate: 1.15 }); }
        }
      },
      draw(g, W, H) {
        const u = api.u; api.camera(g);
        if (hole && phase === 'come') {
          // target zone on the "floor" so players can line up early
          g.save(); g.globalAlpha = 0.45; g.setLineDash([14, 10]); g.strokeStyle = C.sun; g.lineWidth = 5; g.lineCap = 'round';
          const gh = hole.gh; g.beginPath(); g.moveTo(gh.L.w.x, gh.L.w.y); g.lineTo(gh.L.e.x, gh.L.e.y); g.lineTo(gh.L.s.x, gh.L.s.y); g.lineTo(gh.R.s.x, gh.R.s.y); g.lineTo(gh.R.e.x, gh.R.e.y); g.lineTo(gh.R.w.x, gh.R.w.y); g.stroke();
          g.beginPath(); g.arc(gh.head.x, gh.head.y, gh.head.r * 1.35, 0, Math.PI * 2); g.stroke(); g.restore();
          if (api.outlines) drawSkeleton(g, sb, { color: C.mint, lw: Math.max(5, sw * 0.05) });
          const k = clamp(pt / dur()); const s = 0.12 + 0.88 * k * k;
          g.save(); g.globalAlpha = 0.35 + 0.65 * k; g.translate(W / 2, H / 2); g.scale(s, s); g.translate(-W / 2, -H / 2);
          g.drawImage(wallCv, 0, 0, W, H); g.restore();
          text(g, `${Math.max(0, Math.ceil(dur() - pt))}`, W / 2, H * 0.22, { size: 70 * u, color: C.sun });
        } else if (phase === 'after' && result?.pass) {
          const s = 1 + pt * 2; g.save(); g.globalAlpha = Math.max(0, 1 - pt * 1.5); g.translate(W / 2, H / 2); g.scale(s, s); g.translate(-W / 2, -H / 2); g.drawImage(wallCv, 0, 0, W, H); g.restore();
        } else if (api.outlines) drawSkeleton(g, sb, { color: C.mint, lw: 6 });
        for (const b of bricks) { g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = '#D9663F'; g.strokeStyle = C.ink; g.lineWidth = 4; g.fillRect(-b.w / 2, -b.w / 4, b.w, b.w / 2); g.strokeRect(-b.w / 2, -b.w / 4, b.w, b.w / 2); g.restore(); }
        for (let k = 0; k < N; k++) emoji(g, k < i ? '✅' : '🧱', W / 2 - (N - 1) * 26 * u + k * 52 * u, 100 * u, 36 * u, 0, k <= i ? 1 : 0.5);
      },
    };
  },
};
