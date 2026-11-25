import { C, clamp, blob, text, emoji } from '../util.js';

const NOTES = [['A', 220], ['B♭', 233.08], ['B', 246.94], ['C', 261.63], ['C♯', 277.18], ['D', 293.66], ['E♭', 311.13], ['E', 329.63], ['F', 349.23], ['F♯', 369.99], ['G', 392], ['A♭', 415.3]].map(([name, hz]) => ({ id: name, name, hz }));
const LISTEN = 1.6, SING = 3.2, SETTLE = 0.6, SHOW = 1.5, ROUNDS = 5;
// distance from the target in cents, ignoring which octave you sing in (so low and high voices are equal)
export const centsOff = (f, target) => { const c = 1200 * Math.log2(f / target); return ((c % 1200) + 1800) % 1200 - 600; };
const closeness = (c) => clamp(1 - (Math.abs(c) - 20) / 110);

export default {
  id: 'singback', name: 'Sing It Back', emoji: '🎼', kind: 'voice', needs: ['mic'],
  tagline: 'Hear a note, sing it straight back.',
  howTo: ['The game plays a note. Listen.', 'Then sing it back on "laaa" and hold it. Any octave counts, so sing where it is comfy.', 'The closer and steadier you are, the more points. Five notes, 100 points each.'],
  crowd: 'Everyone else: no humming along. Wincing is allowed.',
  unit: 'points',
  variety: 'notes',
  options: [{ key: 'tuner', label: 'Tuner', default: 'on', choices: [['on', 'Show the tuner'], ['off', 'By ear only']] }],
  quip(s) { return s >= 430 ? 'Perfect pitch! Sign this one up.' : s >= 300 ? 'Properly tuneful.' : s >= 150 ? 'In the neighbourhood of the note.' : 'That was… a sound. Definitely a sound.'; },
  create(api) {
    const notes = (api.shared.notes ||= api.deal('notes', NOTES, ROUNDS));
    const tuner = api.option('tuner') !== 'off';
    let i = 0, phase = 'listen', pt = 0, played = false, sum = 0, dur = 0, pts = 0, trail = [], cur = null;
    return {
      peek: () => ({ i, phase, hz: notes[Math.min(i, ROUNDS - 1)].hz }), // for automated tests
      update(dt) {
        pt += dt; const note = notes[i];
        if (phase === 'listen') {
          if (!played) { played = true; api.sfx.setDuck(1); api.sfx.note(note.hz, 1.25); api.sfx.setDuck(0.3); }
          api.hint(`Note ${i + 1} of ${ROUNDS}: listen…`); api.timer(null);
          if (pt >= LISTEN) { phase = 'sing'; pt = 0; sum = 0; dur = 0; trail = []; api.hint('Sing it back: "laaa"'); }
        } else if (phase === 'sing') {
          const f = api.mic.pitch; cur = f ? centsOff(f, note.hz) : null;
          trail.push(cur); if (trail.length > 90) trail.shift();
          if (pt > SETTLE) { dur += dt; if (cur !== null) sum += closeness(cur) * dt; }
          api.timer(1 - pt / SING);
          if (pt >= SING) {
            pts = dur ? Math.round((100 * sum) / dur) : 0; phase = 'show'; pt = 0; api.timer(null); api.hint('');
            api.add(pts, api.W / 2, api.H * 0.3, `+${pts}`);
            api.sfx.setDuck(1); pts >= 70 ? api.sfx.success() : pts >= 30 ? api.sfx.point() : api.sfx.wrong(); api.sfx.setDuck(0.3);
            api.banner(pts >= 90 ? 'Bullseye!' : pts >= 70 ? 'In tune!' : pts >= 40 ? 'Close-ish' : pts > 0 ? 'Ouch' : 'Not a peep?', { color: pts >= 70 ? C.mint : C.sun, size: 90 * api.u });
          }
        } else if (pt >= SHOW) { i++; if (i >= ROUNDS) { api.end(); return; } phase = 'listen'; pt = 0; played = false; cur = null; }
      },
      draw(g, W, H) {
        const u = api.u, note = notes[Math.min(i, ROUNDS - 1)], cy = H * 0.56, span = H * 0.26; // span = 300 cents
        const bg = g.createRadialGradient(W / 2, cy, 40, W / 2, cy, Math.max(W, H) * 0.7); bg.addColorStop(0, '#472090'); bg.addColorStop(1, '#170A33'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
        const x0 = W * 0.14, x1 = W * 0.86;
        // staff: the target line in the middle, a semitone per faint line
        for (let k = -3; k <= 3; k++) { g.fillStyle = k ? 'rgba(255,246,232,.12)' : 'rgba(61,245,196,.25)'; const hh = k ? 2 : span * (40 / 300); g.fillRect(x0, cy + (k / 3) * span - hh / 2, x1 - x0, hh); }
        text(g, 'too high', x0, cy - span - 18 * u, { size: 20 * u, color: C.cream, align: 'left', alpha: 0.7 }); text(g, 'too low', x0, cy + span + 18 * u, { size: 20 * u, color: C.cream, align: 'left', alpha: 0.7 });
        blob(g, x1 + 12 * u, cy - 26 * u, 84 * u, 52 * u, 14 * u, C.mint, { lw: 4 }); text(g, note.name, x1 + 54 * u, cy, { size: 32 * u, color: C.ink, stroke: null });
        if (phase === 'listen') {
          const k = 1 + Math.sin(performance.now() / 90) * 0.06; emoji(g, '🔊', W / 2, cy, 150 * u * k);
          text(g, 'Listen', W / 2, Math.max(150 * u, 130), { size: 70 * u, color: C.sky });
        } else {
          if (tuner) {
            const y = (c) => cy - clamp(c / 300, -1.15, 1.15) * span; g.lineCap = 'round'; g.lineJoin = 'round';
            for (let k = 1; k < trail.length; k++) {
              const a = trail[k - 1], b = trail[k]; if (a === null || b === null) continue;
              const xa = x1 - (trail.length - k) * ((x1 - x0) / 90), xb = xa + (x1 - x0) / 90;
              g.strokeStyle = Math.abs(b) < 25 ? C.mint : Math.abs(b) < 80 ? C.sun : C.pink; g.lineWidth = 9 * u; g.beginPath(); g.moveTo(xa, y(a)); g.lineTo(xb, y(b)); g.stroke();
            }
            if (phase === 'sing' && cur !== null) emoji(g, '🎤', x1, y(cur), 54 * u);
          } else emoji(g, '🎤', W / 2, cy, (120 + clamp(api.mic.level) * 50) * u);
          text(g, phase === 'sing' ? (cur === null ? 'Sing it back!' : !tuner ? 'Hold it…' : Math.abs(cur) < 25 ? 'Hold it right there!' : cur > 0 ? 'A bit lower' : 'A bit higher') : `${pts} / 100`, W / 2, Math.max(150 * u, 130), { size: 60 * u, color: phase === 'show' ? C.sun : C.pink });
        }
        for (let k = 0; k < ROUNDS; k++) emoji(g, k < i ? '✅' : k === i ? '🎵' : '⚪', W / 2 - (ROUNDS - 1) * 24 * u + k * 48 * u, Math.max(100 * u, 88), 32 * u);
      },
    };
  },
};
