import { describe, expect, it } from 'vitest';
import { createGame, step, type Command, type GameState, type Level } from '../core/simulation';
import { MAPS } from '../data/maps';
import { missingGold, towerOptions, towerOptionsKey } from './towerOptions';

// A map that offers branches. The current ones do not; the menu on them is checked below.
const level: Level = { ...MAPS[0].level, startingGold: 5000, towerBranches: true };

function gameWith(commands: Command[], on: Level = level): GameState {
  const game = createGame(on, 1);
  step(game, on, commands);
  return game;
}

const build: Command = { type: 'buildTower', slot: 0, tower: 'archery' };
const upgrade: Command = { type: 'upgradeTower', slot: 0 };
const labels = (game: GameState) => towerOptions(game, level, 0).map((option) => option.label);

describe('the options of a build slot', () => {
  it('offers every tower on an empty slot', () => {
    expect(labels(gameWith([]))).toEqual(['Arquería  70', 'Cañón  110', 'Hielo  90', 'Arcana  140']);
  });

  it('offers upgrading and selling a tower below its last base level', () => {
    expect(labels(gameWith([build]))).toEqual(['Mejorar  60', 'Vender  +42']);
  });

  it('offers the two branches, with what they do, instead of an upgrade at the last base level', () => {
    const options = towerOptions(gameWith([build, upgrade, upgrade]), level, 0);
    const branches = level.towerTypes.archery.branches!;
    expect(options.map((option) => option.label)).toEqual([
      `${branches[0].name}  ${branches[0].levels[0].cost}`,
      `${branches[1].name}  ${branches[1].levels[0].cost}`,
      'Vender  +132',
    ]);
    expect(options[0]).toMatchObject({
      detail: branches[0].blurb,
      cost: branches[0].levels[0].cost,
      command: { type: 'specializeTower', slot: 0, branch: branches[0].id },
    });
    expect(options[2].detail).toBeNull();
  });

  it('offers the next level of the branch once specialized, then only selling', () => {
    const branch = level.towerTypes.archery.branches![0];
    const specialized = gameWith([build, upgrade, upgrade, { type: 'specializeTower', slot: 0, branch: branch.id }]);
    expect(labels(specialized)[0]).toBe(`Mejorar  ${branch.levels[1].cost}`);
    step(specialized, level, [upgrade]);
    expect(labels(specialized)).toHaveLength(1);
    expect(labels(specialized)[0]).toMatch(/^Vender/);
  });
});

describe('the options of a tower on a map without branches', () => {
  const closed: Level = { ...MAPS[0].level, startingGold: 5000 };

  it('offers only selling at the last base level, like a tower at its top', () => {
    const game = gameWith([build, upgrade, upgrade], closed);
    const options = towerOptions(game, closed, 0);
    expect(options.map((option) => option.command.type)).toEqual(['sellTower']);
    expect(options[0].label).toBe('Vender  +132');
  });

  it('still offers the next level to a tower that took its branch before', () => {
    const game = gameWith([build, upgrade, upgrade], closed);
    const branch = closed.towerTypes.archery.branches![0];
    Object.assign(game.towers[0], { level: 3, branch: branch.id });
    expect(towerOptions(game, closed, 0).map((option) => option.label)[0]).toBe(`Mejorar  ${branch.levels[1].cost}`);
  });
});

describe('the options of a blocked spot', () => {
  const spot = level.buildSlots.findIndex((slot) => slot.clearCost !== undefined);
  const cost = level.buildSlots[spot].clearCost!;

  it('offers only clearing it, with its price and what it does', () => {
    const options = towerOptions(gameWith([]), level, spot);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      label: `Despejar  ${cost}`,
      cost,
      command: { type: 'clearSlot', slot: spot },
    });
    // A second line, so it is drawn as a big button that can say what gold is missing.
    expect(options[0].detail).toEqual(expect.any(String));
  });

  it('offers every tower once it is cleared, like any empty slot', () => {
    const game = gameWith([{ type: 'clearSlot', slot: spot }]);
    expect(towerOptions(game, level, spot).map((option) => option.command.type)).toEqual([
      'buildTower',
      'buildTower',
      'buildTower',
      'buildTower',
    ]);
  });
});

describe('telling when an open menu is out of date', () => {
  const spot = level.buildSlots.findIndex((slot) => slot.clearCost !== undefined);
  const key = (game: GameState, slot: number) => towerOptionsKey(game, level, slot);

  it('stays the same while nothing on the slot changes, gold included', () => {
    const game = gameWith([build]);
    const before = key(game, 0);
    game.gold -= 100;
    step(game, level, [{ type: 'buildTower', slot: 1, tower: 'cannon' }]);
    expect(key(game, 0)).toBe(before);
  });

  it('changes when someone else builds on the empty slot', () => {
    const game = gameWith([]);
    const before = key(game, 0);
    step(game, level, [build]);
    expect(key(game, 0)).not.toBe(before);
  });

  it('changes when someone else clears the spot', () => {
    const game = gameWith([]);
    const before = key(game, spot);
    step(game, level, [{ type: 'clearSlot', slot: spot }]);
    expect(key(game, spot)).not.toBe(before);
  });

  it('changes when someone else upgrades, specializes or sells the tower', () => {
    const game = gameWith([build]);
    for (const command of [upgrade, upgrade, { type: 'specializeTower', slot: 0, branch: 'ballesta' }, { type: 'sellTower', slot: 0 }] as Command[]) {
      const before = key(game, 0);
      step(game, level, [command]);
      expect(key(game, 0), command.type).not.toBe(before);
    }
  });
});

describe('why an option cannot be taken', () => {
  it('says how much gold is missing', () => {
    expect(missingGold(280, 100)).toBe('Faltan 180 de oro');
  });

  it('says nothing when there is enough', () => {
    expect(missingGold(280, 280)).toBeNull();
    expect(missingGold(0, 0)).toBeNull();
  });
});
