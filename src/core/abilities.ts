import { canReach, dealDamage } from './combat';
import { clamp, enemyPosition, heroMaxHp, heroPower, isAlive } from './queries';
import type { GameState, Hero, Level } from './types';

/**
 * Fires one of the hero's abilities. The caller has already checked it may be
 * used. `x` and `y` only matter for targeted abilities.
 */
export function castAbility(
  game: GameState,
  level: Level,
  hero: Hero,
  index: number,
  x: number,
  y: number,
): void {
  const ability = level.heroTypes[hero.type].abilities[index];
  const power = heroPower(level, hero);
  let centerX = hero.x;
  let centerY = hero.y;
  if (ability.targeted) {
    // A target beyond the cast range is pulled back onto its edge.
    const dx = x - hero.x;
    const dy = y - hero.y;
    const reach = Math.hypot(dx, dy);
    const scale = reach > ability.castRange ? ability.castRange / reach : 1;
    centerX = clamp(hero.x + dx * scale, 0, level.width);
    centerY = clamp(hero.y + dy * scale, 0, level.height);
  }

  hero.abilityCooldowns[index] = ability.cooldownTicks;
  hero.lastCast = { tick: game.tick, x: centerX, y: centerY, ability: index };

  if (ability.zone) {
    game.zones.push({
      ...ability.zone,
      // The caster's level is baked in, so the zone keeps its strength if he falls.
      damage: ability.zone.damage * power,
      x: centerX,
      y: centerY,
      radius: ability.radius,
      ticksLeft: ability.zone.durationTicks,
      pulseCooldownTicks: 0,
      damageType: ability.damageType,
      hitsFlying: ability.hitsFlying,
    });
  }

  const damage = ability.damage * power;
  if (damage <= 0 && ability.stunTicks <= 0) return;
  for (const enemy of game.enemies) {
    if (!canReach(level, enemy, ability.hitsFlying)) continue;
    const position = enemyPosition(level, enemy);
    if (Math.hypot(position.x - centerX, position.y - centerY) > ability.radius) continue;
    dealDamage(level, enemy, damage, ability.damageType);
    enemy.stunTicks = Math.max(enemy.stunTicks, ability.stunTicks);
  }
}

/**
 * Zones slow the enemies inside all the time and, on every pulse, hurt them and
 * heal the heroes inside. They vanish when their time runs out.
 */
export function updateZones(game: GameState, level: Level): void {
  for (const zone of game.zones) {
    const pulsing = zone.pulseCooldownTicks === 0;
    zone.pulseCooldownTicks = pulsing ? zone.intervalTicks - 1 : zone.pulseCooldownTicks - 1;

    for (const enemy of game.enemies) {
      if (!canReach(level, enemy, zone.hitsFlying)) continue;
      const position = enemyPosition(level, enemy);
      if (Math.hypot(position.x - zone.x, position.y - zone.y) > zone.radius) continue;
      if (zone.slowFactor < 1) {
        // One tick at a time, so the slow ends as soon as the enemy leaves.
        enemy.slowTicks = Math.max(enemy.slowTicks, 1);
        enemy.slowFactor = zone.slowFactor;
      }
      if (pulsing && zone.damage > 0) dealDamage(level, enemy, zone.damage, zone.damageType);
    }

    if (pulsing && zone.healAmount > 0) {
      for (const hero of game.heroes) {
        if (!isAlive(hero)) continue;
        if (Math.hypot(hero.x - zone.x, hero.y - zone.y) > zone.radius) continue;
        hero.hp = Math.min(heroMaxHp(level, hero), hero.hp + zone.healAmount);
      }
    }
    zone.ticksLeft--;
  }
  game.zones = game.zones.filter((zone) => zone.ticksLeft > 0);
}
