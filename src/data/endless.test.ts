import { describe, expect, it } from 'vitest';
import { createGame, step, waveAt } from '../core/simulation';
import { asEndless, endlessRules } from './endless';
import { MAPS } from './maps';
import { standardWaves } from './rules';

const level = MAPS[0].level;

function enemiesIn(waveIndex: number): number {
  return waveAt(asEndless(level), waveIndex).reduce((sum, group) => sum + group.count, 0);
}

describe('asEndless', () => {
  it('drops the scripted waves and plays by the endless rules', () => {
    const endless = asEndless(level);
    expect(endless.waves).toEqual([]);
    expect(endless.endless).toBe(endlessRules);
  });

  it('keeps everything else about the map', () => {
    const endless = asEndless(level);
    expect(endless.paths).toBe(level.paths);
    expect(endless.buildSlots).toBe(level.buildSlots);
    expect(endless.enemyTypes).toBe(level.enemyTypes);
  });

  it('keeps the spots to clear, which are cleared and built on as in the campaign', () => {
    const endless = { ...asEndless(level), startingGold: 5000 };
    const spot = endless.buildSlots.findIndex((slot) => slot.clearCost !== undefined);
    expect(spot).toBeGreaterThan(0);
    const game = createGame(endless, 1);
    step(game, endless, [
      { type: 'clearSlot', slot: spot },
      { type: 'buildTower', slot: spot, tower: 'archery' },
    ]);
    expect(game.clearedSlots).toEqual([spot]);
    expect(game.towers).toMatchObject([{ slot: spot }]);
  });

  it("keeps the map's health growth, unless it is given a steeper one for endless play", () => {
    expect(asEndless(level).waveHpGrowth).toBe(level.waveHpGrowth);
    expect(asEndless(level, [], 0.09).waveHpGrowth).toBe(0.09);
    expect(asEndless(level, [], 0.09).endless).toBe(endlessRules);
  });

  it('does not change the level it was given', () => {
    asEndless(level);
    expect(level.endless).toBeNull();
    expect(level.waves.length).toBeGreaterThan(0);
  });

  it("adds a map's own groups after the shared ones, which keep their roads", () => {
    const extra = {
      enemy: 'ogre',
      fromWave: 0,
      everyWaves: 1,
      baseCount: 1,
      countPerWave: 0,
      intervalTicks: 60,
      intervalDropPerWave: 0,
      minIntervalTicks: 60,
      delayTicks: 0,
    };
    const endless = asEndless(level, [extra]);
    expect(endless.endless?.groups).toEqual([...endlessRules.groups, extra]);
    expect(waveAt(endless, 0).map((group) => group.enemy)).toEqual(['soldier', 'ogre']);
    expect(waveAt(endless, 4).slice(0, -1)).toEqual(waveAt(asEndless(level), 4));
  });
});

describe('the maps', () => {
  it('add no enemies of their own to endless mode on the first three maps', () => {
    for (const map of MAPS.slice(0, 3)) expect(map.endlessExtras ?? [], map.id).toEqual([]);
  });

  it('only add enemies the game knows', () => {
    for (const map of MAPS) {
      for (const group of map.endlessExtras ?? []) expect(Object.keys(map.level.enemyTypes)).toContain(group.enemy);
    }
  });
});

describe('endless rules', () => {
  it('only send enemies the game knows', () => {
    for (const group of endlessRules.groups) {
      expect(Object.keys(level.enemyTypes)).toContain(group.enemy);
    }
  });

  it('open gently, with a handful of the weakest enemy', () => {
    const first = waveAt(asEndless(level), 0);
    expect(first.map((group) => group.enemy)).toEqual(['soldier']);
    expect(first[0].count).toBeLessThanOrEqual(8);
  });

  it('send more enemies as the waves go by', () => {
    expect(enemiesIn(10)).toBeGreaterThan(enemiesIn(0));
    expect(enemiesIn(40)).toBeGreaterThan(enemiesIn(10));
  });

  it('bring every kind of enemy the campaign sends within the first ten waves, and no other', () => {
    const seen = new Set<string>();
    for (let wave = 0; wave < 10; wave++) {
      for (const group of waveAt(asEndless(level), wave)) seen.add(group.enemy);
    }
    const campaign = new Set(standardWaves.flatMap((wave) => wave.map((group) => group.enemy)));
    expect([...seen].sort()).toEqual([...campaign].sort());
  });

  it('use both roads on a map that has two', () => {
    const crossroads = asEndless(MAPS[2].level);
    const paths = new Set(waveAt(crossroads, 6).map((group) => group.path));
    expect(paths).toEqual(new Set([0, 1]));
  });
});
