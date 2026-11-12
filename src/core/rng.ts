/**
 * Seeded random generator (mulberry32). All game randomness must come from here
 * so that two machines running the same seed reach the same state.
 * The state is a plain number so it can be serialized with the rest of the game.
 */
export interface Rng {
  state: number;
}

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

/** Next value in [0, 1). */
export function nextFloat(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Next value in [min, max). */
export function nextInRange(rng: Rng, min: number, max: number): number {
  return min + nextFloat(rng) * (max - min);
}
