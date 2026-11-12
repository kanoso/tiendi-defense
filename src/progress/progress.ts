import { DIFFICULTY_IDS, type DifficultyId } from '../data/difficulty';

// What the player keeps between games. Pure data and rules; the browser storage
// lives in `storage.ts`.

const VERSION = 2;
const MAX_STARS = 3;

/** Highest permanent rank a hero can reach. Rank n costs n stars. */
export const MAX_HERO_RANK = 3;

export interface Progress {
  version: number;
  /** Best stars earned on each map, by map id and then by difficulty. */
  stars: Record<string, Partial<Record<DifficultyId, number>>>;
  /** Permanent rank bought for each hero type. A hero without an entry has none. */
  heroRanks: Record<string, number>;
}

export function emptyProgress(): Progress {
  return { version: VERSION, stars: {}, heroRanks: {} };
}

/** Stars for a victory: three for a near-perfect defence, two for keeping half, one otherwise. */
export function starsFor(livesLeft: number, startingLives: number): number {
  const kept = livesLeft / startingLives;
  if (kept >= 0.9) return 3;
  if (kept >= 0.5) return 2;
  return 1;
}

// --- stars ---------------------------------------------------------------

export function starsOn(progress: Progress, mapId: string, difficulty: DifficultyId): number {
  return progress.stars[mapId]?.[difficulty] ?? 0;
}

/** The best result on a map at any difficulty. Zero when it was never won. */
export function bestStars(progress: Progress, mapId: string): number {
  return Math.max(0, ...Object.values(progress.stars[mapId] ?? {}));
}

/** Returns the progress after a victory. A worse result never replaces a better one. */
export function recordVictory(
  progress: Progress,
  mapId: string,
  difficulty: DifficultyId,
  stars: number,
): Progress {
  const best = Math.max(starsOn(progress, mapId, difficulty), stars);
  return {
    ...progress,
    stars: { ...progress.stars, [mapId]: { ...progress.stars[mapId], [difficulty]: best } },
  };
}

/** Every star earned, on every map and difficulty. */
export function totalStars(progress: Progress): number {
  return Object.values(progress.stars)
    .flatMap((byDifficulty) => Object.values(byDifficulty))
    .reduce((sum, stars) => sum + stars, 0);
}

/** `mapIds` is the order maps are played in. A map opens when the one before it is won. */
export function isUnlocked(progress: Progress, mapIds: readonly string[], mapId: string): boolean {
  const index = mapIds.indexOf(mapId);
  if (index === -1) return false;
  return index === 0 || bestStars(progress, mapIds[index - 1]) > 0;
}

// --- hero ranks ----------------------------------------------------------

export function heroRank(progress: Progress, heroType: string): number {
  return progress.heroRanks[heroType] ?? 0;
}

/** Stars a rank costs in total: 1 + 2 + … + rank. */
function costOfRank(rank: number): number {
  return (rank * (rank + 1)) / 2;
}

function spentStars(progress: Progress): number {
  return Object.values(progress.heroRanks).reduce((sum, rank) => sum + costOfRank(rank), 0);
}

/** Stars earned and not yet spent on hero ranks. */
export function availableStars(progress: Progress): number {
  return totalStars(progress) - spentStars(progress);
}

/** Stars the hero's next rank costs, or null when it is at the top. */
export function nextRankCost(progress: Progress, heroType: string): number | null {
  const next = heroRank(progress, heroType) + 1;
  return next > MAX_HERO_RANK ? null : next;
}

/** Returns the progress after buying the hero's next rank, or unchanged if it cannot be bought. */
export function buyHeroRank(progress: Progress, heroType: string): Progress {
  const cost = nextRankCost(progress, heroType);
  if (cost === null || cost > availableStars(progress)) return progress;
  return {
    ...progress,
    heroRanks: { ...progress.heroRanks, [heroType]: heroRank(progress, heroType) + 1 },
  };
}

// --- saving --------------------------------------------------------------

export function serializeProgress(progress: Progress): string {
  return JSON.stringify(progress);
}

/**
 * Reads saved progress. Saved text can be missing, edited by hand or left by an
 * older version, so anything unexpected is dropped rather than trusted.
 */
export function parseProgress(saved: string | null): Progress {
  if (saved === null) return emptyProgress();
  let data: unknown;
  try {
    data = JSON.parse(saved);
  } catch {
    return emptyProgress();
  }
  if (!isRecord(data) || !isRecord(data.stars)) return emptyProgress();

  const progress = emptyProgress();
  if (data.version === 1) {
    // Version 1 had no difficulties: one star count per map, all played on normal.
    for (const [mapId, stars] of Object.entries(data.stars)) {
      if (isWholeNumberIn(stars, 1, MAX_STARS)) progress.stars[mapId] = { normal: stars };
    }
    return progress;
  }
  if (data.version !== VERSION) return emptyProgress();

  for (const [mapId, byDifficulty] of Object.entries(data.stars)) {
    if (!isRecord(byDifficulty)) continue;
    for (const difficulty of DIFFICULTY_IDS) {
      const stars = byDifficulty[difficulty];
      if (!isWholeNumberIn(stars, 1, MAX_STARS)) continue;
      progress.stars[mapId] = { ...progress.stars[mapId], [difficulty]: stars };
    }
  }
  if (isRecord(data.heroRanks)) {
    for (const [heroType, rank] of Object.entries(data.heroRanks)) {
      if (isWholeNumberIn(rank, 1, MAX_HERO_RANK)) progress.heroRanks[heroType] = rank;
    }
  }
  // Ranks the stars cannot pay for mean the save was tampered with or damaged.
  if (availableStars(progress) < 0) progress.heroRanks = {};
  return progress;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWholeNumberIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}
