import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests live next to the logic, the balance bots' included. Browser
    // tests in e2e/ run with Playwright.
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'tools/**/*.test.ts'],
  },
});
