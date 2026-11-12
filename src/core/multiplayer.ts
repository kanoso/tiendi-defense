import type { Command } from './types';

// Rules of playing together that do not depend on any network: who controls
// which hero, and which orders a player may give.

/**
 * Hands the heroes out among the players, one at a time in turns. The result
 * has one list of hero ids per player, in player order. Hero ids start at one.
 */
export function assignHeroes(playerCount: number, heroCount: number): number[][] {
  const heroes: number[][] = Array.from({ length: playerCount }, () => []);
  for (let hero = 1; hero <= heroCount; hero++) {
    heroes[(hero - 1) % playerCount].push(hero);
  }
  return heroes;
}

/** Index of the player who controls a hero, or null if nobody does. */
export function ownerOf(heroesByPlayer: readonly (readonly number[])[], heroId: number): number | null {
  const owner = heroesByPlayer.findIndex((heroes) => heroes.includes(heroId));
  return owner === -1 ? null : owner;
}

/**
 * Reads an order that arrived from another machine. Anything that is not a
 * well-formed order gives null: a stray text, a missing field, a number that is
 * not finite. One bad number let into the simulation would spread through it
 * and leave every player with a different game.
 */
export function parseCommand(raw: unknown): Command | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;
  const isIndex = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 1000;
  const isCoordinate = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 100_000;

  switch (data.type) {
    case 'startWave':
      return { type: 'startWave' };
    case 'moveHero':
      if (!isIndex(data.heroId) || !isCoordinate(data.x) || !isCoordinate(data.y)) return null;
      return { type: 'moveHero', heroId: data.heroId, x: data.x, y: data.y };
    case 'useAbility':
      if (!isIndex(data.heroId) || !isIndex(data.ability)) return null;
      if (!isCoordinate(data.x) || !isCoordinate(data.y)) return null;
      return {
        type: 'useAbility',
        heroId: data.heroId,
        ability: data.ability,
        x: data.x,
        y: data.y,
      };
    case 'buildTower':
      if (!isIndex(data.slot) || typeof data.tower !== 'string' || data.tower.length > 32) return null;
      return { type: 'buildTower', slot: data.slot, tower: data.tower };
    case 'upgradeTower':
      return isIndex(data.slot) ? { type: 'upgradeTower', slot: data.slot } : null;
    case 'sellTower':
      return isIndex(data.slot) ? { type: 'sellTower', slot: data.slot } : null;
    default:
      return null;
  }
}

/**
 * Whether a player who controls `ownHeroes` may give this order. Heroes obey
 * only their player; towers and gold belong to everyone. Starting the wave is
 * never a single player's call: the server does it once everybody is ready.
 */
export function isAllowed(command: Command, ownHeroes: readonly number[]): boolean {
  switch (command.type) {
    case 'moveHero':
    case 'useAbility':
      return ownHeroes.includes(command.heroId);
    case 'buildTower':
    case 'upgradeTower':
    case 'sellTower':
      return true;
    case 'startWave':
      return false;
  }
}
