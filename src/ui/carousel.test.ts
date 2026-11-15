import { describe, expect, it } from 'vitest';
import { carouselStart, clampFirst } from './carousel';

// Five maps, three in view: the window can start at 0, 1 or 2.
const FIVE = { total: 5, shown: 3 };

describe('where the map carousel opens', () => {
  it('shows the newest open map on a first visit, one card in from the edge when there is room', () => {
    expect(carouselStart({ ...FIVE, kept: null, keptNewest: -1, newest: 0 })).toBe(0);
    expect(carouselStart({ ...FIVE, kept: null, keptNewest: -1, newest: 2 })).toBe(1);
    expect(carouselStart({ ...FIVE, kept: null, keptNewest: -1, newest: 3 })).toBe(2);
    expect(carouselStart({ ...FIVE, kept: null, keptNewest: -1, newest: 4 })).toBe(2);
  });

  it('keeps the place the player left it across a restart, when nothing new opened', () => {
    expect(carouselStart({ ...FIVE, kept: 0, keptNewest: 3, newest: 3 })).toBe(0);
    expect(carouselStart({ ...FIVE, kept: 2, keptNewest: 0, newest: 0 })).toBe(2);
  });

  it('jumps to a map unlocked since, wherever it was left', () => {
    expect(carouselStart({ ...FIVE, kept: 0, keptNewest: 2, newest: 3 })).toBe(2);
    expect(carouselStart({ ...FIVE, kept: 0, keptNewest: 0, newest: 1 })).toBe(0);
  });

  it('never starts past the last full window, nor before the first', () => {
    expect(carouselStart({ ...FIVE, kept: 7, keptNewest: 4, newest: 4 })).toBe(2);
    expect(carouselStart({ ...FIVE, kept: -3, keptNewest: 4, newest: 4 })).toBe(0);
    expect(carouselStart({ total: 2, shown: 3, kept: null, keptNewest: -1, newest: 1 })).toBe(0);
  });
});

describe('clampFirst', () => {
  it('keeps the window inside the strip', () => {
    expect([-1, 0, 1, 2, 3].map((first) => clampFirst(first, 5, 3))).toEqual([0, 0, 1, 2, 2]);
  });
});
