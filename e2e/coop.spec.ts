import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { clickMap, clickMenuOption, clickSlot, snapshot } from './game';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Two players in two separate browsers, against the real co-op server, which
// also serves the built game (see playwright.config.ts).

// Each test runs two whole games at once; one after another keeps them honest
// on a slow machine.
test.describe.configure({ mode: 'default' });

// COOP_SERVER points the same tests at a server that is already running elsewhere.
const SERVER = process.env.COOP_SERVER ?? `http://localhost:${process.env.COOP_PORT ?? 8790}`;

// Every player gets a browser of their own, which has to be closed by hand:
// left open, its game would keep running under the tests that follow.
const opened: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

/** Opens the menu served by the co-op server and its lobby. */
async function openLobby(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  opened.push(context);
  const page = await context.newPage();
  await page.goto(SERVER);
  await page.waitForFunction(
    () => (window as any).__game?.scene.getScene('menu')?.coopButton != null,
  );
  const button = await page.evaluate(() => (window as any).__game.scene.getScene('menu').coopButton);
  await clickMap(page, button.x, button.y);
  await page.locator('#lobby-name').fill(name);
  return page;
}

function inGame(page: Page): Promise<unknown> {
  return page.waitForFunction(() => {
    const scene: any = (window as any).__game?.scene.getScene('game');
    return Boolean(scene?.game_ && scene?.towerMenu && scene.scene.isActive());
  });
}

/** Ana creates a room, Beto joins it with the code, and both say they are ready. */
async function startTogether(browser: Browser): Promise<{ ana: Page; beto: Page }> {
  const ana = await openLobby(browser, 'Ana');
  await ana.locator('#lobby-create').click();
  const code = (await ana.locator('#lobby-room-code').textContent()) ?? '';

  const beto = await openLobby(browser, 'Beto');
  await beto.locator('#lobby-code').fill(code);
  await beto.locator('#lobby-join').click();
  await expect(ana.locator('#lobby-players li')).toHaveCount(2);

  await ana.locator('#lobby-ready').click();
  await beto.locator('#lobby-ready').click();
  await Promise.all([inGame(ana), inGame(beto)]);
  return { ana, beto };
}

function ownHeroes(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    (window as any).__game.scene.getScene('game').coop.session.ownHeroes(),
  );
}

test('a room is created with a code and shows who is in it', async ({ browser }) => {
  const ana = await openLobby(browser, 'Ana');
  await ana.locator('#lobby-create').click();
  await expect(ana.locator('#lobby-room-code')).toHaveText(/^[A-Z]{4}$/);
  await expect(ana.locator('#lobby-players li')).toHaveCount(1);
  await expect(ana.locator('#lobby-players')).toContainText('Ana');
});

test('a code that matches no room is refused with an explanation', async ({ browser }) => {
  const page = await openLobby(browser, 'Ana');
  await page.locator('#lobby-code').fill('ZZZZ');
  await page.locator('#lobby-join').click();
  await expect(page.locator('#lobby-error')).not.toBeEmpty();
  await expect(page.locator('#lobby-room-code')).toHaveCount(0);
});

test('the game starts for both players once both are ready, with the heroes shared out', async ({
  browser,
}) => {
  const { ana, beto } = await startTogether(browser);
  await expect(ana.locator('#lobby')).toHaveCount(0);
  await expect(beto.locator('#lobby')).toHaveCount(0);

  const [hers, his] = [await ownHeroes(ana), await ownHeroes(beto)];
  expect(hers.length).toBe(2);
  expect(his.length).toBe(2);
  expect([...hers, ...his].sort()).toEqual([1, 2, 3, 4]);
});

test('a tower built by one player appears for the other', async ({ browser }) => {
  const { ana, beto } = await startTogether(browser);
  await clickSlot(ana, 1);
  await clickMenuOption(ana, 'Arquería');

  const tower = [{ slot: 1, type: 'archery', level: 0 }];
  await expect.poll(async () => (await snapshot(ana)).towers).toEqual(tower);
  await expect.poll(async () => (await snapshot(beto)).towers).toEqual(tower);
  expect((await snapshot(beto)).gold).toBe((await snapshot(ana)).gold);
});

test('the wave only starts when both players are ready', async ({ browser }) => {
  const { ana, beto } = await startTogether(browser);
  await ana.keyboard.press('Space');
  await ana.waitForTimeout(600);
  expect((await snapshot(ana)).phase).toBe('preparing');
  expect((await snapshot(beto)).phase).toBe('preparing');

  await beto.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(ana)).phase).toBe('wave');
  await expect.poll(async () => (await snapshot(beto)).phase).toBe('wave');
});

test('a player cannot select or move a hero that belongs to the other', async ({ browser }) => {
  const { ana, beto } = await startTogether(browser);
  const hers = await ownHeroes(ana);
  const his = await ownHeroes(beto);
  const before = (await snapshot(ana)).heroes.find((hero) => hero.id === his[0])!;

  await ana.keyboard.press(String(his[0]));
  expect((await snapshot(ana)).selectedHeroId).toBe(hers[0]);

  // Her own hero does move, and Beto sees it.
  await clickMap(ana, 300, 200);
  await expect
    .poll(async () => (await snapshot(beto)).heroes.find((hero) => hero.id === hers[0])!.targetX)
    .toBe(300);
  const after = (await snapshot(beto)).heroes.find((hero) => hero.id === his[0])!;
  expect(after.targetX).toBe(before.targetX);
});

test('both players keep the same game through a wave', async ({ browser }) => {
  const { ana, beto } = await startTogether(browser);
  await clickSlot(ana, 1);
  await clickMenuOption(ana, 'Arquería');
  await ana.keyboard.press('Space');
  await beto.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(beto)).phase).toBe('wave');
  await ana.waitForTimeout(6000);

  // Take a picture of each game at the very same tick and compare them whole.
  // The picture is taken from inside the game's own step, so the tick cannot be missed.
  const fingerprintAt = (page: Page, tick: number): Promise<string> =>
    page.evaluate(
      (wanted) =>
        new Promise<string>((resolve) => {
          const session: any = (window as any).__game.scene.getScene('game').coop.session;
          const played = session.played.bind(session);
          session.played = (now: number, game: unknown) => {
            if (now === wanted) resolve(JSON.stringify(game));
            if (now > wanted) resolve(`passed ${now}`);
            played(now, game);
          };
        }),
      tick,
    );
  const target = Math.max((await snapshot(ana)).tick, (await snapshot(beto)).tick) + 60;
  const [hers, his] = await Promise.all([fingerprintAt(ana, target), fingerprintAt(beto, target)]);
  expect(hers).not.toMatch(/^passed/);
  expect(hers).toBe(his);
});

test('a player who loses the connection comes back into the same game', async ({ browser }) => {
  const { ana, beto } = await startTogether(browser);
  await beto.evaluate(() => (window as any).__game.scene.getScene('game').coop.socket.close());
  await expect
    .poll(() => beto.evaluate(() => (window as any).__game.scene.getScene('game').coop.status))
    .toBe('reconnecting');

  // Ana builds while Beto is away.
  await clickSlot(ana, 1);
  await clickMenuOption(ana, 'Arquería');
  await expect.poll(async () => (await snapshot(ana)).towers.length).toBe(1);

  await expect
    .poll(() => beto.evaluate(() => (window as any).__game.scene.getScene('game').coop.status), {
      timeout: 15_000,
    })
    .toBe('online');
  await expect.poll(async () => (await snapshot(beto)).towers.length).toBe(1);
  const tick = (await snapshot(beto)).tick;
  await expect.poll(async () => (await snapshot(beto)).tick).toBeGreaterThan(tick);
});
