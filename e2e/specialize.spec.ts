import { expect, test, type Page } from '@playwright/test';
import { FROZEN_TINT } from '../src/entities/styles';
import {
  baseCosts,
  branchesOf,
  clickMenuOption,
  clickSlot,
  giveGold,
  openGame,
  snapshot,
  towerOn,
  towersView,
} from './game';

// Towers at their third level choose one of two branches from their menu.

const SLOT = 1;
/** Waiting on a busy build machine: game ticks can come slowly. */
const SLOW = { timeout: 20_000 };

test.beforeEach(async ({ page }) => {
  await openGame(page);
});

/** Opens the slot's menu once the previous one has closed. */
async function openMenu(page: Page): Promise<void> {
  await expect.poll(async () => (await snapshot(page)).menu.length, SLOW).toBe(0);
  await clickSlot(page, SLOT);
  await expect.poll(async () => (await snapshot(page)).menu.length, SLOW).toBeGreaterThan(0);
}

/** Builds a tower and takes it to its third level by its menu. */
async function buildToThird(page: Page, tower: string, label: string): Promise<void> {
  await openMenu(page);
  await clickMenuOption(page, label);
  await expect.poll(async () => (await towerOn(page, SLOT))?.type, SLOW).toBe(tower);
  for (const level of [1, 2]) {
    await openMenu(page);
    await clickMenuOption(page, 'Mejorar');
    await expect.poll(async () => (await towerOn(page, SLOT))?.level, SLOW).toBe(level);
  }
}

test('a third level tower offers its two branches and takes one by click, then upgrades within it', async ({ page }) => {
  await giveGold(page, 5000);
  await buildToThird(page, 'archery', 'Arquería');
  const [ballesta, lluvia] = await branchesOf(page, 'archery');

  await openMenu(page);
  const menu = (await snapshot(page)).menu;
  expect(menu).toHaveLength(3);
  expect(menu[0]).toBe(`${ballesta.name}  ${ballesta.costs[0]}`);
  expect(menu[1]).toBe(`${lluvia.name}  ${lluvia.costs[0]}`);
  expect(menu[2]).toMatch(/^Vender/);

  const before = await snapshot(page);
  await clickMenuOption(page, ballesta.name);
  await expect.poll(async () => (await towerOn(page, SLOT))?.branch, SLOW).toBe(ballesta.id);
  expect(await towerOn(page, SLOT)).toMatchObject({ level: 3, branch: ballesta.id });
  expect((await snapshot(page)).gold).toBe(before.gold - ballesta.costs[0]);

  // The level number now sits on a badge in the branch colour.
  const [badge] = (await towersView(page)).towers;
  expect(badge).toMatchObject({ slot: SLOT, branch: ballesta.id, badgeText: '4' });
  expect(badge.badgeColor).not.toBeNull();

  await openMenu(page);
  expect((await snapshot(page)).menu[0]).toBe(`Mejorar  ${ballesta.costs[1]}`);
  await clickMenuOption(page, 'Mejorar');
  await expect.poll(async () => (await towerOn(page, SLOT))?.level, SLOW).toBe(4);
  expect((await snapshot(page)).gold).toBe(before.gold - ballesta.costs[0] - ballesta.costs[1]);

  // At the top only selling is left.
  await openMenu(page);
  const top = (await snapshot(page)).menu;
  expect(top).toHaveLength(1);
  expect(top[0]).toMatch(/^Vender/);
});

test('a branch the player cannot afford says how much gold is missing and is not taken', async ({ page }) => {
  // Exactly enough to build the tower and take it to its third level.
  const toThird = (await baseCosts(page, 'archery')).reduce((sum, cost) => sum + cost, 0);
  await giveGold(page, toThird);
  await buildToThird(page, 'archery', 'Arquería');
  const [ballesta] = await branchesOf(page, 'archery');
  expect((await snapshot(page)).gold).toBe(0);

  await openMenu(page);
  const { menu } = await towersView(page);
  expect(menu[0].reason).toBe(`Faltan ${ballesta.costs[0]} de oro`);
  // Selling needs no gold, so it gives no reason.
  expect(menu[menu.length - 1].reason).toBeNull();

  await clickMenuOption(page, ballesta.name);
  // Give the game time to apply anything it was sent: a dozen ticks.
  const tick = (await snapshot(page)).tick;
  await expect.poll(async () => (await snapshot(page)).tick, SLOW).toBeGreaterThan(tick + 12);
  expect(await towerOn(page, SLOT)).toMatchObject({ level: 2, branch: null });
  expect((await snapshot(page)).menu.length).toBeGreaterThan(0);
});

test('a frozen enemy is drawn icy blue until it thaws', async ({ page }) => {
  await giveGold(page, 5000);
  await buildToThird(page, 'ice', 'Hielo');
  await openMenu(page);
  await clickMenuOption(page, 'Escarcha');
  await expect.poll(async () => (await towerOn(page, SLOT))?.branch, SLOW).toBe('escarcha');

  await page.keyboard.press('Space');
  const frozenTints = async () => (await towersView(page)).frozen.map((enemy) => enemy.tint);
  await expect.poll(frozenTints, { timeout: 60_000 }).toContain(FROZEN_TINT);
});
