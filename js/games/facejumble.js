import { C, clamp, rand, circle, text, emoji } from '../util.js';
import { makePinch, drawPinch } from './body.js';

// Part positions are in head units: (0,0) is the middle of the face and 1 is half the head's height.
const eyes = (ch = '👁️', s = 0.36) => [{ ch, x: -0.3, y: -0.18, s, pair: 'eye' }, { ch, x: 0.3, y: -0.18, s, pair: 'eye' }];
const ears = () => [{ ch: '👂', x: -0.88, y: 0, s: 0.4, flip: true, pair: 'ear' }, { ch: '👂', x: 0.88, y: 0, s: 0.4, pair: 'ear' }];
const THEMES = [
  { id: 'classic', name: 'Everyday face', skin: '#FFD9A8', parts: [...eyes(), { ch: '👃', x: 0, y: 0.14, s: 0.4 }, { ch: '👄', x: 0, y: 0.56, s: 0.46 }, ...ears()] },
  { id: 'snowman', name: 'Snowman', skin: '#FFFFFF', parts: [...eyes('⚫', 0.2), { ch: '🥕', x: 0.04, y: 0.12, s: 0.44 }, { ch: '👄', x: 0, y: 0.56, s: 0.4 }, { ch: '🎩', x: 0, y: -1.12, s: 0.95 }, { ch: '🧣', x: 0, y: 1.1, s: 0.85 }] },
  { id: 'clown', name: 'Clown', skin: '#FFF1E0', parts: [...eyes(), { ch: '🔴', x: 0, y: 0.12, s: 0.36 }, { ch: '👄', x: 0, y: 0.56, s: 0.5 }, { ch: '🎩', x: 0, y: -1.12, s: 0.9 }, { ch: '🎀', x: 0, y: 1.12, s: 0.6 }] },
  { id: 'cool', name: 'Cool dude', skin: '#E8B88A', parts: [{ ch: '🕶️', x: 0, y: -0.18, s: 0.95 }, { ch: '👃', x: 0, y: 0.16, s: 0.4 }, { ch: '👄', x: 0, y: 0.58, s: 0.46 }, { ch: '🧢', x: 0, y: -0.98, s: 0.95 }, ...ears()] },
  { id: 'royal', name: 'Royal highness', skin: '#F6C9A0', parts: [...eyes(), { ch: '👃', x: 0, y: 0.14, s: 0.4 }, { ch: '👄', x: 0, y: 0.56, s: 0.46 }, { ch: '👑', x: 0, y: -1.08, s: 0.9 }, { ch: '📿', x: 0, y: 1.14, s: 0.7 }] },
];
const DUR = 45, PEEK = 4;

export default {
  id: 'facejumble', name: 'Face Jumble', emoji: '😶', kind: 'camera', needs: ['hands'],
  tagline: 'Catch the floating eyes, nose and lips and build the face.',
  howTo: ['A blank face appears, with its parts floating around in bubbles.', 'Pinch your thumb and index finger to catch a part, drag it onto the face, and let go to drop it.', 'You get a quick peek at where everything belongs. The most accurate face wins.'],
  crowd: 'Everyone else: shout directions. "Left! No, YOUR left!"',
  ready: 'Hold a hand up where the camera can see it, about an arm\'s length back.',
  unit: 'accurate', format: (s) => `${s.toFixed(1)}%`, secretScore: true,
  variety: 'faces',
  options: [{ key: 'guides', label: 'Guide marks', default: 'peek', choices: [['peek', 'Quick peek'], ['on', 'Always on'], ['off', 'None']] }],
  quip(s) { return s >= 92 ? 'A masterpiece. Hang it in a gallery.' : s >= 75 ? 'Handsome! Nearly human.' : s >= 50 ? 'Abstract art. Very brave.' : s > 0 ? 'Picasso called. He is confused.' : 'A blank stare. Literally.'; },
  create(api) {
    const theme = (api.shared.theme ||= api.deal('themes', THEMES, 1)[0]);
    const guides = api.option('guides');
    const pinch = makePinch(api);
    const geo = () => { const R = Math.min(api.W * 0.34, api.H * 0.23); return { R, cx: api.W / 2, cy: api.H * 0.53 }; };
    let t = 0, phase = 'build', lockT = 0, revealT = 0, total = 0;
    const parts = theme.parts.map((def) => ({ def, x: 0, y: 0, vx: 0, vy: 0, state: 'float', by: null, ph: rand(6), pts: 0, target: null }));

    const target = (def) => { const { R, cx, cy } = geo(); return { x: cx + def.x * R, y: cy + def.y * R }; };
    const sizeOf = (p) => p.def.s * geo().R * 1.15;
    const onFace = (p) => { const { R, cx, cy } = geo(); return ((p.x - cx) / R) ** 2 + ((p.y - cy) / (R * 1.75)) ** 2 < 1; };
    function drift(p) { const a = rand(Math.PI * 2), v = rand(55, 95) * api.u; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; }
    function scatter() {
      const { R, cx, cy } = geo(); const m = 50 * api.u;
      for (const p of parts) {
        for (let k = 0; k < 40; k++) { p.x = rand(m, api.W - m); p.y = rand(130 * api.u, api.H - m); if (((p.x - cx) / (R * 1.3)) ** 2 + ((p.y - cy) / (R * 1.9)) ** 2 > 1) break; }
        drift(p);
      }
    }
    scatter();

    function judge() {
      const { R } = geo();
      for (const p of parts) p.target = target(p.def);
      // twins (two eyes, two ears) may swap places
      const far = (p, tg) => (p.state === 'placed' ? Math.hypot(p.x - tg.x, p.y - tg.y) / R : 9);
      for (const key of ['eye', 'ear']) {
        const [a, b] = parts.filter((p) => p.def.pair === key); if (!b) continue;
        if (far(a, b.target) + far(b, a.target) < far(a, a.target) + far(b, b.target)) [a.target, b.target] = [b.target, a.target];
      }
      for (const p of parts) p.pts = p.state === 'placed' ? clamp(1 - (far(p, p.target) - 0.06) / 0.6) : 0;
      return Math.round((parts.reduce((s, p) => s + p.pts, 0) / parts.length) * 1000) / 10;
    }
    function reveal() {
      for (const p of parts) if (p.state === 'held') { p.state = onFace(p) ? 'placed' : 'float'; p.by = null; }
      total = judge(); phase = 'reveal'; revealT = 0; api.hint(''); api.timer(null);
      const { R, cx, cy } = geo();
      api.keep(api.snap(cx, cy, R * 3.3, { emoji: '😶', label: `${Math.round(total)}%`, score: total }));
      api.setScore(total); total >= 75 ? api.sfx.success() : total >= 40 ? api.sfx.point() : api.sfx.boing();
      api.banner(total >= 92 ? 'Masterpiece!' : total >= 75 ? 'Looking good!' : total >= 50 ? 'Abstract art!' : 'Yikes!', { color: total >= 75 ? C.mint : C.sun, y: api.H * 0.2, size: 80 * api.u });
    }

    return {
      idle(dt, now) { pinch.update(now); for (const p of parts) float(p, dt); },
      update(dt, now) {
        const curs = pinch.update(now);
        if (phase === 'reveal') { revealT += dt; if (revealT > 3.6) api.end(total); return; }
        t += dt; const u = api.u;
        for (const c of curs) {
          if (c.down && !parts.some((p) => p.by === c)) {
            let best = null, bd = 1e9;
            for (const p of parts) { const d = Math.hypot(p.x - c.x, p.y - c.y); if (p.state !== 'held' && d < Math.max(sizeOf(p) * 0.8, 70 * u) && d < bd) { bd = d; best = p; } }
            if (best) { best.state = 'held'; best.by = c; parts.push(parts.splice(parts.indexOf(best), 1)[0]); api.sfx.tick(); }
          }
        }
        for (const p of parts) {
          if (p.state === 'held') {
            if (p.by.pinch && !p.by.dead) { p.x = p.by.x; p.y = p.by.y; }
            else { p.by = null; if (onFace(p)) { p.state = 'placed'; api.sfx.pop(); api.fx.ring(p.x, p.y, { r1: sizeOf(p), color: C.cream }); } else { p.state = 'float'; drift(p); } }
          } else if (p.state === 'float') float(p, dt);
        }
        const allPlaced = parts.every((p) => p.state === 'placed');
        lockT = allPlaced ? lockT + dt : 0;
        api.timer(1 - t / DUR);
        api.hint(!curs.length ? 'Hold up a hand so the camera can see it'
          : allPlaced ? `Happy with it? Locking in ${Math.max(0, 3 - lockT).toFixed(0)}… (pinch a part to move it)`
            : guides === 'peek' && t < PEEK ? `Build the ${theme.name.toLowerCase()}. Remember where everything goes!` : t < 10 ? 'Pinch a part to catch it, then drop it on the face' : '');
        if (lockT > 3 || t >= DUR) reveal();
      },
      draw(g, W, H) {
        const u = api.u, { R, cx, cy } = geo();
        api.camera(g); g.fillStyle = 'rgba(42,14,92,.45)'; g.fillRect(0, 0, W, H);
        head(g, theme, cx, cy, R);
        const showGuides = phase === 'reveal' || guides === 'on' || (guides === 'peek' && t < PEEK);
        if (showGuides) {
          const a = phase === 'reveal' || guides === 'on' ? 1 : clamp((PEEK - t) / 0.6);
          g.save(); g.globalAlpha = a; g.setLineDash([7, 6]); g.lineWidth = 3; g.strokeStyle = C.ink;
          for (const p of parts) { const tg = phase === 'reveal' ? p.target : target(p.def); g.beginPath(); g.arc(tg.x, tg.y, sizeOf(p) * 0.5, 0, Math.PI * 2); g.stroke(); if (phase !== 'reveal') part(g, p, tg.x, tg.y, sizeOf(p), 0, 0.3 * a); }
          g.restore();
        }
        for (const p of parts) {
          const s = sizeOf(p);
          if (p.state === 'float') {
            const wob = Math.sin(performance.now() / 300 + p.ph);
            circle(g, p.x, p.y, s * 0.72, 'rgba(255,255,255,.18)', { lw: 3, stroke: 'rgba(255,255,255,.75)' });
            circle(g, p.x - s * 0.32, p.y - s * 0.36, s * 0.09, 'rgba(255,255,255,.8)', { lw: 0 });
            part(g, p, p.x, p.y, s, wob * 0.25);
          } else part(g, p, p.x, p.y, s * (p.state === 'held' ? 1.15 : 1));
        }
        if (phase === 'reveal') {
          for (const p of parts) {
            if (p.state !== 'placed') continue;
            g.strokeStyle = p.pts >= 0.7 ? C.mint : p.pts >= 0.35 ? C.sun : C.red; g.lineWidth = 5; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.target.x, p.target.y); g.stroke();
            if (revealT > 0.5) text(g, `${Math.round(p.pts * 100)}`, p.x + sizeOf(p) * 0.5, p.y - sizeOf(p) * 0.45, { size: 24 * u, color: g.strokeStyle });
          }
          if (revealT > 0.9) text(g, `${total.toFixed(1)}% accurate`, W / 2, H - 70 * u, { size: 60 * u, color: C.sun });
        }
        for (const c of pinch.list) drawPinch(g, api, c);
      },
      peek: () => ({ phase, parts: parts.map((p) => { const tg = target(p.def); return { x: p.x, y: p.y, state: p.state, tx: tg.x, ty: tg.y }; }) }), // for automated tests
    };

    function float(p, dt) {
      if (p.state !== 'float') return;
      const m = Math.max(40 * api.u, sizeOf(p) * 0.75); p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < m) { p.x = m; p.vx = Math.abs(p.vx); } else if (p.x > api.W - m) { p.x = api.W - m; p.vx = -Math.abs(p.vx); }
      const top = Math.max(120 * api.u, 90) + m * 0.5;
      if (p.y < top) { p.y = top; p.vy = Math.abs(p.vy); } else if (p.y > api.H - m) { p.y = api.H - m; p.vy = -Math.abs(p.vy); }
    }
  },
};

function part(g, p, x, y, size, rot = 0, alpha = 1) {
  if (!p.def.flip) { emoji(g, p.def.ch, x, y, size, rot, alpha); return; }
  g.save(); g.translate(x, y); g.scale(-1, 1); emoji(g, p.def.ch, 0, 0, size, rot, alpha); g.restore();
}

function head(g, th, cx, cy, R) {
  const rx = R * 0.8, oval = (x, y, a, b) => { g.beginPath(); g.ellipse(x, y, a, b, 0, 0, Math.PI * 2); };
  if (th.id === 'clown') for (const s of [-1, 1]) for (const [dx, dy, r] of [[0.85, -0.45, 0.3], [0.98, -0.12, 0.26], [0.78, -0.74, 0.24]]) circle(g, cx + s * dx * R, cy + dy * R, r * R, C.orange, { lw: 5 });
  if (th.id === 'royal') { oval(cx, cy + R * 0.12, rx * 1.24, R * 1.12); g.fillStyle = '#5B3A1E'; g.fill(); g.lineWidth = 5; g.strokeStyle = C.ink; g.stroke(); }
  oval(cx + 7, cy + 9, rx, R); g.fillStyle = C.ink; g.fill();
  oval(cx, cy, rx, R); g.fillStyle = th.skin; g.fill();
  if (th.id === 'classic') { g.save(); oval(cx, cy, rx, R); g.clip(); oval(cx, cy - R * 1.02, rx * 1.15, R * 0.44); g.fillStyle = '#6B3F1D'; g.fill(); g.restore(); }
  oval(cx, cy, rx, R); g.lineWidth = 6; g.strokeStyle = C.ink; g.stroke();
  g.fillStyle = 'rgba(255,46,136,.2)'; for (const s of [-1, 1]) { oval(cx + s * rx * 0.58, cy + R * 0.32, R * 0.14, R * 0.085); g.fill(); }
}
