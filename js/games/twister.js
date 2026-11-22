import { C, clamp, pick, blob, text, UI, DISPLAY } from '../util.js';

// traditional (public-domain) tongue twisters
const LIST = [
  ['She sells seashells by the seashore', 'Red lorry yellow lorry red lorry yellow lorry', 'Unique New York unique New York', 'Toy boat toy boat toy boat', 'Fresh French fried fish', 'Truly rural truly rural', 'Six slick slim saplings'],
  ['Peter Piper picked a peck of pickled peppers', 'How much wood would a woodchuck chuck', 'Fuzzy Wuzzy was a bear Fuzzy Wuzzy had no hair', 'Rubber baby buggy bumpers', 'Eleven benevolent elephants', 'A proper copper coffee pot', 'Big black bug bit a big black bear'],
  ['I scream you scream we all scream for ice cream', 'Lesser leather never weathered wetter weather better', 'Betty Botter bought some butter but she said the butter is bitter', 'Which wristwatches are Swiss wristwatches', 'Can you can a can as a canner can can a can', 'The sixth sick sheikh\'s sixth sheep\'s sick', 'Fred fed Ted bread and Ted fed Fred bread'],
];
const NUM = { 0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve' };
const norm = (s) => s.toLowerCase().replace(/\d+/g, (d) => NUM[d] || d).replace(/[^a-z]/g, '');
const words = (s) => s.toLowerCase().replace(/\d+/g, (d) => NUM[d] || d).replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) { cur[0] = i; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); [prev, cur] = [cur, prev]; }
  return prev[n];
}
export const similarity = (target, heard) => { const t = norm(target), h = norm(heard); return clamp(1 - lev(t, h) / Math.max(t.length, 1)); };

export default {
  id: 'twister', name: 'Tongue Twister Turbo', emoji: '👅', kind: 'voice', needs: ['mic', 'speech'],
  tagline: 'Say it right, say it fast.',
  howTo: ['A tongue twister appears. Say it out loud once, as fast as you can.', 'Accuracy matters most. Speed earns a bonus.', 'Three twisters, each one meaner than the last.'],
  crowd: 'Everyone else: stay quiet. The robot ears can hear you too.',
  ready: 'Get close to the microphone. This game uses your browser\'s speech recognition, which may send audio to the browser maker (Chrome sends it to Google).',
  unit: 'points',
  variety: 'tongue twisters',
  create(api) {
    const set = (api.shared.twisters ||= LIST.map((l, k) => api.deal(`level${k}`, l, 1)[0]));
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let i = 0, phase = 'show', pt = 0, heard = '', firstAt = 0, lastAt = 0, rec = null, err = '', result = null, alive = true;

    function listen() {
      heard = ''; firstAt = lastAt = 0;
      try {
        rec = new SR(); rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
        rec.onresult = (e) => {
          const now = performance.now(); if (!firstAt) firstAt = now; lastAt = now;
          heard = Array.from(e.results).map((r) => r[0].transcript).join(' ');
          if (similarity(set[i], heard) > 0.96) finish();
        };
        rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') err = 'Speech recognition was blocked.'; else if (e.error === 'network') err = 'Speech recognition needs an internet connection.'; };
        rec.onend = () => { if (alive && phase === 'speak') { try { rec.start(); } catch { /* already running */ } } };
        rec.start();
      } catch (e) { err = 'Speech recognition is not available here.'; }
    }
    function stop() { try { rec && (rec.onend = null, rec.abort()); } catch { /* ignore */ } rec = null; }
    function finish() {
      if (phase !== 'speak') return; stop();
      const acc = similarity(set[i], heard); const n = words(set[i]).length;
      const secs = firstAt ? Math.max(0.6, (lastAt - firstAt) / 1000 + 0.6) : 99;
      const mult = clamp((n * 0.36) / secs, 0.5, 1.4);
      const pts = Math.round(100 * acc * acc * mult);
      result = { acc, secs, pts };
      api.add(pts, api.W / 2, api.H * 0.25, `+${pts}`);
      api.sfx.setDuck(1); acc > 0.85 ? api.sfx.success() : acc > 0.5 ? api.sfx.point() : api.sfx.wrong();
      api.banner(acc > 0.9 ? 'Silver tongue!' : acc > 0.7 ? 'Nearly!' : acc > 0.4 ? 'Tongue tied!' : 'Total gibberish', { color: acc > 0.7 ? C.mint : C.sun, size: 90 * api.u });
      phase = 'judge'; pt = 0;
    }
    return {
      update(dt) {
        pt += dt;
        if (phase === 'show') { api.hint('Read it… get ready…'); if (pt > 1.8) { phase = 'speak'; pt = 0; api.hint('GO! Say it!'); api.sfx.setDuck(1); api.sfx.go(); api.sfx.setDuck(0.3); listen(); } }
        else if (phase === 'speak') {
          api.timer(1 - pt / 12);
          if (err) api.hint(err);
          if (pt > 12 || (firstAt && performance.now() - lastAt > 1700) || (err && pt > 3)) finish();
        } else if (phase === 'judge') {
          api.timer(null); api.hint('');
          if (pt > 2.6) { i++; result = null; if (i >= set.length) { api.end(); return; } phase = 'show'; pt = 0; }
        }
      },
      destroy() { alive = false; stop(); },
      draw(g, W, H) {
        const u = api.u;
        g.fillStyle = C.pink; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(255,255,255,.12)'; for (let y = 0; y < H; y += 44 * u) for (let x = (y / (44 * u)) % 2 ? 22 * u : 0; x < W; x += 44 * u) { g.beginPath(); g.arc(x, y, 5 * u, 0, Math.PI * 2); g.fill(); }
        text(g, ['Warm-up', 'Trickier', 'Tongue breaker'][i] || '', W / 2, H * 0.16, { size: 40 * u, color: C.sun });
        // card with the twister, word-wrapped
        const cw = Math.min(W * 0.84, 1000 * u), cx = W / 2 - cw / 2, cy = H * 0.24;
        const hw = new Set(words(heard));
        const ws = set[i] ? set[i].split(' ') : [];
        const size = 54 * u; g.font = `400 ${size}px ${DISPLAY}`;
        const lines = []; let line = [];
        for (const w of ws) { const test = [...line, w].join(' '); if (g.measureText(test).width > cw - 60 * u && line.length) { lines.push(line); line = [w]; } else line.push(w); }
        if (line.length) lines.push(line);
        const ch = lines.length * size * 1.25 + 70 * u;
        blob(g, cx, cy, cw, ch, 28 * u, C.cream, { lw: 6, shadow: 10 });
        lines.forEach((ln, li) => {
          const full = ln.join(' '); let x = W / 2 - g.measureText(full).width / 2; const y = cy + 35 * u + size * 0.6 + li * size * 1.25;
          for (const w of ln) {
            const said = hw.has(w.toLowerCase().replace(/[^a-z]/g, ''));
            g.font = `400 ${size}px ${DISPLAY}`; g.textAlign = 'left'; g.textBaseline = 'middle';
            g.fillStyle = phase !== 'show' && said ? '#11A57A' : C.ink; g.fillText(w, x, y); x += g.measureText(w + ' ').width;
          }
        });
        // what the robot heard
        const hy = cy + ch + 50 * u;
        if (phase !== 'show') {
          text(g, heard ? `"${heard.trim()}"` : phase === 'speak' ? 'Listening…' : '', W / 2, hy, { size: 30 * u, color: C.cream, font: UI, weight: '700', maxWidth: W * 0.9 });
        }
        if (result) {
          text(g, `${Math.round(result.acc * 100)}% right`, W / 2 - 170 * u, hy + 70 * u, { size: 42 * u, color: C.sun });
          text(g, result.secs < 90 ? `${result.secs.toFixed(1)} s` : '—', W / 2 + 170 * u, hy + 70 * u, { size: 42 * u, color: C.sun });
        }
      },
    };
  },
};
