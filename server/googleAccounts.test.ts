import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyProgress, recordVictory, type Progress } from '../src/progress/progress';
import { createGameServer, type GameServer } from './gameServer';
import { googleToken, TEST_CLIENT_ID, testGoogleKeys } from './testing/googleTokens';

// Signing in with Google against a real server, with test keys standing in
// for Google's.

let server: GameServer;
let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'tdh-google-'));
  server = await createGameServer({
    port: 0,
    autoClock: false,
    dataDir,
    googleClientId: TEST_CLIENT_ID,
    googleKeys: testGoogleKeys,
  });
});

afterEach(async () => {
  await server.close();
  await rm(dataDir, { recursive: true, force: true });
});

function api(route: string, init: { method?: string; auth?: string; body?: unknown } = {}): Promise<Response> {
  return fetch(`http://127.0.0.1:${server.port}${route}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(init.auth ? { authorization: `Bearer ${init.auth}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

const won = (mapId: string, stars: number): Progress => recordVictory(emptyProgress(), mapId, 'normal', stars);

interface SignedIn {
  session: string;
  name: string | null;
  progress: Progress;
}

async function signIn(body: Record<string, unknown>): Promise<Response> {
  return api('/api/google', { method: 'POST', body });
}

async function signedIn(body: Record<string, unknown>): Promise<SignedIn> {
  const response = await signIn(body);
  expect(response.status).toBe(200);
  return (await response.json()) as SignedIn;
}

describe('signing in with Google', () => {
  it('tells in its health check which Google client the game must use', async () => {
    const health = (await (await api('/health')).json()) as { google: string | null };
    expect(health.google).toBe(TEST_CLIENT_ID);
  });

  it('keeps what the device had, and hands back a session for later saves', async () => {
    const result = await signedIn({ credential: googleToken(), progress: won('meadow', 2) });
    expect(result.session).toMatch(/^s_[A-Za-z0-9_-]{32}$/);
    expect(result.name).toBe('Ana Pérez');
    expect(result.progress.stars).toEqual({ meadow: { normal: 2 } });

    const saved = await api('/api/progress', { method: 'PUT', auth: result.session, body: { progress: won('canyon', 1) } });
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as { progress: Progress };
    expect(body.progress.stars).toEqual({ meadow: { normal: 2 }, canyon: { normal: 1 } });
  });

  it('finds the same progress from another device signed in to the same Google account', async () => {
    await signedIn({ credential: googleToken(), progress: won('meadow', 3) });
    const second = await signedIn({ credential: googleToken(), progress: won('canyon', 1) });
    expect(second.progress.stars).toEqual({ meadow: { normal: 3 }, canyon: { normal: 1 } });
  });

  it('keeps different Google accounts apart', async () => {
    await signedIn({ credential: googleToken({ sub: 'ana' }), progress: won('meadow', 3) });
    const beto = await signedIn({ credential: googleToken({ sub: 'beto' }), progress: emptyProgress() });
    expect(beto.progress.stars).toEqual({});
  });

  it('brings in the progress of the player code the device was using', async () => {
    const created = await api('/api/accounts', { method: 'POST', body: { progress: won('crossroads', 2) } });
    const { code } = (await created.json()) as { code: string };
    const result = await signedIn({ credential: googleToken(), progress: emptyProgress(), code });
    expect(result.progress.stars).toEqual({ crossroads: { normal: 2 } });
  });

  it('refuses a token that is not valid, and counts it as a failed try', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await signIn({ credential: googleToken({ aud: 'someone-else' }), progress: emptyProgress() })).status);
    }
    expect(statuses[0]).toBe(401);
    expect(statuses.at(-1)).toBe(429);
  });

  it('refuses a request without a token or without a progress', async () => {
    expect((await signIn({ progress: emptyProgress() })).status).toBe(400);
    expect((await signIn({ credential: googleToken() })).status).toBe(400);
  });

  it('ends a session when asked: it no longer saves anything', async () => {
    const { session } = await signedIn({ credential: googleToken(), progress: won('meadow', 1) });
    expect((await api('/api/session', { method: 'DELETE', auth: session })).status).toBe(204);
    expect((await api('/api/progress', { auth: session })).status).toBe(404);
    // The progress itself stays with the Google account.
    const again = await signedIn({ credential: googleToken(), progress: emptyProgress() });
    expect(again.progress.stars).toEqual({ meadow: { normal: 1 } });
  });

  it('writes nothing personal to disk: no Google id, no name, no session', async () => {
    const { session } = await signedIn({ credential: googleToken({ sub: '987654321' }), progress: won('meadow', 1) });
    const files = await readdir(dataDir, { recursive: true });
    const everything = (
      await Promise.all(
        files.filter((file) => file.endsWith('.json')).map((file) => readFile(path.join(dataDir, file), 'utf8')),
      )
    ).join('\n') + files.join('\n');
    for (const secret of ['987654321', 'Ana', session]) expect(everything).not.toContain(secret);
  });

  it('is not offered when the server has no Google client', async () => {
    await server.close();
    server = await createGameServer({ port: 0, autoClock: false, dataDir });
    const health = (await (await api('/health')).json()) as { google: string | null };
    expect(health.google).toBeNull();
    expect((await signIn({ credential: googleToken(), progress: emptyProgress() })).status).toBe(404);
  });

  it('limits how many accounts and sessions one address makes in an hour, to protect the disk', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      statuses.push((await signIn({ credential: googleToken({ sub: `player-${i}` }), progress: emptyProgress() })).status);
      statuses.push((await api('/api/accounts', { method: 'POST', body: { progress: emptyProgress() } })).status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 200 || status === 201)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});
