import { it } from 'vitest';
import type { Level } from '../src/core/simulation';
import { applyDifficulty, DIFFICULTIES } from '../src/data/difficulty';
import { MAPS } from '../src/data/maps';
import { MAX_HERO_RANK } from '../src/progress/progress';
import { applyHeroRanks } from '../src/progress/upgrades';
import { play, type Bot } from './bots';

// Not a test: a report. Run with `npm run balance` after changing balance values
// to see how far scripted players get on every map. Nothing here can fail the build.

// Every map has eight build slots, so the same build orders work on all of them.
const BASIC_TOWERS = [
  { slot: 1, tower: 'archery' },
  { slot: 2, tower: 'archery' },
  { slot: 0, tower: 'cannon' },
  { slot: 4, tower: 'archery' },
  { slot: 5, tower: 'archery' },
  { slot: 3, tower: 'cannon' },
  { slot: 6, tower: 'archery' },
  { slot: 7, tower: 'archery' },
];

const MIXED_TOWERS = [
  { slot: 1, tower: 'archery' },
  { slot: 2, tower: 'archery' },
  { slot: 0, tower: 'cannon' },
  { slot: 4, tower: 'arcane' },
  { slot: 5, tower: 'archery' },
  { slot: 3, tower: 'ice' },
  { slot: 6, tower: 'arcane' },
  { slot: 7, tower: 'archery' },
];

const BOTS: Bot[] = [
  { name: 'does nothing', build: [], usesAbilities: false },
  { name: 'abilities only', build: [], usesAbilities: true },
  { name: 'basic towers only', build: BASIC_TOWERS, usesAbilities: false },
  { name: 'basic towers + abilities', build: BASIC_TOWERS, usesAbilities: true },
  { name: 'mixed towers + abilities', build: MIXED_TOWERS, usesAbilities: true },
];

const SEEDS = [3, 5, 11];

it('prints how far each scripted player gets on each map', () => {
  const lines: string[] = [];
  for (const map of MAPS) {
    lines.push('', `=== ${map.name} · ${map.level.waves.length} waves · seeds ${SEEDS.join(', ')}`);
    for (const bot of BOTS) lines.push(...report(map.level, bot));
  }
  // Difficulties and permanent hero ranks, measured on the first map with the
  // strongest scripted player.
  const best = BOTS[BOTS.length - 1];
  const maxRanks = Object.fromEntries(
    Object.keys(MAPS[0].level.heroTypes).map((type) => [type, MAX_HERO_RANK]),
  );
  for (const difficulty of DIFFICULTIES) {
    const level = applyDifficulty(MAPS[0].level, difficulty.id);
    lines.push('', `=== ${MAPS[0].name} · ${difficulty.name} · ${best.name}`);
    lines.push(...report(level, { ...best, name: 'heroes without ranks' }));
    lines.push(...report(applyHeroRanks(level, maxRanks), { ...best, name: 'heroes at top rank' }));
  }
  console.log(lines.join('\n'));
});

function report(level: Level, bot: Bot): string[] {
  const lines = ['', bot.name];
  for (const seed of SEEDS) {
    const result = play(level, bot, seed);
    const outcome = result.won ? 'WON ' : `lost on wave ${String(result.wave).padStart(2)}`;
    const leaks = Object.entries(result.leaks)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    lines.push(
      `  ${outcome.padEnd(15)} ${result.minutes.toFixed(1).padStart(4)} min  ` +
        `levels ${result.heroLevels.join('')}  lives ${result.livesByWave.join(',')}`,
      `  ${''.padEnd(15)} leaked: ${leaks || 'nothing'}`,
    );
  }
  return lines;
}
