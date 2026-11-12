import { describe, expect, it } from 'vitest';
import {
  availableStars,
  bestStars,
  buyHeroRank,
  emptyProgress,
  endlessBest,
  heroRank,
  isUnlocked,
  MAX_HERO_RANK,
  nextRankCost,
  parseProgress,
  recordEndless,
  recordVictory,
  serializeProgress,
  starsFor,
  starsOn,
  totalStars,
  type Progress,
} from './progress';

const MAPS = ['meadow', 'canyon', 'crossroads'];

/** Progress with enough stars to spend: three on each of two maps, on normal. */
function withSixStars(): Progress {
  return recordVictory(recordVictory(emptyProgress(), 'meadow', 'normal', 3), 'canyon', 'normal', 3);
}

describe('starsFor', () => {
  it('gives three stars for losing at most a tenth of the lives', () => {
    expect(starsFor(20, 20)).toBe(3);
    expect(starsFor(18, 20)).toBe(3);
  });

  it('gives two stars for keeping at least half', () => {
    expect(starsFor(17, 20)).toBe(2);
    expect(starsFor(10, 20)).toBe(2);
  });

  it('gives one star for any other victory', () => {
    expect(starsFor(9, 20)).toBe(1);
    expect(starsFor(1, 20)).toBe(1);
  });
});

describe('recordVictory', () => {
  it('stores the stars earned on a map at a difficulty', () => {
    const progress = recordVictory(emptyProgress(), 'meadow', 'normal', 2);
    expect(starsOn(progress, 'meadow', 'normal')).toBe(2);
  });

  it('keeps each difficulty apart', () => {
    let progress = recordVictory(emptyProgress(), 'meadow', 'easy', 3);
    progress = recordVictory(progress, 'meadow', 'hard', 1);
    expect(starsOn(progress, 'meadow', 'easy')).toBe(3);
    expect(starsOn(progress, 'meadow', 'hard')).toBe(1);
    expect(starsOn(progress, 'meadow', 'normal')).toBe(0);
  });

  it('keeps the best result when a later one is worse', () => {
    let progress = recordVictory(emptyProgress(), 'meadow', 'normal', 3);
    progress = recordVictory(progress, 'meadow', 'normal', 1);
    expect(starsOn(progress, 'meadow', 'normal')).toBe(3);
  });

  it('replaces the result when a later one is better', () => {
    let progress = recordVictory(emptyProgress(), 'meadow', 'normal', 1);
    progress = recordVictory(progress, 'meadow', 'normal', 3);
    expect(starsOn(progress, 'meadow', 'normal')).toBe(3);
  });

  it('does not change the progress it was given', () => {
    const before = emptyProgress();
    recordVictory(before, 'meadow', 'normal', 3);
    expect(before).toEqual(emptyProgress());
  });
});

describe('star counts', () => {
  it('adds up the stars of every map and difficulty', () => {
    let progress = recordVictory(emptyProgress(), 'meadow', 'normal', 3);
    progress = recordVictory(progress, 'meadow', 'hard', 1);
    progress = recordVictory(progress, 'canyon', 'easy', 2);
    expect(totalStars(progress)).toBe(6);
  });

  it('reports the best result of a map across difficulties', () => {
    let progress = recordVictory(emptyProgress(), 'meadow', 'easy', 3);
    progress = recordVictory(progress, 'meadow', 'hard', 1);
    expect(bestStars(progress, 'meadow')).toBe(3);
    expect(bestStars(progress, 'canyon')).toBe(0);
  });
});

describe('isUnlocked', () => {
  it('always opens the first map', () => {
    expect(isUnlocked(emptyProgress(), MAPS, 'meadow')).toBe(true);
  });

  it('keeps a map closed until the one before it is won', () => {
    expect(isUnlocked(emptyProgress(), MAPS, 'canyon')).toBe(false);
  });

  it('opens a map once the one before it is won at any difficulty', () => {
    const progress = recordVictory(emptyProgress(), 'meadow', 'easy', 1);
    expect(isUnlocked(progress, MAPS, 'canyon')).toBe(true);
    expect(isUnlocked(progress, MAPS, 'crossroads')).toBe(false);
  });

  it('never opens a map that does not exist', () => {
    expect(isUnlocked(emptyProgress(), MAPS, 'nowhere')).toBe(false);
  });
});

describe('hero ranks', () => {
  it('start at zero', () => {
    expect(heroRank(emptyProgress(), 'warrior')).toBe(0);
  });

  it('cost one star more each time', () => {
    let progress = withSixStars();
    expect(nextRankCost(progress, 'warrior')).toBe(1);
    progress = buyHeroRank(progress, 'warrior');
    expect(nextRankCost(progress, 'warrior')).toBe(2);
    progress = buyHeroRank(progress, 'warrior');
    expect(nextRankCost(progress, 'warrior')).toBe(3);
  });

  it('are paid with the stars not yet spent', () => {
    let progress = withSixStars();
    expect(availableStars(progress)).toBe(6);
    progress = buyHeroRank(progress, 'warrior');
    progress = buyHeroRank(progress, 'warrior');
    expect(heroRank(progress, 'warrior')).toBe(2);
    expect(availableStars(progress)).toBe(3);
    expect(totalStars(progress)).toBe(6);
  });

  it('cannot be bought without enough stars', () => {
    const poor = recordVictory(emptyProgress(), 'meadow', 'normal', 1);
    const afterFirst = buyHeroRank(poor, 'mage');
    expect(heroRank(afterFirst, 'mage')).toBe(1);
    // The second rank costs two and none are left.
    expect(buyHeroRank(afterFirst, 'mage')).toEqual(afterFirst);
  });

  it('stop at the top rank', () => {
    let progress = withSixStars();
    for (let i = 0; i < MAX_HERO_RANK + 2; i++) progress = buyHeroRank(progress, 'archer');
    expect(heroRank(progress, 'archer')).toBe(MAX_HERO_RANK);
    expect(nextRankCost(progress, 'archer')).toBeNull();
  });

  it('belong to each hero separately', () => {
    const progress = buyHeroRank(withSixStars(), 'warrior');
    expect(heroRank(progress, 'warrior')).toBe(1);
    expect(heroRank(progress, 'mage')).toBe(0);
  });

  it('do not change the progress they were given', () => {
    const before = withSixStars();
    buyHeroRank(before, 'warrior');
    expect(heroRank(before, 'warrior')).toBe(0);
  });
});

describe('saving', () => {
  it('reads back what it wrote', () => {
    const progress = buyHeroRank(withSixStars(), 'support');
    expect(parseProgress(serializeProgress(progress))).toEqual(progress);
  });

  it('starts fresh when nothing was saved', () => {
    expect(parseProgress(null)).toEqual(emptyProgress());
  });

  it('starts fresh when the saved text is damaged', () => {
    expect(parseProgress('{not json')).toEqual(emptyProgress());
    expect(parseProgress('42')).toEqual(emptyProgress());
    expect(parseProgress('{"version":2,"stars":"lots"}')).toEqual(emptyProgress());
  });

  it('starts fresh when the save comes from an unknown version', () => {
    expect(parseProgress('{"version":99,"stars":{}}')).toEqual(emptyProgress());
  });

  it('carries over a save from before difficulties existed, as normal', () => {
    const progress = parseProgress('{"version":1,"stars":{"meadow":2,"canyon":3}}');
    expect(starsOn(progress, 'meadow', 'normal')).toBe(2);
    expect(starsOn(progress, 'canyon', 'normal')).toBe(3);
    expect(totalStars(progress)).toBe(5);
  });

  it('drops star counts that make no sense and keeps the rest', () => {
    const saved = JSON.stringify({
      version: 2,
      stars: { meadow: { normal: 2, hard: 7, brutal: 3 }, canyon: 'x', cave: { easy: -1 } },
      heroRanks: {},
    });
    const progress = parseProgress(saved);
    expect(starsOn(progress, 'meadow', 'normal')).toBe(2);
    expect(totalStars(progress)).toBe(2);
  });

  it('drops hero ranks that make no sense', () => {
    const saved = JSON.stringify({
      version: 2,
      stars: { meadow: { normal: 3 } },
      heroRanks: { warrior: 1, mage: 9, archer: 'x' },
    });
    const progress = parseProgress(saved);
    expect(heroRank(progress, 'warrior')).toBe(1);
    expect(heroRank(progress, 'mage')).toBe(0);
    expect(heroRank(progress, 'archer')).toBe(0);
  });

  it('forgets ranks that cost more stars than the save has', () => {
    // An edited save: a top rank costs six stars and only one was earned.
    const saved = JSON.stringify({
      version: 2,
      stars: { meadow: { normal: 1 } },
      heroRanks: { warrior: 3 },
    });
    const progress = parseProgress(saved);
    expect(heroRank(progress, 'warrior')).toBe(0);
    expect(availableStars(progress)).toBe(1);
  });
});

describe('endless records', () => {
  it('start out empty', () => {
    expect(endlessBest(emptyProgress(), 'meadow', 'normal')).toBeNull();
  });

  it('keep the score and the wave reached', () => {
    const progress = recordEndless(emptyProgress(), 'meadow', 'normal', { score: 1200, wave: 9 });
    expect(endlessBest(progress, 'meadow', 'normal')).toEqual({ score: 1200, wave: 9 });
  });

  it('are replaced only by a higher score', () => {
    let progress = recordEndless(emptyProgress(), 'meadow', 'normal', { score: 1200, wave: 9 });
    progress = recordEndless(progress, 'meadow', 'normal', { score: 800, wave: 11 });
    expect(endlessBest(progress, 'meadow', 'normal')).toEqual({ score: 1200, wave: 9 });
    progress = recordEndless(progress, 'meadow', 'normal', { score: 1500, wave: 10 });
    expect(endlessBest(progress, 'meadow', 'normal')).toEqual({ score: 1500, wave: 10 });
  });

  it('are kept apart for each map and difficulty', () => {
    let progress = recordEndless(emptyProgress(), 'meadow', 'normal', { score: 1200, wave: 9 });
    progress = recordEndless(progress, 'meadow', 'hard', { score: 300, wave: 3 });
    expect(endlessBest(progress, 'meadow', 'hard')).toEqual({ score: 300, wave: 3 });
    expect(endlessBest(progress, 'canyon', 'normal')).toBeNull();
  });

  it('give no stars', () => {
    const progress = recordEndless(emptyProgress(), 'meadow', 'normal', { score: 9999, wave: 40 });
    expect(totalStars(progress)).toBe(0);
  });

  it('do not change the progress they were given', () => {
    const before = emptyProgress();
    recordEndless(before, 'meadow', 'normal', { score: 1200, wave: 9 });
    expect(before).toEqual(emptyProgress());
  });

  it('survive saving and loading', () => {
    const progress = recordEndless(withSixStars(), 'canyon', 'easy', { score: 640, wave: 5 });
    expect(parseProgress(serializeProgress(progress))).toEqual(progress);
  });

  it('are simply absent in saves made before endless mode existed', () => {
    const saved = JSON.stringify({ version: 2, stars: { meadow: { normal: 3 } }, heroRanks: {} });
    const progress = parseProgress(saved);
    expect(endlessBest(progress, 'meadow', 'normal')).toBeNull();
    expect(totalStars(progress)).toBe(3);
  });

  it('are dropped when they make no sense', () => {
    const saved = JSON.stringify({
      version: 2,
      stars: {},
      heroRanks: {},
      endless: {
        meadow: { normal: { score: -5, wave: 2 }, hard: { score: 100, wave: 'x' }, easy: 7 },
        canyon: { normal: { score: 250, wave: 4 } },
      },
    });
    const progress = parseProgress(saved);
    expect(endlessBest(progress, 'meadow', 'normal')).toBeNull();
    expect(endlessBest(progress, 'meadow', 'hard')).toBeNull();
    expect(endlessBest(progress, 'meadow', 'easy')).toBeNull();
    expect(endlessBest(progress, 'canyon', 'normal')).toEqual({ score: 250, wave: 4 });
  });
});
