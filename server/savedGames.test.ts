import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGame, step } from '../src/core/simulation';
import { emptyProgress } from '../src/progress/progress';
import { makeSavedGame, playerLevel, type SavedGame } from '../src/progress/savedGame';
import { createGameServer, type GameServer } from './gameServer';

// A game left between waves, kept with the player's account on a real server.

let server: GameServer;
let dataDir: string;
let code: string;

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'tdh-saved-'));
  server = await createGameServer({ port: 0, autoClock: false, dataDir });
  const created = await api('/api/accounts', { method: 'POST', body: { progress: emptyProgress() } });
  code = ((await created.json()) as { code: string }).code;
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

/** A real game after its first wave, saved at a given moment. */
function savedAt(when: string, gameId = 'game-1'): SavedGame {
  const level = playerLevel('meadow', 'normal', 'campaign', {});
  const game = createGame(level, 3);
  step(game, level, [{ type: 'startWave' }]);
  while (game.phase === 'wave') step(game, level);
  return { ...makeSavedGame({ gameId, mapId: 'meadow', difficulty: 'normal', mode: 'campaign', state: game }), savedAt: when };
}

async function stored(): Promise<SavedGame | null> {
  const response = await api('/api/saved-game', { auth: code });
  expect(response.status).toBe(200);
  return ((await response.json()) as { savedGame: SavedGame | null }).savedGame;
}

describe('a game kept with the account', () => {
  it('there is none until one is saved', async () => {
    expect(await stored()).toBeNull();
  });

  it('is kept and handed back', async () => {
    const game = savedAt('2026-11-12T10:00:00.000Z');
    expect((await api('/api/saved-game', { method: 'PUT', auth: code, body: { savedGame: game } })).status).toBe(200);
    expect(await stored()).toEqual(game);
  });

  it('is only replaced by one saved later', async () => {
    const newer = savedAt('2026-11-12T10:00:00.000Z', 'new');
    const older = savedAt('2026-11-10T10:00:00.000Z', 'old');
    await api('/api/saved-game', { method: 'PUT', auth: code, body: { savedGame: newer } });
    const response = await api('/api/saved-game', { method: 'PUT', auth: code, body: { savedGame: older } });
    // The answer tells the device which one the account keeps.
    expect(((await response.json()) as { savedGame: SavedGame }).savedGame.gameId).toBe('new');
    expect((await stored())?.gameId).toBe('new');
  });

  it('is cleared when that same game ends, and not by the end of another one', async () => {
    await api('/api/saved-game', { method: 'PUT', auth: code, body: { savedGame: savedAt('2026-11-12T10:00:00.000Z', 'mine') } });
    expect((await api('/api/saved-game?gameId=other', { method: 'DELETE', auth: code })).status).toBe(204);
    expect((await stored())?.gameId).toBe('mine');
    expect((await api('/api/saved-game?gameId=mine', { method: 'DELETE', auth: code })).status).toBe(204);
    expect(await stored()).toBeNull();
  });

  it('refuses a game that cannot be played', async () => {
    const broken = savedAt('2026-11-12T10:00:00.000Z');
    (broken.state as unknown as { gold: string }).gold = 'lots';
    expect((await api('/api/saved-game', { method: 'PUT', auth: code, body: { savedGame: broken } })).status).toBe(400);
    expect(await stored()).toBeNull();
  });

  it('belongs to the account: no code, no game', async () => {
    expect((await api('/api/saved-game')).status).toBe(401);
    expect((await api('/api/saved-game', { auth: 'AAAA-BBBB' })).status).toBe(404);
  });

  it('does not touch the progress of the account, nor the progress touch it', async () => {
    await api('/api/saved-game', { method: 'PUT', auth: code, body: { savedGame: savedAt('2026-11-12T10:00:00.000Z') } });
    await api('/api/progress', { method: 'PUT', auth: code, body: { progress: emptyProgress() } });
    expect(await stored()).not.toBeNull();
  });
});
