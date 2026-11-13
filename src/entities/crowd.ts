import type { Point } from '../core/path';

// Where to draw enemies that stand on the same spot. The simulation keeps them
// on the road, one on top of the other; this only spreads them out on screen,
// so every player still plays exactly the same game.

/** Distance between neighbours in the fan, in map units. */
export const CROWD_GAP = 26;

export interface BlockedEnemy {
  id: number;
  heroId: number;
  /** The way the road goes where the enemy stopped. Any length. */
  direction: Point;
}

/**
 * How far to shift each enemy held by a hero, so the ones held by the same
 * hero stand side by side across the road instead of in one pile.
 */
export function blockedOffsets(enemies: readonly BlockedEnemy[]): Map<number, Point> {
  const byHero = new Map<number, BlockedEnemy[]>();
  for (const enemy of enemies) {
    const group = byHero.get(enemy.heroId) ?? [];
    group.push(enemy);
    byHero.set(enemy.heroId, group);
  }

  const offsets = new Map<number, Point>();
  for (const group of byHero.values()) {
    // Ordered by id, so each enemy keeps its place from frame to frame.
    group.sort((a, b) => a.id - b.id);
    group.forEach((enemy, index) => {
      const length = Math.hypot(enemy.direction.x, enemy.direction.y) || 1;
      // Across the road: the direction turned a quarter.
      const across = { x: -enemy.direction.y / length, y: enemy.direction.x / length };
      const shift = (index - (group.length - 1) / 2) * CROWD_GAP;
      // `+ 0` turns a negative zero into a plain one.
      offsets.set(enemy.id, { x: across.x * shift + 0, y: across.y * shift + 0 });
    });
  }
  return offsets;
}
