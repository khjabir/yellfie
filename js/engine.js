// Runs a game for every player in turn: intro → ready → 3-2-1 → play → turn score → podium.
import { mic, updateMic, startCalibration, endCalibration } from './mic.js';
import { vision, updateVision, ensureModel, modelReady, drawVideo, toScreen, lenToScreen, bodyParts } from './vision.js';
import { sfx, say, hush } from './sfx.js';
import { state, awardRound, gallery, playerById, modeFor, setGameMode, optFor, setGameOption } from './state.js';
import { Fx, confetti } from './fx.js';
import * as U from './util.js';

const { C, esc, pick, shuffle, clamp } = U;
const $ = (s) => document.querySelector(s);

let stageEl, canvas, g, overlayHost, W = 0, H = 0, dpr = 1;
let running = false, raf = 0, last = 0, session = null, cur = null, attract = [];
const fx = new Fx();

export function initEngine() {
  stageEl = $('#stage'); canvas = $('#gameCanvas'); g = canvas.getContext('2d'); overlayHost = $('#overlayHost');
  addEventListener('resize', resize);
  $('#exitGame').onclick = () => quit();
  addEventListener('keydown', (e) => {
    if (stageEl.hidden) return;
    if (e.key === 'Escape') { quit(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest?.('button, input, a, select')) {
      const b = overlayHost.querySelector('[data-primary]:not(:disabled)');
      if (b) { e.preventDefault(); b.click(); }
    }
  });
}

function resize() {
  dpr = Math.min(2, devicePixelRatio || 1); W = canvas.clientWidth || innerWidth; H = canvas.clientHeight || innerHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
}

// ---------- main loop ----------
function frame(now) {
  if (!running) return; raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  updateMic(now); updateVision(now);
  if (cur) {
    try {
      if (cur.phase === 'play' && !cur.ended) { cur.api.time += dt; cur.inst.update?.(dt, now); }
      else cur.inst.idle?.(dt, now);
    } catch (e) { console.error('[yellfie] game update failed', e); if (cur.phase === 'play' && !cur.ended) cur.api.end(); }
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = C.grape; g.fillRect(0, 0, W, H);
  const off = fx.offset(); g.save(); g.translate(off.x, off.y);
  if (cur) { try { cur.inst.draw(g, W, H, cur.phase); } catch (e) { console.error('[yellfie] game draw failed', e); } }
  else drawAttract(now);
  fx.update(dt); fx.draw(g, W, H); g.restore();
  if (cur) updateHud();
}

function drawAttract(now) {
  const t = now / 1000;
  for (const a of attract) {
    const y = ((a.y + t * a.s * 0.03) % 1.2) - 0.1;
    U.emoji(g, a.ch, a.x * W, y * H, a.size, Math.sin(t * a.s + a.x * 9) * 0.3, 0.22);
  }
}

// ---------- HUD ----------
let hudCache = {};
function hudSetup(p, game) {
  $('#hud').hidden = false;
  $('#hudPlayer').innerHTML = `<span class="av emoji" style="--c:${p.color}">${p.avatar}</span>${esc(p.name)}`;
  $('#hudGame').textContent = game.name;
  hudCache = {}; hudTimer(null); hudHint('');
}
function updateHud() {
  // games with a secret score (e.g. Face Jumble) only reveal it at the end
  const s = cur.game.secretScore && !cur.ended ? '?' : fmt(cur.game, cur.api.score);
  if (hudCache.s !== s) { hudCache.s = s; $('#hudScore').innerHTML = `${esc(s)}<small>${esc(cur.game.unit ?? 'points')}</small>`; }
}
function hudTimer(frac) {
  const el = $('#hudTimer');
  if (frac == null) { el.hidden = true; return; }
  el.hidden = false; el.firstElementChild.style.transform = `scaleX(${clamp(frac)})`;
}
function hudHint(t) { const el = $('#hudHint'); if (hudCache.h === t) return; hudCache.h = t; el.hidden = !t; el.textContent = t || ''; }

export const fmt = (game, s) => (game.format ? game.format(s) : Math.round(s).toLocaleString());

// ---------- overlays ----------
let ovId = 0;
function overlay(html, cls = '') { ovId++; overlayHost.innerHTML = `<div class="overlay ${cls}">${html}</div>`; const el = overlayHost.firstElementChild; el.querySelector('[data-primary]')?.focus({ preventScroll: true }); return el; }
function clearOverlay() { ovId++; overlayHost.innerHTML = ''; }
function waitAction(el, auto = 0, autoAct = 'next') {
  return new Promise((res) => {
    let timer = null; const done = (a) => { clearTimeout(timer); session.pending = null; res(a); };
    session.pending = done;
    el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
      if (b.dataset.act === 'hold') { clearTimeout(timer); const bar = el.querySelector('.next-bar'); if (bar) bar.hidden = true; b.remove(); return; }
      done(b.dataset.act);
    }));
    if (auto) {
      const bar = el.querySelector('.next-bar i');
      if (bar) { bar.style.transition = `width ${auto}ms linear`; requestAnimationFrame(() => requestAnimationFrame(() => (bar.style.width = '100%'))); }
      timer = setTimeout(() => done(autoAct), auto);
    }
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chip = (p, extra = '') => `<span class="chip"><span class="av emoji" style="--c:${p.color}">${p.avatar}</span>${esc(p.name)}${extra}</span>`;

function quit() {
  if (!session) return;
  session.aborted = true; hush();
  if (cur && !cur.ended) { cur.ended = true; cur.endResolve?.({ score: 0, quit: true }); }
  session.pending?.('quit');
}

// ---------- public: play a game ----------
export async function playGame(game, { partyNext = null } = {}) {
  const players = state.players.slice();
  session = { game, shared: {}, aborted: false, pending: null };
  attract = Array.from({ length: 26 }, () => ({ ch: Math.random() < 0.7 ? game.emoji : pick(['⭐', '🎉', '✨', '🎤', '📸']), x: Math.random(), y: Math.random() * 1.2, s: 0.5 + Math.random(), size: 40 + Math.random() * 60 }));
  stageEl.hidden = false; document.body.style.overflow = 'hidden'; resize(); fx.clear();
  running = true; last = performance.now(); raf = requestAnimationFrame(frame);
  $('#hud').hidden = true;
  let action = 'lobby';
  try {
    let first = true;
    while (true) {
      session.shared = {};
      const order = shuffle(players);
      if (first) {
        const go = await intro(game, order);
        if (go !== 'start') { action = 'lobby'; break; }
      }
      first = false;
      session.mode = modeFor(game);
      const results = [];
      for (let i = 0; i < order.length && !session.aborted; i++) {
        const sc = await turn(game, order, i, results);
        if (!session.aborted) results.push({ playerId: order[i].id, score: sc.score, snaps: sc.snaps });
      }
      if (session.aborted) { action = 'quit'; break; }
      action = await podium(game, results, partyNext);
      if (action === 'quit') break;
      if (action !== 'again') break;
    }
  } finally {
    try { cur?.inst?.destroy?.(); } catch (e) { console.warn(e); }
    running = false; cancelAnimationFrame(raf); cur = null; clearOverlay(); hush();
    vision.want = { face: false, pose: false, hands: false }; sfx.setDuck(1);
    stageEl.hidden = true; document.body.style.overflow = ''; session = null;
  }
  return action;
}

async function intro(game, order) {
  const needs = game.needs || [];
  const problems = [];
  if (needs.includes('mic') && !mic.ready && !mic.sim) problems.push('The microphone is off. Allow microphone access in the address bar, then reload the page.');
  if ((needs.includes('face') || needs.includes('pose') || needs.includes('hands')) && !vision.camReady && !vision.sim) problems.push('The camera is off. Allow camera access in the address bar, then reload the page.');
  if (needs.includes('speech') && !(window.SpeechRecognition || window.webkitSpeechRecognition)) problems.push('This browser has no speech recognition. Try Chrome, Edge or Safari.');
  const models = ['face', 'pose', 'hands'].filter((k) => needs.includes(k));
  const notReady = models.some((k) => !modelReady(k));
  const el = overlay(`
    <div class="card panel">
      <div class="big-emoji emoji">${game.emoji}</div>
      <h2>${esc(game.name)}</h2>
      <p class="sub">${esc(game.tagline)}</p>
      <ul class="howto">${game.howTo.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
      ${game.crowd ? `<div class="crowd"><span class="emoji">📣</span> ${esc(game.crowd)}</div>` : ''}
      ${optionControls(game)}
      ${modeControl(game)}
      <div class="order">${order.map((p, i) => chip(p, `<span class="n">${i + 1}</span>`)).join('')}</div>
      ${problems.length ? `<div class="perm-error">${problems.map(esc).join('<br>')}</div>` : ''}
      <p class="loading" id="loadMsg">${notReady ? 'Getting the tracker ready…' : ''}</p>
      <div class="panel-actions">
        <button class="btn" data-act="back">Back to games</button>
        <button class="btn btn-go btn-big" data-act="start" data-primary ${problems.length || notReady ? 'disabled' : ''}>Start</button>
      </div>
    </div>`);
  if (notReady && !problems.length) {
    const msg = el.querySelector('#loadMsg'); const btn = el.querySelector('[data-act=start]');
    models.reduce((p, k) => p.then(() => ensureModel(k, (t) => (msg.textContent = t))), Promise.resolve())
      .then(() => { msg.textContent = 'Tracker ready.'; btn.disabled = false; btn.focus(); })
      .catch((e) => { console.error(e); msg.textContent = 'The tracker could not load. Check your internet connection (first load downloads about 10 MB), then try again.'; });
  }
  wireMode(el, game); wireOptions(el, game);
  say(`${game.name}! ${game.tagline}`, { interrupt: true });
  return waitAction(el);
}

const READY_HINT = { mic: 'Get close to the microphone.', face: 'Face the camera, nice and close.', pose: 'Step back until your head and both arms are on screen.', hands: 'Hold your hands up where the camera can see them.', speech: 'Get close to the microphone.' };

async function turn(game, order, i, done) {
  const p = order[i];
  const needs = game.needs || [];
  vision.want = { face: needs.includes('face'), pose: needs.includes('pose'), hands: needs.includes('hands') };
  const api = makeApi(game, p, i, order);
  const inst = game.create(api);
  cur = { game, inst, api, phase: 'ready', ended: false, endResolve: null };
  hudSetup(p, game); $('#hud').hidden = true;
  const camGame = game.kind === 'camera';
  const el = overlay(`
    <div class="card panel upnext ${camGame ? 'compact' : ''}" style="--c:${p.color}">
      <div class="who-big emoji">${p.avatar}</div>
      <div class="name">${esc(p.name)}</div>
      <p class="sub">${esc(game.ready || READY_HINT[needs[0]] || '')}</p>
      <div class="panel-actions">
        <button class="btn" data-act="skip">Skip turn</button>
        <button class="btn btn-go btn-big" data-act="go" data-primary>I'm ready</button>
      </div>
    </div>`, camGame ? 'dock' : '');
  say(`${p.name}, you're up!`);
  const act = await waitAction(el);
  if (act === 'quit' || session.aborted) return { score: 0 };
  if (act === 'skip') { inst.destroy?.(); cur = null; return { score: 0 }; }

  cur.phase = 'countdown';
  if (needs.includes('mic')) startCalibration();
  for (const n of [3, 2, 1]) {
    overlay(`<div class="count">${n}</div>`, 'clear'); sfx.beep(); await sleep(800);
    if (session.aborted) return { score: 0 };
  }
  if (needs.includes('mic')) endCalibration();
  const goId = overlay(`<div class="count">Go!</div>`, 'clear') && ovId; sfx.go();
  setTimeout(() => { if (ovId === goId) clearOverlay(); }, 650);
  $('#hud').hidden = false;
  if (needs.includes('mic') || needs.includes('speech')) sfx.setDuck(0.3);
  cur.phase = 'play'; api.time = 0;
  const res = await new Promise((r) => { cur.endResolve = r; inst.start?.(); });
  sfx.setDuck(1); cur.phase = 'over'; hudTimer(null); hudHint('');
  if (session.aborted) return { score: 0 };
  await sleep(1100);
  if (session.aborted) return { score: 0 };

  const score = Math.max(0, Math.round(api.score * 10) / 10);
  const prevBest = done.length ? Math.max(...done.map((d) => d.score)) : null;
  const rec = state.records[game.id];
  const isRecord = score > 0 && (!rec || score > rec.score);
  const quip = game.quip?.(score, api) || genericQuip(score, prevBest, done.length);
  const next = order[i + 1];
  const snaps = api.snaps.slice(0, 6);
  snaps.forEach((s) => gallery.push({ ...s, playerId: p.id, game: game.id, at: Date.now() }));
  if (gallery.length > 80) gallery.splice(0, gallery.length - 80);
  hudShow(false);
  const tEl = overlay(`
    <div class="card panel" style="--c:${p.color}">
      <div class="order">${chip(p)}</div>
      <div class="turn-score">${esc(fmt(game, score))}</div>
      <div class="turn-unit">${esc(game.unit ?? 'points')}</div>
      ${isRecord ? '<span class="badge-new">New party record!</span>' : ''}
      <p class="quip">${esc(quip)}</p>
      ${snaps.length ? `<div class="snaps">${snaps.map(snapHtml).join('')}</div>` : ''}
      <div class="panel-actions">
        <button class="btn" data-act="hold">Wait</button>
        <button class="btn btn-go btn-big" data-act="next" data-primary>${next ? `Next up: ${esc(next.name)}` : 'See who won'}</button>
      </div>
      <div class="next-bar"><i></i></div>
    </div>`);
  if (isRecord) sfx.success();
  say(quip.replace(/[^\w\s!?.,'’-]/g, ''), { interrupt: true });
  await waitAction(tEl, snaps.length ? 11000 : 7000);
  inst.destroy?.(); cur = null;
  return { score, snaps };
}
function hudShow(v) { $('#hud').hidden = !v; }

function snapHtml(s, i) {
  return `<figure class="snap" style="--r:${((i * 37) % 7) - 3}deg"><img src="${s.img}" alt="${esc(s.label || 'Photo')}">
    <figcaption class="cap"><span class="emoji">${s.emoji || '📸'}</span><span>${esc(s.label || '')}</span></figcaption></figure>`;
}

function genericQuip(score, prevBest, n) {
  if (score <= 0) return pick(['Ouch. The only way is up!', 'A bold strategy: score nothing.', 'Zero. Iconic, honestly.']);
  if (prevBest === null) return pick(['First score on the board. Beat that!', 'That is the number to beat.', 'Opening act: nailed it.']);
  if (score > prevBest) return pick(['New leader! Everyone else is sweating.', 'Straight to the top!', 'That just stole the crown.', 'Big talent. Huge.']);
  if (score === prevBest) return 'A perfect tie. Spooky.';
  if (n >= 2 && score < prevBest * 0.4) return pick(['Respectfully... oof.', 'The crowd is being polite.', 'You were warming up, right?']);
  return pick(['Solid! Not the lead, but solid.', 'Close enough to cause drama.', 'Respectable. Very respectable.', 'In the mix!']);
}

async function podium(game, results, partyNext) {
  hudShow(false);
  const { sorted, newRecord } = awardRound(game, results.map(({ playerId, score }) => ({ playerId, score })));
  const P = (r) => playerById(r.playerId) || { name: '?', avatar: '❓', color: C.sun };
  const top = sorted.slice(0, 3);
  const steps = [top[1], top[0], top[2]].map((r, k) => (r ? `
      <div class="step p${[2, 1, 3][k]}" style="--c:${P(r).color}">
        <div class="av emoji">${P(r).avatar}</div><div class="nm">${esc(P(r).name)}</div>
        <div class="sc">${esc(fmt(game, r.score))} ${esc(game.unit || '')}</div>
        <div class="block">${r.rank}</div>
      </div>` : '')).join('');
  const best = sorted.map((r) => { const res = results.find((x) => x.playerId === r.playerId); const s = res?.snaps?.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0]; return s ? { ...s, label: P(r).name } : null; }).filter(Boolean);
  const winner = P(sorted[0]);
  const el = overlay(`
    <div class="card panel results">
      <h2>${sorted[0].score <= 0 ? 'Nobody scored. Rematch?' : sorted.length > 1 ? `${esc(winner.name)} wins!` : 'Turn complete'}</h2>
      <p class="sub">${esc(game.name)}${newRecord ? ' · new party record' : ''}</p>
      <div class="podium">${steps}</div>
      <div class="podium-base"></div>
      <ol class="res-list">${sorted.map((r) => `<li><span class="rk">${r.rank}</span><span class="av emoji" style="--c:${P(r).color}">${P(r).avatar}</span>${esc(P(r).name)}<span class="sc">${esc(fmt(game, r.score))} ${esc(game.unit || '')}</span><span class="plus">+${r.points}</span></li>`).join('')}</ol>
      ${best.length ? `<div class="snaps">${best.map(snapHtml).join('')}</div>` : ''}
      ${optionControls(game)}
      ${modeControl(game, true)}
      <div class="panel-actions">
        <button class="btn" data-act="lobby">Back to games</button>
        <button class="btn btn-mint" data-act="again">Play again</button>
        ${partyNext ? `<button class="btn btn-go btn-big" data-act="next" data-primary>Next game: ${esc(partyNext.name)}</button>` : ''}
      </div>
    </div>`);
  if (!partyNext) el.querySelector('[data-act=again]').setAttribute('data-primary', '');
  wireMode(el, game); wireOptions(el, game);
  sfx.drumroll(1.1); setTimeout(() => { sfx.fanfare(); sfx.applause(); confetti($('#confetti')); }, 1150);
  if (sorted.length > 1 && sorted[0].score > 0) setTimeout(() => say(`${winner.name} wins ${game.name}!`), 1300);
  return waitAction(el);
}

// ---------- same / different challenges ----------
const MODES = [['mixed', 'Different for each player'], ['same', 'Same for everyone']];
function modeNote(game, m) { return m === 'same' ? `Everyone gets the same ${game.variety}, so it's a fair fight.` : `Everyone gets their own ${game.variety}, so nobody can copy.`; }
function modeControl(game, again = false) {
  if (!game.variety) return '';
  const m = modeFor(game);
  return `<div class="mode-pick"><span class="mode-label">${again ? 'Next round' : 'Challenges'}</span>
    <div class="seg" role="group" aria-label="Challenges in a round">${MODES.map(([k, l]) => `<button type="button" data-mode="${k}" aria-pressed="${m === k}">${l}</button>`).join('')}</div>
    <p class="mode-note">${esc(modeNote(game, m))}</p></div>`;
}
function wireMode(el, game) {
  el.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => {
    setGameMode(game.id, b.dataset.mode); sfx.tick();
    el.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    el.querySelector('.mode-note').textContent = modeNote(game, b.dataset.mode);
  }));
}

// game-specific choices declared as `options` on the game (shown on the start screen and podium)
function optionControls(game) {
  return (game.options || []).map((o) => {
    const v = optFor(game, o.key);
    return `<div class="mode-pick" data-opt="${o.key}"><span class="mode-label">${esc(o.label)}</span>
      <div class="seg" role="group" aria-label="${esc(o.label)}">${o.choices.map(([k, l]) => `<button type="button" data-optval="${k}" aria-pressed="${v === k}">${esc(l)}</button>`).join('')}</div></div>`;
  }).join('');
}
function wireOptions(el, game) {
  el.querySelectorAll('[data-opt]').forEach((box) => box.querySelectorAll('[data-optval]').forEach((b) => (b.onclick = () => {
    setGameOption(game.id, box.dataset.opt, b.dataset.optval); sfx.tick();
    box.querySelectorAll('[data-optval]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  })));
}

// Deal n items from a pool, preferring ones nobody has seen yet this party, so games don't repeat.
const seen = {};
const idOf = (x) => (x && typeof x === 'object' ? x.id || x.e || JSON.stringify(x) : String(x));
function deal(game, key, pool, n) {
  const s = (seen[`${game.id}:${key}`] ||= new Set());
  let out = U.sample(pool.filter((x) => !s.has(idOf(x))), n);
  if (out.length < n) { s.clear(); out = out.concat(U.sample(pool.filter((x) => !out.includes(x)), n - out.length)); }
  out.forEach((x) => s.add(idOf(x)));
  return out;
}

// ---------- the API each game receives ----------
function makeApi(game, player, index, order) {
  const api = {
    game, player, index, order, fx, sfx, say, mic, vision, U, C,
    // in "different for each player" mode every turn starts with an empty shared object, so games deal fresh content
    shared: game.variety && session.mode !== 'same' ? {} : session.shared,
    deal: (key, pool, n) => deal(game, key, pool, n),
    time: 0, score: 0, snaps: [],
    get W() { return W; }, get H() { return H; },
    get u() { return Math.min(W / 1100, H / 720); },
    get outlines() { return state.settings.outlines !== false; },
    option: (key) => optFor(game, key),
    add(n, x, y, label, color) {
      api.score = Math.max(0, api.score + n);
      if (x != null) fx.float(x, y, label ?? (n > 0 ? `+${n}` : `${n}`), { color: color || (n >= 0 ? C.sun : C.red), size: 40 * api.u + 8 });
    },
    setScore(n) { api.score = n; },
    timer: hudTimer, hint: hudHint,
    banner(str, o = {}) { fx.banner(str, { size: 120 * api.u + 20, ...o }); },
    end(score) {
      if (!cur || cur.ended || cur.api !== api) return;
      if (score != null) api.score = score;
      cur.ended = true; cur.endResolve?.({ score: api.score });
    },
    camera(gg, o) { drawVideo(gg, W, H, o); },
    pt(p) { return toScreen(p, W, H); },
    len(l) { return lenToScreen(l, W, H); },
    body() { return bodyParts(vision.pose); },
    // crop a square from what is on screen right now (camera + game art) into a keepsake photo
    snap(cx, cy, size, meta = {}) {
      try {
        const out = document.createElement('canvas'); out.width = out.height = 240;
        const s = size * dpr; let sx = cx * dpr - s / 2, sy = cy * dpr - s / 2;
        sx = clamp(sx, 0, Math.max(0, canvas.width - s)); sy = clamp(sy, 0, Math.max(0, canvas.height - s));
        out.getContext('2d').drawImage(canvas, sx, sy, s, s, 0, 0, 240, 240);
        const img = out.toDataURL('image/jpeg', 0.82); return { img, ...meta };
      } catch (e) { return null; }
    },
    keep(photo) { if (photo) api.snaps.push(photo); },
  };
  return api;
}

// used by the ?sim developer mode and automated tests
export const debug = { get cur() { return cur; }, get session() { return session; } };
