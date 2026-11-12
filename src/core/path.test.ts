import { describe, expect, it } from 'vitest';
import { createPath, pointAt } from './path';

// An L-shaped path: 100 to the right, then 50 down.
const path = createPath([
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
]);

describe('createPath', () => {
  it('measures the total length across all segments', () => {
    expect(path.length).toBe(150);
  });

  it('rejects a path with fewer than two points', () => {
    expect(() => createPath([{ x: 0, y: 0 }])).toThrow();
  });
});

describe('pointAt', () => {
  it('returns the start at distance zero', () => {
    expect(pointAt(path, 0)).toEqual({ x: 0, y: 0 });
  });

  it('returns a point inside the first segment', () => {
    expect(pointAt(path, 40)).toEqual({ x: 40, y: 0 });
  });

  it('turns the corner into the second segment', () => {
    expect(pointAt(path, 120)).toEqual({ x: 100, y: 20 });
  });

  it('clamps to the end when the distance exceeds the path', () => {
    expect(pointAt(path, 999)).toEqual({ x: 100, y: 50 });
  });

  it('clamps to the start for negative distances', () => {
    expect(pointAt(path, -5)).toEqual({ x: 0, y: 0 });
  });
});
