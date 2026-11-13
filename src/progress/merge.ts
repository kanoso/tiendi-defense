import type { DifficultyId } from '../data/difficulty';
import { availableStars, emptyProgress, type EndlessRecord, type Progress } from './progress';

// Joining the progress of two devices that share a player code. Earned things
// (stars, records) keep the best of each; ranks are bought with stars, so they
// are only joined if the joined stars pay for them.

export function mergeProgress(a: Progress, b: Progress): Progress {
  const merged = emptyProgress();
  merged.stars = mergeByMapAndDifficulty(a.stars, b.stars, (x, y) => Math.max(x, y));
  merged.endless = mergeByMapAndDifficulty(a.endless, b.endless, betterEndless);

  const highest: Record<string, number> = { ...a.heroRanks };
  for (const [heroType, rank] of Object.entries(b.heroRanks)) {
    highest[heroType] = Math.max(highest[heroType] ?? 0, rank);
  }
  merged.heroRanks = highest;
  if (availableStars(merged) < 0) {
    // Not enough stars for both sets of ranks: keep the set that cost more,
    // which the joined stars always cover, since they are at least that side's.
    merged.heroRanks = { ...moreInvested(a, b).heroRanks };
  }
  return merged;
}

/** Whether two progresses hold the same things, whatever order they were saved in. */
export function sameProgress(a: Progress, b: Progress): boolean {
  return canonical(a) === canonical(b);
}

function mergeByMapAndDifficulty<T>(
  a: Record<string, Partial<Record<DifficultyId, T>>>,
  b: Record<string, Partial<Record<DifficultyId, T>>>,
  pick: (x: T, y: T) => T,
): Record<string, Partial<Record<DifficultyId, T>>> {
  const merged: Record<string, Partial<Record<DifficultyId, T>>> = {};
  for (const source of [a, b]) {
    for (const [mapId, byDifficulty] of Object.entries(source)) {
      const into = (merged[mapId] ??= {});
      for (const [difficulty, value] of Object.entries(byDifficulty) as [DifficultyId, T][]) {
        const current = into[difficulty];
        into[difficulty] = current === undefined ? value : pick(current, value);
      }
    }
  }
  return merged;
}

function betterEndless(x: EndlessRecord, y: EndlessRecord): EndlessRecord {
  if (x.score !== y.score) return x.score > y.score ? x : y;
  return x.wave >= y.wave ? x : y;
}

/** The side that spent more stars on ranks; on a tie, always the same one. */
function moreInvested(a: Progress, b: Progress): Progress {
  const spentA = spent(a);
  const spentB = spent(b);
  if (spentA !== spentB) return spentA > spentB ? a : b;
  return canonical({ ...a, stars: {}, endless: {} }) <= canonical({ ...b, stars: {}, endless: {} }) ? a : b;
}

function spent(progress: Progress): number {
  return Object.values(progress.heroRanks).reduce((sum, rank) => sum + (rank * (rank + 1)) / 2, 0);
}

/** The progress as text with every key sorted, so equal progresses read the same. */
function canonical(progress: Progress): string {
  return JSON.stringify(progress, (_key, value: unknown) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([x], [y]) => x.localeCompare(y)));
  });
}
