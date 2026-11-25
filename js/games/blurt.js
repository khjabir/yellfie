import { C, rand, blob, text, emoji, UI } from '../util.js';

const w = (s) => s.split(',').map((x) => x.trim());
const CATS = [
  { id: 'fruits', name: 'Fruits', e: '🍎', words: w('apple,banana,orange,mango,grape,strawberry,pineapple,watermelon,lemon,lime,cherry,peach,pear,plum,kiwi,papaya,guava,coconut,melon,apricot,fig,date,pomegranate,blueberry,raspberry,blackberry,lychee,jackfruit,avocado,grapefruit,tangerine,cranberry,passion fruit,dragon fruit,custard apple,gooseberry,nectarine,mulberry') },
  { id: 'animals', name: 'Animals', e: '🦁', words: w('dog,cat,lion,tiger,elephant,monkey,horse,cow,pig,sheep,goat,rabbit,mouse,rat,bear,wolf,fox,deer,giraffe,zebra,kangaroo,panda,koala,snake,frog,fish,shark,whale,dolphin,bird,eagle,parrot,owl,chicken,duck,penguin,crocodile,turtle,camel,donkey,buffalo,rhino,hippo,cheetah,leopard,gorilla,bat,squirrel,peacock,crow,pigeon,ant,bee,butterfly,spider,octopus,crab,lizard,goose,hen,ox,seal,otter,hamster') },
  { id: 'colours', name: 'Colours', e: '🎨', words: w('red,blue,green,yellow,orange,purple,pink,black,white,brown,grey,gold,silver,violet,indigo,maroon,turquoise,beige,cyan,magenta,navy,teal,lavender,cream,peach,crimson,scarlet,olive,tan,bronze') },
  { id: 'countries', name: 'Countries', e: '🌍', words: w('india,china,japan,france,germany,italy,spain,brazil,canada,mexico,russia,australia,egypt,kenya,nigeria,south africa,england,ireland,scotland,america,pakistan,bangladesh,nepal,sri lanka,thailand,vietnam,indonesia,malaysia,singapore,korea,turkey,greece,portugal,sweden,norway,denmark,finland,poland,netherlands,belgium,switzerland,austria,argentina,chile,peru,colombia,cuba,iran,iraq,saudi arabia,qatar,oman,kuwait,israel,new zealand,bhutan,maldives,ukraine,morocco,ghana') },
  { id: 'sports', name: 'Sports', e: '🏅', words: w('football,cricket,tennis,badminton,basketball,volleyball,hockey,baseball,rugby,golf,swimming,boxing,wrestling,cycling,running,chess,kabaddi,archery,skating,skiing,surfing,karate,judo,table tennis,gymnastics,rowing,sailing,fencing,squash,polo,handball,diving,shooting,weightlifting,athletics') },
  { id: 'body', name: 'Body parts', e: '🦵', words: w('head,hair,eye,ear,nose,mouth,lip,tooth,tongue,neck,shoulder,arm,elbow,wrist,hand,finger,thumb,chest,back,stomach,hip,leg,knee,ankle,foot,toe,heel,chin,cheek,forehead,eyebrow,nail,palm,thigh,waist') },
  { id: 'vegetables', name: 'Vegetables', e: '🥕', words: w('potato,tomato,onion,carrot,cabbage,spinach,pea,bean,corn,pumpkin,cucumber,garlic,ginger,chilli,pepper,broccoli,cauliflower,beetroot,radish,mushroom,lettuce,okra,eggplant,turnip,celery,zucchini,sweet potato,leek,drumstick,bitter gourd') },
];
// spoken variants that mean the same entry
const SAME = { gray: 'grey', usa: 'america', 'united states': 'america', soccer: 'football', brinjal: 'eggplant', aubergine: 'eggplant', capsicum: 'pepper', chili: 'chilli', chilly: 'chilli', 'lady finger': 'okra', 'ladies finger': 'okra', teeth: 'tooth', feet: 'foot', mice: 'mouse', geese: 'goose', oxen: 'ox', 'ping pong': 'table tennis', 'south korea': 'korea', uk: 'england', britain: 'england', holland: 'netherlands' };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// every list word found in what was heard (plurals and a few synonyms count once)
export function findWords(heard, list) {
  let t = ` ${heard.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ')} `;
  for (const [from, to] of Object.entries(SAME)) t = t.replace(new RegExp(`\\b${esc(from)}\\b`, 'g'), to);
  t = t.replace(/(\w{2,})ies\b/g, '$1y');
  const found = new Set();
  for (const word of list) if (new RegExp(`\\b${esc(word)}(?:e?s)?\\b`).test(t)) found.add(word);
  return found;
}

const SHOW = 2.4, GO = 15, DONE = 1.8, ROUNDS = 2;
export default {
  id: 'blurt', name: 'Blurt It!', emoji: '💬', kind: 'voice', needs: ['mic', 'speech'],
  tagline: 'Name as many things as you can before time runs out.',
  howTo: ['A category appears, like "Fruits".', 'Shout out as many as you can think of in 15 seconds. Each one the game hears is a point.', 'Two categories. No repeats, and no helping from the sofa.'],
  crowd: 'Everyone else: keep quiet, the game hears you too. Groaning at obvious ones you missed comes after.',
  ready: 'Get close to the microphone and speak clearly. This game uses your browser\'s speech recognition, which may send audio to the browser maker (Chrome sends it to Google).',
  unit: 'words',
  variety: 'categories',
  quip(s) { return s >= 24 ? 'A walking dictionary!' : s >= 14 ? 'Quick brain, quicker mouth.' : s >= 6 ? 'The mind went blank halfway, right?' : 'Brain freeze!'; },
  create(api) {
    const cats = (api.shared.cats ||= api.deal('cats', CATS, ROUNDS));
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let i = 0, phase = 'show', pt = 0, rec = null, alive = true, err = '', heard = '', found = new Set(), chips = [];
    function listen() {
      heard = ''; found = new Set(); chips = []; err = '';
      try {
        rec = new SR(); rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
        let done = ''; // text from recognition sessions that already ended (the browser restarts it now and then)
        rec.onresult = (e) => {
          heard = `${done} ${Array.from(e.results).map((r) => r[0].transcript).join(' ')}`;
          for (const word of findWords(heard, cats[i].words)) if (!found.has(word)) {
            found.add(word); api.add(1); api.sfx.point();
            chips.push({ word, x: rand(0.14, 0.86), y: rand(0.5, 0.82), rot: rand(-0.12, 0.12), t: 0 });
          }
        };
        rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') err = 'Speech recognition was blocked.'; else if (e.error === 'network') err = 'Speech recognition needs an internet connection.'; };
        rec.onend = () => { done = heard; if (alive && phase === 'go') { try { rec.start(); } catch { /* already running */ } } };
        rec.start();
      } catch (e) { err = 'Speech recognition is not available here.'; }
    }
    function stop() { try { if (rec) { rec.onend = null; rec.abort(); } } catch { /* ignore */ } rec = null; }
    return {
      update(dt) {
        pt += dt; for (const c of chips) c.t += dt;
        if (phase === 'show') { api.hint('Get ready…'); api.timer(null); if (pt >= SHOW) { phase = 'go'; pt = 0; api.hint(''); api.sfx.setDuck(1); api.sfx.go(); api.sfx.setDuck(0.3); listen(); } }
        else if (phase === 'go') {
          api.timer(1 - pt / GO); api.hint(err || (found.size ? '' : `Shout out ${cats[i].name.toLowerCase()}!`));
          if (pt >= GO || (err && pt > 3)) { stop(); phase = 'done'; pt = 0; api.timer(null); api.hint(''); api.sfx.setDuck(1); found.size >= 6 ? api.sfx.success() : api.sfx.point(); api.sfx.setDuck(0.3); api.banner(`${found.size} ${cats[i].name.toLowerCase()}!`, { color: C.mint, size: 80 * api.u, y: api.H * 0.3 }); }
        } else if (pt >= DONE) { i++; if (i >= ROUNDS) { api.end(); return; } phase = 'show'; pt = 0; chips = []; }
      },
      destroy() { alive = false; stop(); },
      draw(g, W, H) {
        const u = api.u, cat = cats[Math.min(i, ROUNDS - 1)];
        g.fillStyle = C.sky; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(255,255,255,.14)'; for (let y = 0, r = 0; y < H; y += 60 * u, r++) for (let x = r % 2 ? 30 * u : 0; x < W; x += 60 * u) { g.beginPath(); g.arc(x, y, 7 * u, 0, Math.PI * 2); g.fill(); }
        const top = Math.max(130 * u, 110), cw = Math.min(W * 0.8, 720 * u);
        blob(g, W / 2 - cw / 2, top, cw, 150 * u, 30 * u, C.cream, { lw: 6, shadow: 10 });
        emoji(g, cat.e, W / 2 - cw / 2 + 80 * u, top + 75 * u, 90 * u, Math.sin(performance.now() / 300) * 0.1);
        text(g, cat.name, W / 2 + 40 * u, top + 75 * u, { size: 76 * u, color: C.ink, stroke: null, maxWidth: cw - 180 * u });
        if (phase === 'show') text(g, `Round ${i + 1} of ${ROUNDS}`, W / 2, top + 200 * u, { size: 36 * u, color: C.cream });
        for (const c of chips) {
          const k = Math.min(1, c.t / 0.18), size = 30 * u; g.font = `400 ${size}px ${UI}`; const tw = g.measureText(c.word).width + 34 * u;
          g.save(); g.translate(c.x * W, c.y * H); g.rotate(c.rot); g.scale(0.5 + k * 0.5, 0.5 + k * 0.5);
          blob(g, -tw / 2, -26 * u, tw, 52 * u, 26 * u, C.sun, { lw: 4, shadow: 5 }); text(g, c.word, 0, 2 * u, { size, color: C.ink, stroke: null, font: UI, weight: '800' }); g.restore();
        }
        if (phase !== 'show') text(g, `${found.size}`, W - 110 * u, top + 230 * u, { size: 110 * u, color: C.sun });
      },
    };
  },
};
