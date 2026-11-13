import { build } from 'esbuild';

// Bundles the co-op server into one file that runs with nothing but Node.
await build({
  entryPoints: ['server/main.ts'],
  outfile: 'server-dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Optional native speed-ups of the WebSocket library; it works without them.
  external: ['bufferutil', 'utf-8-validate'],
  // The WebSocket library is written the older way and calls `require`, which
  // a module file does not have unless it is made here.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
