import { C, pick, blob, text, emoji } from '../util.js';
import { handScreen, drawHand, rpsGesture } from './body.js';

const ROUNDS = 5, COUNT = 1.8, WINDOW = 0.9, SHOW = 1.9;
const ICON = { rock: '✊', paper: '✋', scissors: '✌️' }, BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const WORDS = ['Rock…', 'Paper…', 'Scissors…'];

export default {
  id: 'rps', name: 'Rock Paper Scissors', emoji: '✌️', kind: 'camera', needs: ['hands'],
  tagline: 'Beat the robot at the oldest game there is.',
  howTo: ['Hold one hand up to the camera.', 'On "SHOOT!" show a fist for rock, a flat hand for paper, or two fingers for scissors.', 'Five rounds: 3 points for a win, 1 for a draw.'],
  crowd: 'Everyone else: chant along. "Rock… Paper… Scissors… SHOOT!"',
  ready: 'Hold one hand up, palm facing the camera, about an arm\'s length back.',
  unit: 'points',
  quip(s) { return s >= 13 ? 'The robot wants a rematch. And a hug.' : s >= 8 ? 'Humans 1, robots 0.' : s >= 4 ? 'An honourable draw with the machines.' : 'The robot uprising starts here.'; },
  create(api) {
    let i = 0, phase = 'count', pt = 0, beat = -1, votes = [], you = null, bot = null, result = '', live = null;
    function biggest() { // the hand nearest the camera
      let best = null, size = 0;
      for (const h of api.vision.hands || []) { const P = handScreen(api, h), s = Math.hypot(P[0].x - P[9].x, P[0].y - P[9].y); if (s > size) { size = s; best = P; } }
      return best;
    }
    function judge() {
      const recent = votes.filter((v) => v.t > WINDOW - 0.6), use = recent.length ? recent : votes;
      const tally = {}; for (const v of use) tally[v.g] = (tally[v.g] || 0) + 1;
      you = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0] || null; bot = pick(['rock', 'paper', 'scissors']);
      if (!you) { result = 'No hand seen'; api.sfx.wrong(); }
      else if (you === bot) { result = 'Draw!'; api.add(1, api.W / 2, api.H * 0.3, '+1'); api.sfx.point(); }
      else if (BEATS[you] === bot) { result = 'You win!'; api.add(3, api.W / 2, api.H * 0.3, '+3'); api.sfx.success(); api.fx.burst(api.W * 0.3, api.H * 0.5, { n: 24 }); }
      else { result = 'Robot wins'; api.sfx.fail(); api.fx.shake(8); }
      phase = 'show'; pt = 0;
    }
    return {
      peek: () => ({ phase, you, bot, result, live: live?.g, i }), // for automated tests
      idle() { const P = biggest(); live = P ? { P, g: rpsGesture(P) } : null; },
      update(dt) {
        pt += dt; const P = biggest(); live = P ? { P, g: rpsGesture(P) } : null;
        api.hint(live || phase === 'show' ? '' : 'Hold a hand up so the camera can see it');
        if (phase === 'count') {
          const b = Math.min(2, Math.floor(pt / (COUNT / 3))); if (b !== beat) { beat = b; api.sfx.beep(); }
          if (pt >= COUNT) { phase = 'shoot'; pt = 0; votes = []; api.sfx.go(); }
        } else if (phase === 'shoot') {
          if (live) votes.push({ g: live.g, t: pt });
          api.timer(1 - pt / WINDOW);
          if (pt >= WINDOW) { api.timer(null); judge(); }
        } else if (pt >= SHOW) { i++; if (i >= ROUNDS) { api.end(); return; } phase = 'count'; pt = 0; beat = -1; you = bot = null; }
      },
      draw(g, W, H) {
        const u = api.u; api.camera(g); g.fillStyle = 'rgba(42,14,92,.35)'; g.fillRect(0, 0, W, H);
        if (live && api.outlines) drawHand(g, live.P, { color: C.mint, lw: Math.max(4, 5 * u), tip: false });
        const top = Math.max(104 * u, 90), mid = H * 0.52;
        // you (left) and the robot (right)
        const card = (cx, label, icon, tint) => {
          const cw = Math.min(250 * u, W * 0.36), ch = 280 * u;
          blob(g, cx - cw / 2, mid - ch / 2, cw, ch, 30 * u, tint, { lw: 6, shadow: 8 });
          text(g, label, cx, mid - ch / 2 + 36 * u, { size: 30 * u, color: C.ink, stroke: null });
          emoji(g, icon, cx, mid + 16 * u, 150 * u, phase === 'count' ? Math.sin(pt * (Math.PI * 2) / (COUNT / 3)) * 0.25 : 0);
        };
        const mine = phase === 'show' ? (you ? ICON[you] : '❓') : live ? ICON[live.g] : '🖐️';
        card(W * 0.27, 'You', mine, phase === 'show' && result === 'You win!' ? C.mint : C.cream);
        card(W * 0.73, 'Robot', phase === 'show' ? ICON[bot] : phase === 'count' ? '✊' : '🤖', phase === 'show' && result === 'Robot wins' ? C.pink : C.cream);
        emoji(g, '🤖', W * 0.73, mid - 190 * u, 70 * u);
        const big = phase === 'count' ? WORDS[Math.max(0, beat)] : phase === 'shoot' ? 'SHOOT!' : result;
        text(g, big, W / 2, top + 30 * u, { size: (phase === 'shoot' ? 96 : 68) * u, color: phase === 'shoot' ? C.sun : phase === 'show' ? (result === 'You win!' ? C.mint : result === 'Robot wins' ? C.pink : C.cream) : C.cream });
        text(g, 'vs', W / 2, mid, { size: 50 * u, color: C.sun });
        for (let k = 0; k < ROUNDS; k++) emoji(g, k < i ? '✅' : k === i ? '✌️' : '⚪', W / 2 - (ROUNDS - 1) * 22 * u + k * 44 * u, H - 44 * u, 30 * u);
      },
    };
  },
};
