import { beforeEach, describe, expect, it } from 'vitest';
import { createGame, step, type Command, type GameState, type Level } from '../core/simulation';
import { hashState } from '../core/stateHash';
import { coopLevel } from './coopLevel';
import { CoopSession } from './CoopSession';
import {
  HASH_EVERY_TURNS,
  TURN_TICKS,
  type ClientMessage,
  type GameStart,
  type RoomInfo,
} from './protocol';
import { Room } from './room';

const START: GameStart = { seed: 42, mapId: 'meadow', difficulty: 'normal', playerCount: 2 };

function roomInfo(overrides: Partial<RoomInfo> = {}): RoomInfo {
  return {
    code: 'ABCD',
    mapId: 'meadow',
    difficulty: 'normal',
    state: 'playing',
    players: [
      { id: 1, name: 'Ana', connected: true, ready: false, heroes: [1, 3] },
      { id: 2, name: 'Beto', connected: true, ready: false, heroes: [2, 4] },
    ],
    ...overrides,
  };
}

let sent: ClientMessage[];
let session: CoopSession;

/** A session for Ana (player 1), already in a started game. */
beforeEach(() => {
  sent = [];
  session = new CoopSession((message) => sent.push(message));
  session.receive({ t: 'joined', playerId: 1, token: 'secret', room: roomInfo({ state: 'lobby' }) });
  session.receive({ t: 'start', start: START, room: roomInfo() });
});

function turn(number: number, commands: Command[] = []): void {
  session.receive({ t: 'turn', turn: number, commands });
}

describe('joining', () => {
  it('knows nothing before the server answers', () => {
    const fresh = new CoopSession(() => {});
    expect(fresh.playerId).toBeNull();
    expect(fresh.room).toBeNull();
    expect(fresh.start).toBeNull();
  });

  it('remembers who it is and how to come back', () => {
    expect(session.playerId).toBe(1);
    expect(session.rejoinTicket()).toEqual({ code: 'ABCD', token: 'secret' });
  });

  it('keeps the list of players up to date', () => {
    session.receive({
      t: 'room',
      room: roomInfo({ players: [{ id: 1, name: 'Ana', connected: true, ready: true, heroes: [1, 3] }] }),
    });
    expect(session.room?.players).toHaveLength(1);
    expect(session.room?.players[0].ready).toBe(true);
  });

  it('knows which heroes are its own and whose the others are', () => {
    expect(session.ownHeroes()).toEqual([1, 3]);
    expect(session.ownerName(2)).toBe('Beto');
    expect(session.ownerName(1)).toBe('Ana');
    expect(session.ownerName(9)).toBeNull();
  });

  it('keeps the last error the server reported', () => {
    session.receive({ t: 'error', message: 'La sala está llena' });
    expect(session.lastError).toBe('La sala está llena');
  });
});

describe('pacing the game', () => {
  it('cannot advance before the first turn arrives', () => {
    expect(session.canStep(0)).toBe(false);
  });

  it('can advance through the ticks of each turn it has received, and no further', () => {
    turn(0);
    expect(session.canStep(0)).toBe(true);
    expect(session.canStep(TURN_TICKS - 1)).toBe(true);
    expect(session.canStep(TURN_TICKS)).toBe(false);
    turn(1);
    expect(session.canStep(TURN_TICKS)).toBe(true);
  });

  it('hands out the orders of a turn on its first tick only', () => {
    const build: Command = { type: 'buildTower', slot: 1, tower: 'archery' };
    turn(0);
    turn(1, [build]);
    expect(session.commandsFor(0)).toEqual([]);
    expect(session.commandsFor(TURN_TICKS)).toEqual([build]);
    expect(session.commandsFor(TURN_TICKS + 1)).toEqual([]);
  });

  it('tells how far behind the server the game is', () => {
    turn(0);
    turn(1);
    turn(2);
    expect(session.ticksBehind(0)).toBe(3 * TURN_TICKS);
    expect(session.ticksBehind(2 * TURN_TICKS)).toBe(TURN_TICKS);
  });

  it('forgets turns once they have been played', () => {
    for (let i = 0; i < 200; i++) turn(i);
    session.played(190 * TURN_TICKS);
    expect(session.bufferedTurns()).toBeLessThanOrEqual(11);
  });

  it('ignores a turn that arrives twice or out of order', () => {
    const build: Command = { type: 'buildTower', slot: 1, tower: 'archery' };
    turn(0);
    turn(1, [build]);
    turn(1, []);
    turn(0, [build]);
    expect(session.commandsFor(TURN_TICKS)).toEqual([build]);
    expect(session.commandsFor(0)).toEqual([]);
  });
});

describe('giving orders', () => {
  it('sends an order to the server instead of applying it', () => {
    session.order({ type: 'moveHero', heroId: 1, x: 10, y: 20 });
    expect(sent).toEqual([{ t: 'command', command: { type: 'moveHero', heroId: 1, x: 10, y: 20 } }]);
  });

  it('does not bother the server with an order for someone else\'s hero', () => {
    session.order({ type: 'moveHero', heroId: 2, x: 10, y: 20 });
    expect(sent).toEqual([]);
  });

  it('turns starting the wave into being ready', () => {
    session.order({ type: 'startWave' });
    expect(sent).toEqual([{ t: 'ready', ready: true }]);
  });

  it('can take its ready back', () => {
    session.setReady(false);
    expect(sent).toEqual([{ t: 'ready', ready: false }]);
  });

  it('knows whether it is marked as ready and who is still missing', () => {
    session.receive({
      t: 'room',
      room: roomInfo({
        players: [
          { id: 1, name: 'Ana', connected: true, ready: true, heroes: [1, 3] },
          { id: 2, name: 'Beto', connected: true, ready: false, heroes: [2, 4] },
          { id: 3, name: 'Caro', connected: false, ready: false, heroes: [] },
        ],
      }),
    });
    expect(session.isReady()).toBe(true);
    // Caro is not connected, so nobody waits for her.
    expect(session.waitingFor()).toEqual(['Beto']);
  });
});

describe('staying in step', () => {
  it('reports its fingerprint at each checkpoint, and only then', () => {
    const level = coopLevel(START.mapId, START.difficulty, START.playerCount);
    const game = createGame(level, START.seed);
    for (let i = 0; i < HASH_EVERY_TURNS; i++) turn(i);
    for (let tick = 0; tick < HASH_EVERY_TURNS * TURN_TICKS; tick++) {
      step(game, level, session.commandsFor(tick));
      session.played(game.tick, game);
    }
    expect(sent).toEqual([{ t: 'hash', turn: HASH_EVERY_TURNS - 1, hash: hashState(game) }]);
  });

  it('adopts the game the server sends when it has drifted', () => {
    const level = coopLevel(START.mapId, START.difficulty, START.playerCount);
    const reference = createGame(level, START.seed);
    for (let i = 0; i < 30; i++) step(reference, level);
    turn(0);

    session.receive({ t: 'snapshot', turn: 9, start: START, state: reference });
    const adopted = session.takeSnapshot();
    expect(adopted?.tick).toBe(30);
    // It is handed over once.
    expect(session.takeSnapshot()).toBeNull();
    // And the game goes on from the turn after the snapshot.
    expect(session.canStep(30)).toBe(false);
    turn(10);
    expect(session.canStep(30)).toBe(true);
  });

  it('drops the turns a snapshot already includes', () => {
    const build: Command = { type: 'buildTower', slot: 1, tower: 'archery' };
    for (let i = 0; i < 5; i++) turn(i, i === 3 ? [build] : []);
    const level = coopLevel(START.mapId, START.difficulty, START.playerCount);
    session.receive({ t: 'snapshot', turn: 9, start: START, state: createGame(level, START.seed) });
    expect(session.bufferedTurns()).toBe(0);
  });

  it('learns the game from a snapshot when it rejoins without having seen the start', () => {
    const fresh = new CoopSession(() => {});
    const level = coopLevel(START.mapId, START.difficulty, START.playerCount);
    fresh.receive({ t: 'joined', playerId: 2, token: 'secret', room: roomInfo() });
    fresh.receive({ t: 'snapshot', turn: 4, start: START, state: createGame(level, START.seed) });
    expect(fresh.start).toEqual(START);
    expect(fresh.takeSnapshot()).not.toBeNull();
  });
});

describe('a whole game through a real room', () => {
  it('two sessions fed by the same room end with the same game as the server', () => {
    const room = new Room({
      code: 'ABCD',
      mapId: 'meadow',
      difficulty: 'normal',
      seed: 7,
      newToken: () => 'token',
    });
    interface Player {
      id: number;
      session: CoopSession;
      game: GameState | null;
      level: Level | null;
    }
    const players: Player[] = [];
    // Each session talks to the room as its own player.
    for (const name of ['Ana', 'Beto']) {
      const player: Player = { id: 0, session: null as unknown as CoopSession, game: null, level: null };
      player.session = new CoopSession((message) => {
        if (message.t === 'ready') room.setReady(player.id, message.ready);
        if (message.t === 'command') room.submit(player.id, message.command);
        if (message.t === 'hash') room.reportHash(player.id, message.turn, message.hash);
      });
      const result = room.join(name);
      if (!result.ok) throw new Error(result.error);
      player.id = result.player.id;
      players.push(player);
    }
    const deliver = () => {
      for (const { to, message } of room.drain()) {
        players.find((player) => player.id === to)?.session.receive(message);
      }
    };
    deliver();
    for (const player of players) player.session.setReady(true);
    deliver();

    for (const player of players) {
      const start = player.session.start!;
      player.level = coopLevel(start.mapId, start.difficulty, start.playerCount);
      player.game = createGame(player.level, start.seed);
    }

    let snapshots = 0;
    for (let beat = 0; beat < 900; beat++) {
      if (beat === 4) players[0].session.order({ type: 'buildTower', slot: 1, tower: 'archery' });
      if (beat === 8) players[1].session.order({ type: 'moveHero', heroId: 2, x: 420, y: 250 });
      if (beat % 50 === 0) for (const player of players) player.session.order({ type: 'startWave' });
      room.tick();
      deliver();
      for (const player of players) {
        if (player.session.takeSnapshot()) snapshots++;
        while (player.session.canStep(player.game!.tick)) {
          step(player.game!, player.level!, player.session.commandsFor(player.game!.tick));
          player.session.played(player.game!.tick, player.game!);
        }
      }
      deliver();
    }

    expect(room.game!.tick).toBe(900 * TURN_TICKS);
    expect(room.game!.towers).toHaveLength(1);
    for (const player of players) expect(hashState(player.game!)).toBe(hashState(room.game!));
    // Nobody drifted, so the server never had to send the whole game.
    expect(snapshots).toBe(0);
  });
});

describe('signals on the map', () => {
  it('sends a signal to the server', () => {
    session.signal('help', 300, 200);
    expect(sent).toEqual([{ t: 'signal', signal: { kind: 'help', x: 300, y: 200 } }]);
  });

  it('hands over the signals that arrived, once, with the name of who sent them', () => {
    session.receive({ t: 'signal', playerId: 2, kind: 'going', x: 5, y: 6 });
    expect(session.takeSignals()).toEqual([{ playerId: 2, name: 'Beto', kind: 'going', x: 5, y: 6 }]);
    expect(session.takeSignals()).toEqual([]);
  });
});
