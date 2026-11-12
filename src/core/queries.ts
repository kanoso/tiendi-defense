import { pointAt, type Point } from './path';
import type { Enemy, GameState, Hero, Level, Tower } from './types';

// Read-only questions about the state. Safe to call from the renderer.

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Where an enemy stands on the map. */
export function enemyPosition(level: Level, enemy: Enemy): Point {
  return pointAt(level.paths[enemy.path], enemy.distance);
}

/** How far an enemy still has to walk to reach the exit of its path. */
export function distanceToExit(level: Level, enemy: Enemy): number {
  return level.paths[enemy.path].length - enemy.distance;
}

export function isOver(game: GameState): boolean {
  return game.phase === 'won' || game.phase === 'lost';
}

export function isAlive(hero: Hero): boolean {
  return hero.respawnTicks === 0;
}

export function isMoving(hero: Hero): boolean {
  return hero.x !== hero.targetX || hero.y !== hero.targetY;
}

export function levelForXp(level: Level, xp: number): number {
  return level.xpThresholds.filter((needed) => xp >= needed).length;
}

function powerAt(level: Level, heroLevel: number): number {
  return 1 + level.levelBonus * (heroLevel - 1);
}

export function maxHpAt(level: Level, heroType: string, heroLevel: number): number {
  return Math.round(level.heroTypes[heroType].maxHp * powerAt(level, heroLevel));
}

/** Multiplier that the hero's level applies to its damage. */
export function heroPower(level: Level, hero: Hero): number {
  return powerAt(level, hero.level);
}

export function heroMaxHp(level: Level, hero: Hero): number {
  return maxHpAt(level, hero.type, hero.level);
}

/** `index` is the ability's position on the hero. An index it lacks is never usable. */
export function canUseAbility(game: GameState, level: Level, hero: Hero, index: number): boolean {
  const abilities = level.heroTypes[hero.type].abilities;
  if (!Object.hasOwn(abilities, index)) return false;
  return (
    game.phase === 'wave' &&
    isAlive(hero) &&
    hero.level >= abilities[index].unlockLevel &&
    hero.abilityCooldowns[index] === 0
  );
}

export function towerAt(game: GameState, slot: number): Tower | undefined {
  return game.towers.find((tower) => tower.slot === slot);
}

/** Cost of the tower's next level, or null when it is already at the top. */
export function upgradeCost(level: Level, tower: Tower): number | null {
  return level.towerTypes[tower.type].levels[tower.level + 1]?.cost ?? null;
}

export function sellValue(level: Level, tower: Tower): number {
  return Math.floor(tower.invested * level.sellRefund);
}
