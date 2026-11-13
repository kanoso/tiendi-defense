import { expect, test } from '@playwright/test';

// What a phone needs to put the game on its home screen as an app.

test('the page offers a web app manifest whose icons all load', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifestUrl = new URL(href!, page.url());
  const manifest = await (await request.get(manifestUrl.href)).json();

  expect(manifest).toMatchObject({
    name: 'Tower Defense Heroes',
    display: 'fullscreen',
    orientation: 'landscape',
  });
  // Relative to the manifest, so it also works under the repository folder on GitHub Pages.
  expect(manifest.start_url).toBe('./');
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(true);

  for (const icon of manifest.icons) {
    const response = await request.get(new URL(icon.src, manifestUrl).href);
    expect(response.ok(), icon.src).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
  }
});

test('an iPhone gets its home screen icon and opens the game without browser bars', async ({ page, request }) => {
  await page.goto('/');
  const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect((await request.get(new URL(touchIcon!, page.url()).href)).ok()).toBe(true);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'TD Heroes');
});
