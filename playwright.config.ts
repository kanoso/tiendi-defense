import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const PORT = 5188;
/** The co-op server, which also serves the built game to the co-op tests. */
const COOP_PORT = 8790;
process.env.COOP_PORT = String(COOP_PORT);

// Signing in with Google is tested with keys of our own: the test server trusts
// this public key, and the tests sign tokens with the private one. Made once,
// so the config can be read again by every test worker.
export const E2E_GOOGLE_CLIENT_ID = 'e2e-client.apps.googleusercontent.com';
const GOOGLE_KEYS = '.e2e-data/google-keys.json';
export const E2E_GOOGLE_PRIVATE_KEY = '.e2e-data/google-private.pem';
if (!existsSync(E2E_GOOGLE_PRIVATE_KEY)) {
  mkdirSync('.e2e-data', { recursive: true });
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  writeFileSync(GOOGLE_KEYS, JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'e2e-key' }] }));
  writeFileSync(E2E_GOOGLE_PRIVATE_KEY, privateKey.export({ type: 'pkcs8', format: 'pem' }));
}

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // A `test.only` left in by mistake must not quietly skip the rest on the build machines.
  forbidOnly: !!process.env.CI,
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
      env: {
        PORT: String(COOP_PORT),
        DATA_DIR: '.e2e-data',
        GOOGLE_CLIENT_ID: E2E_GOOGLE_CLIENT_ID,
        GOOGLE_KEYS_FILE: GOOGLE_KEYS,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
