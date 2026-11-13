import { defineConfig } from '@playwright/test';

const PORT = 5188;
/** The co-op server, which also serves the built game to the co-op tests. */
const COOP_PORT = 8790;
process.env.COOP_PORT = String(COOP_PORT);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // On the build machines a test that fails once is tried again before it
  // counts: a busy machine can make a timing-sensitive test miss.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
  },
  webServer: [
    {
      command: `npx vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: true,
    },
    {
      // Always a fresh build: a server left over from before would test old code.
      command: 'npm run server',
      url: `http://localhost:${COOP_PORT}/health`,
      // Accounts made by the tests are kept apart, in a folder git ignores.
      env: { PORT: String(COOP_PORT), DATA_DIR: '.e2e-data' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
