import { createGameServer } from './gameServer';

// Entry point of the co-op server. Configured by environment variables:
//   PORT        port to listen on (default 8787)
//   STATIC_DIR  folder with the built game to serve (default "dist")
//   ALLOWED_ORIGINS  comma-separated sites whose pages may use this server,
//                    besides the game it serves itself (default none)

const port = Number(process.env.PORT ?? 8787);
const staticDir = process.env.STATIC_DIR ?? 'dist';
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const server = await createGameServer({ port, staticDir, allowedOrigins });
console.log(`Tower Defense Heroes server listening on port ${server.port}, serving "${staticDir}"`);

// Stop cleanly when the container is told to.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
