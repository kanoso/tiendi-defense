import { expect, test } from '@playwright/test';
import { clickMap, openGame, snapshot } from './game';

const GRASS = { x: 620, y: 420 };

test.beforeEach(async ({ page }) => {
  await openGame(page);
});

test.describe('tutorial', () => {
  test('a first game opens on the first lesson', async ({ page }) => {
    const hint = (await snapshot(page)).hint;
    expect(hint).toContain('1/5');
    expect(hint).toContain('Elige un héroe');
  });

  test('doing what a lesson asks brings the next one', async ({ page }) => {
    await page.keyboard.press('2');
    await expect.poll(async () => (await snapshot(page)).hint).toContain('2/5');

    await clickMap(page, GRASS.x, GRASS.y);
    await expect.poll(async () => (await snapshot(page)).hint).toContain('3/5');
  });

  test('a player who starts the wave right away skips the earlier lessons', async ({ page }) => {
    await page.keyboard.press('Space');
    await expect.poll(async () => (await snapshot(page)).hint).toContain('5/5');
  });

  test('it can be skipped, and does not come back on the next visit', async ({ page }) => {
    await page.keyboard.press('t');
    await expect.poll(async () => (await snapshot(page)).hint).toContain('P: pausa');

    await openGame(page);
    expect((await snapshot(page)).hint).toContain('P: pausa');
  });
});

test.describe('speed', () => {
  test('the F key switches between normal and double speed', async ({ page }) => {
    expect((await snapshot(page)).speed).toBe(1);
    await page.keyboard.press('f');
    await expect.poll(async () => (await snapshot(page)).speed).toBe(2);
    await page.keyboard.press('f');
    await expect.poll(async () => (await snapshot(page)).speed).toBe(1);
  });

  test('double speed makes game time run clearly faster', async ({ page }) => {
    // Game ticks per millisecond of the game's own frame clock, so a busy
    // machine that drops frames does not distort the comparison.
    const measure = async () => {
      const start = await snapshot(page);
      await page.waitForTimeout(1500);
      const end = await snapshot(page);
      return (end.tick - start.tick) / (end.clockMs - start.clockMs);
    };
    const normal = await measure();
    await page.keyboard.press('f');
    await expect.poll(async () => (await snapshot(page)).speed).toBe(2);
    const fast = await measure();
    // Only a floor: on a loaded machine frame timing is too uneven to pin the
    // ratio to exactly two, but it must be clearly faster than normal.
    expect(fast / normal).toBeGreaterThan(1.4);
  });
});

test.describe('pause', () => {
  test('the P key freezes game time and resumes it', async ({ page }) => {
    await page.keyboard.press('p');
    await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
    const frozen = (await snapshot(page)).tick;
    await page.waitForTimeout(600);
    expect((await snapshot(page)).tick).toBe(frozen);

    await page.keyboard.press('p');
    await expect.poll(async () => (await snapshot(page)).tick).toBeGreaterThan(frozen);
  });

  test('orders are refused while paused, with an explanation', async ({ page }) => {
    await page.keyboard.press('p');
    await expect.poll(async () => (await snapshot(page)).paused).toBe(true);

    await page.keyboard.press('Space');
    await expect.poll(async () => (await snapshot(page)).notice).toContain('pausa');

    await page.keyboard.press('p');
    await page.waitForTimeout(300);
    // The refused order was dropped, not kept for later.
    expect((await snapshot(page)).phase).toBe('preparing');
  });
});
