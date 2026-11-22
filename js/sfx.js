// Every sound is synthesised with Web Audio — no audio files needed.
import { state } from './state.js';

let ctx = null, master = null, noiseBuf = null;
let duck = 1;

export function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain(); master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  master.gain.value = (state.settings.gameVolume ?? 0.7) * 0.8;
  return ctx;
}

function out(vol) {
  if (!ctx || !state.settings.sfx) return null;
  const g = ctx.createGain(); g.gain.value = 0; g.connect(master); g._v = vol * duck; return g;
}

function tone(freq, dur, { type = 'square', vol = 0.25, slide = 0, delay = 0, attack = 0.005, vib = 0, curve } = {}) {
  const g = out(vol); if (!g) return;
  const t = ctx.currentTime + delay; const o = ctx.createOscillator(); o.type = type;
  if (curve) o.frequency.setValueCurveAtTime(curve, t, dur);
  else {
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  }
  if (vib) { const l = ctx.createOscillator(); const lg = ctx.createGain(); l.frequency.value = vib; lg.gain.value = freq * 0.04; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(g._v, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, { vol = 0.3, delay = 0, type = 'bandpass', freq = 1200, q = 1, sweep = 0, attack = 0.002 } = {}) {
  const g = out(vol); if (!g) return;
  const t = ctx.currentTime + delay; const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(g._v, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);

export const sfx = {
  // quieter in-game sounds during voice games so the mic doesn't hear them
  setDuck(v) { duck = v; },
  beep() { tone(660, 0.13, { type: 'square', vol: 0.18 }); },
  go() { tone(988, 0.08, { vol: 0.2 }); tone(1319, 0.3, { vol: 0.2, delay: 0.08 }); },
  tick() { tone(1800, 0.03, { type: 'triangle', vol: 0.12 }); },
  coin() { tone(988, 0.07, { vol: 0.16 }); tone(1319, 0.18, { vol: 0.16, delay: 0.07 }); },
  point() { tone(740, 0.06, { type: 'triangle', vol: 0.25 }); tone(1110, 0.12, { type: 'triangle', vol: 0.25, delay: 0.05 }); },
  pop() { noise(0.18, { vol: 0.6, freq: 900, q: 0.7, sweep: -600 }); tone(240, 0.15, { type: 'sine', slide: -180, vol: 0.4 }); },
  hit() { noise(0.3, { vol: 0.5, type: 'lowpass', freq: 800, sweep: -600 }); tone(140, 0.3, { type: 'sawtooth', slide: -90, vol: 0.25 }); },
  crash() { noise(0.7, { vol: 0.6, type: 'lowpass', freq: 2400, sweep: -2200 }); tone(90, 0.6, { type: 'sawtooth', slide: -50, vol: 0.3 }); },
  slice() { noise(0.12, { vol: 0.35, type: 'highpass', freq: 2500, sweep: 3000 }); },
  whoosh() { noise(0.35, { vol: 0.25, freq: 400, q: 2, sweep: 2400 }); },
  splat() { noise(0.2, { vol: 0.45, type: 'lowpass', freq: 1400, sweep: -1000 }); tone(180, 0.12, { type: 'sine', slide: -100, vol: 0.3 }); },
  chomp() { noise(0.06, { vol: 0.4, freq: 700, q: 3 }); noise(0.06, { vol: 0.35, freq: 600, q: 3, delay: 0.09 }); },
  clap(delay = 0) { noise(0.09, { vol: 0.7, freq: 1500, q: 0.9, delay }); noise(0.04, { vol: 0.4, type: 'highpass', freq: 3000, delay }); },
  wood(delay = 0, hi = false) { tone(hi ? 1250 : 900, 0.07, { type: 'sine', vol: 0.4, delay }); },
  note(freq, dur = 1, delay = 0) { tone(freq, dur, { type: 'triangle', vol: 0.3, delay, attack: 0.03 }); tone(freq * 2, dur, { type: 'sine', vol: 0.06, delay, attack: 0.03 }); },
  success() { [72, 76, 79, 84].forEach((n, i) => tone(NOTE(n), 0.22, { type: 'square', vol: 0.15, delay: i * 0.08 })); },
  fanfare() { [60, 64, 67, 72, 67, 72, 76].forEach((n, i) => tone(NOTE(n), i === 6 ? 0.7 : 0.16, { type: 'square', vol: 0.14, delay: i * 0.12 })); [48, 55, 60].forEach((n, i) => tone(NOTE(n), 0.5, { type: 'triangle', vol: 0.2, delay: i * 0.24 })); },
  fail() { [67, 66, 65, 62].forEach((n, i) => tone(NOTE(n), i === 3 ? 0.6 : 0.24, { type: 'sawtooth', vol: 0.12, delay: i * 0.25, vib: i === 3 ? 6 : 0 })); },
  wrong() { tone(160, 0.35, { type: 'sawtooth', vol: 0.22 }); tone(120, 0.35, { type: 'square', vol: 0.12 }); },
  ding() { tone(2093, 1.4, { type: 'sine', vol: 0.35 }); tone(4186, 1.0, { type: 'sine', vol: 0.12 }); tone(1568, 1.2, { type: 'triangle', vol: 0.12 }); },
  boing() { tone(220, 0.35, { type: 'sine', slide: 500, vol: 0.3, vib: 18 }); },
  squeak() { tone(1400, 0.12, { type: 'sine', slide: 700, vol: 0.12 }); },
  buzz(dur = 1.2) { tone(210, dur, { type: 'sawtooth', vol: 0.07, vib: 28 }); tone(230, dur, { type: 'sawtooth', vol: 0.05, vib: 31 }); },
  boo() { tone(300, 0.5, { type: 'sawtooth', slide: -200, vol: 0.3, vib: 9 }); noise(0.4, { vol: 0.3, freq: 600 }); },
  fart() {
    if (!ctx) return; const n = 34; const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) curve[i] = 70 + Math.sin(i * 1.7) * 18 + Math.random() * 25 - i * 0.8;
    tone(80, 0.75, { type: 'sawtooth', vol: 0.32, curve, attack: 0.02 }); noise(0.7, { vol: 0.12, type: 'lowpass', freq: 300 });
  },
  honk() { tone(370, 0.25, { type: 'square', vol: 0.18 }); tone(294, 0.35, { type: 'square', vol: 0.18, delay: 0.26 }); },
  drumroll(dur = 1.6) { for (let t = 0; t < dur; t += 0.045) noise(0.05, { vol: 0.12 + (t / dur) * 0.2, type: 'bandpass', freq: 220, q: 0.8, delay: t }); noise(0.4, { vol: 0.4, freq: 3500, type: 'highpass', delay: dur }); },
  applause(dur = 2.2) { for (let i = 0; i < 70; i++) { const d = Math.random() * dur; noise(0.05 + Math.random() * 0.04, { vol: 0.1 + Math.random() * 0.12 * (1 - d / dur), freq: 1000 + Math.random() * 1500, q: 1.2, delay: d }); } },
};

// ---------- spoken announcer ----------
let voice = null;
function pickVoice() {
  const vs = window.speechSynthesis?.getVoices?.() || [];
  voice = vs.find((v) => /en[-_](US|GB)/i.test(v.lang) && /Samantha|Google US English|Daniel|Karen|Aria|Jenny|Guy/i.test(v.name)) || vs.find((v) => /^en/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); window.speechSynthesis.onvoiceschanged = pickVoice; }

export function say(text, { rate = 1.05, pitch = 1.05, interrupt = true } = {}) {
  if (!state.settings.tts || !('speechSynthesis' in window)) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      if (interrupt) window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); if (voice) u.voice = voice;
      u.rate = rate; u.pitch = pitch; u.volume = Math.min(1, (state.settings.gameVolume ?? 0.7) + 0.2);
      u.onend = u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
      setTimeout(resolve, 4000 + text.length * 60);
    } catch { resolve(); }
  });
}
export function hush() { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }
