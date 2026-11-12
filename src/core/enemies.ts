import { grantXp } from './heroes';
import { distanceToExit, enemyPosition } from './queries';
import { nextFloat } from './rng';
import { TICKS_PER_SECOND, type Enemy, type GameState, type Level } from './types';

export function spawnDueEnemies(game: GameState, level: Level): void {
  while (game.spawnQueue.length > 0 && game.spawnQueue[0].atTick <= game.waveTick) {
    const spawn = game.spawnQueue.shift()!;
    const type = level.enemyTypes[spawn.enemy];
    const jitter = (nextFloat(game.rng) * 2 - 1) * level.speedJitter;
    const maxHp = Math.round(type.maxHp * (1 + level.waveHpGrowth * game.waveIndex));
    game.enemies.push({
      id: game.nextEnemyId++,
      type: spawn.enemy,
      path: spawn.path,
      distance: 0,
      hp: maxHp,
      maxHp,
      speed: type.speed * (1 + jitter),
      blockedBy: null,
      attackCooldownTicks: 0,
      slowTicks: 0,
      slowFactor: 1,
      stunTicks: 0,
    });
  }
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

/** Runs after enemies moved and attacked, so a stun covers whole ticks. */
export function tickStuns(game: GameState): void {
  for (const enemy of game.enemies) {
    if (enemy.stunTicks > 0) enemy.stunTicks--;
  }
}

/** Removes the enemies killed this tick, paying their bounty and experience. */
export function collectBounties(game: GameState, level: Level): void {
  const survivors: Enemy[] = [];
  for (const enemy of game.enemies) {
    if (enemy.hp > 0) {
      survivors.push(enemy);
    } else {
      const type = level.enemyTypes[enemy.type];
      game.gold += type.bounty;
      grantXp(game, level, enemyPosition(level, enemy), type.xp);
    }
  }
  game.enemies = survivors;
}
