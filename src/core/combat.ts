import { length, type Point } from './path';
import { distanceToExit, enemyPosition } from './queries';
import type { DamageType, Enemy, GameState, Level, Shot } from './types';

export interface Attack {
  range: number;
  damage: number;
  splashRadius: number;
  slowFactor: number;
  slowTicks: number;
  damageType: DamageType;
  hitsFlying: boolean;
}

/** Takes health from an enemy. Armor absorbs part of physical damage only. */
export function dealDamage(level: Level, enemy: Enemy, amount: number, type: DamageType): void {
  const armor = type === 'physical' ? level.enemyTypes[enemy.type].armor : 0;
  enemy.hp -= amount * (1 - armor);
}

/** Whether an attack that may or may not reach the air can touch this enemy. */
export function canReach(level: Level, enemy: Enemy, hitsFlying: boolean): boolean {
  return hitsFlying || !level.enemyTypes[enemy.type].flying;
}

/**
 * One attack from `origin`: picks a target in range and applies damage, splash
 * and slow. Returns where it landed, or null when nothing was in range.
 * Shared by heroes and towers.
 */
export function strike(game: GameState, level: Level, origin: Point, attack: Attack): Shot | null {
  const slows = attack.slowTicks > 0;
  // A slowing attack spreads its effect before repeating it on the same enemy.
  const target =
    (slows ? pickTarget(game, level, origin, attack, true) : null) ??
    pickTarget(game, level, origin, attack, false);
  if (!target) return null;

  for (const enemy of game.enemies) {
    if (enemy !== target.enemy) {
      if (attack.splashRadius <= 0 || !canReach(level, enemy, attack.hitsFlying)) continue;
      const position = enemyPosition(level, enemy);
      if (length(position.x - target.x, position.y - target.y) > attack.splashRadius) continue;
    }
    dealDamage(level, enemy, attack.damage, attack.damageType);
    if (slows) {
      enemy.slowTicks = attack.slowTicks;
      enemy.slowFactor = attack.slowFactor;
    }
  }
  return { tick: game.tick, x: target.x, y: target.y };
}

/**
 * The living enemy the attack can reach that is closest to the exit. With
 * `unslowedOnly`, enemies already under a slow are skipped.
 */
function pickTarget(
  game: GameState,
  level: Level,
  origin: Point,
  attack: Attack,
  unslowedOnly: boolean,
): { enemy: Enemy; x: number; y: number } | null {
  let best: { enemy: Enemy; x: number; y: number } | null = null;
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0 || !canReach(level, enemy, attack.hitsFlying)) continue;
    if (unslowedOnly && enemy.slowTicks > 0) continue;
    // Closest to the exit, whichever road it is on.
    if (best && distanceToExit(level, enemy) >= distanceToExit(level, best.enemy)) continue;
    const position = enemyPosition(level, enemy);
    if (length(position.x - origin.x, position.y - origin.y) > attack.range) continue;
    best = { enemy, x: position.x, y: position.y };
  }
  return best;
}
