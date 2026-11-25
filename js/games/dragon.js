import { C, clamp, lerp, blob, text, emoji, rrect } from '../util.js';

const DUR = 35;

export default {
  id: 'dragon', name: "Don't Wake the Dragon", emoji: '🐉', kind: 'voice', needs: ['mic'],
  tagline: 'Whisper to tiptoe past. Too loud and it wakes.',
  howTo: ['Whisper or hum softly to creep through the cave. A little louder is faster…', '…but cross the red line on the meter and the dragon stirs. Wake it and you lose a heart.', 'Now and then the dragon sleeps lightly and the red line drops. Three hearts, 35 seconds.'],
  crowd: 'Everyone else: hold your breath. Or fake a sneeze.',
  unit: 'steps',
  quip(s) { return s >= 170 ? 'A ghost. A whispering, gold-stealing ghost.' : s >= 110 ? 'Sneaky. Very sneaky.' : s >= 50 ? 'Tiptoed some, trembled more.' : 'The dragon thanks you for the snack.'; },
  create(api) {
    let t = 0, d = 0, anger = 0, lives = 3, wakeT = 0, over = false, step = 0, shown = 0;
    // how loud you may be right now: drops while the dragon is sleeping lightly
    const light = () => clamp((Math.sin(t * 0.9) + Math.sin(t * 0.37 + 1) - 0.6) * 1.5);
    const limit = () => 0.42 - 0.17 * light();
    return {
      peek: () => ({ lim: limit(), anger, lives, d }), // for automated tests
      update(dt) {
        if (over) return;
        t += dt; shown = lerp(shown, d, clamp(dt * 8)); api.setScore(Math.floor(d)); api.timer(1 - t / DUR);
        if (wakeT > 0) { // the dragon is awake and roaring: nothing counts until it dozes off again
          wakeT -= dt; anger = 0; api.hint('');
          if (wakeT <= 0 && lives <= 0) { over = true; api.end(Math.floor(d)); }
          return;
        }
        const lv = api.mic.level, lim = limit();
        if (lv > lim) anger += (0.9 + (lv - lim) * 5) * dt; else anger = Math.max(0, anger - 0.35 * dt);
        if (lv > 0.05 && lv <= lim) { const v = lerp(1.5, 7.5, lv / lim); d += v * dt; step += dt * (4 + v); }
        api.hint(lv > lim ? 'Too loud!' : lv < 0.05 ? 'Whisper to creep forward…' : '');
        if (anger >= 1) {
          lives--; anger = 0; wakeT = 1.7; d = Math.max(0, d - 6);
          api.sfx.setDuck(1); api.sfx.boo(); api.sfx.crash(); api.sfx.setDuck(0.3);
          api.fx.shake(26, 0.7); api.fx.flash(C.orange, 0.5); api.banner(lives > 0 ? 'ROOOAR!' : 'Toasted!', { color: C.orange });
        } else if (t >= DUR) { over = true; api.hint(''); api.sfx.setDuck(1); api.sfx.success(); api.banner('Got away!', { color: C.mint }); setTimeout(() => api.end(Math.floor(d)), 900); }
      },
      draw(g, W, H) {
        const u = api.u, lim = limit(), awake = wakeT > 0, lv = clamp(api.mic.level), floor = H * 0.8;
        const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#120A26'); bg.addColorStop(1, '#3A1E52'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
        // stalactites and gold scroll past as you creep
        g.fillStyle = '#231440';
        for (let k = 0; k < 12; k++) { const x = ((k * 190 * u - shown * 22 * u) % (W + 190 * u) + W + 190 * u) % (W + 190 * u) - 95 * u, hh = (70 + (k * 53) % 90) * u; g.beginPath(); g.moveTo(x - 40 * u, 0); g.lineTo(x, hh); g.lineTo(x + 40 * u, 0); g.fill(); }
        g.fillStyle = '#1B0F33'; g.fillRect(0, floor, W, H - floor);
        for (let k = 0; k < 9; k++) { const x = ((k * 240 * u - shown * 22 * u) % (W + 240 * u) + W + 240 * u) % (W + 240 * u) - 120 * u; emoji(g, k % 3 ? '🪙' : '💎', x, floor + 34 * u, 34 * u); }
        // the dragon
        const dx = W * 0.68, dy = H * 0.47, breathe = Math.sin(performance.now() / 700) * 0.03;
        g.save(); g.translate(dx, dy); g.scale(1 + breathe, 1 - breathe); emoji(g, '🐉', 0, 0, 300 * u, awake ? Math.sin(performance.now() / 40) * 0.06 : 0); g.restore();
        emoji(g, '💰', dx + 150 * u, floor - 30 * u, 90 * u);
        if (awake) { emoji(g, '🔥', dx - 190 * u, dy + 30 * u, 150 * u, -Math.PI / 2); emoji(g, '🔥', dx - 300 * u, dy + 50 * u, 110 * u, -Math.PI / 2); }
        else if (anger > 0.5) emoji(g, '😠', dx - 30 * u, dy - 170 * u, 70 * u, Math.sin(performance.now() / 60) * 0.15);
        else { const zs = 1 - light() * 0.6; for (let k = 0; k < 3; k++) text(g, 'Z', dx - 120 * u - k * 34 * u * zs, dy - 110 * u - k * 44 * u * zs + Math.sin(performance.now() / 400 + k) * 6 * u, { size: (28 + k * 14) * u * zs, color: C.sky }); }
        if (!awake && light() > 0.4) text(g, 'sleeping lightly…', dx, dy + 180 * u, { size: 26 * u, color: C.sun });
        // the sneak
        const sx = W * 0.26, creeping = !awake && lv > 0.05 && lv <= lim;
        g.save(); g.translate(sx, floor - 50 * u - (creeping ? Math.abs(Math.sin(step)) * 10 * u : 0)); g.scale(-1, 1); emoji(g, awake ? '😱' : '🥷', 0, 0, 100 * u, creeping ? Math.sin(step) * 0.07 : 0); g.restore();
        // eyelid bar: how close the dragon is to waking
        const bw = Math.min(420 * u, W * 0.5), bx = W / 2 - bw / 2, by = Math.max(100 * u, 88);
        blob(g, bx, by, bw, 26 * u, 13 * u, C.cream, { lw: 4 }); if (anger > 0.02) blob(g, bx, by, Math.max(26 * u, bw * clamp(anger)), 26 * u, 13 * u, anger > 0.6 ? C.red : C.orange, { lw: 4 });
        emoji(g, '😴', bx - 30 * u, by + 13 * u, 40 * u); emoji(g, '👁️', bx + bw + 30 * u, by + 13 * u, 40 * u);
        for (let i = 0; i < 3; i++) emoji(g, i < lives ? '❤️' : '🖤', W / 2 - 40 * u + i * 40 * u, by + 60 * u, 30 * u);
        // voice meter with the safe zone and the red zone
        const mx = 36 * u, my = Math.max(H * 0.28, 132), mh = Math.min(H * 0.42, H - my - 70 * u), mw = 34 * u, inner = mh - 8;
        blob(g, mx, my, mw, mh, mw / 2, C.cream, { lw: 4 });
        g.save(); rrect(g, mx + 4, my + 4, mw - 8, inner, (mw - 8) / 2); g.clip();
        g.fillStyle = '#FFB3C0'; g.fillRect(mx, my, mw, 4 + inner * (1 - lim)); g.fillStyle = '#B8F5DC'; g.fillRect(mx, my + 4 + inner * (1 - lim), mw, inner * lim + 4);
        g.fillStyle = lv > lim ? C.red : '#11A57A'; g.fillRect(mx, my + 4 + inner * (1 - lv), mw, inner * lv + 4); g.restore();
        g.fillStyle = C.red; g.fillRect(mx - 8 * u, my + 4 + inner * (1 - lim) - 2, mw + 16 * u, 4);
        text(g, 'too loud', mx + mw + 12 * u, my + 4 + inner * (1 - lim) - 16 * u, { size: 18 * u, color: C.red, align: 'left' });
        emoji(g, '🤫', mx + mw / 2, my + mh + 28 * u, 36 * u);
      },
    };
  },
};
