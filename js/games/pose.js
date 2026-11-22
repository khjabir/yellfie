import { C, clamp, sample, blob, text, emoji, rrect } from '../util.js';
import { POSES, YMCA, screenBody, poseMatch, ghostJoints, drawGhost, drawSkeleton, drawPoseIcon, noBodyHint } from './body.js';

const WIN = 6;
export default {
  id: 'pose', name: 'Strike a Pose', emoji: '💃', kind: 'camera', needs: ['pose'],
  tagline: 'Match the glowing pose before time runs out.',
  howTo: ['A yellow outline of arms appears on top of you. Move your arms to match it.', 'Hold the match for half a second to strike it. Faster means more points.', 'Five poses. Sometimes it is a YMCA medley, so be ready.'],
  crowd: 'Everyone else: do the pose too. Peer pressure works.',
  ready: 'Step back until your head and both arms are on screen.',
  unit: 'points',
  variety: 'poses',
  create(api) {
    const seq = (api.shared.poses ||= Math.random() < 0.3 ? [...YMCA, api.deal('poses', POSES.slice(4), 1)[0]] : api.deal('poses', POSES, 5));
    let i = 0, pt = 0, best = 0, bestPhoto = null, cur = 0, hold = 0, phase = 'pose', flash = 0, sb = null;
    function finish(hit) {
      const pts = hit ? Math.round(best * 100) + Math.round(25 * (1 - pt / WIN)) : Math.round(best * 70);
      api.add(pts, api.W / 2, api.H * 0.3, hit ? `STRIKE! +${pts}` : `+${pts}`, hit ? C.mint : C.sun);
      if (hit) { flash = 1; api.sfx.slice(); api.sfx.success(); api.fx.burst(api.W / 2, api.H * 0.4, { n: 30, emojis: ['✨', '⭐', '💥'] }); }
      else api.sfx.point();
      if (bestPhoto) api.keep({ ...bestPhoto, label: seq[i].name, score: best });
      phase = 'swap'; pt = 0;
    }
    function photo() { if (!sb) return null; return api.snap(sb.mid.x, sb.mid.y + sb.sw * 0.3, sb.sw * 4.2, { emoji: seq[i].e }); }
    return {
      idle() { sb = screenBody(api); },
      update(dt, now) {
        pt += dt; flash = Math.max(0, flash - dt * 2.5); sb = screenBody(api);
        if (phase === 'swap') { if (pt > 0.9) { i++; if (i >= seq.length) { api.end(); return; } phase = 'pose'; pt = 0; best = 0; hold = 0; bestPhoto = null; api.sfx.whoosh(); if (seq[i].id.length === 1) api.say(seq[i].name); } return; }
        noBodyHint(api, sb);
        cur = poseMatch(sb, seq[i].a);
        if (cur > best + 0.04) { best = cur; bestPhoto = photo() || bestPhoto; } else best = Math.max(best, cur);
        hold = cur >= 0.8 ? hold + dt : 0;
        api.timer(1 - pt / WIN);
        if (hold >= 0.45) { bestPhoto = photo() || bestPhoto; finish(true); } else if (pt >= WIN) finish(false);
      },
      draw(g, W, H) {
        const u = api.u; api.camera(g);
        g.fillStyle = 'rgba(42,14,92,.25)'; g.fillRect(0, 0, W, H);
        const p = seq[Math.min(i, seq.length - 1)];
        if (sb && phase === 'pose') {
          const gh = ghostJoints(sb.L.s, sb.R.s, p.a, sb.sw);
          drawGhost(g, gh, { color: cur >= 0.8 ? C.mint : C.sun, lw: Math.max(10, sb.sw * 0.14) });
          if (api.outlines) drawSkeleton(g, sb, { color: C.pink, lw: Math.max(5, sb.sw * 0.05) });
        }
        // pose card
        const cw = 240 * u, cx = W - cw - 24 * u, cy = 110 * u;
        blob(g, cx, cy, cw, 300 * u, 28 * u, C.cream, { lw: 5, shadow: 8 });
        g.save(); rrect(g, cx, cy, cw, 230 * u, 28 * u); g.clip(); drawPoseIcon(g, p.a, cx + cw / 2, cy + 112 * u, 96 * u); g.restore();
        emoji(g, p.e, cx + cw - 34 * u, cy + 34 * u, 40 * u);
        text(g, p.name, cx + cw / 2, cy + 250 * u, { size: (p.name.length > 12 ? 24 : 34) * u, color: C.ink, stroke: null, maxWidth: cw - 20 * u });
        const mw = cw - 40 * u; blob(g, cx + 20 * u, cy + 318 * u, mw, 26 * u, 13 * u, C.cream, { lw: 4 }); blob(g, cx + 20 * u, cy + 318 * u, Math.max(26 * u, mw * cur), 26 * u, 13 * u, cur >= 0.8 ? C.mint : C.pink, { lw: 4 });
        text(g, `${Math.round(cur * 100)}%`, cx + cw / 2, cy + 380 * u, { size: 44 * u, color: cur >= 0.8 ? C.mint : C.sun });
        if (seq.length === 5 && seq[0].id === 'y' && seq[3].id === 'a') text(g, 'YMCA medley!', cx + cw / 2, cy - 30 * u, { size: 30 * u, color: C.pink });
        for (let k = 0; k < seq.length; k++) emoji(g, k < i ? '✅' : seq[k].e, W / 2 - (seq.length - 1) * 28 * u + k * 56 * u, 100 * u, 40 * u, 0, k <= i ? 1 : 0.5);
        if (flash > 0) { g.fillStyle = `rgba(255,255,255,${flash * 0.75})`; g.fillRect(0, 0, W, H); }
      },
    };
  },
};
