import {
  canUseAbility,
  createGame,
  distanceToExit,
  enemyPosition,
  isOver,
  step,
  towerAt,
  upgradeCost,
  type Command,
  type GameState,
  type Level,
} from '../src/core/simulation';

// Scripted players used to measure balance. None of them ever moves a hero, so
// they are a floor: a person who positions heroes well should do better.

export interface Bot {
  name: string;
  /** Slots in the order they get built, and what goes on each. Empty for no towers. */
  build: readonly { slot: number; tower: string }[];
  usesAbilities: boolean;
}

export interface Result {
  won: boolean;
  /** Wave the game ended on. */
  wave: number;
  /** Lives left after each wave that was cleared. */
  livesByWave: number[];
  heroLevels: number[];
  minutes: number;
  /** How many enemies of each type reached the exit. */
  leaks: Record<string, number>;
}

const MAX_TICKS = 60 * 60 * 30;

export function play(level: Level, bot: Bot, seed: number): Result {
  const game = createGame(level, seed);
  const livesByWave: number[] = [];

  const leaks: Record<string, number> = {};

  while (!isOver(game) && game.tick < MAX_TICKS) {
    const wasFighting = game.phase === 'wave';
    const livesBefore = game.lives;
    // Whoever is about to cross the exit this tick is what leaks, if lives drop.
    const nearExit = game.enemies.filter(
      (enemy) => enemy.hp > 0 && distanceToExit(level, enemy) < 4,
    );
    step(game, level, decide(game, level, bot));
    if (game.lives < livesBefore) {
      for (const enemy of nearExit) {
        if (!game.enemies.includes(enemy)) leaks[enemy.type] = (leaks[enemy.type] ?? 0) + 1;
      }
    }
    if (wasFighting && game.phase !== 'wave') livesByWave.push(game.lives);
  }

  return {
    leaks,
    won: game.phase === 'won',
    wave: game.waveIndex + 1,
    livesByWave,
    heroLevels: game.heroes.map((hero) => hero.level),
    minutes: game.tick / 3600,
  };
}

export function decide(game: GameState, level: Level, bot: Bot): Command[] {
  const commands: Command[] = [];
  if (game.phase === 'preparing') commands.push({ type: 'startWave' });

  // Fill the build order first, then upgrade whatever is affordable.
  const next = bot.build.find((plan) => !towerAt(game, plan.slot));
  if (next) {
    if (game.gold >= level.towerTypes[next.tower].levels[0].cost) {
      commands.push({ type: 'buildTower', slot: next.slot, tower: next.tower });
    }
  } else {
    const affordable = game.towers.find((tower) => {
      const cost = upgradeCost(level, tower);
      return cost !== null && game.gold >= cost;
    });
    if (affordable) commands.push({ type: 'upgradeTower', slot: affordable.slot });
  }

  if (bot.usesAbilities) {
    for (const hero of game.heroes) {
      level.heroTypes[hero.type].abilities.forEach((ability, index) => {
        if (!canUseAbility(game, level, hero, index)) return;
        const reach = ability.targeted ? ability.castRange : ability.radius;
        // Aim at the enemy closest to the exit among those in reach.
        let target: { x: number; y: number; left: number } | null = null;
        for (const enemy of game.enemies) {
          const position = enemyPosition(level, enemy);
          if (Math.hypot(position.x - hero.x, position.y - hero.y) > reach) continue;
          const left = distanceToExit(level, enemy);
          if (!target || left < target.left) {
            target = { ...position, left };
          }
        }
        if (!target) return;
        commands.push({
          type: 'useAbility',
          heroId: hero.id,
          ability: index,
          x: target.x,
          y: target.y,
        });
      });
    }
  }
  return commands;
}
