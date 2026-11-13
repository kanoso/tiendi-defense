import { defineConfig } from '@playwright/test';

const PORT = 5188;
/** The co-op server, which also serves the built game to the co-op tests. */
const COOP_PORT = 8790;
process.env.COOP_PORT = String(COOP_PORT);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
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
      env: { PORT: String(COOP_PORT) },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
