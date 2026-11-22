import { C, clamp, pick, shuffle, median, dist, blob, text, emoji } from '../util.js';
import { screenBody, drawSkeleton, noBodyHint, handScreen, drawHand } from './body.js';

// detectors work in screen pixels; y grows downward. "left" = left side of the screen (the player's left in a mirror)
export const ACTIONS = {
  up: { label: 'Hands up!', e: '🙌', ok: (b) => b.L.w.y < b.nose.y - 0.3 * b.sw && b.R.w.y < b.nose.y - 0.3 * b.sw },
  left: { label: 'Raise your left hand', e: '✋', ok: (b) => b.L.w.y < b.nose.y - 0.15 * b.sw && b.R.w.y > b.R.s.y },
  right: { label: 'Raise your right hand', e: '🤚', ok: (b) => b.R.w.y < b.nose.y - 0.15 * b.sw && b.L.w.y > b.L.s.y },
  wide: { label: 'Arms out wide!', e: '✈️', ok: (b) => b.L.w.x < b.L.s.x - 1.0 * b.sw && b.R.w.x > b.R.s.x + 1.0 * b.sw && Math.abs(b.L.w.y - b.L.s.y) < 0.8 * b.sw && Math.abs(b.R.w.y - b.R.s.y) < 0.8 * b.sw },
  // fingertips come from the hand tracker; the body tracker's rough hand point is only a fallback
  nose: { label: 'Touch your nose', e: '👃', ok: (b) => b.hands.some((P) => Math.min(dist(P[8], b.nose), dist(P[12], b.nose), dist(P[4], b.nose)) < 0.42 * b.sw) || (!b.hands.length && Math.min(dist(b.L.i, b.nose), dist(b.R.i, b.nose)) < 0.4 * b.sw) },
  head: { label: 'Hands on your head', e: '🙆', ok: (b) => [b.L, b.R].every((a) => a.w.y < b.nose.y + 0.05 * b.sw && a.w.y > b.nose.y - 1.3 * b.sw && Math.abs(a.w.x - b.nose.x) < 1.0 * b.sw) && b.L.e.y < b.L.s.y + 0.2 * b.sw && b.R.e.y < b.R.s.y + 0.2 * b.sw },
  eyes: { label: 'Cover your eyes', e: '🙈', ok: (b) => (b.hands.length >= 2 && b.hands.every((P) => Math.min(dist(P[9], b.eyeL), dist(P[9], b.eyeR)) < 0.6 * b.sw)) || [b.L, b.R].every((a) => Math.min(dist(a.i, b.nose), dist(a.w, b.nose)) < 0.6 * b.sw && a.w.y < b.L.s.y) },
  wings: { label: 'Chicken wings!', e: '🐔', ok: (b) => dist(b.L.w, b.L.s) < 0.8 * b.sw && dist(b.R.w, b.R.s) < 0.8 * b.sw && b.L.e.x < b.L.s.x - 0.3 * b.sw && b.R.e.x > b.R.s.x + 0.3 * b.sw },
  crouch: { label: 'Crouch down!', e: '🧎', ok: (b, base) => b.nose.y > base.y + 0.9 * base.sw },
  leanL: { label: 'Lean to your left', e: '↖️', ok: (b, base) => b.nose.x < base.x - 0.8 * base.sw },
  leanR: { label: 'Lean to your right', e: '↗️', ok: (b, base) => b.nose.x > base.x + 0.8 * base.sw },
};
const N = 10;

export default {
  id: 'simon', name: 'Simon Says', emoji: '🧙', kind: 'camera', needs: ['pose', 'hands'],
  tagline: 'Only move when Simon says so.',
  howTo: ['Simon gives orders out loud: "Simon says, hands up!"', 'Do it fast for bonus points.', 'If Simon did NOT say "Simon says", stay still. Getting tricked costs points.'],
  crowd: 'Everyone else: play along at home. Point and laugh at anyone who gets tricked.',
  ready: 'Step back until your head and both arms are on screen. Arms down to start.',
  unit: 'points',
  variety: 'commands',
  create(api) {
    const cmds = (api.shared.cmds ||= (() => {
      const keys = api.deal('actions', Object.keys(ACTIONS), N); const out = [];
      for (let k = 0; k < N; k++) out.push({ act: keys[k % keys.length], simon: true });
      shuffle([...Array(N).keys()].slice(1)).slice(0, 3).forEach((k) => (out[k].simon = false));
      return out;
    })());
    let i = 0, phase = 'calib', pt = 0, held = 0, base = null, samples = [], sb = null, verdict = null;
    const win = () => Math.max(2.0, 3.3 - i * 0.12);
    function armsDown(b) { return b && b.L.w.y > b.L.s.y + 0.2 * b.sw && b.R.w.y > b.R.s.y + 0.2 * b.sw; }
    function announce() {
      const c = cmds[i], a = ACTIONS[c.act];
      api.say(c.simon ? `Simon says, ${a.label}` : a.label, { rate: 1.15 });
    }
    function judge(didIt) {
      const c = cmds[i];
      if (c.simon && didIt) { const pts = 10 + Math.round(5 * clamp(1 - pt / win())); api.add(pts, api.W / 2, api.H * 0.3, `+${pts}`, C.mint); api.sfx.point(); verdict = { ok: true, msg: pick(['Yes!', 'Nice!', 'Sharp!']) }; }
      else if (c.simon) { verdict = { ok: false, msg: 'Too slow!' }; api.sfx.wrong(); }
      else if (didIt) { api.add(-5, api.W / 2, api.H * 0.3, '-5', C.red); api.sfx.wrong(); api.fx.shake(10); verdict = { ok: false, msg: "Simon didn't say!" }; }
      else { api.add(5, api.W / 2, api.H * 0.3, '+5 not fooled', C.mint); api.sfx.success(); verdict = { ok: true, msg: 'Not fooled!' }; }
      phase = 'verdict'; pt = 0;
    }
    return {
      idle() { sb = screenBody(api); if (sb && armsDown(sb)) { samples.push({ x: sb.nose.x, y: sb.nose.y, sw: sb.sw }); if (samples.length > 60) samples.shift(); } },
      update(dt) {
        pt += dt; sb = screenBody(api); if (sb) sb.hands = (api.vision.hands || []).map((h) => handScreen(api, h));
        if (phase === 'calib') {
          api.hint('Stand still, arms down…');
          if (sb && armsDown(sb)) samples.push({ x: sb.nose.x, y: sb.nose.y, sw: sb.sw });
          if (pt > 1.4) { base = samples.length ? { x: median(samples.map((s) => s.x)), y: median(samples.map((s) => s.y)), sw: median(samples.map((s) => s.sw)) } : { x: api.W / 2, y: api.H * 0.35, sw: api.W * 0.15 }; phase = 'reset'; pt = 0; }
          return;
        }
        if (phase === 'reset') {
          api.hint('Arms down, stand in the middle'); api.timer(null);
          const ready = sb && armsDown(sb) && Math.abs(sb.nose.x - base.x) < 0.5 * base.sw && sb.nose.y < base.y + 0.5 * base.sw;
          if ((ready && pt > 0.5) || pt > 2.2) { phase = 'cmd'; pt = 0; held = 0; api.hint(''); announce(); }
          return;
        }
        if (phase === 'cmd') {
          noBodyHint(api, sb);
          const c = cmds[i]; const did = sb && sb.nose && ACTIONS[c.act].ok(sb, base);
          held = did ? held + dt : 0;
          api.timer(1 - pt / win());
          // give speech a moment before judging tricks
          if (held > 0.2 && pt > 0.4) judge(true); else if (pt >= win()) judge(false);
          return;
        }
        if (phase === 'verdict') { api.timer(null); if (pt > 1.0) { i++; verdict = null; if (i >= N) { api.end(); return; } phase = 'reset'; pt = 0; } }
      },
      draw(g, W, H) {
        const u = api.u; api.camera(g); g.fillStyle = 'rgba(42,14,92,.2)'; g.fillRect(0, 0, W, H);
        if (api.outlines) { drawSkeleton(g, sb, { color: C.mint, lw: sb ? Math.max(5, sb.sw * 0.05) : 6 }); for (const h of api.vision.hands || []) drawHand(g, handScreen(api, h), { color: C.sun, lw: 4 }); }
        // Simon + speech bubble
        const c = cmds[Math.min(i, N - 1)];
        emoji(g, '🧙', 90 * u, H - 110 * u, 150 * u, Math.sin(performance.now() / 400) * 0.08);
        if (phase === 'cmd' || phase === 'verdict') {
          const msg = c.simon ? `Simon says: ${ACTIONS[c.act].label}` : `${ACTIONS[c.act].label}`;
          const bw = Math.min(W - 220 * u, 760 * u), bx = 170 * u, by = H - 230 * u;
          blob(g, bx, by, bw, 120 * u, 30 * u, C.cream, { lw: 6, shadow: 8 });
          g.fillStyle = C.cream; g.strokeStyle = C.ink; g.lineWidth = 6; g.beginPath(); g.moveTo(bx + 4, by + 80 * u); g.lineTo(bx - 34 * u, by + 120 * u); g.lineTo(bx + 4, by + 104 * u); g.fill(); g.stroke();
          emoji(g, ACTIONS[c.act].e, bx + 60 * u, by + 60 * u, 64 * u);
          text(g, msg, bx + 110 * u, by + 60 * u, { size: 40 * u, color: C.ink, stroke: null, align: 'left', maxWidth: bw - 130 * u });
        }
        if (verdict) text(g, verdict.msg, W / 2, H * 0.42, { size: 90 * u, color: verdict.ok ? C.mint : C.red });
        text(g, `${Math.min(i + 1, N)} / ${N}`, W / 2, H * 0.12, { size: 44 * u, color: C.cream });
      },
    };
  },
};
