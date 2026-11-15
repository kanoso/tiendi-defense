import { createPath } from '../core/path';
import type { Level } from '../core/simulation';
import type { EndlessGroup } from '../core/waves';
import { fortressEndless, fortressWaves, swampEndless, swampWaves } from './mapWaves';
import { GAME_WIDTH, sharedRules, standardWaves } from './rules';

export interface GameMap {
  /** Stable name used in saved progress and in the address bar. Never rename one. */
  id: string;
  /** Name shown to the player. */
  name: string;
  /** One line for the map picker. */
  blurb: string;
  level: Level;
  /**
   * Groups this map adds to the shared endless schedule, such as enemies that
   * only it sends. Missing for none.
   */
  endlessExtras?: readonly EndlessGroup[];
  /**
   * Enemy health growth per wave in endless mode, when it has to be steeper
   * than the campaign's. Missing to keep the campaign's.
   */
  endlessHpGrowth?: number;
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
      // Blocked by rocks until the player pays to clear them.
      { x: 180, y: 330, clearCost: 150 },
      { x: 450, y: 240, clearCost: 200 },
      { x: 860, y: 250, clearCost: 250 },
      { x: 690, y: 390, clearCost: 300 },
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
      // Blocked by rocks until the player pays to clear them.
      { x: 110, y: 200, clearCost: 150 },
      { x: 400, y: 375, clearCost: 200 },
      { x: 640, y: 370, clearCost: 250 },
      { x: 240, y: 260, clearCost: 300 },
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
      // Blocked by rocks until the player pays to clear them.
      { x: 90, y: 220, clearCost: 150 },
      { x: 255, y: 262, clearCost: 200 },
      { x: 700, y: 100, clearCost: 250 },
      { x: 880, y: 220, clearCost: 300 },
    ],
  },
};

/**
 * One long road in three horizontal runs, so towers between two runs reach both.
 * The first map with branches, skeletons and shamans.
 */
const swamp: GameMap = {
  id: 'swamp',
  name: 'Pantano',
  blurb: 'Un camino largo entre aguas: esqueletos que se levantan y chamanes que curan.',
  endlessExtras: swampEndless,
  // Specialized towers outlast the campaign's growth: endless grows steeper here.
  endlessHpGrowth: 0.085,
  level: {
    ...sharedRules,
    towerBranches: true,
    // Its long road keeps enemies under fire for longer, so they come tougher.
    waveHpGrowth: 0.0675,
    waves: swampWaves,
    paths: [
      createPath([
        { x: OFF_LEFT, y: 110 },
        { x: 700, y: 110 },
        { x: 700, y: 270 },
        { x: 180, y: 270 },
        { x: 180, y: 430 },
        { x: OFF_RIGHT, y: 430 },
      ]),
    ],
    heroes: [
      { type: 'warrior', x: 450, y: 270 },
      { type: 'archer', x: 470, y: 205 },
      { type: 'mage', x: 420, y: 330 },
      { type: 'support', x: 380, y: 300 },
    ],
    buildSlots: [
      { x: 380, y: 190 },
      { x: 200, y: 190 },
      { x: 560, y: 190 },
      { x: 300, y: 350 },
      { x: 780, y: 200 },
      { x: 520, y: 350 },
      { x: 720, y: 350 },
      { x: 880, y: 340 },
      // Blocked by rocks until the player pays to clear them.
      { x: 90, y: 350, clearCost: 150 },
      { x: 100, y: 190, clearCost: 200 },
      { x: 620, y: 350, clearCost: 250 },
      { x: 290, y: 190, clearCost: 300 },
    ],
  },
};

// The fortress's two gates open on the same road across the top, one from each
// side. Both roads meet at (480, 120) and share the rest of the way.
const INNER_ROAD = [
  { x: 480, y: 120 },
  { x: 480, y: 290 },
  { x: 240, y: 290 },
  { x: 240, y: 430 },
  { x: OFF_RIGHT, y: 430 },
];

/** Two gates, west and east, whose roads meet before the walls. Every new enemy. */
const fortress: GameMap = {
  id: 'fortress',
  name: 'Fortaleza',
  blurb: 'Dos puertas, al oeste y al este, que se unen ante la muralla.',
  endlessExtras: fortressEndless,
  endlessHpGrowth: 0.0425,
  level: {
    ...sharedRules,
    towerBranches: true,
    // Two gates to cover from the first wave: enough for a tower at each.
    startingGold: 160,
    waves: fortressWaves,
    paths: [
      createPath([{ x: OFF_LEFT, y: 120 }, ...INNER_ROAD]),
      createPath([{ x: OFF_RIGHT, y: 120 }, ...INNER_ROAD]),
    ],
    heroes: [
      { type: 'warrior', x: 480, y: 200 },
      { type: 'archer', x: 520, y: 255 },
      { type: 'mage', x: 420, y: 330 },
      { type: 'support', x: 540, y: 300 },
    ],
    buildSlots: [
      { x: 400, y: 205 },
      { x: 160, y: 200 },
      { x: 800, y: 200 },
      { x: 560, y: 205 },
      { x: 620, y: 340 },
      { x: 330, y: 360 },
      { x: 800, y: 340 },
      { x: 150, y: 350 },
      // Blocked by rocks until the player pays to clear them.
      { x: 280, y: 205, clearCost: 150 },
      { x: 680, y: 270, clearCost: 200 },
      { x: 480, y: 360, clearCost: 250 },
      { x: 890, y: 210, clearCost: 300 },
    ],
  },
};

/** In the order they are played: winning one opens the next. */
export const MAPS: readonly GameMap[] = [meadow, canyon, crossroads, swamp, fortress];

export const MAP_IDS: readonly string[] = MAPS.map((map) => map.id);

/** The map with that id, or the first one when the id is unknown. */
export function findMap(id: string | null | undefined): GameMap {
  return MAPS.find((map) => map.id === id) ?? MAPS[0];
}
