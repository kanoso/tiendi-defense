// Where the map picker's carousel stands. Pure rules, so the menu only draws.

/** The first card a window of `shown` cards may start at, kept inside a strip of `total`. */
export function clampFirst(first: number, total: number, shown: number): number {
  return Math.min(Math.max(first, 0), Math.max(0, total - shown));
}

export interface CarouselStart {
  /** Where the window was left, or null before it was first drawn. */
  kept: number | null;
  /** Index of the newest open map when it was left. */
  keptNewest: number;
  /** Index of the newest open map now. */
  newest: number;
  total: number;
  shown: number;
}

/**
 * The first card in view when the menu opens. It stays where the player left
 * it, unless a map was unlocked since: then it shows that map, one card in
 * from the edge when there is room.
 */
export function carouselStart({ kept, keptNewest, newest, total, shown }: CarouselStart): number {
  const first = kept !== null && newest <= keptNewest ? kept : newest - 1;
  return clampFirst(first, total, shown);
}
