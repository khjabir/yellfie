// Shared body helpers for pose games: screen-space skeleton, arm angles, pose matching, drawing.
import { C, deg, angleOf, angleDiff, clamp, circle } from '../util.js';

// Arm directions in screen degrees: [left upper arm, left forearm, right upper arm, right forearm]
// 0 = pointing right, 90 = down, -90 = up. "left" = the arm on the left of the screen (the player's left in a mirror).
export const POSES = [
  { id: 'y', name: 'Y', e: '🙌', a: [-125, -125, -55, -55] },
  { id: 'm', name: 'M', e: '🙆', a: [-135, -25, -45, -155] },
  { id: 'c', name: 'C', e: '🌙', a: [-100, -20, 60, 150] },
  { id: 'a', name: 'A', e: '🔺', a: [-110, -55, -70, -125] },
  { id: 't', name: 'T-pose', e: '✈️', a: [180, 180, 0, 0] },
  { id: 'disco', name: 'Disco point', e: '🕺', a: [135, 135, -45, -45] },
  { id: 'flex', name: 'Muscle flex', e: '💪', a: [180, -90, 0, -90] },
  { id: 'egypt', name: 'Walk like an Egyptian', e: '🐫', a: [180, -90, 0, 90] },
  { id: 'teapot', name: 'Little teapot', e: '🫖', a: [115, 35, -20, -65] },
  { id: 'hero', name: 'Superhero', e: '🦸', a: [115, 35, -80, -80] },
  { id: 'dab', name: 'Dab', e: '😎', a: [-15, -60, -30, -30] },
  { id: 'shrug', name: 'Shrug', e: '🤷', a: [110, 175, 70, 5] },
  { id: 'scarecrow', name: 'Scarecrow', e: '🎃', a: [180, 90, 0, 90] },
  { id: 'touchdown', name: 'Touchdown', e: '🏈', a: [-95, -95, -85, -85] },
  { id: 'archer', name: 'Archer', e: '🏹', a: [180, 180, 175, 10] },
];
export const YMCA = ['y', 'm', 'c', 'a'].map((id) => POSES.find((p) => p.id === id));

export function screenBody(api) {
  const b = api.body(); if (!b) return null;
  const S = (p) => (p ? { ...api.pt(p), v: p.v ?? 1 } : null);
  const side = (k) => ({ s: S(b[k].s), e: S(b[k].e), w: S(b[k].w), i: S(b[k].i), h: S(b[k].h) });
  const L = side('L'), R = side('R');
  const sw = Math.max(20, Math.hypot(R.s.x - L.s.x, R.s.y - L.s.y));
  return { L, R, nose: S(b.nose), eyeL: S(b.eyeL), eyeR: S(b.eyeR), sw, mid: { x: (L.s.x + R.s.x) / 2, y: (L.s.y + R.s.y) / 2 } };
}

export function poseMatch(sb, a) {
  if (!sb) return 0;
  const segs = [[sb.L.s, sb.L.e, a[0]], [sb.L.e, sb.L.w, a[1]], [sb.R.s, sb.R.e, a[2]], [sb.R.e, sb.R.w, a[3]]];
  let s = 0;
  for (const [p, q, d] of segs) {
    if (!p || !q || Math.min(p.v, q.v) < 0.35) continue;
    s += clamp(1 - angleDiff(angleOf(p, q), deg(d)) / deg(70));
  }
  return s / 4;
}

export function ghostJoints(Ls, Rs, a, sw) {
  const up = sw * 0.85, fo = sw * 0.85;
  const arm = (s, ua, fa) => { const e = { x: s.x + Math.cos(deg(ua)) * up, y: s.y + Math.sin(deg(ua)) * up }; return { s, e, w: { x: e.x + Math.cos(deg(fa)) * fo, y: e.y + Math.sin(deg(fa)) * fo } }; };
  const mid = { x: (Ls.x + Rs.x) / 2, y: (Ls.y + Rs.y) / 2 };
  return { L: arm(Ls, a[0], a[1]), R: arm(Rs, a[2], a[3]), head: { x: mid.x, y: mid.y - sw * 0.85, r: sw * 0.36 }, mid, sw };
}

export function drawGhost(g, gh, { color = C.sun, lw = 22, alpha = 0.9, dash = true } = {}) {
  g.save(); g.globalAlpha = alpha; g.lineCap = 'round'; g.lineJoin = 'round';
  const path = () => { g.beginPath(); g.moveTo(gh.L.w.x, gh.L.w.y); g.lineTo(gh.L.e.x, gh.L.e.y); g.lineTo(gh.L.s.x, gh.L.s.y); g.lineTo(gh.R.s.x, gh.R.s.y); g.lineTo(gh.R.e.x, gh.R.e.y); g.lineTo(gh.R.w.x, gh.R.w.y); };
  path(); g.strokeStyle = C.ink; g.lineWidth = lw + 8; g.stroke();
  path(); g.strokeStyle = color; g.lineWidth = lw; if (dash) g.setLineDash([lw * 1.2, lw * 0.8]); g.stroke(); g.setLineDash([]);
  circle(g, gh.head.x, gh.head.y, gh.head.r, null, { lw: lw * 0.5, stroke: color });
  for (const p of [gh.L.w, gh.R.w]) circle(g, p.x, p.y, lw * 0.75, color, { lw: 4 });
  g.restore();
}

export function drawSkeleton(g, sb, { color = C.mint, lw = 8 } = {}) {
  if (!sb) return; g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  const seg = (a, b) => { if (!a || !b || Math.min(a.v, b.v) < 0.35) return; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokeStyle = C.ink; g.lineWidth = lw + 5; g.stroke(); g.strokeStyle = color; g.lineWidth = lw; g.stroke(); };
  seg(sb.L.s, sb.R.s); seg(sb.L.s, sb.L.e); seg(sb.L.e, sb.L.w); seg(sb.R.s, sb.R.e); seg(sb.R.e, sb.R.w);
  for (const p of [sb.L.w, sb.R.w]) if (p && p.v > 0.35) circle(g, p.x, p.y, lw * 1.2, color, { lw: 3 });
  g.restore();
}

// tiny icon of a pose for the corner card
export function drawPoseIcon(g, a, cx, cy, size, color = C.ink) {
  const sw = size * 0.42; const Ls = { x: cx - sw / 2, y: cy }, Rs = { x: cx + sw / 2, y: cy };
  const gh = ghostJoints(Ls, Rs, a, sw);
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = color; g.lineWidth = size * 0.07;
  g.beginPath(); g.moveTo(gh.L.w.x, gh.L.w.y); g.lineTo(gh.L.e.x, gh.L.e.y); g.lineTo(Ls.x, Ls.y); g.lineTo(Rs.x, Rs.y); g.lineTo(gh.R.e.x, gh.R.e.y); g.lineTo(gh.R.w.x, gh.R.w.y); g.stroke();
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy + sw * 1.4); g.lineTo(cx - sw * 0.4, cy + sw * 2.3); g.moveTo(cx, cy + sw * 1.4); g.lineTo(cx + sw * 0.4, cy + sw * 2.3); g.stroke();
  circle(g, cx, cy - sw * 0.8, sw * 0.33, null, { lw: size * 0.07, stroke: color });
  g.restore();
}

export function noBodyHint(api, sb) { api.hint(sb ? '' : 'Step back so we can see your head and both arms'); }

// ---------- hand + face outlines (shown when "Show tracking outlines" is on) ----------
export const HAND_EDGES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
export const handScreen = (api, hand) => hand.pts.map((p) => api.pt(p));

export function drawHand(g, P, { color = C.mint, lw = 5, tip = true } = {}) {
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); for (const [a, b] of HAND_EDGES) { g.moveTo(P[a].x, P[a].y); g.lineTo(P[b].x, P[b].y); }
  g.strokeStyle = C.ink; g.lineWidth = lw + 4; g.stroke(); g.strokeStyle = color; g.lineWidth = lw; g.stroke();
  for (const i of [4, 8, 12, 16, 20]) circle(g, P[i].x, P[i].y, lw * 0.9, i === 8 && tip ? C.sun : color, { lw: 2.5 });
  g.restore();
}

const FACE_LOOPS = [
  [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
  [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
  [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191],
  [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
];
const FACE_LINES = [[276, 283, 282, 295, 285], [46, 53, 52, 65, 55], [168, 6, 197, 195, 5, 4, 1]];
export function drawFaceOutline(g, api, face, { color = 'rgba(255,246,232,.85)', lw = 2.5 } = {}) {
  if (!face?.pts || face.pts.length < 468) return;
  const P = (i) => api.pt(face.pts[i]);
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = color; g.lineWidth = lw; g.beginPath();
  for (const loop of FACE_LOOPS) { const a = P(loop[0]); g.moveTo(a.x, a.y); for (const i of loop.slice(1)) { const p = P(i); g.lineTo(p.x, p.y); } g.closePath(); }
  for (const line of FACE_LINES) { const a = P(line[0]); g.moveTo(a.x, a.y); for (const i of line.slice(1)) { const p = P(i); g.lineTo(p.x, p.y); } }
  g.stroke(); g.restore();
}
