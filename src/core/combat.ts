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
  // Only specialized towers set these; missing means off. See `TowerLevel`.
  targets?: number;
  armorPierce?: number;
  stunTicks?: number;
  chainJumps?: number;
  chainRange?: number;
}

/**
 * Takes health from an enemy. Armor absorbs part of physical damage only, less
 * of it with `armorPierce` (the fraction of the armor ignored).
 */
export function dealDamage(level: Level, enemy: Enemy, amount: number, type: DamageType, armorPierce = 0): void {
  const armor = type === 'physical' ? level.enemyTypes[enemy.type].armor * (1 - armorPierce) : 0;
  enemy.hp -= amount * (1 - armor);
}

/**
 * Stuns an enemy for `ticks`, shortened by its type's resistance. Never cuts a
 * longer stun short. Used by tower freezes and hero abilities alike.
 */
export function stun(level: Level, enemy: Enemy, ticks: number): void {
  if (ticks <= 0) return;
  const resisted = Math.round(ticks * (1 - (level.enemyTypes[enemy.type].stunResist ?? 0)));
  enemy.stunTicks = Math.max(enemy.stunTicks, resisted);
}

/** Whether an attack that may or may not reach the air can touch this enemy. */
export function canReach(level: Level, enemy: Enemy, hitsFlying: boolean): boolean {
  return hitsFlying || !level.enemyTypes[enemy.type].flying;
}

interface Target {
  enemy: Enemy;
  x: number;
  y: number;
}

/**
 * One attack from `origin`: picks its targets and applies damage, splash, slow
 * and freeze. Returns where it landed, or null when nothing was in range.
 * Shared by heroes and towers.
 *
 * Most attacks strike one target. Some strike several (`targets`), and some jump
 * on from the last one hit to the nearest enemy not hit yet (`chainJumps`).
 * Splash lands around each target; an enemy is never hit twice by one attack.
 * Only the targets are frozen, never the splash around them.
 */
export function strike(game: GameState, level: Level, origin: Point, attack: Attack): Shot | null {
  const targets = pickTargets(game, level, origin, attack);
  if (targets.length === 0) return null;

  const slows = attack.slowTicks > 0;
  const stunTicks = attack.stunTicks ?? 0;
  const struck = new Set(targets.map((target) => target.enemy));
  for (const enemy of game.enemies) {
    const direct = struck.has(enemy);
    if (!direct && !isInSplash(level, enemy, targets, attack)) continue;
    dealDamage(level, enemy, attack.damage, attack.damageType, attack.armorPierce ?? 0);
    if (slows) {
      enemy.slowTicks = attack.slowTicks;
      enemy.slowFactor = attack.slowFactor;
    }
    if (direct) stun(level, enemy, stunTicks);
  }

  const [first] = targets;
  const shot: Shot = { tick: game.tick, x: first.x, y: first.y };
  // Drawing several hits, or which enemies froze, needs to know each one.
  const recordsEach = (attack.targets ?? 1) > 1 || (attack.chainJumps ?? 0) > 0 || stunTicks > 0;
  if (recordsEach) shot.struck = targets.map(({ enemy, x, y }) => ({ id: enemy.id, x, y }));
  return shot;
}

function isInSplash(level: Level, enemy: Enemy, targets: readonly Target[], attack: Attack): boolean {
  if (attack.splashRadius <= 0 || !canReach(level, enemy, attack.hitsFlying)) return false;
  const position = enemyPosition(level, enemy);
  return targets.some((target) => length(position.x - target.x, position.y - target.y) <= attack.splashRadius);
}

/** Every target of one attack, in the order they are hit. */
function pickTargets(game: GameState, level: Level, origin: Point, attack: Attack): Target[] {
  const picked: Target[] = [];
  const isPicked = (enemy: Enemy) => picked.some((target) => target.enemy === enemy);
  // Freezing and slowing attacks spread their effect before repeating it on the same enemy.
  const stuns = (attack.stunTicks ?? 0) > 0;
  const slows = attack.slowTicks > 0;
  const isFresh = (enemy: Enemy) => (stuns ? enemy.stunTicks === 0 : !slows || enemy.slowTicks === 0);
  const prefersFresh = stuns || slows;

  const count = Math.max(1, attack.targets ?? 1);
  while (picked.length < count) {
    const next =
      (prefersFresh ? closestToExit(game, level, origin, attack, (enemy) => !isPicked(enemy) && isFresh(enemy)) : null) ??
      closestToExit(game, level, origin, attack, (enemy) => !isPicked(enemy));
    if (!next) break;
    picked.push(next);
  }

  const jumps = picked.length > 0 ? (attack.chainJumps ?? 0) : 0;
  for (let jump = 0; jump < jumps; jump++) {
    const next = nearestTo(game, level, picked[picked.length - 1], attack, (enemy) => !isPicked(enemy));
    if (!next) break;
    picked.push(next);
  }
  return picked;
}

/** The living enemy in range, reachable and accepted, that is closest to the exit. */
function closestToExit(
  game: GameState,
  level: Level,
  origin: Point,
  attack: Attack,
  accepts: (enemy: Enemy) => boolean,
): Target | null {
  let best: Target | null = null;
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0 || !canReach(level, enemy, attack.hitsFlying) || !accepts(enemy)) continue;
    // Closest to the exit, whichever road it is on.
    if (best && distanceToExit(level, enemy) >= distanceToExit(level, best.enemy)) continue;
    const position = enemyPosition(level, enemy);
    if (length(position.x - origin.x, position.y - origin.y) > attack.range) continue;
    best = { enemy, x: position.x, y: position.y };
  }
  return best;
}

/** The living, reachable and accepted enemy nearest to `from`, within the jump range. */
function nearestTo(
  game: GameState,
  level: Level,
  from: Point,
  attack: Attack,
  accepts: (enemy: Enemy) => boolean,
): Target | null {
  let best: Target | null = null;
  let bestDistance = attack.chainRange ?? 0;
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0 || !canReach(level, enemy, attack.hitsFlying) || !accepts(enemy)) continue;
    const position = enemyPosition(level, enemy);
    const distance = length(position.x - from.x, position.y - from.y);
    // On a tie the earlier enemy in the list wins, the same on every machine.
    if (distance > bestDistance || (best && distance === bestDistance)) continue;
    best = { enemy, x: position.x, y: position.y };
    bestDistance = distance;
  }
  return best;
}
