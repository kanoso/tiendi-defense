import { describe, expect, it } from 'vitest';
import { RUBBLE_FADE_TICKS, rubbleAlpha } from './rubble';

describe('rubbleAlpha', () => {
  it('shows the rocks whole the moment the spot is cleared', () => {
    expect(rubbleAlpha(0)).toBe(1);
  });

  it('fades them out evenly, tick by tick', () => {
    expect(rubbleAlpha(RUBBLE_FADE_TICKS / 2)).toBeCloseTo(0.5);
    expect(rubbleAlpha(1)).toBeLessThan(1);
    expect(rubbleAlpha(2)).toBeLessThan(rubbleAlpha(1));
  });

  it('leaves nothing once the fade is over, however long ago', () => {
    expect(rubbleAlpha(RUBBLE_FADE_TICKS)).toBe(0);
    expect(rubbleAlpha(RUBBLE_FADE_TICKS * 10)).toBe(0);
    expect(rubbleAlpha(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('keeps them whole when the game went back in time, as after a restart', () => {
    expect(rubbleAlpha(-5)).toBe(1);
  });
});
