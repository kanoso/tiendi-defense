import { describe, expect, it } from 'vitest';
import { applyDifficulty } from '../data/difficulty';
import { MAPS } from '../data/maps';
import { coopLevel } from './coopLevel';

describe('coopLevel', () => {
  it('is the map at its difficulty when played alone', () => {
    const level = coopLevel('meadow', 'hard', 1);
    expect(level.enemyTypes).toEqual(applyDifficulty(MAPS[0].level, 'hard').enemyTypes);
  });

  it('makes enemies tougher for every extra player', () => {
    const soldier = (players: number) => coopLevel('meadow', 'normal', players).enemyTypes.soldier.maxHp;
    expect(soldier(2)).toBeGreaterThan(soldier(1));
    expect(soldier(4)).toBeGreaterThan(soldier(2));
  });

  it('gives exactly the same level to everyone who asks the same way', () => {
    // Both the server and each player build it on their own.
    const first = JSON.stringify(coopLevel('crossroads', 'easy', 3));
    const second = JSON.stringify(coopLevel('crossroads', 'easy', 3));
    expect(second).toBe(first);
  });

  it('keeps the heroes as they come: personal upgrades stay out of shared games', () => {
    expect(coopLevel('meadow', 'normal', 2).heroTypes).toEqual(MAPS[0].level.heroTypes);
  });

  it('falls back to the first map for one it does not know', () => {
    expect(coopLevel('nowhere', 'normal', 1).paths).toBe(MAPS[0].level.paths);
  });
});
