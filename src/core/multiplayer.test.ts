import { describe, expect, it } from 'vitest';
import { assignHeroes, distributeHeroes, heroShare, isAllowed, ownerOf } from './multiplayer';
import type { Command } from './types';

describe('assignHeroes', () => {
  it('gives a lone player every hero', () => {
    expect(assignHeroes(1, 4)).toEqual([[1, 2, 3, 4]]);
  });

  it('splits them evenly between two players', () => {
    expect(assignHeroes(2, 4)).toEqual([
      [1, 3],
      [2, 4],
    ]);
  });

  it('gives the first players the extra heroes when the split is uneven', () => {
    expect(assignHeroes(3, 4)).toEqual([[1, 4], [2], [3]]);
  });

  it('gives each of four players one hero', () => {
    expect(assignHeroes(4, 4)).toEqual([[1], [2], [3], [4]]);
  });

  it('leaves no hero without a player and gives none twice', () => {
    for (let players = 1; players <= 4; players++) {
      const all = assignHeroes(players, 4).flat().sort();
      expect(all).toEqual([1, 2, 3, 4]);
    }
  });

  it('leaves extra players without a hero rather than failing', () => {
    expect(assignHeroes(5, 4)).toEqual([[1], [2], [3], [4], []]);
  });
});

describe('ownerOf', () => {
  const heroes = assignHeroes(2, 4);

  it('finds the player a hero belongs to', () => {
    expect(ownerOf(heroes, 1)).toBe(0);
    expect(ownerOf(heroes, 2)).toBe(1);
    expect(ownerOf(heroes, 3)).toBe(0);
  });

  it('answers nobody for a hero that does not exist', () => {
    expect(ownerOf(heroes, 9)).toBeNull();
  });
});

describe('isAllowed', () => {
  const mine = [1, 3];
  const move = (heroId: number): Command => ({ type: 'moveHero', heroId, x: 10, y: 10 });
  const cast = (heroId: number): Command => ({ type: 'useAbility', heroId, ability: 0, x: 0, y: 0 });

  it('lets a player order their own heroes', () => {
    expect(isAllowed(move(1), mine)).toBe(true);
    expect(isAllowed(cast(3), mine)).toBe(true);
  });

  it('refuses orders for heroes that belong to someone else', () => {
    expect(isAllowed(move(2), mine)).toBe(false);
    expect(isAllowed(cast(4), mine)).toBe(false);
  });

  it('lets anyone build, upgrade and sell: towers and gold are shared', () => {
    expect(isAllowed({ type: 'buildTower', slot: 0, tower: 'archery' }, mine)).toBe(true);
    expect(isAllowed({ type: 'upgradeTower', slot: 0 }, mine)).toBe(true);
    expect(isAllowed({ type: 'sellTower', slot: 0 }, [])).toBe(true);
  });

  it('never lets a player start the wave directly: that takes everyone being ready', () => {
    expect(isAllowed({ type: 'startWave' }, mine)).toBe(false);
  });
});

describe('heroes chosen by the players', () => {
  it('without choices, hands the heroes out in turns, as before', () => {
    expect(distributeHeroes([[], []], 4)).toEqual(assignHeroes(2, 4));
    expect(distributeHeroes([[], [], [], []], 4)).toEqual(assignHeroes(4, 4));
  });

  it('gives each player the heroes they chose', () => {
    expect(distributeHeroes([[4, 2], [1]], 4)).toEqual([[4, 2], [1, 3]]);
  });

  it('never gives a player more than their fair share, keeping their first choices', () => {
    // Three players: shares of 2, 1 and 1.
    expect(heroShare(3, 4)).toBe(2);
    expect(distributeHeroes([[1, 2, 3], [], []], 4)).toEqual([[1, 2], [3], [4]]);
  });

  it('gives a hero chosen twice to whoever comes first', () => {
    expect(distributeHeroes([[3], [3]], 4)).toEqual([[3, 1], [2, 4]]);
  });

  it('ignores choices that are not heroes of the game', () => {
    expect(distributeHeroes([[9, 0, -1, 1.5], []], 4)).toEqual(assignHeroes(2, 4));
  });

  it('leaves every hero to someone, each one once', () => {
    for (const wishes of [[[2], [2], [2]], [[1, 2], [3, 4], []], [[4], [3], [2], [1]]]) {
      const result = distributeHeroes(wishes, 4);
      expect(result.flat().sort()).toEqual([1, 2, 3, 4]);
    }
  });

  it('shares out as evenly as possible', () => {
    expect(heroShare(1, 4)).toBe(4);
    expect(heroShare(2, 4)).toBe(2);
    expect(heroShare(4, 4)).toBe(1);
  });
});
