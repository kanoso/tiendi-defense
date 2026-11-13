import Phaser from 'phaser';
import { FRAME_SPACING, IDLE_FPS, LOOP_FRAMES, UNIT_SHEETS, type UnitName } from './units';

/** Every still image the game draws. The name is both the texture key and the file name. */
export const SPRITES = [
  'tower-base',
  'icon-archery',
  'icon-cannon',
  'icon-ice',
  'icon-arcane',
  'grass',
  'grass-tuft',
  'grass-flowers',
  'tree-pine',
  'tree-round',
  'bush',
  'mushrooms',
  'stones',
] as const;

export type SpriteName = (typeof SPRITES)[number];

const UNITS = Object.keys(UNIT_SHEETS) as UnitName[];

/** Call from the scene's `preload`. Heroes and enemies are strips of frames. */
export function loadSprites(scene: Phaser.Scene): void {
  for (const name of SPRITES) scene.load.image(name, `assets/sprites/${name}.png`);
  for (const name of UNITS) {
    const { frameWidth, frameHeight } = UNIT_SHEETS[name];
    scene.load.spritesheet(name, `assets/sprites/${name}.png`, { frameWidth, frameHeight, spacing: FRAME_SPACING });
  }
}

/**
 * The art is 16 px pixel art drawn several times larger. Without this it would
 * be smoothed into a blur. Only the sprites: text stays smooth.
 */
export function keepSpritesCrisp(scene: Phaser.Scene): void {
  for (const name of [...SPRITES, ...UNITS]) {
    scene.textures.get(name).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}

/** Key of a unit's idle loop, made by `createIdleAnimations`. */
export function idleAnimation(name: UnitName): string {
  return `${name}-idle`;
}

/**
 * Idle loops on the clock, for screens without a game running (the menu).
 * During a game the frames follow game ticks instead: see `unitFrame`.
 */
export function createIdleAnimations(scene: Phaser.Scene): void {
  for (const name of UNITS) {
    const key = idleAnimation(name);
    if (scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(name, { start: 0, end: LOOP_FRAMES - 1 }),
      frameRate: IDLE_FPS,
      repeat: -1,
    });
  }
}
