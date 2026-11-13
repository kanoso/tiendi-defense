import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bodyCenterRise,
  FOOT_DROP,
  frameCount,
  FRAME_SPACING,
  headRise,
  HIT_FLASH_TICKS,
  IDLE_TICKS_PER_FRAME,
  RUN_TICKS_PER_FRAME,
  tapsUnit,
  ticksSinceHit,
  trackHit,
  UNIT_SHEETS,
  unitFrame,
  type UnitSheet,
} from './units';

const knight: UnitSheet = { frameWidth: 16, frameHeight: 28, bodyRows: 22, hasHit: true };
const goblin: UnitSheet = { frameWidth: 16, frameHeight: 16, bodyRows: 12, hasHit: false };
const standing = { moving: false, ticksSinceHit: null };
const walking = { moving: true, ticksSinceHit: null };

describe('unitFrame', () => {
  it('loops the four idle frames while the unit stands', () => {
    const frames = [0, 1, 2, 3, 4].map((step) => unitFrame(knight, standing, step * IDLE_TICKS_PER_FRAME, 0));
    expect(frames).toEqual([0, 1, 2, 3, 0]);
  });

  it('loops the four run frames, faster, while the unit moves', () => {
    expect(RUN_TICKS_PER_FRAME).toBeLessThan(IDLE_TICKS_PER_FRAME);
    const frames = [0, 1, 2, 3, 4].map((step) => unitFrame(knight, walking, step * RUN_TICKS_PER_FRAME, 0));
    expect(frames).toEqual([4, 5, 6, 7, 4]);
  });

  it('holds a frame for as long as the game tick does not advance', () => {
    // Frames follow game ticks, not the clock, so a paused game holds still.
    expect(unitFrame(knight, walking, 123, 2)).toBe(unitFrame(knight, walking, 123, 2));
    expect(unitFrame(knight, walking, RUN_TICKS_PER_FRAME - 1, 0)).toBe(unitFrame(knight, walking, 0, 0));
  });

  it('puts units with different seeds out of step', () => {
    const frames = new Set([0, 1, 2, 3].map((seed) => unitFrame(goblin, walking, 0, seed)));
    expect(frames.size).toBeGreaterThan(1);
  });

  it('flashes the hit frame for a moment after a hit, where the sheet has one', () => {
    expect(unitFrame(knight, { moving: true, ticksSinceHit: 0 }, 50, 0)).toBe(8);
    expect(unitFrame(knight, { moving: false, ticksSinceHit: HIT_FLASH_TICKS - 1 }, 50, 0)).toBe(8);
    expect(unitFrame(knight, { moving: false, ticksSinceHit: HIT_FLASH_TICKS }, 50, 0)).toBe(
      unitFrame(knight, standing, 50, 0),
    );
  });

  it('ignores hits on sheets without a hit frame', () => {
    expect(unitFrame(goblin, { moving: false, ticksSinceHit: 0 }, 50, 0)).toBe(unitFrame(goblin, standing, 50, 0));
  });

  it('ignores a hit from the future, as after the game is replaced by an older copy', () => {
    expect(unitFrame(knight, { moving: false, ticksSinceHit: -3 }, 50, 0)).toBe(unitFrame(knight, standing, 50, 0));
  });
});

describe('trackHit', () => {
  it('records the tick when health drops', () => {
    expect(trackHit({ hp: 100, hitTick: null }, 90, 40)).toEqual({ hp: 90, hitTick: 40 });
  });

  it('keeps the previous hit when health stays or rises', () => {
    expect(trackHit({ hp: 90, hitTick: 12 }, 90, 40)).toEqual({ hp: 90, hitTick: 12 });
    expect(trackHit({ hp: 90, hitTick: 12 }, 100, 40)).toEqual({ hp: 100, hitTick: 12 });
  });

  it('forgets a hit later than the game, so a rewound shared game does not replay it', () => {
    // The server sent tick 900 after this copy had seen a hit at 995.
    expect(trackHit({ hp: 90, hitTick: 995 }, 90, 900)).toEqual({ hp: 90, hitTick: null });
  });

  it('feeds unitFrame a hit that shows, then wears off', () => {
    let state = trackHit({ hp: 100, hitTick: null }, 80, 50);
    const frameAt = (tick: number) => {
      state = trackHit(state, 80, tick);
      return unitFrame(knight, { moving: false, ticksSinceHit: ticksSinceHit(state, tick) }, tick, 0);
    };
    expect(frameAt(50)).toBe(8);
    expect(frameAt(50 + HIT_FLASH_TICKS - 1)).toBe(8);
    expect(frameAt(50 + HIT_FLASH_TICKS)).not.toBe(8);
  });

  it('has no time since a hit before the first one', () => {
    expect(ticksSinceHit({ hp: 100, hitTick: null }, 50)).toBeNull();
  });
});

describe('tapsUnit', () => {
  const at = { x: 100, y: 200 };
  // A hero: a 15 px body, taps up to 10 px away still count.
  const tap = (x: number, y: number, sheet: UnitSheet = knight) => tapsUnit({ x, y }, at, sheet, 2, 15, 10);

  it('counts a tap on the very top of a tall head', () => {
    expect(tap(100, 200 - headRise(knight, 2) + 1)).toBe(true);
  });

  it('counts a tap on the feet and anywhere the old circle reached', () => {
    expect(tap(100, 200 + FOOT_DROP)).toBe(true);
    expect(tap(100, 225)).toBe(true);
    expect(tap(125, 200)).toBe(true);
  });

  it('misses a tap well above the head, below the feet or to the side', () => {
    expect(tap(100, 200 - headRise(knight, 2) - 11)).toBe(false);
    expect(tap(100, 226)).toBe(false);
    expect(tap(126, 200)).toBe(false);
    expect(tap(126, 190)).toBe(false);
  });

  it('is the old circle for a unit whose head stays inside it', () => {
    expect(tap(100, 175, goblin)).toBe(true);
    expect(tap(100, 174, goblin)).toBe(false);
  });
});

describe('unit layout', () => {
  it('stands the feet a fixed distance below the map point', () => {
    // 22 rows drawn twice as large reach 44 px up from the feet.
    expect(headRise(knight, 2)).toBe(44 - FOOT_DROP);
    expect(bodyCenterRise(knight, 2)).toBe(22 - FOOT_DROP);
  });
});

describe('UNIT_SHEETS', () => {
  // The PNG header holds the size: width and height at bytes 16 and 20.
  const pngSize = (name: string) => {
    const file = readFileSync(new URL(`../../public/assets/sprites/${name}.png`, import.meta.url));
    return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
  };

  it.each(Object.entries(UNIT_SHEETS))('matches the strip in %s.png', (name, sheet) => {
    const count = frameCount(sheet);
    expect(pngSize(name)).toEqual({
      width: count * sheet.frameWidth + (count - 1) * FRAME_SPACING,
      height: sheet.frameHeight,
    });
  });
});
