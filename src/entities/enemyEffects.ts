import type Phaser from 'phaser';
import { HEAL_COLOR } from './styles';
import { deathPose, type FallPose, type Tint } from './unitMotion';

// How the enemies with traits of their own look: a shaman's heal, a skeleton
// getting back up and a zombie bursting into smaller ones. Rendering only, and
// every look is a function of game ticks, so it freezes with a pause.

/**
 * A skeleton lying on the road until it rises: it falls like any killed enemy,
 * lies there fully visible, then gets up by playing the fall backwards over its
 * last ticks. `ticksSince` counts from the fall, `ticksLeft` until it stands.
 */
export function risePose(ticksSince: number, ticksLeft: number, facingLeft: boolean): FallPose {
  const fall = deathPose(Math.min(ticksSince, Math.max(0, ticksLeft)), facingLeft);
  return { ...fall, alpha: 1 };
}

/** How long a healed enemy stays green. */
export const HEAL_TINT_TICKS = 14;

export function healTint(ticksSince: number | null): Tint | null {
  if (ticksSince === null || ticksSince < 0 || ticksSince >= HEAL_TINT_TICKS) return null;
  return { fill: false, color: HEAL_COLOR };
}

/** What an enemy's view remembers to show it was healed: health last frame and its latest heal. */
export interface HealMemory {
  hp: number;
  healTick: number | null;
}

/** A rise in health is a heal. As with hits, a heal later than `tick` is forgotten (a shared game was rewound). */
export function trackHeal(memory: HealMemory, hp: number, tick: number): HealMemory {
  if (hp > memory.hp) return { hp, healTick: tick };
  const healTick = memory.healTick !== null && memory.healTick > tick ? null : memory.healTick;
  return { hp, healTick };
}

/**
 * What a shaman's view remembers to spot its heals: the simulation keeps no
 * record of them, but its cooldown starts over at `interval` on each one.
 */
export interface CooldownMemory {
  cooldown: number;
  eventTick: number | null;
}

/** A cooldown that went up started over: the heal is dated from what is left of it. */
export function trackCooldownRestart(
  memory: CooldownMemory,
  cooldown: number,
  interval: number,
  tick: number,
): CooldownMemory {
  if (cooldown > memory.cooldown) return { cooldown, eventTick: tick - (interval - cooldown) };
  const kept = memory.eventTick !== null && memory.eventTick > tick ? null : memory.eventTick;
  return { cooldown, eventTick: kept };
}

export type EnemyEffectKind = 'healPulse' | 'splitPuff';

/** A moment drawn on the map: a shaman's heal or a zombie bursting. Drawn only. */
export interface EnemyEffect {
  kind: EnemyEffectKind;
  x: number;
  y: number;
  radius: number;
  startTick: number;
}

export const ENEMY_EFFECT_TICKS: Record<EnemyEffectKind, number> = { healPulse: 30, splitPuff: 36 };

/** How far past the outermost small zombie a burst's dust reaches. */
export const SPLIT_PUFF_MARGIN = 26;

/** How long a small zombie takes to pop up to full size out of the burst. */
export const POP_IN_TICKS = 10;
const POP_IN_FROM = 0.3;

/**
 * How large to draw a unit `ticksSince` ticks after it popped out of a burst:
 * small at first, easing up to full size. Full size with no pop (null) or one
 * from the future, as after a shared game is rewound.
 */
export function popInScale(ticksSince: number | null): number {
  if (ticksSince === null || ticksSince < 0 || ticksSince >= POP_IN_TICKS) return 1;
  const t = ticksSince / POP_IN_TICKS;
  const eased = 1 - (1 - t) * (1 - t);
  return POP_IN_FROM + (1 - POP_IN_FROM) * eased;
}

/** Most effects on the map at once; a busy wave drops the oldest early. */
export const MAX_ENEMY_EFFECTS = 24;

export function addEnemyEffect(list: readonly EnemyEffect[], effect: EnemyEffect): EnemyEffect[] {
  return [...list, effect].slice(-MAX_ENEMY_EFFECTS);
}

/** The effects still playing at `tick`. One from a later tick belongs to a game that was rewound. */
export function activeEnemyEffects(list: readonly EnemyEffect[], tick: number): EnemyEffect[] {
  return list.filter((effect) => tick >= effect.startTick && tick - effect.startTick < ENEMY_EFFECT_TICKS[effect.kind]);
}

const PUFF_COLOR = 0xd9e2c4;
const PUFF_SHADE = 0x6f7a5a;
const PUFF_BLOBS = 9;

export function drawEnemyEffect(g: Phaser.GameObjects.Graphics, effect: EnemyEffect, tick: number): void {
  const t = (tick - effect.startTick) / ENEMY_EFFECT_TICKS[effect.kind];
  if (t < 0 || t >= 1) return;
  const fade = 1 - t;
  if (effect.kind === 'healPulse') {
    // A green ring grows from the shaman out to the edge of its reach.
    const radius = effect.radius * (0.25 + 0.75 * Math.sqrt(t));
    g.fillStyle(HEAL_COLOR, 0.12 * fade);
    g.fillCircle(effect.x, effect.y, radius);
    g.lineStyle(3, HEAL_COLOR, 0.85 * fade);
    g.strokeCircle(effect.x, effect.y, radius);
    return;
  }
  // A cloud of dust bursts out where the zombie fell apart and rolls outwards,
  // clearing the middle at once so the small zombies stay in sight.
  const flash = Math.max(0, 1 - t * 4);
  g.lineStyle(4, 0xffffff, 0.8 * flash);
  g.strokeCircle(effect.x, effect.y, effect.radius * (0.4 + 0.6 * t));
  for (let i = 0; i < PUFF_BLOBS; i++) {
    const angle = (i / PUFF_BLOBS) * Math.PI * 2 + 0.3;
    const reach = effect.radius * (0.55 + 0.45 * Math.sqrt(t));
    const size = 9 + 7 * Math.sin(Math.PI * Math.min(1, t * 1.5));
    const x = effect.x + Math.cos(angle) * reach;
    const y = effect.y + Math.sin(angle) * reach * 0.55;
    g.fillStyle(PUFF_SHADE, 0.55 * fade);
    g.fillCircle(x + 2, y + 2, size);
    g.fillStyle(PUFF_COLOR, 0.9 * fade);
    g.fillCircle(x, y, size);
  }
}
