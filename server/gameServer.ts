import { randomInt, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { pipeline } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { createAccountsApi } from './accounts';
import { googleKeysFromGoogle, type GoogleKeys } from './google';
import { findDifficulty } from '../src/data/difficulty';
import type { ServerMessage } from '../src/net/protocol';
import { Room } from '../src/net/room';

// The thin layer between the network and the rooms: it accepts connections,
// finds the room each message is for, and runs the clock. Every rule of the
// game and of playing together lives in `Room`, which knows nothing of this.

export interface GameServerOptions {
  /** Port to listen on. Zero picks any free one. */
  port?: number;
  /** Folder with the built game, served over HTTP. Nothing is served without it. */
  staticDir?: string;
  /** Milliseconds per turn. */
  turnMs?: number;
  /** When false the clock only moves when `tick()` is called. For tests. */
  autoClock?: boolean;
  /** How long a game with no connected players is kept, in case they return. */
  abandonedRoomMs?: number;
  /**
   * Sites, other than the server itself, whose pages may check that it is up:
   * the published game, for instance, when it lives on another address.
   */
  allowedOrigins?: readonly string[];
  /** Folder where player accounts are kept. Without one, accounts are not offered. */
  dataDir?: string;
  /** The game's Google client id. Without it, signing in with Google is not offered. */
  googleClientId?: string;
  /** Where Google's public keys come from. Google itself unless a test says otherwise. */
  googleKeys?: GoogleKeys;
}

export interface GameServer {
  port: number;
  /** One beat of the clock for every room. */
  tick(): void;
  roomCount(): number;
  /** Resolves once every HTTP request being handled has been answered or dropped. */
  settled(): Promise<void>;
  close(): Promise<void>;
}

const MAX_MESSAGE_BYTES = 4096;
const MAX_MESSAGES_PER_SECOND = 120;
const MAX_ROOMS = 200;
/** At most this many turns are played in one go to catch up after a stall. */
const MAX_CATCH_UP_TURNS = 5;
// No I or O: they are too easy to confuse with 1 and 0 when read aloud.
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 4;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

/** Where a connection stands: not in a room yet, or a given player in one. */
interface Seat {
  code: string;
  room: Room;
  playerId: number;
}

export async function createGameServer(options: GameServerOptions = {}): Promise<GameServer> {
  const turnMs = options.turnMs ?? 50;
  const abandonedRoomMs = options.abandonedRoomMs ?? 5 * 60_000;
  const staticRoot = options.staticDir ? path.resolve(options.staticDir) : null;
  const accounts = createAccountsApi({
    dataDir: options.dataDir ? path.resolve(options.dataDir) : null,
    allowedOrigins: options.allowedOrigins ?? [],
    google:
      options.googleClientId && options.dataDir
        ? { clientId: options.googleClientId, keys: options.googleKeys ?? googleKeysFromGoogle() }
        : null,
  });

  const rooms = new Map<string, Room>();
  /** The live connection of each player, per room. */
  const sockets = new Map<Room, Map<number, WebSocket>>();
  /** When each room last lost its final player. */
  const emptySince = new Map<Room, number>();

  // --- delivering what rooms want to say ------------------------------------

  function flush(room: Room): void {
    const connections = sockets.get(room);
    // Many players usually get the very same message: turn it into text once.
    const texts = new Map<ServerMessage, string>();
    for (const { to, message } of room.drain()) {
      const socket = connections?.get(to);
      if (!socket || socket.readyState !== socket.OPEN) continue;
      let text = texts.get(message);
      if (text === undefined) {
        text = JSON.stringify(message);
        texts.set(message, text);
      }
      socket.send(text);
    }
  }

  function sendError(socket: WebSocket, message: string): void {
    socket.send(JSON.stringify({ t: 'error', message } satisfies ServerMessage));
  }

  function newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_LETTERS[randomInt(CODE_LETTERS.length)];
      if (!rooms.has(code)) return code;
    }
  }

  function removeRoom(code: string, room: Room): void {
    rooms.delete(code);
    sockets.delete(room);
    emptySince.delete(room);
  }

  // --- connections ----------------------------------------------------------

  /** HTTP requests still being handled. */
  const inFlight = new Set<Promise<void>>();

  const http = createServer((request, response) => {
    // One request going wrong must never take every game on the server with it.
    const handled = handleHttp(request, response).catch((error: unknown) => {
      const pathname = (request.url ?? '/').split('?')[0];
      console.error(`HTTP ${request.method ?? '?'} ${pathname} failed:`, error);
      if (response.headersSent || response.destroyed || response.writableEnded) {
        response.destroy();
        return;
      }
      response.writeHead(500, { 'content-type': CONTENT_TYPES['.json'], 'cache-control': 'no-store' });
      response.end(JSON.stringify({ error: 'Error interno' }));
    });
    inFlight.add(handled);
    const done = (): void => {
      inFlight.delete(handled);
    };
    handled.then(done, done);
  });
  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_MESSAGE_BYTES });

  wss.on('connection', (socket) => {
    let seat: Seat | null = null;
    let windowStart = Date.now();
    let messagesInWindow = 0;

    const take = (code: string, room: Room, playerId: number): void => {
      seat = { code, room, playerId };
      let connections = sockets.get(room);
      if (!connections) sockets.set(room, (connections = new Map()));
      // The same player connecting again replaces their older connection.
      connections.get(playerId)?.close();
      connections.set(playerId, socket);
      emptySince.delete(room);
    };

    socket.on('message', (data) => {
      // A flood from one connection is dropped rather than obeyed.
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        messagesInWindow = 0;
      }
      if (++messagesInWindow > MAX_MESSAGES_PER_SECOND) return;

      let message: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(String(data));
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return;
        message = parsed as Record<string, unknown>;
      } catch {
        return;
      }

      // A bug in a room is logged and the message dropped; thrown out of here,
      // it would stop the whole server. The message itself is never logged:
      // it may carry a player's token.
      try {
        if (seat === null) {
          enter(message);
        } else {
          act(seat, message);
          flush(seat.room);
        }
      } catch (error) {
        // Quoted and cut short: the type comes from the client, and must
        // neither throw here nor forge lines in the log.
        const type = typeof message.t === 'string' ? JSON.stringify(message.t.slice(0, 20)) : 'invalid';
        console.error(`WebSocket message ${type} failed:`, error);
      }
    });

    /** Messages from someone not yet in a room: create one, join one or come back. */
    function enter(message: Record<string, unknown>): void {
      const name = typeof message.name === 'string' ? message.name : '';
      const code = typeof message.code === 'string' ? message.code.trim().toUpperCase() : '';

      if (message.t === 'create') {
        if (rooms.size >= MAX_ROOMS) return sendError(socket, 'El servidor está lleno, prueba más tarde');
        const room = new Room({
          code: newCode(),
          mapId: typeof message.mapId === 'string' ? message.mapId : '',
          difficulty: findDifficulty(typeof message.difficulty === 'string' ? message.difficulty : null).id,
          seed: randomInt(2 ** 32),
          newToken: randomUUID,
        });
        const result = room.join(name);
        if (!result.ok) return sendError(socket, result.error);
        rooms.set(room.info().code, room);
        take(room.info().code, room, result.player.id);
        return flush(room);
      }

      if (message.t === 'join' || message.t === 'rejoin') {
        const room = rooms.get(code);
        if (!room) return sendError(socket, 'No existe una sala con ese código');
        const result =
          message.t === 'join'
            ? room.join(name)
            : room.rejoin(typeof message.token === 'string' ? message.token : '');
        if (!result.ok) {
          room.drain();
          return sendError(socket, result.error);
        }
        take(code, room, result.player.id);
        return flush(room);
      }
    }

    /** Messages from a player already in a room. */
    function act({ room, playerId }: Seat, message: Record<string, unknown>): void {
      switch (message.t) {
        case 'ready':
          return room.setReady(playerId, message.ready === true);
        case 'pick':
          if (typeof message.heroId === 'number') room.pick(playerId, message.heroId);
          return;
        case 'command':
          return room.submit(playerId, message.command);
        case 'signal':
          return room.signal(playerId, message.signal);
        case 'hash':
          if (typeof message.turn === 'number' && typeof message.hash === 'number') {
            room.reportHash(playerId, message.turn, message.hash);
          }
          return;
      }
    }

    socket.on('close', () => {
      if (seat === null) return;
      const { code, room, playerId } = seat;
      const connections = sockets.get(room);
      // A newer connection of the same player may already have taken the seat.
      if (connections?.get(playerId) !== socket) return;
      connections.delete(playerId);
      try {
        room.disconnect(playerId);
        flush(room);
      } catch (error) {
        console.error(`Room ${code} failed while a player left:`, error);
      }
      // Apart from the above, so a room that failed there is still tidied up.
      try {
        if (!room.isEmpty()) return;
        if (room.info().state === 'lobby') removeRoom(code, room);
        else emptySince.set(room, Date.now());
      } catch (error) {
        console.error(`Room ${code} failed while being tidied up:`, error);
      }
    });
    socket.on('error', () => socket.close());
  });

  // --- the game files and a health check -------------------------------------

  async function handleHttp(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let url: URL;
    try {
      url = new URL(request.url ?? '/', 'http://localhost');
    } catch {
      // A path such as "//" is no address at all.
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Bad request');
      return;
    }
    if (url.pathname === '/health') {
      const players = [...sockets.values()].reduce((sum, connections) => sum + connections.size, 0);
      const origin = request.headers.origin;
      const allowed = origin !== undefined && (options.allowedOrigins ?? []).includes(origin);
      response.writeHead(200, {
        'content-type': CONTENT_TYPES['.json'],
        'cache-control': 'no-store',
        vary: 'Origin',
        ...(allowed ? { 'access-control-allow-origin': origin } : {}),
      });
      response.end(
        JSON.stringify({
          ok: true,
          rooms: rooms.size,
          players,
          accounts: Boolean(options.dataDir),
          // Public by nature: the page needs it to show Google's sign-in button.
          google: options.dataDir ? (options.googleClientId ?? null) : null,
        }),
      );
      return;
    }
    if (await accounts(request, response, url.pathname)) return;

    const file = staticRoot && (await resolveFile(staticRoot, url.pathname));
    if (!file) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
      // The page itself is always fresh; its assets carry a hash in their name.
      'cache-control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600',
    });
    // Unlike `pipe`, a failed read (or a client gone mid-download) closes both
    // ends instead of raising an error nobody listens for.
    pipeline(createReadStream(file), response, () => {});
  }

  // --- the clock --------------------------------------------------------------

  function tick(): void {
    const now = Date.now();
    for (const [code, room] of rooms) {
      try {
        room.tick();
        flush(room);
      } catch (error) {
        // A room that breaks would break again on every beat: it is closed, so
        // the other rooms keep playing.
        console.error(`Room ${code} failed and was closed:`, error);
        for (const socket of sockets.get(room)?.values() ?? []) socket.close(1011, 'Error interno');
        removeRoom(code, room);
        continue;
      }
      const since = emptySince.get(room);
      if (since !== undefined && now - since >= abandonedRoomMs) removeRoom(code, room);
    }
  }

  let timer: NodeJS.Timeout | null = null;
  if (options.autoClock !== false) {
    const startedAt = Date.now();
    let played = 0;
    // Timers drift and stall; counting the turns that should have happened by
    // now keeps the game at its true pace.
    timer = setInterval(() => {
      const due = Math.floor((Date.now() - startedAt) / turnMs);
      if (due - played > MAX_CATCH_UP_TURNS) played = due - MAX_CATCH_UP_TURNS;
      while (played < due) {
        tick();
        played++;
      }
    }, turnMs / 2);
  }

  await new Promise<void>((resolve) => http.listen(options.port ?? 0, resolve));

  return {
    port: (http.address() as AddressInfo).port,
    tick,
    roomCount: () => rooms.size,
    async settled() {
      while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
    },
    async close() {
      if (timer) clearInterval(timer);
      for (const socket of wss.clients) socket.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

/** The file a web path points at, or null if there is none inside `root`. */
async function resolveFile(root: string, urlPath: string): Promise<string | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const target = path.resolve(root, `.${path.posix.normalize(`/${decoded}`)}`);
  // Whatever the path says, never step outside the folder being served.
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  if (decoded.includes('..')) return null;

  for (const candidate of [target, path.join(target, 'index.html')]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Not there: try the next candidate.
    }
  }
  return null;
}
