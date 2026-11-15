import { it } from 'vitest';
import type { Level } from '../src/core/simulation';
import { applyDifficulty, DIFFICULTIES } from '../src/data/difficulty';
import { asEndless } from '../src/data/endless';
import { MAPS } from '../src/data/maps';
import { MAX_HERO_RANK } from '../src/progress/progress';
import { applyHeroRanks } from '../src/progress/upgrades';
import { play, type Bot } from './bots';

// Not a test: a report. Run with `npm run balance` after changing balance values
// to see how far scripted players get on every map. Nothing here can fail the build.

// Every map has eight open build slots, so the same build orders work on all of them.
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

// Every map also has four blocked spots after those, slots 8 to 11, cheapest first.
const EXTRA_SPOTS = [
  { slot: 8, tower: 'archery' },
  { slot: 9, tower: 'cannon' },
  { slot: 10, tower: 'archery' },
  { slot: 11, tower: 'arcane' },
];

const BOTS: Bot[] = [
  { name: 'does nothing', build: [], usesAbilities: false },
  { name: 'abilities only', build: [], usesAbilities: true },
  { name: 'basic towers only', build: BASIC_TOWERS, usesAbilities: false },
  { name: 'basic towers + abilities', build: BASIC_TOWERS, usesAbilities: true },
  { name: 'mixed towers + abilities', build: MIXED_TOWERS, usesAbilities: true },
  // The same, spending the gold left over on specializations, then on clearing
  // the four blocked spots and building on them. On a map without branches it
  // only does the spots (see `onLevel`).
  {
    name: 'mixed + branches + abilities',
    build: MIXED_TOWERS,
    usesAbilities: true,
    branches: { archery: 'lluvia', cannon: 'bombarda', ice: 'escarcha', arcane: 'rayo' },
    extraSpots: EXTRA_SPOTS,
  },
];

const SEEDS = [3, 5, 11];

it('prints how far each scripted player gets on each map', () => {
  const lines: string[] = [];
  for (const map of MAPS) {
    lines.push('', `=== ${map.name} · ${map.level.waves.length} waves · seeds ${SEEDS.join(', ')}`);
    for (const bot of BOTS) lines.push(...report(map.level, bot));
  }
  // Difficulties and permanent hero ranks, measured with the strongest scripted
  // player on the first map and on the maps with branches, which are built
  // around the newer enemies and balanced on their own.
  const best = BOTS[BOTS.length - 1];
  const maxRanks = Object.fromEntries(
    Object.keys(MAPS[0].level.heroTypes).map((type) => [type, MAX_HERO_RANK]),
  );
  const measured = [MAPS[0], ...MAPS.filter((map) => map.level.towerBranches === true)];
  for (const map of measured) {
    for (const difficulty of DIFFICULTIES) {
      const level = applyDifficulty(map.level, difficulty.id);
      lines.push('', `=== ${map.name} · ${difficulty.name} · ${onLevel(level, best).name}`);
      lines.push(...report(level, { ...best, name: 'heroes without ranks' }));
      lines.push(...report(applyHeroRanks(level, maxRanks), { ...best, name: 'heroes at top rank' }));
    }
  }
  // Endless mode has no victory: what matters is how long the best player lasts.
  for (const map of MAPS) {
    lines.push('', `=== ${map.name} · endless · ${onLevel(map.level, best).name}`);
    for (const [label, level] of [
      ['heroes without ranks', asEndless(map.level, map.endlessExtras, map.endlessHpGrowth)],
      ['heroes at top rank', asEndless(applyHeroRanks(map.level, maxRanks), map.endlessExtras, map.endlessHpGrowth)],
    ] as const) {
      const runs = SEEDS.map((seed) => play(level, best, seed));
      lines.push(
        `  ${label.padEnd(22)}` +
          runs
            .map((run) => `wave ${run.wave}, ${run.score} pts, ${run.minutes.toFixed(1)} min`)
            .join('   |   '),
      );
    }
  }
  console.log(lines.join('\n'));
});

/** The bot as it plays that level: one that would specialize only takes spots where the map has no branches. */
function onLevel(level: Level, bot: Bot): Bot {
  if (level.towerBranches === true || !bot.branches) return bot;
  return { ...bot, name: bot.name.replace('branches', 'spots'), branches: undefined };
}

function report(level: Level, given: Bot): string[] {
  const bot = onLevel(level, given);
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
      `  ${''.padEnd(15)} leaked: ${leaks || 'nothing'}  gold left ${result.goldLeft}`,
    );
  }
  return lines;
}
