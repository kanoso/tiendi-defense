import { randomInt, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
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
}

export interface GameServer {
  port: number;
  /** One beat of the clock for every room. */
  tick(): void;
  roomCount(): number;
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

  const http = createServer((request, response) => {
    void handleHttp(request, response);
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

      if (seat === null) {
        enter(message);
      } else {
        act(seat, message);
        flush(seat.room);
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
      room.disconnect(playerId);
      flush(room);
      if (!room.isEmpty()) return;
      if (room.info().state === 'lobby') removeRoom(code, room);
      else emptySince.set(room, Date.now());
    });
    socket.on('error', () => socket.close());
  });

  // --- the game files and a health check -------------------------------------

  async function handleHttp(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/health') {
      const players = [...sockets.values()].reduce((sum, connections) => sum + connections.size, 0);
      response.writeHead(200, { 'content-type': CONTENT_TYPES['.json'], 'cache-control': 'no-store' });
      response.end(JSON.stringify({ ok: true, rooms: rooms.size, players }));
      return;
    }

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
    createReadStream(file).pipe(response);
  }

  // --- the clock --------------------------------------------------------------

  function tick(): void {
    const now = Date.now();
    for (const [code, room] of rooms) {
      room.tick();
      flush(room);
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
