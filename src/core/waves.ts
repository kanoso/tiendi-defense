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
