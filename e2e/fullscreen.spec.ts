import { expect, test, type Page } from '@playwright/test';
import { clickMap, openGame } from './game';

/* eslint-disable @typescript-eslint/no-explicit-any */

function isFullscreen(page: Page): Promise<boolean> {
  return page.evaluate(() => document.fullscreenElement !== null);
}

test('the game has a button that fills the screen and gives it back', async ({ page }) => {
  await openGame(page);
  const button = await page.evaluate(() => {
    const scene: any = (window as any).__game.scene.getScene('game');
    const center = scene.fullscreenButton.getCenter();
    return { x: center.x, y: center.y };
  });

  await clickMap(page, button.x, button.y);
  await expect.poll(() => isFullscreen(page)).toBe(true);

  // The canvas was resized, so the button has to be found again on screen.
  await clickMap(page, button.x, button.y);
  await expect.poll(() => isFullscreen(page)).toBe(false);
});

test('the map picker has a full screen button too, and the game stays full screen', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(
    () => (window as any).__game?.scene.getScene('menu')?.fullscreenButton != null,
  );
  const menu = await page.evaluate(() => {
    const scene: any = (window as any).__game.scene.getScene('menu');
    return { button: scene.fullscreenButton, firstMap: scene.cards[0] };
  });

  await clickMap(page, menu.button.x, menu.button.y);
  await expect.poll(() => isFullscreen(page)).toBe(true);

  await clickMap(page, menu.firstMap.x, menu.firstMap.y);
  await page.waitForFunction(() => (window as any).__game.scene.isActive('game'));
  expect(await isFullscreen(page)).toBe(true);
});
