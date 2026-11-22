// Camera + MediaPipe face/pose tracking. Everything runs locally in the browser.
// All landmark x values are mirrored (x = 1 - x) so they match the selfie view on screen.
import { clamp } from './util.js';

const VER = '1.2.3';
const LOCAL_LIB = new URL('../vendor/mediapipe/vision_bundle.mjs', import.meta.url).href;
const LOCAL_WASM = new URL('../vendor/mediapipe/wasm', import.meta.url).href;
const CDN_LIB = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}/vision_bundle.mjs`;
const CDN_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}/wasm`;
const MODELS = {
  face: ['../vendor/models/face_landmarker.task', 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'],
  pose: ['../vendor/models/pose_landmarker_lite.task', 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'],
  hands: ['../vendor/models/hand_landmarker.task', 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'],
};
const LABEL = { face: 'face', pose: 'body', hands: 'hand' };

export const vision = {
  video: null, camReady: false,
  want: { face: false, pose: false, hands: false },
  face: null,   // { pts, blend, nose, mouth, box, t }
  pose: null,   // { pts, t }
  hands: [],    // up to two: { pts (21 points, 8 = index fingertip), t }
  sim: null,
};

let mp = null, fileset = null, faceLm = null, poseLm = null, handLm = null, lastVideoTime = -1, lastTs = 0, frameNo = 0, handsAt = 0;
const loading = {};

async function exists(url) { try { const r = await fetch(url, { method: 'HEAD', cache: 'no-store' }); return r.ok; } catch { return false; } }

async function loadLib() {
  if (mp) return;
  if (await exists(LOCAL_LIB)) {
    try { mp = await import(LOCAL_LIB); fileset = await mp.FilesetResolver.forVisionTasks(LOCAL_WASM); return; } catch (e) { console.warn('[yellfie] local MediaPipe failed, trying CDN', e); mp = null; }
  }
  mp = await import(/* @vite-ignore */ CDN_LIB);
  fileset = await mp.FilesetResolver.forVisionTasks(CDN_WASM);
}

export function modelReady(kind) { return vision.sim ? true : kind === 'face' ? !!faceLm : kind === 'pose' ? !!poseLm : !!handLm; }

export function ensureModel(kind, onProgress) {
  if (vision.sim || modelReady(kind)) return Promise.resolve();
  if (!loading[kind]) {
    loading[kind] = (async () => {
      onProgress?.('Waking up the tracking engine…');
      await loadLib();
      onProgress?.(`Loading the ${LABEL[kind]} tracker…`);
      const local = new URL(MODELS[kind][0], import.meta.url).href;
      const path = (await exists(local)) ? local : MODELS[kind][1];
      const make = (delegate) => (kind === 'face'
        ? mp.FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: path, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true })
        : kind === 'pose'
          ? mp.PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: path, delegate }, runningMode: 'VIDEO', numPoses: 1 })
          : mp.HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: path, delegate }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 }));
      let lm;
      try { lm = await make('GPU'); } catch (e) { console.warn('[yellfie] GPU delegate unavailable, using CPU', e); lm = await make('CPU'); }
      if (kind === 'face') faceLm = lm; else if (kind === 'pose') poseLm = lm; else handLm = lm;
    })().catch((e) => { loading[kind] = null; throw e; });
  }
  return loading[kind];
}

export function attachVideo(el, stream) {
  vision.video = el; el.srcObject = stream; el.muted = true;
  return new Promise((res) => {
    const ok = () => { vision.camReady = true; res(true); };
    el.onloadeddata = ok; el.play().catch(() => {});
    setTimeout(() => res(vision.camReady), 4000);
  });
}

export function updateVision(now) {
  if (vision.sim) { vision.sim(now); return; }
  const v = vision.video;
  if (!vision.camReady || !v || v.readyState < 2) return;
  if (v.currentTime === lastVideoTime) return;
  lastVideoTime = v.currentTime;
  let ts = performance.now(); if (ts <= lastTs) ts = lastTs + 1; lastTs = ts;
  // when a game needs both body and hands, alternate frames so the frame rate stays smooth
  frameNo++; const both = vision.want.pose && poseLm && vision.want.hands && handLm;
  try {
    if (vision.want.face && faceLm) parseFace(faceLm.detectForVideo(v, ts), now);
    if (vision.want.pose && poseLm && (!both || frameNo % 2 === 0)) parsePose(poseLm.detectForVideo(v, ts), now);
    if (vision.want.hands && handLm && (!both || frameNo % 2 === 1)) parseHands(handLm.detectForVideo(v, ts), now);
  } catch (e) { console.warn('[yellfie] tracking frame failed', e); }
}

function parseFace(r, now) {
  const lm = r?.faceLandmarks?.[0];
  if (!lm) { if (vision.face && now - vision.face.t > 250) vision.face = null; return; }
  const pts = lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));
  const blend = {};
  for (const c of r.faceBlendshapes?.[0]?.categories || []) blend[c.categoryName] = c.score;
  vision.face = buildFace(pts, blend, now);
}
export function buildFace(pts, blend, now) {
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  for (const i of [10, 152, 234, 454, 127, 356]) { const p = pts[i]; if (!p) continue; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const mouth = { x: (pts[13].x + pts[14].x) / 2, y: (pts[13].y + pts[14].y) / 2 };
  const eyeL = mid(pts[33], pts[133]), eyeR = mid(pts[263], pts[362]);
  return { pts, blend, nose: pts[1], mouth, eyeL, eyeR, box: { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 }, roll: Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x), t: now };
}
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function parsePose(r, now) {
  const lm = r?.landmarks?.[0];
  if (!lm) { if (vision.pose && now - vision.pose.t > 300) vision.pose = null; return; }
  vision.pose = { pts: lm.map((p) => ({ x: 1 - p.x, y: p.y, v: p.visibility ?? 1 })), t: now };
}

function parseHands(r, now) {
  const list = r?.landmarks || [];
  if (!list.length) { if (now - handsAt > 200) vision.hands = []; return; }
  vision.hands = list.map((lm) => ({ pts: lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })), t: now }));
  handsAt = now;
}

// Arms keyed by which side of the screen they are on (robust to left/right label conventions).
// Returns null if shoulders aren't visible.
export function bodyParts(pose) {
  if (!pose) return null; const P = pose.pts;
  const s11 = P[11], s12 = P[12]; if (!s11 || !s12 || Math.min(s11.v, s12.v) < 0.4) return null;
  const leftIsLow = s11.x < s12.x; // landmark 11 is on screen-left?
  const side = (a, b) => (leftIsLow ? a : b);
  const L = { s: P[side(11, 12)], e: P[side(13, 14)], w: P[side(15, 16)], i: P[side(19, 20)], h: P[side(23, 24)] };
  const R = { s: P[side(12, 11)], e: P[side(14, 13)], w: P[side(16, 15)], i: P[side(20, 19)], h: P[side(24, 23)] };
  const sw = Math.hypot(R.s.x - L.s.x, R.s.y - L.s.y);
  return { L, R, nose: P[0], eyeL: P[side(2, 5)], eyeR: P[side(5, 2)], sw, mid: { x: (L.s.x + R.s.x) / 2, y: (L.s.y + R.s.y) / 2 } };
}

// ---------- screen mapping ----------
export function coverMap(W, H) {
  const v = vision.video; const vw = v?.videoWidth || 1280, vh = v?.videoHeight || 720;
  const s = Math.max(W / vw, H / vh); const dw = vw * s, dh = vh * s;
  return { s, dx: (W - dw) / 2, dy: (H - dh) / 2, dw, dh, vw, vh };
}
export function toScreen(p, W, H) { const m = coverMap(W, H); return { x: m.dx + p.x * m.dw, y: m.dy + p.y * m.dh }; }
export function lenToScreen(l, W, H) { return l * coverMap(W, H).dw; }

export function drawVideo(g, W, H, { alpha = 1 } = {}) {
  const v = vision.video;
  if (!vision.camReady || !v || v.readyState < 2) {
    if (vision.sim) { g.save(); g.globalAlpha = alpha; g.fillStyle = '#3B1678'; g.fillRect(0, 0, W, H); g.restore(); }
    return;
  }
  const m = coverMap(W, H);
  g.save(); g.globalAlpha = alpha; g.translate(W, 0); g.scale(-1, 1);
  g.drawImage(v, W - m.dx - m.dw, m.dy, m.dw, m.dh); g.restore();
}

export const faceSize = (face) => clamp(face?.box?.w || 0.2, 0.05, 1);
