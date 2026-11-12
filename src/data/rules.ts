import type { EnemyType, HeroType, Level, TowerLevel, TowerType } from '../core/simulation';
import type { Wave, WaveGroup } from '../core/waves';

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

// Balance values. Times are in ticks (60 per second).

/** A walking enemy with no armor. Each enemy overrides what makes it different. */
const plainEnemy = { armor: 0, flying: false };

const enemyTypes: Record<string, EnemyType> = {
  soldier: {
    ...plainEnemy,
    maxHp: 224,
    speed: 60,
    bounty: 5,
    livesCost: 1,
    damage: 6,
    attackIntervalTicks: 60,
    xp: 4,
  },
  runner: {
    ...plainEnemy,
    maxHp: 123,
    speed: 110,
    bounty: 4,
    livesCost: 1,
    damage: 4,
    attackIntervalTicks: 50,
    xp: 3,
  },
  // Shrugs off 40 % of physical damage: magic is the answer.
  armored: {
    ...plainEnemy,
    maxHp: 620,
    speed: 40,
    bounty: 12,
    livesCost: 2,
    damage: 14,
    attackIntervalTicks: 70,
    xp: 10,
    armor: 0.4,
  },
  // Cannot be blocked, and the warrior and the cannon cannot reach it.
  flyer: {
    ...plainEnemy,
    maxHp: 130,
    speed: 80,
    bounty: 6,
    livesCost: 1,
    damage: 0,
    attackIntervalTicks: 60,
    xp: 4,
    flying: true,
  },
  boss: {
    ...plainEnemy,
    maxHp: 3800,
    speed: 30,
    bounty: 100,
    livesCost: 5,
    damage: 40,
    attackIntervalTicks: 80,
    xp: 60,
    armor: 0.2,
  },
};

/** A hero with no special traits. Each hero overrides what makes it different. */
const plainHero = {
  blockCount: 0,
  splashRadius: 0,
  slowFactor: 1,
  slowTicks: 0,
  healAmount: 0,
  healIntervalTicks: 0,
  healRange: 0,
  damageType: 'physical' as const,
  hitsFlying: true,
};

const FIRST_ABILITY_LEVEL = 2;
const SECOND_ABILITY_LEVEL = 4;

/** An instant ability with no effect. Each ability overrides what it does. */
const plainAbility = {
  targeted: false,
  castRange: 0,
  damage: 0,
  stunTicks: 0,
  zone: null,
  damageType: 'physical' as const,
  hitsFlying: true,
  unlockLevel: FIRST_ABILITY_LEVEL,
};

/** A zone that pulses twice a second and does nothing by itself. */
const plainZone = { intervalTicks: 30, slowFactor: 1, healAmount: 0, damage: 0 };

const heroTypes: Record<string, HeroType> = {
  warrior: {
    ...plainHero,
    moveSpeed: 110,
    range: 38,
    damage: 14,
    attackIntervalTicks: 40,
    maxHp: 260,
    blockCount: 2,
    hitsFlying: false,
    abilities: [
      // Seismic strike: stuns everything on the ground around the warrior.
      {
        ...plainAbility,
        cooldownTicks: 20 * 60,
        radius: 75,
        damage: 25,
        stunTicks: 150,
        hitsFlying: false,
      },
      // Second wind: a healing circle around the warrior.
      {
        ...plainAbility,
        unlockLevel: SECOND_ABILITY_LEVEL,
        cooldownTicks: 30 * 60,
        radius: 70,
        zone: { ...plainZone, durationTicks: 5 * 60, healAmount: 30 },
      },
    ],
  },
  archer: {
    ...plainHero,
    moveSpeed: 140,
    range: 170,
    damage: 12,
    attackIntervalTicks: 30,
    maxHp: 90,
    abilities: [
      // Volley: hits every enemy within her range.
      { ...plainAbility, cooldownTicks: 18 * 60, radius: 170, damage: 60 },
      // Piercing shot: one heavy hit on a small spot, from far away.
      {
        ...plainAbility,
        unlockLevel: SECOND_ABILITY_LEVEL,
        cooldownTicks: 22 * 60,
        targeted: true,
        castRange: 320,
        radius: 30,
        damage: 320,
      },
    ],
  },
  mage: {
    ...plainHero,
    moveSpeed: 100,
    range: 150,
    damage: 22,
    attackIntervalTicks: 75,
    maxHp: 80,
    splashRadius: 45,
    damageType: 'magic',
    abilities: [
      // Meteor: heavy damage on a chosen spot.
      {
        ...plainAbility,
        cooldownTicks: 25 * 60,
        targeted: true,
        castRange: 280,
        radius: 70,
        damage: 180,
        damageType: 'magic',
      },
      // Arcane storm: an area that keeps hurting whatever walks through it.
      {
        ...plainAbility,
        unlockLevel: SECOND_ABILITY_LEVEL,
        cooldownTicks: 30 * 60,
        targeted: true,
        castRange: 280,
        radius: 85,
        damageType: 'magic',
        zone: { ...plainZone, durationTicks: 5 * 60, damage: 35 },
      },
    ],
  },
  support: {
    ...plainHero,
    moveSpeed: 120,
    range: 140,
    damage: 3,
    attackIntervalTicks: 30,
    maxHp: 110,
    slowFactor: 0.55,
    slowTicks: 75,
    healAmount: 8,
    healIntervalTicks: 45,
    healRange: 130,
    damageType: 'magic',
    abilities: [
      // Ice zone: slows enemies and heals allies on a chosen spot.
      {
        ...plainAbility,
        cooldownTicks: 22 * 60,
        targeted: true,
        castRange: 240,
        radius: 85,
        zone: { ...plainZone, durationTicks: 6 * 60, slowFactor: 0.4, healAmount: 10 },
      },
      // Deep freeze: stops everything on a chosen spot, flyers included.
      {
        ...plainAbility,
        unlockLevel: SECOND_ABILITY_LEVEL,
        cooldownTicks: 28 * 60,
        targeted: true,
        castRange: 240,
        radius: 90,
        stunTicks: 180,
      },
    ],
  },
};

/** A single-target physical tower level. Each tower overrides what makes it different. */
const plainTower = {
  splashRadius: 0,
  slowFactor: 1,
  slowTicks: 0,
  damageType: 'physical' as const,
  hitsFlying: true,
};

function levels(shared: Partial<TowerLevel>, perLevel: Partial<TowerLevel>[]): TowerLevel[] {
  return perLevel.map((level) => ({ ...plainTower, ...shared, ...level }) as TowerLevel);
}

// The first level's cost is the price to build; the others, the price to upgrade.
const towerTypes: Record<string, TowerType> = {
  // Fast, single target, reaches the air.
  archery: {
    levels: levels({ attackIntervalTicks: 24 }, [
      { cost: 70, damage: 9, range: 150 },
      { cost: 60, damage: 15, range: 165 },
      { cost: 90, damage: 24, range: 180 },
    ]),
  },
  // Slow, area damage, ground only.
  cannon: {
    levels: levels({ attackIntervalTicks: 90, hitsFlying: false }, [
      { cost: 110, damage: 26, range: 130, splashRadius: 50 },
      { cost: 90, damage: 42, range: 140, splashRadius: 55 },
      { cost: 130, damage: 65, range: 150, splashRadius: 60 },
    ]),
  },
  // No damage: slows one enemy after another.
  ice: {
    levels: levels({ damage: 0, attackIntervalTicks: 40, damageType: 'magic' }, [
      { cost: 90, range: 120, slowFactor: 0.55, slowTicks: 80 },
      { cost: 70, range: 135, slowFactor: 0.45, slowTicks: 90 },
      { cost: 100, range: 150, slowFactor: 0.35, slowTicks: 100 },
    ]),
  },
  // Heavy magic hits that ignore armor.
  arcane: {
    levels: levels({ attackIntervalTicks: 70, damageType: 'magic' }, [
      { cost: 140, damage: 55, range: 140 },
      { cost: 110, damage: 90, range: 150 },
      { cost: 160, damage: 140, range: 160 },
    ]),
  },
};

function group(enemy: string, count: number, intervalTicks: number, delayTicks = 0): WaveGroup {
  return { enemy, count, intervalTicks, delayTicks };
}

const waves: Wave[] = [
  [group('soldier', 6, 90)],
  [group('soldier', 10, 70)],
  [group('soldier', 6, 70), group('runner', 6, 40, 300)],
  [group('runner', 12, 35), group('flyer', 4, 60, 200)],
  [group('soldier', 10, 50), group('armored', 2, 180, 200)],
  [group('armored', 5, 150), group('runner', 8, 40, 120), group('flyer', 6, 50, 400)],
  [group('soldier', 16, 40), group('armored', 4, 160)],
  [group('runner', 20, 25), group('armored', 6, 140, 200), group('flyer', 10, 40, 300)],
  [
    group('soldier', 20, 30),
    group('runner', 14, 30, 300),
    group('armored', 8, 120, 100),
    group('flyer', 8, 45, 500),
  ],
  // 10: first boss.
  [
    group('boss', 1, 0, 300),
    group('soldier', 16, 45),
    group('armored', 6, 150),
    group('runner', 12, 40, 600),
    group('flyer', 10, 40, 900),
  ],
  [group('soldier', 24, 28), group('flyer', 12, 40, 200)],
  [group('armored', 12, 90), group('runner', 16, 30, 300)],
  [group('runner', 30, 20), group('flyer', 16, 35, 300)],
  [group('soldier', 24, 26), group('armored', 10, 100, 100), group('flyer', 10, 45, 500)],
  // 15: two bosses with an escort.
  [group('boss', 2, 600, 200), group('armored', 10, 110), group('runner', 20, 30, 400)],
  [group('flyer', 30, 25), group('armored', 12, 90, 200)],
  [group('soldier', 36, 20), group('runner', 24, 22, 400)],
  [group('armored', 14, 80), group('flyer', 18, 35, 300), group('runner', 20, 25, 700)],
  [
    group('soldier', 30, 22),
    group('armored', 12, 90, 200),
    group('flyer', 20, 30, 500),
    group('boss', 1, 0, 900),
  ],
  // 20: the last stand.
  [
    group('boss', 2, 700, 300),
    group('armored', 10, 110),
    group('soldier', 24, 30, 200),
    group('flyer', 16, 40, 600),
    group('runner', 20, 30, 1000),
  ],
];

/** The waves every map uses unless it defines its own. */
export const standardWaves: readonly Wave[] = waves;

/** Everything the maps share: the units, the economy and how heroes grow. */
export const sharedRules = {
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  startingGold: 100,
  startingLives: 20,
  speedJitter: 0.1,
  waveHpGrowth: 0.035,
  // Campaign maps end with their last scripted wave; `asEndless` changes that.
  endless: null,
  scorePerWave: 100,
  enemyTypes,
  heroTypes,
  heroRespawnTicks: 15 * 60,
  xpRange: 220,
  xpThresholds: [0, 30, 100, 240, 480],
  levelBonus: 0.1,
  towerTypes,
  sellRefund: 0.6,
} satisfies Partial<Level>;
