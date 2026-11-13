import { findDifficulty, type DifficultyId } from '../data/difficulty';
import { findMode, type GameMode } from '../data/modes';
import { parseProgress, serializeProgress, type Progress } from './progress';

const PROGRESS_KEY = 'tower-defense-heroes.progress';
const DIFFICULTY_KEY = 'tower-defense-heroes.difficulty';
const MODE_KEY = 'tower-defense-heroes.mode';

// Browser storage can be unavailable (private windows, blocked site data). The
// game then works the same, it just does not remember anything between visits.

export function loadProgress(): Progress {
  try {
    return parseProgress(localStorage.getItem(PROGRESS_KEY));
  } catch {
    return parseProgress(null);
  }
}

/** Told about every progress the player earns, to keep a copy elsewhere. */
let onSaved: ((progress: Progress) => void) | null = null;

export function whenProgressSaved(listener: ((progress: Progress) => void) | null): void {
  onSaved = listener;
}

/**
 * Keeps the progress on this device. `quietly` is for progress that came from
 * elsewhere (the server), which does not need to be sent back there.
 */
export function saveProgress(progress: Progress, quietly = false): void {
  try {
    localStorage.setItem(PROGRESS_KEY, serializeProgress(progress));
  } catch {
    // Nothing to do: see above.
  }
  if (!quietly) onSaved?.(progress);
}

/** The difficulty the player last chose. Normal for a first visit. */
export function loadDifficulty(): DifficultyId {
  try {
    return findDifficulty(localStorage.getItem(DIFFICULTY_KEY)).id;
  } catch {
    return 'normal';
  }
}

export function saveDifficulty(difficulty: DifficultyId): void {
  try {
    localStorage.setItem(DIFFICULTY_KEY, difficulty);
  } catch {
    // Nothing to do: see above.
  }
}

/** The game mode the player last chose. The campaign for a first visit. */
export function loadMode(): GameMode {
  try {
    return findMode(localStorage.getItem(MODE_KEY));
  } catch {
    return 'campaign';
  }
}

export function saveMode(mode: GameMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Nothing to do: see above.
  }
}
