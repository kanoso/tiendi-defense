import { defineConfig } from 'vitest/config';

// Runs the balance report (`npm run balance`), kept apart from the unit tests.
export default defineConfig({
  test: {
    include: ['tools/**/*.report.ts'],
    // Let the report print straight to the terminal.
    disableConsoleIntercept: true,
    // The report plays dozens of whole games; it needs far more than a unit test.
    testTimeout: 300_000,
  },
});
