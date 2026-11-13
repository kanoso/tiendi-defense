import { expect, test, type Page } from '@playwright/test';
import { clickSlot, openGame } from './game';

/* eslint-disable @typescript-eslint/no-explicit-any */

// The tests cannot hear, so they check what the game asked its audio to do.

function audioState(
  page: Page,
): Promise<{ loaded: string[]; played: string[]; muted: boolean; volume: number }> {
  return page.evaluate(() => {
    const scene: any = (window as any).__game.scene.getScene('game');
    return {
      loaded: scene.cache.audio.getKeys(),
      played: [...scene.sounds.lastPlayedAt.keys()],
      muted: scene.sounds.muted,
      volume: scene.sounds.volume,
    };
  });
}

test.beforeEach(async ({ page }) => {
  await openGame(page);
});

test('every sound file loads, without holding the game back', async ({ page }) => {
  // The game is already on screen; the sounds arrive on their own.
  await expect
    .poll(async () => (await audioState(page)).loaded.length, { timeout: 20_000 })
    .toBe(17);
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
      'music-battle',
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

test('the M key lowers the volume step by step down to silence, then back to full', async ({
  page,
}) => {
  expect((await audioState(page)).volume).toBe(1);
  const heard: number[] = [];
  for (let press = 0; press < 4; press++) {
    await page.keyboard.press('m');
    await page.waitForTimeout(100);
    heard.push((await audioState(page)).volume);
  }
  expect(heard).toEqual([0.6, 0.3, 0, 1]);
});

test('the chosen volume is remembered on the next visit', async ({ page }) => {
  await page.keyboard.press('m');
  await expect.poll(async () => (await audioState(page)).volume).toBe(0.6);

  await openGame(page);
  expect((await audioState(page)).volume).toBe(0.6);
});

test('a muted game makes no sound', async ({ page }) => {
  // One press at a time: three steps down from full volume is silence.
  for (const expected of [0.6, 0.3, 0]) {
    await page.keyboard.press('m');
    await expect.poll(async () => (await audioState(page)).volume).toBe(expected);
  }
  expect((await audioState(page)).muted).toBe(true);
  // Forget what played on the way down, then do something that normally sounds.
  await page.evaluate(() =>
    (window as any).__game.scene.getScene('game').sounds.lastPlayedAt.clear(),
  );
  await page.keyboard.press('2');
  await page.waitForTimeout(200);
  expect((await audioState(page)).played).toEqual([]);
});

test('a player who had muted the game before volume levels existed stays muted', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('tower-defense-heroes.muted', '1'));
  await openGame(page);
  expect((await audioState(page)).muted).toBe(true);
});

// --- background music ---------------------------------------------------------

function musicState(page: Page): Promise<{ playing: boolean; loop: boolean; volume: number } | null> {
  return page.evaluate(() => {
    const music: any = (window as any).__game.sound.get('music-battle');
    return music ? { playing: music.isPlaying, loop: music.loop, volume: music.volume } : null;
  });
}

test('background music plays in a loop, well below the sound effects', async ({ page }) => {
  // Browsers only let a page make sound after the player does something.
  await page.keyboard.press('2');
  await expect.poll(() => musicState(page), { timeout: 20_000 }).toMatchObject({ playing: true, loop: true });
  expect((await musicState(page))!.volume).toBeCloseTo(0.12);
});

test('the music follows the volume, and stops when the game is silent', async ({ page }) => {
  await page.keyboard.press('2');
  await expect.poll(async () => (await musicState(page))?.playing, { timeout: 20_000 }).toBe(true);
  await page.keyboard.press('m');
  await expect.poll(async () => (await musicState(page))!.volume).toBeCloseTo(0.12 * 0.6);
  await page.keyboard.press('m');
  await page.keyboard.press('m');
  await expect.poll(async () => (await musicState(page))!.playing).toBe(false);
  await page.keyboard.press('m');
  await expect.poll(async () => (await musicState(page))!.playing).toBe(true);
  expect((await musicState(page))!.volume).toBeCloseTo(0.12);
});

test('the music keeps playing from the game back to the menu, without starting twice', async ({ page }) => {
  await page.keyboard.press('2');
  await expect.poll(async () => (await musicState(page))?.playing, { timeout: 20_000 }).toBe(true);
  await page.evaluate(() => (window as any).__game.scene.getScene('game').goToMenu());
  await page.waitForFunction(() => (window as any).__game.scene.isActive('menu'));
  await page.waitForTimeout(300);
  const copies = await page.evaluate(
    () => (window as any).__game.sound.getAll('music-battle').length,
  );
  expect(copies).toBe(1);
  expect((await musicState(page))!.playing).toBe(true);
});
