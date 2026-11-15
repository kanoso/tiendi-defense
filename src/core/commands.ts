import { castAbility } from './abilities';
import { canUseAbility, clamp, isAlive, waveAt } from './queries';
import { buildTower, clearSlot, sellTower, specializeTower, upgradeTower } from './towers';
import type { Command, GameState, Level } from './types';
import { buildSpawnQueue } from './waves';

/** Invalid commands are ignored: a remote player may send anything. */
export function applyCommand(game: GameState, level: Level, command: Command): void {
  switch (command.type) {
    case 'startWave': {
      if (game.phase !== 'preparing') return;
      game.phase = 'wave';
      game.waveTick = 0;
      game.spawnQueue = buildSpawnQueue(waveAt(level, game.waveIndex));
      return;
    }
    case 'moveHero': {
      const hero = game.heroes.find((candidate) => candidate.id === command.heroId);
      if (!hero || !isAlive(hero)) return;
      hero.targetX = clamp(command.x, 0, level.width);
      hero.targetY = clamp(command.y, 0, level.height);
      return;
    }
    case 'useAbility': {
      const hero = game.heroes.find((candidate) => candidate.id === command.heroId);
      if (!hero || !canUseAbility(game, level, hero, command.ability)) return;
      castAbility(game, level, hero, command.ability, command.x, command.y);
      return;
    }
    case 'buildTower':
      return buildTower(game, level, command.slot, command.tower);
    case 'upgradeTower':
      return upgradeTower(game, level, command.slot);
    case 'specializeTower':
      return specializeTower(game, level, command.slot, command.branch);
    case 'sellTower':
      return sellTower(game, level, command.slot);
    case 'clearSlot':
      return clearSlot(game, level, command.slot);
  }
}
