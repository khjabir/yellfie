// Microphone analysis: loudness, pitch (YIN) and sharp-onset detection (claps, "hup!").
import { audioCtx } from './sfx.js';
import { state } from './state.js';
import { clamp, median } from './util.js';

export const mic = {
  ready: false,
  db: -100,        // full-scale dB of the current frame
  level: 0,        // 0..1, loudness above the room's noise floor (smoothed)
  raw: 0,          // same, unsmoothed
  loud: 0,         // 0..1 absolute loudness (same scale for every player – used by Roar-o-Meter)
  pitch: 0,        // Hz, 0 when nobody is singing
  clarity: 0,
  onset: false,    // true on the frame a sharp sound starts
  onsetAt: 0,
  floorDb: -58,
  sim: null,       // keyboard simulation hook (see sim.js)
};

let analyser = null, buf = null, ds = null, yinBuf = null, sr = 48000;
let env = -100, lastOnset = 0, lastVoiced = 0, calib = null;
const pitchHist = [];

export function initMic(stream) {
  const ctx = audioCtx();
  const src = ctx.createMediaStreamSource(stream);
  analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0;
  src.connect(analyser);
  sr = ctx.sampleRate; buf = new Float32Array(analyser.fftSize);
  ds = new Float32Array(analyser.fftSize >> 1); yinBuf = new Float32Array(analyser.fftSize >> 1);
  mic.ready = true; mic.stream = stream;
}

export function startCalibration() { calib = []; }
export function endCalibration() {
  if (calib && calib.length > 5) mic.floorDb = clamp(median(calib), -75, -34);
  calib = null;
}

function threshold() { const sens = state.settings.micSens ?? 5; return mic.floorDb + 9 - (sens - 5) * 1.7; }

export function updateMic(now) {
  mic.onset = false;
  if (mic.sim) { mic.sim(now); return; }
  if (!mic.ready) return;
  analyser.getFloatTimeDomainData(buf);
  const n = buf.length; let sum = 0;
  for (let i = 0; i < n; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / n);
  const db = 20 * Math.log10(rms + 1e-10); mic.db = db;
  if (calib) calib.push(db);

  const th = threshold();
  const raw = clamp((db - th) / 30); mic.raw = raw;
  mic.level += (raw - mic.level) * (raw > mic.level ? 0.55 : 0.18);
  const lraw = clamp((db + 58) / 52);
  mic.loud += (lraw - mic.loud) * (lraw > mic.loud ? 0.6 : 0.25);

  // onset: energy of the newest ~16 ms jumping well above the recent envelope
  let s2 = 0; const m = 768; for (let i = n - m; i < n; i++) s2 += buf[i] * buf[i];
  const rdb = 20 * Math.log10(Math.sqrt(s2 / m) + 1e-10);
  if (rdb > env + 10 && rdb > th + 8 && now - lastOnset > 130) { mic.onset = true; mic.onsetAt = now; lastOnset = now; }
  env = env * 0.8 + rdb * 0.2;

  // pitch
  let f = 0, c = 0;
  if (db > th - 4) { const r = yin(buf, sr); f = r.f; c = r.c; }
  if (f > 60 && f < 1100 && c > 0.8) {
    pitchHist.push(f); if (pitchHist.length > 5) pitchHist.shift();
    mic.pitch = median(pitchHist); mic.clarity = c; lastVoiced = now;
  } else if (now - lastVoiced > 140) { mic.pitch = 0; mic.clarity = 0; pitchHist.length = 0; }
}

// YIN pitch detection on a 2x down-sampled buffer
function yin(input, rate) {
  const n = input.length >> 1;
  for (let i = 0; i < n; i++) ds[i] = (input[2 * i] + input[2 * i + 1]) * 0.5;
  const fs = rate / 2;
  const minTau = Math.max(2, Math.floor(fs / 1100)), maxTau = Math.min(Math.floor(fs / 60), n >> 1);
  const W = n - maxTau; const d = yinBuf;
  d[0] = 1; let run = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0; for (let i = 0; i < W; i++) { const v = ds[i] - ds[i + tau]; s += v * v; }
    run += s; d[tau] = run ? (s * tau) / run : 1;
  }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (d[t] < 0.14) { while (t + 1 <= maxTau && d[t + 1] < d[t]) t++; tau = t; break; }
  }
  if (tau < 0) return { f: 0, c: 0 };
  const s0 = d[tau - 1], s1 = d[tau], s2 = tau + 1 <= maxTau ? d[tau + 1] : s1;
  const den = s0 + s2 - 2 * s1; const shift = den ? (s0 - s2) / (2 * den) : 0;
  return { f: fs / (tau + shift), c: 1 - s1 };
}

// helpers for games
export const hzToMidi = (f) => 69 + 12 * Math.log2(f / 440);
export const cents = (f, ref) => 1200 * Math.log2(f / ref);
