import { pointAt, type Point } from './path';
import type { Enemy, GameState, Hero, Level, Tower, TowerBranch, TowerLevel } from './types';
import { buildEndlessWave, type Wave } from './waves';

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

/** The wave with that number: scripted while they last, generated afterwards. */
export function waveAt(level: Level, index: number): Wave {
  if (index < level.waves.length) return level.waves[index];
  if (level.endless === null) return [];
  return buildEndlessWave(level.endless, index - level.waves.length, level.paths.length);
}

/** Whether clearing this wave wins the game. Never, in endless mode. */
export function isLastWave(level: Level, index: number): boolean {
  return level.endless === null && index >= level.waves.length - 1;
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

/** The branch a tower specialized into, if any. */
export function towerBranch(level: Level, tower: Tower): TowerBranch | null {
  if (tower.branch === null) return null;
  return level.towerTypes[tower.type].branches?.find((branch) => branch.id === tower.branch) ?? null;
}

/** The level at that index: a base one, or past them one of the branch's. Undefined if there is none. */
function levelAt(level: Level, tower: Tower, index: number): TowerLevel | undefined {
  const base = level.towerTypes[tower.type].levels;
  if (index < base.length) return base[index];
  return towerBranch(level, tower)?.levels[index - base.length];
}

/** What the tower fights with at its current level. */
export function towerStats(level: Level, tower: Tower): TowerLevel {
  const stats = levelAt(level, tower, tower.level);
  if (!stats) throw new Error(`Tower ${tower.id} has no level ${tower.level}`);
  return stats;
}

/**
 * Cost of the tower's next level, or null when there is none to upgrade to:
 * at the top, or at the last base level, where a branch has to be chosen.
 */
export function upgradeCost(level: Level, tower: Tower): number | null {
  return levelAt(level, tower, tower.level + 1)?.cost ?? null;
}

/**
 * Cost of specializing the tower into a branch, or null when it cannot: it is
 * not at its last base level, it already has a branch, or its type has no such branch.
 */
export function branchCost(level: Level, tower: Tower, branchId: string): number | null {
  const type = level.towerTypes[tower.type];
  if (tower.branch !== null || tower.level !== type.levels.length - 1) return null;
  return type.branches?.find((branch) => branch.id === branchId)?.levels[0].cost ?? null;
}

export function sellValue(level: Level, tower: Tower): number {
  return Math.floor(tower.invested * level.sellRefund);
}
