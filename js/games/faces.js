import { C, clamp, sample, circle, blob, text, emoji, rrect } from '../util.js';
import { drawFaceOutline } from './body.js';

// Derived face features (0..1) from MediaPipe blendshapes
export function features(b) {
  const v = (k) => b?.[k] || 0; const avg = (...ks) => ks.reduce((s, k) => s + v(k), 0) / ks.length;
  return {
    smile: avg('mouthSmileLeft', 'mouthSmileRight'), jaw: v('jawOpen'),
    browUp: Math.max(v('browInnerUp'), avg('browOuterUpLeft', 'browOuterUpRight')), browIn: v('browInnerUp'),
    browDown: avg('browDownLeft', 'browDownRight'), blink: Math.min(v('eyeBlinkLeft'), v('eyeBlinkRight')),
    wink: Math.abs(v('eyeBlinkLeft') - v('eyeBlinkRight')), wide: avg('eyeWideLeft', 'eyeWideRight'),
    pucker: v('mouthPucker'), funnel: v('mouthFunnel'), frown: avg('mouthFrownLeft', 'mouthFrownRight'),
    press: avg('mouthPressLeft', 'mouthPressRight'), puff: v('cheekPuff'), squint: avg('eyeSquintLeft', 'eyeSquintRight'),
    lookUp: avg('eyeLookUpLeft', 'eyeLookUpRight'), browAsym: Math.abs(v('browOuterUpLeft') - v('browOuterUpRight')),
    sneer: avg('noseSneerLeft', 'noseSneerRight'), stretch: avg('mouthStretchLeft', 'mouthStretchRight'),
    upper: avg('mouthUpperUpLeft', 'mouthUpperUpRight'), side: Math.abs(v('mouthLeft') - v('mouthRight')),
  };
}
// want: feature → target level (reaching it = full marks). avoid: feature → level allowed before penalty
const FACES = [
  { e: '😀', name: 'Big grin', want: { smile: 0.75, jaw: 0.2 }, avoid: { pucker: 0.2, blink: 0.4 } },
  { e: '😮', name: 'Shocked', want: { jaw: 0.45, browUp: 0.45, wide: 0.2 }, avoid: { smile: 0.25 } },
  { e: '😉', name: 'Wink', want: { wink: 0.4, smile: 0.35 }, wt: { wink: 2.5 }, avoid: { jaw: 0.3 } },
  { e: '😘', name: 'Kissy face', want: { pucker: 0.65 }, wt: { pucker: 2 }, avoid: { smile: 0.3, jaw: 0.25 } },
  { e: '😠', name: 'Grumpy', want: { browDown: 0.4, press: 0.2 }, wt: { browDown: 2 }, avoid: { smile: 0.2, browUp: 0.3 } },
  { e: '😢', name: 'Sad puppy', want: { frown: 0.25, browIn: 0.4 }, avoid: { smile: 0.2, jaw: 0.3 } },
  { e: '😱', name: 'Scream', want: { jaw: 0.65, browUp: 0.5, wide: 0.25 }, wt: { jaw: 1.5 }, avoid: { smile: 0.3 } },
  { e: '😴', name: 'Sleepy', want: { blink: 0.5 }, wt: { blink: 2 }, avoid: { wink: 0.3, smile: 0.3 } },
  { e: '🤨', name: 'Suspicious', want: { browAsym: 0.22, squint: 0.2 }, wt: { browAsym: 2 }, avoid: { jaw: 0.2, smile: 0.35 } },
  { e: '🐡', name: 'Puffer fish', want: { puff: 0.25 }, wt: { puff: 2 }, avoid: { jaw: 0.15, smile: 0.3 } },
  { e: '🙄', name: 'Eye roll', want: { lookUp: 0.45 }, wt: { lookUp: 2 }, avoid: { smile: 0.3, jaw: 0.3 } },
  { e: '😝', name: 'Silly squint', want: { squint: 0.35, jaw: 0.3, smile: 0.35 } },
  { e: '😬', name: 'Awkward', want: { stretch: 0.3, upper: 0.2 }, wt: { stretch: 2 }, avoid: { jaw: 0.3 } },
  { e: '😤', name: 'Huffy', want: { sneer: 0.25, browDown: 0.3 }, avoid: { smile: 0.25 } },
];
export function matchScore(spec, f) {
  let s = 0, w = 0;
  for (const [k, target] of Object.entries(spec.want)) { const wt = spec.wt?.[k] ?? 1; s += wt * clamp(f[k] / target); w += wt; }
  let pen = 0; for (const [k, allow] of Object.entries(spec.avoid || {})) pen += clamp((f[k] - allow) / 0.4);
  return clamp((s / w) * (1 - Math.min(0.7, pen * 0.35)));
}

const WIN = 5;
export default {
  id: 'faces', name: 'Make That Face', emoji: '😜', kind: 'camera', needs: ['face'],
  tagline: 'Copy the emoji with your face. Get photographed doing it.',
  howTo: ['An emoji appears. Pull the same face as hard as you can.', 'The meter shows how close you are. Your best moment is snapped for the photo wall.', 'Five faces, five seconds each. Hold a great match to skip ahead with a bonus.'],
  crowd: 'Everyone else: judge loudly. Clapping for great faces is mandatory.',
  unit: 'points',
  variety: 'faces',
  create(api) {
    const seq = (api.shared.faces ||= api.deal('faces', FACES, 5));
    let i = 0, pt = 0, best = 0, bestPhoto = null, cur = 0, hold = 0, phase = 'face', lastSnap = 0, flash = 0;
    function next(bonus) {
      const pts = Math.round(best * 100) + (bonus ? 10 : 0);
      api.add(pts, api.W - 180 * api.u, 330 * api.u, bonus ? `+${pts} nailed it!` : `+${pts}`);
      if (bestPhoto) api.keep({ ...bestPhoto, label: `${Math.round(best * 100)}%`, score: best });
      best >= 0.75 ? api.sfx.success() : api.sfx.point();
      phase = 'swap'; pt = 0;
    }
    return {
      update(dt, now) {
        pt += dt; flash = Math.max(0, flash - dt * 3);
        if (phase === 'swap') { if (pt > 0.8) { i++; if (i >= seq.length) { api.end(); return; } phase = 'face'; pt = 0; best = 0; bestPhoto = null; hold = 0; api.sfx.whoosh(); } return; }
        const face = api.vision.face; const spec = seq[i];
        cur = face ? matchScore(spec, features(face.blend)) : 0;
        api.hint(face ? '' : "We can't see your face. Come closer!");
        if (face && cur > best + 0.03 && now - lastSnap > 180) {
          best = cur; lastSnap = now;
          const c = api.pt({ x: (face.box.x0 + face.box.x1) / 2, y: (face.box.y0 + face.box.y1) / 2 }); const sz = api.len(face.box.w) * 1.7;
          bestPhoto = api.snap(c.x, c.y, sz, { emoji: spec.e });
        } else if (cur > best) best = cur;
        hold = cur >= 0.85 ? hold + dt : 0;
        api.timer(1 - pt / WIN);
        if (hold > 0.5) { flash = 1; api.sfx.slice(); next(true); }
        else if (pt >= WIN) next(false);
      },
      draw(g, W, H) {
        const u = api.u; api.camera(g);
        const face = api.vision.face;
        if (api.outlines && api.vision.face) drawFaceOutline(g, api, api.vision.face);
        if (face) {
          const a = api.pt({ x: face.box.x0, y: face.box.y0 }), b = api.pt({ x: face.box.x1, y: face.box.y1 });
          const pad = 30 * u; g.save(); g.setLineDash([16, 12]); g.lineWidth = 6; g.strokeStyle = cur >= 0.85 ? C.mint : C.cream;
          rrect(g, a.x - pad, a.y - pad * 2, b.x - a.x + pad * 2, b.y - a.y + pad * 3, 40 * u); g.stroke(); g.restore();
        }
        if (phase === 'face' || phase === 'swap') {
          const spec = seq[Math.min(i, seq.length - 1)];
          const cx = W - 180 * u, cy = 230 * u, r = 120 * u;
          const pop = phase === 'swap' ? 1 - pt / 0.8 : Math.min(1, pt / 0.25);
          g.save(); g.translate(cx, cy); g.scale(0.6 + pop * 0.4, 0.6 + pop * 0.4);
          circle(g, 6, 8, r, C.ink, { lw: 0 }); circle(g, 0, 0, r, C.cream, { lw: 6 });
          // match ring
          g.beginPath(); g.arc(0, 0, r - 12 * u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cur); g.lineWidth = 16 * u; g.lineCap = 'round'; g.strokeStyle = cur >= 0.85 ? C.mint : cur >= 0.5 ? C.sun : C.pink; g.stroke();
          emoji(g, spec.e, 0, 0, 150 * u, Math.sin(performance.now() / 300) * 0.08);
          g.restore();
          text(g, spec.name, cx, cy + r + 40 * u, { size: 40 * u, color: C.cream });
          text(g, `${Math.round(cur * 100)}%`, cx, cy + r + 90 * u, { size: 50 * u, color: cur >= 0.85 ? C.mint : C.sun });
          for (let k = 0; k < seq.length; k++) emoji(g, k < i ? '✅' : seq[k].e, W / 2 - (seq.length - 1) * 28 * u + k * 56 * u, 100 * u, 40 * u, 0, k <= i ? 1 : 0.5);
        }
        if (flash > 0) { g.fillStyle = `rgba(255,255,255,${flash * 0.7})`; g.fillRect(0, 0, W, H); }
      },
    };
  },
};
