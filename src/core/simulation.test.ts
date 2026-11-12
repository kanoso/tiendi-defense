import { describe, expect, it } from 'vitest';
import { createPath } from './path';
import {
  createGame,
  heroMaxHp,
  step,
  type Command,
  type GameState,
  type Level,
} from './simulation';
import type { Wave } from './waves';

const START_WAVE: Command = { type: 'startWave' };

function one(enemy: string, delayTicks = 0): Wave {
  return [{ enemy, count: 1, intervalTicks: 0, delayTicks }];
}

const enemyBase = {
  maxHp: 30,
  speed: 60,
  bounty: 0,
  livesCost: 1,
  damage: 1,
  attackIntervalTicks: 30,
  xp: 0,
  armor: 0,
  flying: false,
};

const abilityBase = {
  cooldownTicks: 100,
  targeted: true,
  castRange: 200,
  radius: 40,
  damage: 0,
  stunTicks: 0,
  zone: null,
  damageType: 'physical' as const,
  hitsFlying: true,
  unlockLevel: 1,
};

/** A zone that lasts 120 ticks, pulses every 30 and does nothing by itself. */
const zoneBase = {
  durationTicks: 120,
  intervalTicks: 30,
  slowFactor: 1,
  healAmount: 0,
  damage: 0,
};

const heroBase = {
  moveSpeed: 120,
  range: 100,
  damage: 10,
  attackIntervalTicks: 30,
  maxHp: 100,
  blockCount: 0,
  splashRadius: 0,
  slowFactor: 1,
  slowTicks: 0,
  healAmount: 0,
  healIntervalTicks: 0,
  healRange: 0,
  abilities: [],
  damageType: 'physical' as const,
  hitsFlying: true,
};

const towerBase = {
  cost: 50,
  damage: 10,
  range: 100,
  attackIntervalTicks: 30,
  splashRadius: 0,
  slowFactor: 1,
  slowTicks: 0,
  damageType: 'physical' as const,
  hitsFlying: true,
};

/** A straight 600 px road along y = 0. At 60 px/s an enemy crosses it in 10 s. */
function makeLevel(overrides: Partial<Level> = {}): Level {
  return {
    width: 600,
    height: 200,
    paths: [
      createPath([
        { x: 0, y: 0 },
        { x: 600, y: 0 },
      ]),
    ],
    waves: [one('grunt')],
    startingGold: 100,
    startingLives: 20,
    speedJitter: 0,
    waveHpGrowth: 0,
    endless: null,
    scorePerWave: 100,
    enemyTypes: {
      grunt: { ...enemyBase, maxHp: 30, bounty: 5, damage: 5, xp: 10 },
      brute: { ...enemyBase, maxHp: 1000, bounty: 50, livesCost: 5 },
      plated: { ...enemyBase, maxHp: 1000, armor: 0.5 },
      bat: { ...enemyBase, maxHp: 1000, flying: true },
      sprinter: { ...enemyBase, maxHp: 1000, speed: 120, bounty: 50 },
      ogre: { ...enemyBase, maxHp: 1000, damage: 100 },
      biter: { ...enemyBase, maxHp: 1000, damage: 8 },
    },
    heroTypes: {
      archer: { ...heroBase, range: 100 },
      slowpoke: { ...heroBase, range: 100, moveSpeed: 1 },
      knight: { ...heroBase, range: 30, blockCount: 1 },
      mage: { ...heroBase, splashRadius: 40 },
      frost: { ...heroBase, damage: 0, slowFactor: 0.5, slowTicks: 60 },
      medic: { ...heroBase, range: 1, healAmount: 10, healIntervalTicks: 30, healRange: 80 },
      wizard: { ...heroBase, damageType: 'magic' },
      grounded: { ...heroBase, hitsFlying: false },
      sorcerer: {
        ...heroBase,
        damage: 0,
        abilities: [{ ...abilityBase, damage: 50, damageType: 'magic' }],
      },
      quaker: {
        ...heroBase,
        damage: 0,
        abilities: [
          { ...abilityBase, targeted: false, radius: 60, stunTicks: 60, hitsFlying: false },
        ],
      },
      // Ability casters deal no basic damage, so only the ability shows up.
      bomber: { ...heroBase, damage: 0, abilities: [{ ...abilityBase, damage: 50 }] },
      shaker: {
        ...heroBase,
        damage: 0,
        abilities: [{ ...abilityBase, targeted: false, radius: 60, stunTicks: 60 }],
      },
      stomper: {
        ...heroBase,
        range: 30,
        blockCount: 1,
        abilities: [{ ...abilityBase, targeted: false, radius: 60, stunTicks: 60 }],
      },
      warden: {
        ...heroBase,
        damage: 0,
        range: 1,
        abilities: [
          {
            ...abilityBase,
            radius: 50,
            zone: { ...zoneBase, slowFactor: 0.5, healAmount: 10 },
          },
        ],
      },
      // Leaves a zone that only hurts: 10 physical damage per pulse, four pulses.
      stormer: {
        ...heroBase,
        damage: 0,
        range: 1,
        abilities: [{ ...abilityBase, radius: 50, zone: { ...zoneBase, damage: 10 } }],
      },
      // Two abilities; the second one unlocks a level later.
      duo: {
        ...heroBase,
        damage: 0,
        abilities: [
          { ...abilityBase, damage: 50 },
          { ...abilityBase, damage: 20, unlockLevel: 2 },
        ],
      },
    },
    xpRange: 150,
    xpThresholds: [0, 10, 30],
    levelBonus: 0.5,
    heroRespawnTicks: 120,
    heroes: [],
    towerTypes: {
      turret: {
        levels: [
          { ...towerBase, cost: 50 },
          { ...towerBase, cost: 40, damage: 20 },
        ],
      },
      bomb: { levels: [{ ...towerBase, cost: 80, splashRadius: 40 }] },
      mortar: { levels: [{ ...towerBase, splashRadius: 40, hitsFlying: false }] },
      spire: { levels: [{ ...towerBase, damageType: 'magic' }] },
      frostTower: { levels: [{ ...towerBase, damage: 0, slowFactor: 0.5, slowTicks: 60 }] },
    },
    // Both slots sit 40 px off the road.
    buildSlots: [
      { x: 300, y: 40 },
      { x: 500, y: 40 },
    ],
    sellRefund: 0.6,
    ...overrides,
  };
}

/** Steps the game, issuing the commands scheduled for each tick. */
function run(
  game: GameState,
  level: Level,
  ticks: number,
  commandsAt: Record<number, Command[]> = {},
): GameState {
  for (let i = 0; i < ticks; i++) step(game, level, commandsAt[game.tick] ?? []);
  return game;
}

function started(level: Level, ticks: number, seed = 1): GameState {
  return run(createGame(level, seed), level, ticks, { 0: [START_WAVE] });
}

describe('game setup', () => {
  it('starts in the preparing phase with the level resources', () => {
    const level = makeLevel({ heroes: [{ type: 'archer', x: 50, y: 60 }] });
    const game = createGame(level, 1);
    expect(game.phase).toBe('preparing');
    expect(game.gold).toBe(100);
    expect(game.lives).toBe(20);
    expect(game.heroes).toMatchObject([{ id: 1, type: 'archer', x: 50, y: 60 }]);
  });

  it('spawns nothing until the wave is started', () => {
    const level = makeLevel();
    const game = run(createGame(level, 1), level, 100);
    expect(game.enemies).toHaveLength(0);
    expect(game.phase).toBe('preparing');
  });
});

describe('waves', () => {
  it('spawns the wave after the start command', () => {
    const game = started(makeLevel(), 1);
    expect(game.phase).toBe('wave');
    expect(game.enemies).toMatchObject([{ id: 1, type: 'grunt', hp: 30 }]);
  });

  it('moves enemies along the path at their speed', () => {
    const game = started(makeLevel(), 60);
    expect(game.enemies[0].distance).toBeCloseTo(60);
  });

  it('ignores a start command while a wave is running', () => {
    const level = makeLevel({
      waves: [[{ enemy: 'grunt', count: 2, intervalTicks: 60, delayTicks: 0 }]],
    });
    const game = run(createGame(level, 1), level, 100, { 0: [START_WAVE], 10: [START_WAVE] });
    expect(game.enemies).toHaveLength(2);
  });

  it('returns to preparing for the next wave once the wave is cleared', () => {
    const level = makeLevel({ waves: [one('grunt'), one('grunt')] });
    const game = started(level, 620);
    expect(game.phase).toBe('preparing');
    expect(game.waveIndex).toBe(1);
  });

  it('makes the enemies of later waves tougher by the level growth', () => {
    // Half as much health again per wave: 30 on the first, 45 on the second.
    const level = makeLevel({ waves: [one('grunt'), one('grunt')], waveHpGrowth: 0.5 });
    const game = createGame(level, 1);
    run(game, level, 1, { 0: [START_WAVE] });
    expect(game.enemies[0]).toMatchObject({ hp: 30, maxHp: 30 });
    run(game, level, 620);
    run(game, level, 1, { [game.tick]: [START_WAVE] });
    expect(game.enemies[0]).toMatchObject({ hp: 45, maxHp: 45 });
  });

  it('is won when the last wave is cleared', () => {
    const game = started(makeLevel(), 620);
    expect(game.phase).toBe('won');
  });
});

describe('lives', () => {
  it('loses the lives an escaping enemy costs', () => {
    const level = makeLevel({ waves: [one('brute'), one('grunt')] });
    const game = started(level, 620);
    expect(game.lives).toBe(15);
  });

  it('is lost when lives reach zero', () => {
    const level = makeLevel({
      startingLives: 2,
      waves: [[{ enemy: 'grunt', count: 3, intervalTicks: 30, delayTicks: 0 }]],
    });
    const game = started(level, 700);
    expect(game.phase).toBe('lost');
    expect(game.lives).toBe(0);
  });

  it('stops changing once the game is over', () => {
    const level = makeLevel({ startingLives: 1 });
    const game = started(level, 620);
    const frozen = structuredClone(game);
    run(game, level, 100, { [game.tick]: [START_WAVE] });
    expect(game).toEqual(frozen);
  });
});

describe('hero combat', () => {
  it('kills an enemy in range and collects its bounty', () => {
    const level = makeLevel({
      waves: [one('grunt'), one('grunt')],
      heroes: [{ type: 'archer', x: 300, y: 0 }],
    });
    const game = started(level, 360);
    expect(game.enemies).toHaveLength(0);
    expect(game.gold).toBe(105);
    expect(game.lives).toBe(20);
  });

  it('does not reach enemies outside its range', () => {
    const level = makeLevel({ heroes: [{ type: 'archer', x: 300, y: 150 }] });
    const game = started(level, 620);
    expect(game.gold).toBe(100);
    expect(game.lives).toBe(19);
  });

  it('targets the enemy that is furthest along the path', () => {
    // The sprinter spawns second but overtakes the brute before the hero's range.
    const level = makeLevel({
      waves: [[...one('brute'), ...one('sprinter', 60)]],
      heroes: [{ type: 'archer', x: 300, y: 0 }],
    });
    const game = started(level, 255);
    const brute = game.enemies.find((enemy) => enemy.type === 'brute')!;
    const sprinter = game.enemies.find((enemy) => enemy.type === 'sprinter')!;
    expect(sprinter.hp).toBeLessThan(1000);
    expect(brute.hp).toBe(1000);
  });

  it('does not attack while moving', () => {
    const level = makeLevel({
      waves: [one('brute')],
      heroes: [{ type: 'slowpoke', x: 300, y: 0 }],
    });
    const game = run(createGame(level, 1), level, 420, {
      0: [START_WAVE, { type: 'moveHero', heroId: 1, x: 310, y: 0 }],
    });
    expect(game.enemies[0].hp).toBe(1000);
  });

  it('records the last shot so it can be drawn', () => {
    const level = makeLevel({ waves: [one('brute')], heroes: [{ type: 'archer', x: 300, y: 0 }] });
    const game = started(level, 210);
    expect(game.heroes[0].lastShot).not.toBeNull();
  });
});

describe('hero movement', () => {
  const level = makeLevel({ heroes: [{ type: 'archer', x: 100, y: 100 }] });
  const move = (x: number, y: number): Command => ({ type: 'moveHero', heroId: 1, x, y });

  it('walks towards the target at its speed', () => {
    const game = run(createGame(level, 1), level, 30, { 0: [move(220, 100)] });
    expect(game.heroes[0].x).toBeCloseTo(160);
    expect(game.heroes[0].y).toBeCloseTo(100);
  });

  it('stops exactly on the target', () => {
    const game = run(createGame(level, 1), level, 200, { 0: [move(220, 100)] });
    expect(game.heroes[0]).toMatchObject({ x: 220, y: 100 });
  });

  it('can be repositioned between waves', () => {
    const game = run(createGame(level, 1), level, 200, { 0: [move(220, 100)] });
    expect(game.phase).toBe('preparing');
    expect(game.heroes[0].x).toBe(220);
  });

  it('clamps the target to the map', () => {
    const game = run(createGame(level, 1), level, 1, { 0: [move(9999, -50)] });
    expect(game.heroes[0]).toMatchObject({ targetX: 600, targetY: 0 });
  });

  it('ignores commands for a hero that does not exist', () => {
    const game = createGame(level, 1);
    const before = structuredClone(game.heroes);
    step(game, level, [{ type: 'moveHero', heroId: 99, x: 10, y: 10 }]);
    expect(game.heroes).toEqual(before);
  });
});

describe('blocking', () => {
  // The knight reaches 30 px, so on the road it stops enemies at distance 270.
  const knightOnRoad = { type: 'knight', x: 300, y: 0 };

  it('stops an enemy that comes within reach', () => {
    const level = makeLevel({ waves: [one('brute')], heroes: [knightOnRoad] });
    const game = started(level, 620);
    expect(game.enemies[0].distance).toBeCloseTo(270, 0);
    expect(game.lives).toBe(20);
  });

  it('holds only as many enemies as the hero can block', () => {
    const level = makeLevel({
      waves: [[{ enemy: 'brute', count: 2, intervalTicks: 60, delayTicks: 0 }]],
      heroes: [knightOnRoad],
    });
    const game = started(level, 700);
    expect(game.enemies).toHaveLength(1);
    expect(game.lives).toBe(15);
  });

  it('lets go of a lesser enemy to hold a more dangerous one', () => {
    // The knight holds one enemy. The biter costs 1 life, the brute behind it 5.
    const level = makeLevel({
      waves: [[...one('biter'), ...one('brute', 60)]],
      heroes: [knightOnRoad],
    });
    const game = started(level, 400);
    const biter = game.enemies.find((enemy) => enemy.type === 'biter')!;
    const brute = game.enemies.find((enemy) => enemy.type === 'brute')!;
    expect(brute.blockedBy).toBe(1);
    expect(biter.blockedBy).toBeNull();
    expect(biter.distance).toBeGreaterThan(300);
  });

  it('keeps the enemy it holds when an equally dangerous one arrives', () => {
    const level = makeLevel({
      waves: [[{ enemy: 'biter', count: 2, intervalTicks: 60, delayTicks: 0 }]],
      heroes: [knightOnRoad],
    });
    const game = started(level, 400);
    expect(game.enemies[0].blockedBy).toBe(1);
    expect(game.enemies[1].blockedBy).toBeNull();
  });

  it('lets a ranged hero stand on the road without blocking', () => {
    const level = makeLevel({
      waves: [one('brute'), one('brute')],
      heroes: [{ type: 'archer', x: 300, y: 0 }],
    });
    const game = started(level, 620);
    expect(game.lives).toBe(15);
  });

  it('makes the blocked enemy hurt its blocker', () => {
    const level = makeLevel({ waves: [one('brute')], heroes: [knightOnRoad] });
    const game = started(level, 400);
    expect(game.heroes[0].hp).toBeLessThan(100);
  });

  it('releases the enemy when the hero walks away', () => {
    const level = makeLevel({ waves: [one('brute')], heroes: [knightOnRoad] });
    const game = run(createGame(level, 1), level, 460, {
      0: [START_WAVE],
      400: [{ type: 'moveHero', heroId: 1, x: 300, y: 150 }],
    });
    expect(game.enemies[0].blockedBy).toBeNull();
    expect(game.enemies[0].distance).toBeGreaterThan(300);
  });

  it('heals heroes when the wave is cleared', () => {
    const level = makeLevel({ waves: [one('grunt'), one('grunt')], heroes: [knightOnRoad] });
    const game = createGame(level, 1);
    let lowestHp = 100;
    for (let i = 0; i < 500; i++) {
      step(game, level, i === 0 ? [START_WAVE] : []);
      lowestHp = Math.min(lowestHp, game.heroes[0].hp);
    }
    expect(lowestHp).toBeLessThan(100);
    expect(game.phase).toBe('preparing');
    expect(game.heroes[0].hp).toBe(heroMaxHp(level, game.heroes[0]));
  });
});

describe('hero death', () => {
  // The knight walks from its spawn to the road and is killed by the ogre's
  // first hit, around tick 300.
  const level = makeLevel({ waves: [one('ogre')], heroes: [{ type: 'knight', x: 100, y: 50 }] });
  const toTheRoad: Command = { type: 'moveHero', heroId: 1, x: 300, y: 0 };
  const play = (ticks: number, extra: Record<number, Command[]> = {}) =>
    run(createGame(level, 1), level, ticks, { 0: [START_WAVE, toTheRoad], ...extra });

  it('takes the hero out of the fight and frees the enemy', () => {
    const game = play(400);
    expect(game.heroes[0].respawnTicks).toBeGreaterThan(0);
    expect(game.heroes[0].hp).toBe(0);
    expect(game.enemies[0].blockedBy).toBeNull();
    expect(game.enemies[0].distance).toBeGreaterThan(300);
  });

  it('brings the hero back at its spawn point with full health', () => {
    const game = play(500);
    expect(game.heroes[0]).toMatchObject({ x: 100, y: 50, hp: 100, respawnTicks: 0 });
  });

  it('ignores move commands while the hero is dead', () => {
    const game = play(500, { 350: [{ type: 'moveHero', heroId: 1, x: 500, y: 100 }] });
    expect(game.heroes[0]).toMatchObject({ x: 100, y: 50 });
  });
});

describe('area damage', () => {
  // Two brutes 20 px apart. At tick 215 only the leader is inside the hero's range.
  const closePair: Wave = [{ enemy: 'brute', count: 2, intervalTicks: 20, delayTicks: 0 }];

  it('also hurts enemies near the target', () => {
    const level = makeLevel({ waves: [closePair], heroes: [{ type: 'mage', x: 300, y: 0 }] });
    const game = started(level, 215);
    expect(game.enemies[0].hp).toBeLessThan(1000);
    expect(game.enemies[1].hp).toBeLessThan(1000);
  });

  it('spares enemies beyond the splash radius', () => {
    const farPair: Wave = [{ enemy: 'brute', count: 2, intervalTicks: 100, delayTicks: 0 }];
    const level = makeLevel({ waves: [farPair], heroes: [{ type: 'mage', x: 300, y: 0 }] });
    const game = started(level, 215);
    expect(game.enemies[0].hp).toBeLessThan(1000);
    expect(game.enemies[1].hp).toBe(1000);
  });

  it('is not dealt by heroes without splash', () => {
    const level = makeLevel({ waves: [closePair], heroes: [{ type: 'archer', x: 300, y: 0 }] });
    const game = started(level, 215);
    expect(game.enemies[1].hp).toBe(1000);
  });
});

describe('slowing', () => {
  const frostOnRoad = { type: 'frost', x: 300, y: 0 };

  it('makes the enemy advance at the slowed pace', () => {
    // In range from distance 200. A hundred ticks at half speed add 50 px.
    const level = makeLevel({ waves: [one('brute')], heroes: [frostOnRoad] });
    const game = started(level, 300);
    expect(game.enemies[0].distance).toBeCloseTo(250, 0);
  });

  it('wears off once the enemy is out of range', () => {
    const level = makeLevel({ waves: [one('brute')], heroes: [frostOnRoad] });
    const game = started(level, 700);
    expect(game.enemies[0].slowTicks).toBe(0);
    const before = game.enemies[0].distance;
    run(game, level, 60);
    expect(game.enemies[0].distance - before).toBeCloseTo(60);
  });

  it('prefers an enemy that is not slowed yet', () => {
    // The second brute enters the range right when the hero can attack again.
    const pair: Wave = [{ enemy: 'brute', count: 2, intervalTicks: 30, delayTicks: 0 }];
    const level = makeLevel({ waves: [pair], heroes: [frostOnRoad] });
    const game = started(level, 235);
    expect(game.enemies[0].slowTicks).toBeGreaterThan(0);
    expect(game.enemies[1].slowTicks).toBeGreaterThan(0);
  });
});

describe('healing', () => {
  // The biter is held by the knight and takes 80 of its 100 health by tick 570.
  const knight = { type: 'knight', x: 300, y: 0 };

  it('restores a wounded ally in range without exceeding its maximum', () => {
    const level = makeLevel({
      waves: [one('biter')],
      heroes: [knight, { type: 'medic', x: 300, y: 50 }],
    });
    const game = started(level, 570);
    expect(game.heroes[0].hp).toBeGreaterThan(80);
    expect(game.heroes[0].hp).toBeLessThanOrEqual(100);
  });

  it('does not reach allies out of range', () => {
    const level = makeLevel({
      waves: [one('biter')],
      heroes: [knight, { type: 'medic', x: 300, y: 150 }],
    });
    const game = started(level, 570);
    expect(game.heroes[0].hp).toBeLessThan(50);
  });

  it('does not revive a fallen hero', () => {
    const level = makeLevel({
      waves: [one('ogre')],
      heroes: [knight, { type: 'medic', x: 300, y: 50 }],
    });
    const game = started(level, 350);
    expect(game.heroes[0].hp).toBe(0);
    expect(game.heroes[0].respawnTicks).toBeGreaterThan(0);
  });

  it('records the heal so it can be drawn', () => {
    const level = makeLevel({
      waves: [one('biter')],
      heroes: [knight, { type: 'medic', x: 300, y: 50 }],
    });
    const game = started(level, 570);
    expect(game.heroes[1].lastHeal).not.toBeNull();
  });
});

describe('experience and levels', () => {
  const archerOnRoad = { type: 'archer', x: 300, y: 0 };

  it('rewards heroes near a kill', () => {
    const level = makeLevel({ waves: [one('grunt'), one('grunt')], heroes: [archerOnRoad] });
    const game = started(level, 360);
    expect(game.heroes[0]).toMatchObject({ xp: 10, level: 2 });
  });

  it('gives nothing to heroes far from the kill', () => {
    const level = makeLevel({
      waves: [one('grunt'), one('grunt')],
      heroes: [archerOnRoad, { type: 'archer', x: 590, y: 190 }],
    });
    const game = started(level, 360);
    expect(game.heroes[1]).toMatchObject({ xp: 0, level: 1 });
  });

  it('stops at the highest level', () => {
    const level = makeLevel({
      waves: [[{ enemy: 'grunt', count: 5, intervalTicks: 60, delayTicks: 0 }], one('grunt')],
      heroes: [archerOnRoad],
    });
    const game = started(level, 700);
    expect(game.heroes[0]).toMatchObject({ xp: 50, level: 3 });
  });

  it('raises maximum health and grants the difference on level up', () => {
    const level = makeLevel({ waves: [one('grunt'), one('grunt')], heroes: [archerOnRoad] });
    const game = started(level, 360);
    expect(heroMaxHp(level, game.heroes[0])).toBe(150);
    expect(game.heroes[0].hp).toBe(150);
  });

  it('raises damage', () => {
    // After the grunt the archer is level 2 and hits the brute for 15 instead of 10.
    const level = makeLevel({
      waves: [[...one('grunt'), ...one('brute', 200)]],
      heroes: [archerOnRoad],
    });
    const game = started(level, 500);
    const dealt = 1000 - game.enemies[0].hp;
    expect(dealt).toBeGreaterThan(0);
    expect(dealt % 15).toBe(0);
  });
});

describe('abilities', () => {
  const cast = (x = 0, y = 0): Command => ({ type: 'useAbility', heroId: 1, ability: 0, x, y });

  /** One brute walks the road (1 px per tick) past a hero standing on it at x = 300. */
  function duel(
    hero: string,
    ticks: number,
    commandsAt: Record<number, Command[]>,
    overrides: Partial<Level> = {},
  ): GameState {
    const level = makeLevel({
      waves: [one('brute')],
      heroes: [{ type: hero, x: 300, y: 0 }],
      ...overrides,
    });
    const first = commandsAt[0] ?? [];
    return run(createGame(level, 1), level, ticks, { ...commandsAt, 0: [START_WAVE, ...first] });
  }

  describe('casting', () => {
    it('damages the enemies inside its radius', () => {
      const game = duel('bomber', 251, { 250: [cast(250, 0)] });
      expect(game.enemies[0].hp).toBe(950);
    });

    it('spares the enemies outside its radius', () => {
      const game = duel('bomber', 251, { 250: [cast(150, 0)] });
      expect(game.enemies[0].hp).toBe(1000);
    });

    it('cannot be repeated while on cooldown', () => {
      const game = duel('bomber', 261, { 250: [cast(250, 0)], 260: [cast(260, 0)] });
      expect(game.enemies[0].hp).toBe(950);
      expect(game.heroes[0].abilityCooldowns[0]).toBeGreaterThan(0);
    });

    it('is ready again after the cooldown', () => {
      const game = duel('bomber', 361, { 250: [cast(250, 0)], 360: [cast(360, 0)] });
      expect(game.enemies[0].hp).toBe(900);
    });

    it('pulls a target that is too far back to the cast range', () => {
      // Asked for x = 590, lands at x = 500: 20 px from the brute.
      const game = duel('bomber', 481, { 480: [cast(590, 0)] });
      expect(game.enemies[0].hp).toBe(950);
      expect(game.heroes[0].lastCast?.x).toBeCloseTo(500);
    });

    it('scales its damage with the hero level', () => {
      // A second level that needs no experience makes the hero start at level 2.
      const veteran = duel('bomber', 251, { 250: [cast(250, 0)] }, { xpThresholds: [0, 0] });
      expect(veteran.heroes[0].level).toBe(2);
      expect(veteran.enemies[0].hp).toBe(1000 - 75);
    });

    it('is locked below its unlock level', () => {
      const second: Command = { type: 'useAbility', heroId: 1, ability: 1, x: 250, y: 0 };
      const game = duel('duo', 251, { 250: [second] });
      expect(game.enemies[0].hp).toBe(1000);
      expect(game.heroes[0].abilityCooldowns[1]).toBe(0);
    });

    it('keeps a separate cooldown for each ability of a hero', () => {
      // Starting at level 2 unlocks both; at that level they deal 75 and 30.
      const second: Command = { type: 'useAbility', heroId: 1, ability: 1, x: 250, y: 0 };
      const game = duel('duo', 251, { 250: [cast(250, 0), second] }, { xpThresholds: [0, 0] });
      expect(game.enemies[0].hp).toBe(1000 - 75 - 30);
      expect(game.heroes[0].lastCast).toMatchObject({ ability: 1 });
    });

    it('ignores an ability the hero does not have', () => {
      const missing = (ability: number): Command => ({
        type: 'useAbility',
        heroId: 1,
        ability,
        x: 250,
        y: 0,
      });
      const game = duel('bomber', 251, { 250: [missing(1), missing(-1), missing(0.5)] });
      expect(game.enemies[0].hp).toBe(1000);
    });

    it('is refused outside a wave', () => {
      const level = makeLevel({ heroes: [{ type: 'bomber', x: 300, y: 0 }] });
      const game = run(createGame(level, 1), level, 5, { 0: [cast(300, 0)] });
      expect(game.heroes[0].abilityCooldowns[0]).toBe(0);
    });

    it('is refused for heroes without an ability', () => {
      const game = duel('archer', 5, { 1: [cast(300, 0)] });
      expect(game.heroes[0].lastCast).toBeNull();
    });
  });

  describe('stun', () => {
    it('holds enemies in place for its duration', () => {
      const stunned = duel('shaker', 340, { 280: [cast()] });
      expect(stunned.enemies[0].distance).toBeCloseTo(280, 0);
      const released = duel('shaker', 400, { 280: [cast()] });
      expect(released.enemies[0].distance).toBeCloseTo(340, 0);
    });

    it('keeps a stunned enemy from attacking its blocker', () => {
      const overrides = { waves: [one('biter')] };
      const hurt = duel('stomper', 335, {}, overrides);
      const safe = duel('stomper', 335, { 275: [cast()] }, overrides);
      expect(hurt.heroes[0].hp).toBeLessThan(100);
      expect(safe.heroes[0].hp).toBe(100);
    });
  });

  describe('zone', () => {
    it('slows the enemies inside while it lasts', () => {
      // Cast over the brute at tick 250: 120 ticks at half speed add 60 px.
      const game = duel('warden', 370, { 250: [cast(300, 0)] });
      expect(game.enemies[0].distance).toBeGreaterThan(305);
      expect(game.enemies[0].distance).toBeLessThan(315);
    });

    it('expires', () => {
      const game = duel('warden', 400, { 250: [cast(300, 0)] });
      expect(game.zones).toHaveLength(0);
    });

    it('heals the allies inside', () => {
      const overrides = {
        waves: [one('biter')],
        heroes: [
          { type: 'warden', x: 300, y: 60 },
          { type: 'knight', x: 300, y: 0 },
        ],
      };
      const alone = duel('warden', 520, {}, overrides);
      const healed = duel('warden', 520, { 400: [cast(300, 0)] }, overrides);
      expect(healed.heroes[1].hp).toBeGreaterThan(alone.heroes[1].hp);
    });

    it('hurts the enemies inside on every pulse', () => {
      const game = duel('stormer', 400, { 250: [cast(300, 0)] });
      expect(game.enemies[0].hp).toBe(960);
    });

    it('lets armor absorb its physical damage', () => {
      const game = duel('stormer', 400, { 250: [cast(300, 0)] }, { waves: [one('plated')] });
      expect(game.enemies[0].hp).toBe(980);
    });

    it('does not slow when it has no slow of its own', () => {
      const game = duel('stormer', 370, { 250: [cast(300, 0)] });
      expect(game.enemies[0].distance).toBeCloseTo(370, 0);
    });
  });
});

describe('score', () => {
  it('starts at zero', () => {
    expect(createGame(makeLevel(), 1).score).toBe(0);
  });

  it('grows by the bounty of each enemy killed', () => {
    const level = makeLevel({
      waves: [[...one('grunt'), ...one('grunt', 400)]],
      heroes: [{ type: 'archer', x: 300, y: 0 }],
    });
    const game = started(level, 360);
    expect(game.score).toBe(5);
  });

  it('grows by the wave bonus when a wave is cleared', () => {
    // The grunt escapes, so the only points are for surviving the wave.
    const level = makeLevel({ waves: [one('grunt'), one('grunt')] });
    const game = started(level, 620);
    expect(game.score).toBe(100);
  });
});

describe('endless mode', () => {
  // No scripted waves: every wave is one more grunt than the last, forever.
  const endless = {
    waves: [],
    endless: {
      groups: [
        {
          enemy: 'grunt',
          fromWave: 0,
          everyWaves: 1,
          baseCount: 1,
          countPerWave: 1,
          intervalTicks: 30,
          minIntervalTicks: 30,
          intervalDropPerWave: 0,
          delayTicks: 0,
        },
      ],
    },
  };

  /** Starts every wave as soon as it can, for the given number of ticks. */
  function playOn(level: Level, ticks: number): GameState {
    const game = createGame(level, 1);
    for (let i = 0; i < ticks; i++) {
      step(game, level, game.phase === 'preparing' ? [START_WAVE] : []);
    }
    return game;
  }

  it('builds its waves from the rules instead of a script', () => {
    const game = started(makeLevel(endless), 1);
    expect(game.phase).toBe('wave');
    expect(game.enemies).toMatchObject([{ type: 'grunt' }]);
  });

  it('never ends in victory: clearing a wave only brings the next one', () => {
    const level = makeLevel({ ...endless, startingLives: 1000 });
    const game = playOn(level, 4000);
    expect(game.phase).not.toBe('won');
    expect(game.waveIndex).toBeGreaterThan(3);
  });

  it('sends more enemies on later waves', () => {
    const level = makeLevel({ ...endless, startingLives: 1000 });
    const game = createGame(level, 1);
    run(game, level, 1, { 0: [START_WAVE] });
    const first = game.spawnQueue.length + game.enemies.length;
    run(game, level, 700);
    run(game, level, 1, { [game.tick]: [START_WAVE] });
    const second = game.spawnQueue.length + game.enemies.length;
    expect(first).toBe(1);
    expect(second).toBe(2);
  });

  it('still ends in defeat when the lives run out', () => {
    const game = playOn(makeLevel({ ...endless, startingLives: 2 }), 4000);
    expect(game.phase).toBe('lost');
  });
});

describe('several paths', () => {
  // The usual 600 px road along y = 0, plus a shorter one, 300 px along y = 150.
  const twoRoads = {
    paths: [
      createPath([
        { x: 0, y: 0 },
        { x: 600, y: 0 },
      ]),
      createPath([
        { x: 0, y: 150 },
        { x: 300, y: 150 },
      ]),
    ],
  };
  const onSecondRoad: Wave = [{ enemy: 'brute', count: 1, intervalTicks: 0, delayTicks: 0, path: 1 }];

  it('sends an enemy down the path its group names', () => {
    const level = makeLevel({ ...twoRoads, waves: [onSecondRoad] });
    const game = started(level, 60);
    expect(game.enemies[0]).toMatchObject({ path: 1 });
    expect(game.enemies[0].distance).toBeCloseTo(60);
  });

  it('uses the first path when a group names none', () => {
    const level = makeLevel({ ...twoRoads, waves: [one('brute')] });
    const game = started(level, 60);
    expect(game.enemies[0].path).toBe(0);
  });

  it('counts an enemy as escaped at the end of its own path', () => {
    // 300 px take 5 seconds; on the long road it would still be walking.
    const level = makeLevel({ ...twoRoads, waves: [onSecondRoad, one('grunt')] });
    const game = started(level, 320);
    expect(game.enemies).toHaveLength(0);
    expect(game.lives).toBe(15);
  });

  it('lets heroes reach only the enemies on the road they stand by', () => {
    // The archer stands on the first road; the second runs 150 px away.
    const level = makeLevel({
      ...twoRoads,
      waves: [[...onSecondRoad, ...one('brute')]],
      heroes: [{ type: 'archer', x: 300, y: 0 }],
    });
    const game = started(level, 280);
    const far = game.enemies.find((enemy) => enemy.path === 1)!;
    const near = game.enemies.find((enemy) => enemy.path === 0)!;
    expect(far.hp).toBe(1000);
    expect(near.hp).toBeLessThan(1000);
  });

  it('measures progress by what is left to the exit when picking a target', () => {
    // Both have walked the same and are in range of a hero between the roads.
    // The one on the short road is closer to its exit, so it is the bigger threat.
    const level = makeLevel({
      ...twoRoads,
      waves: [[...one('brute'), ...onSecondRoad]],
      heroes: [{ type: 'archer', x: 250, y: 75 }],
    });
    const game = started(level, 215);
    const short = game.enemies.find((enemy) => enemy.path === 1)!;
    const long = game.enemies.find((enemy) => enemy.path === 0)!;
    expect(short.hp).toBeLessThan(1000);
    expect(long.hp).toBe(1000);
  });
});

describe('armor, flight and tower slows', () => {
  /**
   * One enemy walks the road (1 px per tick). A hero may stand on it at x = 300
   * (range 100, so it first shoots at tick 200), and a tower may sit on slot 0
   * (40 px off the road, so it first shoots at tick 209).
   */
  function fight(options: {
    enemy?: string;
    wave?: Wave;
    hero?: string;
    tower?: string;
    ticks: number;
    commandsAt?: Record<number, Command[]>;
  }): GameState {
    const level = makeLevel({
      waves: [options.wave ?? one(options.enemy ?? 'brute')],
      heroes: options.hero ? [{ type: options.hero, x: 300, y: 0 }] : [],
    });
    const opening: Command[] = [START_WAVE];
    if (options.tower) opening.push({ type: 'buildTower', slot: 0, tower: options.tower });
    return run(createGame(level, 1), level, options.ticks, { ...options.commandsAt, 0: opening });
  }

  const castAt = (x: number): Command => ({ type: 'useAbility', heroId: 1, ability: 0, x, y: 0 });

  describe('armor', () => {
    it('blocks its share of a physical hit from a hero', () => {
      const game = fight({ enemy: 'plated', hero: 'archer', ticks: 201 });
      expect(game.enemies[0].hp).toBe(995);
    });

    it('does nothing against magic damage from a hero', () => {
      const game = fight({ enemy: 'plated', hero: 'wizard', ticks: 201 });
      expect(game.enemies[0].hp).toBe(990);
    });

    it('blocks its share of a physical hit from a tower', () => {
      const game = fight({ enemy: 'plated', tower: 'turret', ticks: 215 });
      expect(game.enemies[0].hp).toBe(995);
    });

    it('does nothing against a magic tower', () => {
      const game = fight({ enemy: 'plated', tower: 'spire', ticks: 215 });
      expect(game.enemies[0].hp).toBe(990);
    });

    it('applies to abilities according to their damage type', () => {
      const cast = { 250: [castAt(250)] };
      const physical = fight({ enemy: 'plated', hero: 'bomber', ticks: 251, commandsAt: cast });
      const magic = fight({ enemy: 'plated', hero: 'sorcerer', ticks: 251, commandsAt: cast });
      expect(physical.enemies[0].hp).toBe(975);
      expect(magic.enemies[0].hp).toBe(950);
    });
  });

  describe('flying enemies', () => {
    it('pass over a blocking hero', () => {
      const game = fight({ enemy: 'bat', hero: 'knight', ticks: 620 });
      expect(game.lives).toBe(19);
    });

    it('cannot be hit by ground-only heroes', () => {
      const game = fight({ enemy: 'bat', hero: 'grounded', ticks: 350 });
      expect(game.enemies[0].hp).toBe(1000);
    });

    it('can be hit by heroes that reach the air', () => {
      const game = fight({ enemy: 'bat', hero: 'archer', ticks: 350 });
      expect(game.enemies[0].hp).toBeLessThan(1000);
    });

    it('are ignored by ground-only towers, splash included', () => {
      // The bat flies 20 px behind the brute, well inside the mortar's splash.
      const wave: Wave = [...one('brute'), ...one('bat', 20)];
      const game = fight({ wave, tower: 'mortar', ticks: 215 });
      expect(game.enemies[0].hp).toBeLessThan(1000);
      expect(game.enemies[1].hp).toBe(1000);
    });

    it('are not chosen as the target of a ground-only tower', () => {
      const game = fight({ enemy: 'bat', tower: 'mortar', ticks: 300 });
      expect(game.towers[0].lastShot).toBeNull();
    });

    it('are untouched by ground-only abilities', () => {
      const game = fight({
        enemy: 'bat',
        hero: 'quaker',
        ticks: 340,
        commandsAt: { 280: [castAt(0)] },
      });
      expect(game.enemies[0].distance).toBeCloseTo(340, 0);
    });
  });

  describe('slowing towers', () => {
    it('slow what they hit', () => {
      // First shot at tick 209; the 91 ticks left go by at half speed.
      const game = fight({ tower: 'frostTower', ticks: 300 });
      expect(game.enemies[0].distance).toBeGreaterThan(250);
      expect(game.enemies[0].distance).toBeLessThan(259);
    });
  });
});

describe('towers', () => {
  const build = (slot: number, tower = 'turret'): Command => ({ type: 'buildTower', slot, tower });
  const upgrade = (slot: number): Command => ({ type: 'upgradeTower', slot });
  const sell = (slot: number): Command => ({ type: 'sellTower', slot });

  function after(commands: Command[], overrides: Partial<Level> = {}): GameState {
    const level = makeLevel(overrides);
    const game = createGame(level, 1);
    step(game, level, commands);
    return game;
  }

  describe('building', () => {
    it('spends the cost and places the tower on the slot', () => {
      const game = after([build(0)]);
      expect(game.gold).toBe(50);
      expect(game.towers).toMatchObject([{ slot: 0, type: 'turret', level: 0 }]);
    });

    it('is refused without enough gold', () => {
      const game = after([build(0)], { startingGold: 49 });
      expect(game.towers).toHaveLength(0);
      expect(game.gold).toBe(49);
    });

    it('is refused on an occupied slot', () => {
      const game = after([build(0), build(0)]);
      expect(game.towers).toHaveLength(1);
      expect(game.gold).toBe(50);
    });

    it('is refused for a slot or tower that does not exist', () => {
      const game = after([build(7), build(-1), build(0.5), build(1, 'laser')]);
      expect(game.towers).toHaveLength(0);
      expect(game.gold).toBe(100);
    });
  });

  describe('upgrading', () => {
    it('spends the next level cost and raises the level', () => {
      const game = after([build(0), upgrade(0)]);
      expect(game.gold).toBe(10);
      expect(game.towers[0].level).toBe(1);
    });

    it('is refused at the top level', () => {
      const game = after([build(0, 'bomb'), upgrade(0)]);
      expect(game.gold).toBe(20);
      expect(game.towers[0].level).toBe(0);
    });

    it('is refused without enough gold', () => {
      const game = after([build(0), upgrade(0)], { startingGold: 89 });
      expect(game.gold).toBe(39);
      expect(game.towers[0].level).toBe(0);
    });

    it('is refused on an empty slot', () => {
      const game = after([upgrade(0)]);
      expect(game.gold).toBe(100);
    });
  });

  describe('selling', () => {
    it('refunds part of everything invested and frees the slot', () => {
      // Invested 50 + 40 = 90, refunded at 60 %.
      const game = after([build(0), upgrade(0), sell(0)]);
      expect(game.towers).toHaveLength(0);
      expect(game.gold).toBe(10 + 54);
    });

    it('lets the slot be built on again', () => {
      const game = after([build(0), sell(0), build(0)]);
      expect(game.towers).toHaveLength(1);
    });

    it('is refused on an empty slot', () => {
      const game = after([sell(0)]);
      expect(game.gold).toBe(100);
    });
  });

  describe('combat', () => {
    const fight = (commands: Command[], ticks: number, overrides: Partial<Level> = {}) => {
      const level = makeLevel({ waves: [one('brute')], ...overrides });
      return run(createGame(level, 1), level, ticks, { 0: [...commands, START_WAVE] });
    };

    it('attacks enemies in range', () => {
      const game = fight([build(0)], 300);
      expect(game.enemies[0].hp).toBeLessThan(1000);
      expect(game.towers[0].lastShot).not.toBeNull();
    });

    it('leaves enemies out of range alone', () => {
      const game = fight([build(1)], 300);
      expect(game.enemies[0].hp).toBe(1000);
    });

    it('collects the bounty of what it kills', () => {
      const game = fight([build(0)], 360, { waves: [one('grunt'), one('grunt')] });
      expect(game.enemies).toHaveLength(0);
      expect(game.gold).toBe(100 - 50 + 5);
    });

    it('hits harder after an upgrade', () => {
      const basic = fight([build(0)], 300);
      const upgraded = fight([build(0), upgrade(0)], 300);
      expect(upgraded.enemies[0].hp).toBeLessThan(basic.enemies[0].hp);
    });

    it('deals area damage when the tower has splash', () => {
      const pair: Wave = [{ enemy: 'brute', count: 2, intervalTicks: 20, delayTicks: 0 }];
      const game = fight([build(0, 'bomb')], 215, { waves: [pair] });
      expect(game.enemies[0].hp).toBeLessThan(1000);
      expect(game.enemies[1].hp).toBeLessThan(1000);
    });

    it('can be built while a wave is running', () => {
      const level = makeLevel({ waves: [one('brute')] });
      const game = run(createGame(level, 1), level, 300, { 0: [START_WAVE], 100: [build(0)] });
      expect(game.enemies[0].hp).toBeLessThan(1000);
    });
  });
});

describe('determinism', () => {
  const level = makeLevel({
    speedJitter: 0.2,
    waves: [[{ enemy: 'grunt', count: 20, intervalTicks: 15, delayTicks: 0 }]],
    heroes: [{ type: 'archer', x: 300, y: 50 }],
  });
  const commands: Record<number, Command[]> = {
    0: [START_WAVE],
    90: [{ type: 'moveHero', heroId: 1, x: 420, y: 30 }],
  };
  const play = (seed: number) => run(createGame(level, seed), level, 500, commands);

  it('reaches the same state from the same seed and commands', () => {
    expect(play(99)).toEqual(play(99));
  });

  it('diverges with a different seed', () => {
    expect(play(1).enemies).not.toEqual(play(2).enemies);
  });
});
