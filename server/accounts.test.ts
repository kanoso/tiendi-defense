import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyProgress, recordVictory, type Progress } from '../src/progress/progress';
import { normalizeCode, newPlayerCode } from './accounts';
import { createGameServer, type GameServer } from './gameServer';

// Player codes against a real server that keeps accounts in a real folder.

let server: GameServer;
let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'tdh-accounts-'));
});

afterEach(async () => {
  await server?.close();
  await rm(dataDir, { recursive: true, force: true });
});

async function start(options: Parameters<typeof createGameServer>[0] = {}): Promise<void> {
  server = await createGameServer({ port: 0, autoClock: false, dataDir, ...options });
}

function api(
  route: string,
  init: { method?: string; code?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Response> {
  return fetch(`http://127.0.0.1:${server.port}${route}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(init.code ? { authorization: `Bearer ${init.code}` } : {}),
      ...init.headers,
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

const won = (mapId: string, stars: number): Progress =>
  recordVictory(emptyProgress(), mapId, 'normal', stars);

async function createAccount(progress: Progress = emptyProgress()): Promise<string> {
  const response = await api('/api/accounts', { method: 'POST', body: { progress } });
  expect(response.status).toBe(201);
  return ((await response.json()) as { code: string }).code;
}

describe('player codes', () => {
  it('look like XXXX-XXXX, without characters that are easy to confuse', () => {
    for (let i = 0; i < 200; i++) {
      const code = newPlayerCode();
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it('are read the way a person types them', () => {
    expect(normalizeCode(' kxt4 9qpm ')).toBe('KXT4-9QPM');
    expect(normalizeCode('KXT49QPM')).toBe('KXT4-9QPM');
    expect(normalizeCode('KXT4-9QP')).toBeNull();
    expect(normalizeCode('KXT4-9QP0')).toBeNull();
    expect(normalizeCode(42)).toBeNull();
  });
});

describe('keeping progress with a code', () => {
  it('creates an account with the progress it is given and hands back its code', async () => {
    await start();
    const code = await createAccount(won('meadow', 2));
    const response = await api('/api/progress', { code });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { progress: Progress };
    expect(body.progress.stars).toEqual({ meadow: { normal: 2 } });
  });

  it('accepts the code however it is typed', async () => {
    await start();
    const code = await createAccount(won('meadow', 2));
    const response = await api('/api/progress', { code: code.toLowerCase().replace('-', ' ') });
    expect(response.status).toBe(200);
  });

  it('joins what a device sends with what was kept, instead of overwriting it', async () => {
    await start();
    const code = await createAccount(won('meadow', 3));
    const response = await api('/api/progress', { method: 'PUT', code, body: { progress: won('canyon', 1) } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { progress: Progress };
    expect(body.progress.stars).toEqual({ meadow: { normal: 3 }, canyon: { normal: 1 } });
    const again = (await (await api('/api/progress', { code })).json()) as { progress: Progress };
    expect(again.progress).toEqual(body.progress);
  });

  it('says so when a code matches no account', async () => {
    await start();
    expect((await api('/api/progress', { code: 'AAAA-BBBB' })).status).toBe(404);
    expect(
      (await api('/api/progress', { method: 'PUT', code: 'AAAA-BBBB', body: { progress: emptyProgress() } }))
        .status,
    ).toBe(404);
    expect((await api('/api/progress')).status).toBe(401);
  });

  it('drops whatever in a progress does not make sense', async () => {
    await start();
    const code = await createAccount({ ...emptyProgress(), stars: { meadow: { normal: 99 } } } as Progress);
    const body = (await (await api('/api/progress', { code })).json()) as { progress: Progress };
    expect(body.progress.stars).toEqual({});
  });

  it('refuses a body that is not a progress, or far too big', async () => {
    await start();
    expect((await api('/api/accounts', { method: 'POST', body: 'hello' })).status).toBe(400);
    const huge = { progress: { ...emptyProgress(), padding: 'x'.repeat(100_000) } };
    expect((await api('/api/accounts', { method: 'POST', body: huge })).status).toBe(413);
  });

  it('never writes the codes themselves to disk', async () => {
    await start();
    const code = await createAccount(won('meadow', 2));
    const files = await readdir(dataDir, { recursive: true });
    const contents = await Promise.all(
      files.filter((file) => file.endsWith('.json')).map((file) => readFile(path.join(dataDir, file), 'utf8')),
    );
    expect(files.join(' ')).not.toContain(code);
    expect(files.join(' ')).not.toContain(code.replace('-', ''));
    for (const text of contents) expect(text).not.toContain(code);
  });

  it('keeps accounts when the server restarts', async () => {
    await start();
    const code = await createAccount(won('meadow', 2));
    await server.close();
    await start();
    expect((await api('/api/progress', { code })).status).toBe(200);
  });

  it('slows down whoever keeps trying codes that do not exist', async () => {
    await start();
    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) statuses.push((await api('/api/progress', { code: 'AAAA-BBBB' })).status);
    expect(statuses.slice(0, 5)).toEqual([404, 404, 404, 404, 404]);
    expect(statuses.at(-1)).toBe(429);
  });

  it('lets the published site use it from another address', async () => {
    await start({ allowedOrigins: ['https://example.github.io'] });
    const preflight = await api('/api/progress', {
      method: 'OPTIONS',
      headers: { origin: 'https://example.github.io', 'access-control-request-method': 'PUT' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://example.github.io');
    expect(preflight.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  it('is not offered when the server has nowhere to keep accounts', async () => {
    server = await createGameServer({ port: 0, autoClock: false });
    expect((await api('/api/accounts', { method: 'POST', body: { progress: emptyProgress() } })).status).toBe(404);
    const health = (await (await api('/health')).json()) as { accounts: boolean };
    expect(health.accounts).toBe(false);
  });

  it('tells in its health check that it keeps accounts', async () => {
    await start();
    const health = (await (await api('/health')).json()) as { accounts: boolean };
    expect(health.accounts).toBe(true);
  });
});
