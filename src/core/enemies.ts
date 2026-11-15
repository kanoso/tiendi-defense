import { grantXp } from './heroes';
import { length } from './path';
import { distanceToExit, enemyPosition } from './queries';
import { nextFloat } from './rng';
import { TICKS_PER_SECOND, type Enemy, type EnemyType, type GameState, type Level } from './types';

/** A fresh enemy of that type, at full health for the wave being fought. */
function newEnemy(game: GameState, level: Level, type: string, path: number, distance: number, speed: number): Enemy {
  const maxHp = Math.round(level.enemyTypes[type].maxHp * (1 + level.waveHpGrowth * game.waveIndex));
  return {
    id: game.nextEnemyId++,
    type,
    path,
    distance,
    hp: maxHp,
    maxHp,
    speed,
    blockedBy: null,
    attackCooldownTicks: 0,
    slowTicks: 0,
    slowFactor: 1,
    stunTicks: 0,
    healCooldownTicks: 0,
    revived: false,
  };
}

export function spawnDueEnemies(game: GameState, level: Level): void {
  while (game.spawnQueue.length > 0 && game.spawnQueue[0].atTick <= game.waveTick) {
    const spawn = game.spawnQueue.shift()!;
    const type = level.enemyTypes[spawn.enemy];
    const jitter = (nextFloat(game.rng) * 2 - 1) * level.speedJitter;
    game.enemies.push(newEnemy(game, level, spawn.enemy, spawn.path, 0, type.speed * (1 + jitter)));
  }
}

/**
 * Enemies lying on the road count down, and those whose time is up stand where
 * they fell, with part of their health and free of whatever held them before.
 */
export function raiseFallen(game: GameState, level: Level): void {
  const still: GameState['rising'] = [];
  for (const fallen of game.rising) {
    fallen.ticksLeft--;
    if (fallen.ticksLeft > 0) {
      still.push(fallen);
      continue;
    }
    const enemy = fallen.enemy;
    const revive = level.enemyTypes[enemy.type].revive;
    enemy.hp = Math.round(enemy.maxHp * (revive?.hpFraction ?? 1));
    enemy.revived = true;
    enemy.blockedBy = null;
    enemy.attackCooldownTicks = 0;
    enemy.slowTicks = 0;
    enemy.slowFactor = 1;
    enemy.stunTicks = 0;
    game.enemies.push(enemy);
  }
  game.rising = still;
}

/** Advances enemies along the path. Those that reach the exit cost lives. */
export function moveEnemies(game: GameState, level: Level): void {
  const remaining: Enemy[] = [];
  for (const enemy of game.enemies) {
    // Stunned enemies stay put, and so do those an ability killed this tick.
    if (enemy.stunTicks > 0 || enemy.hp <= 0) {
      remaining.push(enemy);
      continue;
    }
    const pace = enemy.slowTicks > 0 ? enemy.slowFactor : 1;
    if (enemy.slowTicks > 0) enemy.slowTicks--;
    if (enemy.blockedBy === null) enemy.distance += (enemy.speed * pace) / TICKS_PER_SECOND;
    if (distanceToExit(level, enemy) <= 0) {
      game.lives = Math.max(0, game.lives - level.enemyTypes[enemy.type].livesCost);
    } else {
      remaining.push(enemy);
    }
  }
  game.enemies = remaining;
}

/**
 * Enemies with a heal aura give health back to every other wounded enemy in
 * their radius, in the order the enemies are listed, then wait their interval.
 * A stunned one cannot, and one with nobody to heal keeps its heal ready.
 * Runs after enemies moved and attacked and before the stuns tick down.
 */
export function healWithEnemies(game: GameState, level: Level): void {
  for (const healer of game.enemies) {
    const aura = level.enemyTypes[healer.type].healAura;
    if (!aura) continue;
    if (healer.healCooldownTicks > 0) healer.healCooldownTicks--;
    if (healer.healCooldownTicks > 0 || healer.stunTicks > 0 || healer.hp <= 0) continue;

    const center = enemyPosition(level, healer);
    let healed = false;
    for (const patient of game.enemies) {
      // Nobody is brought back from a death this tick.
      if (patient === healer || patient.hp <= 0 || patient.hp >= patient.maxHp) continue;
      const position = enemyPosition(level, patient);
      if (length(position.x - center.x, position.y - center.y) > aura.radius) continue;
      patient.hp = Math.min(patient.maxHp, patient.hp + aura.amount);
      healed = true;
    }
    if (healed) healer.healCooldownTicks = aura.intervalTicks;
  }
}

/** Runs after enemies moved and attacked, so a stun covers whole ticks. */
export function tickStuns(game: GameState): void {
  for (const enemy of game.enemies) {
    if (enemy.stunTicks > 0) enemy.stunTicks--;
  }
}

/**
 * Removes the enemies killed this tick. One that can still get back up lies
 * down to rise later and pays nothing yet; the others pay their bounty and
 * experience, and those that split leave their smaller ones on the road.
 */
export function collectBounties(game: GameState, level: Level): void {
  const survivors: Enemy[] = [];
  const born: Enemy[] = [];
  for (const enemy of game.enemies) {
    if (enemy.hp > 0) {
      survivors.push(enemy);
      continue;
    }
    const type = level.enemyTypes[enemy.type];
    if (type.revive && !enemy.revived) {
      enemy.hp = 0;
      enemy.blockedBy = null;
      game.rising.push({ enemy, ticksLeft: type.revive.delayTicks });
      continue;
    }
    game.gold += type.bounty;
    game.score += type.bounty;
    grantXp(game, level, enemyPosition(level, enemy), type.xp);
    if (type.splitInto) born.push(...splitApart(game, level, enemy, type));
  }
  game.enemies = [...survivors, ...born];
}

/**
 * The smaller enemies one falls apart into, spread evenly along the road
 * around where it fell (never off either end), the one furthest back first.
 * They keep its pace: the same share above or below their type's speed.
 */
function splitApart(game: GameState, level: Level, parent: Enemy, type: EnemyType): Enemy[] {
  const split = type.splitInto!;
  const road = level.paths[parent.path];
  const pace = type.speed > 0 ? parent.speed / type.speed : 1;
  const speed = level.enemyTypes[split.type].speed * pace;
  const pieces: Enemy[] = [];
  for (let i = 0; i < split.count; i++) {
    const offset = (i - (split.count - 1) / 2) * split.spacing;
    const distance = Math.min(road.length, Math.max(0, parent.distance + offset));
    pieces.push(newEnemy(game, level, split.type, parent.path, distance, speed));
  }
  return pieces;
}
