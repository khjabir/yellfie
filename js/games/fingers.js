import { C, randi, pick, blob, text, emoji } from '../util.js';
import { handScreen, drawHand, fingerCount } from './body.js';

const DUR = 45, HOLD = 0.45;
// sums whose answer is 1–10, so it can always be shown on two hands
function makeSum(avoid) {
  for (;;) {
    const kind = pick(['+', '+', '−', '−', '×', '÷']); let a, b, ans;
    if (kind === '+') { ans = randi(2, 10); a = randi(1, ans - 1); b = ans - a; }
    else if (kind === '−') { ans = randi(1, 9); b = randi(1, 9); a = ans + b; }
    else if (kind === '×') { a = randi(1, 5); b = randi(1, Math.floor(10 / a)); ans = a * b; }
    else { ans = randi(1, 5); b = randi(2, 4); a = ans * b; }
    if (ans !== avoid) return { q: `${a} ${kind} ${b}`, ans };
  }
}

export default {
  id: 'fingers', name: 'Finger Maths', emoji: '🖐️', kind: 'camera', needs: ['hands'],
  tagline: 'Answer the sums by holding up fingers.',
  howTo: ['A sum appears, like 3 + 4.', 'Show the answer with your fingers. Use both hands for anything above five.', 'Hold it steady for a moment to lock it in. As many as you can in 45 seconds.'],
  crowd: 'Everyone else: shout wrong answers with total confidence.',
  ready: 'Hold both hands up, palms facing the camera, fingers spread.',
  unit: 'answers',
  variety: 'sums',
  quip(s) { return s >= 16 ? 'A human calculator with ten buttons.' : s >= 10 ? 'Quick fingers, quick brain.' : s >= 5 ? 'The maths was fine. The fingers disagreed.' : 'Counting is hard. We understand.'; },
  create(api) {
    const sums = (api.shared.sums ||= (() => { const a = []; let last = 0; for (let k = 0; k < 40; k++) { const s = makeSum(last); a.push(s); last = s.ans; } return a; })());
    let i = 0, t = 0, shown = 0, hold = 0, okT = 0, hands = [], over = false;
    return {
      peek: () => ({ ans: sums[i % sums.length].ans, shown, i }), // for automated tests
      idle() { hands = (api.vision.hands || []).map((h) => handScreen(api, h)); shown = hands.reduce((s, P) => s + fingerCount(P), 0); },
      update(dt) {
        if (over) return;
        t += dt; okT = Math.max(0, okT - dt);
        hands = (api.vision.hands || []).map((h) => handScreen(api, h)); shown = hands.reduce((s, P) => s + fingerCount(P), 0);
        const sum = sums[i % sums.length];
        hold = hands.length && shown === sum.ans && okT <= 0 ? hold + dt : 0;
        if (hold >= HOLD) { hold = 0; okT = 0.5; i++; api.add(1, api.W / 2, api.H * 0.42, 'Correct!', C.mint); api.sfx.point(); api.fx.burst(api.W / 2, api.H * 0.3, { n: 16 }); }
        api.timer(1 - t / DUR); api.hint(hands.length ? '' : 'Hold your hands up so the camera can see them');
        if (t >= DUR) { over = true; api.hint(''); api.banner("Time's up!", { color: C.sun }); setTimeout(() => api.end(), 900); }
      },
      draw(g, W, H) {
        const u = api.u; api.camera(g); g.fillStyle = 'rgba(42,14,92,.3)'; g.fillRect(0, 0, W, H);
        for (const P of hands) { if (api.outlines) drawHand(g, P, { color: C.mint, lw: Math.max(4, 5 * u), tip: false }); text(g, `${fingerCount(P)}`, P[9].x, P[9].y, { size: 44 * u, color: C.sun }); }
        const sum = sums[i % sums.length], top = Math.max(104 * u, 90), cw = Math.min(460 * u, W * 0.8), right = okT > 0;
        blob(g, W / 2 - cw / 2, top, cw, 130 * u, 30 * u, right ? C.mint : C.cream, { lw: 6, shadow: 8 });
        text(g, right ? '✓' : `${sum.q} = ?`, W / 2, top + 68 * u, { size: 76 * u, color: C.ink, stroke: null });
        // what the camera thinks you are showing, with a ring that fills while you hold the right answer
        const cx = W / 2, cy = H - 150 * u, r = 62 * u;
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = 'rgba(26,16,51,.75)'; g.fill(); g.lineWidth = 6; g.strokeStyle = C.cream; g.stroke();
        if (hold > 0) { g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (hold / HOLD)); g.lineWidth = 10 * u; g.strokeStyle = C.mint; g.stroke(); }
        text(g, hands.length ? `${shown}` : '–', cx, cy + 2 * u, { size: 70 * u, color: C.sun });
        text(g, 'you show', cx, cy - r - 20 * u, { size: 22 * u, color: C.cream });
        emoji(g, '🖐️', cx - r - 44 * u, cy, 50 * u); emoji(g, '🖐️', cx + r + 44 * u, cy, 50 * u);
      },
    };
  },
};
