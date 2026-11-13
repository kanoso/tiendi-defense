import { progressCloud } from './cloudSync';
import { newerSavedGame, parseSavedGame, type SavedGame } from './savedGame';

// The game left between waves, on this device and, with an account, on the
// server. Everything fails quietly: without storage or a server the game just
// cannot be continued later, and nothing else changes.

const SAVED_GAME_KEY = 'tower-defense-heroes.saved-game';

/** The game this device left between waves, if any. */
export function localSavedGame(): SavedGame | null {
  try {
    return parseSavedGame(JSON.parse(localStorage.getItem(SAVED_GAME_KEY) ?? 'null'));
  } catch {
    return null;
  }
}

function storeLocally(game: SavedGame | null): void {
  try {
    if (game) localStorage.setItem(SAVED_GAME_KEY, JSON.stringify(game));
    else localStorage.removeItem(SAVED_GAME_KEY);
  } catch {
    // Without storage the game cannot be continued later on this device.
  }
}

/** Keeps a game just saved between waves, here and with the account. */
export function keepSavedGame(game: SavedGame): void {
  storeLocally(game);
  void progressCloud()
    ?.putSavedGame(game)
    .catch(() => {
      // Offline: the copy here is enough; the account gets it next time.
    });
}

/** The game ended: it is offered no more, here or on the account. */
export function dropSavedGame(gameId: string): void {
  if (localSavedGame()?.gameId === gameId) storeLocally(null);
  void progressCloud()
    ?.clearSavedGame(gameId)
    .catch(() => {});
}

/**
 * The latest game to continue, between this device and the account. It is
 * kept here too, so the menu can offer it even without a connection later.
 */
export async function latestSavedGame(): Promise<SavedGame | null> {
  const local = localSavedGame();
  let remote: SavedGame | null = null;
  try {
    remote = (await progressCloud()?.loadSavedGame()) ?? null;
  } catch {
    return local;
  }
  const latest = newerSavedGame(local, remote);
  if (latest && latest !== local) storeLocally(latest);
  // This device's game is newer than the account's: the account should know.
  if (latest && latest === local && remote?.savedAt !== local.savedAt) keepSavedGame(local);
  return latest;
}
