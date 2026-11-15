import { expect, test, type Page } from '@playwright/test';
import { clickMap } from './game';

/* eslint-disable @typescript-eslint/no-explicit-any */

// The map picker holds five maps but shows three at a time, at full size. The
// player moves along with the arrow buttons, a swipe or drag, or the arrow keys.

const PROGRESS_KEY = 'tower-defense-heroes.progress';
const MAP_WIDTH = 960;
const MAP_HEIGHT = 540;

interface Point {
  x: number;
  y: number;
}

interface Card extends Point {
  mapId: string;
  unlocked: boolean;
  visible: boolean;
}

interface Carousel {
  first: number;
  shown: number;
  total: number;
  moving: boolean;
  dots: boolean[];
  prev: Point & { enabled: boolean; width: number; height: number };
  next: Point & { enabled: boolean; width: number; height: number };
}

function isShowing(page: Page, scene: 'menu' | 'game'): Promise<boolean> {
  return page.evaluate((key) => Boolean((window as any).__game?.scene.isActive(key)), scene);
}

async function openMenu(page: Page): Promise<void> {
  await page.goto('/');
  await expect.poll(() => isShowing(page, 'menu')).toBe(true);
  await page.waitForFunction(() => (window as any).__game.scene.getScene('menu').cards.length > 0);
}

function cards(page: Page): Promise<Card[]> {
  return page.evaluate(() => (window as any).__game.scene.getScene('menu').cards);
}

function carousel(page: Page): Promise<Carousel> {
  return page.evaluate(() => (window as any).__game.scene.getScene('menu').carousel);
}

/** Waits until the cards have stopped sliding and shows the first one on screen. */
async function settledOn(page: Page, first: number): Promise<void> {
  await expect.poll(async () => {
    const state = await carousel(page);
    return state.moving ? -1 : state.first;
  }).toBe(first);
}

function frame(page: Page): Promise<number> {
  return page.evaluate(() => (window as any).__game.loop.frame);
}

/**
 * Asserts that a press made after game frame `since` opened no map. Input and
 * scene changes are handled on the game's next steps, so a few frames on, with
 * the cards at rest, anything the press set off has happened.
 */
async function expectNothingOpened(page: Page, since: number): Promise<void> {
  await expect.poll(() => frame(page)).toBeGreaterThanOrEqual(since + 5);
  await expect.poll(async () => (await carousel(page)).moving).toBe(false);
  expect(await isShowing(page, 'menu')).toBe(true);
  expect(await isShowing(page, 'game')).toBe(false);
}

function visibleIds(page: Page): Promise<string[]> {
  return cards(page).then((all) => all.filter((card) => card.visible).map((card) => card.mapId));
}

/** Test setup only: saves stars as if those maps had been won earlier. */
async function giveProgress(page: Page, stars: Record<string, number>): Promise<void> {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [PROGRESS_KEY, JSON.stringify({ version: 1, stars })] as const,
  );
}

async function screenPoint(page: Page, point: Point): Promise<Point> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('The game canvas is not on the page');
  return { x: box.x + (point.x * box.width) / MAP_WIDTH, y: box.y + (point.y * box.height) / MAP_HEIGHT };
}

function isGameOn(page: Page, mapId: string): Promise<boolean> {
  return page.evaluate((id) => {
    const game: any = (window as any).__game;
    return game.scene.isActive('game') && game.scene.getScene('game').map?.id === id;
  }, mapId);
}

test.describe('the map carousel on a desktop', () => {
  test('shows the first three of five maps, full size, with a way to the others', async ({ page }) => {
    await openMenu(page);
    const all = await cards(page);
    expect(all.map((card) => card.mapId)).toEqual(['meadow', 'canyon', 'crossroads', 'swamp', 'fortress']);
    expect(all.map((card) => card.unlocked)).toEqual([true, false, false, false, false]);
    expect(await visibleIds(page)).toEqual(['meadow', 'canyon', 'crossroads']);
    const state = await carousel(page);
    expect(state).toMatchObject({ first: 0, shown: 3, total: 5, dots: [true, true, true, false, false] });
    expect(state.prev.enabled).toBe(false);
    expect(state.next.enabled).toBe(true);
  });

  test('the arrow buttons move one map at a time and stop at the ends', async ({ page }) => {
    await openMenu(page);
    for (const first of [1, 2]) {
      await clickMap(page, (await carousel(page)).next.x, (await carousel(page)).next.y);
      await settledOn(page, first);
    }
    expect(await visibleIds(page)).toEqual(['crossroads', 'swamp', 'fortress']);
    expect((await carousel(page)).next.enabled).toBe(false);
    expect((await carousel(page)).dots).toEqual([false, false, true, true, true]);

    await clickMap(page, (await carousel(page)).prev.x, (await carousel(page)).prev.y);
    await settledOn(page, 1);
    expect(await visibleIds(page)).toEqual(['canyon', 'crossroads', 'swamp']);
  });

  test('the arrow keys move it too', async ({ page }) => {
    await openMenu(page);
    await page.keyboard.press('ArrowRight');
    await settledOn(page, 1);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await settledOn(page, 2);
    await page.keyboard.press('ArrowLeft');
    await settledOn(page, 1);
  });

  test('a drag with the mouse moves it, and does not open the map under it', async ({ page }) => {
    await openMenu(page);
    const [first] = await cards(page);
    const from = await screenPoint(page, first);
    const to = await screenPoint(page, { x: first.x - 200, y: first.y });
    const before = await frame(page);
    await page.mouse.move(from.x + 150, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x + 150, to.y, { steps: 8 });
    await page.mouse.up();
    await settledOn(page, 1);
    await expectNothingOpened(page, before);
  });

  test('locked maps further along stay in view, dimmed and closed', async ({ page }) => {
    await openMenu(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await settledOn(page, 2);
    const fortress = (await cards(page)).find((card) => card.mapId === 'fortress')!;
    expect(fortress).toMatchObject({ unlocked: false, visible: true });
    const before = await frame(page);
    await clickMap(page, fortress.x, fortress.y);
    await expectNothingOpened(page, before);
  });

  test('opens on the newest map unlocked, and a visible card is clicked as before', async ({ page }) => {
    await giveProgress(page, { meadow: 3, canyon: 2, crossroads: 1 });
    await openMenu(page);
    await settledOn(page, 2);
    const swamp = (await cards(page)).find((card) => card.mapId === 'swamp')!;
    expect(swamp).toMatchObject({ unlocked: true, visible: true });
    await clickMap(page, swamp.x, swamp.y);
    await expect.poll(() => isGameOn(page, 'swamp')).toBe(true);
  });

  test('number keys open a map directly, even one scrolled out of view', async ({ page }) => {
    await giveProgress(page, { meadow: 3, canyon: 2, crossroads: 1, swamp: 1 });
    await openMenu(page);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await settledOn(page, 0);
    expect(await visibleIds(page)).not.toContain('fortress');
    await page.keyboard.press('5');
    await expect.poll(() => isGameOn(page, 'fortress')).toBe(true);
  });
});

test.describe('the map carousel on a phone held sideways', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  async function tap(page: Page, point: Point): Promise<void> {
    const at = await screenPoint(page, point);
    await page.touchscreen.tap(at.x, at.y);
  }

  /** A finger sliding across the screen, sent as real touch events. */
  async function swipe(page: Page, from: Point, to: Point): Promise<void> {
    const start = await screenPoint(page, from);
    const end = await screenPoint(page, to);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (let i = 1; i <= 8; i++) {
      const x = start.x + ((end.x - start.x) * i) / 8;
      const y = start.y + ((end.y - start.y) * i) / 8;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  }

  test('keeps cards and arrows big enough for a finger', async ({ page }) => {
    await openMenu(page);
    const box = (await page.locator('canvas').boundingBox())!;
    const scale = box.width / MAP_WIDTH;
    const state = await carousel(page);
    expect(state.shown).toBe(3);
    for (const arrow of [state.prev, state.next]) {
      expect(arrow.width * scale).toBeGreaterThanOrEqual(40);
      expect(arrow.height * scale).toBeGreaterThanOrEqual(40);
    }
    // The cards keep their desktop size: only fewer of them are shown.
    expect(270 * scale).toBeGreaterThan(180);
  });

  test('the arrow buttons are tapped to move along', async ({ page }) => {
    await openMenu(page);
    await tap(page, (await carousel(page)).next);
    await settledOn(page, 1);
    const before = await frame(page);
    await tap(page, (await carousel(page)).prev);
    await settledOn(page, 0);
    // The tap ended over the card the arrow slid back under it: that card stays shut.
    await expectNothingOpened(page, before);
  });

  test('a swipe moves it either way, without opening the map under the finger', async ({ page }) => {
    await openMenu(page);
    const [first] = await cards(page);
    const before = await frame(page);
    await swipe(page, { x: first.x + 100, y: first.y }, { x: first.x - 100, y: first.y });
    await settledOn(page, 1);
    await swipe(page, { x: first.x + 100, y: first.y }, { x: first.x - 100, y: first.y });
    await settledOn(page, 2);
    await expectNothingOpened(page, before);
    await swipe(page, { x: first.x - 100, y: first.y }, { x: first.x + 100, y: first.y });
    await settledOn(page, 1);
  });

  test('map 4 is tapped open once map 3 is won', async ({ page }) => {
    await giveProgress(page, { meadow: 3, canyon: 2, crossroads: 1 });
    await openMenu(page);
    await settledOn(page, 2);
    const swamp = (await cards(page)).find((card) => card.mapId === 'swamp')!;
    await tap(page, swamp);
    await expect.poll(() => isGameOn(page, 'swamp')).toBe(true);
  });
});
