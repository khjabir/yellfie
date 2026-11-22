import { C, clamp, pick, circle, blob, text, emoji } from '../util.js';

const STEP = 0.27; // seconds per eighth note
const TIERS = [
  [[0, 2, 4], [0, 1, 2], [0, 2, 3]],
  [[0, 2, 4, 5], [0, 1, 2, 4], [0, 2, 3, 4], [0, 3, 4, 6]],
  [[0, 1, 2, 4, 6], [0, 2, 3, 5, 6], [0, 1, 3, 4, 6], [0, 3, 4, 6, 7]],
  [[0, 1, 2, 3, 5, 7], [0, 2, 3, 4, 6, 7], [0, 1, 3, 5, 6, 7], [0, 1, 2, 4, 5, 7]],
];

export default {
  id: 'clap', name: 'Clap Back', emoji: '👏', kind: 'voice', needs: ['mic'],
  tagline: 'Listen to the beat, then clap it straight back.',
  howTo: ['Watch and listen while the game claps a rhythm.', 'When it says "Your turn", clap the same rhythm. Your first clap starts the clock.', 'Four rounds, each one trickier. Extra claps cost points.'],
  crowd: 'Everyone else: hands in pockets, or you will clap for them.',
  unit: 'points',
  variety: 'rhythms',
  create(api) {
    const pats = (api.shared.patterns ||= TIERS.map((t, k) => api.deal(`tier${k}`, t, 1)[0]));
    let r = 0, phase = 'listen', pt = 0, taps = [], tapT0 = 0, judged = null, bounce = 0, played = false;
    const patDur = (p) => p[p.length - 1] * STEP;
    function play() {
      api.sfx.setDuck(1);
      const p = pats[r]; p.forEach((b) => api.sfx.clap(b * STEP + 0.05));
      played = true;
    }
    function judge() {
      const p = pats[r]; const exp = p.map((b) => b * STEP); const rel = taps.map((t) => (t - taps[0]) / 1000);
      const used = new Set(); let sum = 0; const hits = [];
      for (const e of exp) {
        let best = -1, bd = 1e9; rel.forEach((x, k) => { if (!used.has(k) && Math.abs(x - e) < bd) { bd = Math.abs(x - e); best = k; } });
        if (best >= 0 && bd < 0.17) { used.add(best); const pts = bd < 0.06 ? 100 : Math.round(100 - ((bd - 0.06) / 0.11) * 60); sum += pts; hits.push({ e, x: rel[best], pts }); }
        else hits.push({ e, x: null, pts: 0 });
      }
      const extra = rel.length - used.size; sum = Math.max(0, sum - extra * 25);
      const pct = Math.round(sum / exp.length);
      judged = { hits, rel, pct, extra };
      api.add(sum, api.W / 2, api.H * 0.3, `+${sum}`);
      api.banner(pct >= 90 ? 'Perfect echo!' : pct >= 70 ? 'Groovy!' : pct >= 40 ? 'Kinda close…' : rel.length ? 'Was that jazz?' : 'No claps heard', { color: pct >= 70 ? C.mint : C.sun, size: 90 * api.u });
      api.sfx.setDuck(1); pct >= 70 ? api.sfx.success() : api.sfx.wrong();
    }
    return {
      update(dt) {
        pt += dt; bounce = Math.max(0, bounce - dt * 4);
        const p = pats[r];
        if (phase === 'listen') {
          api.hint(`Round ${r + 1} of 4: listen…`);
          if (!played) play();
          if (p.some((b) => Math.abs(pt - 0.05 - b * STEP) < 0.02)) bounce = 1;
          if (pt > patDur(p) + 0.9) { phase = 'turn'; pt = 0; taps = []; api.sfx.setDuck(0.3); api.hint('Your turn — clap it back!'); }
        } else if (phase === 'turn') {
          if (api.mic.onset) { taps.push(api.mic.onsetAt); bounce = 1; }
          const waitedTooLong = !taps.length && pt > 5;
          const finished = taps.length && (performance.now() - taps[0]) / 1000 > patDur(p) + 0.9;
          if (waitedTooLong || finished) { judge(); phase = 'judge'; pt = 0; api.hint(''); }
          api.timer(taps.length ? 1 - (performance.now() - taps[0]) / 1000 / (patDur(p) + 0.9) : 1 - pt / 5);
        } else if (phase === 'judge') {
          api.timer(null);
          if (pt > 2.4) { r++; if (r >= 4) { api.end(); return; } phase = 'listen'; pt = 0; played = false; judged = null; }
        }
      },
      draw(g, W, H) {
        const u = api.u;
        g.fillStyle = '#2A0E5C'; g.fillRect(0, 0, W, H);
        // spotlight floor
        g.fillStyle = '#3B1678'; g.beginPath(); g.ellipse(W / 2, H * 0.88, W * 0.45, 60 * u, 0, 0, Math.PI * 2); g.fill();
        const k = 1 + bounce * 0.25;
        emoji(g, '👏', W / 2, H * 0.4, 190 * u * k, bounce * 0.2);
        if (phase === 'listen') text(g, 'Listen', W / 2, H * 0.2, { size: 70 * u, color: C.sky });
        if (phase === 'turn') text(g, 'Your turn!', W / 2, H * 0.2, { size: 70 * u, color: C.pink });
        // timeline
        const p = pats[r], dur = Math.max(patDur(p), 0.01), tx = W * 0.2, tw = W * 0.6, ty = H * 0.72;
        blob(g, tx - 30 * u, ty - 34 * u, tw + 60 * u, 68 * u, 34 * u, 'rgba(255,246,232,.12)', { lw: 3, stroke: C.cream });
        p.forEach((b, i) => {
          const x = tx + (b * STEP / dur) * tw; const lit = phase === 'listen' && pt - 0.05 >= b * STEP && pt - 0.05 < b * STEP + 0.18;
          const res = judged?.hits[i];
          circle(g, x, ty, (lit ? 24 : 18) * u, res ? (res.pts >= 80 ? C.mint : res.pts > 0 ? C.sun : C.red) : lit ? C.sun : C.cream, { lw: 4 });
        });
        if (judged) for (const x of judged.rel) { const px = tx + (x / dur) * tw; g.strokeStyle = C.pink; g.lineWidth = 6 * u; g.beginPath(); g.moveTo(px, ty - 40 * u); g.lineTo(px, ty + 40 * u); g.stroke(); }
        if (phase === 'turn' && taps.length) {
          const el = (performance.now() - taps[0]) / 1000;
          for (const t of taps) { const px = tx + (((t - taps[0]) / 1000) / dur) * tw; g.strokeStyle = C.pink; g.lineWidth = 6 * u; g.beginPath(); g.moveTo(px, ty - 40 * u); g.lineTo(px, ty + 40 * u); g.stroke(); }
          const hx = tx + clamp(el / dur, 0, 1.15) * tw; g.strokeStyle = C.cream; g.lineWidth = 2; g.beginPath(); g.moveTo(hx, ty - 50 * u); g.lineTo(hx, ty + 50 * u); g.stroke();
        }
        for (let i = 0; i < 4; i++) emoji(g, i < r ? '✅' : i === r ? '👏' : '⚪', W / 2 - 75 * u + i * 50 * u, 100 * u, 34 * u);
      },
    };
  },
};
