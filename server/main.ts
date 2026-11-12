import { createGameServer } from './gameServer';

// Entry point of the co-op server. Configured by environment variables:
//   PORT        port to listen on (default 8787)
//   STATIC_DIR  folder with the built game to serve (default "dist")

const port = Number(process.env.PORT ?? 8787);
const staticDir = process.env.STATIC_DIR ?? 'dist';

const server = await createGameServer({ port, staticDir });
console.log(`Tower Defense Heroes server listening on port ${server.port}, serving "${staticDir}"`);

// Stop cleanly when the container is told to.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
