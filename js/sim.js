// Developer mode (?sim in the URL): keyboard + mouse stand in for the mic and camera.
// Space = voice (mouse height = pitch), C = clap, face keys S/O/B/W/K/U/D/F/P/L/Q,
// number keys = arm poses, mouse = hands / head position, mouse button or X = pinch,
// arrow up/down = how many fingers the hand(s) show (Backspace = back to a pointing hand),
// hold R = jog on the spot, J = jump, hold N = crouch.
import { mic } from './mic.js';
import { vision, buildFace } from './vision.js';

export const sim = {
  voice: 0, pitchY: 0.5, clap: false, mouse: { x: 0.5, y: 0.45 },
  keys: new Set(), arms: 'down', faceOn: true, poseOn: true, blend: null, overrideLevel: null, pinch: false, fingers: null, run: false, duck: false, jumpUntil: 0,
};
const VW = 1280, VH = 720;
const ARMS = {
  down: [100, 95, 80, 85], up: [-100, -95, -80, -85], left: [-100, -95, 80, 85], right: [100, 95, -80, -85],
  t: [180, 180, 0, 0], head: [-140, -20, -40, -160], nose: [110, -60, 80, 85], eyes: [130, -70, 50, -110],
  wings: [150, -30, 30, -150], y: [-130, -130, -50, -50], flex: [180, -90, 0, -90], mouse: null,
};
const KEYMAP = { 1: 'down', 2: 'up', 3: 'left', 4: 'right', 5: 't', 6: 'head', 7: 'nose', 8: 'eyes', 9: 'wings', 0: 'mouse' };
const FACEKEYS = { s: ['mouthSmileLeft', 'mouthSmileRight'], o: ['jawOpen'], b: ['eyeBlinkLeft', 'eyeBlinkRight'], w: ['eyeBlinkLeft'], k: ['mouthPucker'], u: ['browInnerUp', 'browOuterUpLeft', 'browOuterUpRight'], d: ['browDownLeft', 'browDownRight'], f: ['mouthFrownLeft', 'mouthFrownRight'], p: ['cheekPuff'], l: ['eyeLookUpLeft', 'eyeLookUpRight'], q: ['eyeSquintLeft', 'eyeSquintRight'] };

export function enableSim() {
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase(); if (e.target.tagName === 'INPUT') return;
    if (k === ' ' && !e.repeat) sim.voice = 1;
    if (k === 'c' && !e.repeat) sim.clap = true;
    if (KEYMAP[k]) sim.arms = KEYMAP[k];
    if (k === 'x') sim.pinch = true;
    if (k === 'r') sim.run = true;
    if (k === 'n') sim.duck = true;
    if (k === 'j' && !e.repeat) sim.jumpUntil = performance.now() + 320;
    if (k === 'arrowup') sim.fingers = Math.min(10, (sim.fingers ?? -1) + 1);
    if (k === 'arrowdown') sim.fingers = Math.max(0, (sim.fingers ?? 1) - 1);
    if (k === 'backspace') sim.fingers = null;
    sim.keys.add(k);
  });
  addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); if (k === ' ') sim.voice = 0; if (k === 'x') sim.pinch = false; if (k === 'r') sim.run = false; if (k === 'n') sim.duck = false; sim.keys.delete(k); });
  addEventListener('pointerdown', () => { sim.pinch = true; });
  addEventListener('pointerup', () => { sim.pinch = false; });
  addEventListener('pointermove', (e) => {
    // map the pointer through the same "cover" fit the camera view uses, so tracked points sit right under it
    const s = Math.max(innerWidth / VW, innerHeight / VH), dw = VW * s, dh = VH * s;
    sim.mouse = { x: (e.clientX - (innerWidth - dw) / 2) / dw, y: (e.clientY - (innerHeight - dh) / 2) / dh }; sim.pitchY = e.clientY / innerHeight;
  });

  mic.sim = (now) => {
    const lv = sim.overrideLevel ?? sim.voice * 0.85;
    mic.raw = lv; mic.level += (lv - mic.level) * 0.5; mic.loud += (lv - mic.loud) * 0.5; mic.db = lv ? -15 : -70;
    mic.pitch = lv > 0.05 ? (sim.overridePitch ?? 100 * 2 ** ((1 - sim.pitchY) * 2.6)) : 0; mic.clarity = mic.pitch ? 0.95 : 0;
    if (sim.clap) { mic.onset = true; mic.onsetAt = now; sim.clap = false; }
  };
  vision.sim = (now) => {
    const blend = {};
    for (const [k, names] of Object.entries(FACEKEYS)) for (const n of names) blend[n] = Math.max(blend[n] || 0, sim.keys.has(k) ? 0.8 : 0.03);
    if (sim.blend) Object.assign(blend, sim.blend);
    vision.face = sim.faceOn ? buildFace(fakeFace(sim.mouse.x, sim.mouse.y), blend, now) : null;
    vision.pose = sim.poseOn ? { pts: fakePose(sim.arms), t: now } : null;
    const n = sim.fingers, ext = (k) => [k >= 5, k >= 1, k >= 2, k >= 3, k >= 4];
    vision.hands = !sim.poseOn ? [] : n == null ? [fakeHand(sim.mouse.x, sim.mouse.y, now, [true, true, false, false, false], sim.pinch)]
      : n > 5 ? [fakeHand(sim.mouse.x, sim.mouse.y, now, ext(5)), fakeHand(sim.mouse.x + 0.2, sim.mouse.y, now, ext(n - 5))] : [fakeHand(sim.mouse.x, sim.mouse.y, now, ext(n))];
  };
  window.__yf = { sim, mic, vision };
  const tag = document.createElement('div');
  tag.textContent = 'SIM MODE · Space=voice · C=clap · 1-0=arms · S/O/B/W/K/U/D/F/P/L/Q=face · click/X=pinch · ↑↓=fingers · R=jog · J=jump · N=crouch';
  Object.assign(tag.style, { position: 'fixed', bottom: '4px', right: '6px', zIndex: 99, font: '12px monospace', color: '#fff', background: '#000a', padding: '3px 6px', borderRadius: '6px', pointerEvents: 'none' });
  document.body.append(tag);
}

function fakeFace(cx, cy) {
  const w = 0.16, h = w * (VW / VH) * 1.25; const pts = Array.from({ length: 478 }, () => ({ x: cx, y: cy, z: 0 }));
  const set = (i, dx, dy) => { pts[i] = { x: cx + dx * w, y: cy + dy * h, z: 0 }; };
  set(1, 0, 0); set(13, 0, 0.2); set(14, 0, 0.24); set(10, 0, -0.55); set(152, 0, 0.5); set(234, -0.5, -0.05); set(454, 0.5, -0.05); set(127, -0.48, -0.2); set(356, 0.48, -0.2);
  set(33, -0.32, -0.2); set(133, -0.12, -0.2); set(263, 0.32, -0.2); set(362, 0.12, -0.2); set(0, 0, 0.15); set(164, 0, 0.1); set(61, -0.18, 0.22); set(291, 0.18, 0.22);
  set(468, -0.22, -0.2); set(473, 0.22, -0.2); set(159, -0.22, -0.24); set(386, 0.22, -0.24); set(105, -0.25, -0.33); set(334, 0.25, -0.33);
  return pts;
}

// A hand in video pixels, wrist at the bottom and fingers pointing up. `ext` says which fingers are
// straight: [thumb, index, middle, ring, pinky]. The index tip (or the knuckles of a fist) sits at the mouse.
const MCP = [[-22, -22], [-18, -76], [0, -80], [16, -76], [30, -68]];
function fakeHand(mx, my, now, ext, pinch = false) {
  const L = [[0, 0]];
  if (ext[0]) L.push([-22, -22], [-38, -42], [-52, -58], [-64, -72]); else L.push([-22, -22], [-32, -44], [-30, -56], [-12, -62]);
  for (let f = 1; f < 5; f++) {
    const [x, y] = MCP[f];
    if (ext[f]) L.push([x, y], [x, y - 32], [x, y - 54], [x, y - 74]); else L.push([x, y], [x, y - 22], [x + 4, y - 6], [x + 4, y + 14]);
  }
  if (pinch) L[4] = [L[8][0] + 4, L[8][1] + 4];
  const a = ext[1] ? L[8] : L[9];
  return { pts: L.map(([x, y]) => ({ x: (mx * VW + x - a[0]) / VW, y: (my * VH + y - a[1]) / VH, z: 0 })), t: now };
}

function fakePose(name) {
  const sw = 230; const mid = { x: VW * 0.5, y: VH * 0.45 };
  const P = Array.from({ length: 33 }, () => ({ x: mid.x, y: mid.y + sw * 3, v: 0.2 }));
  const put = (i, x, y) => { P[i] = { x, y, v: 0.95 }; };
  const sL = { x: mid.x - sw / 2, y: mid.y }, sR = { x: mid.x + sw / 2, y: mid.y };
  put(11, sL.x, sL.y); put(12, sR.x, sR.y); put(0, mid.x, mid.y - sw * 0.8); put(2, mid.x - sw * 0.15, mid.y - sw * 0.9); put(5, mid.x + sw * 0.15, mid.y - sw * 0.9);
  put(23, mid.x - sw * 0.35, mid.y + sw * 1.6); put(24, mid.x + sw * 0.35, mid.y + sw * 1.6);
  const a = ARMS[name];
  const arm = (s, ua, fa, ie, iw, ii) => {
    const r = (d) => (d * Math.PI) / 180; const e = { x: s.x + Math.cos(r(ua)) * sw * 0.95, y: s.y + Math.sin(r(ua)) * sw * 0.95 };
    const w = { x: e.x + Math.cos(r(fa)) * sw * 0.85, y: e.y + Math.sin(r(fa)) * sw * 0.85 };
    put(ie, e.x, e.y); put(iw, w.x, w.y); put(ii, w.x + Math.cos(r(fa)) * 25, w.y + Math.sin(r(fa)) * 25);
  };
  if (a) { arm(sL, a[0], a[1], 13, 15, 19); arm(sR, a[2], a[3], 14, 16, 20); }
  else {
    arm(sL, 100, 95, 13, 15, 19);
    const m = { x: sim.mouse.x * VW, y: sim.mouse.y * VH }; put(16, m.x, m.y); put(20, m.x, m.y - 20); put(14, (sR.x + m.x) / 2 + 40, (sR.y + m.y) / 2);
  }
  // whole-body moves: jogging pumps the wrists and knees in turn, jumping and crouching shift everything
  const t = performance.now(), lift = (sim.duck ? -0.6 : t < sim.jumpUntil ? 0.45 : 0) * sw;
  if (sim.run) {
    const s = Math.sin((t / 1000) * Math.PI * 2 * 1.6); // 1.6 arm cycles a second = 3.2 steps a second
    P[15].y -= sw * 0.4 * (1 + s); P[16].y -= sw * 0.4 * (1 - s);
    put(25, mid.x - sw * 0.3, mid.y + sw * 2.6 - sw * 0.2 * (1 - s)); put(26, mid.x + sw * 0.3, mid.y + sw * 2.6 - sw * 0.2 * (1 + s));
  }
  // sim coordinates are already "screen" (mirrored) space
  return P.map((p) => ({ x: p.x / VW, y: (p.y - lift) / VH, v: p.v }));
}
