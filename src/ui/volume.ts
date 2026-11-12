/** The volumes the sound button cycles through, from full to silent. */
export const VOLUME_STEPS: readonly number[] = [1, 0.6, 0.3, 0];

/** The step after `volume`, wrapping from silence back to full. */
export function nextVolume(volume: number): number {
  const current = nearestStep(volume);
  return VOLUME_STEPS[(current + 1) % VOLUME_STEPS.length];
}

function nearestStep(volume: number): number {
  let nearest = 0;
  VOLUME_STEPS.forEach((step, index) => {
    if (Math.abs(step - volume) < Math.abs(VOLUME_STEPS[nearest] - volume)) nearest = index;
  });
  return nearest;
}

/**
 * Reads the saved volume. `legacyMuted` is the on/off setting the game had
 * before it had volume levels, honoured when no volume was ever saved.
 */
export function parseVolume(saved: string | null, legacyMuted: string | null): number {
  if (saved !== null) {
    const volume = Number(saved);
    return VOLUME_STEPS.includes(volume) ? volume : 1;
  }
  return legacyMuted === '1' ? 0 : 1;
}

/** Short text for the sound button. */
export function volumeLabel(volume: number): string {
  return volume === 0 ? 'Mudo' : `Vol ${Math.round(volume * 100)}`;
}
