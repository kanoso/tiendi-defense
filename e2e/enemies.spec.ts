import { expect, test, type Page } from '@playwright/test';
import { giveGold, openGame, snapshot } from './game';

// The enemies with traits of their own, put on the road by test setup: the
// first maps never send them. Everything waits in game ticks, generously, as a
// busy machine runs the game slower.

const SLOW = { timeout: 30_000 };

/** Distances along the meadow road that fall on its lower stretch, well inside the map. */
const ON_ROAD = 620;

test.beforeEach(async ({ page }) => {
  await openGame(page);
});

interface Placed {
  type: string;
  distance: number;
  /** Health to start with, as a fraction of the maximum. Full when missing. */
  hpFraction?: number;
}

/**
 * Test setup only: sends the heroes out of the way, starts a wave with nothing
 * else in it, and puts the enemies on the road as if they had walked there.
 * Also starts noting every effect the scene draws, so a short one is not missed.
 */
function putEnemies(page: Page, enemies: Placed[]): Promise<number[]> {
  return page.evaluate((list) => {
    const scene = (window as any).__game.scene.getScene('game');
    const game = scene.game_;
    const level = scene.level;
    for (const hero of game.heroes) {
      hero.x = hero.targetX = 40;
      hero.y = hero.targetY = 520;
    }
    game.phase = 'wave';
    game.spawnQueue = [];
    const ids = list.map(({ type, distance, hpFraction }) => {
      const kind = level.enemyTypes[type];
      const maxHp = Math.round(kind.maxHp * (1 + level.waveHpGrowth * game.waveIndex));
      const id = game.nextEnemyId++;
      game.enemies.push({
        id,
        type,
        path: 0,
        distance,
        hp: Math.round(maxHp * (hpFraction ?? 1)),
        maxHp,
        speed: kind.speed,
        blockedBy: null,
        attackCooldownTicks: 0,
        slowTicks: 0,
        slowFactor: 1,
        stunTicks: 0,
        healCooldownTicks: 0,
        revived: false,
      });
      return id;
    });
    const w = window as any;
    w.__effectsSeen = [];
    const watch = () => {
      for (const effect of scene.describeEnemiesForTests().effects) {
        if (!w.__effectsSeen.includes(effect.kind)) w.__effectsSeen.push(effect.kind);
      }
      requestAnimationFrame(watch);
    };
    watch();
    return ids;
  }, enemies);
}

function effectsSeen(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as any).__effectsSeen);
}

/** Test setup only: kills an enemy, as if a shot had. */
function kill(page: Page, id: number): Promise<void> {
  return page.evaluate((wanted) => {
    const enemy = (window as any).__game.scene.getScene('game').game_.enemies.find((e: any) => e.id === wanted);
    enemy.hp = 0;
  }, id);
}

interface EnemyState {
  where: 'road' | 'lying' | 'gone';
  hp: number;
  maxHp: number;
  revived: boolean;
}

function enemyState(page: Page, id: number): Promise<EnemyState> {
  return page.evaluate((wanted) => {
    const game = (window as any).__game.scene.getScene('game').game_;
    const onRoad = game.enemies.find((e: any) => e.id === wanted);
    const lying = game.rising.find((r: any) => r.enemy.id === wanted)?.enemy;
    const enemy = onRoad ?? lying;
    return {
      where: onRoad ? 'road' : lying ? 'lying' : 'gone',
      hp: enemy?.hp ?? 0,
      maxHp: enemy?.maxHp ?? 0,
      revived: enemy?.revived ?? false,
    };
  }, id);
}

function drawnEnemy(page: Page, id: number) {
  return page.evaluate(
    (wanted) =>
      (window as any).__game.scene
        .getScene('game')
        .describeEnemiesForTests()
        .enemies.find((e: any) => e.id === wanted) ?? null,
    id,
  );
}

function hasBody(page: Page, id: number): Promise<boolean> {
  return page.evaluate((wanted) =>
    (window as any).__game.scene
      .getScene('game')
      .describeUnitsForTests()
      .bodies.some((body: any) => body.id === wanted),
  id);
}

test('a shaman heals a wounded enemy beside it, which flashes green, with a pulse around the shaman', async ({
  page,
}) => {
  const [, soldier] = await putEnemies(page, [
    { type: 'shaman', distance: ON_ROAD },
    { type: 'soldier', distance: ON_ROAD + 20, hpFraction: 0.5 },
  ]);
  const start = await enemyState(page, soldier);
  await expect.poll(async () => (await enemyState(page, soldier)).hp, SLOW).toBeGreaterThan(start.hp);
  await expect.poll(async () => (await drawnEnemy(page, soldier))?.healTick ?? null, SLOW).not.toBeNull();
  await expect.poll(() => effectsSeen(page), SLOW).toContain('healPulse');
});

test('a skeleton gets back up once where it fell, then dies for good and pays only then', async ({ page }) => {
  const [skeleton] = await putEnemies(page, [{ type: 'skeleton', distance: ON_ROAD }]);
  const before = await snapshot(page);
  await kill(page, skeleton);

  await expect.poll(async () => (await enemyState(page, skeleton)).where, SLOW).toBe('lying');
  // Lying there: drawn on the ground, with no body left to fade, and nothing paid yet.
  await expect.poll(async () => (await drawnEnemy(page, skeleton))?.rising, SLOW).toBe(true);
  expect(await hasBody(page, skeleton)).toBe(false);
  expect((await snapshot(page)).gold).toBe(before.gold);

  await expect.poll(async () => (await enemyState(page, skeleton)).where, SLOW).toBe('road');
  const risen = await enemyState(page, skeleton);
  expect(risen.revived).toBe(true);
  expect(risen.hp).toBe(Math.round(risen.maxHp * 0.5));
  await expect.poll(async () => (await drawnEnemy(page, skeleton))?.angle, SLOW).toBe(0);

  await kill(page, skeleton);
  await expect.poll(async () => (await enemyState(page, skeleton)).where, SLOW).toBe('gone');
  await expect.poll(() => hasBody(page, skeleton), SLOW).toBe(true);
  const bounty = await page.evaluate(
    () => (window as any).__game.scene.getScene('game').level.enemyTypes.skeleton.bounty,
  );
  expect((await snapshot(page)).gold).toBe(before.gold + bounty);
});

test('a big zombie bursts into three small ones, in a puff of dust, and leaves its body', async ({ page }) => {
  const [zombie] = await putEnemies(page, [{ type: 'big_zombie', distance: ON_ROAD }]);
  await expect.poll(async () => (await drawnEnemy(page, zombie)) !== null, SLOW).toBe(true);
  await kill(page, zombie);
  const tiny = () =>
    page.evaluate(
      () =>
        (window as any).__game.scene
          .getScene('game')
          .game_.enemies.filter((e: any) => e.type === 'tiny_zombie').length,
    );
  await expect.poll(tiny, SLOW).toBe(3);
  await expect.poll(() => hasBody(page, zombie), SLOW).toBe(true);
  await expect.poll(() => effectsSeen(page), SLOW).toContain('splitPuff');

  // The small ones popped out of the burst and stand in front of the body it left.
  const drawn = await page.evaluate((id) => {
    const scene = (window as any).__game.scene.getScene('game');
    const pieces = scene.describeEnemiesForTests().enemies.filter((e: any) => e.type === 'tiny_zombie');
    const body = scene.describeUnitsForTests().bodies.find((b: any) => b.id === id);
    return { pieces, bodyDepth: body?.depth ?? null };
  }, zombie);
  expect(drawn.pieces).toHaveLength(3);
  expect(drawn.bodyDepth).not.toBeNull();
  for (const piece of drawn.pieces) {
    expect(piece.popTick).not.toBeNull();
    expect(piece.depth).toBeGreaterThan(drawn.bodyDepth!);
  }
});

test('an ogre takes only part of the damage of a magic tower', async ({ page }) => {
  await giveGold(page, 5000);
  // The open slot nearest the road, and the spot on the road nearest to it.
  const spot = await page.evaluate(() => {
    const scene = (window as any).__game.scene.getScene('game');
    const level = scene.level;
    const points = level.paths[0].points;
    let best = { slot: -1, distance: 0, gap: Infinity };
    let travelled = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const span = Math.hypot(b.x - a.x, b.y - a.y);
      for (let along = 0; along <= span; along += 5) {
        const x = a.x + ((b.x - a.x) * along) / span;
        const y = a.y + ((b.y - a.y) * along) / span;
        if (x < 40 || x > 920 || y < 40 || y > 500) continue;
        level.buildSlots.forEach((slot: any, index: number) => {
          if (slot.clearCost !== undefined) return;
          const gap = Math.hypot(slot.x - x, slot.y - y);
          if (gap < best.gap) best = { slot: index, distance: travelled + along, gap };
        });
      }
      travelled += span;
    }
    return best;
  });
  const [ogre] = await putEnemies(page, [{ type: 'ogre', distance: spot.distance }]);
  // The first drop in its health, noted from inside the page so no frame goes by unseen.
  const watched = page.evaluate(
    (id) =>
      new Promise<number>((resolve) => {
        const scene = (window as any).__game.scene.getScene('game');
        const start = scene.game_.enemies.find((e: any) => e.id === id).hp;
        const watch = () => {
          const enemy = scene.game_.enemies.find((e: any) => e.id === id);
          if (enemy && enemy.hp < start) return resolve(start - enemy.hp);
          requestAnimationFrame(watch);
        };
        watch();
      }),
    ogre,
  );
  await page.evaluate((slot) => {
    (window as any).__game.scene.getScene('game').pendingCommands.push({ type: 'buildTower', slot, tower: 'arcane' });
  }, spot.slot);
  const lost = await watched;
  const { damage, resist } = await page.evaluate(() => {
    const level = (window as any).__game.scene.getScene('game').level;
    return { damage: level.towerTypes.arcane.levels[0].damage, resist: level.enemyTypes.ogre.magicResist };
  });
  expect(resist).toBeGreaterThan(0);
  expect(lost).toBeCloseTo(damage * (1 - resist));
});
