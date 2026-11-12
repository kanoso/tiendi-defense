import { it } from 'vitest';
import { createGame, isOver, step, STEP_MS } from '../src/core/simulation';
import { asEndless } from '../src/data/endless';
import { MAPS } from '../src/data/maps';
import { decide, type Bot } from './bots';

// Not a test: a measurement. Run with `npm run balance` to see how much time
// the simulation takes per tick as an endless game fills up with enemies.

const bot: Bot = {
  name: 'mixed towers + abilities',
  usesAbilities: true,
  build: [
    { slot: 1, tower: 'archery' },
    { slot: 2, tower: 'archery' },
    { slot: 0, tower: 'cannon' },
    { slot: 4, tower: 'arcane' },
    { slot: 5, tower: 'archery' },
    { slot: 3, tower: 'ice' },
    { slot: 6, tower: 'arcane' },
    { slot: 7, tower: 'archery' },
  ],
};

it('prints the cost of a simulation tick under load', () => {
  const lines = ['', '=== Simulation cost per tick, endless mode, per ten waves'];
  for (const map of MAPS) {
    const level = asEndless(map.level);
    const game = createGame(level, 5);
    // Never lose, so the measurement reaches the crowded late waves.
    game.lives = Number.MAX_SAFE_INTEGER;

    lines.push('', map.name);
    let ticks = 0;
    let elapsed = 0;
    let slowest = 0;
    let mostEnemies = 0;
    let reportedUpTo = 0;
    while (!isOver(game) && game.waveIndex < 50) {
      const commands = decide(game, level, bot);
      const before = performance.now();
      step(game, level, commands);
      const cost = performance.now() - before;
      ticks++;
      elapsed += cost;
      slowest = Math.max(slowest, cost);
      mostEnemies = Math.max(mostEnemies, game.enemies.length);

      if (game.waveIndex >= reportedUpTo + 10) {
        reportedUpTo += 10;
        const average = elapsed / ticks;
        lines.push(
          `  waves ${String(reportedUpTo - 9).padStart(2)}-${reportedUpTo}: ` +
            `average ${average.toFixed(3)} ms, slowest ${slowest.toFixed(2)} ms, ` +
            `up to ${mostEnemies} enemies, ` +
            `${((average / STEP_MS) * 100).toFixed(1)} % of a frame`,
        );
        ticks = elapsed = slowest = mostEnemies = 0;
      }
    }
  }
  console.log(lines.join('\n'));
});
