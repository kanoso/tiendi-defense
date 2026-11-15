import type Phaser from 'phaser';
import type { Point } from '../core/path';
import {
  heroMaxHp,
  isAlive,
  isMoving,
  towerStats,
  type GameState,
  type Hero,
  type Level,
  type Shot,
} from '../core/simulation';
import {
  BRANCH_STYLE,
  ENEMY_STYLE,
  HEAL_COLOR,
  HERO_RADIUS,
  HERO_SCALE,
  HERO_STYLE,
  LIGHTNING_COLOR,
  SELECTION_COLOR,
  SHOT_COLOR,
  SHOT_VISIBLE_TICKS,
  SLOT_RADIUS,
  SLOW_COLOR,
  SPLASH_COLOR,
  STUN_COLOR,
} from './styles';
import { drawCastEffect, drawZone, type CastEffect } from './abilityEffects';
import { headRise, UNIT_SHEETS } from './units';

type Graphics = Phaser.GameObjects.Graphics;

/** Lightning stays a little longer than a shot, so its jumps can be followed. */
const LIGHTNING_VISIBLE_TICKS = SHOT_VISIBLE_TICKS * 2;
const ZIGZAG_KINKS = 5;

/** A hero's ability (by its index on the hero) waiting for a spot to land on. */
export interface Aim {
  heroId: number;
  ability: number;
}

export interface OverlayView {
  game: GameState;
  level: Level;
  selectedHeroId: number | null;
  /** Slot whose tower menu is open, to show that tower's range. */
  menuSlot: number | null;
  /** Targeted ability being aimed, if any. */
  aim: Aim | null;
  /** Abilities cast a moment ago, still playing their effect. */
  castEffects: readonly CastEffect[];
  pointer: Point;
  /** Where the middle of each enemy's body is drawn this frame, by enemy id. */
  enemyPositions: ReadonlyMap<number, Point>;
}

/**
 * Redraws everything that changes every frame and has no sprite of its own:
 * zones, bursts, aiming, ranges, shots, heals, status rings and health bars.
 */
export function drawOverlay(g: Graphics, view: OverlayView): void {
  g.clear();
  drawZones(g, view);
  drawAbilityCasts(g, view);
  drawTargeting(g, view);
  drawTowerMarks(g, view);
  drawHeroMarks(g, view);
  drawEnemyMarks(g, view);
}

function drawZones(g: Graphics, { game }: OverlayView): void {
  for (const zone of game.zones) drawZone(g, zone, game.tick);
}

function drawAbilityCasts(g: Graphics, { game, castEffects }: OverlayView): void {
  for (const effect of castEffects) drawCastEffect(g, effect, game.tick);
}

/** While aiming: the hero's cast range and the area under the pointer. */
function drawTargeting(g: Graphics, { game, level, aim, pointer }: OverlayView): void {
  if (!aim) return;
  const hero = game.heroes.find((candidate) => candidate.id === aim.heroId);
  const ability = hero && level.heroTypes[hero.type].abilities[aim.ability];
  if (!hero || !ability) return;

  g.lineStyle(2, 0xffffff, 0.5);
  g.strokeCircle(hero.x, hero.y, ability.castRange);

  // Same pull-back the simulation applies, so the preview matches the result.
  const dx = pointer.x - hero.x;
  const dy = pointer.y - hero.y;
  const reach = Math.hypot(dx, dy);
  const scale = reach > ability.castRange ? ability.castRange / reach : 1;
  const x = hero.x + dx * scale;
  const y = hero.y + dy * scale;
  g.fillStyle(HERO_STYLE[hero.type].color, 0.3);
  g.fillCircle(x, y, ability.radius);
  g.lineStyle(2, 0xffffff, 0.9);
  g.strokeCircle(x, y, ability.radius);
}

function drawTowerMarks(g: Graphics, { game, level, menuSlot }: OverlayView): void {
  for (const tower of game.towers) {
    const origin = level.buildSlots[tower.slot];
    const stats = towerStats(level, tower);
    if (tower.slot === menuSlot) drawRange(g, origin, stats.range);
    if (tower.branch !== null) drawBranchRing(g, origin, BRANCH_STYLE[tower.branch]?.color ?? SHOT_COLOR);
    const shot = tower.lastShot;
    if ((stats.chainJumps ?? 0) > 0) {
      drawLightning(g, game, origin, shot);
    } else if ((stats.targets ?? 1) > 1) {
      drawVolley(g, game, origin, shot, stats.splashRadius);
    } else {
      const color = stats.slowTicks > 0 ? SLOW_COLOR : SHOT_COLOR;
      // Piercing bolts and huge blasts are drawn heavier than plain shots.
      const width = stats.damage >= 300 ? 6 : (stats.armorPierce ?? 0) > 0 ? 4 : 2;
      drawShot(g, game, origin, shot, color, stats.splashRadius, width, stats.slowTicks > 0 ? SLOW_COLOR : SPLASH_COLOR);
    }
  }
}

/** One arrow for every enemy the shot struck. */
function drawVolley(g: Graphics, game: GameState, origin: Point, shot: Shot | null, splashRadius: number): void {
  if (!shot) return;
  for (const hit of shot.struck ?? [shot]) {
    drawShot(g, game, origin, { tick: shot.tick, x: hit.x, y: hit.y }, SHOT_COLOR, splashRadius);
  }
}

/** A specialized tower wears a ring in the colour of its branch. */
function drawBranchRing(g: Graphics, center: Point, color: number): void {
  g.lineStyle(3, color, 0.9);
  g.strokeCircle(center.x, center.y, SLOT_RADIUS + 3);
}

/** A bolt that zigzags from the tower to the first enemy, then on to each one it jumped to. */
function drawLightning(g: Graphics, game: GameState, origin: Point, shot: Shot | null): void {
  if (!shot) return;
  const age = game.tick - shot.tick;
  if (age >= LIGHTNING_VISIBLE_TICKS) return;
  const fade = 1 - age / LIGHTNING_VISIBLE_TICKS;
  const stops: Point[] = [origin, ...(shot.struck ?? [shot])];
  for (let i = 1; i < stops.length; i++) {
    const points = zigzag(stops[i - 1], stops[i], shot.tick + i);
    g.lineStyle(5, LIGHTNING_COLOR, 0.35 * fade);
    g.strokePoints(points);
    g.lineStyle(2, 0xffffff, 0.95 * fade);
    g.strokePoints(points);
    g.fillStyle(LIGHTNING_COLOR, 0.8 * fade);
    g.fillCircle(stops[i].x, stops[i].y, 5);
  }
}

/** A jagged line from `a` to `b`. The same `seed` always gives the same shape, so it holds still on pause. */
function zigzag(a: Point, b: Point, seed: number): Point[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const span = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / span, y: dx / span };
  const points: Point[] = [a];
  for (let i = 1; i < ZIGZAG_KINKS; i++) {
    const along = i / ZIGZAG_KINKS;
    const side = Math.sin(seed * 12.9898 + i * 78.233) * 8;
    points.push({ x: a.x + dx * along + normal.x * side, y: a.y + dy * along + normal.y * side });
  }
  points.push(b);
  return points;
}

function drawHeroMarks(g: Graphics, { game, level, selectedHeroId }: OverlayView): void {
  for (const hero of game.heroes) {
    if (!isAlive(hero)) {
      drawRespawnProgress(g, level, hero);
      continue;
    }
    const type = level.heroTypes[hero.type];
    if (hero.id === selectedHeroId) drawSelection(g, hero, type.range);
    if (type.blockCount > 0) {
      drawSlash(g, game, hero, hero.lastShot);
    } else {
      const color = type.slowTicks > 0 ? SLOW_COLOR : SHOT_COLOR;
      drawShot(g, game, hero, hero.lastShot, color, type.splashRadius);
    }

    const heal = hero.lastHeal;
    if (heal && game.tick - heal.tick < SHOT_VISIBLE_TICKS * 2) {
      g.lineStyle(3, HEAL_COLOR, 0.8);
      g.lineBetween(hero.x, hero.y, heal.x, heal.y);
      g.strokeCircle(heal.x, heal.y, HERO_RADIUS + 8);
    }
    const maxHp = heroMaxHp(level, hero);
    if (hero.hp < maxHp) {
      // Above the head, which can reach higher than the hero's circle.
      const above = Math.max(HERO_RADIUS, headRise(UNIT_SHEETS[HERO_STYLE[hero.type].sprite], HERO_SCALE));
      drawHealthBar(g, hero, HERO_RADIUS, above, hero.hp / maxHp, 0x4aa3ff);
    }
  }
}

function drawEnemyMarks(g: Graphics, { game, enemyPositions }: OverlayView): void {
  for (const enemy of game.enemies) {
    const position = enemyPositions.get(enemy.id);
    if (!position) continue;
    const style = ENEMY_STYLE[enemy.type];
    const radius = style.radius;
    if (enemy.stunTicks > 0) {
      g.lineStyle(3, STUN_COLOR, 0.95);
      g.strokeCircle(position.x, position.y, radius + 3);
    } else if (enemy.slowTicks > 0) {
      g.lineStyle(3, SLOW_COLOR, 0.9);
      g.strokeCircle(position.x, position.y, radius + 3);
    }
    if (enemy.hp < enemy.maxHp) {
      const halfBody = (UNIT_SHEETS[style.sprite].bodyRows * style.scale) / 2;
      drawHealthBar(g, position, radius, Math.max(radius, halfBody), enemy.hp / enemy.maxHp, 0x6fcf4a);
    }
  }
}

function drawRange(g: Graphics, center: Point, range: number): void {
  g.fillStyle(0xffffff, 0.07);
  g.fillCircle(center.x, center.y, range);
  g.lineStyle(1, 0xffffff, 0.35);
  g.strokeCircle(center.x, center.y, range);
}

function drawShot(
  g: Graphics,
  game: GameState,
  origin: Point,
  shot: { tick: number; x: number; y: number } | null,
  color: number,
  splashRadius: number,
  width = 2,
  splashColor = SPLASH_COLOR,
): void {
  if (!shot || game.tick - shot.tick >= SHOT_VISIBLE_TICKS) return;
  g.lineStyle(width, color, 0.9);
  g.lineBetween(origin.x, origin.y, shot.x, shot.y);
  if (splashRadius > 0) {
    g.fillStyle(splashColor, 0.35);
    g.fillCircle(shot.x, shot.y, splashRadius);
  }
}

/** A melee hit: a sweep of the blade in front of the hero instead of a shot. */
function drawSlash(
  g: Graphics,
  game: GameState,
  hero: Point,
  shot: { tick: number; x: number; y: number } | null,
): void {
  if (!shot) return;
  const age = game.tick - shot.tick;
  if (age >= SHOT_VISIBLE_TICKS * 2) return;
  const t = age / (SHOT_VISIBLE_TICKS * 2);
  const facing = Math.atan2(shot.y - hero.y, shot.x - hero.x);
  const reach = Math.max(HERO_RADIUS + 8, Math.hypot(shot.x - hero.x, shot.y - hero.y));
  // The blade sweeps across in front of the hero, leaving a fading trail.
  const sweep = -0.9 + 1.8 * t;
  g.lineStyle(5, 0xffffff, 0.9 * (1 - t));
  g.beginPath();
  g.arc(hero.x, hero.y, reach, facing - 0.9, facing + sweep);
  g.strokePath();
  g.lineStyle(2, 0xffe08a, 1 - t);
  g.beginPath();
  g.arc(hero.x, hero.y, reach + 4, facing + sweep - 0.5, facing + sweep);
  g.strokePath();
}

function drawSelection(g: Graphics, hero: Hero, range: number): void {
  drawRange(g, hero, range);
  g.lineStyle(2, SELECTION_COLOR, 1);
  g.strokeCircle(hero.x, hero.y, HERO_RADIUS + 5);

  if (isMoving(hero)) {
    g.lineStyle(1, SELECTION_COLOR, 0.6);
    g.lineBetween(hero.x, hero.y, hero.targetX, hero.targetY);
    g.strokeCircle(hero.targetX, hero.targetY, 6);
  }
}

/** A ring that closes as the fallen hero gets closer to returning. */
function drawRespawnProgress(g: Graphics, level: Level, hero: Hero): void {
  const progress = 1 - hero.respawnTicks / level.heroRespawnTicks;
  const start = -Math.PI / 2;
  g.lineStyle(3, 0xffffff, 0.8);
  g.beginPath();
  g.arc(hero.x, hero.y, HERO_RADIUS + 5, start, start + progress * Math.PI * 2);
  g.strokePath();
}

/** `radius` sets the width; the bar sits `above` px higher than `at`, plus a small gap. */
function drawHealthBar(g: Graphics, at: Point, radius: number, above: number, fraction: number, color: number): void {
  const width = radius * 2 + 4;
  const left = at.x - width / 2;
  const top = at.y - above - 9;
  g.fillStyle(0x1b1b1b, 0.85);
  g.fillRect(left - 1, top - 1, width + 2, 6);
  g.fillStyle(color, 1);
  g.fillRect(left, top, width * Math.max(0, fraction), 4);
}
