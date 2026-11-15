import type { Point } from '../core/path';

// Procedural motion for the moments the sprite strips have no frames for:
// attacking, being hit, dying and falling. Rendering only, and every pose is a
// function of game ticks, so it freezes with a pause and follows the x2 speed.

const NO_OFFSET: Point = { x: 0, y: 0 };

/** Unit vector from `from` to `to`, or null when they are the same point. */
function direction(from: Point, to: Point): Point | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  return distance === 0 ? null : { x: dx / distance, y: dy / distance };
}

/** How long a lunge or a recoil lasts, out and back. */
export const ATTACK_MOTION_TICKS = 8;
/** How far a melee unit steps into its target. */
export const LUNGE_REACH = 5;
/** A ranged hero is pushed back a little by its own shot. */
export const RECOIL_REACH = -2;

/**
 * Where to draw a unit `ticksSince` ticks after it attacked `to`: moved `reach`
 * px towards it (away, if negative) at the peak, back on its spot at both ends.
 */
export function attackOffset(ticksSince: number | null, from: Point, to: Point, reach: number): Point {
  if (ticksSince === null || ticksSince < 0 || ticksSince >= ATTACK_MOTION_TICKS) return NO_OFFSET;
  const way = direction(from, to);
  if (!way) return NO_OFFSET;
  const amount = reach * Math.sin((Math.PI * ticksSince) / ATTACK_MOTION_TICKS);
  return { x: way.x * amount, y: way.y * amount };
}

/**
 * What an enemy's view remembers to spot its attacks: the simulation keeps no
 * record of them, but the cooldown starts over at each one.
 */
export interface AttackMemory {
  /** The hero holding it when last seen. */
  blockedBy: number | null;
  cooldown: number;
  attackTick: number | null;
}

export function startAttackMemory(blockedBy: number | null, cooldown: number): AttackMemory {
  return { blockedBy, cooldown, attackTick: null };
}

/**
 * Updates the memory with the enemy as it is now. A cooldown that went up while
 * the same hero held it is an attack: being stopped also resets the cooldown,
 * but then the hero holding it changes. The attack is dated from what is left
 * of the cooldown, which starts at `interval` on the attack's own tick. As with
 * hits, an attack later than `tick` is forgotten (a shared game was rewound).
 */
export function trackEnemyAttack(
  memory: AttackMemory,
  blockedBy: number | null,
  cooldown: number,
  interval: number,
  tick: number,
): AttackMemory {
  const attacked = blockedBy !== null && blockedBy === memory.blockedBy && cooldown > memory.cooldown;
  const kept = memory.attackTick !== null && memory.attackTick > tick ? null : memory.attackTick;
  return { blockedBy, cooldown, attackTick: attacked ? tick - (interval - cooldown) : kept };
}

/** How long a hit colours the unit. */
export const HIT_TINT_TICKS = 8;
/** The first ticks of it paint the unit white; the rest only redden it. */
const HIT_WHITE_TICKS = 3;
const HIT_RED = 0xff6b6b;

export interface Tint {
  /** True to paint the whole sprite in the colour, false to multiply by it. */
  fill: boolean;
  color: number;
}

export function hitTint(ticksSince: number | null): Tint | null {
  if (ticksSince === null || ticksSince < 0 || ticksSince >= HIT_TINT_TICKS) return null;
  return ticksSince < HIT_WHITE_TICKS ? { fill: true, color: 0xffffff } : { fill: false, color: HIT_RED };
}

export const KNOCKBACK_TICKS = 8;
export const KNOCKBACK_DISTANCE = 2;

/** A hit pushes the unit along `away` (any length) at once; it then eases back. */
export function knockbackOffset(ticksSince: number | null, away: Point | null): Point {
  if (ticksSince === null || ticksSince < 0 || ticksSince >= KNOCKBACK_TICKS || !away) return NO_OFFSET;
  const way = direction(NO_OFFSET, away);
  if (!way) return NO_OFFSET;
  const amount = KNOCKBACK_DISTANCE * (1 - ticksSince / KNOCKBACK_TICKS);
  return { x: way.x * amount, y: way.y * amount };
}

/** An attack that landed: where it came from, where it struck and how far around it hurts. */
export interface Strike {
  from: Point;
  at: Point;
  reach: number;
}

/** Where the hit on `target` most likely came from: the closest strike that reached it. */
export function hitSource(target: Point, strikes: readonly Strike[]): Point | null {
  let best: { from: Point; distance: number } | null = null;
  for (const strike of strikes) {
    const distance = Math.hypot(strike.at.x - target.x, strike.at.y - target.y);
    if (distance > strike.reach || (best && distance >= best.distance)) continue;
    best = { from: strike.from, distance };
  }
  return best?.from ?? null;
}

/** How long a killed enemy stays on the map: long enough for a player to see it go down. */
export const DEATH_TICKS = 75;
/** How long it takes to hit the ground. */
export const FALL_TICKS = 15;
/** It lies there, fully visible, until this tick, then fades away. */
export const FADE_FROM_TICK = 50;

export interface FallPose {
  /** Degrees, clockwise; ±90 lies on the ground. */
  angle: number;
  alpha: number;
  /** 0 standing (or hovering) to 1 on the ground: how much of a flyer's height is lost. */
  drop: number;
}

/** How far through its fall a unit is, speeding up like something dropping. */
function fallen(ticksSince: number): number {
  const t = Math.min(1, Math.max(0, ticksSince / FALL_TICKS));
  return t * t;
}

/** Falls on its back: away from the way it faces. */
function fallAngle(ticksSince: number, facingLeft: boolean): number {
  // `+ 0` turns a negative zero into a plain one.
  return (facingLeft ? 90 : -90) * fallen(ticksSince) + 0;
}

/** A killed enemy: it falls, lies there and fades away. */
export function deathPose(ticksSince: number, facingLeft: boolean): FallPose {
  const fade = (ticksSince - FADE_FROM_TICK) / (DEATH_TICKS - FADE_FROM_TICK);
  return {
    angle: fallAngle(ticksSince, facingLeft),
    alpha: 1 - Math.min(1, Math.max(0, fade)),
    drop: fallen(ticksSince),
  };
}

/** How long a fallen hero takes to go down before it waits at its spawn point. */
export const HERO_FALL_TICKS = 20;
/** How faded a fallen hero waits. */
export const DOWN_ALPHA = 0.3;

/** A hero going down, fading to the look of a fallen one. Null outside the fall. */
export function heroFallPose(ticksSince: number, facingLeft: boolean): FallPose | null {
  if (ticksSince < 0 || ticksSince >= HERO_FALL_TICKS) return null;
  return {
    angle: fallAngle(ticksSince, facingLeft),
    alpha: 1 - (1 - DOWN_ALPHA) * (ticksSince / HERO_FALL_TICKS),
    drop: fallen(ticksSince),
  };
}
