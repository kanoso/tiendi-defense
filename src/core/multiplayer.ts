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

/** The most heroes one player may hold: an even split, rounded up. */
export function heroShare(playerCount: number, heroCount: number): number {
  return Math.ceil(heroCount / Math.max(1, playerCount));
}

/**
 * Hands the heroes out taking into account the ones each player chose. Each
 * player keeps their choices, first ones first, up to a fair share; a hero
 * chosen by two goes to whoever comes first. Whatever is left is handed out in
 * turns, so without any choices this gives the same as `assignHeroes`.
 */
export function distributeHeroes(
  wishes: readonly (readonly number[])[],
  heroCount: number,
): number[][] {
  const playerCount = wishes.length;
  const isHero = (id: number) => Number.isInteger(id) && id >= 1 && id <= heroCount;
  const valid = wishes.map((list) => list.filter(isHero));

  // Everyone gets the same number of heroes; when they do not divide evenly,
  // the extra ones go to whoever asked for more, then to whoever came first.
  const base = Math.floor(heroCount / playerCount);
  const shares = valid.map(() => base);
  valid
    .map((list, index) => ({ index, asked: list.length }))
    .sort((a, b) => b.asked - a.asked || a.index - b.index)
    .slice(0, heroCount % playerCount)
    .forEach(({ index }) => shares[index]++);

  const taken = new Set<number>();
  const heroes: number[][] = valid.map((list, index) => {
    const kept: number[] = [];
    for (const id of list) {
      if (kept.length >= shares[index] || taken.has(id)) continue;
      kept.push(id);
      taken.add(id);
    }
    return kept;
  });

  let next = 0;
  for (let id = 1; id <= heroCount; id++) {
    if (taken.has(id)) continue;
    while (heroes[next].length >= shares[next]) next = (next + 1) % playerCount;
    heroes[next].push(id);
    next = (next + 1) % playerCount;
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
