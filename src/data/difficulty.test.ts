import { describe, expect, it } from 'vitest';
import { applyDifficulty, DIFFICULTIES, findDifficulty } from './difficulty';
import { MAPS } from './maps';

const level = MAPS[0].level;

describe('applyDifficulty', () => {
  it('leaves the level as it is on normal', () => {
    const played = applyDifficulty(level, 'normal');
    expect(played.enemyTypes).toEqual(level.enemyTypes);
    expect(played.startingGold).toBe(level.startingGold);
  });

  it('makes every enemy weaker and the purse fuller on easy', () => {
    const played = applyDifficulty(level, 'easy');
    for (const [id, type] of Object.entries(level.enemyTypes)) {
      expect(played.enemyTypes[id].maxHp).toBeLessThan(type.maxHp);
    }
    expect(played.startingGold).toBeGreaterThan(level.startingGold);
  });

  it('makes every enemy tougher and the purse thinner on hard', () => {
    const played = applyDifficulty(level, 'hard');
    for (const [id, type] of Object.entries(level.enemyTypes)) {
      expect(played.enemyTypes[id].maxHp).toBeGreaterThan(type.maxHp);
    }
    expect(played.startingGold).toBeLessThan(level.startingGold);
  });

  it('changes nothing else about the enemies', () => {
    const played = applyDifficulty(level, 'hard');
    const { maxHp: _played, ...rest } = played.enemyTypes.soldier;
    const { maxHp: _original, ...original } = level.enemyTypes.soldier;
    expect(rest).toEqual(original);
  });

  it('does not change the level it was given', () => {
    const before = structuredClone(level.enemyTypes);
    applyDifficulty(level, 'hard');
    expect(level.enemyTypes).toEqual(before);
  });
});

describe('findDifficulty', () => {
  it('finds a difficulty by its id', () => {
    expect(findDifficulty('hard').id).toBe('hard');
  });

  it('falls back to normal for anything unknown', () => {
    expect(findDifficulty('impossible').id).toBe('normal');
    expect(findDifficulty(null).id).toBe('normal');
  });

  it('offers easy, normal and hard, in that order', () => {
    expect(DIFFICULTIES.map((difficulty) => difficulty.id)).toEqual(['easy', 'normal', 'hard']);
  });
});
