import { describe, expect, it } from 'vitest';
import { waveAt } from '../core/simulation';
import { asEndless, endlessRules } from './endless';
import { MAPS } from './maps';

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

  it('does not change the level it was given', () => {
    asEndless(level);
    expect(level.endless).toBeNull();
    expect(level.waves.length).toBeGreaterThan(0);
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

  it('bring every kind of enemy within the first ten waves', () => {
    const seen = new Set<string>();
    for (let wave = 0; wave < 10; wave++) {
      for (const group of waveAt(asEndless(level), wave)) seen.add(group.enemy);
    }
    expect([...seen].sort()).toEqual(Object.keys(level.enemyTypes).sort());
  });

  it('use both roads on a map that has two', () => {
    const crossroads = asEndless(MAPS[2].level);
    const paths = new Set(waveAt(crossroads, 6).map((group) => group.path));
    expect(paths).toEqual(new Set([0, 1]));
  });
});
