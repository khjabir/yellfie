// Developer mode (?sim in the URL): keyboard + mouse stand in for the mic and camera.
// Space = voice (mouse height = pitch), C = clap, face keys S/O/B/W/K/U/D/F/P/L/Q,
// number keys = arm poses, mouse = hands / head position.
import { mic } from './mic.js';
import { vision, buildFace } from './vision.js';

export const sim = {
  voice: 0, pitchY: 0.5, clap: false, mouse: { x: 0.5, y: 0.45 },
  keys: new Set(), arms: 'down', faceOn: true, poseOn: true, blend: null, overrideLevel: null,
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
    sim.keys.add(k);
  });
  addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); if (k === ' ') sim.voice = 0; sim.keys.delete(k); });
  addEventListener('pointermove', (e) => { sim.mouse = { x: e.clientX / innerWidth, y: e.clientY / innerHeight }; sim.pitchY = sim.mouse.y; });

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
    vision.hands = sim.poseOn ? [fakeHand(sim.mouse.x, sim.mouse.y, now)] : [];
  };
  window.__yf = { sim, mic, vision };
  const tag = document.createElement('div');
  tag.textContent = 'SIM MODE · Space=voice · C=clap · 1-0=arms · S/O/B/W/K/U/D/F/P/L/Q=face';
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

function fakeHand(mx, my, now) {
  // pointing hand in video pixels: index tip (8) at the mouse, wrist below it
  const o = { x: mx * VW, y: my * VH }; const P = [];
  const rel = [[10, 150], [-25, 125], [-45, 100], [-55, 80], [-62, 62], [-8, 70], [-4, 40], [-2, 18], [0, 0], [12, 74], [22, 70], [22, 88], [18, 100], [30, 82], [34, 88], [30, 100], [26, 108], [42, 92], [44, 100], [40, 108], [36, 114]];
  for (const [dx, dy] of rel) P.push({ x: (o.x + dx) / VW, y: (o.y + dy) / VH, z: 0 });
  return { pts: P, t: now };
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
  // sim coordinates are already "screen" (mirrored) space
  return P.map((p) => ({ x: p.x / VW, y: p.y / VH, v: p.v }));
}
