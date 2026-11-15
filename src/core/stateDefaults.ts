import type { Enemy, GameState } from './types';

/**
 * Fills in, on a copy, what a state made by an older version of the game lacks:
 * towers from before branches existed have none, enemies from before stuns
 * existed are not stunned, games from before spots could be cleared have none
 * cleared, and games from before enemies could heal or rise have nobody lying
 * on the road and no heal waiting. Cleared spots are put in order, as the game
 * keeps them.
 *
 * Used on saved games and on whole games sent by the server, which may run
 * another version for a moment.
 */
export function withStateDefaults(state: GameState): GameState {
  return {
    ...state,
    clearedSlots: [...(state.clearedSlots ?? [])].sort((a, b) => a - b),
    towers: state.towers.map((tower) => ({ ...tower, branch: tower.branch ?? null })),
    enemies: state.enemies.map(withEnemyDefaults),
    rising: (state.rising ?? []).map((fallen) => ({ ...fallen, enemy: withEnemyDefaults(fallen.enemy) })),
  };
}

function withEnemyDefaults(enemy: Enemy): Enemy {
  return {
    ...enemy,
    stunTicks: enemy.stunTicks ?? 0,
    healCooldownTicks: enemy.healCooldownTicks ?? 0,
    revived: enemy.revived ?? false,
  };
}
