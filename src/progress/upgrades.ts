import type { Level } from '../core/simulation';

/** What each rank of a hero adds, as a fraction of its base values. */
export const RANK_BONUS = {
  damage: 0.1,
  health: 0.1,
  /** Shaved off every ability cooldown. */
  cooldown: 0.07,
};

/**
 * The level with the player's permanent hero upgrades applied. `ranks` maps a
 * hero type to its rank. The level passed in is left untouched.
 */
export function applyHeroRanks(level: Level, ranks: Readonly<Record<string, number>>): Level {
  const heroTypes = Object.fromEntries(
    Object.entries(level.heroTypes).map(([type, hero]) => {
      const rank = ranks[type] ?? 0;
      if (rank <= 0) return [type, hero];

      const damage = 1 + rank * RANK_BONUS.damage;
      const cooldown = 1 - rank * RANK_BONUS.cooldown;
      return [
        type,
        {
          ...hero,
          damage: hero.damage * damage,
          maxHp: Math.round(hero.maxHp * (1 + rank * RANK_BONUS.health)),
          abilities: hero.abilities.map((ability) => ({
            ...ability,
            damage: ability.damage * damage,
            cooldownTicks: Math.round(ability.cooldownTicks * cooldown),
            zone: ability.zone && { ...ability.zone, damage: ability.zone.damage * damage },
          })),
        },
      ];
    }),
  );
  return { ...level, heroTypes };
}
