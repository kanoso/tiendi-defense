import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../src/net/protocol';
import { createGameServer, type GameServer } from './gameServer';

// Real connections against a real server on a spare port. The clock is driven
// by hand (`server.tick()`), so nothing here depends on timing.

let server: GameServer;
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  await server?.close();
});

async function start(options: Parameters<typeof createGameServer>[0] = {}): Promise<void> {
  server = await createGameServer({ port: 0, autoClock: false, ...options });
}

/** A player's connection, remembering everything the server sends it. */
class Client {
  readonly received: ServerMessage[] = [];
  private waiting: (() => void)[] = [];

  private constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => {
      this.received.push(JSON.parse(String(data)) as ServerMessage);
      for (const wake of this.waiting.splice(0)) wake();
    });
  }

  static async connect(): Promise<Client> {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    return new Client(socket);
  }

  send(message: ClientMessage | string): void {
    this.socket.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  /** The next message of a kind that arrives after the ones already seen. */
  async next<T extends ServerMessage['t']>(type: T): Promise<Extract<ServerMessage, { t: T }>> {
    const from = this.received.length;
    for (let waited = 0; waited < 200; waited++) {
      const found = this.received.slice(from).find((message) => message.t === type);
      if (found) return found as Extract<ServerMessage, { t: T }>;
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
        setTimeout(resolve, 20);
      });
    }
    throw new Error(`No "${type}" message arrived`);
  }

  /** The most recent message of a kind, among all received so far. */
  last<T extends ServerMessage['t']>(type: T): Extract<ServerMessage, { t: T }> | undefined {
    const matches = this.received.filter((message) => message.t === type);
    return matches[matches.length - 1] as Extract<ServerMessage, { t: T }> | undefined;
  }
}

/** Creates a room and returns its host, already inside. */
async function host(name = 'Ana'): Promise<{ client: Client; code: string; token: string }> {
  const client = await Client.connect();
  const joined = client.next('joined');
  client.send({ t: 'create', name, mapId: 'meadow', difficulty: 'normal' });
  const message = await joined;
  return { client, code: message.room.code, token: message.token };
}

async function guest(code: string, name = 'Beto'): Promise<{ client: Client; token: string }> {
  const client = await Client.connect();
  const joined = client.next('joined');
  client.send({ t: 'join', code, name });
  return { client, token: (await joined).token };
}

/** Lets the server deal with everything already sent to it. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 40));
}

describe('rooms', () => {
  it('creates a room with a short code to share', async () => {
    await start();
    const { code, client } = await host();
    expect(code).toMatch(/^[A-Z]{4}$/);
    expect(client.last('joined')?.room.players.map((p) => p.name)).toEqual(['Ana']);
  });

  it('lets a second player in with the code, in any letter case', async () => {
    await start();
    const { code, client: ana } = await host();
    const seen = ana.next('room');
    await guest(code.toLowerCase());
    expect((await seen).room.players.map((p) => p.name)).toEqual(['Ana', 'Beto']);
  });

  it('gives different rooms different codes', async () => {
    await start();
    const codes = new Set<string>();
    for (let i = 0; i < 12; i++) codes.add((await host()).code);
    expect(codes.size).toBe(12);
  });

  it('explains when the code matches no room', async () => {
    await start();
    const client = await Client.connect();
    const error = client.next('error');
    client.send({ t: 'join', code: 'ZZZZ', name: 'Beto' });
    expect((await error).message).toContain('sala');
  });

  it('refuses a fifth player', async () => {
    await start();
    const { code } = await host();
    await guest(code, 'B');
    await guest(code, 'C');
    await guest(code, 'D');
    const late = await Client.connect();
    const error = late.next('error');
    late.send({ t: 'join', code, name: 'E' });
    expect((await error).message).toContain('llena');
  });

  it('forgets a room when its last player leaves the lobby', async () => {
    await start();
    const { client } = await host();
    expect(server.roomCount()).toBe(1);
    client.socket.close();
    await settle();
    expect(server.roomCount()).toBe(0);
  });
});

describe('playing', () => {
  async function twoPlayersInGame() {
    const ana = await host();
    const beto = await guest(ana.code);
    const started = [ana.client.next('start'), beto.client.next('start')];
    ana.client.send({ t: 'ready', ready: true });
    beto.client.send({ t: 'ready', ready: true });
    await Promise.all(started);
    return { ana, beto };
  }

  it('starts the game for everyone once all are ready', async () => {
    await start();
    const { ana, beto } = await twoPlayersInGame();
    const fromAna = ana.client.last('start')!;
    const fromBeto = beto.client.last('start')!;
    expect(fromBeto.start).toEqual(fromAna.start);
    expect(fromAna.start.playerCount).toBe(2);
    expect(fromAna.room.players.map((p) => p.heroes)).toEqual([
      [1, 3],
      [2, 4],
    ]);
  });

  it('delivers one player\'s order to both in the same turn', async () => {
    await start();
    const { ana, beto } = await twoPlayersInGame();
    ana.client.send({ t: 'command', command: { type: 'buildTower', slot: 1, tower: 'archery' } });
    await settle();
    const turns = [ana.client.next('turn'), beto.client.next('turn')];
    server.tick();
    const [forAna, forBeto] = await Promise.all(turns);
    expect(forAna.commands).toEqual([{ type: 'buildTower', slot: 1, tower: 'archery' }]);
    expect(forBeto).toEqual(forAna);
  });

  it('passes a signal on the map to the other player at once, without a turn', async () => {
    await start();
    const { ana, beto } = await twoPlayersInGame();
    const seen = beto.client.next('signal');
    ana.client.send({ t: 'signal', signal: { kind: 'help', x: 120, y: 80 } });
    expect(await seen).toMatchObject({ t: 'signal', kind: 'help', x: 120, y: 80 });
  });

  it('numbers the turns in order', async () => {
    await start();
    const { ana } = await twoPlayersInGame();
    for (let i = 0; i < 3; i++) server.tick();
    await settle();
    const turns = ana.client.received.filter((m) => m.t === 'turn').map((m) => (m as { turn: number }).turn);
    expect(turns).toEqual([0, 1, 2]);
  });

  it('survives garbage without dropping the player', async () => {
    await start();
    const { ana } = await twoPlayersInGame();
    ana.client.send('this is not json');
    ana.client.send('{"t":"dance"}');
    ana.client.send('[1,2,3]');
    ana.client.send(JSON.stringify({ t: 'command', command: { type: 'moveHero', heroId: 'x' } }));
    await settle();
    const turn = ana.client.next('turn');
    server.tick();
    expect((await turn).commands).toEqual([]);
    expect(ana.client.socket.readyState).toBe(WebSocket.OPEN);
  });

  it('lets a player who lost the connection back into the same game', async () => {
    await start();
    const { ana, beto } = await twoPlayersInGame();
    server.tick();
    server.tick();
    beto.client.socket.close();
    await settle();
    expect(ana.client.last('room')?.room.players[1].connected).toBe(false);

    const back = await Client.connect();
    const snapshot = back.next('snapshot');
    back.send({ t: 'rejoin', code: ana.code, token: beto.token });
    expect((await snapshot).turn).toBe(1);
    await settle();
    expect(ana.client.last('room')?.room.players[1].connected).toBe(true);

    // And from then on they receive turns like everyone else.
    const turn = back.next('turn');
    server.tick();
    expect((await turn).turn).toBe(2);
  });

  it('keeps a game alive while its players are away, to let them come back', async () => {
    await start();
    const { ana, beto } = await twoPlayersInGame();
    ana.client.socket.close();
    beto.client.socket.close();
    await settle();
    expect(server.roomCount()).toBe(1);
  });

  it('drops an abandoned game after its grace period', async () => {
    await start({ abandonedRoomMs: 0 });
    const { ana, beto } = await twoPlayersInGame();
    ana.client.socket.close();
    beto.client.socket.close();
    await settle();
    server.tick();
    expect(server.roomCount()).toBe(0);
  });
});

describe('serving the game', () => {
  it('lets a page from an allowed site ask whether the server is up', async () => {
    await start({ allowedOrigins: ['https://example.github.io'] });
    const response = await fetch(`http://127.0.0.1:${server.port}/health`, {
      headers: { origin: 'https://example.github.io' },
    });
    expect(response.headers.get('access-control-allow-origin')).toBe('https://example.github.io');
    expect(response.headers.get('vary')).toContain('Origin');
  });

  it('does not open the health check to any other site', async () => {
    await start({ allowedOrigins: ['https://example.github.io'] });
    const response = await fetch(`http://127.0.0.1:${server.port}/health`, {
      headers: { origin: 'https://elsewhere.example' },
    });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('opens it to no other site unless told to', async () => {
    await start();
    const response = await fetch(`http://127.0.0.1:${server.port}/health`, {
      headers: { origin: 'https://example.github.io' },
    });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers a health check', async () => {
    await start();
    const response = await fetch(`http://127.0.0.1:${server.port}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, rooms: 0 });
  });

  it('answers 404 for pages when it has no game files to serve', async () => {
    await start();
    const response = await fetch(`http://127.0.0.1:${server.port}/`);
    expect(response.status).toBe(404);
  });

  it('never serves files from outside its folder', async () => {
    await start({ staticDir: 'public' });
    const response = await fetch(`http://127.0.0.1:${server.port}/..%2Fpackage.json`);
    expect(response.status).toBe(404);
    const dotted = await fetch(`http://127.0.0.1:${server.port}/assets/../../package.json`);
    expect(dotted.status).toBe(404);
  });

  it('serves the app manifest with its own type, so phones can install the game', async () => {
    await start({ staticDir: 'public' });
    const response = await fetch(`http://127.0.0.1:${server.port}/manifest.webmanifest`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/manifest+json; charset=utf-8');
  });

  it('serves the files of the game when it has them', async () => {
    await start({ staticDir: 'public' });
    const response = await fetch(`http://127.0.0.1:${server.port}/assets/CREDITS.md`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Kenney');
  });
});
