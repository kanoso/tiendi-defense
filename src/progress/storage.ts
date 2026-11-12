import { findDifficulty, type DifficultyId } from '../data/difficulty';
import { parseProgress, serializeProgress, type Progress } from './progress';

const PROGRESS_KEY = 'tower-defense-heroes.progress';
const DIFFICULTY_KEY = 'tower-defense-heroes.difficulty';

// Browser storage can be unavailable (private windows, blocked site data). The
// game then works the same, it just does not remember anything between visits.

export function loadProgress(): Progress {
  try {
    return parseProgress(localStorage.getItem(PROGRESS_KEY));
  } catch {
    return parseProgress(null);
  }
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, serializeProgress(progress));
  } catch {
    // Nothing to do: see above.
  }
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
