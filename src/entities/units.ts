import type { Point } from '../core/path';
import { TICKS_PER_SECOND } from '../core/types';

// How heroes and enemies are animated and where their sprites stand. Rendering
// only: everything here is read from the game state, never written back.

/**
 * A unit's sprite strip: idle frames 0-3, run frames 4-7, then a hit frame (8)
 * if the character has one. Frames are `FRAME_SPACING` px apart.
 */
export interface UnitSheet {
  frameWidth: number;
  frameHeight: number;
  /** Rows from the highest opaque pixel (idle or run) down to the feet, which touch the bottom. */
  bodyRows: number;
  hasHit: boolean;
}

/** Transparent gap between frames, so a scaled frame never picks up its neighbour's edge. */
export const FRAME_SPACING = 1;

/** Measured from the 0x72 DungeonTileset II frames cut into `public/assets/sprites/`. */
export const UNIT_SHEETS = {
  'hero-warrior': { frameWidth: 16, frameHeight: 28, bodyRows: 22, hasHit: true },
  'hero-mage': { frameWidth: 16, frameHeight: 28, bodyRows: 21, hasHit: true },
  'hero-archer': { frameWidth: 16, frameHeight: 28, bodyRows: 17, hasHit: true },
  'hero-support': { frameWidth: 16, frameHeight: 23, bodyRows: 19, hasHit: false },
  'enemy-soldier': { frameWidth: 16, frameHeight: 23, bodyRows: 18, hasHit: false },
  'enemy-runner': { frameWidth: 16, frameHeight: 16, bodyRows: 12, hasHit: false },
  'enemy-armored': { frameWidth: 16, frameHeight: 23, bodyRows: 18, hasHit: false },
  'enemy-flyer': { frameWidth: 16, frameHeight: 16, bodyRows: 14, hasHit: false },
  'enemy-boss': { frameWidth: 32, frameHeight: 36, bodyRows: 34, hasHit: false },
  'enemy-shaman': { frameWidth: 16, frameHeight: 23, bodyRows: 17, hasHit: false },
  'enemy-skeleton': { frameWidth: 16, frameHeight: 16, bodyRows: 16, hasHit: false },
  'enemy-big-zombie': { frameWidth: 32, frameHeight: 36, bodyRows: 33, hasHit: false },
  'enemy-tiny-zombie': { frameWidth: 16, frameHeight: 16, bodyRows: 12, hasHit: false },
  'enemy-ogre': { frameWidth: 32, frameHeight: 36, bodyRows: 28, hasHit: false },
} as const satisfies Record<string, UnitSheet>;

export type UnitName = keyof typeof UNIT_SHEETS;

export const LOOP_FRAMES = 4;
const RUN_FIRST_FRAME = LOOP_FRAMES;
export const HIT_FRAME = LOOP_FRAMES * 2;

export const IDLE_FPS = 6;
export const RUN_FPS = 12;
export const IDLE_TICKS_PER_FRAME = TICKS_PER_SECOND / IDLE_FPS;
export const RUN_TICKS_PER_FRAME = TICKS_PER_SECOND / RUN_FPS;
/** How long the hit frame shows after the unit loses health. */
export const HIT_FLASH_TICKS = 12;
/** Ticks each unit's loop is shifted by its seed, so a crowd does not step in unison. */
const TICKS_PER_SEED = 7;

export function frameCount(sheet: UnitSheet): number {
  return sheet.hasHit ? HIT_FRAME + 1 : LOOP_FRAMES * 2;
}

export interface UnitPose {
  moving: boolean;
  /** Ticks since the unit last lost health, or null if it has not. */
  ticksSinceHit: number | null;
}

/**
 * The frame to show. It depends only on the game tick, so the animation stops
 * with a pause, speeds up with the game and waits with a shared game that waits.
 * `seed` (any whole number, such as the unit's id) sets where in its loop it is.
 */
export function unitFrame(sheet: UnitSheet, pose: UnitPose, tick: number, seed: number): number {
  const sinceHit = pose.ticksSinceHit;
  if (sheet.hasHit && sinceHit !== null && sinceHit >= 0 && sinceHit < HIT_FLASH_TICKS) return HIT_FRAME;
  const ticksPerFrame = pose.moving ? RUN_TICKS_PER_FRAME : IDLE_TICKS_PER_FRAME;
  const step = Math.floor((tick + seed * TICKS_PER_SEED) / ticksPerFrame);
  const inLoop = ((step % LOOP_FRAMES) + LOOP_FRAMES) % LOOP_FRAMES;
  return (pose.moving ? RUN_FIRST_FRAME : 0) + inLoop;
}

/** What a unit's view remembers to flash the hit frame: health last frame and its latest hit. */
export interface HitMemory {
  hp: number;
  hitTick: number | null;
}

/**
 * Updates the memory with the unit's health now. A drop in health is a hit.
 * A hit later than `tick` is forgotten: a shared game can be replaced by the
 * server's copy from a moment earlier, and must not replay it.
 */
export function trackHit(memory: HitMemory, hp: number, tick: number): HitMemory {
  if (hp < memory.hp) return { hp, hitTick: tick };
  const hitTick = memory.hitTick !== null && memory.hitTick > tick ? null : memory.hitTick;
  return { hp, hitTick };
}

export function ticksSinceHit(memory: HitMemory, tick: number): number | null {
  return memory.hitTick === null ? null : tick - memory.hitTick;
}

/**
 * Whether a tap at `tap` lands on a unit standing at `at`. Its body is a circle
 * of `bodyRadius` around the point, stretched upwards to reach a taller head;
 * taps up to `margin` outside it still count.
 */
export function tapsUnit(
  tap: Point,
  at: Point,
  sheet: UnitSheet,
  scale: number,
  bodyRadius: number,
  margin: number,
): boolean {
  const top = at.y - Math.max(0, headRise(sheet, scale) - bodyRadius);
  // The nearest point on the line from the top of the body down to the map point.
  const nearestY = Math.min(Math.max(tap.y, top), at.y);
  return Math.hypot(tap.x - at.x, tap.y - nearestY) <= bodyRadius + margin;
}

/**
 * How far below a unit's map point its feet are drawn: where the old 16 px
 * sprites, drawn twice as large and centred on the point, had theirs.
 */
export const FOOT_DROP = 16;

/** How far above its map point the top of a unit's body is drawn. */
export function headRise(sheet: UnitSheet, scale: number): number {
  return sheet.bodyRows * scale - FOOT_DROP;
}

// Units are drawn by where their feet are: the one lower on the screen is in
// front. Flyers hover above all of them. Everything stays between the towers
// (depth 2) and the hero numbers (3), under the marks drawn over the map (4).
const GROUND_DEPTH = { min: 2.1, max: 2.5 };
const FLYING_DEPTH = { min: 2.6, max: 2.9 };

/**
 * The depth to draw a unit whose feet are at `feetY`, on a map `mapHeight` tall.
 * Rounded to the pixel: every change of depth makes Phaser sort the whole
 * scene, so a unit drifting within a pixel must keep the same one.
 */
export function unitDepth(feetY: number, flying: boolean, mapHeight: number): number {
  const band = flying ? FLYING_DEPTH : GROUND_DEPTH;
  const down = Math.min(1, Math.max(0, Math.round(feetY) / mapHeight));
  return band.min + (band.max - band.min) * down;
}

// Bodies of killed enemies lie under every living unit, above the towers and shadows.
const REMAINS_DEPTH = { min: 2.02, max: 2.08 };
/** The dust of a zombie bursting: over the body it came from, under the small zombies it let out. */
export const BURST_DEPTH = 2.09;

/**
 * The depth to draw a killed enemy's body whose feet are at `feetY`: behind the
 * living, so what comes out of it (the small zombies a big one splits into)
 * shows in front. Among bodies, the one lower on the screen is in front.
 */
export function remainsDepth(feetY: number, mapHeight: number): number {
  const down = Math.min(1, Math.max(0, Math.round(feetY) / mapHeight));
  return REMAINS_DEPTH.min + (REMAINS_DEPTH.max - REMAINS_DEPTH.min) * down;
}

/** How far above its map point the middle of a unit's body is drawn. */
export function bodyCenterRise(sheet: UnitSheet, scale: number): number {
  return (sheet.bodyRows * scale) / 2 - FOOT_DROP;
}
