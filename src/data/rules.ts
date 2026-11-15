import type { EnemyType, HeroType, Level, TowerBranch, TowerLevel, TowerType } from '../core/simulation';
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
    // Stuns and freezes last half as long: a single ice tower must not hold it in place.
    stunResist: 0.5,
  },
  // The enemies below have a trait of their own. The first three maps never send
  // them; maps built around them add them to their waves and their endless mode.
  // Chamán: every two seconds heals the wounded around it (never itself). Kill it first.
  shaman: {
    ...plainEnemy,
    maxHp: 260,
    speed: 50,
    bounty: 10,
    livesCost: 1,
    damage: 5,
    attackIntervalTicks: 60,
    xp: 8,
    healAura: { radius: 90, amount: 25, intervalTicks: 120 },
  },
  // Esqueleto: the first time it is killed it gets back up where it fell, with
  // half its health. It pays only when it falls for good.
  skeleton: {
    ...plainEnemy,
    maxHp: 190,
    speed: 65,
    bounty: 7,
    livesCost: 1,
    damage: 7,
    attackIntervalTicks: 55,
    xp: 6,
    revive: { hpFraction: 0.5, delayTicks: 120 },
  },
  // Zombi gigante: slow and tough, and when killed it falls apart into three small zombies.
  big_zombie: {
    ...plainEnemy,
    maxHp: 900,
    speed: 35,
    bounty: 14,
    livesCost: 2,
    damage: 18,
    attackIntervalTicks: 80,
    xp: 12,
    splitInto: { type: 'tiny_zombie', count: 3, spacing: 14 },
  },
  // Zombi pequeño: weak and quick. Only comes out of a big zombie.
  tiny_zombie: {
    ...plainEnemy,
    maxHp: 70,
    speed: 95,
    bounty: 1,
    livesCost: 1,
    damage: 3,
    attackIntervalTicks: 40,
    xp: 1,
  },
  // Ogro: very slow and very tough, and shrugs off half of magic damage, the
  // mirror of the armored one. Physical damage is the answer.
  ogre: {
    ...plainEnemy,
    maxHp: 1500,
    speed: 28,
    bounty: 25,
    livesCost: 3,
    damage: 32,
    attackIntervalTicks: 90,
    xp: 20,
    magicResist: 0.5,
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

/** A branch: the two levels a tower may specialize into after its last base level. */
function branch(
  id: string,
  name: string,
  blurb: string,
  shared: Partial<TowerLevel>,
  [fourth, fifth]: [Partial<TowerLevel>, Partial<TowerLevel>],
): TowerBranch {
  const [lv4, lv5] = levels(shared, [fourth, fifth]);
  return { id, name, blurb, levels: [lv4, lv5] };
}

// The first level's cost is the price to build; the others, the price to upgrade.
// Branch levels cost far more: fully specializing every slot is more than a
// whole campaign earns, so the player has to choose where to put the gold.
const towerTypes: Record<string, TowerType> = {
  // Fast, single target, reaches the air.
  archery: {
    levels: levels({ attackIntervalTicks: 24 }, [
      { cost: 70, damage: 9, range: 150 },
      { cost: 60, damage: 15, range: 165 },
      { cost: 90, damage: 24, range: 180 },
    ]),
    branches: [
      branch('ballesta', 'Ballesta', 'Un blanco, perfora armadura', { attackIntervalTicks: 30 }, [
        { cost: 280, damage: 60, range: 210, armorPierce: 0.5 },
        { cost: 450, damage: 95, range: 230, armorPierce: 0.75 },
      ]),
      branch('lluvia', 'Lluvia de flechas', 'Cada disparo da a 3 enemigos', { targets: 3 }, [
        { cost: 260, damage: 22, range: 190, attackIntervalTicks: 24 },
        { cost: 420, damage: 32, range: 200, attackIntervalTicks: 22 },
      ]),
    ],
  },
  // Slow, area damage, ground only.
  cannon: {
    levels: levels({ attackIntervalTicks: 90, hitsFlying: false }, [
      { cost: 110, damage: 26, range: 130, splashRadius: 50 },
      { cost: 90, damage: 42, range: 140, splashRadius: 55 },
      { cost: 130, damage: 65, range: 150, splashRadius: 60 },
    ]),
    branches: [
      branch('mortero', 'Mortero', 'Más alcance y área; no a voladores', { hitsFlying: false }, [
        { cost: 300, damage: 90, range: 200, splashRadius: 80, attackIntervalTicks: 100 },
        { cost: 480, damage: 130, range: 230, splashRadius: 95, attackIntervalTicks: 100 },
      ]),
      branch('bombarda', 'Bombarda', 'Dispara mucho más rápido', { hitsFlying: false }, [
        { cost: 280, damage: 60, range: 150, splashRadius: 55, attackIntervalTicks: 45 },
        { cost: 450, damage: 80, range: 160, splashRadius: 60, attackIntervalTicks: 36 },
      ]),
    ],
  },
  // No damage: slows one enemy after another.
  ice: {
    levels: levels({ damage: 0, attackIntervalTicks: 40, damageType: 'magic' }, [
      { cost: 90, range: 120, slowFactor: 0.55, slowTicks: 80 },
      { cost: 70, range: 135, slowFactor: 0.45, slowTicks: 90 },
      { cost: 100, range: 150, slowFactor: 0.35, slowTicks: 100 },
    ]),
    branches: [
      // The splash slows everything it lands on, so the slow covers an area.
      branch('ventisca', 'Ventisca', 'Frena a todos en una zona', { damage: 0, damageType: 'magic' }, [
        { cost: 250, range: 165, splashRadius: 60, slowFactor: 0.35, slowTicks: 110, attackIntervalTicks: 45 },
        { cost: 400, range: 180, splashRadius: 80, slowFactor: 0.3, slowTicks: 120, attackIntervalTicks: 45 },
      ]),
      branch('escarcha', 'Escarcha', 'Congela a uno: no anda ni ataca', { damage: 0, damageType: 'magic' }, [
        { cost: 270, range: 160, slowFactor: 0.35, slowTicks: 100, stunTicks: 50, attackIntervalTicks: 110 },
        { cost: 430, range: 175, slowFactor: 0.3, slowTicks: 110, stunTicks: 65, attackIntervalTicks: 95 },
      ]),
    ],
  },
  // Heavy magic hits that ignore armor.
  arcane: {
    levels: levels({ attackIntervalTicks: 70, damageType: 'magic' }, [
      { cost: 140, damage: 55, range: 140 },
      { cost: 110, damage: 90, range: 150 },
      { cost: 160, damage: 140, range: 160 },
    ]),
    branches: [
      branch('rayo', 'Rayo', 'Salta entre 3 enemigos', { damageType: 'magic', chainJumps: 2 }, [
        { cost: 320, damage: 130, range: 165, chainRange: 90, attackIntervalTicks: 70 },
        { cost: 500, damage: 170, range: 175, chainRange: 110, attackIntervalTicks: 65 },
      ]),
      branch('desintegrar', 'Desintegrar', 'Daño enorme, disparo lento', { damageType: 'magic' }, [
        { cost: 330, damage: 420, range: 185, attackIntervalTicks: 130 },
        { cost: 550, damage: 750, range: 200, attackIntervalTicks: 140 },
      ]),
    ],
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
