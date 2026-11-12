import type { CastEffectKind } from './abilityEffects';
import type { SpriteName } from './sprites';

// How things look and what they are called on screen. No game rules here.

export const FONT = 'system-ui, sans-serif';

export const PATH_WIDTH = 46;
export const HERO_RADIUS = 15;
export const SLOT_RADIUS = 18;

/** The sprites are 16 px tiles; these are how many times larger they are drawn. */
export const HERO_SCALE = 2;
export const TOWER_BASE_SCALE = 2.25;
export const TOWER_ICON_SCALE = 1.5;
export const GROUND_SCALE = 2;

/** How long a shot stays visible. */
export const SHOT_VISIBLE_TICKS = 6;

export const SHOT_COLOR = 0xfff3b0;
export const SPLASH_COLOR = 0xffb347;
export const SLOW_COLOR = 0x9be7ff;
export const STUN_COLOR = 0xffe066;
export const HEAL_COLOR = 0x7dff9b;
export const STORM_COLOR = 0xd980fa;
export const SELECTION_COLOR = 0xffe066;

/** `radius` is the size of the enemy for rings and health bars, in map pixels. */
export const ENEMY_STYLE: Record<string, { radius: number; sprite: SpriteName; scale: number }> = {
  soldier: { radius: 13, sprite: 'enemy-soldier', scale: 2 },
  runner: { radius: 10, sprite: 'enemy-runner', scale: 1.5 },
  armored: { radius: 14, sprite: 'enemy-armored', scale: 2 },
  flyer: { radius: 11, sprite: 'enemy-flyer', scale: 1.5 },
  boss: { radius: 22, sprite: 'enemy-boss', scale: 3 },
};

/** Keys that trigger a hero's abilities, in the order the hero type lists them. */
export const ABILITY_KEYS = ['Q', 'W'];

/**
 * `abilities` are the on-screen names and `effects` what each one looks like when
 * cast, both in the same order as the hero type's abilities.
 */
export const HERO_STYLE: Record<
  string,
  { color: number; sprite: SpriteName; name: string; abilities: string[]; effects: CastEffectKind[] }
> = {
  warrior: {
    color: 0xe8edf2,
    sprite: 'hero-warrior',
    name: 'Guerrero',
    abilities: ['Golpe sísmico', 'Segundo aliento'],
    effects: ['quake', 'zone'],
  },
  archer: {
    color: 0x6fcf4a,
    sprite: 'hero-archer',
    name: 'Arquera',
    abilities: ['Ráfaga', 'Tiro perforante'],
    effects: ['volley', 'pierce'],
  },
  mage: {
    color: 0xb37feb,
    sprite: 'hero-mage',
    name: 'Mago',
    abilities: ['Meteoro', 'Tormenta arcana'],
    effects: ['meteor', 'zone'],
  },
  support: {
    color: 0x7ef0e0,
    sprite: 'hero-support',
    name: 'Soporte',
    abilities: ['Zona de hielo', 'Congelación'],
    effects: ['zone', 'freeze'],
  },
};

/** `icon` sits on top of the shared stone base. */
export const TOWER_STYLE: Record<string, { name: string; icon: SpriteName }> = {
  archery: { name: 'Arquería', icon: 'icon-archery' },
  cannon: { name: 'Cañón', icon: 'icon-cannon' },
  ice: { name: 'Hielo', icon: 'icon-ice' },
  arcane: { name: 'Arcana', icon: 'icon-arcane' },
};
