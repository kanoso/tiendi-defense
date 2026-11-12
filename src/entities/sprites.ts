import Phaser from 'phaser';

/** Every image the game draws. The name is both the texture key and the file name. */
export const SPRITES = [
  'hero-warrior',
  'hero-archer',
  'hero-mage',
  'hero-support',
  'enemy-soldier',
  'enemy-runner',
  'enemy-armored',
  'enemy-flyer',
  'enemy-boss',
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

/** Call from the scene's `preload`. */
export function loadSprites(scene: Phaser.Scene): void {
  for (const name of SPRITES) scene.load.image(name, `assets/sprites/${name}.png`);
}

/**
 * The art is 16 px pixel art drawn several times larger. Without this it would
 * be smoothed into a blur. Only the sprites: text stays smooth.
 */
export function keepSpritesCrisp(scene: Phaser.Scene): void {
  for (const name of SPRITES) {
    scene.textures.get(name).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}
