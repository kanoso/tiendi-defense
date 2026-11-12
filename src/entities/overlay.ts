import type Phaser from 'phaser';
import type { Point } from '../core/path';
import { heroMaxHp, isAlive, isMoving, type GameState, type Hero, type Level } from '../core/simulation';
import {
  CAST_VISIBLE_TICKS,
  ENEMY_STYLE,
  HEAL_COLOR,
  HERO_RADIUS,
  HERO_STYLE,
  SELECTION_COLOR,
  SHOT_COLOR,
  SHOT_VISIBLE_TICKS,
  SLOW_COLOR,
  SPLASH_COLOR,
  STORM_COLOR,
  STUN_COLOR,
} from './styles';

type Graphics = Phaser.GameObjects.Graphics;

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
  pointer: Point;
  /** Where each enemy is drawn this frame, by enemy id. */
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
  for (const zone of game.zones) {
    // Colored by what the zone mainly does: hurt, slow or heal.
    const color = zone.damage > 0 ? STORM_COLOR : zone.slowFactor < 1 ? SLOW_COLOR : HEAL_COLOR;
    g.fillStyle(color, 0.22);
    g.fillCircle(zone.x, zone.y, zone.radius);
    g.lineStyle(2, color, 0.7);
    g.strokeCircle(zone.x, zone.y, zone.radius);
  }
}

/** A burst that fades where an ability just landed. */
function drawAbilityCasts(g: Graphics, { game, level }: OverlayView): void {
  for (const hero of game.heroes) {
    const cast = hero.lastCast;
    const ability = cast && level.heroTypes[hero.type].abilities[cast.ability];
    if (!cast || !ability) continue;
    const age = game.tick - cast.tick;
    if (age >= CAST_VISIBLE_TICKS) continue;
    const fade = 1 - age / CAST_VISIBLE_TICKS;
    g.fillStyle(HERO_STYLE[hero.type].color, 0.45 * fade);
    g.fillCircle(cast.x, cast.y, ability.radius);
    g.lineStyle(3, 0xffffff, 0.8 * fade);
    g.strokeCircle(cast.x, cast.y, ability.radius);
  }
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
    const stats = level.towerTypes[tower.type].levels[tower.level];
    if (tower.slot === menuSlot) drawRange(g, origin, stats.range);
    const color = stats.slowTicks > 0 ? SLOW_COLOR : SHOT_COLOR;
    drawShot(g, game, origin, tower.lastShot, color, stats.splashRadius);
  }
}

function drawHeroMarks(g: Graphics, { game, level, selectedHeroId }: OverlayView): void {
  for (const hero of game.heroes) {
    if (!isAlive(hero)) {
      drawRespawnProgress(g, level, hero);
      continue;
    }
    const type = level.heroTypes[hero.type];
    if (hero.id === selectedHeroId) drawSelection(g, hero, type.range);
    drawShot(g, game, hero, hero.lastShot, type.slowTicks > 0 ? SLOW_COLOR : SHOT_COLOR, type.splashRadius);

    const heal = hero.lastHeal;
    if (heal && game.tick - heal.tick < SHOT_VISIBLE_TICKS * 2) {
      g.lineStyle(3, HEAL_COLOR, 0.8);
      g.lineBetween(hero.x, hero.y, heal.x, heal.y);
      g.strokeCircle(heal.x, heal.y, HERO_RADIUS + 8);
    }
    const maxHp = heroMaxHp(level, hero);
    if (hero.hp < maxHp) drawHealthBar(g, hero, HERO_RADIUS, hero.hp / maxHp, 0x4aa3ff);
  }
}

function drawEnemyMarks(g: Graphics, { game, enemyPositions }: OverlayView): void {
  for (const enemy of game.enemies) {
    const position = enemyPositions.get(enemy.id);
    if (!position) continue;
    const radius = ENEMY_STYLE[enemy.type].radius;
    if (enemy.stunTicks > 0) {
      g.lineStyle(3, STUN_COLOR, 0.95);
      g.strokeCircle(position.x, position.y, radius + 3);
    } else if (enemy.slowTicks > 0) {
      g.lineStyle(3, SLOW_COLOR, 0.9);
      g.strokeCircle(position.x, position.y, radius + 3);
    }
    if (enemy.hp < enemy.maxHp) {
      drawHealthBar(g, position, radius, enemy.hp / enemy.maxHp, 0x6fcf4a);
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
): void {
  if (!shot || game.tick - shot.tick >= SHOT_VISIBLE_TICKS) return;
  g.lineStyle(2, color, 0.9);
  g.lineBetween(origin.x, origin.y, shot.x, shot.y);
  if (splashRadius > 0) {
    g.fillStyle(SPLASH_COLOR, 0.35);
    g.fillCircle(shot.x, shot.y, splashRadius);
  }
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

function drawHealthBar(g: Graphics, at: Point, radius: number, fraction: number, color: number): void {
  const width = radius * 2 + 4;
  const left = at.x - width / 2;
  const top = at.y - radius - 9;
  g.fillStyle(0x1b1b1b, 0.85);
  g.fillRect(left - 1, top - 1, width + 2, 6);
  g.fillStyle(color, 1);
  g.fillRect(left, top, width * Math.max(0, fraction), 4);
}
