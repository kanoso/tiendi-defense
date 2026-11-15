import { describe, expect, it } from 'vitest';
import { createGame, step, type Command, type GameState, type Level } from '../src/core/simulation';
import { MAPS } from '../src/data/maps';
import { decide, type Bot } from './bots';

// The scripted player that clears the blocked spots with the gold it has left over.

const level: Level = MAPS[0].level;
const bot: Bot = {
  name: 'spots only',
  build: [],
  usesAbilities: false,
  extraSpots: [
    { slot: 8, tower: 'archery' },
    { slot: 9, tower: 'cannon' },
  ],
};
const cost = (slot: number) => level.buildSlots[slot].clearCost!;
const towerCost = (type: string) => level.towerTypes[type].levels[0].cost;

/** What the bot spends on: everything but starting the wave. */
function spending(game: GameState): Command[] {
  return decide(game, level, bot).filter((command) => command.type !== 'startWave');
}

function withGold(game: GameState, gold: number): GameState {
  game.gold = gold;
  return game;
}

describe('a bot with spots to clear', () => {
  it('clears the first spot, builds on it, then moves on to the next', () => {
    const game = withGold(createGame(level, 1), cost(8));
    expect(spending(game)).toEqual([{ type: 'clearSlot', slot: 8 }]);
    step(game, level, spending(game));
    expect(game.clearedSlots).toEqual([8]);

    withGold(game, towerCost('archery'));
    expect(spending(game)).toEqual([{ type: 'buildTower', slot: 8, tower: 'archery' }]);
    step(game, level, spending(game));
    expect(game.towers).toMatchObject([{ slot: 8, type: 'archery' }]);

    // A tower that can still be upgraded comes before the next spot.
    withGold(game, cost(9));
    expect(spending(game)).toEqual([{ type: 'upgradeTower', slot: 8 }]);
    game.towers[0].level = level.towerTypes.archery.levels.length - 1;
    expect(spending(game)).toEqual([{ type: 'clearSlot', slot: 9 }]);
  });

  it('does nothing while the gold falls short, saving up for it', () => {
    expect(spending(withGold(createGame(level, 1), cost(8) - 1))).toEqual([]);

    const cleared = withGold(createGame(level, 1), cost(8));
    step(cleared, level, [{ type: 'clearSlot', slot: 8 }]);
    expect(spending(withGold(cleared, towerCost('archery') - 1))).toEqual([]);
  });

  it('does nothing once every spot has its tower', () => {
    const game = withGold(createGame(level, 1), 10_000);
    for (const slot of [8, 9]) step(game, level, [{ type: 'clearSlot', slot }]);
    step(game, level, [
      { type: 'buildTower', slot: 8, tower: 'archery' },
      { type: 'buildTower', slot: 9, tower: 'cannon' },
    ]);
    for (const tower of game.towers) tower.level = level.towerTypes[tower.type].levels.length - 1;
    expect(spending(game)).toEqual([]);
  });
});
