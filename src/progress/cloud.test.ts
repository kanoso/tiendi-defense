import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGameServer, type GameServer } from '../../server/gameServer';
import { CloudError, ProgressCloud, type CodeStore } from './cloud';
import { emptyProgress, recordVictory, type Progress } from './progress';

// The browser side of player codes, against a real server.

let server: GameServer;
let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'tdh-cloud-'));
  server = await createGameServer({ port: 0, autoClock: false, dataDir });
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
