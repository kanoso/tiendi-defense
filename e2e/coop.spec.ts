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

/** The signals on a player's map, as kind, sender and place. */
function marks(page: Page): Promise<{ kind: string; name: string | null; x: number; y: number }[]> {
  return page.evaluate(() =>
    (window as any).__game.scene
      .getScene('game')
      .signalMarks.marks.map(({ kind, name, x, y }: any) => ({ kind, name, x, y })),
  );
}

async function tapControl(page: Page, control: string): Promise<void> {
  const center = await page.evaluate((name) => {
    const bounds = (window as any).__game.scene.getScene('game').controls[name].getBounds();
    return { x: bounds.centerX, y: bounds.centerY };
  }, control);
  await clickMap(page, center.x, center.y);
}

test('a signal put on the map with its button is seen by both players, with who sent it', async ({
  browser,
}) => {
  const { ana, beto } = await startTogether(browser);
  await tapControl(ana, 'help');
  await clickMap(ana, 480, 300);

  const expected = [{ kind: 'help', name: 'Ana', x: 480, y: 300 }];
  await expect.poll(() => marks(beto)).toEqual(expected);
  await expect.poll(() => marks(ana)).toEqual(expected);
  // Placing a signal does not move a hero.
  const heroes = (await snapshot(ana)).heroes;
  expect(heroes.every((hero) => hero.targetX !== 480 || hero.targetY !== 300)).toBe(true);
  // And it goes away on its own.
  await expect.poll(() => marks(beto), { timeout: 8000 }).toEqual([]);
});

test('a signal can be put where the mouse is with a key', async ({ browser }) => {
  const { ana, beto } = await startTogether(browser);
  const box = (await beto.locator('canvas').boundingBox())!;
  await beto.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await beto.keyboard.press('v');
  await expect.poll(async () => (await marks(ana)).map((mark) => [mark.kind, mark.name])).toEqual([
    ['going', 'Beto'],
  ]);
});

test('solo games have no signal buttons, and keep pause and speed', async ({ page }) => {
  await page.goto('/?map=meadow');
  await page.waitForFunction(() => (window as any).__game?.scene.getScene('game')?.towerMenu);
  const controls = await page.evaluate(() =>
    Object.keys((window as any).__game.scene.getScene('game').controls).filter(
      (name) => (window as any).__game.scene.getScene('game').controls[name] !== undefined,
    ),
  );
  expect(controls).toContain('pause');
  expect(controls).toContain('speed');
  expect(controls).not.toContain('help');
});

test('a player who reloads the page is brought back into the same game', async ({ browser }) => {
  const { ana, beto } = await startTogether(browser);
  await clickSlot(ana, 1);
  await clickMenuOption(ana, 'Arquería');
  await expect.poll(async () => (await snapshot(beto)).towers.length).toBe(1);
  const mine = await ownHeroes(beto);

  await beto.reload();
  await inGame(beto);
  await expect.poll(async () => (await snapshot(beto)).towers.length).toBe(1);
  expect(await ownHeroes(beto)).toEqual(mine);
  // The game goes on for him, in step with Ana.
  const tick = (await snapshot(beto)).tick;
  await expect.poll(async () => (await snapshot(beto)).tick).toBeGreaterThan(tick);
  await expect
    .poll(async () => Math.abs((await snapshot(beto)).tick - (await snapshot(ana)).tick))
    .toBeLessThan(30);
});

test('after leaving a shared game for the menu, a reload stays in the menu', async ({ browser }) => {
  const { beto } = await startTogether(browser);
  await beto.evaluate(() => (window as any).__game.scene.getScene('game').goToMenu());
  await beto.waitForFunction(() => (window as any).__game.scene.isActive('menu'));
  await beto.reload();
  await beto.waitForFunction(
    () => (window as any).__game?.scene.getScene('menu')?.coopButton != null,
  );
  expect(await beto.evaluate(() => (window as any).__game.scene.isActive('game'))).toBe(false);
});

test('players choose their heroes in the lobby, and the rest are handed out', async ({ browser }) => {
  const ana = await openLobby(browser, 'Ana');
  await ana.locator('#lobby-create').click();
  const code = (await ana.locator('#lobby-room-code').textContent()) ?? '';
  const beto = await openLobby(browser, 'Beto');
  await beto.locator('#lobby-code').fill(code);
  await beto.locator('#lobby-join').click();
  await expect(ana.locator('#lobby-players li')).toHaveCount(2);

  await beto.locator('#lobby-hero-1').click();
  // Ana sees the warrior taken by Beto, and cannot take it.
  await expect(ana.locator('#lobby-hero-1')).toContainText('Beto');
  await expect(ana.locator('#lobby-hero-1')).toBeDisabled();
  await expect(beto.locator('#lobby-hero-1')).toContainText('Tuyo');

  await ana.locator('#lobby-hero-4').click();
  await expect(ana.locator('#lobby-hero-4')).toContainText('Tuyo');

  await ana.locator('#lobby-ready').click();
  await beto.locator('#lobby-ready').click();
  await Promise.all([inGame(ana), inGame(beto)]);
  expect(await ownHeroes(ana)).toEqual([4, 2]);
  expect(await ownHeroes(beto)).toEqual([1, 3]);
});
