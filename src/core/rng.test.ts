import { describe, expect, it } from 'vitest';
import { createRng, nextFloat, nextInRange } from './rng';

function take(seed: number, count: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => nextFloat(rng));
}

describe('rng', () => {
  it('produces the same sequence for the same seed', () => {
    expect(take(42, 20)).toEqual(take(42, 20));
  });

  it('produces different sequences for different seeds', () => {
    expect(take(1, 20)).not.toEqual(take(2, 20));
  });

  it('keeps every value in [0, 1)', () => {
    for (const value of take(7, 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('keeps ranged values inside the requested bounds', () => {
    const rng = createRng(3);
    for (let i = 0; i < 1000; i++) {
      const value = nextInRange(rng, 60, 90);
      expect(value).toBeGreaterThanOrEqual(60);
      expect(value).toBeLessThan(90);
    }
  });
});
