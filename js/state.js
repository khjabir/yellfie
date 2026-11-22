// Party session: players, points, records. Stored in localStorage until the host clears it.
const KEY = 'yellfie.party.v1';
export const COLORS = ['#FF2E88', '#3DF5C4', '#FFD23F', '#4DA8FF', '#FF7A3D', '#B98CFF', '#9BF54A', '#FF8FB1', '#00D1FF', '#FFB13D', '#C8FF3D', '#F55AFF'];
export const AVATARS = ['🦊', '🐸', '🐼', '🦄', '🐙', '🦁', '🐯', '🐨', '🐵', '🐧', '🦖', '🐳', '🦉', '🐝', '🦩', '🐲', '🦝', '🐻', '🐰', '🦀'];
export const RANK_POINTS = [10, 7, 5, 3, 2];

function fresh() {
  return { players: [], totals: {}, history: [], records: {}, settings: { tts: true, sfx: true, micSens: 5, gameVolume: 0.7, roundMode: 'mixed', gameModes: {}, outlines: true } };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY); if (!raw) return null;
    const s = JSON.parse(raw); const f = fresh();
    return { ...f, ...s, settings: { ...f.settings, ...(s.settings || {}) } };
  } catch { return null; }
}
export const state = load() || fresh();
// photos stay in memory only – they disappear when the tab closes
export const gallery = [];

export function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ } }

export function addPlayer(name) {
  name = name.trim().replace(/\s+/g, ' ').slice(0, 16); if (!name) return null;
  if (state.players.length >= 12) return null;
  const used = new Set(state.players.map((p) => p.avatar)); const usedC = new Set(state.players.map((p) => p.color));
  const avatar = AVATARS.find((a) => !used.has(a)) || AVATARS[state.players.length % AVATARS.length];
  const color = COLORS.find((c) => !usedC.has(c)) || COLORS[state.players.length % COLORS.length];
  const p = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, avatar, color };
  state.players.push(p); state.totals[p.id] = { points: 0, wins: 0, played: 0 }; save(); return p;
}
export function removePlayer(id) { state.players = state.players.filter((p) => p.id !== id); save(); }
export function cycleAvatar(id) {
  const p = state.players.find((x) => x.id === id); if (!p) return;
  p.avatar = AVATARS[(AVATARS.indexOf(p.avatar) + 1) % AVATARS.length]; save();
}
export const playerById = (id) => state.players.find((p) => p.id === id);

// 'mixed' = every player gets their own challenges, 'same' = everyone in a round gets identical ones
export function modeFor(game) { return state.settings.gameModes?.[game.id] || state.settings.roundMode || 'mixed'; }
export function setGameMode(id, mode) { (state.settings.gameModes ||= {})[id] = mode; save(); }
export function setDefaultMode(mode) { state.settings.roundMode = mode; state.settings.gameModes = {}; save(); }
export function totalsFor(id) { return (state.totals[id] ||= { points: 0, wins: 0, played: 0 }); }

// results: [{playerId, score}] → adds rank + party points and stores them
export function awardRound(game, results) {
  const sorted = results.slice().sort((a, b) => (game.lowerIsBetter ? a.score - b.score : b.score - a.score));
  let rank = 0, prev = null;
  // scoring nothing earns a single participation point, never a podium spot
  sorted.forEach((r, i) => { if (prev === null || r.score !== prev) rank = i + 1; prev = r.score; r.rank = rank; r.points = r.score > 0 ? RANK_POINTS[rank - 1] ?? 1 : 1; });
  for (const r of sorted) {
    const t = totalsFor(r.playerId); t.points += r.points; t.played += 1; if (r.rank === 1 && r.score > 0 && sorted.length > 1) t.wins += 1;
  }
  let newRecord = null;
  const best = sorted[0];
  if (best) {
    const rec = state.records[game.id];
    const better = !rec || (game.lowerIsBetter ? best.score < rec.score : best.score > rec.score);
    if (better && best.score > 0) { const p = playerById(best.playerId); state.records[game.id] = { score: best.score, name: p?.name || '?', at: Date.now() }; newRecord = best.playerId; }
  }
  state.history.unshift({ game: game.id, at: Date.now(), results: sorted.map(({ playerId, score, rank, points }) => ({ playerId, score, rank, points })) });
  state.history = state.history.slice(0, 60);
  save();
  return { sorted, newRecord };
}
export function leaderboard() {
  return state.players.map((p) => ({ ...p, ...totalsFor(p.id) })).sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));
}
export function resetScores() { state.totals = {}; state.history = []; state.records = {}; state.players.forEach((p) => totalsFor(p.id)); gallery.length = 0; save(); }
export function endParty() { const s = state.settings; Object.assign(state, fresh(), { settings: s }); gallery.length = 0; save(); }
