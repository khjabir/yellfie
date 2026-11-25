import { C, clamp, rand, shuffle, blob, text, emoji, rrect } from '../util.js';
import { makePinch, drawPinch } from './body.js';

const GRIDS = { 6: [3, 2], 9: [3, 3], 12: [4, 3], 16: [4, 4] }; // pieces → [columns, rows]
const S = 540, LIMIT = 120, POSE = 3.4;
const SCENE = ['🦄', '🍕', '🚀', '🎸', '🐙', '🌈', '🍩', '⚽', '🎈', '🦖', '🍉', '👑', '🐳', '🌵', '🎁', '🍦'];
// Scores: a solved puzzle scores 1000 − seconds (so faster is higher); an unsolved one scores the pieces placed.
const solvedIn = (s) => 1000 - s;

// One edge of a piece, from a to b, with a knob pushed along the fixed direction (nx, ny) × s. s = 0 is a flat edge.
function edge(path, ax, ay, bx, by, nx, ny, s, T) {
  if (s) {
    const p = (t, h) => [ax + (bx - ax) * t + nx * h * T * s, ay + (by - ay) * t + ny * h * T * s];
    path.lineTo(...p(0.38, 0));
    path.bezierCurveTo(...p(0.42, 0.35), ...p(0.24, 0.45), ...p(0.28, 0.78));
    path.bezierCurveTo(...p(0.31, 1.1), ...p(0.69, 1.1), ...p(0.72, 0.78));
    path.bezierCurveTo(...p(0.76, 0.45), ...p(0.58, 0.35), ...p(0.62, 0));
  }
  path.lineTo(bx, by);
}

export default {
  id: 'jigsaw', name: 'Selfie Jigsaw', emoji: '🧩', kind: 'camera', needs: ['hands'],
  tagline: 'Pull a face, then piece your own photo back together.',
  howTo: ['Strike a silly pose. The camera takes your photo and chops it into jigsaw pieces.', 'Pinch your thumb and index finger to grab a piece, drag it to its place, and let go. It clicks in when it is right.', 'The clock is running. The fastest finish wins.'],
  crowd: 'Everyone else: point at the screen and argue about where pieces go.',
  ready: 'Stand so your face is in the middle of the screen, a hand ready to pinch.',
  unit: '', format: (s) => (s >= 500 ? `${solvedIn(s).toFixed(1)}s` : `${Math.round(s)} placed`),
  variety: 'piece layouts',
  options: [
    { key: 'pieces', label: 'Pieces', default: '9', choices: [['6', '6'], ['9', '9'], ['12', '12'], ['16', '16']] },
    { key: 'picture', label: 'Picture', default: 'selfie', choices: [['selfie', 'Your selfie'], ['scene', 'Party picture']] },
  ],
  quip(s) { const t = solvedIn(s); return s < 500 ? (s >= 1 ? 'So close. The pieces fought back.' : 'The puzzle wins this round.') : t < 20 ? 'Puzzle wizard! Fingers of lightning.' : t < 45 ? 'Smooth solving.' : 'Slow and steady… mostly slow.'; },
  create(api) {
    const [cols, rows] = GRIDS[api.option('pieces')] || GRIDS[9];
    const n = cols * rows, pw = S / cols, ph = S / rows, T = Math.min(pw, ph) * 0.2, pad = Math.ceil(T) + 4;
    const sh = (api.shared.jig ||= {});
    const lay = (sh[n] ||= {
      V: Array.from({ length: rows }, () => Array.from({ length: cols }, () => (Math.random() < 0.5 ? 1 : -1))),
      H: Array.from({ length: rows }, () => Array.from({ length: cols }, () => (Math.random() < 0.5 ? 1 : -1))),
      order: shuffle([...Array(n).keys()]), spots: Array.from({ length: n }, () => [Math.random(), Math.random(), Math.random()]),
      scene: shuffle(SCENE).map((ch) => [ch, rand(-0.4, 0.4)]),
    });
    const pinch = makePinch(api);
    let phase = 'pose', pt = 0, t = 0, img = null, pieces = [], locked = 0, doneT = 0, final = 0, flash = 0, isSelfie = false;
    let poseAt = 0, playAt = 0; // real clock times, so the race is timed the same on fast and slow devices

    function board() {
      const W = api.W, H = api.H, u = api.u, wide = W >= H;
      const B = wide ? Math.min(H * 0.66, W * 0.4) : Math.min(W * 0.86, H * 0.42);
      const top = Math.max(150 * u, 124); // clear of the player and score chips, with room for the clock
      const by = wide ? clamp((H - B) / 2 + 20 * u, top, Math.max(top, H - B - 16)) : top;
      return { B, bx: (W - B) / 2, by, k: B / S, wide };
    }
    const slot = (p) => { const b = board(); return { x: b.bx + (p.c + 0.5) * pw * b.k, y: b.by + (p.r + 0.5) * ph * b.k }; };
    // the square of the camera view that becomes the puzzle (always inside what is visible on screen)
    function crop() {
      const v = api.vision.video; if (!v || v.readyState < 2 || !v.videoWidth) return null;
      const sc = api.len(1) / v.videoWidth; // screen pixels per video pixel
      const side = Math.min(api.W / sc, api.H / sc, v.videoWidth, v.videoHeight) * 0.86;
      return { v, side, screen: side * sc };
    }
    function takePicture() {
      const cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d'); const cr = crop();
      if (api.option('picture') === 'selfie' && cr) {
        x.translate(S, 0); x.scale(-1, 1); // mirrored, like the view on screen
        x.drawImage(cr.v, (cr.v.videoWidth - cr.side) / 2, (cr.v.videoHeight - cr.side) / 2, cr.side, cr.side, 0, 0, S, S); isSelfie = true;
      } else {
        const gr = x.createLinearGradient(0, 0, S, S); gr.addColorStop(0, C.sky); gr.addColorStop(0.5, C.pink); gr.addColorStop(1, C.sun); x.fillStyle = gr; x.fillRect(0, 0, S, S);
        x.fillStyle = 'rgba(255,255,255,.22)'; lay.spots.forEach(([a, b, c], i) => { x.beginPath(); x.arc(a * S, b * S, 10 + c * 26 + (i % 3) * 6, 0, 7); x.fill(); });
        lay.scene.forEach(([ch, rot], i) => emoji(x, ch, ((i % 4) + 0.5) * (S / 4), (Math.floor(i / 4) + 0.5) * (S / 4), S / 4 * 0.66, rot));
      }
      return cv;
    }
    function cut() {
      img = takePicture(); pieces = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const path = new Path2D(); path.moveTo(0, 0);
        edge(path, 0, 0, pw, 0, 0, 1, r === 0 ? 0 : lay.H[r - 1][c], T);
        edge(path, pw, 0, pw, ph, 1, 0, c === cols - 1 ? 0 : lay.V[r][c], T);
        edge(path, pw, ph, 0, ph, 0, 1, r === rows - 1 ? 0 : lay.H[r][c], T);
        edge(path, 0, ph, 0, 0, 1, 0, c === 0 ? 0 : lay.V[r][c - 1], T);
        path.closePath();
        const cv = document.createElement('canvas'); cv.width = Math.ceil(pw + pad * 2); cv.height = Math.ceil(ph + pad * 2); const x = cv.getContext('2d');
        x.translate(pad, pad); x.save(); x.clip(path); x.drawImage(img, -c * pw, -r * ph); x.restore();
        x.lineWidth = 3; x.strokeStyle = C.ink; x.lineJoin = 'round'; x.stroke(path);
        const sv = document.createElement('canvas'); sv.width = cv.width; sv.height = cv.height; const y = sv.getContext('2d');
        y.translate(pad, pad); y.fillStyle = 'rgba(10,4,30,.45)'; y.fill(path);   // drawn once, reused as the piece's shadow
        pieces.push({ r, c, cv, sv, x: 0, y: 0, locked: false, by: null });
      }
      // scatter around the board, in the layout's order so "same for everyone" rounds match
      const b = board(), u = api.u, w = pw * b.k, h = ph * b.k, m = Math.max(8, 18 * u), top = Math.max(124 * u, 84);
      const zones = b.wide
        ? [[m + w / 2, b.bx - w * 0.62, top + h / 2, api.H - m - h / 2], [b.bx + b.B + w * 0.62, api.W - m - w / 2, top + h / 2, api.H - m - h / 2]]
        : [[m + w / 2, api.W - m - w / 2, b.by + b.B + h * 0.7, api.H - m - h / 2]];
      const ok = zones.filter((z) => z[1] >= z[0] && z[3] >= z[2]);
      const use = ok.length ? ok : [[m + w / 2, api.W - m - w / 2, top + h / 2, api.H - m - h / 2]];
      const per = Math.ceil(n / use.length);
      lay.order.forEach((idx, i) => {
        // each zone is a loose grid, so pieces overlap as little as the space allows
        const p = pieces[idx], z = use[i % use.length], j = Math.floor(i / use.length), [a, bb, cc] = lay.spots[i];
        const colsZ = Math.max(1, Math.floor((z[1] - z[0]) / (w * 0.98)) + 1), rowsZ = Math.max(1, Math.ceil(per / colsZ));
        const gx = colsZ > 1 ? (j % colsZ) / (colsZ - 1) : 0.5, gy = rowsZ > 1 ? Math.floor(j / colsZ) / (rowsZ - 1) : 0.5;
        p.x = clamp(z[0] + (z[1] - z[0]) * gx + (a - 0.5) * w * 0.1, z[0], z[1]); p.y = clamp(z[2] + (z[3] - z[2]) * gy + (bb - 0.5) * h * 0.1, z[2], z[3]); p.rot = (cc - 0.5) * 0.3;
      });
      pieces = lay.order.map((i) => pieces[i]);
      phase = 'play'; t = 0; playAt = performance.now(); flash = 1; api.sfx.slice(); api.sfx.pop();
    }
    function finish(solved) {
      phase = 'done'; doneT = 0; api.timer(null); api.hint('');
      for (const p of pieces) p.by = null;
      final = solved ? solvedIn(Math.round(t * 10) / 10) : locked; api.setScore(final);
      if (solved) { api.sfx.fanfare(); const b = board(); api.banner(`${t.toFixed(1)} seconds!`, { color: C.mint, y: Math.min(api.H - 50 * api.u, b.by + b.B + 62 * api.u), size: 70 * api.u }); api.fx.burst(b.bx + b.B / 2, b.by + b.B / 2, { n: 40, speed: 600 }); }
      else { api.sfx.fail(); api.banner("Time's up!", { color: C.red }); }
    }

    return {
      idle(dt, now) { pinch.update(now); },
      start() { poseAt = performance.now(); if (api.option('picture') !== 'selfie' || !crop()) cut(); else api.say('Pull a face!'); },
      update(dt, now) {
        const curs = pinch.update(now); pt = (performance.now() - poseAt) / 1000; flash = Math.max(0, flash - dt * 3);
        if (phase === 'pose') { api.hint('Pull a silly face for your puzzle photo!'); if (pt >= POSE) cut(); return; }
        if (phase === 'done') { doneT += dt; if (doneT > 0.35 && doneT - dt <= 0.35) { const b = board(); api.keep(api.snap(b.bx + b.B / 2, b.by + b.B / 2, b.B * 1.08, { emoji: '🧩', label: final >= 500 ? `${solvedIn(final).toFixed(1)}s` : `${locked}/${n}`, score: final })); } if (doneT > 1.8) api.end(final); return; }
        t = (performance.now() - playAt) / 1000; const b = board(), w = pw * b.k, h = ph * b.k;
        for (const c of curs) {
          if (!c.down || pieces.some((p) => p.by === c)) continue;
          for (let i = pieces.length - 1; i >= 0; i--) {
            const p = pieces[i];
            if (!p.locked && !p.by && Math.abs(c.x - p.x) < w * 0.62 && Math.abs(c.y - p.y) < h * 0.62) { p.by = c; p.ox = p.x - c.x; p.oy = p.y - c.y; p.rot = 0; pieces.push(pieces.splice(i, 1)[0]); api.sfx.tick(); break; }
          }
        }
        for (const p of pieces) {
          if (!p.by) continue;
          if (p.by.pinch && !p.by.dead) { p.x = p.by.x + p.ox; p.y = p.by.y + p.oy; continue; }
          p.by = null; const s = slot(p);
          if (Math.abs(p.x - s.x) < w * 0.34 && Math.abs(p.y - s.y) < h * 0.34) { p.locked = true; p.x = s.x; p.y = s.y; locked++; api.sfx.point(); api.fx.ring(s.x, s.y, { r1: w * 0.8, color: C.mint }); }
        }
        if (phase !== 'play') return;
        api.setScore(locked); api.timer(1 - t / LIMIT);
        api.hint(!curs.length ? 'Hold up a hand so the camera can see it' : t < 7 && !locked ? 'Pinch a piece, drag it to its place, let go' : '');
        if (locked === n) finish(true); else if (t >= LIMIT) finish(false);
      },
      draw(g, W, H) {
        const u = api.u; api.camera(g);
        if (phase === 'pose') {
          const cr = crop(), sz = cr ? cr.screen : Math.min(W, H) * 0.7, x0 = (W - sz) / 2, y0 = (H - sz) / 2;
          g.fillStyle = 'rgba(26,16,51,.55)'; g.beginPath(); g.rect(0, 0, W, H); g.rect(x0, y0, sz, sz); g.fill('evenodd');
          g.save(); g.setLineDash([18, 12]); g.lineWidth = 6; g.strokeStyle = C.sun; g.strokeRect(x0, y0, sz, sz); g.restore();
          text(g, `${Math.max(1, Math.ceil(POSE - pt - 0.4))}`, W / 2, y0 + sz - 70 * u, { size: 110 * u, color: C.sun });
          text(g, 'Pull a face!', W / 2, Math.max(104 * u, y0 + 44 * u), { size: 48 * u, color: C.cream });
          for (const c of pinch.list) drawPinch(g, api, c);
          return;
        }
        g.fillStyle = 'rgba(42,14,92,.55)'; g.fillRect(0, 0, W, H);
        const b = board(), dw = (pw + pad * 2) * b.k, dh = (ph + pad * 2) * b.k;
        blob(g, b.bx - 10, b.by - 10, b.B + 20, b.B + 20, 16, 'rgba(26,16,51,.8)', { lw: 5, stroke: C.cream });
        if (img) { g.save(); g.globalAlpha = 0.16; g.drawImage(img, b.bx, b.by, b.B, b.B); g.restore(); }
        g.strokeStyle = 'rgba(255,246,232,.22)'; g.lineWidth = 2; g.beginPath();
        for (let c = 1; c < cols; c++) { g.moveTo(b.bx + c * pw * b.k, b.by); g.lineTo(b.bx + c * pw * b.k, b.by + b.B); }
        for (let r = 1; r < rows; r++) { g.moveTo(b.bx, b.by + r * ph * b.k); g.lineTo(b.bx + b.B, b.by + r * ph * b.k); }
        g.stroke();
        const drawPiece = (p, scale = 1, shadow = false) => {
          g.save(); g.translate(p.x, p.y); if (p.rot) g.rotate(p.rot); g.scale(scale, scale);
          if (shadow) g.drawImage(p.sv, -dw / 2 + 5 * u, -dh / 2 + 8 * u, dw, dh);
          g.drawImage(p.cv, -dw / 2, -dh / 2, dw, dh); g.restore();
        };
        for (const p of pieces) if (p.locked) drawPiece(p);
        for (const p of pieces) if (!p.locked && !p.by) drawPiece(p, 1, true);
        for (const p of pieces) if (p.by) { const s = slot(p); g.save(); g.setLineDash([8, 6]); g.lineWidth = 4; g.strokeStyle = C.sun; rrect(g, s.x - pw * b.k / 2, s.y - ph * b.k / 2, pw * b.k, ph * b.k, 8); g.globalAlpha = 0.5; g.stroke(); g.restore(); drawPiece(p, 1.08, true); }
        const shown = phase === 'done' && final >= 500 ? solvedIn(final) : t;
        const ty = b.by - Math.max(30, 34 * u), ts = Math.max(26, 44 * u);
        text(g, `${shown.toFixed(1)}s`, W / 2 - 8 * u, ty, { size: ts, color: C.sun, align: 'right' });
        text(g, `${locked} / ${n}`, W / 2 + 14 * u, ty, { size: ts * 0.7, color: C.cream, align: 'left' });
        for (const c of pinch.list) drawPinch(g, api, c);
        if (flash > 0) { g.fillStyle = `rgba(255,255,255,${flash * 0.8})`; g.fillRect(0, 0, W, H); }
      },
      peek: () => ({ phase, isSelfie, pieces: pieces.map((p) => ({ x: p.x, y: p.y, locked: p.locked, sx: slot(p).x, sy: slot(p).y })) }), // for automated tests
    };
  },
};
