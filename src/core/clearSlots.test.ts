import { describe, expect, it } from 'vitest';
import { MAPS } from '../data/maps';
import { pointAt } from './path';
import {
  createGame,
  isSlotBlocked,
  slotClearCost,
  step,
  type Command,
  type GameState,
  type Level,
} from './simulation';
import { hashState } from './stateHash';

// Some build spots start blocked by rocks. Paying gold clears them for good,
// and from then on they work like any other build slot.

const OPEN = 0;
const ROCKS = 1;
const BOULDERS = 2;
const ROCKS_COST = 150;
const BOULDERS_COST = 200;

const level: Level = {
  ...MAPS[0].level,
  startingGold: 1000,
  buildSlots: [
    { x: 100, y: 100 },
    { x: 200, y: 200, clearCost: ROCKS_COST },
    { x: 300, y: 300, clearCost: BOULDERS_COST },
  ],
};

const clear = (slot: number): Command => ({ type: 'clearSlot', slot });
const build = (slot: number, tower = 'archery'): Command => ({ type: 'buildTower', slot, tower });
const sell = (slot: number): Command => ({ type: 'sellTower', slot });
const ARCHERY = level.towerTypes.archery.levels[0].cost;

function after(commands: Command[], gold = level.startingGold): GameState {
  const game = createGame({ ...level, startingGold: gold }, 1);
  step(game, level, commands);
  return game;
}

describe('clearing a blocked build spot', () => {
  it('starts every game with nothing cleared', () => {
    expect(createGame(level, 1).clearedSlots).toEqual([]);
  });

  it('tells blocked spots from open ones, and what clearing them costs', () => {
    const game = createGame(level, 1);
    expect(isSlotBlocked(game, level, OPEN)).toBe(false);
    expect(isSlotBlocked(game, level, ROCKS)).toBe(true);
    expect(slotClearCost(game, level, OPEN)).toBeNull();
    expect(slotClearCost(game, level, ROCKS)).toBe(ROCKS_COST);
    expect(slotClearCost(game, level, BOULDERS)).toBe(BOULDERS_COST);
  });

  it('pays its price and leaves the spot open for good', () => {
    const game = after([clear(ROCKS)]);
    expect(game.gold).toBe(1000 - ROCKS_COST);
    expect(game.clearedSlots).toEqual([ROCKS]);
    expect(isSlotBlocked(game, level, ROCKS)).toBe(false);
    expect(slotClearCost(game, level, ROCKS)).toBeNull();
  });

  it('keeps the cleared spots in increasing order, whatever order they were cleared in', () => {
    expect(after([clear(BOULDERS), clear(ROCKS)]).clearedSlots).toEqual([ROCKS, BOULDERS]);
  });

  it('takes exactly the price when that is all the gold there is', () => {
    const game = after([clear(ROCKS)], ROCKS_COST);
    expect(game.gold).toBe(0);
    expect(game.clearedSlots).toEqual([ROCKS]);
  });

  describe('requests that cannot be honoured do nothing', () => {
    it('without enough gold', () => {
      const game = after([clear(ROCKS)], ROCKS_COST - 1);
      expect(game.gold).toBe(ROCKS_COST - 1);
      expect(game.clearedSlots).toEqual([]);
    });

    it('on a spot that was already cleared', () => {
      const game = after([clear(ROCKS), clear(ROCKS)]);
      expect(game.gold).toBe(1000 - ROCKS_COST);
      expect(game.clearedSlots).toEqual([ROCKS]);
    });

    it('on a spot that was never blocked', () => {
      const game = after([clear(OPEN)]);
      expect(game.gold).toBe(1000);
      expect(game.clearedSlots).toEqual([]);
    });

    it('on a spot the map does not have', () => {
      for (const slot of [3, 999, -1, 1.5, Number.NaN]) {
        const game = after([clear(slot)]);
        expect(game.gold, String(slot)).toBe(1000);
        expect(game.clearedSlots, String(slot)).toEqual([]);
      }
    });
  });
});

describe('building on a spot that can be cleared', () => {
  it('is refused while the rocks are there', () => {
    const game = after([build(ROCKS)]);
    expect(game.towers).toEqual([]);
    expect(game.gold).toBe(1000);
  });

  it('is allowed once they are gone, like on any slot', () => {
    const game = after([clear(ROCKS), build(ROCKS)]);
    expect(game.towers).toMatchObject([{ slot: ROCKS, type: 'archery', level: 0 }]);
    expect(game.gold).toBe(1000 - ROCKS_COST - ARCHERY);
  });

  it('leaves the spot cleared when its tower is sold', () => {
    const game = after([clear(ROCKS), build(ROCKS), sell(ROCKS)]);
    expect(game.towers).toEqual([]);
    expect(game.clearedSlots).toEqual([ROCKS]);
    expect(isSlotBlocked(game, level, ROCKS)).toBe(false);
    step(game, level, [build(ROCKS)]);
    expect(game.towers).toHaveLength(1);
  });

  it('never changes the open slots, which take towers as always', () => {
    const game = after([build(OPEN)]);
    expect(game.towers).toMatchObject([{ slot: OPEN }]);
  });
});

describe('the blocked spots of every map', () => {
  const ROAD_CLEARANCE = 46;

  for (const map of MAPS) {
    const slots = map.level.buildSlots;
    const blocked = slots.filter((slot) => slot.clearCost !== undefined);

    it(`${map.name}: four spots to clear, after the eight open slots, dearer each time`, () => {
      expect(slots).toHaveLength(12);
      expect(slots.slice(0, 8).every((slot) => slot.clearCost === undefined)).toBe(true);
      expect(blocked).toEqual(slots.slice(8));
      const costs = blocked.map((slot) => slot.clearCost!);
      expect(costs).toEqual([...costs].sort((a, b) => a - b));
      expect(costs[0]).toBeGreaterThanOrEqual(100);
      expect(costs[3]).toBeLessThanOrEqual(350);
    });

    it(`${map.name}: every spot to clear is on open ground, inside the map and clear of the interface`, () => {
      const road = map.level.paths.flatMap((path) =>
        Array.from({ length: Math.ceil(path.length / 4) + 1 }, (_, i) => pointAt(path, i * 4)),
      );
      for (const spot of blocked) {
        const near = (point: { x: number; y: number }) => Math.hypot(point.x - spot.x, point.y - spot.y);
        const where = `${spot.x},${spot.y}`;
        expect(Math.min(...road.map(near)), `road at ${where}`).toBeGreaterThanOrEqual(ROAD_CLEARANCE);
        expect(Math.min(...slots.filter((other) => other !== spot).map(near)), `slot at ${where}`).toBeGreaterThanOrEqual(64);
        expect(Math.min(...map.level.heroes.map(near)), `hero at ${where}`).toBeGreaterThanOrEqual(60);
        expect(spot.y, where).toBeGreaterThanOrEqual(100);
        expect(spot.y, where).toBeLessThanOrEqual(440);
        expect(spot.x, where).toBeGreaterThanOrEqual(40);
        expect(spot.x, where).toBeLessThanOrEqual(map.level.width - 40);
      }
    });
  }
});

describe('determinism with cleared spots', () => {
  const real: Level = { ...MAPS[0].level, startingGold: 5000 };
  const firstBlocked = real.buildSlots.findIndex((slot) => slot.clearCost !== undefined);

  /** Clears some spots, builds on them, then plays the waves it can. */
  function play(seed: number, cleared: number[]): GameState {
    const game = createGame(real, seed);
    for (let tick = 0; tick < 1800; tick++) {
      const commands: Command[] = [];
      if (tick === 0) {
        for (const slot of cleared) commands.push(clear(slot), build(slot));
      }
      if (game.phase === 'preparing') commands.push({ type: 'startWave' });
      step(game, real, commands);
    }
    return game;
  }

  it('gives the same hash for the same seed and commands', () => {
    const first = play(4, [firstBlocked, firstBlocked + 2]);
    expect(first.clearedSlots).toEqual([firstBlocked, firstBlocked + 2]);
    expect(hashState(play(4, [firstBlocked, firstBlocked + 2]))).toBe(hashState(first));
  });

  it('gives a different hash when another spot was cleared, all else being equal', () => {
    // Each game has exactly the price of its spot, so both end with no gold and no towers.
    const clearOnly = (slot: number): GameState => {
      const game = createGame({ ...real, startingGold: real.buildSlots[slot].clearCost! }, 4);
      step(game, real, [clear(slot)]);
      for (let tick = 0; tick < 120; tick++) step(game, real);
      return game;
    };
    const a = clearOnly(firstBlocked);
    const b = clearOnly(firstBlocked + 1);
    expect([a.gold, a.towers, b.gold, b.towers]).toEqual([0, [], 0, []]);
    expect(a.clearedSlots).not.toEqual(b.clearedSlots);
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('notices a cleared spot even when nothing else changed', () => {
    const game = play(4, []);
    const before = hashState(game);
    game.clearedSlots.push(firstBlocked);
    expect(hashState(game)).not.toBe(before);
  });
});
