import { isAlive, type GameState, type Phase } from '../core/simulation';

/** Things that happen in the game and deserve a sound. */
export type SoundEvent =
  | 'shot'
  | 'cast'
  | 'kill'
  | 'lifeLost'
  | 'build'
  | 'upgrade'
  | 'sell'
  | 'levelUp'
  | 'heroDown'
  | 'waveStart'
  | 'waveClear'
  | 'victory'
  | 'defeat';

/** What was true the last time we listened: just enough to notice what changed. */
export interface Heard {
  tick: number;
  phase: Phase;
  lives: number;
  gold: number;
  towerCount: number;
  towerLevels: number;
  heroLevels: number;
  fallenHeroes: number;
}

export function listen(game: GameState): Heard {
  return {
    tick: game.tick,
    phase: game.phase,
    lives: game.lives,
    gold: game.gold,
    towerCount: game.towers.length,
    towerLevels: game.towers.reduce((sum, tower) => sum + tower.level, 0),
    heroLevels: game.heroes.reduce((sum, hero) => sum + hero.level, 0),
    fallenHeroes: game.heroes.filter((hero) => !isAlive(hero)).length,
  };
}

/**
 * The simulation makes no sound: this compares it with how it was a moment ago
 * and names what happened in between. Each event appears at most once, however
 * many times it happened, so a busy frame does not stack the same sound.
 */
export function soundEventsSince(before: Heard, game: GameState): SoundEvent[] {
  // An earlier tick means a new game started: nothing to compare.
  if (game.tick < before.tick) return [];
  const now = listen(game);
  const events: SoundEvent[] = [];

  const isNew = (shot: { tick: number } | null): boolean => shot !== null && shot.tick > before.tick;
  if (game.heroes.some((hero) => isNew(hero.lastShot)) || game.towers.some((t) => isNew(t.lastShot))) {
    events.push('shot');
  }
  if (game.heroes.some((hero) => isNew(hero.lastCast))) events.push('cast');

  const towersChanged =
    now.towerCount !== before.towerCount || now.towerLevels !== before.towerLevels;
  // Gold also comes from selling; without a tower change it can only be a bounty.
  if (now.gold > before.gold && !towersChanged) events.push('kill');
  if (now.lives < before.lives) events.push('lifeLost');

  if (now.towerCount > before.towerCount) events.push('build');
  else if (now.towerCount < before.towerCount) events.push('sell');
  else if (now.towerLevels > before.towerLevels) events.push('upgrade');

  if (now.heroLevels > before.heroLevels) events.push('levelUp');
  if (now.fallenHeroes > before.fallenHeroes) events.push('heroDown');

  if (now.phase !== before.phase) {
    if (now.phase === 'wave') events.push('waveStart');
    else if (now.phase === 'preparing') events.push('waveClear');
    else if (now.phase === 'won') events.push('victory');
    else events.push('defeat');
  }
  return events;
}
