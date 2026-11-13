import { describe, expect, it } from 'vitest';
import { blockedOffsets, CROWD_GAP } from './crowd';

const along = { x: 1, y: 0 }; // A road heading right: the fan opens up and down.

describe('enemies stopped by the same hero', () => {
  it('a lone enemy stays where it is', () => {
    expect(blockedOffsets([{ id: 7, heroId: 1, direction: along }]).get(7)).toEqual({ x: 0, y: 0 });
  });

  it('two are drawn side by side, across the road, centred on their spot', () => {
    const offsets = blockedOffsets([
      { id: 3, heroId: 1, direction: along },
      { id: 5, heroId: 1, direction: along },
    ]);
    const a = offsets.get(3)!;
    const b = offsets.get(5)!;
    expect(a.x).toBeCloseTo(0);
    expect(b.x).toBeCloseTo(0);
    expect(Math.abs(a.y - b.y)).toBeCloseTo(CROWD_GAP);
    expect(a.y + b.y).toBeCloseTo(0);
  });

  it('follows the road: on a road heading down, the fan opens sideways', () => {
    const down = { x: 0, y: 1 };
    const offsets = blockedOffsets([
      { id: 1, heroId: 2, direction: down },
      { id: 2, heroId: 2, direction: down },
    ]);
    expect(offsets.get(1)!.y).toBeCloseTo(0);
    expect(Math.abs(offsets.get(1)!.x - offsets.get(2)!.x)).toBeCloseTo(CROWD_GAP);
  });

  it('keeps each enemy in its place in the fan from one frame to the next', () => {
    const first = blockedOffsets([
      { id: 9, heroId: 1, direction: along },
      { id: 4, heroId: 1, direction: along },
    ]);
    const again = blockedOffsets([
      { id: 4, heroId: 1, direction: along },
      { id: 9, heroId: 1, direction: along },
    ]);
    expect(again.get(9)).toEqual(first.get(9));
  });

  it('keeps the enemies of different heroes apart', () => {
    const offsets = blockedOffsets([
      { id: 1, heroId: 1, direction: along },
      { id: 2, heroId: 2, direction: along },
    ]);
    expect(offsets.get(1)).toEqual({ x: 0, y: 0 });
    expect(offsets.get(2)).toEqual({ x: 0, y: 0 });
  });
});
