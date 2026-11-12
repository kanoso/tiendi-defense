import { describe, expect, it } from 'vitest';
import { buildEndlessWave, buildSpawnQueue, type EndlessGroup } from './waves';

describe('buildSpawnQueue', () => {
  it('spaces the enemies of a group by its interval', () => {
    const queue = buildSpawnQueue([{ enemy: 'grunt', count: 3, intervalTicks: 20, delayTicks: 0 }]);
    expect(queue).toMatchObject([
      { atTick: 0, enemy: 'grunt' },
      { atTick: 20, enemy: 'grunt' },
      { atTick: 40, enemy: 'grunt' },
    ]);
  });

  it('offsets a group by its delay', () => {
    const queue = buildSpawnQueue([{ enemy: 'grunt', count: 2, intervalTicks: 10, delayTicks: 100 }]);
    expect(queue.map((spawn) => spawn.atTick)).toEqual([100, 110]);
  });

  it('merges groups in spawn order', () => {
    const queue = buildSpawnQueue([
      { enemy: 'grunt', count: 2, intervalTicks: 50, delayTicks: 0 },
      { enemy: 'brute', count: 1, intervalTicks: 0, delayTicks: 30 },
    ]);
    expect(queue.map((spawn) => spawn.enemy)).toEqual(['grunt', 'brute', 'grunt']);
  });

  it('carries the path of each group, the first one by default', () => {
    const queue = buildSpawnQueue([
      { enemy: 'grunt', count: 1, intervalTicks: 0, delayTicks: 0 },
      { enemy: 'brute', count: 1, intervalTicks: 0, delayTicks: 10, path: 1 },
    ]);
    expect(queue.map((spawn) => spawn.path)).toEqual([0, 1]);
  });

  it('keeps group order when two spawns share a tick', () => {
    const queue = buildSpawnQueue([
      { enemy: 'grunt', count: 1, intervalTicks: 0, delayTicks: 0 },
      { enemy: 'brute', count: 1, intervalTicks: 0, delayTicks: 0 },
    ]);
    expect(queue.map((spawn) => spawn.enemy)).toEqual(['grunt', 'brute']);
  });
});

describe('buildEndlessWave', () => {
  const group = (overrides: Partial<EndlessGroup>): EndlessGroup => ({
    enemy: 'grunt',
    fromWave: 0,
    everyWaves: 1,
    baseCount: 4,
    countPerWave: 2,
    intervalTicks: 60,
    minIntervalTicks: 20,
    intervalDropPerWave: 5,
    delayTicks: 0,
    ...overrides,
  });
  const rules = (...groups: EndlessGroup[]) => ({ groups });

  it('gives the same wave for the same number', () => {
    const endless = rules(group({}), group({ enemy: 'brute', fromWave: 3 }));
    expect(buildEndlessWave(endless, 7, 1)).toEqual(buildEndlessWave(endless, 7, 1));
  });

  it('adds enemies to a group as the waves go by', () => {
    const endless = rules(group({}));
    expect(buildEndlessWave(endless, 0, 1)[0].count).toBe(4);
    expect(buildEndlessWave(endless, 5, 1)[0].count).toBe(14);
  });

  it('rounds fractional growth down', () => {
    const endless = rules(group({ baseCount: 1, countPerWave: 0.5 }));
    expect(buildEndlessWave(endless, 3, 1)[0].count).toBe(2);
  });

  it('packs enemies closer together over time, down to a limit', () => {
    const endless = rules(group({}));
    expect(buildEndlessWave(endless, 0, 1)[0].intervalTicks).toBe(60);
    expect(buildEndlessWave(endless, 4, 1)[0].intervalTicks).toBe(40);
    expect(buildEndlessWave(endless, 50, 1)[0].intervalTicks).toBe(20);
  });

  it('leaves a group out until its first wave', () => {
    const endless = rules(group({}), group({ enemy: 'brute', fromWave: 3 }));
    expect(buildEndlessWave(endless, 2, 1).map((g) => g.enemy)).toEqual(['grunt']);
    expect(buildEndlessWave(endless, 3, 1).map((g) => g.enemy)).toEqual(['grunt', 'brute']);
  });

  it('counts the growth of a group from its own first wave', () => {
    const endless = rules(group({ fromWave: 3, baseCount: 1, countPerWave: 1 }));
    expect(buildEndlessWave(endless, 3, 1)[0].count).toBe(1);
    expect(buildEndlessWave(endless, 5, 1)[0].count).toBe(3);
  });

  it('brings a group back only every so many waves', () => {
    const endless = rules(group({ enemy: 'boss', fromWave: 9, everyWaves: 10 }));
    expect(buildEndlessWave(endless, 9, 1)).toHaveLength(1);
    expect(buildEndlessWave(endless, 10, 1)).toHaveLength(0);
    expect(buildEndlessWave(endless, 19, 1)).toHaveLength(1);
  });

  it('spreads the groups over the paths and rotates them each wave', () => {
    const endless = rules(group({}), group({ enemy: 'brute' }));
    expect(buildEndlessWave(endless, 0, 2).map((g) => g.path)).toEqual([0, 1]);
    expect(buildEndlessWave(endless, 1, 2).map((g) => g.path)).toEqual([1, 0]);
  });

  it('keeps every group on the only path of a one-road map', () => {
    const endless = rules(group({}), group({ enemy: 'brute' }));
    expect(buildEndlessWave(endless, 1, 1).map((g) => g.path)).toEqual([0, 0]);
  });
});
