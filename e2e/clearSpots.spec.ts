import { expect, test, type Page } from '@playwright/test';
import { baseCosts, clickMenuOption, clickSlot, giveGold, openGame, snapshot, towerOn, towersView } from './game';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Every map has spots blocked by rocks: paying their price clears them, and
// from then on they take a tower like any other slot.

/** Waiting on a busy build machine: game ticks can come slowly. */
const SLOW = { timeout: 20_000 };

test.beforeEach(async ({ page }) => {
  await openGame(page);
});

/** Opens a slot's menu once the previous one has closed. */
async function openMenu(page: Page, slot: number): Promise<void> {
  await expect.poll(async () => (await snapshot(page)).menu.length, SLOW).toBe(0);
  await clickSlot(page, slot);
  await expect.poll(async () => (await snapshot(page)).menu.length, SLOW).toBeGreaterThan(0);
}

async function spot(page: Page, slot: number) {
  return (await towersView(page)).spots.find((candidate) => candidate.slot === slot)!;
}

test('the map shows four spots blocked by rocks, each with its price', async ({ page }) => {
  const { spots } = await towersView(page);
  expect(spots).toHaveLength(4);
  for (const blocked of spots) {
    expect(blocked).toMatchObject({ rocks: true, price: String(blocked.cost), ring: false });
  }
});

test('a blocked spot is cleared by click, then a tower is built on it', async ({ page }) => {
  const [first] = (await towersView(page)).spots;
  const [archery] = await baseCosts(page, 'archery');
  await giveGold(page, first.cost + archery);

  await openMenu(page, first.slot);
  expect((await snapshot(page)).menu).toEqual([`Despejar  ${first.cost}`]);
  expect((await towersView(page)).menu[0].reason).toBeNull();

  await clickMenuOption(page, 'Despejar');
  await expect.poll(async () => (await spot(page, first.slot)).ring, SLOW).toBe(true);
  // The rocks fade out over a few ticks, then they are gone.
  await expect.poll(async () => (await spot(page, first.slot)).rocks, SLOW).toBe(false);
  expect(await spot(page, first.slot)).toMatchObject({ price: null });
  expect((await snapshot(page)).gold).toBe(archery);

  // Now it is an empty slot like any other.
  await openMenu(page, first.slot);
  expect((await snapshot(page)).menu[0]).toBe(`Arquería  ${archery}`);
  await clickMenuOption(page, 'Arquería');
  await expect.poll(async () => (await towerOn(page, first.slot))?.type, SLOW).toBe('archery');
  expect((await snapshot(page)).gold).toBe(0);
});

test('a blocked spot the player cannot afford says how much gold is missing and stays blocked', async ({ page }) => {
  const [, second] = (await towersView(page)).spots;
  await giveGold(page, second.cost - 1);
  await expect.poll(async () => (await spot(page, second.slot)).priceAlpha, SLOW).toBeLessThan(1);

  await openMenu(page, second.slot);
  const { menu } = await towersView(page);
  expect(menu.map((option) => option.label)).toEqual([`Despejar  ${second.cost}`]);
  expect(menu[0].reason).toBe('Faltan 1 de oro');

  await clickMenuOption(page, 'Despejar');
  // Give the game time to apply anything it was sent: a dozen ticks.
  const tick = (await snapshot(page)).tick;
  await expect.poll(async () => (await snapshot(page)).tick, SLOW).toBeGreaterThan(tick + 12);
  expect(await spot(page, second.slot)).toMatchObject({ rocks: true, ring: false });
  expect((await snapshot(page)).gold).toBe(second.cost - 1);
  expect((await snapshot(page)).menu.length).toBeGreaterThan(0);
});

/** Test setup only: applies an order as if another player had given it, through the game itself. */
function orderFromSomeoneElse(page: Page, command: object): Promise<void> {
  return page.evaluate((order) => {
    const scene = (window as any).__game.scene.getScene('game');
    scene.pendingCommands.push(order);
  }, command);
}

test('an open menu is redrawn when the slot changes under it, so it never offers what would do nothing', async ({
  page,
}) => {
  const [first] = (await towersView(page)).spots;
  const [archery] = await baseCosts(page, 'archery');
  await giveGold(page, first.cost + archery);

  // Someone else clears the spot while this player looks at its menu.
  await openMenu(page, first.slot);
  await orderFromSomeoneElse(page, { type: 'clearSlot', slot: first.slot });
  await expect.poll(async () => (await snapshot(page)).menu[0], SLOW).toBe(`Arquería  ${archery}`);

  // Then builds on it: the menu now offers what can be done with that tower.
  await orderFromSomeoneElse(page, { type: 'buildTower', slot: first.slot, tower: 'archery' });
  await expect.poll(async () => (await snapshot(page)).menu.at(-1), SLOW).toMatch(/^Vender/);
  expect((await snapshot(page)).menu.some((label) => label.startsWith('Arquería'))).toBe(false);
});
