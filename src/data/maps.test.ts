import { describe, expect, it } from 'vitest';
import { waveAt, type Level } from '../core/simulation';
import type { Wave } from '../core/waves';
import { asEndless } from './endless';
import { playerLevel } from '../progress/savedGame';
import { DIFFICULTY_IDS } from './difficulty';
import { findMap, MAP_IDS, MAPS } from './maps';
import { emptyProgress, isUnlocked, recordVictory, totalStars } from '../progress/progress';
import { standardWaves } from './rules';

// The campaign: five maps played in order. The first three are the original
// ones and stay as they were; the last two bring the new enemies and branches.

const NEW_ENEMIES = ['shaman', 'skeleton', 'big_zombie', 'ogre'];

const sentBy = (waves: readonly Wave[]): Set<string> =>
  new Set(waves.flatMap((wave) => wave.map((group) => group.enemy)));

/** How many of an enemy each wave sends, by wave index. */
const countsOf = (waves: readonly Wave[], enemy: string): number[] =>
  waves.map((wave) => wave.filter((group) => group.enemy === enemy).reduce((sum, group) => sum + group.count, 0));

describe('the campaign', () => {
  it('plays five maps in a fixed order', () => {
    expect(MAP_IDS).toEqual(['meadow', 'canyon', 'crossroads', 'swamp', 'fortress']);
  });

  it('opens each map once the one before it is won', () => {
    let progress = emptyProgress();
    for (const [index, id] of MAP_IDS.entries()) {
      expect(isUnlocked(progress, MAP_IDS, id), id).toBe(true);
      const next = MAP_IDS[index + 1];
      if (next) expect(isUnlocked(progress, MAP_IDS, next), next).toBe(false);
      progress = recordVictory(progress, id, 'normal', 1);
    }
  });

  it('holds 45 stars: three per map and difficulty', () => {
    let progress = emptyProgress();
    for (const id of MAP_IDS) {
      for (const difficulty of DIFFICULTY_IDS) progress = recordVictory(progress, id, difficulty, 3);
    }
    expect(totalStars(progress)).toBe(45);
  });

  it('gives every map a Spanish name and a line for the picker', () => {
    expect(findMap('swamp').name).toBe('Pantano');
    expect(findMap('fortress').name).toBe('Fortaleza');
    for (const map of MAPS) expect(map.blurb.length, map.id).toBeGreaterThan(10);
  });

  it('only sends enemies the game knows, on roads the map has', () => {
    for (const map of MAPS) {
      for (const [index, wave] of map.level.waves.entries()) {
        expect(wave.length, `${map.id} wave ${index + 1}`).toBeGreaterThan(0);
        for (const group of wave) {
          expect(Object.keys(map.level.enemyTypes), `${map.id} wave ${index + 1}`).toContain(group.enemy);
          expect(group.count, `${map.id} wave ${index + 1}`).toBeGreaterThan(0);
          expect(group.path ?? 0).toBeLessThan(map.level.paths.length);
        }
      }
    }
  });

  it('never sends the small zombie on its own: it only comes out of a big one', () => {
    for (const map of MAPS) expect(sentBy(map.level.waves).has('tiny_zombie'), map.id).toBe(false);
  });
});

describe('endless mode on the two newest maps', () => {
  /** Health the wave sends in all, before growth: a measure of how heavy it is. */
  const weight = (level: Level, waveIndex: number): number =>
    waveAt(level, waveIndex).reduce((sum, group) => sum + group.count * level.enemyTypes[group.enemy].maxHp, 0);

  it('grows enemy health faster than their campaigns do, while the first three keep theirs', () => {
    for (const id of MAP_IDS) {
      const map = findMap(id);
      const endless = playerLevel(id, 'normal', 'endless', {}).waveHpGrowth;
      if (map.level.towerBranches === true) expect(endless, id).toBeGreaterThan(map.level.waveHpGrowth);
      else expect(endless, id).toBe(map.level.waveHpGrowth);
    }
  });

  // Their towers can specialize, so the shared schedule alone would never end a game.
  for (const id of ['swamp', 'fortress']) {
    it(`${id}: weighs half as much again as the shared schedule from wave 25 on, and keeps growing`, () => {
      const map = findMap(id);
      const own = asEndless(map.level, map.endlessExtras);
      const shared = asEndless(map.level);
      for (const wave of [24, 29, 34, 39]) {
        expect(weight(own, wave), `wave ${wave + 1}`).toBeGreaterThanOrEqual(1.5 * weight(shared, wave));
      }
      expect(weight(own, 39)).toBeGreaterThan(weight(own, 29));
    });
  }
});

describe('the first three maps', () => {
  it('keep their twenty standard waves, without branches or enemies of their own', () => {
    for (const id of ['meadow', 'canyon', 'crossroads']) {
      const { level, endlessExtras } = findMap(id);
      expect(level.waves, id).toHaveLength(20);
      expect(level.waves.map((wave) => wave.map(({ path: _, ...group }) => group)), id).toEqual(standardWaves);
      expect(level.towerBranches ?? false, id).toBe(false);
      expect(endlessExtras ?? [], id).toEqual([]);
    }
  });
});

describe('the swamp', () => {
  const swamp = findMap('swamp');
  const { waves } = swamp.level;

  it('sends skeletons on wave 4 and shamans on wave 7, as played, and not before', () => {
    const sent = (index: number) => waveAt(swamp.level, index).map((group) => group.enemy);
    expect(sent(3)).toContain('skeleton');
    expect(sent(6)).toContain('shaman');
    for (let index = 0; index < 3; index++) expect(sent(index)).not.toContain('skeleton');
    for (let index = 0; index < 6; index++) expect(sent(index)).not.toContain('shaman');
  });

  it('is a long single-road map of thirty waves, with branches', () => {
    expect(swamp.level.paths).toHaveLength(1);
    expect(waves).toHaveLength(30);
    expect(swamp.level.towerBranches).toBe(true);
  });

  it('brings in the shaman and the skeleton, a few at first and more later', () => {
    for (const enemy of ['shaman', 'skeleton']) {
      const counts = countsOf(waves, enemy);
      const first = counts.findIndex((count) => count > 0);
      expect(first, enemy).toBeGreaterThanOrEqual(3);
      expect(first, enemy).toBeLessThan(10);
      expect(counts[first], enemy).toBeLessThanOrEqual(4);
      expect(Math.max(...counts), enemy).toBeGreaterThanOrEqual(3 * counts[first]);
      // Mixed in with the enemies the player already knows.
      expect(waves[first].some((group) => !NEW_ENEMIES.includes(group.enemy)), enemy).toBe(true);
    }
  });

  it('leaves the big zombie and the ogre to the fortress', () => {
    expect(sentBy(waves).has('big_zombie')).toBe(false);
    expect(sentBy(waves).has('ogre')).toBe(false);
  });

  it('sends bosses on milestone waves and ends with them', () => {
    const bossWaves = countsOf(waves, 'boss').flatMap((count, index) => (count > 0 ? [index + 1] : []));
    expect(bossWaves).toEqual(expect.arrayContaining([10, 20, 30]));
    expect(bossWaves[0]).toBe(10);
  });

  it('adds the shaman and the skeleton to its endless mode, and leaves the fortress its own', () => {
    const added = new Set((swamp.endlessExtras ?? []).map((group) => group.enemy));
    expect(added.has('shaman') && added.has('skeleton')).toBe(true);
    expect(added.has('ogre') || added.has('big_zombie')).toBe(false);
  });
});

describe('the fortress', () => {
  const fortress = findMap('fortress');
  const { waves, paths } = fortress.level;

  it('has two entrances whose roads join, thirty-five waves and branches', () => {
    expect(paths).toHaveLength(2);
    expect(waves).toHaveLength(35);
    expect(fortress.level.towerBranches).toBe(true);
    const [west, east] = paths.map((path) => path.points);
    expect(west[0]).not.toEqual(east[0]);
    // They share the rest of the way, to one exit.
    expect(west.at(-1)).toEqual(east.at(-1));
    expect(west.slice(-4)).toEqual(east.slice(-4));
  });

  it('sends every new enemy, the ogre and the big zombie included', () => {
    for (const enemy of NEW_ENEMIES) expect(sentBy(waves).has(enemy), enemy).toBe(true);
  });

  it('brings the ogre in after the big zombie, a few at first', () => {
    const firstOf = (enemy: string) => countsOf(waves, enemy).findIndex((count) => count > 0);
    expect(firstOf('big_zombie')).toBeLessThan(firstOf('ogre'));
    expect(countsOf(waves, 'ogre')[firstOf('ogre')]).toBeLessThanOrEqual(2);
  });

  it('sends every campaign wave through both gates, as played', () => {
    for (let index = 0; index < waves.length; index++) {
      const roads = new Set(waveAt(fortress.level, index).map((group) => group.path ?? 0));
      expect(roads, `wave ${index + 1}`).toEqual(new Set([0, 1]));
    }
  });

  it('brings big zombies on wave 6 and the first ogre on wave 11, as played', () => {
    const sent = (index: number) => waveAt(fortress.level, index).map((group) => group.enemy);
    expect(sent(5)).toContain('big_zombie');
    expect(sent(9)).not.toContain('ogre');
    expect(sent(10)).toContain('ogre');
  });

  it('sends its endless waves, its own enemies included, through both gates', () => {
    const endless = playerLevel('fortress', 'normal', 'endless', {});
    const own = new Set(['skeleton', 'shaman', 'armored', 'big_zombie', 'ogre']);
    const roads = new Set<number>();
    const ownRoads = new Set<number>();
    for (let index = 0; index < 20; index++) {
      for (const group of waveAt(endless, index)) {
        roads.add(group.path ?? 0);
        if (own.has(group.enemy)) ownRoads.add(group.path ?? 0);
      }
      // Each wave uses both roads once it sends more than one group.
      if (waveAt(endless, index).length > 1) {
        expect(new Set(waveAt(endless, index).map((group) => group.path)).size, `wave ${index + 1}`).toBe(2);
      }
    }
    expect(roads).toEqual(new Set([0, 1]));
    expect(ownRoads).toEqual(new Set([0, 1]));
  });

  it('ends with bosses and an escort of every kind, through both gates', () => {
    const finale = waves[waves.length - 1];
    expect(countsOf([finale], 'boss')[0]).toBeGreaterThanOrEqual(3);
    const escort = new Set(finale.filter((group) => group.enemy !== 'boss').map((group) => group.enemy));
    expect(escort.size).toBeGreaterThanOrEqual(4);
    expect(escort.has('ogre')).toBe(true);
    expect(new Set(finale.map((group) => group.path ?? 0))).toEqual(new Set([0, 1]));
  });

  it('adds every new enemy to its endless mode', () => {
    const added = new Set((fortress.endlessExtras ?? []).map((group) => group.enemy));
    for (const enemy of NEW_ENEMIES) expect(added.has(enemy), enemy).toBe(true);
  });
});
