import { ProgressCloud, type CodeStore } from './cloud';
import { sameProgress } from './merge';
import type { Progress } from './progress';
import { loadProgress, saveProgress, whenProgressSaved } from './storage';

// Keeps this device's progress and the server's copy in step, once the server
// is known to keep accounts. Everything here fails quietly: without the server
// the game simply keeps its progress on this device, as it always did.

const CODE_KEY = 'tower-defense-heroes.player-code';
/** Saves that come close together travel as one. */
const PUSH_DELAY_MS = 800;

const localCodes: CodeStore = {
  get: () => {
    try {
      return localStorage.getItem(CODE_KEY);
    } catch {
      return null;
    }
  },
  set: (code) => {
    try {
      if (code) localStorage.setItem(CODE_KEY, code);
      else localStorage.removeItem(CODE_KEY);
    } catch {
      // Without storage the code is simply not remembered on this device.
    }
  },
};

export type SyncState = 'idle' | 'saving' | 'saved' | 'offline';

let cloud: ProgressCloud | null = null;
let pushTimer: number | null = null;
export let syncState: SyncState = 'idle';
/** Called whenever `syncState` changes. */
export let onSyncState: () => void = () => {};
export function watchSyncState(listener: () => void): void {
  onSyncState = listener;
}

function setState(state: SyncState): void {
  syncState = state;
  onSyncState();
}

/** Starts using the server at `base` for accounts. Safe to call more than once. */
export function startCloudSync(base: string): ProgressCloud {
  if (cloud) return cloud;
  cloud = new ProgressCloud(base, localCodes);
  whenProgressSaved(() => schedulePush());
  return cloud;
}

/** The account service, once started. */
export function progressCloud(): ProgressCloud | null {
  return cloud;
}

/**
 * Sends what this device has and keeps what comes back. Resolves true when
 * that changed the progress here (something arrived from another device).
 */
export async function syncNow(): Promise<boolean> {
  if (!cloud?.code()) return false;
  const local = loadProgress();
  setState('saving');
  try {
    const joined = await cloud.sync(local);
    setState('saved');
    if (!joined || sameProgress(joined, local)) return false;
    saveProgress(joined, true);
    return true;
  } catch {
    setState('offline');
    return false;
  }
}

/** Keeps a progress joined elsewhere (a new code, or one just typed in). */
export function adoptProgress(progress: Progress): void {
  saveProgress(progress, true);
  setState('saved');
}

function schedulePush(): void {
  if (!cloud?.code()) return;
  if (pushTimer !== null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    void syncNow();
  }, PUSH_DELAY_MS);
}
