import { describe, expect, it } from 'vitest';
import { buildSpawnQueue } from './waves';

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
