import {
  branchCost,
  sellValue,
  towerAt,
  upgradeCost,
  type Command,
  type GameState,
  type Level,
} from '../core/simulation';
import { TOWER_STYLE } from '../entities/styles';

// What the menu of a build slot offers. Kept apart from drawing it, so it can be tested.

export interface TowerOption {
  label: string;
  /** A second line saying what it does, for the choices that need one. */
  detail: string | null;
  /** Gold it needs. Zero when it costs nothing. */
  cost: number;
  command: Command;
}

/**
 * Build on an empty slot; upgrade or sell a tower. At its last base level a
 * tower offers its branches instead of an upgrade.
 */
export function towerOptions(game: GameState, level: Level, slot: number): TowerOption[] {
  const tower = towerAt(game, slot);
  if (!tower) {
    return Object.entries(level.towerTypes).map(([id, type]) => {
      const cost = type.levels[0].cost;
      return { label: `${TOWER_STYLE[id].name}  ${cost}`, detail: null, cost, command: { type: 'buildTower', slot, tower: id } };
    });
  }

  const options: TowerOption[] = [];
  const cost = upgradeCost(level, tower);
  if (cost !== null) {
    options.push({ label: `Mejorar  ${cost}`, detail: null, cost, command: { type: 'upgradeTower', slot } });
  }
  for (const branch of level.towerTypes[tower.type].branches ?? []) {
    const price = branchCost(level, tower, branch.id);
    if (price === null) continue;
    options.push({
      label: `${branch.name}  ${price}`,
      detail: branch.blurb,
      cost: price,
      command: { type: 'specializeTower', slot, branch: branch.id },
    });
  }
  options.push({
    label: `Vender  +${sellValue(level, tower)}`,
    detail: null,
    cost: 0,
    command: { type: 'sellTower', slot },
  });
  return options;
}

/** Why an option is out of reach, or null when the gold is there. */
export function missingGold(cost: number, gold: number): string | null {
  return gold >= cost ? null : `Faltan ${cost - gold} de oro`;
}
