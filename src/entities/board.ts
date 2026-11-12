import Phaser from 'phaser';
import { pointAt, type Point } from '../core/path';
import { createRng, nextFloat } from '../core/rng';
import type { Level } from '../core/simulation';
import type { SpriteName } from './sprites';
import { GROUND_SCALE, PATH_WIDTH, SLOT_RADIUS } from './styles';

const ROAD_COLOR = 0xe2a366;
const ROAD_EDGE_COLOR = 0x8a5a33;

/** Room kept clear at the top and bottom for the status bar and the hero cards. */
const INTERFACE_TOP = 78;
const INTERFACE_BOTTOM = 70;

/** What grows on the grass, and how often. Trees are drawn larger. */
const DECORATIONS: readonly { sprite: SpriteName; weight: number; scale: number }[] = [
  { sprite: 'grass-tuft', weight: 34, scale: 2 },
  { sprite: 'grass-flowers', weight: 16, scale: 2 },
  { sprite: 'tree-pine', weight: 16, scale: 2.5 },
  { sprite: 'tree-round', weight: 14, scale: 2.5 },
  { sprite: 'bush', weight: 10, scale: 2 },
  { sprite: 'stones', weight: 6, scale: 2 },
  { sprite: 'mushrooms', weight: 4, scale: 2 },
];

const DECORATION_ATTEMPTS = 150;
/** A fixed seed: the map looks the same in every game. */
const DECORATION_SEED = 20;

/** Draws the parts of the map that never change: ground, scenery, road and build slots. */
export function drawBoard(scene: Phaser.Scene, level: Level): void {
  scene.add
    .tileSprite(0, 0, level.width, level.height, 'grass')
    .setOrigin(0)
    .setTileScale(GROUND_SCALE)
    .setDepth(-3);
  scatterDecorations(scene, level);
  drawPath(scene, level);
  drawBuildSlots(scene, level);
}

/** Scenery only goes where nothing happens: off the road, the slots and the interface. */
function scatterDecorations(scene: Phaser.Scene, level: Level): void {
  const rng = createRng(DECORATION_SEED);
  const roadSamples: Point[] = [];
  for (const path of level.paths) {
    for (let distance = 0; distance <= path.length; distance += 12) {
      roadSamples.push(pointAt(path, distance));
    }
  }
  const isClear = (x: number, y: number): boolean => {
    if (y < INTERFACE_TOP || y > level.height - INTERFACE_BOTTOM) return false;
    if (roadSamples.some((p) => Math.hypot(p.x - x, p.y - y) < PATH_WIDTH / 2 + 26)) return false;
    if (level.buildSlots.some((p) => Math.hypot(p.x - x, p.y - y) < SLOT_RADIUS + 26)) return false;
    return !level.heroes.some((p) => Math.hypot(p.x - x, p.y - y) < 34);
  };

  const totalWeight = DECORATIONS.reduce((sum, decoration) => sum + decoration.weight, 0);
  for (let attempt = 0; attempt < DECORATION_ATTEMPTS; attempt++) {
    const x = Math.round(nextFloat(rng) * level.width);
    const y = Math.round(nextFloat(rng) * level.height);
    let roll = nextFloat(rng) * totalWeight;
    const decoration = DECORATIONS.find((candidate) => (roll -= candidate.weight) < 0)!;
    if (!isClear(x, y)) continue;
    scene.add.image(x, y, decoration.sprite).setScale(decoration.scale).setDepth(-1);
  }
}

function drawPath(scene: Phaser.Scene, level: Level): void {
  const roads = level.paths.map((path) =>
    path.points.map((p) => new Phaser.Math.Vector2(p.x, p.y)),
  );
  const graphics = scene.add.graphics().setDepth(-2);
  // Every border first, then every road on top, so roads that meet join cleanly.
  for (const points of roads) strokeRoad(graphics, points, PATH_WIDTH + 8, ROAD_EDGE_COLOR);
  for (const points of roads) strokeRoad(graphics, points, PATH_WIDTH, ROAD_COLOR);
}

function strokeRoad(
  graphics: Phaser.GameObjects.Graphics,
  points: Phaser.Math.Vector2[],
  width: number,
  color: number,
): void {
  graphics.lineStyle(width, color, 1);
  graphics.strokePoints(points);
  // Circles round the corners that thick line joins leave open.
  graphics.fillStyle(color, 1);
  for (const point of points) graphics.fillCircle(point.x, point.y, width / 2);
}

function drawBuildSlots(scene: Phaser.Scene, level: Level): void {
  const graphics = scene.add.graphics().setDepth(1);
  for (const point of level.buildSlots) {
    graphics.fillStyle(0x2f4a22, 0.45);
    graphics.fillCircle(point.x, point.y, SLOT_RADIUS);
    graphics.lineStyle(2, 0xf4f1e8, 0.75);
    graphics.strokeCircle(point.x, point.y, SLOT_RADIUS);
    graphics.lineBetween(point.x - 6, point.y, point.x + 6, point.y);
    graphics.lineBetween(point.x, point.y - 6, point.x, point.y + 6);
  }
}
