import { describe, expect, it } from 'vitest';
import { applyDifficulty } from '../data/difficulty';
import { asEndless } from '../data/endless';
import { MAPS } from '../data/maps';
import { coopLevel } from '../net/coopLevel';
import { playerLevel } from '../progress/savedGame';
import { applyHeroRanks } from '../progress/upgrades';
import { castAbility } from './abilities';
import { strike, type Attack } from './combat';
import { createPath } from './path';
import {
  branchCost,
  createGame,
  enemyPosition,
  step,
  towerStats,
  upgradeCost,
  type Command,
  type Enemy,
  type GameState,
  type Level,
  type TowerLevel,
} from './simulation';
import { hashState } from './stateHash';

// Towers that reach their last base level can specialize into one of two
// branches, each with two more levels of its own.

const enemyBase = {
  maxHp: 1000,
  speed: 60,
  bounty: 0,
  livesCost: 1,
  damage: 10,
  attackIntervalTicks: 30,
  xp: 0,
  armor: 0,
  flying: false,
};

const towerBase: TowerLevel = {
  cost: 50,
  damage: 10,
  range: 100,
  attackIntervalTicks: 30,
  splashRadius: 0,
  slowFactor: 1,
  slowTicks: 0,
  damageType: 'physical',
  hitsFlying: true,
};

const BOW_COSTS = { build: 50, second: 40, third: 30, heavy4: 100, heavy5: 150, triple4: 120, triple5: 160 };

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
    waves: [[{ enemy: 'brute', count: 1, intervalTicks: 0, delayTicks: 0 }]],
    startingGold: 1000,
    startingLives: 20,
    speedJitter: 0,
    waveHpGrowth: 0,
    endless: null,
    scorePerWave: 0,
    enemyTypes: {
      brute: { ...enemyBase },
      plated: { ...enemyBase, armor: 0.5 },
      bat: { ...enemyBase, flying: true },
      // Freezes on it last half as long.
      hulk: { ...enemyBase, stunResist: 0.5 },
    },
    heroTypes: {
      knight: {
        moveSpeed: 100,
        range: 30,
        damage: 0,
        attackIntervalTicks: 30,
        maxHp: 100,
        blockCount: 1,
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
    xpRange: 0,
    xpThresholds: [0],
    levelBonus: 0,
    towerTypes: {
      bow: {
        levels: [
          { ...towerBase, cost: BOW_COSTS.build },
          { ...towerBase, cost: BOW_COSTS.second, damage: 15 },
          { ...towerBase, cost: BOW_COSTS.third, damage: 20 },
        ],
        branches: [
          {
            id: 'heavy',
            name: 'Pesada',
            blurb: 'Un golpe fuerte',
            levels: [
              { ...towerBase, cost: BOW_COSTS.heavy4, damage: 50, attackIntervalTicks: 20, armorPierce: 0.5 },
              { ...towerBase, cost: BOW_COSTS.heavy5, damage: 80, attackIntervalTicks: 20, armorPierce: 1 },
            ],
          },
          {
            id: 'triple',
            name: 'Triple',
            blurb: 'Tres flechas',
            levels: [
              { ...towerBase, cost: BOW_COSTS.triple4, targets: 3 },
              { ...towerBase, cost: BOW_COSTS.triple5, targets: 3, damage: 30 },
            ],
          },
        ],
      },
      // Three levels and nothing after them.
      plain: {
        levels: [
          { ...towerBase, cost: 10 },
          { ...towerBase, cost: 10 },
          { ...towerBase, cost: 10 },
        ],
      },
    },
    buildSlots: [{ x: 300, y: 40 }],
    sellRefund: 0.6,
    towerBranches: true,
    ...overrides,
  };
}

const build = (tower = 'bow'): Command => ({ type: 'buildTower', slot: 0, tower });
const upgrade: Command = { type: 'upgradeTower', slot: 0 };
const specialize = (branch: string, slot = 0): Command => ({ type: 'specializeTower', slot, branch });
const sell: Command = { type: 'sellTower', slot: 0 };
/** Builds the bow and takes it to its last base level. */
const TO_THIRD: Command[] = [build(), upgrade, upgrade];
const BASE_TOTAL = BOW_COSTS.build + BOW_COSTS.second + BOW_COSTS.third;

function after(commands: Command[], overrides: Partial<Level> = {}): { game: GameState; level: Level } {
  const level = makeLevel(overrides);
  const game = createGame(level, 1);
  step(game, level, commands);
  return { game, level };
}

/** Puts an enemy on the road, `distance` px from the start, as if it had walked there. */
function place(game: GameState, distance: number, type = 'brute', extra: Partial<Enemy> = {}): Enemy {
  const enemy: Enemy = {
    id: game.nextEnemyId++,
    type,
    path: 0,
    distance,
    hp: 1000,
    maxHp: 1000,
    speed: 60,
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

/** A game in the middle of a wave with nothing left to spawn. */
function fighting(level: Level): GameState {
  const game = createGame(level, 1);
  game.phase = 'wave';
  return game;
}

const attackBase: Attack = {
  range: 1000,
  damage: 10,
  splashRadius: 0,
  slowFactor: 1,
  slowTicks: 0,
  damageType: 'physical',
  hitsFlying: true,
};
const ORIGIN = { x: 300, y: 40 };
const lost = (enemy: Enemy) => 1000 - enemy.hp;

describe('specializing a tower', () => {
  it('pays the branch first level and moves the tower into it', () => {
    const { game } = after([...TO_THIRD, specialize('heavy')]);
    expect(game.towers[0]).toMatchObject({ level: 3, branch: 'heavy', invested: BASE_TOTAL + BOW_COSTS.heavy4 });
    expect(game.gold).toBe(1000 - BASE_TOTAL - BOW_COSTS.heavy4);
  });

  it('starts every tower without a branch', () => {
    const { game } = after([build()]);
    expect(game.towers[0].branch).toBeNull();
  });

  it('then upgrades within the branch up to its last level', () => {
    const { game } = after([...TO_THIRD, specialize('triple'), upgrade, upgrade]);
    expect(game.towers[0]).toMatchObject({ level: 4, branch: 'triple' });
    expect(game.gold).toBe(1000 - BASE_TOTAL - BOW_COSTS.triple4 - BOW_COSTS.triple5);
    expect(game.towers[0].invested).toBe(BASE_TOTAL + BOW_COSTS.triple4 + BOW_COSTS.triple5);
  });

  it('uses the stats of the branch level it reached', () => {
    const { game, level } = after([...TO_THIRD, specialize('heavy')]);
    expect(towerStats(level, game.towers[0]).damage).toBe(50);
    step(game, level, [upgrade]);
    expect(towerStats(level, game.towers[0]).damage).toBe(80);
  });

  it('refunds part of everything invested, branch included, when sold', () => {
    const { game } = after([...TO_THIRD, specialize('heavy'), upgrade, sell]);
    const invested = BASE_TOTAL + BOW_COSTS.heavy4 + BOW_COSTS.heavy5;
    expect(game.towers).toHaveLength(0);
    expect(game.gold).toBe(1000 - invested + Math.floor(invested * 0.6));
  });

  describe('requests that cannot be honoured do nothing', () => {
    const goldAfterThird = 1000 - BASE_TOTAL;

    it('a plain upgrade at the branching point: a branch has to be chosen', () => {
      const { game } = after([...TO_THIRD, upgrade]);
      expect(game.towers[0]).toMatchObject({ level: 2, branch: null });
      expect(game.gold).toBe(goldAfterThird);
    });

    it('without enough gold', () => {
      const { game } = after([...TO_THIRD, specialize('heavy')], { startingGold: BASE_TOTAL + BOW_COSTS.heavy4 - 1 });
      expect(game.towers[0]).toMatchObject({ level: 2, branch: null });
      expect(game.gold).toBe(BOW_COSTS.heavy4 - 1);
    });

    it('before the last base level', () => {
      const { game } = after([build(), upgrade, specialize('heavy')]);
      expect(game.towers[0]).toMatchObject({ level: 1, branch: null });
      expect(game.gold).toBe(1000 - BOW_COSTS.build - BOW_COSTS.second);
    });

    it('for a branch the tower does not have', () => {
      const { game } = after([...TO_THIRD, specialize('laser'), specialize('toString'), specialize('')]);
      expect(game.towers[0]).toMatchObject({ level: 2, branch: null });
      expect(game.gold).toBe(goldAfterThird);
    });

    it('for a tower already specialized', () => {
      const { game } = after([...TO_THIRD, specialize('heavy'), specialize('triple'), specialize('heavy')]);
      expect(game.towers[0]).toMatchObject({ level: 3, branch: 'heavy' });
      expect(game.gold).toBe(goldAfterThird - BOW_COSTS.heavy4);
    });

    it('for a tower type with no branches', () => {
      const { game } = after([build('plain'), upgrade, upgrade, specialize('heavy')]);
      expect(game.towers[0]).toMatchObject({ level: 2, branch: null });
      expect(game.gold).toBe(1000 - 30);
    });

    it('on an empty slot', () => {
      const { game } = after([specialize('heavy')]);
      expect(game.towers).toHaveLength(0);
      expect(game.gold).toBe(1000);
    });

    it('an upgrade past the last branch level', () => {
      const { game } = after([...TO_THIRD, specialize('heavy'), upgrade, upgrade]);
      expect(game.towers[0].level).toBe(4);
      expect(game.gold).toBe(goldAfterThird - BOW_COSTS.heavy4 - BOW_COSTS.heavy5);
    });
  });

  describe('prices, for the menu', () => {
    it('offers no plain upgrade at the branching point, and the branch prices instead', () => {
      const { game, level } = after(TO_THIRD);
      const tower = game.towers[0];
      expect(upgradeCost(level, tower)).toBeNull();
      expect(branchCost(level, tower, 'heavy')).toBe(BOW_COSTS.heavy4);
      expect(branchCost(level, tower, 'triple')).toBe(BOW_COSTS.triple4);
      expect(branchCost(level, tower, 'laser')).toBeNull();
    });

    it('has no branch price before the branching point or once specialized', () => {
      const early = after([build()]);
      expect(branchCost(early.level, early.game.towers[0], 'heavy')).toBeNull();
      const done = after([...TO_THIRD, specialize('heavy')]);
      expect(branchCost(done.level, done.game.towers[0], 'triple')).toBeNull();
      expect(upgradeCost(done.level, done.game.towers[0])).toBe(BOW_COSTS.heavy5);
    });
  });
});

describe('a map without branches', () => {
  const closed: Partial<Level> = { towerBranches: false };
  const goldAfterThird = 1000 - BASE_TOTAL;

  it('leaves branches off unless the map turns them on', () => {
    const { towerBranches: _, ...withoutFlag } = makeLevel();
    const game = createGame(withoutFlag, 1);
    step(game, withoutFlag, [...TO_THIRD, specialize('heavy')]);
    expect(game.towers[0]).toMatchObject({ level: 2, branch: null });
  });

  it('ignores a specialization, keeping the gold', () => {
    const { game } = after([...TO_THIRD, specialize('heavy'), specialize('triple')], closed);
    expect(game.towers[0]).toMatchObject({ level: 2, branch: null, invested: BASE_TOTAL });
    expect(game.gold).toBe(goldAfterThird);
  });

  it('has the tower maxed at its last base level: no upgrade and no branch price', () => {
    const { game, level } = after(TO_THIRD, closed);
    const tower = game.towers[0];
    expect(upgradeCost(level, tower)).toBeNull();
    expect(branchCost(level, tower, 'heavy')).toBeNull();
    expect(branchCost(level, tower, 'triple')).toBeNull();
  });

  it('keeps a tower specialized before, as an old save brings it: it fights and upgrades within its branch', () => {
    const { game, level } = after(TO_THIRD, closed);
    Object.assign(game.towers[0], { level: 3, branch: 'heavy', invested: BASE_TOTAL + BOW_COSTS.heavy4 });
    expect(towerStats(level, game.towers[0]).damage).toBe(50);
    expect(upgradeCost(level, game.towers[0])).toBe(BOW_COSTS.heavy5);
    step(game, level, [upgrade]);
    expect(game.towers[0]).toMatchObject({ level: 4, branch: 'heavy' });
    expect(towerStats(level, game.towers[0]).damage).toBe(80);
    expect(game.gold).toBe(goldAfterThird - BOW_COSTS.heavy5);
    // Never into another branch, though.
    step(game, level, [specialize('triple')]);
    expect(game.towers[0]).toMatchObject({ level: 4, branch: 'heavy' });
  });

  it('keeps every copy of a shared game equal when someone sends a specialization anyway', () => {
    const play = (commands: Command[]) => {
      const level = makeLevel(closed);
      const game = createGame(level, 3);
      step(game, level, commands);
      step(game, level, [{ type: 'startWave' }]);
      for (let tick = 0; tick < 300; tick++) step(game, level);
      return hashState(game);
    };
    const sent = [...TO_THIRD, specialize('heavy')];
    expect(play(sent)).toBe(play(sent));
    // As harmless as never sending it.
    expect(play(sent)).toBe(play(TO_THIRD));
  });

  it('is how the three current maps are played, at any difficulty, in any mode', () => {
    for (const map of MAPS) {
      expect(map.level.towerBranches ?? false, map.id).toBe(false);
      for (const mode of ['campaign', 'endless'] as const) {
        expect(playerLevel(map.id, 'hard', mode, {}).towerBranches ?? false, `${map.id} ${mode}`).toBe(false);
      }
      expect(coopLevel(map.id, 'normal', 2).towerBranches ?? false, map.id).toBe(false);
    }
  });

  it('survives every way a level is built for play, once a map turns them on', () => {
    const open: Level = { ...MAPS[0].level, towerBranches: true };
    const ranks = Object.fromEntries(Object.keys(open.heroTypes).map((type) => [type, 1]));
    expect(applyDifficulty(open, 'hard').towerBranches).toBe(true);
    expect(applyHeroRanks(open, ranks).towerBranches).toBe(true);
    expect(asEndless(open).towerBranches).toBe(true);
  });
});

describe('branch mechanics', () => {
  describe('several targets per shot', () => {
    it('hits as many different enemies as it has targets, the closest to the exit first', () => {
      const level = makeLevel();
      const game = fighting(level);
      const [a, b, c, d] = [100, 200, 300, 400].map((distance) => place(game, distance));
      const shot = strike(game, level, ORIGIN, { ...attackBase, targets: 3 });
      expect([a, b, c, d].map(lost)).toEqual([0, 10, 10, 10]);
      expect(shot?.struck?.map((hit) => hit.id)).toEqual([d.id, c.id, b.id]);
      expect(shot).toMatchObject({ x: 400, y: 0 });
    });

    it('never hits the same enemy twice when there are fewer than its targets', () => {
      const level = makeLevel();
      const game = fighting(level);
      const lone = place(game, 300);
      strike(game, level, ORIGIN, { ...attackBase, targets: 3 });
      expect(lost(lone)).toBe(10);
    });

    it('splashes around every target, hitting each enemy only once', () => {
      const level = makeLevel();
      const game = fighting(level);
      const front = place(game, 500);
      const second = place(game, 490); // a target, and in the splash of the first
      const behind = place(game, 480); // only in the splash of the second
      const far = place(game, 300);
      strike(game, level, ORIGIN, { ...attackBase, targets: 2, splashRadius: 15 });
      expect([front, second, behind, far].map(lost)).toEqual([10, 10, 10, 0]);
    });

    it('only picks enemies within its range', () => {
      const level = makeLevel();
      const game = fighting(level);
      const near = place(game, 300);
      const far = place(game, 590);
      strike(game, level, ORIGIN, { ...attackBase, range: 100, targets: 3 });
      expect([lost(near), lost(far)]).toEqual([10, 0]);
    });
  });

  describe('a chain', () => {
    it('jumps from each enemy hit to the nearest one not hit yet', () => {
      const level = makeLevel();
      const game = fighting(level);
      const first = place(game, 500);
      const second = place(game, 470);
      const third = place(game, 420);
      const untouched = place(game, 100);
      const shot = strike(game, level, ORIGIN, { ...attackBase, chainJumps: 2, chainRange: 100 });
      expect([first, second, third, untouched].map(lost)).toEqual([10, 10, 10, 0]);
      expect(shot?.struck?.map((hit) => hit.id)).toEqual([first.id, second.id, third.id]);
    });

    it('prefers the nearest enemy over one further along the road', () => {
      const level = makeLevel();
      const game = fighting(level);
      const first = place(game, 500);
      const behindFar = place(game, 440); // 60 px away
      const behindNear = place(game, 480); // 20 px away
      const shot = strike(game, level, ORIGIN, { ...attackBase, chainJumps: 1, chainRange: 100 });
      expect(shot?.struck?.map((hit) => hit.id)).toEqual([first.id, behindNear.id]);
      expect(lost(behindFar)).toBe(0);
    });

    it('stops when the next enemy is beyond the jump range of the last one hit', () => {
      const level = makeLevel();
      const game = fighting(level);
      place(game, 500);
      place(game, 470);
      const tooFar = place(game, 420); // 50 px from the second
      strike(game, level, ORIGIN, { ...attackBase, chainJumps: 2, chainRange: 40 });
      expect(lost(tooFar)).toBe(0);
    });

    it('jumps to the enemy listed first when two are equally near', () => {
      const level = makeLevel();
      const game = fighting(level);
      place(game, 500);
      const firstListed = place(game, 470);
      const secondListed = place(game, 470);
      const shot = strike(game, level, ORIGIN, { ...attackBase, chainJumps: 1, chainRange: 100 });
      expect(shot?.struck?.[1].id).toBe(firstListed.id);
      expect(lost(secondListed)).toBe(0);
    });

    it('reaches an enemy exactly at its jump range', () => {
      const level = makeLevel();
      const game = fighting(level);
      place(game, 500);
      const atEdge = place(game, 460);
      strike(game, level, ORIGIN, { ...attackBase, chainJumps: 1, chainRange: 40 });
      expect(lost(atEdge)).toBe(10);
    });

    it('may jump beyond the range of the tower: only the first target has to be in range', () => {
      const level = makeLevel();
      const game = fighting(level);
      place(game, 300); // 40 px from the tower
      const beyond = place(game, 200); // about 108 px from the tower, 100 from the first target
      const further = place(game, 110); // about 194 px from the tower
      strike(game, level, ORIGIN, { ...attackBase, range: 100, chainJumps: 2, chainRange: 100 });
      expect([lost(beyond), lost(further)]).toEqual([10, 10]);
    });

    it('does not jump to enemies the attack cannot reach', () => {
      const level = makeLevel();
      const game = fighting(level);
      place(game, 500);
      const bat = place(game, 480, 'bat');
      strike(game, level, ORIGIN, { ...attackBase, hitsFlying: false, chainJumps: 2, chainRange: 100 });
      expect(lost(bat)).toBe(0);
    });
  });

  describe('armor pierce', () => {
    it('ignores that fraction of the armor', () => {
      const level = makeLevel();
      const game = fighting(level);
      const plated = place(game, 300, 'plated');
      strike(game, level, ORIGIN, { ...attackBase, damage: 100, armorPierce: 0.5 });
      // Armor 0.5, half of it pierced: 25 % of the damage is absorbed.
      expect(lost(plated)).toBe(75);
    });

    it('also pierces the armor of enemies caught in the splash', () => {
      const level = makeLevel();
      const game = fighting(level);
      place(game, 300);
      const plated = place(game, 290, 'plated');
      strike(game, level, ORIGIN, { ...attackBase, damage: 100, splashRadius: 20, armorPierce: 0.5 });
      expect(lost(plated)).toBe(75);
    });

    it('without it, armor absorbs as usual', () => {
      const level = makeLevel();
      const game = fighting(level);
      const plated = place(game, 300, 'plated');
      strike(game, level, ORIGIN, { ...attackBase, damage: 100 });
      expect(lost(plated)).toBe(50);
    });
  });

  describe('freezing', () => {
    const freeze: Attack = { ...attackBase, damage: 0, stunTicks: 60 };

    it('stops the target, and only the target, from moving until it thaws', () => {
      const level = makeLevel();
      const game = fighting(level);
      const target = place(game, 300);
      const neighbour = place(game, 290);
      strike(game, level, ORIGIN, { ...freeze, splashRadius: 50 });
      expect(target.stunTicks).toBe(60);
      expect(neighbour.stunTicks).toBe(0);
      for (let tick = 0; tick < 60; tick++) step(game, level);
      expect(target.distance).toBe(300);
      expect(target.stunTicks).toBe(0);
      step(game, level);
      expect(target.distance).toBe(301);
    });

    it('pauses a slow while frozen: the enemy walks slowed once it thaws', () => {
      const level = makeLevel();
      const game = fighting(level);
      const target = place(game, 300);
      strike(game, level, ORIGIN, { ...freeze, slowFactor: 0.5, slowTicks: 100 });
      for (let tick = 0; tick < 60; tick++) step(game, level);
      expect(target.slowTicks).toBe(100);
      step(game, level);
      expect(target.distance).toBe(300.5);
    });

    it('stops a held enemy from attacking its hero, who keeps it held', () => {
      const level = makeLevel({ heroes: [{ type: 'knight', x: 300, y: 0 }] });
      const game = fighting(level);
      const target = place(game, 300, 'brute', { blockedBy: 1, attackCooldownTicks: 1 });
      strike(game, level, ORIGIN, freeze);
      for (let tick = 0; tick < 60; tick++) step(game, level);
      expect(game.heroes[0].hp).toBe(100);
      expect(target.blockedBy).toBe(1);
      step(game, level);
      expect(game.heroes[0].hp).toBe(90);
    });

    it('moves on to an enemy not frozen yet', () => {
      const level = makeLevel();
      const game = fighting(level);
      const front = place(game, 400);
      const back = place(game, 300);
      strike(game, level, ORIGIN, freeze);
      strike(game, level, ORIGIN, freeze);
      expect([front.stunTicks, back.stunTicks]).toEqual([60, 60]);
    });

    it('lasts less on an enemy that resists freezes, by its resistance', () => {
      const level = makeLevel();
      const game = fighting(level);
      const hulk = place(game, 300, 'hulk');
      strike(game, level, ORIGIN, freeze);
      expect(hulk.stunTicks).toBe(30);
    });

    it('never shortens a longer freeze', () => {
      const level = makeLevel();
      const game = fighting(level);
      const target = place(game, 300, 'brute', { stunTicks: 200 });
      strike(game, level, ORIGIN, freeze);
      expect(target.stunTicks).toBe(200);
    });
  });

  it('keeps the plain behaviour for attacks that set none of the new fields', () => {
    const level = makeLevel();
    const game = fighting(level);
    const [back, front] = [200, 300].map((distance) => place(game, distance));
    const shot = strike(game, level, ORIGIN, attackBase);
    expect([lost(back), lost(front)]).toEqual([0, 10]);
    expect(shot).toEqual({ tick: game.tick, x: 300, y: 0 });
  });
});

describe('the branches of the real towers', () => {
  const level: Level = MAPS[0].level;
  const tower = (type: string, branch: string | null, index: number) =>
    towerStats(level, { id: 1, slot: 0, type, level: index, branch, invested: 0, cooldownTicks: 0, lastShot: null });
  const third = (type: string) => tower(type, null, 2);
  const branch = (type: string, id: string, step4or5: 3 | 4) => tower(type, id, step4or5);
  const dps = (stats: TowerLevel) => (stats.damage * 60) / stats.attackIntervalTicks;

  it('gives each tower two branches, priced as the plan says', () => {
    for (const [id, type] of Object.entries(level.towerTypes)) {
      expect(type.branches, id).toHaveLength(2);
      for (const branch of type.branches!) {
        expect(branch.name.length, branch.id).toBeGreaterThan(0);
        expect(branch.blurb.length, branch.id).toBeGreaterThan(0);
        const [fourth, fifth] = branch.levels;
        expect(fourth.cost, branch.id).toBeGreaterThanOrEqual(250);
        expect(fourth.cost, branch.id).toBeLessThanOrEqual(350);
        expect(fifth.cost, branch.id).toBeGreaterThanOrEqual(400);
        expect(fifth.cost, branch.id).toBeLessThanOrEqual(550);
      }
    }
  });

  it('costs more to specialize every slot fully than a whole campaign earns', () => {
    let cheapestFull = Number.POSITIVE_INFINITY;
    for (const type of Object.values(level.towerTypes)) {
      const base = type.levels.reduce((sum, stats) => sum + stats.cost, 0);
      for (const branch of type.branches!) {
        cheapestFull = Math.min(cheapestFull, base + branch.levels[0].cost + branch.levels[1].cost);
      }
    }
    const bounties = level.waves.flat().reduce(
      (sum, group) => sum + group.count * level.enemyTypes[group.enemy].bounty,
      0,
    );
    expect(cheapestFull * level.buildSlots.length).toBeGreaterThan(level.startingGold + bounties);
  });

  it('makes each branch clearly stronger than the third level in its niche', () => {
    for (const step of [3, 4] as const) {
      // Ballesta: single target damage, through armor.
      const ballesta = branch('archery', 'ballesta', step);
      expect(dps(ballesta)).toBeGreaterThan(dps(third('archery')) * 1.4);
      expect(ballesta.armorPierce).toBeGreaterThan(0);
      // Lluvia de flechas: three targets per shot.
      const rain = branch('archery', 'lluvia', step);
      expect(rain.targets).toBe(3);
      expect(dps(rain) * 3).toBeGreaterThan(dps(third('archery')) * 1.4);
      // Mortero: reach and area, still ground only.
      const mortar = branch('cannon', 'mortero', step);
      expect(mortar.range).toBeGreaterThan(third('cannon').range);
      expect(mortar.splashRadius).toBeGreaterThan(third('cannon').splashRadius);
      expect(mortar.hitsFlying).toBe(false);
      // Bombarda: much faster fire.
      const bombard = branch('cannon', 'bombarda', step);
      expect(bombard.attackIntervalTicks).toBeLessThanOrEqual(third('cannon').attackIntervalTicks / 1.8);
      expect(dps(bombard)).toBeGreaterThan(dps(third('cannon')) * 1.4);
      // Ventisca: slows everything in an area.
      const blizzard = branch('ice', 'ventisca', step);
      expect(blizzard.splashRadius).toBeGreaterThan(0);
      expect(blizzard.slowFactor).toBeLessThanOrEqual(third('ice').slowFactor);
      // Escarcha: freezes one target about a second.
      const frost = branch('ice', 'escarcha', step);
      expect(frost.stunTicks).toBeGreaterThanOrEqual(40);
      expect(frost.splashRadius).toBe(0);
      // Rayo: chains to three enemies.
      const bolt = branch('arcane', 'rayo', step);
      expect(bolt.chainJumps).toBe(2);
      expect(bolt.chainRange).toBeGreaterThan(0);
      expect(dps(bolt)).toBeGreaterThanOrEqual(dps(third('arcane')) * 0.9);
      // Desintegrar: huge hits, slow fire.
      const disintegrate = branch('arcane', 'desintegrar', step);
      expect(disintegrate.damage).toBeGreaterThan(third('arcane').damage * 2.5);
      expect(disintegrate.attackIntervalTicks).toBeGreaterThan(third('arcane').attackIntervalTicks);
      expect(dps(disintegrate)).toBeGreaterThan(dps(third('arcane')) * 1.4);
    }
  });

  it('makes the fifth level better than the fourth in every branch', () => {
    for (const type of Object.values(level.towerTypes)) {
      for (const { id, levels: [fourth, fifth] } of type.branches!) {
        const better =
          fifth.damage > fourth.damage ||
          fifth.range > fourth.range ||
          fifth.attackIntervalTicks < fourth.attackIntervalTicks ||
          fifth.slowFactor < fourth.slowFactor ||
          (fifth.stunTicks ?? 0) > (fourth.stunTicks ?? 0);
        expect(better, id).toBe(true);
        expect(fifth.range, id).toBeGreaterThanOrEqual(fourth.range);
      }
    }
  });

  describe('against the real enemies', () => {
    /** The real level with one enemy of `type` standing on the road, `distance` px in. */
    function withEnemy(type: string, distance = 200): { game: GameState; enemy: Enemy; at: { x: number; y: number } } {
      const game = createGame(level, 1);
      game.phase = 'wave';
      const enemy = place(game, distance, type);
      return { game, enemy, at: enemyPosition(level, enemy) };
    }

    it('freezes a boss half as long as anyone else, from a tower', () => {
      const frost = branch('ice', 'escarcha', 3);
      for (const [type, ticks] of [
        ['soldier', frost.stunTicks!],
        ['boss', Math.round(frost.stunTicks! / 2)],
      ] as const) {
        const { game, enemy, at } = withEnemy(type);
        strike(game, level, { x: at.x, y: at.y + 40 }, frost);
        expect(enemy.stunTicks, type).toBe(ticks);
      }
    });

    it('stuns a boss half as long from a hero ability too', () => {
      const quake = level.heroTypes.warrior.abilities[0];
      for (const [type, ticks] of [
        ['soldier', quake.stunTicks],
        ['boss', Math.round(quake.stunTicks / 2)],
      ] as const) {
        const { game, enemy, at } = withEnemy(type);
        const warrior = game.heroes.find((hero) => hero.type === 'warrior')!;
        Object.assign(warrior, { x: at.x, y: at.y, targetX: at.x, targetY: at.y, level: quake.unlockLevel });
        castAbility(game, level, warrior, 0, at.x, at.y);
        expect(enemy.stunTicks, type).toBe(ticks);
      }
    });

    it('keeps Mortero away from flyers, even caught in its splash', () => {
      const mortar = branch('cannon', 'mortero', 4);
      const alone = withEnemy('flyer');
      expect(strike(alone.game, level, alone.at, mortar)).toBeNull();
      expect(alone.enemy.hp).toBe(alone.enemy.maxHp);

      const { game, enemy: soldier, at } = withEnemy('soldier');
      const flyer = place(game, 210, 'flyer');
      flyer.hp = flyer.maxHp = 130;
      strike(game, level, at, mortar);
      expect(soldier.hp).toBeLessThan(1000);
      expect(flyer.hp).toBe(130);
    });
  });

  it('makes the boss, and only the boss, resist freezes', () => {
    const resisting = Object.entries(level.enemyTypes).filter(([, type]) => (type.stunResist ?? 0) > 0);
    expect(resisting.map(([id]) => id)).toEqual(['boss']);
    expect(level.enemyTypes.boss.stunResist).toBe(0.5);
  });

  it('lets Bombarda fire as often as its stats say once specialized', () => {
    const real: Level = { ...level, towerBranches: true, startingGold: 5000, waves: [[{ enemy: 'boss', count: 1, intervalTicks: 0, delayTicks: 0 }]] };
    const game = createGame(real, 1);
    step(game, real, [
      { type: 'buildTower', slot: 0, tower: 'cannon' },
      { type: 'upgradeTower', slot: 0 },
      { type: 'upgradeTower', slot: 0 },
      { type: 'specializeTower', slot: 0, branch: 'bombarda' },
      { type: 'startWave' },
    ]);
    const shots = new Set<number>();
    for (let tick = 0; tick < 3000 && game.phase === 'wave'; tick++) {
      step(game, real);
      const shot = game.towers[0].lastShot;
      if (shot) shots.add(shot.tick);
    }
    const ticks = [...shots].sort((a, b) => a - b);
    const gaps = ticks.slice(1).map((tick, index) => tick - ticks[index]);
    expect(gaps.length).toBeGreaterThan(2);
    expect(Math.min(...gaps)).toBe(branch('cannon', 'bombarda', 3).attackIntervalTicks);
  });
});

describe('determinism with specializations', () => {
  const real: Level = { ...MAPS[0].level, towerBranches: true, startingGold: 5000 };

  /** Builds four towers, specializes them, then plays every wave it can. */
  function play(seed: number, branches: string[] = ['ballesta', 'bombarda', 'escarcha', 'rayo']): GameState {
    const game = createGame(real, seed);
    const types = ['archery', 'cannon', 'ice', 'arcane'];
    for (let tick = 0; tick < 2400; tick++) {
      const commands: Command[] = [];
      if (tick === 0) {
        types.forEach((tower, slot) => {
          commands.push({ type: 'buildTower', slot, tower }, { type: 'upgradeTower', slot }, { type: 'upgradeTower', slot });
          commands.push({ type: 'specializeTower', slot, branch: branches[slot] }, { type: 'upgradeTower', slot });
        });
      }
      if (game.phase === 'preparing') commands.push({ type: 'startWave' });
      step(game, real, commands);
    }
    return game;
  }

  it('gives the same hash for the same seed and commands', () => {
    const first = play(9);
    expect(first.towers.every((tower) => tower.level === 4 && tower.branch !== null)).toBe(true);
    expect(hashState(play(9))).toBe(hashState(first));
  });

  it('gives a different hash when a branch choice differs', () => {
    expect(hashState(play(9, ['lluvia', 'bombarda', 'escarcha', 'rayo']))).not.toBe(hashState(play(9)));
  });

  it('notices a branch changing even when nothing else did', () => {
    const game = play(9);
    const before = hashState(game);
    game.towers[0].branch = 'lluvia';
    expect(hashState(game)).not.toBe(before);
  });
});
