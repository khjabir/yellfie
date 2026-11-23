import { state, save, addPlayer, removePlayer, cycleAvatar, leaderboard, resetScores, endParty, gallery, playerById, setDefaultMode } from './state.js';
import { mic, initMic, updateMic } from './mic.js';
import { vision, attachVideo } from './vision.js';
import { audioCtx, sfx, say } from './sfx.js';
import { initEngine, playGame, fmt, debug } from './engine.js';
import { GAMES } from './games/index.js';
import { enableSim } from './sim.js';
import { confetti } from './fx.js';
import { keepAwake, wakeStatus } from './wakelock.js';
import { pwa, initPwa, onPwaChange, promptInstall, offlineStatus, downloadTrackers } from './pwa.js';
import { esc, sample, pick } from './util.js';

const $ = (s) => document.querySelector(s);
const SIM = new URLSearchParams(location.search).has('sim');
if (SIM) enableSim();

const media = { asked: false, micOk: false, camOk: false, error: '' };
let filter = 'all';
let busy = false;

// ---------- camera + microphone ----------
async function ensureMedia() {
  audioCtx();
  if (SIM) { media.micOk = media.camOk = true; return media; }
  if (media.asked) return media;
  media.asked = true;
  if (!navigator.mediaDevices?.getUserMedia) {
    media.error = window.isSecureContext ? 'This browser cannot use a camera or microphone.' : 'Open Yellfie from http://localhost or an https address — browsers block the camera and mic on plain file pages.';
    return media;
  }
  const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  const video = { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
  let aStream = null, vStream = null, errs = [];
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio, video });
    aStream = new MediaStream(s.getAudioTracks()); vStream = new MediaStream(s.getVideoTracks());
  } catch (e) {
    try { aStream = await navigator.mediaDevices.getUserMedia({ audio }); } catch (e2) { errs.push('microphone'); }
    try { vStream = await navigator.mediaDevices.getUserMedia({ video }); } catch (e3) { errs.push('camera'); }
  }
  if (aStream?.getAudioTracks().length) { initMic(aStream); media.micOk = true; }
  if (vStream?.getVideoTracks().length) { media.camOk = await attachVideo($('#cam'), vStream); }
  if (errs.length) media.error = `We couldn't open the ${errs.join(' or the ')}. Click the camera icon in the address bar to allow it, then reload. Games that need it will stay locked until then.`;
  return media;
}

// ---------- setup screen ----------
function renderChips(host) {
  host.innerHTML = state.players.length
    ? state.players.map((p) => `<span class="chip"><button class="av emoji" type="button" data-av="${p.id}" style="--c:${p.color};cursor:pointer" title="Change animal">${p.avatar}</button>${esc(p.name)}<button class="x" type="button" data-rm="${p.id}" aria-label="Remove ${esc(p.name)}">✕</button></span>`).join('')
    : '<span class="empty-note">Add at least one player. Two or more is where it gets loud.</span>';
  host.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { removePlayer(b.dataset.rm); renderChips(host); refreshStart(); }));
  host.querySelectorAll('[data-av]').forEach((b) => (b.onclick = () => { cycleAvatar(b.dataset.av); renderChips(host); }));
}
function refreshStart() { $('#startParty').disabled = state.players.length === 0; }

function showSetup() {
  keepAwake(false);
  $('#lobby').hidden = true; $('#setup').hidden = false;
  wordmark($('.hero-word'));
  renderChips($('#setupChips')); refreshStart();
  $('#nameInput').focus();
}
$('#addForm').addEventListener('submit', (e) => {
  e.preventDefault(); const inp = $('#nameInput');
  if (state.players.some((p) => p.name.toLowerCase() === inp.value.trim().toLowerCase())) { toast('That name is taken — add an initial?'); return; }
  if (addPlayer(inp.value)) { audioCtx(); sfx.point(); inp.value = ''; renderChips($('#setupChips')); refreshStart(); }
  else if (state.players.length >= 12) toast('Twelve players max — that is already a stadium.');
  inp.focus();
});
$('#startParty').addEventListener('click', async () => {
  const btn = $('#startParty'); btn.disabled = true; btn.textContent = 'Asking for camera and mic…';
  await ensureMedia();
  btn.textContent = 'Start the party'; btn.disabled = false;
  const err = $('#permError');
  if (!media.micOk && !media.camOk) { err.hidden = false; err.textContent = media.error || 'No camera or microphone found.'; return; }
  err.hidden = true;
  sfx.success(); say(pick(['Let\'s get loud!', 'Party time!', 'Warm up those vocal cords!']));
  showLobby();
});

// ---------- lobby ----------
function wordmark(el) {
  const word = 'Yellfie'; const jit = [1, -0.6, 0.8, -0.9, 0.5, -0.7, 1];
  el.innerHTML = [...word].map((ch, i) => `<span style="--j:${jit[i]}">${ch}</span>`).join('');
}
function showLobby() {
  keepAwake(state.settings.keepAwake !== false);
  $('#setup').hidden = true; $('#lobby').hidden = false;
  wordmark($('#lobbyWord')); renderLobby(); startLobbyMeter();
  if (!media.asked) ensureMedia().then(renderLobby);
}
function available(g) {
  const n = g.needs || [];
  if (!media.asked) return '';
  if (n.includes('mic') && !media.micOk) return 'Needs the microphone';
  if ((n.includes('face') || n.includes('pose') || n.includes('hands')) && !media.camOk) return 'Needs the camera';
  if (n.includes('speech') && !(window.SpeechRecognition || window.webkitSpeechRecognition)) return 'Needs Chrome, Edge or Safari';
  return '';
}
function renderLobby() {
  const lb = leaderboard(); const leadPts = lb[0]?.points || 0;
  $('#standings').innerHTML = lb.map((p, i) => `<span class="chip ${leadPts > 0 && p.points === leadPts ? 'lead' : ''}"><span class="av emoji" style="--c:${p.color}">${p.avatar}</span>${esc(p.name)}<span class="pts">${p.points}</span>${leadPts > 0 && p.points === leadPts ? '<span class="crown emoji" title="In the lead">👑</span>' : ''}</span>`).join('');
  const counts = { all: GAMES.length, voice: GAMES.filter((g) => g.kind === 'voice').length, camera: GAMES.filter((g) => g.kind === 'camera').length };
  const tabs = [['all', 'All games'], ['voice', '🎤 Voice'], ['camera', '📷 Camera']];
  $('#tabs').innerHTML = tabs.map(([k, l]) => `<button class="tab" role="tab" aria-selected="${filter === k}" data-f="${k}">${l}<span class="n">${counts[k]}</span></button>`).join('');
  $('#tabs').querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { filter = b.dataset.f; renderLobby(); }));
  const list = GAMES.filter((g) => filter === 'all' || g.kind === filter);
  $('#grid').innerHTML = list.map((g) => {
    const rec = state.records[g.id]; const why = available(g);
    return `<button class="tile" data-kind="${g.kind}" data-id="${g.id}" ${why ? 'disabled' : ''}>
      <div class="tile-head"><span class="big emoji">${g.emoji}</span><span class="kind">${g.kind === 'voice' ? '🎤 Voice' : '📷 Camera'}</span></div>
      <div class="tile-body"><h3>${esc(g.name)}</h3><p>${esc(g.tagline)}</p>
      ${why ? `<span class="warn">${why}</span>` : `<span class="record">${rec ? `Record: <b>${esc(fmt(g, rec.score))} ${esc(g.unit || '')}</b> by ${esc(rec.name)}` : 'No record yet'}</span>`}</div>
    </button>`;
  }).join('');
  $('#grid').querySelectorAll('.tile').forEach((t) => (t.onclick = () => launch([GAMES.find((g) => g.id === t.dataset.id)])));
}

async function launch(queue) {
  if (busy || !queue.length) return; busy = true;
  await ensureMedia(); stopLobbyMeter();
  try {
    let finished = false;
    for (let i = 0; i < queue.length; i++) {
      const action = await playGame(queue[i], { partyNext: queue[i + 1] || null });
      if (i === queue.length - 1 && action !== 'quit') finished = true;
      if (action !== 'next') break;
    }
    if (queue.length > 1 && finished) partyFinale();
  } finally {
    busy = false; renderLobby(); startLobbyMeter();
  }
}
function partyFinale() {
  const lb = leaderboard(); if (!lb.length) return;
  openBoard(`Party mode champion: ${lb[0].name}!`); confetti($('#confetti')); sfx.fanfare();
  say(`And the party champion is ${lb[0].name}!`);
}

$('#surprise').onclick = () => { const ok = GAMES.filter((g) => !available(g)); if (ok.length) launch([pick(ok)]); };
$('#partyMode').onclick = () => {
  const ok = GAMES.filter((g) => !available(g));
  // mix voice and camera games
  const v = sample(ok.filter((g) => g.kind === 'voice'), 3), c = sample(ok.filter((g) => g.kind === 'camera'), 3);
  const q = []; while ((v.length || c.length) && q.length < 5) { if (v.length) q.push(v.shift()); if (c.length && q.length < 5) q.push(c.shift()); }
  launch(sample(q, q.length));
};
$('#brandLink').onclick = (e) => { e.preventDefault(); };
$('#openBoard').onclick = () => openBoard();
$('#openSettings').onclick = () => openSettings();
$('#installApp').onclick = () => installApp();
function refreshInstall() { $('#installApp').hidden = pwa.installed || !(pwa.canPrompt || pwa.iosManual); }
onPwaChange(refreshInstall);
async function installApp() {
  if (pwa.canPrompt) { if (await promptInstall()) toast('Installed! Open Yellfie from your home screen or apps.'); return; }
  if (pwa.iosManual) modal(`<h2>Install on iPhone or iPad</h2>
    <ol class="howto" style="list-style:decimal;padding-left:1.4em">
      <li style="display:list-item">In Safari, tap the <b>Share</b> button <span class="emoji">⬆️</span> (bottom bar on iPhone, top bar on iPad).</li>
      <li style="display:list-item">Scroll down and tap <b>Add to Home Screen</b>.</li>
      <li style="display:list-item">Tap <b>Add</b>. Yellfie now opens full screen from its own icon.</li>
    </ol>`);
}
$('#openPlayers').onclick = () => openPlayers();
// browsers only let audio start after a tap or key press
['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => audioCtx(), { passive: true }));

// mic-reactive wordmark
let meterRaf = 0, volS = 0;
function startLobbyMeter() {
  cancelAnimationFrame(meterRaf);
  const tick = (now) => {
    meterRaf = requestAnimationFrame(tick);
    updateMic(now); const v = Math.max(0, mic.loud - 0.08) / 0.92; volS += (v - volS) * 0.35;
    document.documentElement.style.setProperty('--vol', volS.toFixed(3));
  };
  meterRaf = requestAnimationFrame(tick);
}
function stopLobbyMeter() { cancelAnimationFrame(meterRaf); document.documentElement.style.setProperty('--vol', 0); }

// ---------- modals ----------
function modal(html, onClose) {
  const host = $('#modalHost');
  host.innerHTML = `<div class="modal-back"><div class="card modal" role="dialog" aria-modal="true">${html}<button class="btn btn-icon close" data-close aria-label="Close">✕</button></div></div>`;
  const back = host.firstElementChild;
  const close = () => { host.innerHTML = ''; removeEventListener('keydown', onEsc); onClose?.(); renderLobby(); };
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onEsc);
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  back.querySelector('[data-close]').focus();
  return { el: back, close };
}

function openBoard(title = 'Leaderboard') {
  const lb = leaderboard();
  const hist = state.history.slice(0, 12).map((h) => {
    const g = GAMES.find((x) => x.id === h.game); const w = playerById(h.results[0]?.playerId);
    const top = h.results[0]?.score || 0;
    return `<li><span class="emoji">${g?.emoji || '🎮'}</span> <b>${esc(g?.name || h.game)}</b> — ${top > 0 ? `won by ${esc(w?.name || '?')} (${esc(g ? fmt(g, top) : top)} ${esc(g?.unit || '')})` : 'nobody scored'}</li>`;
  }).join('');
  const photos = gallery.slice().reverse().slice(0, 24).map((s, i) => `<figure class="snap" style="--r:${((i * 37) % 7) - 3}deg"><img src="${s.img}" alt="${esc(s.label || 'Photo')}"><figcaption class="cap"><span class="emoji">${s.emoji || '📸'}</span><span>${esc(playerById(s.playerId)?.name || '')}</span></figcaption><a href="${s.img}" download="yellfie-${i + 1}.jpg">Save photo</a></figure>`).join('');
  modal(`<h2>${esc(title)}</h2>
    <table class="lb-table"><thead><tr><th>Player</th><th class="num">Points</th><th class="num">Wins</th><th class="num">Games</th></tr></thead>
    <tbody>${lb.map((p, i) => `<tr><td><span class="who"><span class="av emoji" style="--c:${p.color}">${p.avatar}</span>${esc(p.name)}${i === 0 && p.points > 0 ? ' <span class="emoji">👑</span>' : ''}</span></td><td class="num"><b>${p.points}</b></td><td class="num">${p.wins}</td><td class="num">${p.played}</td></tr>`).join('')}</tbody></table>
    <p class="privacy" style="text-align:left;margin-top:8px">Each game gives 10 points for 1st, 7 for 2nd, 5 for 3rd, 3 for 4th, 2 for 5th and 1 for everyone else.</p>
    <h3>Recent games</h3>${hist ? `<ul class="history">${hist}</ul>` : '<p class="empty-note">No games played yet. Pick one!</p>'}
    <h3>Photo booth</h3>${photos ? `<div class="snaps" style="justify-content:flex-start">${photos}</div>` : '<p class="empty-note">Camera games save funny photos here. They vanish when you close the tab.</p>'}`);
}

function openPlayers() {
  const m = modal(`<h2>Players</h2>
    <form class="add-row" id="mAdd"><label class="sr-only" for="mName">Player name</label><input id="mName" maxlength="16" placeholder="New player's name"><button class="btn btn-pink">Add player</button></form>
    <div class="chips" id="mChips"></div>
    <p class="privacy" style="text-align:left">Tap an animal to change it. Removing a player keeps everyone else's points.</p>`);
  const host = m.el.querySelector('#mChips'); renderChips(host);
  m.el.querySelector('#mAdd').onsubmit = (e) => { e.preventDefault(); const i = m.el.querySelector('#mName'); if (addPlayer(i.value)) { i.value = ''; renderChips(host); } i.focus(); };
}

function openSettings() {
  const s = state.settings;
  const m = modal(`<h2>Settings</h2>
    <div class="row"><label for="sTts">Announcer voice<small>Reads out whose turn it is and who won.</small></label><input type="checkbox" class="switch" id="sTts" ${s.tts ? 'checked' : ''}></div>
    <div class="row"><label for="sSfx">Sound effects</label><input type="checkbox" class="switch" id="sSfx" ${s.sfx ? 'checked' : ''}></div>
    <div class="row"><label for="sVol">Game volume</label><input type="range" id="sVol" min="0" max="1" step="0.05" value="${s.gameVolume}"></div>
    <div class="row"><label for="sSens">Mic sensitivity<small>Raise it if the bird won't fly. Lower it in a noisy room.</small></label><input type="range" id="sSens" min="1" max="10" step="1" value="${s.micSens}"></div>
    <div class="row"><label>Mic check<small>Say something — the bar should jump.</small></label><div class="meter" id="sMeter"><i></i></div></div>
    <div class="row"><label>Camera check</label><div class="cam-test" id="sCam"></div></div>
    <div class="row"><label for="sAwake">Keep screen awake<small id="sAwakeNote">${esc(wakeStatus())}</small></label><input type="checkbox" class="switch" id="sAwake" ${s.keepAwake !== false ? 'checked' : ''}></div>
    <div class="row"><label for="sOutl">Show tracking outlines<small>Draws what the camera sees: your hands, face and arms. Helps you aim.</small></label><input type="checkbox" class="switch" id="sOutl" ${s.outlines !== false ? 'checked' : ''}></div>
    <h3>App</h3>
    <div class="row"><label>Install as an app<small id="sInstallNote">${esc(installNote())}</small></label>${pwa.canPrompt || pwa.iosManual ? '<button class="btn btn-mint" id="sInstall">Install</button>' : ''}</div>
    ${pwa.offlineCapable ? `<div class="row"><label>Offline play<small id="sOfflineNote">Checking…</small></label><button class="btn" id="sOffline" hidden>Download for offline</button></div>` : ''}
    <h3>Challenges in a round</h3>
    <div class="row"><label>For ${GAMES.filter((g) => g.variety).length} games with set challenges<small>${esc(GAMES.filter((g) => g.variety).map((g) => g.name).join(', '))}. "Same" is fairest, "different" keeps it fresh. You can also switch it on each game's start screen.</small></label>
      <div class="seg" id="sMode" role="group" aria-label="Challenges in a round">${[['mixed', 'Different'], ['same', 'Same']].map(([k, l]) => `<button type="button" data-mode="${k}" aria-pressed="${(state.settings.roundMode || 'mixed') === k && !Object.keys(state.settings.gameModes || {}).length}">${l}</button>`).join('')}</div></div>
    <h3>Party data</h3>
    <div class="row"><label>Reset scores<small>Keeps the players, wipes points, records and photos.</small></label><button class="btn" id="sReset">Reset scores</button></div>
    <div class="row"><label>End the party<small>Removes every player and score from this browser.</small></label><button class="btn danger" id="sEnd">End party</button></div>`,
  () => { cancelAnimationFrame(raf2); });
  const el = m.el; let raf2 = 0;
  el.querySelector('#sTts').onchange = (e) => { s.tts = e.target.checked; save(); if (s.tts) say('Announcer on!'); };
  el.querySelector('#sSfx').onchange = (e) => { s.sfx = e.target.checked; save(); sfx.coin(); };
  el.querySelector('#sOutl').onchange = (e) => { s.outlines = e.target.checked; save(); };
  el.querySelector('#sInstall')?.addEventListener('click', () => { m.close(); installApp(); });
  const offNote = el.querySelector('#sOfflineNote'), offBtn = el.querySelector('#sOffline');
  const showOffline = (s) => {
    if (!offNote) return;
    const ready = s.total && s.saved === s.total;
    offNote.textContent = ready ? 'Ready. Every game works without internet.' : `Voice games already work offline. Camera games need their trackers saved first (about 32 MB, ${s.saved} of ${s.total} saved). Each one is also saved the first time you play it.`;
    offBtn.hidden = ready;
  };
  if (offNote) offlineStatus().then(showOffline).catch(() => (offNote.textContent = 'Not available in this browser.'));
  offBtn?.addEventListener('click', async () => {
    offBtn.disabled = true;
    try { showOffline(await downloadTrackers((f) => (offBtn.textContent = `Downloading… ${Math.round(f * 100)}%`))); toast('Saved. Camera games now work offline.'); }
    catch (e) { offNote.textContent = 'Download failed. Check your connection and try again.'; }
    offBtn.disabled = false; offBtn.textContent = 'Download for offline';
  });
  el.querySelector('#sAwake').onchange = (e) => { s.keepAwake = e.target.checked; save(); keepAwake(s.keepAwake); setTimeout(() => (el.querySelector('#sAwakeNote').textContent = wakeStatus()), 400); };
  el.querySelector('#sVol').oninput = (e) => { s.gameVolume = +e.target.value; save(); audioCtx(); };
  el.querySelector('#sVol').onchange = () => sfx.coin();
  el.querySelector('#sSens').oninput = (e) => { s.micSens = +e.target.value; save(); };
  el.querySelectorAll('#sMode [data-mode]').forEach((b) => (b.onclick = () => {
    setDefaultMode(b.dataset.mode); sfx.tick();
    el.querySelectorAll('#sMode [data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    toast(b.dataset.mode === 'same' ? 'Everyone in a round now gets the same challenges.' : 'Every player now gets their own challenges.');
  }));
  el.querySelector('#sReset').onclick = () => { if (confirmBtn(el.querySelector('#sReset'), 'Tap again to reset')) { resetScores(); m.close(); toast('Scores reset. Fresh start!'); } };
  el.querySelector('#sEnd').onclick = () => { if (confirmBtn(el.querySelector('#sEnd'), 'Tap again to end')) { endParty(); m.close(); stopLobbyMeter(); showSetup(); toast('Party over. Thanks for playing!'); } };
  const meter = el.querySelector('#sMeter i');
  const tick = () => { raf2 = requestAnimationFrame(tick); meter.style.width = `${Math.round(Math.max(mic.level, mic.loud * 0.8) * 100)}%`; };
  tick();
  const camBox = el.querySelector('#sCam');
  if (vision.camReady && vision.video?.srcObject) { const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = vision.video.srcObject; v.play().catch(() => {}); camBox.append(v); }
  else camBox.innerHTML = '<p style="color:#fff;padding:10px;font-size:.85rem">Camera is off</p>';
}
function installNote() {
  if (pwa.installed) return 'Installed. You are using the app version.';
  if (pwa.canPrompt) return 'Adds Yellfie to your home screen or apps, opens full screen and works offline.';
  if (pwa.iosManual) return 'Adds Yellfie to your home screen and opens it full screen.';
  return "Use your browser's menu: Install app, or Add to Home Screen.";
}
function confirmBtn(btn, msg) { if (btn.dataset.armed) return true; btn.dataset.armed = '1'; btn.textContent = msg; setTimeout(() => { delete btn.dataset.armed; }, 3000); return false; }

let toastT = 0;
function toast(msg) {
  let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600);
}

// ---------- boot ----------
initEngine();
initPwa(); refreshInstall();
if (SIM) window.__yf.engine = debug;
if (state.players.length) showLobby(); else showSetup();
