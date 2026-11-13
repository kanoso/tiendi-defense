import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGameServer, type GameServer } from '../../server/gameServer';
import { googleToken, TEST_CLIENT_ID, testGoogleKeys } from '../../server/testing/googleTokens';
import { CloudError, ProgressCloud, type CodeStore } from './cloud';
import { emptyProgress, recordVictory, type Progress } from './progress';
import { createGame, step } from '../core/simulation';
import { makeSavedGame, playerLevel, type SavedGame } from './savedGame';

// The browser side of player codes, against a real server.

let server: GameServer;
let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'tdh-cloud-'));
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

/** One device: its own remembered code, talking to the test server. */
function device(): ProgressCloud {
  let kept: string | null = null;
  const codes: CodeStore = { get: () => kept, set: (code) => (kept = code) };
  return new ProgressCloud(`http://127.0.0.1:${server.port}`, codes);
}

const won = (mapId: string, stars: number, progress: Progress = emptyProgress()): Progress =>
  recordVictory(progress, mapId, 'normal', stars);

describe('keeping progress under a player code', () => {
  it('a new code keeps what the device had, and the device remembers it', async () => {
    const phone = device();
    const { code, progress } = await phone.create(won('meadow', 2));
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(progress.stars).toEqual({ meadow: { normal: 2 } });
    expect(phone.code()).toBe(code);
  });

  it('another device that enters the code gets both progresses joined', async () => {
    const phone = device();
    const { code } = await phone.create(won('meadow', 3));
    const computer = device();
    const joined = await computer.link(code.toLowerCase(), won('canyon', 1));
    expect(joined.stars).toEqual({ meadow: { normal: 3 }, canyon: { normal: 1 } });
    expect(computer.code()).toBe(code);

    // And the phone gets the computer's part on its next sync.
    const synced = await phone.sync(won('meadow', 3));
    expect(synced?.stars).toEqual({ meadow: { normal: 3 }, canyon: { normal: 1 } });
  });

  it('a code that matches nothing is refused, and not remembered', async () => {
    const computer = device();
    await expect(computer.link('AAAA-BBBB', emptyProgress())).rejects.toMatchObject({ kind: 'unknown-code' });
    await expect(computer.link('nope', emptyProgress())).rejects.toMatchObject({ kind: 'invalid-code' });
    expect(computer.code()).toBeNull();
  });

  it('a device without a code has nothing to sync', async () => {
    expect(await device().sync(won('meadow', 1))).toBeNull();
  });

  it('a device can forget its code; the progress stays on the server', async () => {
    const phone = device();
    const { code } = await phone.create(won('meadow', 2));
    phone.forget();
    expect(phone.code()).toBeNull();
    const again = await device().link(code, emptyProgress());
    expect(again.stars).toEqual({ meadow: { normal: 2 } });
  });

  it('says it is offline when the server cannot be reached', async () => {
    const lost = new ProgressCloud('http://127.0.0.1:1', { get: () => 'AAAA-BBBB', set: () => {} });
    const error = await lost.sync(emptyProgress()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CloudError);
    expect((error as CloudError).kind).toBe('offline');
  });
});

describe('signing in with Google', () => {
  it('keeps the device signed in, with the progress joined into the Google account', async () => {
    const phone = device();
    const { name, progress } = await phone.signInWithGoogle(googleToken(), won('meadow', 2));
    expect(name).toBe('Ana Pérez');
    expect(progress.stars).toEqual({ meadow: { normal: 2 } });
    expect(phone.signedInWithGoogle()).toBe(true);
    expect(phone.linked()).toBe(true);
    // A Google session is not a player code.
    expect(phone.code()).toBeNull();

    const synced = await phone.sync(won('canyon', 1));
    expect(synced?.stars).toEqual({ meadow: { normal: 2 }, canyon: { normal: 1 } });
  });

  it('brings along the player code the device was using', async () => {
    const phone = device();
    await phone.create(won('crossroads', 3));
    const { progress } = await phone.signInWithGoogle(googleToken(), emptyProgress());
    expect(progress.stars).toEqual({ crossroads: { normal: 3 } });
  });

  it('the same Google account on another device finds the same progress', async () => {
    await device().signInWithGoogle(googleToken(), won('meadow', 3));
    const { progress } = await device().signInWithGoogle(googleToken(), emptyProgress());
    expect(progress.stars).toEqual({ meadow: { normal: 3 } });
  });

  it('a refused sign-in leaves the device as it was', async () => {
    const phone = device();
    await phone.create(won('meadow', 1));
    const before = phone.code();
    await expect(phone.signInWithGoogle(googleToken({ aud: 'other' }), emptyProgress())).rejects.toMatchObject({
      kind: 'google-refused',
    });
    expect(phone.code()).toBe(before);
  });

  it('signing out ends the session on the server too', async () => {
    const phone = device();
    await phone.signInWithGoogle(googleToken(), won('meadow', 1));
    await phone.signOut();
    expect(phone.signedInWithGoogle()).toBe(false);
    expect(phone.linked()).toBe(false);
    expect(await phone.sync(emptyProgress())).toBeNull();
  });
});

describe('a game left between waves, kept with the account', () => {
  function saved(gameId: string, savedAt: string): SavedGame {
    const level = playerLevel('meadow', 'normal', 'campaign', {});
    const game = createGame(level, 5);
    step(game, level, [{ type: 'startWave' }]);
    while (game.phase === 'wave') step(game, level);
    return { ...makeSavedGame({ gameId, mapId: 'meadow', difficulty: 'normal', mode: 'campaign', state: game }), savedAt };
  }

  it('a device without an account keeps none on the server', async () => {
    const phone = device();
    expect(await phone.loadSavedGame()).toBeNull();
    expect(await phone.putSavedGame(saved('a', '2026-11-12T10:00:00.000Z'))).toBeNull();
  });

  it('another device with the same code finds it', async () => {
    const phone = device();
    const { code } = await phone.create(emptyProgress());
    const game = saved('a', '2026-11-12T10:00:00.000Z');
    expect(await phone.putSavedGame(game)).toEqual(game);

    const computer = device();
    await computer.link(code, emptyProgress());
    expect(await computer.loadSavedGame()).toEqual(game);
  });

  it('is cleared once that game ends', async () => {
    const phone = device();
    await phone.create(emptyProgress());
    await phone.putSavedGame(saved('a', '2026-11-12T10:00:00.000Z'));
    await phone.clearSavedGame('a');
    expect(await phone.loadSavedGame()).toBeNull();
  });

  it('works the same signed in with Google', async () => {
    const phone = device();
    await phone.signInWithGoogle(googleToken({ sub: 'saved-game-player' }), emptyProgress());
    const game = saved('g', '2026-11-12T10:00:00.000Z');
    await phone.putSavedGame(game);
    expect(await phone.loadSavedGame()).toEqual(game);
  });
});
