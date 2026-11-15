import {
  branchCost,
  sellValue,
  slotClearCost,
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
 * Clear a blocked spot; build on an empty slot; upgrade or sell a tower. At its
 * last base level a tower offers its branches instead of an upgrade, on maps
 * that have them; elsewhere it is done there, and only selling is left.
 */
export function towerOptions(game: GameState, level: Level, slot: number): TowerOption[] {
  const clearCost = slotClearCost(game, level, slot);
  if (clearCost !== null) {
    return [
      {
        label: `Despejar  ${clearCost}`,
        detail: 'Quita las rocas para construir aquí.',
        cost: clearCost,
        command: { type: 'clearSlot', slot },
      },
    ];
  }

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

/**
 * What the menu of a slot offers, in a form easy to compare. It changes when
 * anything on the slot does (someone else built, cleared, upgraded or sold),
 * never with the gold alone, so an open menu knows when it has to be redrawn.
 */
export function towerOptionsKey(game: GameState, level: Level, slot: number): string {
  return JSON.stringify(towerOptions(game, level, slot).map((option) => [option.label, option.command]));
}

/** Why an option is out of reach, or null when the gold is there. */
export function missingGold(cost: number, gold: number): string | null {
  return gold >= cost ? null : `Faltan ${cost - gold} de oro`;
}
