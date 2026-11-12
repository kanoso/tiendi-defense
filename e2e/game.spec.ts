import { expect, test } from '@playwright/test';
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
