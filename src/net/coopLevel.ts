import type { Level } from '../core/simulation';
import { applyDifficulty, type DifficultyId } from '../data/difficulty';
import { findMap } from '../data/maps';

/** Extra enemy health for each player beyond the first, as a fraction. */
const HEALTH_PER_EXTRA_PLAYER = 0.1;

/**
 * The level a shared game is played on. The server and every player build it on
 * their own from these three values and must get exactly the same thing, so it
 * depends on nothing else: no saved progress, no personal hero upgrades.
 *
 * More players means more hands for the same four heroes, so enemies get a
 * little tougher with each one.
 */
export function coopLevel(mapId: string, difficulty: DifficultyId, playerCount: number): Level {
  const level = applyDifficulty(findMap(mapId).level, difficulty);
  const scale = 1 + HEALTH_PER_EXTRA_PLAYER * (Math.max(1, playerCount) - 1);
  if (scale === 1) return level;

  const enemyTypes = Object.fromEntries(
    Object.entries(level.enemyTypes).map(([type, enemy]) => [
      type,
      { ...enemy, maxHp: Math.round(enemy.maxHp * scale) },
    ]),
  );
  return { ...level, enemyTypes };
}
