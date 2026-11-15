import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from '../core/types';
import {
  ATTACK_MOTION_TICKS,
  attackOffset,
  DEATH_TICKS,
  deathPose,
  DOWN_ALPHA,
  FADE_FROM_TICK,
  FALL_TICKS,
  HERO_FALL_TICKS,
  heroFallPose,
  HIT_TINT_TICKS,
  hitSource,
  hitTint,
  KNOCKBACK_DISTANCE,
  KNOCKBACK_TICKS,
  knockbackOffset,
  startAttackMemory,
  trackEnemyAttack,
} from './unitMotion';

const length = (point: { x: number; y: number }) => Math.hypot(point.x, point.y);

describe('attackOffset', () => {
  const from = { x: 100, y: 100 };
  const right = { x: 200, y: 100 };

  it('stays put with no attack, before it and once the motion is over', () => {
    expect(attackOffset(null, from, right, 5)).toEqual({ x: 0, y: 0 });
    expect(attackOffset(-1, from, right, 5)).toEqual({ x: 0, y: 0 });
    expect(attackOffset(ATTACK_MOTION_TICKS, from, right, 5)).toEqual({ x: 0, y: 0 });
  });

  it('lunges towards the target and comes back', () => {
    const half = Math.floor(ATTACK_MOTION_TICKS / 2);
    const out = attackOffset(half, from, right, 5);
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(0);
    expect(attackOffset(1, from, right, 5).x).toBeGreaterThan(0);
    expect(attackOffset(1, from, right, 5).x).toBeLessThan(out.x);
    expect(attackOffset(ATTACK_MOTION_TICKS - 1, from, right, 5).x).toBeLessThan(out.x);
  });

  it('starts from where the unit stands, so the attack does not jump', () => {
    expect(length(attackOffset(0, from, right, 5))).toBeCloseTo(0);
  });

  it('follows the direction of the target', () => {
    const out = attackOffset(ATTACK_MOTION_TICKS / 2, from, { x: 100, y: 0 }, 5);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(-5);
  });

  it('recoils away from the target with a negative reach', () => {
    expect(attackOffset(ATTACK_MOTION_TICKS / 2, from, right, -2).x).toBeCloseTo(-2);
  });

  it('does not move for a target on its own spot', () => {
    expect(attackOffset(3, from, from, 5)).toEqual({ x: 0, y: 0 });
  });
});

describe('trackEnemyAttack', () => {
  const interval = 60;

  it('sees no attack in an enemy that has just been stopped', () => {
    const memory = startAttackMemory(null, 0);
    // Blocking resets the cooldown: that is not an attack.
    expect(trackEnemyAttack(memory, 1, interval - 1, interval, 100).attackTick).toBeNull();
    expect(trackEnemyAttack(memory, 1, interval, interval, 100).attackTick).toBeNull();
  });

  it('spots an attack when the cooldown starts over, and dates it from the cooldown', () => {
    let memory = startAttackMemory(1, 3);
    memory = trackEnemyAttack(memory, 1, 2, interval, 100);
    expect(memory.attackTick).toBeNull();
    // Two ticks in one frame: it attacked at 101, then one tick went by.
    memory = trackEnemyAttack(memory, 1, interval - 1, interval, 102);
    expect(memory.attackTick).toBe(101);
  });

  it('keeps the last attack while the cooldown runs down', () => {
    let memory = trackEnemyAttack(startAttackMemory(1, 1), 1, interval, interval, 50);
    memory = trackEnemyAttack(memory, 1, interval - 5, interval, 55);
    expect(memory.attackTick).toBe(50);
  });

  it('sees no attack when a different hero holds it now', () => {
    const memory = trackEnemyAttack(startAttackMemory(1, 1), 2, interval, interval, 50);
    expect(memory.attackTick).toBeNull();
    expect(memory.blockedBy).toBe(2);
  });

  it('forgets an attack later than the game, as after a shared game is replaced', () => {
    const memory = trackEnemyAttack({ blockedBy: 1, cooldown: 10, attackTick: 990 }, 1, 9, interval, 900);
    expect(memory.attackTick).toBeNull();
  });
});

describe('hitTint', () => {
  it('flashes white first, then red, then nothing', () => {
    expect(hitTint(null)).toBeNull();
    expect(hitTint(-1)).toBeNull();
    expect(hitTint(0)).toEqual({ fill: true, color: 0xffffff });
    const late = hitTint(HIT_TINT_TICKS - 1);
    expect(late?.fill).toBe(false);
    expect(late?.color).not.toBe(0xffffff);
    expect(hitTint(HIT_TINT_TICKS)).toBeNull();
  });
});

describe('knockbackOffset', () => {
  it('pushes away from the hit at once, then eases back', () => {
    const away = { x: 0, y: 10 };
    expect(knockbackOffset(0, away)).toEqual({ x: 0, y: KNOCKBACK_DISTANCE });
    expect(knockbackOffset(KNOCKBACK_TICKS / 2, away).y).toBeCloseTo(KNOCKBACK_DISTANCE / 2);
    expect(knockbackOffset(KNOCKBACK_TICKS, away)).toEqual({ x: 0, y: 0 });
  });

  it('does nothing without a known direction or a hit', () => {
    expect(knockbackOffset(0, null)).toEqual({ x: 0, y: 0 });
    expect(knockbackOffset(null, { x: 1, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(knockbackOffset(0, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('hitSource', () => {
  const target = { x: 100, y: 100 };

  it('names where the nearest strike that could have reached the target came from', () => {
    const tower = { from: { x: 0, y: 0 }, at: { x: 102, y: 100 }, reach: 20 };
    const hero = { from: { x: 300, y: 300 }, at: { x: 110, y: 100 }, reach: 20 };
    expect(hitSource(target, [hero, tower])).toEqual({ x: 0, y: 0 });
  });

  it('is unknown when no strike landed close enough', () => {
    expect(hitSource(target, [{ from: { x: 0, y: 0 }, at: { x: 200, y: 100 }, reach: 20 }])).toBeNull();
    expect(hitSource(target, [])).toBeNull();
  });
});

describe('deathPose', () => {
  it('starts standing and fully visible', () => {
    expect(deathPose(0, false)).toEqual({ angle: 0, alpha: 1, drop: 0 });
  });

  it('falls on its back: away from where it faces', () => {
    expect(deathPose(FALL_TICKS, false).angle).toBe(-90);
    expect(deathPose(FALL_TICKS, true).angle).toBe(90);
    expect(deathPose(FALL_TICKS, false).drop).toBe(1);
  });

  it('falls faster as it goes, like something dropping', () => {
    const quarter = Math.abs(deathPose(FALL_TICKS / 4, false).angle);
    const half = Math.abs(deathPose(FALL_TICKS / 2, false).angle);
    expect(half - quarter).toBeGreaterThan(quarter);
  });

  it('lasts long enough for a player to notice it: at least a second', () => {
    expect(DEATH_TICKS).toBeGreaterThanOrEqual(TICKS_PER_SECOND);
  });

  it('lies on the ground fully visible for a while before fading', () => {
    expect(deathPose(FALL_TICKS, false).alpha).toBe(1);
    expect(deathPose(FADE_FROM_TICK, false).alpha).toBe(1);
    expect(FADE_FROM_TICK - FALL_TICKS).toBeGreaterThanOrEqual(TICKS_PER_SECOND / 2);
  });

  it('fades out by the end of the death', () => {
    const midFade = (FADE_FROM_TICK + DEATH_TICKS) / 2;
    expect(deathPose(midFade, false).alpha).toBeLessThan(1);
    expect(deathPose(midFade, false).alpha).toBeGreaterThan(0);
    expect(deathPose(DEATH_TICKS, false).alpha).toBe(0);
  });
});

describe('heroFallPose', () => {
  it('falls and fades to the look of a fallen hero', () => {
    expect(heroFallPose(0, false)).toEqual({ angle: 0, alpha: 1, drop: 0 });
    const end = heroFallPose(HERO_FALL_TICKS - 1, true);
    expect(end?.angle).toBe(90);
    expect(end?.alpha).toBeGreaterThanOrEqual(DOWN_ALPHA);
    expect(end?.alpha).toBeLessThan(0.5);
  });

  it('is over once the hero has fallen, or before it fell', () => {
    expect(heroFallPose(HERO_FALL_TICKS, false)).toBeNull();
    expect(heroFallPose(-1, false)).toBeNull();
  });
});
