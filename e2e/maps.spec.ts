import { expect, test, type Page } from '@playwright/test';
import { clickMap, snapshot } from './game';

/* eslint-disable @typescript-eslint/no-explicit-any */

const PROGRESS_KEY = 'tower-defense-heroes.progress';

interface Card {
  mapId: string;
  unlocked: boolean;
  stars: number;
  x: number;
  y: number;
}

function isShowing(page: Page, scene: 'menu' | 'game'): Promise<boolean> {
  return page.evaluate((key) => Boolean((window as any).__game?.scene.isActive(key)), scene);
}

async function openMenu(page: Page): Promise<void> {
  await page.goto('/');
  await expect.poll(() => isShowing(page, 'menu')).toBe(true);
  await page.waitForFunction(
    () => (window as any).__game.scene.getScene('menu').cards.length > 0,
  );
}

function cards(page: Page): Promise<Card[]> {
  return page.evaluate(() => (window as any).__game.scene.getScene('menu').cards);
}

function currentMap(page: Page): Promise<{ id: string; roads: number }> {
  return page.evaluate(() => {
    const scene: any = (window as any).__game.scene.getScene('game');
    return { id: scene.map.id, roads: scene.level.paths.length };
  });
}

async function waitForGame(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const game: any = (window as any).__game;
    return game?.scene.isActive('game') && Boolean(game.scene.getScene('game').towerMenu);
  });
}

/** Test setup only: saves progress as if the player had earned it earlier. */
async function giveProgress(page: Page, stars: Record<string, number>): Promise<void> {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [PROGRESS_KEY, JSON.stringify({ version: 1, stars })] as const,
  );
}

test.describe('map picker', () => {
  test('a new player sees three maps with only the first one open', async ({ page }) => {
    await openMenu(page);
    expect(await cards(page)).toMatchObject([
      { mapId: 'meadow', unlocked: true, stars: 0 },
      { mapId: 'canyon', unlocked: false, stars: 0 },
      { mapId: 'crossroads', unlocked: false, stars: 0 },
    ]);
  });

  test('clicking an open map starts it', async ({ page }) => {
    await openMenu(page);
    const [first] = await cards(page);
    await clickMap(page, first.x, first.y);
    await waitForGame(page);
    expect((await currentMap(page)).id).toBe('meadow');
  });

  test('clicking a locked map does nothing', async ({ page }) => {
    await openMenu(page);
    const locked = (await cards(page))[1];
    await clickMap(page, locked.x, locked.y);
    await page.waitForTimeout(300);
    expect(await isShowing(page, 'menu')).toBe(true);
  });

  test('saved stars are shown and open the next map', async ({ page }) => {
    await giveProgress(page, { meadow: 2 });
    await openMenu(page);
    expect(await cards(page)).toMatchObject([
      { mapId: 'meadow', unlocked: true, stars: 2 },
      { mapId: 'canyon', unlocked: true, stars: 0 },
      { mapId: 'crossroads', unlocked: false, stars: 0 },
    ]);
  });

  test('a number key starts an open map', async ({ page }) => {
    await giveProgress(page, { meadow: 1 });
    await openMenu(page);
    await page.keyboard.press('2');
    await waitForGame(page);
    expect((await currentMap(page)).id).toBe('canyon');
  });
});

interface Menu {
  difficulty: string;
  available: number;
  mode: string;
  modeButtons: { id: string; selected: boolean; x: number; y: number }[];
  difficultyButtons: { id: string; selected: boolean; x: number; y: number }[];
  heroTiles: { heroType: string; rank: number; cost: number | null; x: number; y: number }[];
}

function menu(page: Page): Promise<Menu> {
  return page.evaluate(() => {
    const scene: any = (window as any).__game.scene.getScene('menu');
    return {
      difficulty: scene.difficulty,
      available: scene.available,
      mode: scene.mode,
      modeButtons: scene.modeButtons,
      difficultyButtons: scene.difficultyButtons,
      heroTiles: scene.heroTiles,
    };
  });
}

function playedLevel(
  page: Page,
): Promise<{ difficulty: string; gold: number; soldierHp: number; warriorHp: number }> {
  return page.evaluate(() => {
    const scene: any = (window as any).__game.scene.getScene('game');
    return {
      difficulty: scene.difficulty,
      gold: scene.game_.gold,
      soldierHp: scene.level.enemyTypes.soldier.maxHp,
      warriorHp: scene.level.heroTypes.warrior.maxHp,
    };
  });
}

test.describe('difficulty', () => {
  test('normal is selected on a first visit', async ({ page }) => {
    await openMenu(page);
    const state = await menu(page);
    expect(state.difficulty).toBe('normal');
    expect(state.difficultyButtons.map((b) => b.id)).toEqual(['easy', 'normal', 'hard']);
  });

  test('the choice is remembered on the next visit', async ({ page }) => {
    await openMenu(page);
    const hard = (await menu(page)).difficultyButtons[2];
    await clickMap(page, hard.x, hard.y);
    await expect.poll(async () => (await menu(page)).difficulty).toBe('hard');

    await openMenu(page);
    expect((await menu(page)).difficulty).toBe('hard');
  });

  test('a map started on hard has tougher enemies and less gold than on easy', async ({ page }) => {
    await page.goto('/?map=meadow&difficulty=easy');
    await waitForGame(page);
    const easy = await playedLevel(page);

    await page.goto('/?map=meadow&difficulty=hard');
    await waitForGame(page);
    const hard = await playedLevel(page);

    expect(hard.difficulty).toBe('hard');
    expect(hard.soldierHp).toBeGreaterThan(easy.soldierHp);
    expect(hard.gold).toBeLessThan(easy.gold);
  });

  test('stars are kept apart for each difficulty', async ({ page }) => {
    await page.goto('/?map=meadow&difficulty=hard');
    await waitForGame(page);
    await page.evaluate(() => {
      (window as any).__game.scene.getScene('game').game_.phase = 'won';
    });
    await expect.poll(async () => (await snapshot(page)).endTitle).toContain('★★★');
    await page.keyboard.press('Enter');
    await expect.poll(() => isShowing(page, 'menu')).toBe(true);

    // The menu opens on normal, where nothing was won yet.
    await expect.poll(async () => (await cards(page))[0]?.stars).toBe(0);
    const hard = (await menu(page)).difficultyButtons[2];
    await clickMap(page, hard.x, hard.y);
    await expect.poll(async () => (await cards(page))[0]?.stars).toBe(3);
  });
});

test.describe('hero upgrades', () => {
  test('a rank is bought with stars and makes the hero stronger in the next game', async ({
    page,
  }) => {
    await giveProgress(page, { meadow: 3 });
    await page.goto('/?map=meadow');
    await waitForGame(page);
    const before = await playedLevel(page);

    await openMenu(page);
    expect((await menu(page)).available).toBe(3);
    const warrior = (await menu(page)).heroTiles.find((tile) => tile.heroType === 'warrior')!;
    expect(warrior).toMatchObject({ rank: 0, cost: 1 });
    await clickMap(page, warrior.x, warrior.y);

    await expect
      .poll(async () => (await menu(page)).heroTiles.find((t) => t.heroType === 'warrior'))
      .toMatchObject({ rank: 1, cost: 2 });
    expect((await menu(page)).available).toBe(2);

    await page.keyboard.press('1');
    await waitForGame(page);
    expect((await playedLevel(page)).warriorHp).toBeGreaterThan(before.warriorHp);
  });

  test('a rank the player cannot afford is not sold', async ({ page }) => {
    await openMenu(page);
    const mage = (await menu(page)).heroTiles.find((tile) => tile.heroType === 'mage')!;
    await clickMap(page, mage.x, mage.y);
    await page.waitForTimeout(300);
    expect((await menu(page)).heroTiles.find((t) => t.heroType === 'mage')?.rank).toBe(0);
  });
});

test.describe('endless mode', () => {
  /** Test setup only: ends the endless game on screen with a given score and wave. */
  async function loseWith(page: Page, score: number, wave: number): Promise<void> {
    await page.evaluate(
      ([points, waveNumber]) => {
        const game = (window as any).__game.scene.getScene('game').game_;
        game.score = points;
        game.waveIndex = waveNumber - 1;
        game.lives = 0;
        game.phase = 'lost';
      },
      [score, wave] as const,
    );
  }

  async function chooseEndlessInMenu(page: Page): Promise<void> {
    const endless = (await menu(page)).modeButtons[1];
    await clickMap(page, endless.x, endless.y);
    await expect.poll(async () => (await menu(page)).mode).toBe('endless');
  }

  test('the campaign is selected on a first visit, and the choice is remembered', async ({
    page,
  }) => {
    await openMenu(page);
    expect((await menu(page)).mode).toBe('campaign');
    await chooseEndlessInMenu(page);

    await openMenu(page);
    expect((await menu(page)).mode).toBe('endless');
  });

  test('a map started from the menu in endless mode has no last wave', async ({ page }) => {
    await openMenu(page);
    await chooseEndlessInMenu(page);
    const [first] = await cards(page);
    await clickMap(page, first.x, first.y);
    await waitForGame(page);

    const played = await page.evaluate(() => {
      const scene: any = (window as any).__game.scene.getScene('game');
      return { mode: scene.mode, scripted: scene.level.waves.length, hud: scene.hud.text };
    });
    expect(played.mode).toBe('endless');
    expect(played.scripted).toBe(0);
    expect(played.hud).toContain('Puntos');

    await page.keyboard.press('Space');
    await expect.poll(async () => (await snapshot(page)).enemies).toBeGreaterThan(0);
  });

  test('the score of a finished game is shown and kept as the record', async ({ page }) => {
    await page.goto('/?map=meadow&mode=endless');
    await waitForGame(page);
    await loseWith(page, 777, 6);
    await expect.poll(async () => (await snapshot(page)).endTitle).toBe('777 puntos');
    await expect.poll(async () => (await snapshot(page)).notice).toContain('récord');

    await page.keyboard.press('Enter');
    await expect.poll(() => isShowing(page, 'menu')).toBe(true);
    await chooseEndlessInMenu(page);
    await expect.poll(async () => (await cards(page))[0]).toMatchObject({ record: 777 });
  });

  test('a lower score does not replace the record', async ({ page }) => {
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [
        PROGRESS_KEY,
        JSON.stringify({
          version: 2,
          stars: {},
          heroRanks: {},
          endless: { meadow: { normal: { score: 900, wave: 8 } } },
        }),
      ] as const,
    );
    await page.goto('/?map=meadow&mode=endless');
    await waitForGame(page);
    await loseWith(page, 100, 2);
    await expect.poll(async () => (await snapshot(page)).endTitle).toBe('100 puntos');
    await page.waitForTimeout(300);
    expect((await snapshot(page)).notice ?? '').not.toContain('récord');

    await page.keyboard.press('Enter');
    await expect.poll(() => isShowing(page, 'menu')).toBe(true);
    await chooseEndlessInMenu(page);
    await expect.poll(async () => (await cards(page))[0]).toMatchObject({ record: 900 });
  });

  test('an endless game gives no stars', async ({ page }) => {
    await page.goto('/?map=meadow&mode=endless');
    await waitForGame(page);
    await loseWith(page, 5000, 30);
    await expect.poll(async () => (await snapshot(page)).endTitle).toBe('5000 puntos');
    await page.keyboard.press('Enter');
    await expect.poll(() => isShowing(page, 'menu')).toBe(true);
    expect((await menu(page)).available).toBe(0);
  });
});

test.describe('playing a map', () => {
  for (const [mapId, roads] of [
    ['meadow', 1],
    ['canyon', 1],
    ['crossroads', 2],
  ] as const) {
    test(`${mapId} loads and its first wave brings enemies`, async ({ page }) => {
      await page.goto(`/?map=${mapId}`);
      await waitForGame(page);
      expect(await currentMap(page)).toEqual({ id: mapId, roads });

      await page.keyboard.press('Space');
      await expect.poll(async () => (await snapshot(page)).enemies).toBeGreaterThan(0);
    });
  }

  test('winning saves the stars and opens the next map', async ({ page }) => {
    await page.goto('/?map=meadow');
    await waitForGame(page);
    // Test setup only: end the game as a flawless victory.
    await page.evaluate(() => {
      (window as any).__game.scene.getScene('game').game_.phase = 'won';
    });
    await expect.poll(async () => (await snapshot(page)).endTitle).toContain('★★★');

    await page.keyboard.press('Enter');
    await expect.poll(() => isShowing(page, 'menu')).toBe(true);
    await expect
      .poll(() => cards(page))
      .toMatchObject([
        { mapId: 'meadow', unlocked: true, stars: 3 },
        { mapId: 'canyon', unlocked: true },
        { mapId: 'crossroads', unlocked: false },
      ]);
  });

  test('a worse result does not replace a better one', async ({ page }) => {
    await giveProgress(page, { meadow: 3 });
    await page.goto('/?map=meadow');
    await waitForGame(page);
    await page.evaluate(() => {
      const game = (window as any).__game.scene.getScene('game').game_;
      game.lives = 3;
      game.phase = 'won';
    });
    await expect.poll(async () => (await snapshot(page)).endTitle).toContain('★☆☆');

    await page.keyboard.press('Enter');
    await expect.poll(() => isShowing(page, 'menu')).toBe(true);
    await expect.poll(async () => (await cards(page))[0]?.stars).toBe(3);
  });

  test('the pause screen leads back to the map picker', async ({ page }) => {
    await page.goto('/?map=meadow');
    await waitForGame(page);
    await page.keyboard.press('p');
    await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
    await page.keyboard.press('Enter');
    await expect.poll(() => isShowing(page, 'menu')).toBe(true);
  });
});
