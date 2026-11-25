// Game registry. Each game is its own module; add a new one by importing it here.
import flappy from './flappy.js';
import pitch from './pitch-pilot.js';
import balloon from './balloon.js';
import roar from './roar.js';
import tightrope from './tightrope.js';
import clap from './clapback.js';
import twister from './twister.js';
import hop from './hophop.js';
import redlight from './redlight.js';
import dragon from './dragon.js';
import singback from './singback.js';
import blurt from './blurt.js';
import faces from './faces.js';
import pose from './pose.js';
import wall from './wall.js';
import fruit from './fruit.js';
import chomp from './chomp.js';
import stare from './stare.js';
import poker from './poker.js';
import simon from './simon.js';
import meteor from './meteor.js';
import facejumble from './facejumble.js';
import jigsaw from './jigsaw.js';
import header from './header.js';
import wings from './wings.js';
import freeze from './freeze.js';
import rps from './rps.js';
import fingers from './fingers.js';
import quest from './quest.js';

export const GAMES = [
  flappy, facejumble, quest, roar, jigsaw, faces, redlight, fruit, pitch, pose, dragon, header, balloon, chomp, singback,
  wings, hop, wall, clap, freeze, stare, tightrope, rps, poker, blurt, fingers, twister, simon, meteor,
];
