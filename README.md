<p align="center"><img src="assets/logo.svg" width="180" alt="Yellfie logo"></p>

# Yellfie

**Party games you play with your voice, your face and your whole body.**

Yellfie turns a laptop's microphone and webcam into game controllers. Players enter their names, take turns in front of the screen, and fight for party points. Everything runs in the browser, with no server, no account and no database. Video and sound are analysed on the device and never uploaded.

## The games

### 🎤 Voice games

| Game | How it works |
| --- | --- |
| 🐤 **Flappy Holler** | Any sound lifts the bird; silence drops it. Fly through the gaps. |
| 🚀 **Pitch Pilot** | Calibrates to your lowest and highest note, then your hum pitch steers a rocket through asteroid gates. |
| 🎈 **Don't Pop It** | Blow / hum to inflate a balloon to the target ring, then go quiet to tie it off. Too much air = POP. Balloon 3 hides the ring. |
| 🦁 **Roar-o-Meter** | Three seconds of maximum ROAR on a carnival high-striker. Ring the bell at 880. |
| 🎶 **Tightrope Tenor** | Hold one steady note to walk a tightrope. Wobble off pitch or run out of breath and you fall. |
| 👏 **Clap Back** | Listen to a rhythm, clap it back. Timing is scored per beat. |
| 👅 **Tongue Twister Turbo** | Say the twister once, fast and accurately (uses the browser's speech recognition). |
| 🐸 **Hup Hop** | Short loud sounds make a frog jump over logs — stay quiet under the bees. |

### 📷 Camera games

| Game | How it works |
| --- | --- |
| 😜 **Make That Face** | Copy five emoji with your face (face-blendshape matching). Best moments are photographed. |
| 💃 **Strike a Pose** | Match a glowing arm pose drawn on top of you. Sometimes it's a YMCA medley. |
| 🧱 **Hole in the Wall** | A brick wall with a body-shaped hole rushes at you. Fit through or get smashed. |
| 🍉 **Fruit Karate** | Your index finger becomes a glowing sword (21-point hand tracking, both hands). Chop flying fruit, avoid bombs, combo multi-slices. |
| 🍩 **Chomp Champ** | Move your head and open your mouth to eat falling snacks. Avoid chilli and socks. |
| 👀 **Staring Contest** | Don't blink. The game throws flies, ghosts and fake-outs at you. |
| 😐 **Poker Face** | Don't smile. The screen adds googly eyes, a moustache and a clown nose while your friends follow silly prompts. |
| 🧙 **Simon Says** | Spoken commands checked with body and finger tracking. Only obey when Simon says so. |
| ☄️ **Meteor Dodge** | Steer a rocket with your head to dodge falling meteors. |

### Party features

- **Players and scores**: names and animal avatars, plus a party points table (10 / 7 / 5 / 3 / 2 / 1 per game). Scores, wins and records are saved in the browser's local storage until you reset scores or end the party in Settings.
- **Same or different challenges**: seven games have set challenges (faces, poses, walls, rhythms, twisters, Simon's commands, balloon sizes). Choose **Different for each player** (the default, keeps it fresh and stops copying) or **Same for everyone** (the fairest fight). Set the default in Settings, or switch it per game on the game's start screen or the podium before **Play again**. Either way, challenges you've already seen this party aren't repeated until the pool runs out. Action games such as Flappy Holler and Fruit Karate generate a new random level every turn, and turn order is shuffled each round.
- **Photo booth**: camera games snap your funniest moments. Photos stay in memory and disappear when the tab closes, and you can save any of them.
- **Party mode**: five random games back to back, mixing voice and camera, with a champion at the end. **Surprise me** picks one random game.
- **Announcer**: an optional spoken voice calls each turn and the winners. The mic-reactive logo bounces to the room's noise.
- **Crowd jobs**: each game gives the people who aren't playing something to do, so the whole room joins in.

## Run it

Browsers only allow camera and microphone access on `https://` or `localhost`, so serve the folder rather than double-clicking `index.html`:

```bash
cd party-games
npm start            # serves http://localhost:8080 (uses npx serve)
# or, no Node needed:
python3 -m http.server 8080
```

Open **http://localhost:8080**, add players, press **Start the party** and allow the camera and microphone.

**Best setup:** use a laptop on a table with the screen mirrored to a TV if you can. Stand about two steps back for body games and lean in for face games. Chrome or Edge gives the best results; Safari and Firefox work for everything except Tongue Twister Turbo in Firefox.

### Offline use

The face, body and hand trackers ([MediaPipe Tasks Vision](https://developers.google.com/mediapipe), Apache-2.0) are bundled in `vendor/`, so the app works without internet. If `vendor/` is missing (for example if you git-ignore it), the app automatically loads the same files from the jsDelivr and Google CDNs. To re-download them:

```bash
npm run vendor
```

## Settings

- **Mic sensitivity**: raise it if the bird won't fly; lower it in a loud room. Each voice game also measures the room's background noise during the 3-2-1 countdown.
- **Show tracking outlines** (on by default): draws what the camera tracks, such as your hand skeleton, face outline and arms, so you can see where you're aiming.
- **Announcer voice / sound effects / volume**: on/off toggles and a volume slider.
- **Reset scores** keeps the players. **End party** wipes everything.

## Project layout

```
index.html          app shell
css/style.css       all styles (design tokens at the top)
js/main.js          setup screen, lobby, modals, camera/mic permission
js/engine.js        turn flow: intro → ready → 3-2-1 → play → score → podium
js/mic.js           loudness, YIN pitch detection, clap/onset detection
js/vision.js        camera + MediaPipe face (blendshapes), body pose and 21-point hand tracking
js/sfx.js           synthesised sound effects + speech announcer
js/fx.js            particles, banners, shake, confetti
js/state.js         players, points, records (localStorage)
js/sim.js           developer mode (?sim) — keyboard/mouse stand in for mic + camera
js/games/*.js       one file per game
```

### Adding a game

Create `js/games/my-game.js` and register it in `js/games/index.js`:

```js
export default {
  id: 'mygame', name: 'My Game', emoji: '🎯', kind: 'voice' /* or 'camera' */,
  needs: ['mic'],               // 'mic' | 'face' | 'pose' | 'hands' | 'speech'
  tagline: 'One line shown on the tile', howTo: ['Step one', 'Step two'], crowd: 'What everyone else does',
  unit: 'points',
  variety: 'targets',           // optional: shows the same/different switch; use api.deal() + api.shared
  create(api) {
    return {
      update(dt) { if (api.mic.level > 0.5) api.add(1); if (api.time > 20) api.end(); },
      draw(g, W, H) { api.camera(g); /* canvas 2D drawing */ },
    };
  },
};
```

`api` gives you `mic` (level, loud, pitch, onset), `vision.face` (landmarks + 52 blendshapes), `vision.hands` (up to two hands, 21 points each; 8 is the index fingertip), `body()` (screen-side arms), `outlines` (whether to draw tracking outlines), `pt()` to map landmarks to the screen, `add/setScore/end`, `timer/hint/banner`, `fx`, `sfx`, `say`, `snap/keep` for photos, `deal(key, pool, n)` to pick challenges without repeats, and `shared`, which holds the round's content in "same" mode and starts empty for every turn in "different" mode (so `api.shared.x ||= api.deal(...)` does the right thing in both).

### Developer mode

Open `http://localhost:8080/?sim` to play without a camera or mic. Space is your voice (mouse height sets the pitch), C claps, number keys set arm poses, the mouse moves your head and hand, and S/O/B/W/K/U/D/F/P/L/Q pull faces.

## Privacy

Camera frames and microphone audio are processed locally by JavaScript and WebAssembly in your browser. Nothing is recorded or sent anywhere. The one exception is **Tongue Twister Turbo**: it uses the browser's built-in speech recognition, which in Chrome sends audio to Google to transcribe.

## License

MIT for the Yellfie code. MediaPipe files in `vendor/` are Apache-2.0. Fonts (Bagel Fat One, Gabarito) are SIL Open Font License.
