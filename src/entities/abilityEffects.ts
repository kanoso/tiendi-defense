import type Phaser from 'phaser';
import type { Zone } from '../core/simulation';
import { HEAL_COLOR, SLOW_COLOR, STORM_COLOR } from './styles';

type Graphics = Phaser.GameObjects.Graphics;

/** The look of an ability at the moment it is cast. */
export type CastEffectKind = 'quake' | 'volley' | 'pierce' | 'meteor' | 'freeze' | 'zone';

/** One ability being shown. Drawn from scratch every frame from its age. */
export interface CastEffect {
  kind: CastEffectKind;
  /** Where the ability landed. */
  x: number;
  y: number;
  /** Where the hero stood when casting. */
  originX: number;
  originY: number;
  radius: number;
  startTick: number;
}

/** How long each effect stays on screen, in game ticks (60 per second). */
export const CAST_EFFECT_TICKS: Record<CastEffectKind, number> = {
  quake: 40,
  volley: 30,
  pierce: 30,
  meteor: 54,
  freeze: 44,
  zone: 24,
};

// Effects are timed by game ticks, not by the clock: they freeze with a pause
// and run faster at double speed, like everything else on the map.

/** Fast at first, then settling: how something thrown or exploding moves. */
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** A repeatable "random" number in [0, 1) for a given seed, so effects never flicker. */
function noise(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function drawCastEffect(g: Graphics, effect: CastEffect, tick: number): void {
  const age = tick - effect.startTick;
  const t = age / CAST_EFFECT_TICKS[effect.kind];
  if (t < 0 || t >= 1) return;
  switch (effect.kind) {
    case 'quake':
      return drawQuake(g, effect, t);
    case 'volley':
      return drawVolley(g, effect, t);
    case 'pierce':
      return drawPierce(g, effect, t);
    case 'meteor':
      return drawMeteor(g, effect, age);
    case 'freeze':
      return drawFreeze(g, effect, t);
    case 'zone':
      return drawZoneOpening(g, effect, t);
  }
}

/** Shock waves rolling out over cracked ground. */
function drawQuake(g: Graphics, { x, y, radius }: CastEffect, t: number): void {
  g.fillStyle(0xc9a66b, 0.3 * (1 - t));
  g.fillCircle(x, y, radius * easeOut(t));

  const reach = radius * Math.min(1, t * 2.5);
  g.lineStyle(3, 0x4a3118, 1 - t);
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2 + noise(i) * 0.5;
    g.beginPath();
    g.moveTo(x, y);
    for (let step = 1; step <= 4; step++) {
      const along = (reach * step) / 4;
      // Each crack zigzags a little to either side of its direction.
      const sideways = (noise(i * 7 + step) - 0.5) * 16;
      g.lineTo(
        x + Math.cos(angle) * along - Math.sin(angle) * sideways,
        y + Math.sin(angle) * along + Math.cos(angle) * sideways,
      );
    }
    g.strokePath();
  }

  for (let ring = 0; ring < 3; ring++) {
    const ringT = t - ring * 0.16;
    if (ringT <= 0) continue;
    g.lineStyle(6 - ring * 1.5, 0xf2c14e, 1 - ringT);
    g.strokeCircle(x, y, radius * easeOut(ringT));
  }
}

/** Arrows fanning out in every direction, as far as the ability reaches. */
function drawVolley(g: Graphics, { originX, originY, radius }: CastEffect, t: number): void {
  const head = radius * easeOut(t);
  const tail = Math.max(0, head - 30);
  const alpha = 1 - t * t;
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2 + noise(i) * 0.12;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tipX = originX + cos * head;
    const tipY = originY + sin * head;
    const tailX = originX + cos * tail;
    const tailY = originY + sin * tail;
    // A dark shaft under a light one, so the arrow reads on grass and on road.
    g.lineStyle(5, 0x3b2a1a, 0.8 * alpha);
    g.lineBetween(tailX, tailY, tipX, tipY);
    g.lineStyle(2, 0xfff3b0, alpha);
    g.lineBetween(tailX, tailY, tipX, tipY);
    // Arrowhead: a triangle pointing the way the arrow flies.
    g.fillStyle(0x3b2a1a, alpha);
    g.fillTriangle(
      tipX + cos * 9,
      tipY + sin * 9,
      tipX - sin * 5,
      tipY + cos * 5,
      tipX + sin * 5,
      tipY - cos * 5,
    );
    g.fillStyle(0xffffff, alpha);
    g.fillTriangle(
      tipX + cos * 6,
      tipY + sin * 6,
      tipX - sin * 3,
      tipY + cos * 3,
      tipX + sin * 3,
      tipY - cos * 3,
    );
  }
  g.lineStyle(2, 0xfff3b0, 0.35 * (1 - t));
  g.strokeCircle(originX, originY, radius);
}

/** One heavy shot: a beam that runs through the target and out the other side. */
function drawPierce(g: Graphics, { x, y, originX, originY, radius }: CastEffect, t: number): void {
  const dx = x - originX;
  const dy = y - originY;
  const length = Math.hypot(dx, dy) || 1;
  const cos = dx / length;
  const sin = dy / length;
  // The shot reaches its full length almost at once, then lingers and fades.
  const reached = Math.min(1, t * 5) * (length + 70);
  const endX = originX + cos * reached;
  const endY = originY + sin * reached;
  const fade = 1 - t;

  g.lineStyle(11, 0xffd166, 0.3 * fade);
  g.lineBetween(originX, originY, endX, endY);
  g.lineStyle(5, 0xfff3b0, 0.7 * fade);
  g.lineBetween(originX, originY, endX, endY);
  g.lineStyle(2, 0xffffff, fade);
  g.lineBetween(originX, originY, endX, endY);

  if (reached < length) return;
  g.fillStyle(0xffffff, 0.6 * fade);
  g.fillCircle(x, y, radius * (0.4 + t));
  g.lineStyle(3, 0xfff3b0, fade);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const inner = radius * (0.5 + t);
    const outer = radius * (1 + t * 1.6);
    g.lineBetween(
      x + Math.cos(angle) * inner,
      y + Math.sin(angle) * inner,
      x + Math.cos(angle) * outer,
      y + Math.sin(angle) * outer,
    );
  }
}

const METEOR_FALL_TICKS = 10;

/** A fireball drops from the sky, then bursts over the whole area. */
function drawMeteor(g: Graphics, { x, y, radius, startTick }: CastEffect, age: number): void {
  if (age < METEOR_FALL_TICKS) {
    const fall = age / METEOR_FALL_TICKS;
    // Its shadow grows on the ground as it comes down.
    g.fillStyle(0x000000, 0.25 * fall);
    g.fillEllipse(x, y, radius * fall, radius * 0.45 * fall);

    const fromX = x + 150;
    const fromY = y - 280;
    const drop = fall * fall;
    const ballX = fromX + (x - fromX) * drop;
    const ballY = fromY + (y - fromY) * drop;
    g.lineStyle(12, 0xff7a1a, 0.45);
    g.lineBetween(ballX + 34, ballY - 62, ballX, ballY);
    g.lineStyle(5, 0xffd166, 0.7);
    g.lineBetween(ballX + 20, ballY - 37, ballX, ballY);
    g.fillStyle(0xff5a1f, 1);
    g.fillCircle(ballX, ballY, 13);
    g.fillStyle(0xffe08a, 1);
    g.fillCircle(ballX - 2, ballY + 2, 7);
    return;
  }

  const t = (age - METEOR_FALL_TICKS) / (CAST_EFFECT_TICKS.meteor - METEOR_FALL_TICKS);
  const fade = 1 - t;
  const blast = radius * easeOut(Math.min(1, t * 2.5));

  // Scorched ground, the fire over it, a bright core, and the ring of the blast.
  g.fillStyle(0x2b1a12, 0.35 * fade);
  g.fillCircle(x, y, radius * 0.6);
  g.fillStyle(0xff7a1a, 0.55 * fade);
  g.fillCircle(x, y, blast);
  g.fillStyle(0xffe08a, 0.7 * fade * fade);
  g.fillCircle(x, y, blast * 0.55);
  g.lineStyle(4, 0xfff3b0, fade);
  g.strokeCircle(x, y, radius * easeOut(t));

  // Embers thrown outwards, each at its own pace.
  g.fillStyle(0xffd166, fade);
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + noise(startTick + i) * 0.6;
    const reach = radius * (0.3 + easeOut(t) * (0.6 + noise(i * 3) * 0.7));
    g.fillCircle(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach, 3.5 * fade + 1);
  }
}

/** A burst of ice spikes that snaps out and slowly melts away. */
function drawFreeze(g: Graphics, { x, y, radius }: CastEffect, t: number): void {
  const fade = 1 - t;
  const outer = radius * easeOut(Math.min(1, t * 3.5));
  const spikes = 14;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i / (spikes * 2)) * Math.PI * 2;
    // Alternate long and short points; no two spikes are quite the same length.
    const reach = i % 2 === 0 ? outer * (0.82 + noise(i) * 0.18) : outer * 0.5;
    points.push({ x: x + Math.cos(angle) * reach, y: y + Math.sin(angle) * reach });
  }
  g.fillStyle(0xcfefff, 0.5 * fade);
  g.fillPoints(points, true);
  g.lineStyle(2, 0xffffff, fade);
  g.strokePoints(points, true);

  g.lineStyle(3, SLOW_COLOR, 0.8 * fade);
  g.strokeCircle(x, y, radius * easeOut(t));
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + 0.4;
    const reach = radius * 0.6 * easeOut(t);
    drawSnowflake(g, x + Math.cos(angle) * reach, y + Math.sin(angle) * reach, 7, t * 2, fade);
  }
}

/** The moment a lasting zone appears: a ring closing in on where it will stay. */
function drawZoneOpening(g: Graphics, { x, y, radius }: CastEffect, t: number): void {
  g.lineStyle(4, 0xffffff, 1 - t);
  g.strokeCircle(x, y, radius * (1.5 - 0.5 * easeOut(t)));
}

/**
 * A zone for as long as it lasts. What moves inside tells what it does: bolts
 * for one that hurts, snow for one that slows, rising crosses for one that heals.
 */
export function drawZone(g: Graphics, zone: Zone, tick: number): void {
  const color = zone.damage > 0 ? STORM_COLOR : zone.slowFactor < 1 ? SLOW_COLOR : HEAL_COLOR;
  // The last second fades out, so the zone does not just vanish.
  const closing = Math.min(1, zone.ticksLeft / 60);
  g.fillStyle(color, 0.2 * closing);
  g.fillCircle(zone.x, zone.y, zone.radius);
  g.lineStyle(2, color, 0.75 * closing);
  g.strokeCircle(zone.x, zone.y, zone.radius);

  if (zone.damage > 0) drawStorm(g, zone, tick, closing);
  else if (zone.slowFactor < 1) drawSnowfall(g, zone, tick, closing);
  if (zone.healAmount > 0) drawHealing(g, zone, tick, closing);
}

const BOLT_EVERY_TICKS = 7;
const BOLT_VISIBLE_TICKS = 4;

function drawStorm(g: Graphics, zone: Zone, tick: number, alpha: number): void {
  // Arcs circling the edge.
  g.lineStyle(3, 0xf0d0ff, 0.7 * alpha);
  for (let i = 0; i < 3; i++) {
    const start = tick / 14 + (i / 3) * Math.PI * 2;
    g.beginPath();
    g.arc(zone.x, zone.y, zone.radius * 0.86, start, start + 0.9);
    g.strokePath();
  }

  // Lightning: a new pair of bolts every few ticks, each visible only briefly.
  if (tick % BOLT_EVERY_TICKS >= BOLT_VISIBLE_TICKS) return;
  const strike = Math.floor(tick / BOLT_EVERY_TICKS);
  for (let bolt = 0; bolt < 2; bolt++) {
    const seed = strike * 31 + bolt * 17 + zone.x;
    const angle = noise(seed) * Math.PI * 2;
    const distance = Math.sqrt(noise(seed + 1)) * zone.radius * 0.85;
    const hitX = zone.x + Math.cos(angle) * distance;
    const hitY = zone.y + Math.sin(angle) * distance;

    const points = [{ x: hitX + (noise(seed + 2) - 0.5) * 60, y: hitY - 170 }];
    for (let step = 1; step < 5; step++) {
      const along = step / 5;
      points.push({
        x: points[0].x + (hitX - points[0].x) * along + (noise(seed + step * 5) - 0.5) * 26,
        y: points[0].y + (hitY - points[0].y) * along,
      });
    }
    points.push({ x: hitX, y: hitY });

    g.lineStyle(7, STORM_COLOR, 0.35 * alpha);
    g.strokePoints(points);
    g.lineStyle(2, 0xffffff, alpha);
    g.strokePoints(points);
    g.fillStyle(0xffffff, 0.8 * alpha);
    g.fillCircle(hitX, hitY, 7);
  }
}

function drawSnowfall(g: Graphics, zone: Zone, tick: number, alpha: number): void {
  // A ring of cold spreading out from the middle, over and over.
  const pulse = (tick % 70) / 70;
  g.lineStyle(2, 0xffffff, 0.5 * (1 - pulse) * alpha);
  g.strokeCircle(zone.x, zone.y, zone.radius * pulse);

  for (let i = 0; i < 9; i++) {
    const seed = i * 13 + zone.x + zone.y;
    const angle = noise(seed) * Math.PI * 2 + tick / 160;
    const distance = Math.sqrt(noise(seed + 1)) * zone.radius * 0.85;
    const twinkle = 0.55 + 0.45 * Math.sin(tick / 9 + i);
    drawSnowflake(
      g,
      zone.x + Math.cos(angle) * distance,
      zone.y + Math.sin(angle) * distance,
      5 + noise(seed + 2) * 4,
      tick / 26 + i,
      twinkle * alpha,
    );
  }
}

function drawSnowflake(
  g: Graphics,
  x: number,
  y: number,
  size: number,
  turn: number,
  alpha: number,
): void {
  g.lineStyle(2, 0xffffff, alpha);
  for (let arm = 0; arm < 3; arm++) {
    const angle = turn + (arm / 3) * Math.PI;
    const dx = Math.cos(angle) * size;
    const dy = Math.sin(angle) * size;
    g.lineBetween(x - dx, y - dy, x + dx, y + dy);
  }
}

function drawHealing(g: Graphics, zone: Zone, tick: number, alpha: number): void {
  const pulse = (tick % 60) / 60;
  g.lineStyle(3, HEAL_COLOR, 0.6 * (1 - pulse) * alpha);
  g.strokeCircle(zone.x, zone.y, zone.radius * (0.3 + 0.7 * pulse));

  // Crosses drifting up from the ground, each on its own column and timing.
  const rise = zone.radius * 1.3;
  for (let i = 0; i < 8; i++) {
    const seed = i * 19 + zone.x;
    const progress = ((tick * 0.9 + noise(seed) * rise) % rise) / rise;
    const column = (noise(seed + 1) - 0.5) * zone.radius * 1.5;
    const x = zone.x + column;
    const y = zone.y + zone.radius * 0.55 - progress * rise;
    if (Math.hypot(x - zone.x, y - zone.y) > zone.radius) continue;
    // Each cross fades in as it leaves the ground and out as it reaches the top.
    const visible = Math.sin(progress * Math.PI) * alpha;
    g.lineStyle(3, 0xeafff0, visible);
    g.lineBetween(x - 5, y, x + 5, y);
    g.lineBetween(x, y - 5, x, y + 5);
  }
}
