import { updateZones } from './abilities';
import { applyCommand } from './commands';
import { collectBounties, moveEnemies, spawnDueEnemies, tickStuns } from './enemies';
import {
  attackBlockers,
  attackWithHeroes,
  healWithHeroes,
  restoreHeroes,
  updateBlocks,
  updateHeroes,
} from './heroes';
import { isOver, levelForXp, maxHpAt } from './queries';
import { createRng } from './rng';
import { attackWithTowers, tickTowerCooldowns } from './towers';
import type { Command, GameState, Level } from './types';

// The public face of the game logic: create a game, advance it one tick.
export * from './types';
export * from './queries';

export function createGame(level: Level, seed: number): GameState {
  const startingLevel = levelForXp(level, 0);
  return {
    tick: 0,
    phase: 'preparing',
    waveIndex: 0,
    waveTick: 0,
    spawnQueue: [],
    nextEnemyId: 1,
    enemies: [],
    heroes: level.heroes.map((spawn, index) => ({
      id: index + 1,
      type: spawn.type,
      x: spawn.x,
      y: spawn.y,
      targetX: spawn.x,
      targetY: spawn.y,
      hp: maxHpAt(level, spawn.type, startingLevel),
      respawnTicks: 0,
      xp: 0,
      level: startingLevel,
      cooldownTicks: 0,
      healCooldownTicks: 0,
      abilityCooldowns: level.heroTypes[spawn.type].abilities.map(() => 0),
      lastShot: null,
      lastHeal: null,
      lastCast: null,
    })),
    nextTowerId: 1,
    towers: [],
    zones: [],
    lives: level.startingLives,
    gold: level.startingGold,
    rng: createRng(seed),
  };
}

/**
 * Advances the game by exactly one tick. The only way the state changes.
 * The order of the calls below is part of the rules; tests depend on it.
 */
export function step(game: GameState, level: Level, commands: readonly Command[] = []): void {
  if (isOver(game)) return;

  for (const command of commands) applyCommand(game, level, command);
  game.tick++;
  updateHeroes(game, level);
  tickTowerCooldowns(game);

  if (game.phase !== 'wave') return;
  spawnDueEnemies(game, level);
  game.waveTick++;
  updateBlocks(game, level);
  updateZones(game, level);
  moveEnemies(game, level);
  if (game.lives === 0) {
    game.phase = 'lost';
    return;
  }
  attackBlockers(game, level);
  tickStuns(game);
  healWithHeroes(game, level);
  attackWithHeroes(game, level);
  attackWithTowers(game, level);
  collectBounties(game, level);
  finishWaveIfCleared(game, level);
}

function finishWaveIfCleared(game: GameState, level: Level): void {
  if (game.spawnQueue.length > 0 || game.enemies.length > 0) return;
  restoreHeroes(game, level);
  game.zones = [];
  if (game.waveIndex === level.waves.length - 1) {
    game.phase = 'won';
  } else {
    game.waveIndex++;
    game.phase = 'preparing';
  }
}
