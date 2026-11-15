import { describe, expect, it } from 'vitest';
import { MAPS } from '../data/maps';
import { dealDamage, strike, type Attack } from './combat';
import { createPath } from './path';
import { createGame, step, type Command, type Enemy, type EnemyType, type GameState, type Level } from './simulation';
import { withStateDefaults } from './stateDefaults';
import { hashState } from './stateHash';

// Enemies with a trait of their own: a shaman that heals the others, a skeleton
// that rises once, a zombie that splits in three, and an ogre that resists magic.

const enemyBase: EnemyType = {
  maxHp: 1000,
  // Standing still, unless a test lets it walk: positions stay where they were put.
  speed: 0,
  bounty: 0,
  livesCost: 1,
  damage: 10,
  attackIntervalTicks: 30,
  xp: 0,
  armor: 0,
  flying: false,
};

const HEAL = { radius: 50, amount: 20, intervalTicks: 60 };
const RISE = { hpFraction: 0.5, delayTicks: 90 };
const SPLIT = { type: 'crawler', count: 3, spacing: 12 };

const towerBase = {
  cost: 10,
  damage: 10,
  range: 1000,
  attackIntervalTicks: 30,
  splashRadius: 0,
  slowFactor: 1,
  slowTicks: 0,
  damageType: 'physical' as const,
  hitsFlying: true,
};

/** A straight 600 px road along y = 0, and one slot 40 px off its middle. */
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
    waves: [[{ enemy: 'dummy', count: 1, intervalTicks: 0, delayTicks: 0 }]],
    startingGold: 1000,
    startingLives: 20,
    speedJitter: 0,
    waveHpGrowth: 0,
    endless: null,
    scorePerWave: 0,
    enemyTypes: {
      dummy: { ...enemyBase },
      shaman: { ...enemyBase, healAura: HEAL },
      bones: { ...enemyBase, maxHp: 100, bounty: 7, xp: 5, revive: RISE },
      hulk: { ...enemyBase, maxHp: 100, bounty: 15, xp: 12, splitInto: SPLIT },
      crawler: { ...enemyBase, maxHp: 20, speed: 90, bounty: 1, xp: 1 },
      warded: { ...enemyBase, magicResist: 0.5 },
      bulwark: { ...enemyBase, armor: 0.4, magicResist: 0.25 },
    },
    heroTypes: {
      knight: {
        moveSpeed: 100,
        range: 30,
        damage: 0,
        attackIntervalTicks: 30,
        maxHp: 100,
        blockCount: 2,
        splashRadius: 0,
        slowFactor: 1,
        slowTicks: 0,
        healAmount: 0,
        healIntervalTicks: 0,
        healRange: 0,
        abilities: [],
        damageType: 'physical',
        hitsFlying: false,
      },
    },
    heroRespawnTicks: 120,
    heroes: [],
    xpRange: 1000,
    xpThresholds: [0, 1000],
    levelBonus: 0,
    towerTypes: {
      bow: { levels: [{ ...towerBase }] },
      frost: { levels: [{ ...towerBase, damage: 0, slowFactor: 0.5, slowTicks: 60, stunTicks: 60 }] },
    },
    buildSlots: [{ x: 300, y: 40 }],
    sellRefund: 0.6,
    ...overrides,
  };
}

/** A game in the middle of a wave with nothing left to spawn. */
function fighting(level: Level): GameState {
  const game = createGame(level, 1);
  game.phase = 'wave';
  return game;
}

/** Puts an enemy on the road, `distance` px from the start, as if it had walked there. */
function place(game: GameState, level: Level, distance: number, type: string, extra: Partial<Enemy> = {}): Enemy {
  const maxHp = level.enemyTypes[type].maxHp;
  const enemy: Enemy = {
    id: game.nextEnemyId++,
    type,
    path: 0,
    distance,
    hp: maxHp,
    maxHp,
    speed: level.enemyTypes[type].speed,
    blockedBy: null,
    attackCooldownTicks: 0,
    slowTicks: 0,
    slowFactor: 1,
    stunTicks: 0,
    healCooldownTicks: 0,
    revived: false,
    ...extra,
  };
  game.enemies.push(enemy);
  return enemy;
}

function run(game: GameState, level: Level, ticks: number, commands: Command[] = []): void {
  for (let i = 0; i < ticks; i++) step(game, level, i === 0 ? commands : []);
}

const byId = (game: GameState, id: number) => game.enemies.find((enemy) => enemy.id === id);

describe('a shaman', () => {
  const level = makeLevel();

  it('heals every other wounded enemy within its radius, but not itself', () => {
    const game = fighting(level);
    const shaman = place(game, level, 300, 'shaman', { hp: 500 });
    const near = place(game, level, 300 + HEAL.radius, 'dummy', { hp: 500 });
    const far = place(game, level, 300 + HEAL.radius + 1, 'dummy', { hp: 500 });
    step(game, level);
    expect([shaman.hp, near.hp, far.hp]).toEqual([500, 500 + HEAL.amount, 500]);
  });

  it('heals again only once its interval has gone by', () => {
    const game = fighting(level);
    place(game, level, 300, 'shaman');
    const patient = place(game, level, 320, 'dummy', { hp: 500 });
    step(game, level);
    run(game, level, HEAL.intervalTicks - 1);
    expect(patient.hp).toBe(500 + HEAL.amount);
    step(game, level);
    expect(patient.hp).toBe(500 + 2 * HEAL.amount);
  });

  it('never heals past full health', () => {
    const game = fighting(level);
    place(game, level, 300, 'shaman');
    const patient = place(game, level, 320, 'dummy', { hp: 990 });
    step(game, level);
    expect(patient.hp).toBe(1000);
  });

  it('keeps its heal for when someone near is wounded, then heals at once', () => {
    const game = fighting(level);
    const shaman = place(game, level, 300, 'shaman');
    const patient = place(game, level, 320, 'dummy');
    run(game, level, 100);
    expect(shaman.healCooldownTicks).toBe(0);
    patient.hp = 700;
    step(game, level);
    expect(patient.hp).toBe(700 + HEAL.amount);
    expect(shaman.healCooldownTicks).toBe(HEAL.intervalTicks);
  });

  it('cannot heal while stunned', () => {
    const game = fighting(level);
    place(game, level, 300, 'shaman', { stunTicks: 30 });
    const patient = place(game, level, 320, 'dummy', { hp: 500 });
    run(game, level, 20);
    expect(patient.hp).toBe(500);
  });

  it('does not bring back an enemy killed this tick', () => {
    const game = fighting(level);
    place(game, level, 300, 'shaman');
    const dead = place(game, level, 320, 'dummy', { hp: 0 });
    step(game, level);
    expect(byId(game, dead.id)).toBeUndefined();
  });

  it('heals flyers too, and two shamans heal each other', () => {
    const withBat = makeLevel({ enemyTypes: { ...level.enemyTypes, bat: { ...enemyBase, flying: true } } });
    const game = fighting(withBat);
    const one = place(game, withBat, 300, 'shaman', { hp: 100 });
    const two = place(game, withBat, 310, 'shaman', { hp: 100 });
    const bat = place(game, withBat, 290, 'bat', { hp: 100 });
    step(game, withBat);
    expect([one.hp, two.hp, bat.hp]).toEqual([100 + HEAL.amount, 100 + HEAL.amount, 100 + 2 * HEAL.amount]);
  });
});

describe('a skeleton', () => {
  const level = makeLevel({ towerTypes: { bow: { levels: [{ ...towerBase, damage: 1000 }] } } });

  /** A skeleton on the road with a tower that kills it in one shot. */
  function killedOnce(): { game: GameState; id: number } {
    const game = fighting(level);
    const bones = place(game, level, 300, 'bones');
    step(game, level, [{ type: 'buildTower', slot: 0, tower: 'bow' }]);
    expect(byId(game, bones.id)).toBeUndefined();
    return { game, id: bones.id };
  }

  it('falls where it was killed without paying anything, and waits to rise', () => {
    const { game, id } = killedOnce();
    expect(game.rising).toMatchObject([{ enemy: { id, distance: 300, revived: false }, ticksLeft: RISE.delayTicks }]);
    expect(game.gold).toBe(1000 - towerBase.cost);
    expect(game.score).toBe(0);
  });

  it('rises after its delay, where it fell, with half its health, once', () => {
    // No tower here: one would shoot it again the very tick it stands.
    const game = fighting(level);
    const { id } = place(game, level, 300, 'bones', { hp: 0 });
    step(game, level);
    run(game, level, RISE.delayTicks - 1);
    expect(byId(game, id)).toBeUndefined();
    expect(game.rising).toHaveLength(1);
    step(game, level);
    expect(game.rising).toEqual([]);
    expect(byId(game, id)).toMatchObject({ distance: 300, hp: 50, maxHp: 100, revived: true });
  });

  it('pays its bounty and experience only when it dies for good', () => {
    const { game, id } = killedOnce();
    // The tower shoots it again as soon as it is back on its feet.
    run(game, level, RISE.delayTicks + 1);
    expect(byId(game, id)).toBeUndefined();
    expect(game.rising).toEqual([]);
    expect(game.gold).toBe(1000 - towerBase.cost + 7);
    expect(game.score).toBe(7);
  });

  it('cannot be shot, stunned, slowed or blocked while it lies there', () => {
    const frosty = makeLevel({
      heroes: [{ type: 'knight', x: 300, y: 0 }],
      towerTypes: { frost: level.towerTypes.bow, ice: makeLevel().towerTypes.frost },
    });
    const game = fighting(frosty);
    const bones = place(game, frosty, 300, 'bones', { hp: 0 });
    step(game, frosty, [{ type: 'buildTower', slot: 0, tower: 'ice' }]);
    run(game, frosty, 10);
    expect(game.towers[0].lastShot).toBeNull();
    expect(game.rising[0].enemy).toMatchObject({ id: bones.id, stunTicks: 0, slowTicks: 0, blockedBy: null });
  });

  it('keeps the wave going while it lies there', () => {
    const game = fighting(level);
    place(game, level, 300, 'bones', { hp: 0 });
    step(game, level);
    expect(game.enemies).toEqual([]);
    expect(game.phase).toBe('wave');
  });

  it('rises free of whatever held it before', () => {
    const game = fighting(level);
    const bones = place(game, level, 300, 'bones', { hp: 0, stunTicks: 50, slowTicks: 50, slowFactor: 0.5 });
    run(game, level, RISE.delayTicks + 1);
    expect(byId(game, bones.id)).toMatchObject({ stunTicks: 0, slowTicks: 0, slowFactor: 1, blockedBy: null });
  });
});

describe('a splitting zombie', () => {
  const level = makeLevel();

  it('falls into smaller ones spread along the road around it, and pays its own bounty once', () => {
    const game = fighting(level);
    const hulk = place(game, level, 300, 'hulk', { hp: 0 });
    step(game, level);
    expect(byId(game, hulk.id)).toBeUndefined();
    expect(game.enemies.map(({ id, type, distance, hp, maxHp }) => ({ id, type, distance, hp, maxHp }))).toEqual([
      { id: hulk.id + 1, type: 'crawler', distance: 288, hp: 20, maxHp: 20 },
      { id: hulk.id + 2, type: 'crawler', distance: 300, hp: 20, maxHp: 20 },
      { id: hulk.id + 3, type: 'crawler', distance: 312, hp: 20, maxHp: 20 },
    ]);
    expect(game.nextEnemyId).toBe(hulk.id + 4);
    expect(game.gold).toBe(1000 + 15);
    expect(game.score).toBe(15);
  });

  it('keeps the small ones on the road near either end', () => {
    const game = fighting(level);
    place(game, level, 5, 'hulk', { hp: 0 });
    step(game, level);
    expect(game.enemies.map((enemy) => enemy.distance)).toEqual([0, 5, 17]);
  });

  it('gives the small ones the health growth of the wave and its own pace', () => {
    const grown = makeLevel({ waveHpGrowth: 0.5 });
    const game = fighting(grown);
    game.waveIndex = 2;
    // Ten percent faster than its type, as the speed jitter can make it.
    place(game, grown, 300, 'hulk', { hp: 0, speed: 0 });
    const runner = makeLevel({ waveHpGrowth: 0.5, enemyTypes: { ...grown.enemyTypes, hulk: { ...grown.enemyTypes.hulk, speed: 50 } } });
    const quick = fighting(runner);
    quick.waveIndex = 2;
    place(quick, runner, 300, 'hulk', { hp: 0, speed: 55 });
    step(game, grown);
    step(quick, runner);
    expect(game.enemies[0]).toMatchObject({ maxHp: 40, hp: 40 });
    expect(quick.enemies[0].speed).toBeCloseTo(90 * 1.1);
  });
});

describe('magic resistance', () => {
  const level = makeLevel();
  const attack: Attack = {
    range: 1000,
    damage: 100,
    splashRadius: 0,
    slowFactor: 1,
    slowTicks: 0,
    damageType: 'magic',
    hitsFlying: true,
  };

  it('shrugs off part of magic damage and none of physical damage', () => {
    const game = fighting(level);
    const ogre = place(game, level, 300, 'warded');
    dealDamage(level, ogre, 100, 'magic');
    expect(ogre.hp).toBe(950);
    dealDamage(level, ogre, 100, 'physical');
    expect(ogre.hp).toBe(850);
  });

  it('is not pierced by armor piercing, which only cuts through armor', () => {
    const game = fighting(level);
    const ogre = place(game, level, 300, 'warded');
    dealDamage(level, ogre, 100, 'magic', 1);
    expect(ogre.hp).toBe(950);
  });

  it('works beside armor: each protects against its own kind of damage', () => {
    const game = fighting(level);
    const bulwark = place(game, level, 300, 'bulwark');
    dealDamage(level, bulwark, 100, 'physical');
    expect(bulwark.hp).toBe(940);
    dealDamage(level, bulwark, 100, 'magic');
    expect(bulwark.hp).toBe(940 - 75);
    dealDamage(level, bulwark, 100, 'physical', 0.5);
    expect(bulwark.hp).toBe(940 - 75 - 80);
  });

  it('also cuts the splash of a magic attack', () => {
    const game = fighting(level);
    const target = place(game, level, 300, 'dummy');
    const neighbour = place(game, level, 310, 'warded');
    strike(game, level, { x: 300, y: 40 }, { ...attack, splashRadius: 30 });
    expect([1000 - target.hp, 1000 - neighbour.hp]).toEqual([100, 50]);
  });
});

describe('the state of these enemies', () => {
  const level = makeLevel();

  it('is part of the fingerprint online play compares', () => {
    const game = fighting(level);
    const shaman = place(game, level, 300, 'shaman');
    place(game, level, 320, 'bones', { hp: 0 });
    step(game, level);
    const before = hashState(game);
    shaman.healCooldownTicks += 1;
    expect(hashState(game)).not.toBe(before);
    shaman.healCooldownTicks -= 1;
    shaman.revived = true;
    expect(hashState(game)).not.toBe(before);
    shaman.revived = false;
    game.rising[0].ticksLeft -= 1;
    expect(hashState(game)).not.toBe(before);
    game.rising[0].ticksLeft += 1;
    game.rising[0].enemy.distance += 1;
    expect(hashState(game)).not.toBe(before);
    game.rising[0].enemy.distance -= 1;
    expect(hashState(game)).toBe(before);
  });

  it('is filled in, on a copy, for a state from before these enemies existed', () => {
    const game = fighting(level);
    place(game, level, 300, 'dummy');
    const old = JSON.parse(JSON.stringify(game));
    delete old.rising;
    delete old.enemies[0].healCooldownTicks;
    delete old.enemies[0].revived;
    const untouched = structuredClone(old);
    const filled = withStateDefaults(old);
    expect(filled.rising).toEqual([]);
    expect(filled.enemies[0]).toMatchObject({ healCooldownTicks: 0, revived: false });
    expect(old).toEqual(untouched);
    expect(hashState(filled)).toBe(hashState(game));
  });

  it('fills in the enemies lying on the road as well', () => {
    const game = fighting(level);
    place(game, level, 300, 'bones', { hp: 0 });
    step(game, level);
    const old = JSON.parse(JSON.stringify(game));
    delete old.rising[0].enemy.healCooldownTicks;
    expect(withStateDefaults(old).rising[0].enemy.healCooldownTicks).toBe(0);
  });
});

describe('a wave with every new enemy, on the real rules', () => {
  const base = MAPS[0].level;
  const level: Level = {
    ...base,
    waves: [
      [
        { enemy: 'soldier', count: 6, intervalTicks: 40, delayTicks: 0 },
        { enemy: 'shaman', count: 2, intervalTicks: 120, delayTicks: 60 },
        { enemy: 'skeleton', count: 4, intervalTicks: 50, delayTicks: 100 },
        { enemy: 'big_zombie', count: 2, intervalTicks: 200, delayTicks: 150 },
        { enemy: 'ogre', count: 1, intervalTicks: 0, delayTicks: 200 },
      ],
    ],
    startingGold: 3000,
  };

  /** Plays the wave with the same orders; reports what was seen along the way. */
  function play(seed: number) {
    const game = createGame(level, seed);
    const seen = { rose: false, split: false, healed: false };
    const build: Command[] = [0, 1, 2, 3, 4, 5].map((slot) => ({
      type: 'buildTower',
      slot,
      tower: slot % 2 === 0 ? 'archery' : 'arcane',
    }));
    step(game, level, [{ type: 'startWave' }, ...build]);
    for (let tick = 0; tick < 60 * 120 && game.phase === 'wave'; tick++) {
      const hp = new Map(game.enemies.map((enemy) => [enemy.id, enemy.hp]));
      step(game, level);
      if (game.rising.length > 0) seen.rose = true;
      if (game.enemies.some((enemy) => enemy.type === 'tiny_zombie')) seen.split = true;
      if (game.enemies.some((enemy) => enemy.revived)) seen.rose = true;
      for (const enemy of game.enemies) {
        if (enemy.type !== 'shaman' && enemy.hp > (hp.get(enemy.id) ?? Infinity)) seen.healed = true;
      }
    }
    return { game, seen };
  }

  it('plays the same on every machine given the same seed and orders', () => {
    const a = play(4);
    const b = play(4);
    expect(a.seen).toEqual({ rose: true, split: true, healed: true });
    expect(hashState(a.game)).toBe(hashState(b.game));
    expect(a.game).toEqual(b.game);
  });

  it('ends once the last of them is down, risers and split ones included', () => {
    const { game } = play(4);
    expect(game.phase).not.toBe('wave');
    expect(game.rising).toEqual([]);
  });
});
