import type { Level } from '../core/simulation';
import type { EndlessGroup, EndlessRules } from '../core/waves';

/** A group that shows up every wave and never packs tighter. Each one overrides what differs. */
const steady = { everyWaves: 1, intervalDropPerWave: 0, delayTicks: 0 };

function group(values: Omit<EndlessGroup, keyof typeof steady> & Partial<EndlessGroup>): EndlessGroup {
  return { ...steady, ...values };
}

/**
 * How endless mode grows. Wave numbers count from zero. On top of these numbers,
 * the map's own health growth per wave keeps applying, so both the crowd and
 * each enemy get harder.
 */
export const endlessRules: EndlessRules = {
  groups: [
    // The backbone: there from the start, a few more every wave.
    group({
      enemy: 'soldier',
      fromWave: 0,
      baseCount: 6,
      countPerWave: 1.5,
      intervalTicks: 80,
      intervalDropPerWave: 2,
      minIntervalTicks: 22,
    }),
    group({
      enemy: 'runner',
      fromWave: 2,
      everyWaves: 2,
      baseCount: 6,
      countPerWave: 1,
      intervalTicks: 40,
      intervalDropPerWave: 1,
      minIntervalTicks: 18,
      delayTicks: 240,
    }),
    group({
      enemy: 'flyer',
      fromWave: 3,
      everyWaves: 2,
      baseCount: 4,
      countPerWave: 0.8,
      intervalTicks: 55,
      intervalDropPerWave: 1,
      minIntervalTicks: 25,
      delayTicks: 300,
    }),
    group({
      enemy: 'armored',
      fromWave: 4,
      baseCount: 2,
      countPerWave: 0.6,
      intervalTicks: 170,
      intervalDropPerWave: 3,
      minIntervalTicks: 70,
      delayTicks: 150,
    }),
    // A boss on the tenth wave and every fifth after it, eventually in pairs.
    group({
      enemy: 'boss',
      fromWave: 9,
      everyWaves: 5,
      baseCount: 1,
      countPerWave: 0.1,
      intervalTicks: 600,
      minIntervalTicks: 600,
      delayTicks: 300,
    }),
  ],
};

/** The same map played without an end. The level passed in is left untouched. */
export function asEndless(level: Level): Level {
  return { ...level, waves: [], endless: endlessRules };
}
