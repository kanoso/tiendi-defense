import { strike } from './combat';
import type { Point } from './path';
import { enemyPosition, heroMaxHp, heroPower, isAlive, isMoving, levelForXp } from './queries';
import { TICKS_PER_SECOND, type Enemy, type GameState, type Hero, type Level } from './types';

/** Respawn timers, cooldowns and walking. Runs in every phase. */
export function updateHeroes(game: GameState, level: Level): void {
  for (const hero of game.heroes) {
    for (let i = 0; i < hero.abilityCooldowns.length; i++) {
      if (hero.abilityCooldowns[i] > 0) hero.abilityCooldowns[i]--;
    }
    if (!isAlive(hero)) {
      hero.respawnTicks--;
      if (isAlive(hero)) hero.hp = heroMaxHp(level, hero);
      continue;
    }
    if (hero.cooldownTicks > 0) hero.cooldownTicks--;
    if (hero.healCooldownTicks > 0) hero.healCooldownTicks--;
    if (!isMoving(hero)) continue;

    const stride = level.heroTypes[hero.type].moveSpeed / TICKS_PER_SECOND;
    const dx = hero.targetX - hero.x;
    const dy = hero.targetY - hero.y;
    const remaining = Math.hypot(dx, dy);
    if (remaining <= stride) {
      hero.x = hero.targetX;
      hero.y = hero.targetY;
    } else {
      hero.x += (dx / remaining) * stride;
      hero.y += (dy / remaining) * stride;
    }
  }
}

/** A fallen hero waits at its spawn point, out of the fight. */
function killHero(game: GameState, level: Level, hero: Hero): void {
  const spawn = level.heroes[hero.id - 1];
  hero.hp = 0;
  hero.respawnTicks = level.heroRespawnTicks;
  hero.x = hero.targetX = spawn.x;
  hero.y = hero.targetY = spawn.y;
  hero.cooldownTicks = 0;
  hero.healCooldownTicks = 0;
  hero.lastShot = null;
  hero.lastHeal = null;
  for (const enemy of game.enemies) {
    if (enemy.blockedBy === hero.id) enemy.blockedBy = null;
  }
}

/**
 * A blocking hero that stands still holds the enemies within its reach, up to
 * its block count. Walking away or dying lets them go.
 */
export function updateBlocks(game: GameState, level: Level): void {
  for (const hero of game.heroes) {
    const type = level.heroTypes[hero.type];
    const canBlock = type.blockCount > 0 && isAlive(hero) && !isMoving(hero);

    let held = 0;
    for (const enemy of game.enemies) {
      if (enemy.blockedBy !== hero.id) continue;
      if (canBlock) held++;
      else enemy.blockedBy = null;
    }
    if (!canBlock) continue;

    for (const enemy of game.enemies) {
      if (enemy.blockedBy !== null || level.enemyTypes[enemy.type].flying) continue;
      const position = enemyPosition(level, enemy);
      if (Math.hypot(position.x - hero.x, position.y - hero.y) > type.range) continue;

      if (held >= type.blockCount) {
        // Full hands: only a more dangerous enemy is worth letting another go.
        const weakest = leastDangerousHeldBy(game, level, hero);
        if (!weakest || danger(level, enemy) <= danger(level, weakest)) continue;
        weakest.blockedBy = null;
        held--;
      }
      enemy.blockedBy = hero.id;
      enemy.attackCooldownTicks = level.enemyTypes[enemy.type].attackIntervalTicks;
      held++;
    }
  }
}

/** How much an enemy hurts if it gets through: the lives it would cost. */
function danger(level: Level, enemy: Enemy): number {
  return level.enemyTypes[enemy.type].livesCost;
}

function leastDangerousHeldBy(game: GameState, level: Level, hero: Hero): Enemy | null {
  let weakest: Enemy | null = null;
  for (const enemy of game.enemies) {
    if (enemy.blockedBy !== hero.id) continue;
    if (!weakest || danger(level, enemy) < danger(level, weakest)) weakest = enemy;
  }
  return weakest;
}

/** Blocked enemies fight the hero that holds them, unless they are stunned. */
export function attackBlockers(game: GameState, level: Level): void {
  for (const enemy of game.enemies) {
    if (enemy.blockedBy === null || enemy.stunTicks > 0) continue;
    const hero = game.heroes.find((candidate) => candidate.id === enemy.blockedBy);
    if (!hero) continue;

    if (enemy.attackCooldownTicks > 0) enemy.attackCooldownTicks--;
    if (enemy.attackCooldownTicks > 0) continue;

    const type = level.enemyTypes[enemy.type];
    enemy.attackCooldownTicks = type.attackIntervalTicks;
    hero.hp -= type.damage;
    if (hero.hp <= 0) killHero(game, level, hero);
  }
}

/** Each healer restores its most wounded living ally in range. */
export function healWithHeroes(game: GameState, level: Level): void {
  for (const healer of game.heroes) {
    const type = level.heroTypes[healer.type];
    if (type.healAmount <= 0 || !isAlive(healer) || healer.healCooldownTicks > 0) continue;

    let patient: Hero | null = null;
    let patientMissing = 0;
    for (const ally of game.heroes) {
      if (ally === healer || !isAlive(ally)) continue;
      const missing = heroMaxHp(level, ally) - ally.hp;
      if (missing <= patientMissing) continue;
      if (Math.hypot(ally.x - healer.x, ally.y - healer.y) > type.healRange) continue;
      patient = ally;
      patientMissing = missing;
    }
    if (!patient) continue;

    patient.hp += Math.min(type.healAmount, patientMissing);
    healer.healCooldownTicks = type.healIntervalTicks;
    healer.lastHeal = { tick: game.tick, x: patient.x, y: patient.y };
  }
}

/** Heroes hold their fire while walking, so where they stand is a real choice. */
export function attackWithHeroes(game: GameState, level: Level): void {
  for (const hero of game.heroes) {
    if (!isAlive(hero) || hero.cooldownTicks > 0 || isMoving(hero)) continue;

    const type = level.heroTypes[hero.type];
    const damage = type.damage * heroPower(level, hero);
    const shot = strike(game, level, hero, { ...type, damage });
    if (!shot) continue;
    hero.cooldownTicks = type.attackIntervalTicks;
    hero.lastShot = shot;
  }
}

/** Heroes near a kill share its experience and may level up. */
export function grantXp(game: GameState, level: Level, at: Point, xp: number): void {
  if (xp <= 0) return;
  for (const hero of game.heroes) {
    if (!isAlive(hero)) continue;
    if (Math.hypot(hero.x - at.x, hero.y - at.y) > level.xpRange) continue;
    hero.xp += xp;
    const reached = levelForXp(level, hero.xp);
    if (reached === hero.level) continue;
    // The extra maximum health of the new level is granted on the spot.
    const before = heroMaxHp(level, hero);
    hero.level = reached;
    hero.hp += heroMaxHp(level, hero) - before;
  }
}

/** Surviving heroes recover between waves; fallen ones still wait to respawn. */
export function restoreHeroes(game: GameState, level: Level): void {
  for (const hero of game.heroes) {
    if (isAlive(hero)) hero.hp = heroMaxHp(level, hero);
  }
}
