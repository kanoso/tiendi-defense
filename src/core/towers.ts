import { strike } from './combat';
import { branchCost, sellValue, towerAt, towerStats, upgradeCost } from './queries';
import type { GameState, Level } from './types';

// Requests that cannot be honoured (no gold, slot taken, unknown tower or branch) do nothing.

export function buildTower(game: GameState, level: Level, slot: number, towerType: string): void {
  if (!Object.hasOwn(level.buildSlots, slot)) return;
  if (!Object.hasOwn(level.towerTypes, towerType)) return;
  if (towerAt(game, slot)) return;
  const cost = level.towerTypes[towerType].levels[0].cost;
  if (game.gold < cost) return;
  game.gold -= cost;
  game.towers.push({
    id: game.nextTowerId++,
    slot,
    type: towerType,
    level: 0,
    branch: null,
    invested: cost,
    cooldownTicks: 0,
    lastShot: null,
  });
}

export function upgradeTower(game: GameState, level: Level, slot: number): void {
  const tower = towerAt(game, slot);
  if (!tower) return;
  const cost = upgradeCost(level, tower);
  if (cost === null || game.gold < cost) return;
  game.gold -= cost;
  tower.level++;
  tower.invested += cost;
}

/** From the last base level into the first level of one of its branches. */
export function specializeTower(game: GameState, level: Level, slot: number, branchId: string): void {
  const tower = towerAt(game, slot);
  if (!tower) return;
  const cost = branchCost(level, tower, branchId);
  if (cost === null || game.gold < cost) return;
  game.gold -= cost;
  tower.branch = branchId;
  tower.level++;
  tower.invested += cost;
}

export function sellTower(game: GameState, level: Level, slot: number): void {
  const tower = towerAt(game, slot);
  if (!tower) return;
  game.gold += sellValue(level, tower);
  game.towers = game.towers.filter((candidate) => candidate !== tower);
}

export function tickTowerCooldowns(game: GameState): void {
  for (const tower of game.towers) {
    if (tower.cooldownTicks > 0) tower.cooldownTicks--;
  }
}

export function attackWithTowers(game: GameState, level: Level): void {
  for (const tower of game.towers) {
    if (tower.cooldownTicks > 0) continue;

    const stats = towerStats(level, tower);
    const shot = strike(game, level, level.buildSlots[tower.slot], stats);
    if (!shot) continue;
    tower.cooldownTicks = stats.attackIntervalTicks;
    tower.lastShot = shot;
  }
}
