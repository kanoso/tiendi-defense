import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests live next to the logic. Browser tests in e2e/ run with Playwright.
    include: ['src/**/*.test.ts'],
  },
});
