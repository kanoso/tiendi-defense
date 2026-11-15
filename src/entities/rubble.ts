import { TICKS_PER_SECOND } from '../core/types';

// The rocks on a cleared spot do not vanish at once: they fade out, timed by
// game ticks, so a paused game holds them and a faster one hurries them along.

export const RUBBLE_FADE_TICKS = Math.round(TICKS_PER_SECOND * 0.4);

/** How visible the rocks are `since` ticks after their spot was cleared, from 1 down to 0. */
export function rubbleAlpha(since: number): number {
  if (since <= 0) return 1;
  return Math.max(0, 1 - since / RUBBLE_FADE_TICKS);
}
