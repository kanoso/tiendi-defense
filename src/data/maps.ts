import { createPath } from '../core/path';
import type { Level } from '../core/simulation';
import { GAME_WIDTH, sharedRules, standardWaves } from './rules';

export interface GameMap {
  /** Stable name used in saved progress and in the address bar. Never rename one. */
  id: string;
  /** Name shown to the player. */
  name: string;
  /** One line for the map picker. */
  blurb: string;
  level: Level;
}

// Roads start and end 30 px outside the 960 x 540 map, so enemies walk in and out.
const OFF_LEFT = -30;
const OFF_RIGHT = GAME_WIDTH + 30;

/** One winding road. The map the tutorial is played on. */
const meadow: GameMap = {
  id: 'meadow',
  name: 'Pradera',
  blurb: 'Un solo camino con curvas amplias.',
  level: {
    ...sharedRules,
    waves: standardWaves,
    paths: [
      createPath([
        { x: OFF_LEFT, y: 110 },
        { x: 250, y: 110 },
        { x: 250, y: 400 },
        { x: 520, y: 400 },
        { x: 520, y: 170 },
        { x: 780, y: 170 },
        { x: 780, y: 440 },
        { x: OFF_RIGHT, y: 440 },
      ]),
    ],
    heroes: [
      { type: 'warrior', x: 250, y: 300 },
      { type: 'archer', x: 345, y: 215 },
      { type: 'mage', x: 345, y: 355 },
      { type: 'support', x: 330, y: 285 },
    ],
    buildSlots: [
      { x: 120, y: 180 },
      { x: 325, y: 130 },
      { x: 440, y: 320 },
      { x: 385, y: 452 },
      { x: 600, y: 300 },
      { x: 650, y: 100 },
      { x: 700, y: 300 },
      { x: 860, y: 370 },
    ],
  },
};

/** One road, entering from the right and folding back on itself. */
const canyon: GameMap = {
  id: 'canyon',
  name: 'Desfiladero',
  blurb: 'El enemigo entra por la derecha y el camino se pliega sobre sí mismo.',
  level: {
    ...sharedRules,
    // Its long folds keep enemies under fire for longer, so they come tougher.
    waveHpGrowth: 0.04,
    waves: standardWaves,
    paths: [
      createPath([
        { x: OFF_RIGHT, y: 90 },
        { x: 700, y: 90 },
        { x: 700, y: 300 },
        { x: 420, y: 300 },
        { x: 420, y: 120 },
        { x: 180, y: 120 },
        { x: 180, y: 430 },
        { x: OFF_LEFT, y: 430 },
      ]),
    ],
    heroes: [
      { type: 'warrior', x: 700, y: 200 },
      { type: 'archer', x: 775, y: 200 },
      { type: 'mage', x: 640, y: 255 },
      { type: 'support', x: 765, y: 285 },
    ],
    buildSlots: [
      { x: 840, y: 160 },
      { x: 620, y: 190 },
      { x: 500, y: 205 },
      { x: 560, y: 380 },
      { x: 300, y: 200 },
      { x: 260, y: 330 },
      { x: 90, y: 330 },
      { x: 780, y: 380 },
    ],
  },
};

// The two roads of the crossroads meet at (330, 320) and share the rest of the way.
const SHARED_STRETCH = [
  { x: 330, y: 320 },
  { x: 620, y: 320 },
  { x: 620, y: 150 },
  { x: 820, y: 150 },
  { x: 820, y: 400 },
  { x: OFF_RIGHT, y: 400 },
];

/** Two entrances that merge. Wave groups alternate between them. */
const crossroads: GameMap = {
  id: 'crossroads',
  name: 'Encrucijada',
  blurb: 'Dos entradas que se unen: hay que repartir la defensa.',
  level: {
    ...sharedRules,
    waves: standardWaves.map((wave) => wave.map((group, index) => ({ ...group, path: index % 2 }))),
    paths: [
      createPath([{ x: OFF_LEFT, y: 140 }, { x: 330, y: 140 }, ...SHARED_STRETCH]),
      createPath([
        { x: OFF_LEFT, y: 430 },
        { x: 160, y: 430 },
        { x: 160, y: 320 },
        ...SHARED_STRETCH,
      ]),
    ],
    heroes: [
      { type: 'warrior', x: 450, y: 320 },
      { type: 'archer', x: 410, y: 395 },
      { type: 'mage', x: 570, y: 270 },
      { type: 'support', x: 495, y: 268 },
    ],
    buildSlots: [
      { x: 200, y: 220 },
      { x: 420, y: 230 },
      { x: 250, y: 400 },
      { x: 90, y: 330 },
      { x: 530, y: 220 },
      { x: 480, y: 400 },
      { x: 720, y: 250 },
      { x: 900, y: 300 },
    ],
  },
};

/** In the order they are played: winning one opens the next. */
export const MAPS: readonly GameMap[] = [meadow, canyon, crossroads];

export const MAP_IDS: readonly string[] = MAPS.map((map) => map.id);

/** The map with that id, or the first one when the id is unknown. */
export function findMap(id: string | null | undefined): GameMap {
  return MAPS.find((map) => map.id === id) ?? MAPS[0];
}
