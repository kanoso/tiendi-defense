import { expect, test, type Page } from '@playwright/test';
import { branchesOf, clickMenuOption, clickSlot, giveGold, snapshot, towerOn } from './game';

/* eslint-disable @typescript-eslint/no-explicit-any */

// A light smoke test of the two maps built around the newer enemies, Pantano and
// Fortaleza, in a real browser. Their wave schedules are checked in full by the
// unit tests in src/data/maps.test.ts.

/** Waiting on a busy build machine: game ticks can come slowly. */
const SLOW = { timeout: 30_000 };

async function openMap(page: Page, mapId: string): Promise<void> {
  await page.goto(`/?map=${mapId}`);
  await page.waitForFunction((id) => {
    const scene: any = (window as any).__game?.scene.getScene('game');
    return Boolean(scene?.game_ && scene?.towerMenu && scene.map?.id === id);
  }, mapId);
}

/**
 * Test setup only: skips ahead to a later wave of the script, as if the ones
 * before it had been played, and starts it.
 */
async function startWave(page: Page, waveNumber: number): Promise<void> {
  await page.evaluate((index) => {
    (window as any).__game.scene.getScene('game').game_.waveIndex = index;
  }, waveNumber - 1);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).phase).toBe('wave');
}

/** Keeps looking at the enemies on the road until one of that kind shows up. */
async function expectEnemy(page: Page, type: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          (wanted) => (window as any).__game.scene.getScene('game').game_.enemies.some((e: any) => e.type === wanted),
          type,
        ),
      { ...SLOW, message: `a ${type} on the road` },
    )
    .toBe(true);
}

function roadsInUse(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    [...new Set<number>((window as any).__game.scene.getScene('game').game_.enemies.map((e: any) => e.path))].sort(),
  );
}

test.describe('Pantano', () => {
  test('loads with its long road and its thirty waves', async ({ page }) => {
    await openMap(page, 'swamp');
    const shape = await page.evaluate(() => {
      const scene: any = (window as any).__game.scene.getScene('game');
      return { roads: scene.level.paths.length, waves: scene.level.waves.length, hud: scene.hud.text };
    });
    expect(shape).toMatchObject({ roads: 1, waves: 30 });
    expect(shape.hud).toContain('/30');
  });

  test('its first wave brings the usual soldiers', async ({ page }) => {
    await openMap(page, 'swamp');
    await page.keyboard.press('Space');
    await expectEnemy(page, 'soldier');
  });

  test('skeletons show up on the road on wave 4', async ({ page }) => {
    await openMap(page, 'swamp');
    await startWave(page, 4);
    await expectEnemy(page, 'skeleton');
  });
});

test.describe('Fortaleza', () => {
  test('sends its first wave through both gates', async ({ page }) => {
    await openMap(page, 'fortress');
    await page.keyboard.press('Space');
    await expect.poll(() => roadsInUse(page), SLOW).toEqual([0, 1]);
  });

  test('big zombies show up on the road on wave 6', async ({ page }) => {
    await openMap(page, 'fortress');
    await startWave(page, 6);
    await expectEnemy(page, 'big_zombie');
  });
});

test('a third level tower on a new map offers its branches, with nothing turned on by hand', async ({ page }) => {
  await openMap(page, 'fortress');
  await giveGold(page, 5000);
  const openSlotMenu = async () => {
    await expect.poll(async () => (await snapshot(page)).menu.length, SLOW).toBe(0);
    await clickSlot(page, 1);
    await expect.poll(async () => (await snapshot(page)).menu.length, SLOW).toBeGreaterThan(0);
  };
  await openSlotMenu();
  await clickMenuOption(page, 'Arquería');
  await expect.poll(async () => (await towerOn(page, 1))?.type, SLOW).toBe('archery');
  for (const level of [1, 2]) {
    await openSlotMenu();
    await clickMenuOption(page, 'Mejorar');
    await expect.poll(async () => (await towerOn(page, 1))?.level, SLOW).toBe(level);
  }

  const [ballesta, lluvia] = await branchesOf(page, 'archery');
  await openSlotMenu();
  const menu = (await snapshot(page)).menu;
  expect(menu.some((label) => label.startsWith(ballesta.name))).toBe(true);
  expect(menu.some((label) => label.startsWith(lluvia.name))).toBe(true);

  await clickMenuOption(page, lluvia.name);
  await expect.poll(async () => (await towerOn(page, 1))?.branch, SLOW).toBe(lluvia.id);
});
