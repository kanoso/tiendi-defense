import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { WebSocket } from 'ws';
import { emptyProgress } from '../src/progress/progress';
import { Room } from '../src/net/room';
import { newPlayerCode } from './accounts';
import { createGameServer, type GameServer } from './gameServer';

// One request, connection or room going wrong must never take the whole
// server down: every other game on it would be lost. These tests break things
// on purpose and then check that the server still answers.

// A file the server finds but cannot read, as when it vanishes mid-request.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const { Readable } = await import('node:stream');
  return {
    ...actual,
    createReadStream: ((file: string, options?: Parameters<typeof actual.createReadStream>[1]) =>
      String(file).endsWith('unreadable.txt')
        ? new Readable({
            read() {
              this.destroy(new Error('simulated read failure'));
            },
          })
        : actual.createReadStream(file, options)) as typeof actual.createReadStream,
  };
});

let server: GameServer;
let dataDir: string;
let staticDir: string;
let googleKeys: (kid: string) => Promise<JsonWebKey | null>;
const sockets: WebSocket[] = [];
/** Errors nobody caught: on a real server, each one would have killed the process. */
const escaped: unknown[] = [];
const recordEscaped = (error: unknown): void => {
  escaped.push(error);
};
let errorLog: MockInstance<typeof console.error>;

beforeEach(async () => {
  escaped.length = 0;
  process.on('unhandledRejection', recordEscaped);
  process.on('uncaughtException', recordEscaped);
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  dataDir = await mkdtemp(path.join(tmpdir(), 'tdh-failures-data-'));
  staticDir = await mkdtemp(path.join(tmpdir(), 'tdh-failures-static-'));
  await writeFile(path.join(staticDir, 'unreadable.txt'), 'never served');
  googleKeys = async () => null;
  server = await createGameServer({
    port: 0,
    autoClock: false,
    dataDir,
    staticDir,
    googleClientId: 'test-client',
    googleKeys: (kid) => googleKeys(kid),
  });
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await server.close();
  vi.restoreAllMocks();
  process.off('unhandledRejection', recordEscaped);
  process.off('uncaughtException', recordEscaped);
  await rm(dataDir, { recursive: true, force: true });
  await rm(staticDir, { recursive: true, force: true });
});

const url = (route: string): string => `http://127.0.0.1:${server.port}${route}`;

/**
 * Whether the server still answers, once every request it was handling has
 * run to its end: anything that went wrong there has surfaced by then.
 */
async function expectServerAlive(): Promise<void> {
  await server.settled();
  const response = await fetch(url('/health'));
  expect(response.status).toBe(200);
  expect(((await response.json()) as { ok: boolean }).ok).toBe(true);
  expect(escaped).toEqual([]);
}

/**
 * Starts a request with a body, sends part of it and then drops the connection,
 * like a phone losing signal mid-upload.
 */
async function abortMidBody(method: string, route: string, headers: Record<string, string> = {}): Promise<void> {
  const socket = connect(server.port, '127.0.0.1');
  await once(socket, 'connect');
  const head = Object.entries({
    host: 'localhost',
    'content-type': 'application/json',
    'content-length': '1000',
    // The server answers "100 Continue" as it hands the request to its handler,
    // which by then is already waiting for the body.
    expect: '100-continue',
    ...headers,
  })
    .map(([name, value]) => `${name}: ${value}\r\n`)
    .join('');
  socket.write(`${method} ${route} HTTP/1.1\r\n${head}\r\n`);
  await once(socket, 'data');
  socket.write('{"progress":');
  const closed = once(socket, 'close');
  socket.resetAndDestroy();
  await closed;
}

const base64url = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
const SOME_GOOGLE_TOKEN = `${base64url({ alg: 'RS256', kid: 'key-1' })}.${base64url({ sub: '1' })}.c2lnbmF0dXJl`;

describe('a client that hangs up halfway through sending a body', () => {
  it.each([
    ['POST', '/api/accounts', false],
    ['PUT', '/api/progress', true],
    ['PUT', '/api/saved-game', true],
    ['POST', '/api/google', false],
  ])('%s %s leaves the server running', async (method, route, needsAccount) => {
    let headers: Record<string, string> = {};
    if (needsAccount) {
      const created = await fetch(url('/api/accounts'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ progress: emptyProgress() }),
      });
      headers = { authorization: `Bearer ${((await created.json()) as { code: string }).code}` };
    }

    await abortMidBody(method, route, headers);

    await expectServerAlive();
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('does not touch the account it was sending to', async () => {
    const code = newPlayerCode();
    await abortMidBody('PUT', '/api/progress', { authorization: `Bearer ${code}` });

    await expectServerAlive();
    expect(errorLog).not.toHaveBeenCalled();
    const response = await fetch(url('/api/progress'), { headers: { authorization: `Bearer ${code}` } });
    expect(response.status).toBe(404);
  });
});

describe('a request whose handler fails', () => {
  it('is answered with an internal error, logged once without secrets, and the server keeps running', async () => {
    googleKeys = async () => {
      throw new Error('keys unavailable');
    };

    const response = await fetch(url('/api/google?from=test'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: SOME_GOOGLE_TOKEN, progress: emptyProgress() }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Error interno' });
    expect(errorLog).toHaveBeenCalledTimes(1);
    const logged = errorLog.mock.calls[0].map(String).join(' ');
    expect(logged).toContain('POST /api/google');
    expect(logged).not.toContain('from=test');
    expect(logged).not.toContain(SOME_GOOGLE_TOKEN);
    await expectServerAlive();
  });

  it('answers a path that is not a valid address with a bad request', async () => {
    const socket = connect(server.port, '127.0.0.1');
    await once(socket, 'connect');
    socket.write('GET // HTTP/1.1\r\nhost: localhost\r\nconnection: close\r\n\r\n');
    let reply = '';
    socket.on('data', (chunk) => (reply += String(chunk)));
    await once(socket, 'close');

    expect(reply).toMatch(/^HTTP\/1\.1 400 /);
    await expectServerAlive();
  });

  it('closes the download of a file that cannot be read and keeps running', async () => {
    await expect(fetch(url('/unreadable.txt')).then((response) => response.text())).rejects.toThrow();

    await expectServerAlive();
  });
});

/** A connection to the server, with its room already created. */
async function hostRoom(): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
  sockets.push(socket);
  await once(socket, 'open');
  const joined = new Promise<void>((resolve) => {
    socket.on('message', (data) => {
      if ((JSON.parse(String(data)) as { t: string }).t === 'joined') resolve();
    });
  });
  socket.send(JSON.stringify({ t: 'create', name: 'Ana', mapId: 'meadow', difficulty: 'normal' }));
  await joined;
  return socket;
}

describe('a room that breaks', () => {
  it('while handling a message is logged and the connection stays open', async () => {
    const socket = await hostRoom();
    vi.spyOn(Room.prototype, 'setReady').mockImplementation(() => {
      throw new Error('room bug');
    });

    socket.send(JSON.stringify({ t: 'ready', ready: true }));

    await vi.waitFor(() => expect(errorLog).toHaveBeenCalledTimes(1));
    expect(socket.readyState).toBe(WebSocket.OPEN);
    expect(server.roomCount()).toBe(1);
    await expectServerAlive();
  });

  it('while a player leaves is logged and the server keeps running', async () => {
    const socket = await hostRoom();
    vi.spyOn(Room.prototype, 'disconnect').mockImplementation(() => {
      throw new Error('room bug');
    });

    socket.close();

    await vi.waitFor(() => expect(errorLog).toHaveBeenCalledTimes(1));
    await expectServerAlive();
  });

  it('while cleaning up after the last player left is logged and the server keeps running', async () => {
    const socket = await hostRoom();
    vi.spyOn(Room.prototype, 'isEmpty').mockImplementation(() => {
      throw new Error('room bug');
    });

    socket.close();

    await vi.waitFor(() => expect(errorLog).toHaveBeenCalledTimes(1));
    await expectServerAlive();
  });

  it.each([
    ['an object that cannot become text', { toString: 1 }, 'invalid'],
    ['text with a line break', 'ready\nFAKE LOG LINE', '"ready\\nFAKE LOG'],
  ])('for a message whose type is %s, logs a safe line', async (_, type, shown) => {
    const socket = await hostRoom();
    vi.spyOn(Room.prototype, 'drain').mockImplementation(() => {
      throw new Error('room bug');
    });

    socket.send(JSON.stringify({ t: type }));

    await vi.waitFor(() => expect(errorLog).toHaveBeenCalledTimes(1));
    const line = String(errorLog.mock.calls[0][0]);
    expect(line).toContain(shown);
    expect(line).not.toContain('\n');
    await expectServerAlive();
  });

  it('on a beat of the clock is closed, and the other rooms keep playing', async () => {
    const broken = await hostRoom();
    const healthy = await hostRoom();
    vi.spyOn(Room.prototype, 'tick').mockImplementationOnce(() => {
      throw new Error('simulation bug');
    });
    const brokenClosed = once(broken, 'close');

    expect(() => server.tick()).not.toThrow();

    const [code] = (await brokenClosed) as [number];
    expect(code).toBe(1011);
    expect(server.roomCount()).toBe(1);
    expect(healthy.readyState).toBe(WebSocket.OPEN);
    expect(errorLog).toHaveBeenCalledTimes(1);
    await expectServerAlive();
  });
});
