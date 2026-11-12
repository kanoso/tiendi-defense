import { expect, test, type Page } from '@playwright/test';
import { clickSlot, openGame } from './game';

/* eslint-disable @typescript-eslint/no-explicit-any */

// The tests cannot hear, so they check what the game asked its audio to do.

function audioState(page: Page): Promise<{ loaded: string[]; played: string[]; muted: boolean }> {
  return page.evaluate(() => {
    const scene: any = (window as any).__game.scene.getScene('game');
    return {
      loaded: scene.cache.audio.getKeys(),
      played: [...scene.sounds.lastPlayedAt.keys()],
      muted: scene.sounds.muted,
    };
  });
}

test.beforeEach(async ({ page }) => {
  await openGame(page);
});

test('every sound file loads', async ({ page }) => {
  const { loaded } = await audioState(page);
  expect(loaded.sort()).toEqual(
    [
      'build',
      'cast',
      'defeat',
      'hero-down',
      'kill',
      'level-up',
      'life-lost',
      'menu',
      'refused',
      'select',
      'sell',
      'shot',
      'upgrade',
      'victory',
      'wave-clear',
      'wave-start',
    ].sort(),
  );
});

test('what the player does and what happens in the game make their sounds', async ({ page }) => {
  await page.keyboard.press('2');
  await clickSlot(page, 1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('q');
  await page.keyboard.press('Space');

  await expect.poll(async () => (await audioState(page)).played).toContain('waveStart');
  const { played } = await audioState(page);
  expect(played).toContain('select');
  expect(played).toContain('menu');
  expect(played).toContain('refused');
  // Heroes and enemies meet a few seconds in.
  await expect.poll(async () => (await audioState(page)).played, { timeout: 20_000 }).toContain('shot');
});

test('the M key mutes the game and the choice is remembered', async ({ page }) => {
  await page.keyboard.press('m');
  await expect.poll(async () => (await audioState(page)).muted).toBe(true);

  await page.keyboard.press('2');
  await page.waitForTimeout(200);
  expect((await audioState(page)).played).not.toContain('select');

  await openGame(page);
  expect((await audioState(page)).muted).toBe(true);
});
