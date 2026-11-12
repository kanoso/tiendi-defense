export interface WaveGroup {
  /** Key into the level's enemy types. */
  enemy: string;
  count: number;
  /** Ticks between two enemies of this group. */
  intervalTicks: number;
  /** Ticks from the start of the wave until the first enemy of this group. */
  delayTicks: number;
  /** Index of the level path this group walks. The first one when omitted. */
  path?: number;
}

export type Wave = readonly WaveGroup[];

export interface PendingSpawn {
  /** Tick, relative to the start of the wave. */
  atTick: number;
  enemy: string;
  path: number;
}

/** Flattens a wave into the ordered list of spawns it produces. */
export function buildSpawnQueue(wave: Wave): PendingSpawn[] {
  const queue: PendingSpawn[] = [];
  for (const group of wave) {
    for (let i = 0; i < group.count; i++) {
      queue.push({
        atTick: group.delayTicks + i * group.intervalTicks,
        enemy: group.enemy,
        path: group.path ?? 0,
      });
    }
  }
  // Array.prototype.sort is stable, so same-tick spawns keep their group order.
  return queue.sort((a, b) => a.atTick - b.atTick);
}

/** One kind of enemy in endless mode, and how its numbers grow wave after wave. */
export interface EndlessGroup {
  enemy: string;
  /** First wave it appears on, counting from zero. */
  fromWave: number;
  /** It comes back every this many waves after its first. One means every wave. */
  everyWaves: number;
  baseCount: number;
  /** Enemies added for each wave since its first. May be a fraction. */
  countPerWave: number;
  intervalTicks: number;
  /** The interval shrinks by this much per wave, but never below the minimum. */
  intervalDropPerWave: number;
  minIntervalTicks: number;
  delayTicks: number;
}

export interface EndlessRules {
  groups: readonly EndlessGroup[];
}

/**
 * The wave endless mode sends at `waveIndex`. It depends on nothing but its
 * arguments, so every player facing wave 30 faces the same wave 30.
 */
export function buildEndlessWave(
  rules: EndlessRules,
  waveIndex: number,
  pathCount: number,
): WaveGroup[] {
  const wave: WaveGroup[] = [];
  for (const group of rules.groups) {
    const age = waveIndex - group.fromWave;
    if (age < 0 || age % group.everyWaves !== 0) continue;
    wave.push({
      enemy: group.enemy,
      count: group.baseCount + Math.floor(group.countPerWave * age),
      intervalTicks: Math.max(
        group.minIntervalTicks,
        group.intervalTicks - group.intervalDropPerWave * age,
      ),
      delayTicks: group.delayTicks,
      // Groups take turns on the roads, and swap roads from one wave to the next.
      path: (wave.length + waveIndex) % pathCount,
    });
  }
  return wave;
}
