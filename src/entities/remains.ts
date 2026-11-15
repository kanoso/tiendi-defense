import { TICKS_PER_SECOND } from '../core/types';
import { DEATH_TICKS } from './unitMotion';
import type { UnitName } from './units';

// Killed enemies leave the simulation at once; on screen they fall and fade
// first. Their bodies are drawn from this list, which only the renderer keeps:
// it is never saved, never shared and starts over with every new copy of the game.

export interface Remains {
  /** The enemy it was. */
  id: number;
  sprite: UnitName;
  /** The frame it showed when it was killed. */
  frame: number;
  scale: number;
  /** Where its feet stood. */
  x: number;
  y: number;
  /** How high a flyer was hovering above its feet. */
  lift: number;
  flipX: boolean;
  flying: boolean;
  /** Tick it was seen killed, which its fall is timed from. */
  startTick: number;
}

/** Most bodies on the map at once. A bigger massacre drops the oldest early. */
export const MAX_REMAINS = 40;

export function addRemains(list: readonly Remains[], body: Remains): Remains[] {
  return [...list, body].slice(-MAX_REMAINS);
}

/**
 * The bodies still falling at `tick`. One from a later tick is dropped too:
 * the game was replaced by an older copy, where that enemy is not dead yet.
 */
export function activeRemains(list: readonly Remains[], tick: number): Remains[] {
  return list.filter((body) => tick >= body.startTick && tick - body.startTick < DEATH_TICKS);
}

/** An enemy gone from the game since the last frame, as it was last seen. */
export interface Vanished {
  id: number;
  /** How far it still had to walk to the exit. */
  distanceLeft: number;
  /** Lives it costs if it gets out. */
  livesCost: number;
  /** Its full speed, in px a second. */
  speed: number;
}

export interface FrameLosses {
  livesLost: number;
  /** Ticks played since the last frame. */
  ticks: number;
  /** The game has no lives left: the last escape may have cost more than there were. */
  outOfLives: boolean;
}

/**
 * Which of the enemies drawn last frame are gone from the game. One lying on
 * the road, waiting to rise, is still there; one that split is gone, and the
 * smaller ones it left are new.
 */
export function vanishedIds(
  drawn: Iterable<number>,
  game: { enemies: readonly { id: number }[]; rising: readonly { enemy: { id: number } }[] },
): number[] {
  const present = new Set([...game.enemies.map((enemy) => enemy.id), ...game.rising.map((fallen) => fallen.enemy.id)]);
  return [...drawn].filter((id) => !present.has(id));
}

/** More enemies than this reaching the exit in one frame are not worth telling apart. */
const MAX_SUSPECTS = 10;

/**
 * Which of the enemies gone since the last frame walked out of the map; the
 * rest were killed. Only one close enough to the exit to get there in the ticks
 * that passed can have walked out, and together the ones that did must account
 * for the lives lost: the group that does, closest to the exit first.
 */
export function escapedEnemies(vanished: readonly Vanished[], losses: FrameLosses): Set<number> {
  const { livesLost, ticks, outOfLives } = losses;
  if (livesLost <= 0) return new Set();
  const suspects = vanished
    .filter((enemy) => enemy.distanceLeft <= (enemy.speed * ticks) / TICKS_PER_SECOND + 1e-6)
    .sort((a, b) => a.distanceLeft - b.distanceLeft)
    .slice(0, MAX_SUSPECTS);

  // Every group of suspects, as a bit mask; few enemies reach the exit at once.
  let best: { mask: number; cost: number; distance: number } | null = null;
  for (let mask = 1; mask < 1 << suspects.length; mask++) {
    let cost = 0;
    let distance = 0;
    suspects.forEach((enemy, index) => {
      if (!(mask & (1 << index))) return;
      cost += enemy.livesCost;
      distance += enemy.distanceLeft;
    });
    // Out of lives, the last escape was cut short, so the group may cost more.
    const fits = outOfLives ? cost >= livesLost : cost === livesLost;
    if (!fits) continue;
    if (best && (cost > best.cost || (cost === best.cost && distance >= best.distance))) continue;
    best = { mask, cost, distance };
  }
  if (best) {
    const mask = best.mask;
    return new Set(suspects.filter((_, index) => mask & (1 << index)).map((enemy) => enemy.id));
  }

  // Nothing adds up (an escape this renderer never saw): the closest ones that fit.
  const escaped = new Set<number>();
  let left = livesLost;
  for (const enemy of suspects) {
    if (enemy.livesCost > left) continue;
    escaped.add(enemy.id);
    left -= enemy.livesCost;
  }
  return escaped;
}
