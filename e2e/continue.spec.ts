import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { clickMap, clickMenuOption, clickSlot, snapshot } from './game';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Picking up a game left between waves: on the same device, and on another
// one through the player's account. Run against the real server.

const SERVER = process.env.COOP_SERVER ?? `http://localhost:${process.env.COOP_PORT ?? 8790}`;

test.describe.configure({ mode: 'default' });

const opened: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

async function newDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  opened.push(context);
  return context.newPage();
}

function waitForMenu(page: Page): Promise<unknown> {
  return page.waitForFunction(() => {
    const menu = (window as any).__game?.scene.getScene('menu');
    return menu?.scene.isActive() && menu.cards.length > 0;
  });
}

function waitForGame(page: Page): Promise<unknown> {
  return page.waitForFunction(() => {
    const game = (window as any).__game;
    return game?.scene.isActive('game') && Boolean(game.scene.getScene('game').towerMenu);
  });
}

/** Test setup only: ends the wave on screen at once, as if every enemy had fallen. */
async function finishWave(page: Page): Promise<void> {
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).phase).toBe('wave');
  await page.evaluate(() => {
    const game = (window as any).__game.scene.getScene('game').game_;
    game.spawnQueue = [];
    game.enemies = [];
  });
  await expect.poll(async () => (await snapshot(page)).phase).toBe('preparing');
}

function continueButton(page: Page): Promise<{ x: number; y: number; label: string } | null> {
  return page.evaluate(() => (window as any).__game.scene.getScene('menu').continueButton);
}

test('a game left after a wave is picked up from the menu where it was', async ({ browser }) => {
  const page = await newDevice(browser);
  await page.goto(`${SERVER}/?map=meadow`);
  await waitForGame(page);
  await page.keyboard.press('t');
  await clickSlot(page, 1);
  await clickMenuOption(page, 'Arquería');
  await finishWave(page);
  const before = await snapshot(page);
  expect(before.wave).toBe(2);

  await page.goto(SERVER);
  await waitForMenu(page);
  await expect.poll(() => continueButton(page)).toMatchObject({ label: 'Continuar · Pradera · 2/20' });
  const button = (await continueButton(page))!;
  await clickMap(page, button.x, button.y);
  await waitForGame(page);

  const after = await snapshot(page);
  expect(after.wave).toBe(2);
  expect(after.gold).toBe(before.gold);
  expect(after.towers).toEqual(before.towers);
  expect(after.phase).toBe('preparing');
});

test('leaving in the middle of a wave goes back to the start of that wave', async ({ browser }) => {
  const page = await newDevice(browser);
  await page.goto(`${SERVER}/?map=meadow`);
  await waitForGame(page);
  await finishWave(page);
  const between = await snapshot(page);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).phase).toBe('wave');

  await page.goto(SERVER);
  await waitForMenu(page);
  await expect.poll(() => continueButton(page)).not.toBeNull();
  await page.keyboard.press('c');
  await waitForGame(page);
  const resumed = await snapshot(page);
  expect(resumed.phase).toBe('preparing');
  expect(resumed.wave).toBe(between.wave);
  expect(resumed.lives).toBe(between.lives);
});

test('a game that ends is no longer offered', async ({ browser }) => {
  const page = await newDevice(browser);
  await page.goto(`${SERVER}/?map=meadow`);
  await waitForGame(page);
  await finishWave(page);
  await page.evaluate(() => {
    const game = (window as any).__game.scene.getScene('game').game_;
    game.lives = 0;
    game.phase = 'lost';
  });
  await expect.poll(async () => (await snapshot(page)).endTitle).toBe('Derrota');

  await page.goto(SERVER);
  await waitForMenu(page);
  await page.waitForTimeout(1500);
  expect(await continueButton(page)).toBeNull();
});

test('a game left on one device is picked up on another with the same code', async ({ browser }) => {
  test.setTimeout(90_000);
  const phone = await newDevice(browser);
  await phone.goto(SERVER);
  await waitForMenu(phone);
  await phone.waitForFunction(() => (window as any).__game.scene.getScene('menu').accountButton != null);
  const accountButton = await phone.evaluate(() => (window as any).__game.scene.getScene('menu').accountButton);
  await clickMap(phone, accountButton.x, accountButton.y);
  await phone.locator('#account-create').click();
  const code = (await phone.locator('#account-code').textContent()) ?? '';
  await phone.locator('#account-close').click();

  await phone.goto(`${SERVER}/?map=canyon&difficulty=hard`);
  await waitForGame(phone);
  await finishWave(phone);
  await finishWave(phone);

  const computer = await newDevice(browser);
  await computer.goto(SERVER);
  await waitForMenu(computer);
  await computer.waitForFunction(() => (window as any).__game.scene.getScene('menu').accountButton != null);
  const button = await computer.evaluate(() => (window as any).__game.scene.getScene('menu').accountButton);
  await clickMap(computer, button.x, button.y);
  await computer.locator('#account-code-input').fill(code);
  await computer.locator('#account-link').click();
  await expect(computer.locator('#account-code')).toHaveText(code);
  await computer.locator('#account-close').click();

  await expect
    .poll(() => continueButton(computer), { timeout: 15_000 })
    .toMatchObject({ label: 'Continuar · Desfiladero · 3/20' });
});
