// Game registry. Each game is its own module; add a new one by importing it here.
import flappy from './flappy.js';
import pitch from './pitch-pilot.js';
import balloon from './balloon.js';
import roar from './roar.js';
import tightrope from './tightrope.js';
import clap from './clapback.js';
import twister from './twister.js';
import hop from './hophop.js';
import faces from './faces.js';
import pose from './pose.js';
import wall from './wall.js';
import fruit from './fruit.js';
import chomp from './chomp.js';
import stare from './stare.js';
import poker from './poker.js';
import simon from './simon.js';
import meteor from './meteor.js';

export const GAMES = [flappy, faces, roar, fruit, pitch, pose, balloon, chomp, hop, wall, clap, stare, tightrope, poker, twister, simon, meteor];
