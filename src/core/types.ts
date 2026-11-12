import type { Path, Point } from './path';
import type { Rng } from './rng';
import type { EndlessRules, PendingSpawn, Wave } from './waves';

export const TICKS_PER_SECOND = 60;
export const STEP_MS = 1000 / TICKS_PER_SECOND;

// --- level definition: what a map and its units are, never changes in play ---

export interface EnemyType {
  maxHp: number;
  /** Pixels per second. */
  speed: number;
  /** Gold awarded when killed. */
  bounty: number;
  /** Lives lost when it reaches the exit. */
  livesCost: number;
  /** Damage per hit against the hero that blocks it. */
  damage: number;
  attackIntervalTicks: number;
  /** Experience shared with the heroes near it when it dies. */
  xp: number;
  /** Fraction of physical damage it shrugs off (0.4 = takes 60 %). Magic ignores it. */
  armor: number;
  /** Flying enemies cannot be blocked and are out of reach of ground-only attacks. */
  flying: boolean;
}

export type DamageType = 'physical' | 'magic';

export interface AbilityZone {
  durationTicks: number;
  /** Ticks between two pulses. Healing and damage happen on each pulse. */
  intervalTicks: number;
  /** Speed multiplier for the enemies inside. One means no slow. */
  slowFactor: number;
  /** Health restored to each hero inside on every pulse. */
  healAmount: number;
  /** Damage to each enemy inside on every pulse, of the ability's damage type. */
  damage: number;
}

export interface Ability {
  cooldownTicks: number;
  /** True when the player picks where it lands; false when it centers on the hero. */
  targeted: boolean;
  /** Furthest a targeted ability may land from the hero. */
  castRange: number;
  radius: number;
  damage: number;
  stunTicks: number;
  /** A lasting area left behind, if any. */
  zone: AbilityZone | null;
  damageType: DamageType;
  /** False for ground effects, which leave flying enemies untouched. */
  hitsFlying: boolean;
  /** Hero level from which it can be used. */
  unlockLevel: number;
}

export interface HeroType {
  /** Pixels per second. */
  moveSpeed: number;
  range: number;
  damage: number;
  attackIntervalTicks: number;
  maxHp: number;
  /** Enemies it can hold in place at once. Zero for heroes that do not block. */
  blockCount: number;
  /** Attacks also hit enemies this close to the target. Zero for single target. */
  splashRadius: number;
  /** Speed multiplier applied to enemies it hits. One means no slow. */
  slowFactor: number;
  slowTicks: number;
  /** Health restored to the most wounded ally in `healRange`. Zero for no healing. */
  healAmount: number;
  healIntervalTicks: number;
  healRange: number;
  /** In the order the player triggers them. May be empty. */
  abilities: readonly Ability[];
  damageType: DamageType;
  /** False for heroes whose attacks cannot reach flying enemies. */
  hitsFlying: boolean;
}

export interface TowerLevel {
  /** Gold to build (first level) or to upgrade into this level. */
  cost: number;
  damage: number;
  range: number;
  attackIntervalTicks: number;
  /** Attacks also hit enemies this close to the target. Zero for single target. */
  splashRadius: number;
  /** Speed multiplier applied to enemies it hits. One means no slow. */
  slowFactor: number;
  slowTicks: number;
  damageType: DamageType;
  /** False for towers whose attacks cannot reach flying enemies. */
  hitsFlying: boolean;
}

export interface TowerType {
  levels: readonly TowerLevel[];
}

export interface HeroSpawn {
  type: string;
  x: number;
  y: number;
}

export interface Level {
  width: number;
  height: number;
  /** Roads the enemies walk. Most maps have one; a wave group picks its own. */
  paths: readonly Path[];
  /** Scripted waves, in order. Empty in endless mode. */
  waves: readonly Wave[];
  /** How to keep making waves once the scripted ones run out. Null ends the game there. */
  endless: EndlessRules | null;
  /** Points for every wave survived. Kills score their bounty. */
  scorePerWave: number;
  startingGold: number;
  startingLives: number;
  /** Random speed variation per enemy, as a fraction (0.1 = ±10 %). */
  speedJitter: number;
  /** Extra enemy health per wave after the first, as a fraction of the base. */
  waveHpGrowth: number;
  enemyTypes: Readonly<Record<string, EnemyType>>;
  heroTypes: Readonly<Record<string, HeroType>>;
  /** Ticks a fallen hero waits before returning at its spawn point. */
  heroRespawnTicks: number;
  heroes: readonly HeroSpawn[];
  /** Heroes this close to a kill share its experience. */
  xpRange: number;
  /** Total experience needed for each level, starting with level 1 at zero. */
  xpThresholds: readonly number[];
  /** Extra health and damage per level above the first, as a fraction. */
  levelBonus: number;
  towerTypes: Readonly<Record<string, TowerType>>;
  /** Places where a tower may be built. A slot is identified by its index. */
  buildSlots: readonly Point[];
  /** Fraction of the gold invested in a tower that selling it gives back. */
  sellRefund: number;
}

// --- game state: everything that changes while playing ---

export interface Enemy {
  id: number;
  type: string;
  /** Index of the level path it walks. */
  path: number;
  /** Distance travelled along its path, in pixels. */
  distance: number;
  hp: number;
  /** Health it spawned with: its type's, grown by the wave it belongs to. */
  maxHp: number;
  speed: number;
  /** Id of the hero holding it in place, if any. */
  blockedBy: number | null;
  attackCooldownTicks: number;
  /** Ticks of slow left. While positive, it moves at `slowFactor` of its speed. */
  slowTicks: number;
  slowFactor: number;
  /** Ticks left unable to move or attack. */
  stunTicks: number;
}

/** Where and when something landed. Kept only so the renderer can draw it. */
export interface Shot {
  tick: number;
  x: number;
  y: number;
}

export interface Hero {
  id: number;
  type: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  hp: number;
  /** Ticks left until it returns. Zero while the hero is alive. */
  respawnTicks: number;
  xp: number;
  /** Starts at 1. */
  level: number;
  cooldownTicks: number;
  healCooldownTicks: number;
  /** Ticks until each ability is ready again, in the order of the hero type's abilities. */
  abilityCooldowns: number[];
  lastShot: Shot | null;
  lastHeal: Shot | null;
  lastCast: Cast | null;
}

/** A shot that came from an ability: which one, by its index on the hero. */
export interface Cast extends Shot {
  ability: number;
}

export interface Tower {
  id: number;
  slot: number;
  type: string;
  /** Index into the tower type's levels. */
  level: number;
  /** Total gold spent on it, used to compute the sale price. */
  invested: number;
  cooldownTicks: number;
  lastShot: Shot | null;
}

/** A lasting area left by an ability. */
export interface Zone extends AbilityZone {
  x: number;
  y: number;
  radius: number;
  ticksLeft: number;
  /** Ticks until the next pulse. */
  pulseCooldownTicks: number;
  damageType: DamageType;
  hitsFlying: boolean;
}

export type Phase = 'preparing' | 'wave' | 'won' | 'lost';

export interface GameState {
  tick: number;
  phase: Phase;
  /** Wave being fought, or the next one to start while preparing. */
  waveIndex: number;
  /** Ticks since the current wave started. */
  waveTick: number;
  spawnQueue: PendingSpawn[];
  nextEnemyId: number;
  enemies: Enemy[];
  heroes: Hero[];
  nextTowerId: number;
  towers: Tower[];
  zones: Zone[];
  lives: number;
  gold: number;
  score: number;
  rng: Rng;
}

/**
 * Everything a player can do. Input never touches the state directly: it is
 * queued as commands and applied by `step`, so the same command stream replays
 * identically on another machine.
 */
export type Command =
  | { type: 'startWave' }
  | { type: 'moveHero'; heroId: number; x: number; y: number }
  /**
   * `ability` is its index on the hero. `x` and `y` are where a targeted ability
   * lands; otherwise they are ignored.
   */
  | { type: 'useAbility'; heroId: number; ability: number; x: number; y: number }
  | { type: 'buildTower'; slot: number; tower: string }
  | { type: 'upgradeTower'; slot: number }
  | { type: 'sellTower'; slot: number };
