import { expect, test, type Page } from '@playwright/test';
import { HERO_SCALE } from '../src/entities/styles';
import { DEATH_TICKS } from '../src/entities/unitMotion';
import { headRise, HIT_FLASH_TICKS, HIT_FRAME, UNIT_SHEETS } from '../src/entities/units';
import {
  clickMap,
  clickMenuOption,
  clickSlot,
  forceDefeat,
  giveHeroesLevel,
  openGame,
  snapshot,
} from './game';

// An empty patch of grass: no road, no slot, no hero, no interface.
const GRASS = { x: 620, y: 420 };

test.beforeEach(async ({ page }) => {
  await openGame(page);
});

test('starts waiting for the player with full lives', async ({ page }) => {
  const game = await snapshot(page);
  expect(game.phase).toBe('preparing');
  expect(game.lives).toBe(20);
  expect(game.wave).toBe(1);
  expect(game.heroes).toHaveLength(4);
});

test('the space bar starts the wave and enemies come in', async ({ page }) => {
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).phase).toBe('wave');
  await expect.poll(async () => (await snapshot(page)).enemies).toBeGreaterThan(0);
});

test('a tower can be bought and sold from its slot menu', async ({ page }) => {
  const before = await snapshot(page);

  await clickSlot(page, 1);
  await expect.poll(async () => (await snapshot(page)).menu.length).toBeGreaterThan(0);
  await clickMenuOption(page, 'Arquería');
  await expect
    .poll(async () => (await snapshot(page)).towers)
    .toEqual([{ slot: 1, type: 'archery', level: 0 }]);
  const afterBuying = await snapshot(page);
  expect(afterBuying.gold).toBeLessThan(before.gold);

  await clickSlot(page, 1);
  await clickMenuOption(page, 'Vender');
  await expect.poll(async () => (await snapshot(page)).towers).toEqual([]);
  const afterSelling = await snapshot(page);
  expect(afterSelling.gold).toBeGreaterThan(afterBuying.gold);
  expect(afterSelling.gold).toBeLessThan(before.gold);
});

test('an empty slot offers every tower with its price', async ({ page }) => {
  await clickSlot(page, 4);
  await expect.poll(async () => (await snapshot(page)).menu.length).toBe(4);
  const labels = (await snapshot(page)).menu.join(' | ');
  for (const tower of ['Arquería', 'Cañón', 'Hielo', 'Arcana']) {
    expect(labels).toContain(tower);
  }
});

test('an upgrade the player cannot afford changes nothing', async ({ page }) => {
  await clickSlot(page, 1);
  await clickMenuOption(page, 'Arquería');
  await expect.poll(async () => (await snapshot(page)).towers.length).toBe(1);
  const before = await snapshot(page);

  await clickSlot(page, 1);
  await clickMenuOption(page, 'Mejorar');
  await page.waitForTimeout(200);
  const after = await snapshot(page);
  expect(after.towers[0].level).toBe(0);
  expect(after.gold).toBe(before.gold);
});

test('clicking away closes the tower menu without moving a hero', async ({ page }) => {
  const before = await snapshot(page);
  await clickSlot(page, 1);
  await expect.poll(async () => (await snapshot(page)).menu.length).toBeGreaterThan(0);

  await clickMap(page, GRASS.x, GRASS.y);
  await expect.poll(async () => (await snapshot(page)).menu.length).toBe(0);
  expect((await snapshot(page)).heroes).toEqual(before.heroes);
});

test('a number key selects a hero and a click on the map sends it there', async ({ page }) => {
  await page.keyboard.press('2');
  await expect.poll(async () => (await snapshot(page)).selectedHeroId).toBe(2);

  await clickMap(page, GRASS.x, GRASS.y);
  // The click lands within a pixel of the requested point.
  await expect
    .poll(async () => Math.abs((await snapshot(page)).heroes[1].targetX - GRASS.x))
    .toBeLessThan(2);
  expect(Math.abs((await snapshot(page)).heroes[1].targetY - GRASS.y)).toBeLessThan(2);
});

test("a click on the very top of a hero's head selects it", async ({ page }) => {
  await page.keyboard.press('2');
  const hero = await page.evaluate(() => {
    const warrior = (window as any).__game.scene.getScene('game').game_.heroes[0];
    return { x: warrior.x, y: warrior.y };
  });
  // The knight stands on its feet; its helmet reaches higher than its circle.
  await clickMap(page, hero.x, hero.y - headRise(UNIT_SHEETS['hero-warrior'], HERO_SCALE) + 1);
  await expect.poll(async () => (await snapshot(page)).selectedHeroId).toBe(1);
  // Selecting is not moving.
  const warrior = (await snapshot(page)).heroes[0];
  expect({ x: warrior.targetX, y: warrior.targetY }).toEqual({ x: hero.x, y: hero.y });
});

/** The frame each hero's sprite shows, in hero order. */
function heroFrames(page: Page): Promise<string> {
  return page.evaluate(() => {
    const scene = (window as any).__game.scene.getScene('game');
    return [...scene.heroViews.values()].map((view: any) => String(view.body.frame.name)).join(',');
  });
}

function enemyFrames(page: Page): Promise<string> {
  return page.evaluate(() => {
    const scene = (window as any).__game.scene.getScene('game');
    return [...scene.enemyViews.values()].map((view: any) => String(view.sprite.frame.name)).join(',');
  });
}

test('heroes and enemies hold their animation frame while the game is paused', async ({ page }) => {
  await page.keyboard.press('Space');
  // Generous: a slow machine runs the game slower, and enemies come in game time.
  await expect.poll(async () => (await snapshot(page)).enemies, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);

  await page.keyboard.press('P');
  await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
  const still = { heroes: await heroFrames(page), enemies: await enemyFrames(page), tick: (await snapshot(page)).tick };
  await page.waitForTimeout(500);
  expect({ heroes: await heroFrames(page), enemies: await enemyFrames(page), tick: (await snapshot(page)).tick }).toEqual(
    still,
  );

  // Only the heroes: an enemy arriving or leaving would change the enemy frames anyway.
  await page.keyboard.press('P');
  await expect.poll(() => heroFrames(page), { timeout: 30_000 }).not.toBe(still.heroes);
});

test('a hero that loses health flashes its hit frame, then goes back to its loop', async ({ page }) => {
  const warriorFrame = async () => (await heroFrames(page)).split(',')[0];
  // Paused, so the flash cannot come and go between two looks.
  await page.keyboard.press('P');
  await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
  const hitTick = await page.evaluate(() => {
    const scene = (window as any).__game.scene.getScene('game');
    scene.game_.heroes[0].hp -= 10;
    return scene.game_.tick;
  });
  await expect.poll(warriorFrame).toBe(String(HIT_FRAME));

  await page.keyboard.press('P');
  await expect.poll(warriorFrame, { timeout: 30_000 }).not.toBe(String(HIT_FRAME));
  expect((await snapshot(page)).tick - hitTick).toBeGreaterThanOrEqual(HIT_FLASH_TICKS);
});

/** How the units are drawn now, as the scene describes it for tests. */
type DrawnUnits = {
  tick: number;
  units: { kind: 'hero' | 'enemy'; id: number; y: number; depth: number; flying: boolean }[];
  bodies: { id: number; startTick: number; alpha: number; angle: number; visible: boolean; interactive: boolean }[];
  lowestMarkDepth: number;
};

function drawnUnits(page: Page): Promise<DrawnUnits> {
  return page.evaluate(() => (window as any).__game.scene.getScene('game').describeUnitsForTests());
}

/** Whether the body of that enemy is still on the map. */
async function hasRemains(page: Page, enemyId: number): Promise<boolean> {
  return (await drawnUnits(page)).bodies.some((body) => body.id === enemyId);
}

test('a killed enemy falls and fades for a set number of game ticks, and holds still while paused', async ({
  page,
}) => {
  await page.keyboard.press('Space');
  // Generous: a slow machine runs the game slower, and enemies come in game time.
  await expect.poll(async () => (await snapshot(page)).enemies, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);

  // Test setup only: the first enemy is killed, and the game is paused the very
  // frame its body appears, from inside the page so no frame goes by unseen.
  const enemyId = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const scene = (window as any).__game.scene.getScene('game');
        const enemy = scene.game_.enemies[0];
        enemy.hp = 0;
        const watch = () => {
          const bodies = scene.describeUnitsForTests().bodies;
          if (!bodies.some((body: any) => body.id === enemy.id)) return requestAnimationFrame(watch);
          scene.togglePause();
          resolve(enemy.id);
        };
        watch();
      }),
  );
  const look = async () => {
    const drawn = await drawnUnits(page);
    return { tick: drawn.tick, body: drawn.bodies.find((body) => body.id === enemyId)! };
  };

  const paused = await look();
  expect(paused.body.visible).toBe(true);
  expect(paused.body.alpha).toBeGreaterThan(0);
  expect(paused.tick - paused.body.startTick).toBeLessThan(DEATH_TICKS);
  // Taps go through a body to whatever is under it.
  expect(paused.body.interactive).toBe(false);
  await page.waitForTimeout(500);
  expect(await look()).toEqual(paused);

  await page.keyboard.press('P');
  await expect.poll(() => hasRemains(page, enemyId), { timeout: 30_000 }).toBe(false);
  expect((await snapshot(page)).tick - paused.body.startTick).toBeGreaterThanOrEqual(DEATH_TICKS);
});

test('an enemy that walks out of the map leaves no body behind', async ({ page }) => {
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).enemies, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  const lives = (await snapshot(page)).lives;

  // Test setup only: the first enemy is put half a second of walking from the
  // exit, so it is seen near it before it walks out, as it would be in play.
  // Nothing can kill it on the way, so the result never depends on the fight.
  const enemyId = await page.evaluate(() => {
    const scene = (window as any).__game.scene.getScene('game');
    const enemy = scene.game_.enemies[0];
    enemy.hp = enemy.maxHp = 1e9;
    enemy.distance = scene.level.paths[enemy.path].length - enemy.speed / 2;
    enemy.blockedBy = null;
    enemy.stunTicks = 0;
    enemy.slowTicks = 0;
    return enemy.id as number;
  });
  await expect.poll(async () => (await snapshot(page)).lives, { timeout: 30_000 }).toBeLessThan(lives);
  expect(await hasRemains(page, enemyId)).toBe(false);
});

test('units lower on the screen are drawn in front, flyers above them and the marks above all', async ({
  page,
}) => {
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).enemies, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('P');
  await expect.poll(async () => (await snapshot(page)).paused).toBe(true);

  const drawn = await drawnUnits(page);
  // Depth follows the feet to the whole pixel; the feet are a fixed distance below `y`.
  const ground = drawn.units.filter((unit) => !unit.flying).sort((a, b) => a.y - b.y);
  expect(ground.length).toBeGreaterThanOrEqual(5);
  for (let i = 1; i < ground.length; i++) {
    if (Math.round(ground[i].y) > Math.round(ground[i - 1].y)) {
      expect(ground[i].depth).toBeGreaterThan(ground[i - 1].depth);
    }
  }
  const deepestGround = Math.max(...ground.map((unit) => unit.depth));
  for (const flyer of drawn.units.filter((unit) => unit.flying)) expect(flyer.depth).toBeGreaterThan(deepestGround);
  for (const unit of drawn.units) expect(unit.depth).toBeLessThan(drawn.lowestMarkDepth);
});

test('a locked ability does not fire and says when it unlocks', async ({ page }) => {
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).enemies).toBeGreaterThan(0);

  await page.keyboard.press('1');
  await page.keyboard.press('q');
  await expect.poll(async () => (await snapshot(page)).notice).toContain('nivel 2');
  expect((await snapshot(page)).heroes[0].cast).toBe(false);
});

test('an ability on cooldown says how long is left', async ({ page }) => {
  await giveHeroesLevel(page, 2);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).enemies).toBeGreaterThan(0);

  await page.keyboard.press('1');
  await page.keyboard.press('q');
  await expect.poll(async () => (await snapshot(page)).heroes[0].cast).toBe(true);
  await page.keyboard.press('q');
  await expect.poll(async () => (await snapshot(page)).notice).toContain('en recarga');
});

test('pressing the ability key between waves explains why nothing happens', async ({ page }) => {
  await giveHeroesLevel(page, 2);
  await page.keyboard.press('q');
  await expect.poll(async () => (await snapshot(page)).notice).toContain('durante una oleada');
});

test('an instant ability fires as soon as its key is pressed', async ({ page }) => {
  await giveHeroesLevel(page, 2);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).enemies).toBeGreaterThan(0);

  await page.keyboard.press('1');
  await page.keyboard.press('q');
  await expect.poll(async () => (await snapshot(page)).heroes[0].cast).toBe(true);
});

test('a targeted ability waits for a click, and escape cancels the aim', async ({ page }) => {
  await giveHeroesLevel(page, 2);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).enemies).toBeGreaterThan(0);

  await page.keyboard.press('3');
  await page.keyboard.press('q');
  await expect.poll(async () => (await snapshot(page)).targetingHeroId).toBe(3);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).targetingHeroId).toBeNull();
  expect((await snapshot(page)).heroes[2].cast).toBe(false);

  await page.keyboard.press('q');
  await clickMap(page, 250, 200);
  await expect.poll(async () => (await snapshot(page)).heroes[2].cast).toBe(true);
  // The click confirmed the aim; it must not also have moved the hero.
  expect((await snapshot(page)).heroes[2].targetX).not.toBe(250);
});

test('the support ability leaves a zone on the map', async ({ page }) => {
  await giveHeroesLevel(page, 2);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).enemies).toBeGreaterThan(0);

  await page.keyboard.press('4');
  await page.keyboard.press('q');
  await clickMap(page, 250, 300);
  await expect.poll(async () => (await snapshot(page)).zones).toBe(1);
});

test('the second ability stays locked until its own level', async ({ page }) => {
  await giveHeroesLevel(page, 2);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).enemies).toBeGreaterThan(0);

  await page.keyboard.press('1');
  await page.keyboard.press('w');
  await expect.poll(async () => (await snapshot(page)).notice).toContain('nivel 4');
  expect((await snapshot(page)).zones).toBe(0);
});

test('the second ability fires with its own key once unlocked', async ({ page }) => {
  await giveHeroesLevel(page, 4);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).enemies).toBeGreaterThan(0);

  // The warrior's second ability leaves a healing zone around him.
  await page.keyboard.press('1');
  await page.keyboard.press('w');
  await expect.poll(async () => (await snapshot(page)).zones).toBe(1);
});

test('each ability plays its own visual effect', async ({ page }) => {
  // Which effect is playing, read from what the scene is drawing.
  const playing = () =>
    page.evaluate(() =>
      (window as any).__game.scene.getScene('game').castEffects.map((effect: any) => effect.kind),
    );
  await giveHeroesLevel(page, 4);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).enemies).toBeGreaterThan(0);

  // Hero key, ability key, whether it needs a spot on the map, and its effect.
  const abilities = [
    ['1', 'q', false, 'quake'],
    ['2', 'q', false, 'volley'],
    ['2', 'w', true, 'pierce'],
    ['3', 'q', true, 'meteor'],
    ['4', 'w', true, 'freeze'],
    ['1', 'w', false, 'zone'],
  ] as const;
  for (const [hero, key, aimed, effect] of abilities) {
    await page.keyboard.press(hero);
    await page.keyboard.press(key);
    if (aimed) await clickMap(page, 300, 250);
    await expect.poll(playing, { intervals: [30, 60, 100] }).toContain(effect);
  }
});

test('an ability effect goes away by itself', async ({ page }) => {
  const playing = () =>
    page.evaluate(() => (window as any).__game.scene.getScene('game').castEffects.length);
  await giveHeroesLevel(page, 2);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).enemies).toBeGreaterThan(0);

  await page.keyboard.press('1');
  await page.keyboard.press('q');
  await expect.poll(playing, { intervals: [30, 60, 100] }).toBe(1);
  // The effect lasts a moment of game time. On a machine that draws slowly the
  // game clock runs slower too, so this allows for much more real time.
  await expect.poll(playing, { timeout: 20_000 }).toBe(0);
});

test('defeat is announced and the R key starts a fresh game', async ({ page }) => {
  await clickSlot(page, 1);
  await clickMenuOption(page, 'Arquería');
  await expect.poll(async () => (await snapshot(page)).towers.length).toBe(1);

  await forceDefeat(page);
  await expect.poll(async () => (await snapshot(page)).endTitle).toBe('Derrota');

  await page.keyboard.press('r');
  await expect.poll(async () => (await snapshot(page)).phase).toBe('preparing');
  const fresh = await snapshot(page);
  expect(fresh.lives).toBe(20);
  expect(fresh.towers).toEqual([]);
  expect(fresh.endTitle).toBeNull();
});
