import { describe, expect, it } from 'vitest';
import { createGame, step, type Command, type GameState } from '../core/simulation';
import { hashState } from '../core/stateHash';
import { coopLevel } from './coopLevel';
import {
  HASH_EVERY_TURNS,
  MAX_PLAYERS,
  SIGNAL_EVERY_TURNS,
  TURN_TICKS,
  type GameStart,
  type ServerMessage,
} from './protocol';
import { Room } from './room';

/** A room with a fixed seed and predictable tokens, on the first map. */
function makeRoom(): Room {
  let next = 0;
  return new Room({
    code: 'ABCD',
    mapId: 'meadow',
    difficulty: 'normal',
    seed: 42,
    newToken: () => `token-${++next}`,
  });
}

/** Adds players and returns their ids. */
function fill(room: Room, ...names: string[]): number[] {
  return names.map((name) => {
    const result = room.join(name);
    if (!result.ok) throw new Error(result.error);
    return result.player.id;
  });
}

/** Everything the room wants to send to one player, most recent last. */
function inbox(room: Room, playerId: number): ServerMessage[] {
  return room.outbox.filter((entry) => entry.to === playerId).map((entry) => entry.message);
}

function last<T extends ServerMessage['t']>(
  room: Room,
  playerId: number,
  type: T,
): Extract<ServerMessage, { t: T }> | undefined {
  const matches = inbox(room, playerId).filter((message) => message.t === type);
  return matches[matches.length - 1] as Extract<ServerMessage, { t: T }> | undefined;
}

/** Gets every listed player ready, which starts the game if they are all there. */
function everyoneReady(room: Room, ids: number[]): void {
  for (const id of ids) room.setReady(id, true);
}

function started(...names: string[]): { room: Room; ids: number[] } {
  const room = makeRoom();
  const ids = fill(room, ...names);
  everyoneReady(room, ids);
  return { room, ids };
}

describe('lobby', () => {
  it('lets players in and tells everyone who is there', () => {
    const room = makeRoom();
    const [ana, beto] = fill(room, 'Ana', 'Beto');
    expect(last(room, ana, 'room')?.room.players.map((p) => p.name)).toEqual(['Ana', 'Beto']);
    expect(last(room, beto, 'joined')).toMatchObject({ playerId: beto, token: 'token-2' });
  });

  it('gives each player a different id and a private token', () => {
    const room = makeRoom();
    const [ana, beto] = fill(room, 'Ana', 'Beto');
    expect(ana).not.toBe(beto);
    // Ana never receives Beto's token.
    expect(JSON.stringify(inbox(room, ana))).not.toContain('token-2');
  });

  it('tidies up names and never leaves one empty', () => {
    const room = makeRoom();
    fill(room, '   Ana   ', '', 'x'.repeat(80));
    const names = room.info().players.map((p) => p.name);
    expect(names[0]).toBe('Ana');
    expect(names[1].length).toBeGreaterThan(0);
    expect(names[2].length).toBeLessThanOrEqual(16);
  });

  it('is full at four players', () => {
    const room = makeRoom();
    fill(room, 'A', 'B', 'C', 'D');
    expect(room.info().players).toHaveLength(MAX_PLAYERS);
    expect(room.join('E')).toMatchObject({ ok: false });
  });

  it('does not start until every player is ready', () => {
    const room = makeRoom();
    const [ana] = fill(room, 'Ana', 'Beto');
    room.setReady(ana, true);
    expect(room.info().state).toBe('lobby');
  });

  it('lets a player take their ready back', () => {
    const room = makeRoom();
    const [ana, beto] = fill(room, 'Ana', 'Beto');
    room.setReady(ana, true);
    room.setReady(ana, false);
    room.setReady(beto, true);
    expect(room.info().state).toBe('lobby');
  });

  it('frees the seat of a player who leaves before the game starts', () => {
    const room = makeRoom();
    const [, beto] = fill(room, 'Ana', 'Beto');
    room.disconnect(beto);
    expect(room.info().players.map((p) => p.name)).toEqual(['Ana']);
  });
});

describe('starting the game', () => {
  it('starts when everyone is ready and tells them all the same thing', () => {
    const { room, ids } = started('Ana', 'Beto');
    expect(room.info().state).toBe('playing');
    const starts = ids.map((id) => last(room, id, 'start')?.start);
    expect(starts[0]).toEqual({ seed: 42, mapId: 'meadow', difficulty: 'normal', playerCount: 2 });
    expect(starts[1]).toEqual(starts[0]);
  });

  it('can be played alone', () => {
    const { room } = started('Ana');
    expect(room.info().state).toBe('playing');
  });

  it('shares the heroes out among the players', () => {
    const { room } = started('Ana', 'Beto');
    expect(room.info().players.map((p) => p.heroes)).toEqual([
      [1, 3],
      [2, 4],
    ]);
  });

  it('clears everyone\'s ready, so it can be used again for the first wave', () => {
    const { room } = started('Ana', 'Beto');
    expect(room.info().players.every((p) => !p.ready)).toBe(true);
  });

  it('lets nobody new in once it has started', () => {
    const { room } = started('Ana', 'Beto');
    expect(room.join('Caro')).toMatchObject({ ok: false });
  });
});

describe('turns', () => {
  it('sends none while still in the lobby', () => {
    const room = makeRoom();
    const [ana] = fill(room, 'Ana');
    room.tick();
    expect(last(room, ana, 'turn')).toBeUndefined();
  });

  it('sends one per tick of the clock, numbered in order, even when empty', () => {
    const { room, ids } = started('Ana', 'Beto');
    room.tick();
    room.tick();
    const turns = inbox(room, ids[1]).filter((m) => m.t === 'turn');
    expect(turns).toEqual([
      { t: 'turn', turn: 0, commands: [] },
      { t: 'turn', turn: 1, commands: [] },
    ]);
  });

  it('advances its own game by the ticks of a turn', () => {
    const { room } = started('Ana');
    room.tick();
    room.tick();
    expect(room.game?.tick).toBe(2 * TURN_TICKS);
  });

  it('passes on an order in the next turn and applies it to its own game', () => {
    const { room, ids } = started('Ana', 'Beto');
    const build: Command = { type: 'buildTower', slot: 1, tower: 'archery' };
    room.submit(ids[0], build);
    room.tick();
    expect(last(room, ids[1], 'turn')?.commands).toEqual([build]);
    expect(room.game?.towers).toHaveLength(1);
  });

  it('sends each order once', () => {
    const { room, ids } = started('Ana');
    room.submit(ids[0], { type: 'buildTower', slot: 1, tower: 'archery' });
    room.tick();
    room.tick();
    expect(last(room, ids[0], 'turn')?.commands).toEqual([]);
  });

  it('keeps the orders of one turn in the order they arrived', () => {
    const { room, ids } = started('Ana', 'Beto');
    const first: Command = { type: 'buildTower', slot: 1, tower: 'archery' };
    const second: Command = { type: 'moveHero', heroId: 2, x: 400, y: 300 };
    room.submit(ids[0], first);
    room.submit(ids[1], second);
    room.tick();
    expect(last(room, ids[0], 'turn')?.commands).toEqual([first, second]);
  });

  it('drops an order for a hero that belongs to another player', () => {
    const { room, ids } = started('Ana', 'Beto');
    // Hero 2 is Beto's.
    room.submit(ids[0], { type: 'moveHero', heroId: 2, x: 400, y: 300 });
    room.tick();
    expect(last(room, ids[0], 'turn')?.commands).toEqual([]);
  });

  it('drops a direct order to start the wave', () => {
    const { room, ids } = started('Ana');
    room.submit(ids[0], { type: 'startWave' });
    room.tick();
    expect(room.game?.phase).toBe('preparing');
  });

  it('drops orders that are not orders at all', () => {
    const { room, ids } = started('Ana');
    for (const junk of [null, 42, 'startWave', {}, { type: 'explode' }, { type: 'moveHero' }]) {
      room.submit(ids[0], junk as unknown as Command);
    }
    room.tick();
    expect(last(room, ids[0], 'turn')?.commands).toEqual([]);
  });

  it('ignores orders from someone who is not in the room', () => {
    const { room, ids } = started('Ana');
    room.submit(999, { type: 'buildTower', slot: 1, tower: 'archery' });
    room.tick();
    expect(last(room, ids[0], 'turn')?.commands).toEqual([]);
  });
});

describe('starting a wave', () => {
  it('waits for everyone to be ready', () => {
    const { room, ids } = started('Ana', 'Beto');
    room.setReady(ids[0], true);
    room.tick();
    expect(room.game?.phase).toBe('preparing');
  });

  it('starts once they all are, as an order everyone receives', () => {
    const { room, ids } = started('Ana', 'Beto');
    everyoneReady(room, ids);
    room.tick();
    expect(last(room, ids[1], 'turn')?.commands).toEqual([{ type: 'startWave' }]);
    expect(room.game?.phase).toBe('wave');
  });

  it('asks again for the next wave', () => {
    const { room, ids } = started('Ana', 'Beto');
    everyoneReady(room, ids);
    room.tick();
    expect(room.info().players.every((p) => !p.ready)).toBe(true);
  });

  it('does not wait for a player who lost the connection', () => {
    const { room, ids } = started('Ana', 'Beto');
    room.disconnect(ids[1]);
    room.setReady(ids[0], true);
    room.tick();
    expect(room.game?.phase).toBe('wave');
  });

  it('ignores ready while a wave is being fought', () => {
    const { room, ids } = started('Ana');
    everyoneReady(room, ids);
    room.tick();
    room.setReady(ids[0], true);
    expect(room.info().players[0].ready).toBe(false);
  });
});

describe('losing and regaining the connection', () => {
  it('keeps the seat and the heroes of a player who drops mid-game', () => {
    const { room, ids } = started('Ana', 'Beto');
    room.disconnect(ids[1]);
    expect(room.info().players[1]).toMatchObject({ connected: false, heroes: [2, 4] });
  });

  it('lets them back in with their token and brings them up to date', () => {
    const { room, ids } = started('Ana', 'Beto');
    room.tick();
    room.tick();
    room.disconnect(ids[1]);
    room.tick();

    const back = room.rejoin('token-2');
    expect(back).toMatchObject({ ok: true });
    expect(room.info().players[1].connected).toBe(true);
    const snapshot = last(room, ids[1], 'snapshot');
    expect(snapshot?.turn).toBe(2);
    expect(snapshot?.state.tick).toBe(3 * TURN_TICKS);
    expect(snapshot?.start.seed).toBe(42);
  });

  it('refuses a token it never gave out', () => {
    const { room } = started('Ana', 'Beto');
    expect(room.rejoin('made-up')).toMatchObject({ ok: false });
  });

  it('knows when nobody is left', () => {
    const { room, ids } = started('Ana', 'Beto');
    expect(room.isEmpty()).toBe(false);
    room.disconnect(ids[0]);
    room.disconnect(ids[1]);
    expect(room.isEmpty()).toBe(true);
  });

  it('stops sending to a player who is gone', () => {
    const { room, ids } = started('Ana', 'Beto');
    room.disconnect(ids[1]);
    room.drain();
    room.tick();
    expect(inbox(room, ids[1])).toEqual([]);
  });
});

describe('keeping every player in step', () => {
  /** A player's own copy of the game, fed only by what the room sends. */
  function replica(start: GameStart): { game: GameState; apply: (commands: Command[]) => void } {
    const level = coopLevel(start.mapId, start.difficulty, start.playerCount);
    const game = createGame(level, start.seed);
    return {
      game,
      apply(commands) {
        step(game, level, commands);
        for (let tick = 1; tick < TURN_TICKS; tick++) step(game, level);
      },
    };
  }

  it('a player who applies the turns they receive has the same game as the server', () => {
    const { room, ids } = started('Ana', 'Beto');
    const copy = replica(last(room, ids[1], 'start')!.start);
    room.drain();

    for (let turn = 0; turn < 600; turn++) {
      if (turn === 5) room.submit(ids[0], { type: 'buildTower', slot: 1, tower: 'archery' });
      if (turn === 9) room.submit(ids[1], { type: 'moveHero', heroId: 2, x: 420, y: 250 });
      if (turn % 40 === 0) everyoneReady(room, ids);
      room.tick();
      for (const { to, message } of room.drain()) {
        if (to === ids[1] && message.t === 'turn') copy.apply(message.commands);
      }
    }
    expect(room.game!.tick).toBe(600 * TURN_TICKS);
    expect(hashState(copy.game)).toBe(hashState(room.game!));
  });

  it('says nothing when a player reports the right fingerprint', () => {
    const { room, ids } = started('Ana');
    for (let i = 0; i < HASH_EVERY_TURNS; i++) room.tick();
    room.drain();
    room.reportHash(ids[0], HASH_EVERY_TURNS - 1, hashState(room.game!));
    expect(inbox(room, ids[0])).toEqual([]);
  });

  it('sends the whole game to a player who reports the wrong one', () => {
    const { room, ids } = started('Ana');
    for (let i = 0; i < HASH_EVERY_TURNS; i++) room.tick();
    room.drain();
    room.reportHash(ids[0], HASH_EVERY_TURNS - 1, 12345);
    expect(last(room, ids[0], 'snapshot')?.state.tick).toBe(room.game!.tick);
  });

  it('ignores a fingerprint for a turn it kept no record of', () => {
    const { room, ids } = started('Ana');
    for (let i = 0; i < HASH_EVERY_TURNS; i++) room.tick();
    room.drain();
    room.reportHash(ids[0], 7, 12345);
    room.reportHash(ids[0], 999_999, 12345);
    expect(inbox(room, ids[0])).toEqual([]);
  });

  it('a snapshot lets a player who drifted rejoin the others exactly', () => {
    const { room, ids } = started('Ana');
    for (let i = 0; i < HASH_EVERY_TURNS; i++) room.tick();
    room.drain();
    room.reportHash(ids[0], HASH_EVERY_TURNS - 1, 0);
    const snapshot = last(room, ids[0], 'snapshot')!;
    const level = coopLevel(snapshot.start.mapId, snapshot.start.difficulty, 1);
    const game = snapshot.state;
    room.drain();

    for (let i = 0; i < 100; i++) {
      room.tick();
      for (const { message } of room.drain()) {
        if (message.t !== 'turn') continue;
        step(game, level, message.commands);
        for (let tick = 1; tick < TURN_TICKS; tick++) step(game, level);
      }
    }
    expect(hashState(game)).toBe(hashState(room.game!));
  });
});

describe('signals on the map', () => {
  it('shows one player\'s signal to everyone, with who sent it', () => {
    const { room, ids } = started('Ana', 'Beto');
    room.drain();
    room.signal(ids[0], { kind: 'help', x: 300, y: 200 });
    const expected = { t: 'signal', playerId: ids[0], kind: 'help', x: 300, y: 200 };
    expect(last(room, ids[0], 'signal')).toEqual(expected);
    expect(last(room, ids[1], 'signal')).toEqual(expected);
  });

  it('does not reach a player who is disconnected', () => {
    const { room, ids } = started('Ana', 'Beto');
    room.disconnect(ids[1]);
    room.drain();
    room.signal(ids[0], { kind: 'going', x: 10, y: 10 });
    expect(last(room, ids[1], 'signal')).toBeUndefined();
  });

  it('ignores a signal that makes no sense', () => {
    const { room, ids } = started('Ana', 'Beto');
    room.drain();
    for (const raw of [
      null,
      'help',
      { kind: 'dance', x: 1, y: 1 },
      { kind: 'help', x: 'left', y: 1 },
      { kind: 'help', x: Number.NaN, y: 1 },
      { kind: 'help', x: 1 },
    ]) {
      room.signal(ids[0], raw);
    }
    expect(last(room, ids[1], 'signal')).toBeUndefined();
  });

  it('keeps a signal inside the map', () => {
    const { room, ids } = started('Ana', 'Beto');
    room.drain();
    room.signal(ids[0], { kind: 'help', x: -500, y: 99999 });
    const level = coopLevel('meadow', 'normal', 2);
    expect(last(room, ids[1], 'signal')).toMatchObject({ x: 0, y: level.height });
  });

  it('lets a player signal again only after a moment', () => {
    const { room, ids } = started('Ana', 'Beto');
    room.drain();
    room.signal(ids[0], { kind: 'help', x: 1, y: 1 });
    room.signal(ids[0], { kind: 'help', x: 2, y: 2 });
    // The other player is not held back by it.
    room.signal(ids[1], { kind: 'going', x: 3, y: 3 });
    const signals = () => inbox(room, ids[1]).filter((message) => message.t === 'signal');
    expect(signals()).toHaveLength(2);

    for (let turn = 0; turn < SIGNAL_EVERY_TURNS; turn++) room.tick();
    room.signal(ids[0], { kind: 'help', x: 4, y: 4 });
    expect(signals()).toHaveLength(3);
  });

  it('has no signals before the game starts', () => {
    const room = makeRoom();
    const ids = fill(room, 'Ana', 'Beto');
    room.signal(ids[0], { kind: 'help', x: 1, y: 1 });
    expect(last(room, ids[1], 'signal')).toBeUndefined();
  });
});

describe('choosing heroes in the lobby', () => {
  it('lets a player take a free hero, and everyone sees it', () => {
    const room = makeRoom();
    const [ana, beto] = fill(room, 'Ana', 'Beto');
    room.drain();
    room.pick(ana, 3);
    expect(last(room, beto, 'room')?.room.players[0].heroes).toEqual([3]);
  });

  it('gives a hero back when it is picked again', () => {
    const room = makeRoom();
    const [ana] = fill(room, 'Ana', 'Beto');
    room.pick(ana, 3);
    room.pick(ana, 3);
    expect(room.info().players[0].heroes).toEqual([]);
  });

  it('does not let a player take a hero someone else has', () => {
    const room = makeRoom();
    const [ana, beto] = fill(room, 'Ana', 'Beto');
    room.pick(ana, 3);
    room.pick(beto, 3);
    expect(room.info().players.map((player) => player.heroes)).toEqual([[3], []]);
  });

  it('does not let a player take more than their share', () => {
    const room = makeRoom();
    const [ana] = fill(room, 'Ana', 'Beto');
    for (const hero of [1, 2, 3]) room.pick(ana, hero);
    expect(room.info().players[0].heroes).toEqual([1, 2]);
  });

  it('gives back the last heroes taken when someone joins and shares shrink', () => {
    const room = makeRoom();
    const [ana] = fill(room, 'Ana');
    for (const hero of [4, 1, 2]) room.pick(ana, hero);
    fill(room, 'Beto');
    expect(room.info().players[0].heroes).toEqual([4, 1]);
  });

  it('starts the game with the heroes chosen, and the rest handed out', () => {
    const room = makeRoom();
    const ids = fill(room, 'Ana', 'Beto');
    room.pick(ids[1], 1);
    everyoneReady(room, ids);
    expect(room.info().players.map((player) => player.heroes)).toEqual([[2, 4], [1, 3]]);
  });

  it('ignores a pick that is not a hero, or that comes once the game started', () => {
    const room = makeRoom();
    const ids = fill(room, 'Ana', 'Beto');
    for (const wrong of [0, 5, 1.5, Number.NaN]) room.pick(ids[0], wrong);
    expect(room.info().players[0].heroes).toEqual([]);
    everyoneReady(room, ids);
    const before = room.info().players.map((player) => player.heroes);
    room.pick(ids[0], 2);
    expect(room.info().players.map((player) => player.heroes)).toEqual(before);
  });
});
