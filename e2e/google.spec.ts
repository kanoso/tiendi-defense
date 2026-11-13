import { randomUUID, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { E2E_GOOGLE_CLIENT_ID, E2E_GOOGLE_PRIVATE_KEY } from '../playwright.config';
import { clickMap } from './game';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Signing in with Google, from the button to the saved progress, against the
// real server. Google itself is stood in for: its script is replaced by one
// whose button hands back a token signed with the test key the server trusts.

const SERVER = `http://localhost:${process.env.COOP_PORT ?? 8790}`;
const PROGRESS_KEY = 'tower-defense-heroes.progress';

test.describe.configure({ mode: 'default' });

const opened: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

/** A token as Google would give it for this game, for the account `sub`. */
function googleToken(sub: string, name = 'Ana Pérez'): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'RS256', kid: 'e2e-key', typ: 'JWT' });
  const payload = encode({
    iss: 'https://accounts.google.com',
    aud: E2E_GOOGLE_CLIENT_ID,
    sub,
    name,
    iat: now,
    exp: now + 3600,
  });
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), readFileSync(E2E_GOOGLE_PRIVATE_KEY));
  return `${header}.${payload}.${signature.toString('base64url')}`;
}

/** Google's script, replaced: its button signs in with the token the test sets. */
const FAKE_GOOGLE = `
window.google = { accounts: { id: {
  initialize(options) { window.__googleOptions = options; },
  renderButton(parent) {
    const button = document.createElement('button');
    button.id = 'fake-google';
    button.textContent = 'Continuar con Google';
    button.onclick = () => window.__googleOptions.callback({ credential: window.__googleCredential });
    parent.append(button);
  },
  disableAutoSelect() { window.__googleForgot = true; },
} } };`;

interface Device {
  page: Page;
  /** Requests made to Google, to check nobody is sent there without a reason. */
  googleRequests: string[];
}

async function openDevice(browser: Browser, sub: string, stars: Record<string, number> = {}): Promise<Device> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  opened.push(context);
  const page = await context.newPage();
  const googleRequests: string[] = [];
  await page.route('https://accounts.google.com/**', (route) => {
    googleRequests.push(route.request().url());
    return route.fulfill({ contentType: 'text/javascript', body: FAKE_GOOGLE });
  });
  await page.addInitScript(
    ([key, value, credential]) => {
      (window as any).__googleCredential = credential;
      if (value && !sessionStorage.getItem('seeded')) {
        localStorage.setItem(key, value);
        sessionStorage.setItem('seeded', '1');
      }
    },
    [PROGRESS_KEY, Object.keys(stars).length ? JSON.stringify({ version: 1, stars }) : '', googleToken(sub)] as const,
  );
  await page.goto(SERVER);
  await page.waitForFunction(() => {
    const menu = (window as any).__game?.scene.getScene('menu');
    return menu?.scene.isActive() && menu.accountButton != null;
  });
  return { page, googleRequests };
}

async function openPanel(page: Page): Promise<void> {
  const button = await page.evaluate(() => (window as any).__game.scene.getScene('menu').accountButton);
  await clickMap(page, button.x, button.y);
  await expect(page.locator('#account')).toBeVisible();
}

function mapStars(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() =>
    Object.fromEntries(
      (window as any).__game.scene.getScene('menu').cards.map((card: any) => [card.mapId, card.stars]),
    ),
  );
}

function menuShows(page: Page, text: string): Promise<boolean> {
  return page.evaluate(
    (wanted) => (window as any).__game.scene.getScene('menu').children.list.some((child: any) => child.text === wanted),
    text,
  );
}

test('nothing is asked of Google until the player opens the panel', async ({ browser }) => {
  const { page, googleRequests } = await openDevice(browser, randomUUID());
  expect(googleRequests).toEqual([]);
  await openPanel(page);
  await expect(page.locator('#fake-google')).toBeVisible();
  expect(googleRequests.length).toBeGreaterThan(0);
});

test('signing in with Google keeps the progress, and the menu shows the account', async ({ browser }) => {
  const { page } = await openDevice(browser, randomUUID(), { meadow: 2 });
  await openPanel(page);
  await page.locator('#fake-google').click();
  await expect(page.locator('#account-who')).toHaveText('Conectado con Google como Ana Pérez');
  await page.locator('#account-close').click();
  await expect.poll(() => menuShows(page, 'Mi cuenta'), { timeout: 15_000 }).toBe(true);
  expect((await mapStars(page)).meadow).toBe(2);
});

test('the same Google account on another device brings the progress there', async ({ browser }) => {
  test.setTimeout(90_000);
  const account = randomUUID();
  const phone = await openDevice(browser, account, { meadow: 3, canyon: 1 });
  await openPanel(phone.page);
  await phone.page.locator('#fake-google').click();
  await expect(phone.page.locator('#account-who')).toBeVisible();

  const computer = await openDevice(browser, account);
  await openPanel(computer.page);
  await computer.page.locator('#fake-google').click();
  await expect(computer.page.locator('#account-who')).toBeVisible();
  await computer.page.locator('#account-close').click();
  await expect.poll(() => mapStars(computer.page), { timeout: 15_000 }).toMatchObject({ meadow: 3, canyon: 1 });
});

test('a player code moves into the Google account', async ({ browser }) => {
  const { page } = await openDevice(browser, randomUUID(), { crossroads: 2 });
  await openPanel(page);
  await page.locator('#account-create').click();
  await expect(page.locator('#account-code')).toBeVisible();
  // Forget the stars on this device: they must come back from the code's account.
  await page.evaluate((key) => localStorage.removeItem(key), PROGRESS_KEY);

  await page.locator('#fake-google').click();
  await expect(page.locator('#account-who')).toBeVisible();
  await page.locator('#account-close').click();
  await expect.poll(() => mapStars(page), { timeout: 15_000 }).toMatchObject({ crossroads: 2 });
});

test('signing out leaves the device without an account, and Google does not sign it back in', async ({ browser }) => {
  const { page } = await openDevice(browser, randomUUID(), { meadow: 1 });
  await openPanel(page);
  await page.locator('#fake-google').click();
  await expect(page.locator('#account-who')).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.locator('#account-sign-out').click();
  await expect(page.locator('#account-create')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__googleForgot)).toBe(true);
  // The progress on this device stays.
  await page.locator('#account-close').click();
  await expect.poll(() => menuShows(page, 'Guardar avance'), { timeout: 15_000 }).toBe(true);
  expect((await mapStars(page)).meadow).toBe(1);
});

test('a victory while signed in with Google reaches the account by itself', async ({ browser }) => {
  test.setTimeout(90_000);
  const account = randomUUID();
  const phone = await openDevice(browser, account, { meadow: 1 });
  await openPanel(phone.page);
  await phone.page.locator('#fake-google').click();
  await expect(phone.page.locator('#account-who')).toBeVisible();

  await phone.page.goto(`${SERVER}/?map=canyon`);
  await phone.page.waitForFunction(() => (window as any).__game?.scene.getScene('game')?.towerMenu);
  await phone.page.evaluate(() => {
    (window as any).__game.scene.getScene('game').game_.phase = 'won';
  });

  const computer = await openDevice(browser, account);
  await openPanel(computer.page);
  await computer.page.locator('#fake-google').click();
  await expect(computer.page.locator('#account-who')).toBeVisible();
  await computer.page.locator('#account-close').click();
  await expect(async () => {
    await computer.page.reload();
    await computer.page.waitForFunction(() => (window as any).__game?.scene.getScene('menu')?.accountButton != null);
    expect(await mapStars(computer.page)).toMatchObject({ meadow: 1, canyon: 3 });
  }).toPass({ timeout: 30_000 });
});
