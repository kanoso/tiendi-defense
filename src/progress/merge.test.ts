import { describe, expect, it } from 'vitest';
import { mergeProgress, sameProgress } from './merge';
import {
  availableStars,
  emptyProgress,
  recordEndless,
  recordVictory,
  type Progress,
} from './progress';

function withStars(entries: [string, 'easy' | 'normal' | 'hard', number][]): Progress {
  return entries.reduce(
    (progress, [map, difficulty, stars]) => recordVictory(progress, map, difficulty, stars),
    emptyProgress(),
  );
}

describe('joining the progress of two devices', () => {
  it('keeps the best stars of each map and difficulty', () => {
    const phone = withStars([['meadow', 'normal', 2], ['canyon', 'easy', 1]]);
    const computer = withStars([['meadow', 'normal', 3], ['meadow', 'hard', 1]]);
    const merged = mergeProgress(phone, computer);
    expect(merged.stars).toEqual({
      meadow: { normal: 3, hard: 1 },
      canyon: { easy: 1 },
    });
  });

  it('keeps the best endless game of each map and difficulty', () => {
    const phone = recordEndless(emptyProgress(), 'meadow', 'normal', { score: 500, wave: 12 });
    const computer = recordEndless(emptyProgress(), 'meadow', 'normal', { score: 300, wave: 15 });
    expect(mergeProgress(phone, computer).endless.meadow?.normal).toEqual({ score: 500, wave: 12 });
    expect(mergeProgress(computer, phone).endless.meadow?.normal).toEqual({ score: 500, wave: 12 });
  });

  it('keeps the higher rank of each hero when the stars cover them all', () => {
    const phone = { ...withStars([['meadow', 'normal', 3], ['canyon', 'normal', 3]]), heroRanks: { warrior: 2 } };
    const computer = { ...withStars([['meadow', 'normal', 3]]), heroRanks: { mage: 1 } };
    const merged = mergeProgress(phone, computer);
    expect(merged.heroRanks).toEqual({ warrior: 2, mage: 1 });
    expect(availableStars(merged)).toBeGreaterThanOrEqual(0);
  });

  it('never spends more stars than were earned: keeps the ranks of the side that invested more', () => {
    // Both devices earned the same 3 stars and spent them on different heroes.
    const phone = { ...withStars([['meadow', 'normal', 3]]), heroRanks: { warrior: 2 } };
    const computer = { ...withStars([['meadow', 'normal', 3]]), heroRanks: { mage: 1 } };
    const merged = mergeProgress(phone, computer);
    expect(merged.heroRanks).toEqual({ warrior: 2 });
    expect(availableStars(merged)).toBe(0);
  });

  it('gives the same result whichever device comes first', () => {
    const phone = { ...withStars([['meadow', 'normal', 2]]), heroRanks: { archer: 1 } };
    const computer = { ...withStars([['canyon', 'hard', 3]]), heroRanks: { support: 1 } };
    expect(mergeProgress(phone, computer)).toEqual(mergeProgress(computer, phone));
  });

  it('changes nothing when joined with an empty progress', () => {
    const phone = { ...withStars([['meadow', 'normal', 2]]), heroRanks: { archer: 1 } };
    expect(sameProgress(mergeProgress(phone, emptyProgress()), phone)).toBe(true);
  });
});

describe('telling whether two progresses are the same', () => {
  it('ignores the order things were saved in', () => {
    const a = withStars([['meadow', 'normal', 2], ['canyon', 'easy', 1]]);
    const b = withStars([['canyon', 'easy', 1], ['meadow', 'normal', 2]]);
    expect(sameProgress(a, b)).toBe(true);
  });

  it('notices any difference', () => {
    expect(sameProgress(withStars([['meadow', 'normal', 2]]), withStars([['meadow', 'normal', 3]]))).toBe(false);
  });
});
