import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { clickMap } from './game';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Keeping progress under a player code, across two devices (two separate
// browsers), against the real server, which also serves the game.

const SERVER = process.env.COOP_SERVER ?? `http://localhost:${process.env.COOP_PORT ?? 8790}`;
const PROGRESS_KEY = 'tower-defense-heroes.progress';

test.describe.configure({ mode: 'default' });

const opened: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

/** A device, optionally with progress it earned before, on the menu. */
async function openDevice(browser: Browser, stars: Record<string, number> = {}): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  opened.push(context);
  const page = await context.newPage();
  if (Object.keys(stars).length > 0) {
    await page.addInitScript(
      ([key, value]) => {
        // Only the first visit starts from this; later reloads keep what was saved.
        if (!sessionStorage.getItem('seeded')) {
          localStorage.setItem(key, value);
          sessionStorage.setItem('seeded', '1');
        }
      },
      [PROGRESS_KEY, JSON.stringify({ version: 1, stars })] as const,
    );
  }
  await page.goto(SERVER);
  await waitForAccountButton(page);
  return page;
}

function waitForAccountButton(page: Page): Promise<unknown> {
  return page.waitForFunction(() => {
    const menu = (window as any).__game?.scene.getScene('menu');
    return menu?.scene.isActive() && menu.accountButton != null;
  });
}

async function openPanel(page: Page): Promise<void> {
  const button = await page.evaluate(() => (window as any).__game.scene.getScene('menu').accountButton);
  await clickMap(page, button.x, button.y);
  await expect(page.locator('#account')).toBeVisible();
}

/** Stars the menu shows on each map. */
function mapStars(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() =>
    Object.fromEntries(
      (window as any).__game.scene.getScene('menu').cards.map((card: any) => [card.mapId, card.stars]),
    ),
  );
}

async function createCode(page: Page): Promise<string> {
  await openPanel(page);
  await page.locator('#account-create').click();
  await expect(page.locator('#account-code')).toHaveText(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  return (await page.locator('#account-code').textContent()) ?? '';
}

test('a code keeps the progress, and another device gets it by typing the code', async ({ browser }) => {
  const phone = await openDevice(browser, { meadow: 3, canyon: 2 });
  const code = await createCode(phone);

  const computer = await openDevice(browser);
  expect((await mapStars(computer)).meadow).toBe(0);
  await openPanel(computer);
  await computer.locator('#account-code-input').fill(code.toLowerCase());
  await computer.locator('#account-link').click();
  await expect(computer.locator('#account-code')).toHaveText(code);
  await computer.locator('#account-close').click();

  await expect.poll(() => mapStars(computer)).toMatchObject({ meadow: 3, canyon: 2 });
});

test('a victory on one device reaches the other one', async ({ browser }) => {
  const phone = await openDevice(browser, { meadow: 1 });
  const code = await createCode(phone);
  const computer = await openDevice(browser);
  await openPanel(computer);
  await computer.locator('#account-code-input').fill(code);
  await computer.locator('#account-link').click();
  await expect(computer.locator('#account-code')).toHaveText(code);

  // The phone wins the second map.
  await phone.goto(`${SERVER}/?map=canyon`);
  await phone.waitForFunction(() => (window as any).__game?.scene.getScene('game')?.towerMenu);
  await phone.evaluate(() => {
    (window as any).__game.scene.getScene('game').game_.phase = 'won';
  });
  // Saved progress travels to the server shortly after; the computer sees it
  // the next time its menu opens, so it looks again until it is there.
  await expect(async () => {
    await computer.reload();
    await waitForAccountButton(computer);
    expect(await mapStars(computer)).toMatchObject({ meadow: 1, canyon: 3 });
  }).toPass({ timeout: 30_000 });
});

test('the menu button shows the code is in use once the panel is closed', async ({ browser }) => {
  const page = await openDevice(browser);
  await createCode(page);
  await page.locator('#account-close').click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const menu = (window as any).__game.scene.getScene('menu');
        return menu.children.list.some((child: any) => child.text === 'Mi código');
      }),
      // The menu first brings the progress up to date, over the network.
      { timeout: 15_000 },
    )
    .toBe(true);
});

test('a code that matches nothing is explained, and not kept', async ({ browser }) => {
  const page = await openDevice(browser);
  await openPanel(page);
  await page.locator('#account-code-input').fill('AAAA-BBBB');
  await page.locator('#account-link').click();
  await expect(page.locator('#account-error')).toContainText('No hay ningún avance');
  await expect(page.locator('#account-code')).toHaveCount(0);
});

test('while the panel is open, typing does not start a map', async ({ browser }) => {
  const page = await openDevice(browser);
  await openPanel(page);
  await page.locator('#account-code-input').fill('1');
  await page.keyboard.press('1');
  expect(await page.evaluate(() => (window as any).__game.scene.isActive('game'))).toBe(false);
});
