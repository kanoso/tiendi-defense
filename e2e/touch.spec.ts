import { expect, test, type Page } from '@playwright/test';
import {
  allowBranches,
  branchesOf,
  forceDefeat,
  giveGold,
  giveHeroesLevel,
  openGame,
  slotPosition,
  snapshot,
  towerOn,
  towersView,
} from './game';

/* eslint-disable @typescript-eslint/no-explicit-any */

// A phone held sideways, with a finger and no keyboard: every test here only taps.
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

const MAP_WIDTH = 960;
const MAP_HEIGHT = 540;
const GRASS = { x: 620, y: 420 };

interface Point {
  x: number;
  y: number;
}

/** Taps a point given in map coordinates. */
async function tap(page: Page, point: Point): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('The game canvas is not on the page');
  await page.touchscreen.tap(
    box.x + (point.x * box.width) / MAP_WIDTH,
    box.y + (point.y * box.height) / MAP_HEIGHT,
  );
}

type Control =
  | 'wave'
  | 'speed'
  | 'pause'
  | 'sound'
  | 'skip'
  | 'resume'
  | 'pauseMenu'
  | 'retry'
  | 'endMenu';

function control(page: Page, name: Control): Promise<Point> {
  return page.evaluate((key) => {
    const center = (window as any).__game.scene.getScene('game').controls[key].getCenter();
    return { x: center.x, y: center.y };
  }, name);
}

/** `hero` and `ability` count from zero. Without `ability`, the card itself. */
function heroCard(page: Page, hero: number, ability?: number): Promise<Point> {
  return page.evaluate(
    ([heroIndex, abilityIndex]) => {
      const card = (window as any).__game.scene.getScene('game').heroCards.cards[heroIndex];
      const target = abilityIndex === null ? card.title : card.abilityButtons[abilityIndex].frame;
      const center = target.getCenter();
      return { x: center.x, y: center.y };
    },
    [hero, ability ?? null] as const,
  );
}

function menuOption(page: Page, label: string): Promise<Point> {
  return page.evaluate((wanted) => {
    const scene: any = (window as any).__game.scene.getScene('game');
    const entry = scene.towerMenu.entries.find((e: any) => e.text.text.startsWith(wanted));
    const center = entry.text.getCenter();
    return { x: center.x, y: center.y };
  }, label);
}

function isShowing(page: Page, scene: 'menu' | 'game'): Promise<boolean> {
  return page.evaluate((key) => Boolean((window as any).__game?.scene.isActive(key)), scene);
}

function volume(page: Page): Promise<number> {
  return page.evaluate(() => (window as any).__game.scene.getScene('game').sounds.volume);
}

async function startWave(page: Page): Promise<void> {
  await tap(page, await control(page, 'wave'));
  await expect.poll(async () => (await snapshot(page)).enemies).toBeGreaterThan(0);
}

test.beforeEach(async ({ page }) => {
  await openGame(page);
});

test('a whole first turn can be played with taps alone', async ({ page }) => {
  await tap(page, await heroCard(page, 1));
  await expect.poll(async () => (await snapshot(page)).selectedHeroId).toBe(2);

  await tap(page, GRASS);
  await expect
    .poll(async () => Math.abs((await snapshot(page)).heroes[1].targetX - GRASS.x))
    .toBeLessThan(3);

  await tap(page, await slotPosition(page, 1));
  await expect.poll(async () => (await snapshot(page)).menu.length).toBeGreaterThan(0);
  await tap(page, await menuOption(page, 'Arquería'));
  await expect.poll(async () => (await snapshot(page)).towers.length).toBe(1);

  await tap(page, await control(page, 'wave'));
  await expect.poll(async () => (await snapshot(page)).phase).toBe('wave');
});

test('an ability button selects its hero and fires the ability', async ({ page }) => {
  await giveHeroesLevel(page, 2);
  await tap(page, await heroCard(page, 1));
  await startWave(page);

  await tap(page, await heroCard(page, 0, 0));
  await expect.poll(async () => (await snapshot(page)).heroes[0].cast).toBe(true);
  expect((await snapshot(page)).selectedHeroId).toBe(1);
});

test('a targeted ability is aimed with a second tap, or cancelled on its own button', async ({
  page,
}) => {
  await giveHeroesLevel(page, 2);
  await startWave(page);
  const meteor = await heroCard(page, 2, 0);

  await tap(page, meteor);
  await expect.poll(async () => (await snapshot(page)).targetingHeroId).toBe(3);
  await tap(page, meteor);
  await expect.poll(async () => (await snapshot(page)).targetingHeroId).toBeNull();
  expect((await snapshot(page)).heroes[2].cast).toBe(false);

  await tap(page, meteor);
  await tap(page, { x: 250, y: 200 });
  await expect.poll(async () => (await snapshot(page)).heroes[2].cast).toBe(true);
});

test('a locked ability button explains itself', async ({ page }) => {
  await startWave(page);
  await tap(page, await heroCard(page, 0, 1));
  await expect.poll(async () => (await snapshot(page)).notice).toContain('nivel 4');
});

test('the pause button freezes the game and offers to continue', async ({ page }) => {
  await tap(page, await control(page, 'pause'));
  await expect.poll(async () => (await snapshot(page)).paused).toBe(true);

  await tap(page, await control(page, 'resume'));
  await expect.poll(async () => (await snapshot(page)).paused).toBe(false);
});

test('the pause screen leads back to the map picker', async ({ page }) => {
  await tap(page, await control(page, 'pause'));
  await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
  await tap(page, await control(page, 'pauseMenu'));
  await expect.poll(() => isShowing(page, 'menu')).toBe(true);
});

test('the speed and sound buttons do what their keys do', async ({ page }) => {
  await tap(page, await control(page, 'speed'));
  await expect.poll(async () => (await snapshot(page)).speed).toBe(2);

  await tap(page, await control(page, 'sound'));
  await expect.poll(() => volume(page)).toBeLessThan(1);
});

test('the tutorial can be skipped with its button, leaving touch instructions', async ({
  page,
}) => {
  expect((await snapshot(page)).hint).toContain('1/5');
  await tap(page, await control(page, 'skip'));
  await expect.poll(async () => (await snapshot(page)).hint).toContain('Toca un héroe');
});

test('after a defeat the game can be retried', async ({ page }) => {
  await forceDefeat(page);
  await expect.poll(async () => (await snapshot(page)).endTitle).toBe('Derrota');
  await tap(page, await control(page, 'retry'));
  await expect.poll(async () => (await snapshot(page)).phase).toBe('preparing');
  expect((await snapshot(page)).lives).toBe(20);
});

test('after a defeat the player can go back to the map picker', async ({ page }) => {
  await forceDefeat(page);
  await expect.poll(async () => (await snapshot(page)).endTitle).toBe('Derrota');
  await tap(page, await control(page, 'endMenu'));
  await expect.poll(() => isShowing(page, 'menu')).toBe(true);
});

test('a tap on the map after the game ended does not restart it by accident', async ({ page }) => {
  await forceDefeat(page);
  await expect.poll(async () => (await snapshot(page)).endTitle).toBe('Derrota');
  await tap(page, GRASS);
  await page.waitForTimeout(300);
  expect((await snapshot(page)).endTitle).toBe('Derrota');
});

test('a tower is specialized and upgraded within its branch with taps alone', async ({ page }) => {
  const SLOW = { timeout: 20_000 };
  const slot = await slotPosition(page, 1);
  const towerLevel = () => towerOn(page, 1);
  /** Taps the slot once the menu from the last tap has closed, and waits for the new one. */
  const openMenu = async () => {
    await expect.poll(async () => (await snapshot(page)).menu.length, SLOW).toBe(0);
    await tap(page, slot);
    await expect.poll(async () => (await snapshot(page)).menu.length, SLOW).toBeGreaterThan(0);
  };
  await allowBranches(page);
  await giveGold(page, 5000);

  await openMenu();
  await tap(page, await menuOption(page, 'Arquería'));
  await expect.poll(async () => (await towerLevel())?.level, SLOW).toBe(0);
  for (const level of [1, 2]) {
    await openMenu();
    await tap(page, await menuOption(page, 'Mejorar'));
    await expect.poll(async () => (await towerLevel())?.level, SLOW).toBe(level);
  }

  await openMenu();
  const [, rain] = await branchesOf(page, 'archery');
  // Branch buttons are big enough for a finger: over 40 px tall on this small screen.
  const entry = (await towersView(page)).menu.find((option) => option.label.startsWith(rain.name))!;
  const box = (await page.locator('canvas').boundingBox())!;
  expect((entry.height * box.height) / MAP_HEIGHT).toBeGreaterThan(40);

  const gold = (await snapshot(page)).gold;
  await tap(page, await menuOption(page, rain.name));
  await expect.poll(async () => (await towerLevel())?.branch, SLOW).toBe(rain.id);
  expect((await snapshot(page)).gold).toBe(gold - rain.costs[0]);

  await openMenu();
  await tap(page, await menuOption(page, 'Mejorar'));
  await expect.poll(async () => (await towerLevel())?.level, SLOW).toBe(4);
  expect(await towerLevel()).toMatchObject({ branch: rain.id, level: 4 });
  expect((await snapshot(page)).gold).toBe(gold - rain.costs[0] - rain.costs[1]);
});

test('a blocked spot is cleared and built on with taps alone', async ({ page }) => {
  const SLOW = { timeout: 20_000 };
  const spots = async () => (await towersView(page)).spots;
  const [, , third] = await spots();
  const archery = await page.evaluate(
    () => (window as any).__game.scene.getScene('game').level.towerTypes.archery.levels[0].cost as number,
  );
  await giveGold(page, third.cost + archery);

  await tap(page, third);
  await expect.poll(async () => (await snapshot(page)).menu, SLOW).toEqual([`Despejar  ${third.cost}`]);
  // A big button, easy to hit with a finger: over 40 px tall on this small screen.
  const [entry] = (await towersView(page)).menu;
  const box = (await page.locator('canvas').boundingBox())!;
  expect((entry.height * box.height) / MAP_HEIGHT).toBeGreaterThan(40);

  await tap(page, await menuOption(page, 'Despejar'));
  await expect
    .poll(async () => (await spots()).find((spot) => spot.slot === third.slot), SLOW)
    .toMatchObject({ rocks: false, price: null, ring: true });
  expect((await snapshot(page)).gold).toBe(archery);

  await expect.poll(async () => (await snapshot(page)).menu.length, SLOW).toBe(0);
  await tap(page, third);
  await expect.poll(async () => (await snapshot(page)).menu.length, SLOW).toBeGreaterThan(0);
  await tap(page, await menuOption(page, 'Arquería'));
  await expect.poll(async () => (await towerOn(page, third.slot))?.type, SLOW).toBe('archery');
  expect((await snapshot(page)).gold).toBe(0);
});

test('a map is picked from the menu with a tap', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => isShowing(page, 'menu')).toBe(true);
  await page.waitForFunction(() => (window as any).__game.scene.getScene('menu').cards.length > 0);
  const card = await page.evaluate(() => (window as any).__game.scene.getScene('menu').cards[0]);
  await tap(page, card);
  await expect.poll(() => isShowing(page, 'game')).toBe(true);
});

test.describe('held upright', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a phone held upright is asked to turn', async ({ page }) => {
    await expect(page.locator('#rotate')).toBeVisible();
  });
});

test('a phone held sideways is not asked to turn', async ({ page }) => {
  await expect(page.locator('#rotate')).toBeHidden();
});
