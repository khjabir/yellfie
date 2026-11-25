import { C, clamp, lerp, rng, median, circle, blob, text, emoji } from '../util.js';
import { screenBody } from './body.js';

// World sizes are in units: 1 unit is 1 pixel on a 1100-pixel-wide screen (drawn × api.u).
const DUR = 60, LEN = 10500;
const SPEED = 430, GRAV = 1900, JUMP = 872, BOOST = 150, AIR_MIN = 240;
const HW = 22, TALL = 104, LOW = 58;      // hero half-width, standing height, ducking height
const STEP_FULL = 3.2;                    // steps a second for top speed
const JUMP_AT = 0.26, DUCK_AT = -0.42;    // shoulder rise / drop that counts, in shoulder widths

// The whole level comes from one seed, so "same for everyone" rounds are identical.
function buildLevel(seed) {
  const r = rng(seed), R = (a, b) => a + r() * (b - a);
  const L = { ground: [], crates: [], plats: [], coins: [], foes: [], flag: 0 };
  const row = (x0, n, h) => { for (let k = 0; k < n; k++) L.coins.push({ x: x0 + k * 62, h }); };
  const arc = (x0, w, h) => { for (let k = 0; k < 5; k++) { const t = k / 4; L.coins.push({ x: x0 + w * t, h: 62 + h * 4 * t * (1 - t) }); } };
  let x = 760, g0 = -600, last = '';
  row(420, 4, 55);
  while (x < LEN) {
    const p = x / LEN; let kind;
    do { const t = r(); kind = t < 0.16 ? 'rest' : t < 0.36 ? 'crate' : t < 0.54 ? 'pit' : t < 0.72 ? 'foe' : t < 0.86 ? 'bat' : 'plat'; } while (kind === last);
    last = kind;
    if (kind === 'rest') { row(x + 90, 4 + Math.floor(r() * 3), 55); x += 440; }
    else if (kind === 'crate') { const wide = p > 0.4 && r() < 0.4; L.crates.push({ x: x + 210, w: wide ? 140 : 70, h: 70 }); arc(x + 150, wide ? 260 : 190, 105); x += wide ? 590 : 520; }
    else if (kind === 'pit') { const w = R(150, 185 + p * 55); L.ground.push([g0, x + 190]); arc(x + 175, w + 30, 95); g0 = x + 190 + w; x = g0 + 250; }
    else if (kind === 'foe') { const a = x + 170, b = x + 470; L.foes.push({ x: b, a, b, dir: -1, v: R(45, 70 + p * 40), ch: r() < 0.5 ? '🐌' : '🦀', h: 0, fly: false, alive: true }); if (r() < 0.5) row(x + 230, 3, 150); x += 640; }
    else if (kind === 'bat') { const a = x + 200, b = x + 330; L.foes.push({ x: a, a, b, dir: 1, v: 30, ch: '🦇', h: R(100, 116), fly: true, alive: true }); row(x + 205, 3, 30); x += 540; }
    else { L.plats.push({ x0: x + 170, x1: x + 410, h: 150, grass: true }); row(x + 200, 4, 205); if (p > 0.3) L.foes.push({ x: x + 400, a: x + 190, b: x + 420, dir: -1, v: 50, ch: '🦀', h: 0, fly: false, alive: true }); x += 600; }
  }
  L.flag = x + 200; L.ground.push([g0, L.flag + 3000]);
  for (const c of L.crates) L.plats.push({ x0: c.x - 8, x1: c.x + c.w + 8, h: c.h }); // you can land on crates
  return L;
}

export default {
  id: 'quest', name: 'Jump Quest', emoji: '🏃', kind: 'camera', needs: ['pose'],
  tagline: 'Jog, jump and duck for real to run your hero through the level.',
  howTo: ['Jog on the spot and pump your arms: your hero runs. Faster jogging, faster hero.', 'Jump for real to jump over crates, pits and critters (land on a critter to squash it). Crouch to duck under bats.', 'Grab coins and reach the flag before the 60 seconds run out. You have three hearts.'],
  crowd: 'Everyone else: shout "JUMP!" at every pit. Possibly a bit too early.',
  ready: 'Clear some floor space, then step back until your head, arms and hips are on screen. Stand tall for the countdown.',
  unit: 'points',
  variety: 'levels',
  quip(s, api) { const p = api.progress || 0; return api.won ? 'Level cleared! A true couch athlete.' : p >= 0.75 ? 'So close to the flag. Legs of steel.' : p >= 0.4 ? 'A solid run. Catch your breath!' : p >= 0.12 ? 'The critters send their regards.' : 'The hero barely left the house.'; },
  create(api) {
    const L = buildLevel((api.shared.seed ||= 1 + Math.floor(Math.random() * 1e9)));
    const hero = { x: 0, h: 0, vx: 0, vh: 0, ground: true, on: null, duck: false, inv: 0, phase: 0, boosted: false, airT: 0 };
    let t = 0, hearts = 3, coins = 0, stomps = 0, bonus = 0, far = 0, over = false, blocked = false, idleT = 0;
    // --- reading the player's body ---
    const ctl = { rate: 0, rise: 0, duck: false, jumpBuf: 0, shout: 0 };
    let sb = null, poseT = 0, baseY = null, baseSw = null, cal = [], armS = 0, kneeS = 0, arms = [], knees = [], armed = true, jumpAt = 0, lastRise = 0, stillT = 0, shot = true, bestRise = 0.3, mirror = null;

    function read(now, playing) {
      const pose = api.vision.pose; sb = screenBody(api);
      arms = arms.filter((s) => now - s < 1000); knees = knees.filter((s) => now - s < 1000);
      ctl.rate = Math.max(arms.length, knees.length);
      if (!pose || !sb) { ctl.rate = 0; return; }
      if (pose.t === poseT) return;                       // no new camera frame yet
      const dtp = Math.min(0.2, (pose.t - poseT) / 1000); poseT = pose.t;
      if (!playing || baseY === null) { cal.push({ y: sb.mid.y, sw: sb.sw }); if (cal.length > 45) cal.shift(); if (!playing) return; }
      if (baseY === null) { if (cal.length < 12) return; baseY = median(cal.map((c) => c.y)); baseSw = median(cal.map((c) => c.sw)); }
      // steps: wrists (and knees, when the legs are on camera) taking turns to be the higher one
      const turn = (a, b, gap, state, list) => { const d = (a.y - b.y) / sb.sw, s = d > gap ? 1 : d < -gap ? -1 : 0; if (s && s !== state) { if (state) list.push(now); return s; } return state; };
      if (sb.L.w.v > 0.35 && sb.R.w.v > 0.35) armS = turn(sb.L.w, sb.R.w, 0.22, armS, arms);
      const kl = pose.pts[25], kr = pose.pts[26];
      if (kl && kr && kl.v > 0.5 && kr.v > 0.5) kneeS = turn(api.pt(kl), api.pt(kr), 0.13, kneeS, knees);
      // height: shoulders well above their resting line = jump, well below = duck
      const rise = (baseY - sb.mid.y) / baseSw; ctl.rise = rise;
      if (Math.abs(rise) < 0.1) { baseY = lerp(baseY, sb.mid.y, 0.04); baseSw = lerp(baseSw, sb.sw, 0.04); }
      stillT = Math.abs(rise - lastRise) < 0.03 ? stillT + dtp : 0; lastRise = rise;
      if (stillT > 2.5 && Math.abs(rise) >= 0.1) { baseY = sb.mid.y; baseSw = sb.sw; stillT = 0; } // they moved to a new spot: re-measure
      if (rise > JUMP_AT && rise < 1.6 && armed) { armed = false; ctl.jumpBuf = 0.2; ctl.shout = 0.5; jumpAt = now; shot = false; }
      if (rise < 0.1) armed = true;
      ctl.duck = ctl.duck ? rise < -0.25 : rise < DUCK_AT;
    }

    const onGroundAt = (x) => L.ground.some(([a, b]) => x >= a - HW * 0.6 && x <= b + HW * 0.6);
    const onPlat = (p, x) => x >= p.x0 - HW * 0.5 && x <= p.x1 + HW * 0.5;
    const tall = () => (hero.duck && hero.ground ? LOW : TALL);
    // 2 points a metre, 5 a coin, 15 a squashed critter, plus the finish bonus
    function score() { api.progress = far / L.flag; api.setScore(Math.floor(far / 50) + coins * 5 + stomps * 15 + bonus); }
    function hurt(fell) {
      hearts--; hero.inv = 1.6; api.sfx.hit(); api.fx.shake(16); api.fx.flash(C.red, 0.25);
      if (fell) { const edge = L.ground.map(([, b]) => b).filter((b) => b < hero.x + 40).pop() ?? 0; hero.x = edge - 110; hero.h = 0; hero.vh = 0; hero.vx = 0; hero.ground = true; hero.on = null; }
      else { hero.x -= 46; hero.vh = 330; hero.ground = false; hero.on = null; hero.vx = 0; hero.airT = 1; }
      if (hearts <= 0) { over = true; api.hint(''); api.banner('Out of hearts!', { color: C.red }); setTimeout(() => api.end(), 1200); }
    }

    return {
      peek: () => ({ x: hero.x, h: hero.h, ground: hero.ground, duck: hero.duck, rate: ctl.rate, hearts, coins, stomps, flag: L.flag, over,
        crates: L.crates.map((c) => ({ dx: c.x - hero.x, w: c.w })).filter((c) => c.dx > -80 && c.dx < 500),
        pits: L.ground.slice(0, -1).map(([, b], i) => ({ dx: b - hero.x, w: L.ground[i + 1][0] - b })).filter((p) => p.dx > -40 && p.dx < 500),
        foes: L.foes.filter((f) => f.alive).map((f) => ({ dx: f.x - hero.x, fly: f.fly })).filter((f) => f.dx > -90 && f.dx < 500) }), // for automated tests
      idle(dt, now) { read(now, false); },
      update(dt, now) {
        read(now, true); if (over) return;
        if (baseY === null) { api.hint(sb ? 'Stand tall and still for a second…' : 'Step back so we can see your head, arms and hips'); return; }
        t += dt; hero.inv -= dt; ctl.jumpBuf -= dt; ctl.shout -= dt;
        api.timer(1 - t / DUR);
        // --- run, jump, duck ---
        hero.duck = ctl.duck;
        const run = ctl.rate >= 2 ? clamp((ctl.rate - 0.8) / (STEP_FULL - 0.8)) : 0;
        const want = SPEED * run * (hero.duck && hero.ground ? 0.55 : 1);
        hero.vx = hero.ground ? lerp(hero.vx, want, clamp(dt * 7)) : Math.max(hero.vx, Math.min(want, SPEED), hero.airT < 0.5 ? AIR_MIN : 0);
        if (ctl.jumpBuf > 0 && hero.ground) { ctl.jumpBuf = 0; hero.vh = JUMP; hero.ground = false; hero.on = null; hero.boosted = false; hero.airT = 0; hero.vx = Math.max(hero.vx, AIR_MIN); api.sfx.boing(); }
        if (!hero.ground && !hero.boosted && hero.airT < 0.22 && ctl.rise > 0.5) { hero.boosted = true; hero.vh += BOOST; } // a really big jump goes higher
        // a keepsake of the jump, taken from the little mirror near the top of the leap
        if (!shot && now - jumpAt > 160 && mirror) { shot = true; if (ctl.rise > bestRise) { bestRise = ctl.rise; api.snaps.length = 0; api.keep(api.snap(mirror.x, mirror.y, mirror.r * 2, { emoji: '🦘', label: 'Big jump!', score: ctl.rise })); } }
        const px = hero.x, ph = hero.h;
        if (!hero.ground) { hero.airT += dt; hero.vh -= GRAV * dt; hero.h += hero.vh * dt; }
        hero.x += hero.vx * dt; hero.phase += hero.vx * dt * 0.045;
        // crates are solid from the side
        blocked = false;
        for (const c of L.crates) if (Math.max(ph, hero.h) < c.h - 6 && hero.x + HW > c.x && hero.x - HW < c.x + c.w) { hero.x = px <= c.x ? c.x - HW : c.x + c.w + HW; hero.vx = 0; blocked = true; }
        // landing and walking off edges
        if (!hero.ground && hero.vh <= 0) {
          for (const p of L.plats) if (ph >= p.h && hero.h <= p.h && onPlat(p, hero.x)) { hero.h = p.h; hero.vh = 0; hero.ground = true; hero.on = p; }
          if (!hero.ground && ph >= 0 && hero.h <= 0 && onGroundAt(hero.x)) { hero.h = 0; hero.vh = 0; hero.ground = true; hero.on = null; }
        } else if (hero.ground && (hero.on ? !onPlat(hero.on, hero.x) : !onGroundAt(hero.x))) { hero.ground = false; hero.on = null; hero.vh = 0; hero.airT = 1; }
        if (hero.h < -240) { api.sfx.fail(); hurt(true); if (over) return; }
        // critters and bats
        for (const f of L.foes) {
          if (!f.alive) continue;
          f.x += f.dir * f.v * dt; if (f.x < f.a) { f.x = f.a; f.dir = 1; } else if (f.x > f.b) { f.x = f.b; f.dir = -1; }
          const bot = f.fly ? f.h - 20 : 0, top = f.fly ? f.h + 20 : 46;
          if (Math.abs(f.x - hero.x) < HW + 24 && hero.h < top && hero.h + tall() > bot) {
            if (hero.vh < 0 && ph >= top - 16) { f.alive = false; stomps++; hero.vh = JUMP * 0.6; hero.airT = 0.3; api.sfx.pop(); api.sfx.point(); api.fx.burst(api.W * 0.3, api.H * 0.76 - top * api.u, { n: 12, emojis: ['💫', '⭐'], speed: 260, size: 6 }); api.fx.float(api.W * 0.3, api.H * 0.76 - (top + 90) * api.u, '+15 squash!', { color: C.mint }); }
            else if (hero.inv <= 0) { hurt(false); if (over) return; }
          }
        }
        // coins
        const mid = hero.h + tall() / 2;
        for (const c of L.coins) if (!c.got && Math.abs(c.x - hero.x) < 36 && Math.abs(c.h - mid) < 54) { c.got = true; coins++; api.sfx.coin(); }
        far = Math.max(far, hero.x); score();
        // the flag
        if (hero.x >= L.flag) { over = true; api.won = true; bonus = 100 + Math.round(Math.max(0, DUR - t) * 5); score(); api.hint(''); api.sfx.fanfare(); api.banner('Level clear!', { color: C.mint, sub: `+${bonus} bonus` }); api.fx.burst(api.W * 0.3, api.H * 0.5, { n: 50, speed: 650 }); setTimeout(() => api.end(), 1500); return; }
        if (t >= DUR) { over = true; api.hint(''); api.banner("Time's up!", { color: C.sun }); setTimeout(() => api.end(), 1100); return; }
        idleT = run > 0 || !hero.ground ? 0 : idleT + dt;
        api.hint(!sb ? 'Step back so we can see your head, arms and hips' : blocked ? 'Jump over it!' : idleT > 1.5 ? 'Jog on the spot and pump your arms to run!' : '');
      },
      draw(g, W, H) {
        const u = api.u, gy = H * 0.76, hx = W * 0.3, X = (wx) => hx + (wx - hero.x) * u, Y = (h) => gy - h * u, now = performance.now();
        const x0 = hero.x - hx / u - 120, x1 = hero.x + (W - hx) / u + 120, vis = (a, b = a) => b > x0 && a < x1;
        // sky, sun, clouds and hills drifting at different speeds
        const sky = g.createLinearGradient(0, 0, 0, gy); sky.addColorStop(0, '#59B8FF'); sky.addColorStop(1, '#CDEBFF'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
        circle(g, W * 0.82, H * 0.2, 56 * u, C.sun, { lw: 5 });
        g.fillStyle = C.cream; for (let k = 0; k < 6; k++) { const cx = ((k * 420 * u - hero.x * u * 0.15) % (W + 400 * u) + W + 400 * u) % (W + 400 * u) - 200 * u, cy = (90 + (k * 67) % 150) * u + 60; g.beginPath(); g.arc(cx, cy, 30 * u, 0, 7); g.arc(cx + 36 * u, cy - 14 * u, 36 * u, 0, 7); g.arc(cx + 78 * u, cy, 28 * u, 0, 7); g.fill(); }
        for (const [par, col, hh, wv] of [[0.3, '#8FD694', 150, 460], [0.55, '#5DBB63', 90, 300]]) { g.fillStyle = col; for (let k = -1; k < W / (wv * u) + 2; k++) { const bx = k * wv * u - (hero.x * u * par) % (wv * u); g.beginPath(); g.moveTo(bx, gy); g.quadraticCurveTo(bx + wv * u / 2, gy - hh * 2 * u, bx + wv * u, gy); g.fill(); } }
        // water shows through wherever there is no ground
        g.fillStyle = '#2E86DE'; g.fillRect(0, gy + 44 * u, W, H); g.fillStyle = '#74B9FF'; for (let wx = -((hero.x * u) % (80 * u)); wx < W; wx += 80 * u) { g.beginPath(); g.arc(wx + 20 * u, gy + 46 * u + Math.sin(now / 400 + wx) * 3 * u, 22 * u, Math.PI, 0); g.fill(); }
        for (const [a, b] of L.ground) { if (!vis(a, b)) continue; const sx = Math.max(-20, X(a)), ex = Math.min(W + 20, X(b)); g.fillStyle = '#B5651D'; g.fillRect(sx, gy, ex - sx, H - gy); g.fillStyle = '#5FCF4A'; g.fillRect(sx, gy, ex - sx, 20 * u); g.fillStyle = C.ink; g.fillRect(sx, gy - 3, ex - sx, 5); if (X(a) > -20) g.fillRect(sx, gy, 5, H - gy); if (X(b) < W + 20) g.fillRect(ex - 5, gy, 5, H - gy); }
        g.fillStyle = 'rgba(26,16,51,.18)'; for (let wx = Math.floor(x0 / 90) * 90; wx < x1; wx += 90) if (onGroundAt(wx) && onGroundAt(wx + 30)) g.fillRect(X(wx), gy + (34 + (Math.abs(wx) % 3) * 22) * u, 26 * u, 8 * u);
        // flag and castle
        if (vis(L.flag, L.flag + 400)) { emoji(g, '🏰', X(L.flag + 230), Y(110), 230 * u); g.fillStyle = C.ink; g.fillRect(X(L.flag) - 4 * u, Y(250), 8 * u, 250 * u); emoji(g, '🏁', X(L.flag) + 34 * u, Y(225), 70 * u, Math.sin(now / 300) * 0.08); }
        for (const p of L.plats) if (p.grass && vis(p.x0, p.x1)) { blob(g, X(p.x0), Y(p.h), (p.x1 - p.x0) * u, 36 * u, 10 * u, '#B5651D', { lw: 5 }); blob(g, X(p.x0), Y(p.h), (p.x1 - p.x0) * u, 16 * u, 8 * u, '#5FCF4A', { lw: 5 }); }
        for (const c of L.crates) if (vis(c.x, c.x + c.w)) for (let k = 0; k < c.w / 70; k++) { const bx = X(c.x + k * 70), by = Y(c.h), s = 70 * u; blob(g, bx, by, s, s, 8 * u, '#D9963F', { lw: 5 }); g.strokeStyle = '#8A5A1E'; g.lineWidth = 5 * u; g.beginPath(); g.moveTo(bx + 12 * u, by + 12 * u); g.lineTo(bx + s - 12 * u, by + s - 12 * u); g.moveTo(bx + s - 12 * u, by + 12 * u); g.lineTo(bx + 12 * u, by + s - 12 * u); g.stroke(); }
        for (const c of L.coins) if (!c.got && vis(c.x)) { const k = Math.abs(Math.cos(now / 220 + c.x * 0.02)); g.beginPath(); g.ellipse(X(c.x), Y(c.h), 15 * u * (0.25 + 0.75 * k), 17 * u, 0, 0, 7); g.fillStyle = C.sun; g.fill(); g.lineWidth = 3.5; g.strokeStyle = C.ink; g.stroke(); }
        for (const f of L.foes) if (f.alive && vis(f.x)) { g.save(); g.translate(X(f.x), Y(f.fly ? f.h + Math.sin(now / 200 + f.a) * 6 : 27)); if (f.dir > 0 && f.ch === '🐌') g.scale(-1, 1); emoji(g, f.ch, 0, 0, (f.fly ? 62 : 58) * u, f.fly ? Math.sin(now / 90) * 0.12 : 0); g.restore(); }
        // the hero: the player's own animal on a little running body
        if (!(hero.inv > 0 && Math.floor(hero.inv * 10) % 2)) {
          const fy = Y(hero.h), duck = hero.duck && hero.ground, air = !hero.ground, sw = Math.sin(hero.phase), hgt = (duck ? LOW : TALL) * u;
          const shY = onGroundAt(hero.x) ? gy : null; if (shY !== null) { g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(hx, shY + 6 * u, 30 * u * clamp(1 - hero.h / 400, 0.4, 1), 7 * u, 0, 0, 7); g.fill(); }
          const hip = fy - (duck ? 12 : 30) * u, sh = fy - hgt + 50 * u;
          g.lineCap = 'round'; g.strokeStyle = C.ink; g.lineWidth = 9 * u;
          for (const s of [-1, 1]) { const k = air ? s * 0.9 : sw * s; g.beginPath(); g.moveTo(hx + s * 7 * u, hip); g.lineTo(hx + s * 7 * u + k * 18 * u, fy - (air ? 10 * u : Math.max(0, k) * 10 * u)); g.stroke(); }
          blob(g, hx - 17 * u, sh - 4 * u, 34 * u, Math.max(14 * u, hip - sh + 8 * u), 12 * u, api.player.color, { lw: 4 });
          g.lineWidth = 7 * u; for (const s of [-1, 1]) { const k = air ? -1 : -sw * s; g.beginPath(); g.moveTo(hx + s * 15 * u, sh + 6 * u); g.lineTo(hx + s * 24 * u + k * 10 * u, sh + (air ? -12 : 22) * u); g.stroke(); }
          emoji(g, api.player.avatar, hx, sh - 22 * u + (air ? 0 : Math.abs(sw) * 3 * u), 62 * u, air ? -0.12 : 0);
        }
        // hearts, coins and progress
        const top = Math.max(98 * u, 86);
        for (let i = 0; i < 3; i++) emoji(g, i < hearts ? '❤️' : '🖤', W / 2 - 40 * u + i * 40 * u, top, 30 * u);
        const bw = Math.min(360 * u, W * 0.5), bx = W / 2 - bw / 2, by = top + 34 * u, k = clamp(hero.x / L.flag);
        blob(g, bx, by, bw, 14 * u, 7 * u, C.cream, { lw: 4 }); if (k > 0.02) blob(g, bx, by, bw * k, 14 * u, 7 * u, C.mint, { lw: 4 });
        emoji(g, api.player.avatar, bx + bw * k, by + 7 * u, 30 * u); emoji(g, '🏁', bx + bw + 22 * u, by + 7 * u, 28 * u);
        g.beginPath(); g.ellipse(bx - 62 * u, top, 11 * u, 13 * u, 0, 0, 7); g.fillStyle = C.sun; g.fill(); g.lineWidth = 3; g.strokeStyle = C.ink; g.stroke(); text(g, `${coins}`, bx - 44 * u, top + 2 * u, { size: 28 * u, color: C.cream, align: 'left' });
        // the mirror: you, with the lines your shoulders must cross to jump or duck.
        // It sits bottom-left, behind the hero, so it never hides what is coming up on the right.
        const pr = Math.max(74, 104 * u), px = pr + 20 * u, py = H - pr - 20 * u, sc = (2.2 * pr) / Math.min(W, H); mirror = { x: px, y: py, r: pr };
        g.save(); g.beginPath(); g.arc(px, py, pr, 0, 7); g.clip(); g.fillStyle = C.ink; g.fill(); g.translate(px - (W / 2) * sc, py - (H / 2) * sc); g.scale(sc, sc); api.camera(g);
        if (sb && api.outlines) { g.lineCap = 'round'; g.strokeStyle = C.pink; g.lineWidth = 12; for (const a of [sb.L, sb.R]) { g.beginPath(); g.moveTo(a.s.x, a.s.y); g.lineTo(a.e.x, a.e.y); g.lineTo(a.w.x, a.w.y); g.stroke(); } g.beginPath(); g.moveTo(sb.L.s.x, sb.L.s.y); g.lineTo(sb.R.s.x, sb.R.s.y); g.stroke(); }
        if (baseY !== null) { g.lineWidth = 6; g.setLineDash([22, 16]); for (const [off, col] of [[JUMP_AT, C.sun], [DUCK_AT, C.sky]]) { g.strokeStyle = col; g.beginPath(); g.moveTo(0, baseY - off * baseSw); g.lineTo(W, baseY - off * baseSw); g.stroke(); } g.setLineDash([]); }
        g.restore(); circle(g, px, py, pr, null, { lw: 6, stroke: ctl.shout > 0 ? C.sun : ctl.duck ? C.sky : C.ink });
        if (ctl.shout > 0) text(g, 'JUMP!', px, py - pr - 22 * u, { size: 36 * u, color: C.sun }); else if (ctl.duck) text(g, 'DUCK', px, py - pr - 22 * u, { size: 36 * u, color: C.sky });
        // jogging speed
        const sw2 = pr * 1.7, sx = px - sw2 / 2 + 26 * u, sy = py - pr - 64 * u, sp = clamp(ctl.rate / STEP_FULL);
        blob(g, sx, sy, sw2, 16 * u, 8 * u, C.cream, { lw: 4 }); if (sp > 0.04) blob(g, sx, sy, sw2 * sp, 16 * u, 8 * u, sp > 0.7 ? C.pink : C.orange, { lw: 4 }); emoji(g, '👟', sx - 22 * u, sy + 8 * u, 30 * u);
      },
    };
  },
};
