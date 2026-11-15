import type { CastEffectKind } from './abilityEffects';
import type { SpriteName } from './sprites';
import type { UnitName } from './units';

// How things look and what they are called on screen. No game rules here.

export const FONT = 'system-ui, sans-serif';

export const PATH_WIDTH = 46;
export const HERO_RADIUS = 15;
export const SLOT_RADIUS = 18;

/** The sprites are 16 px pixel art; these are how many times larger they are drawn. */
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

/**
 * `radius` is the size of the enemy for rings and health bars, in map pixels.
 * Every enemy is drawn twice as large: the boss's art is already the biggest.
 */
export const ENEMY_STYLE: Record<string, { radius: number; sprite: UnitName; scale: number }> = {
  soldier: { radius: 13, sprite: 'enemy-soldier', scale: 2 },
  runner: { radius: 10, sprite: 'enemy-runner', scale: 2 },
  armored: { radius: 14, sprite: 'enemy-armored', scale: 2 },
  flyer: { radius: 11, sprite: 'enemy-flyer', scale: 2 },
  boss: { radius: 22, sprite: 'enemy-boss', scale: 2 },
  shaman: { radius: 13, sprite: 'enemy-shaman', scale: 2 },
  skeleton: { radius: 12, sprite: 'enemy-skeleton', scale: 2 },
  big_zombie: { radius: 21, sprite: 'enemy-big-zombie', scale: 2 },
  tiny_zombie: { radius: 9, sprite: 'enemy-tiny-zombie', scale: 2 },
  ogre: { radius: 21, sprite: 'enemy-ogre', scale: 2 },
};

/** Keys that trigger a hero's abilities, in the order the hero type lists them. */
export const ABILITY_KEYS = ['Q', 'W'];

/**
 * `abilities` are the on-screen names and `effects` what each one looks like when
 * cast, both in the same order as the hero type's abilities.
 */
export const HERO_STYLE: Record<
  string,
  { color: number; sprite: UnitName; name: string; abilities: string[]; effects: CastEffectKind[] }
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

/** Lightning that jumps from one enemy to the next. */
export const LIGHTNING_COLOR = 0xd9c2ff;
/** How an enemy frozen by an ice tower is coloured. */
export const FROZEN_TINT = 0x7fd4ff;

/** The colour that marks a tower specialized into each branch: its badge and the ring around it. */
export const BRANCH_STYLE: Record<string, { color: number }> = {
  ballesta: { color: 0xf0c060 },
  lluvia: { color: 0x9be36b },
  mortero: { color: 0xe08a4a },
  bombarda: { color: 0xff6a4d },
  ventisca: { color: 0xd8f4ff },
  escarcha: { color: 0x6fd3ff },
  rayo: { color: 0xc9a6ff },
  desintegrar: { color: 0xff7ad9 },
};

/** `icon` sits on top of the shared stone base. */
export const TOWER_STYLE: Record<string, { name: string; icon: SpriteName }> = {
  archery: { name: 'Arquería', icon: 'icon-archery' },
  cannon: { name: 'Cañón', icon: 'icon-cannon' },
  ice: { name: 'Hielo', icon: 'icon-ice' },
  arcane: { name: 'Arcana', icon: 'icon-arcane' },
};
