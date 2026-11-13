import { distributeHeroes, heroShare, isAllowed, parseCommand } from '../core/multiplayer';
import { findMap } from '../data/maps';
import { createGame, step, type Command, type GameState, type Level } from '../core/simulation';
import { hashState } from '../core/stateHash';
import type { DifficultyId } from '../data/difficulty';
import { coopLevel } from './coopLevel';
import {
  HASH_EVERY_TURNS,
  MAX_PLAYERS,
  SIGNAL_EVERY_TURNS,
  SIGNAL_KINDS,
  TURN_TICKS,
  type GameStart,
  type PlayerInfo,
  type RoomInfo,
  type ServerMessage,
  type Signal,
} from './protocol';

const MAX_NAME_LENGTH = 16;
/** How many past fingerprints are kept to check late reports against. */
const KEPT_HASHES = 8;

interface Player extends PlayerInfo {
  /** Proves who they are when they come back after losing the connection. */
  token: string;
  /** Turn of their last signal, to keep anyone from flooding the map. */
  lastSignalTurn: number;
}

export interface RoomOptions {
  code: string;
  mapId: string;
  difficulty: DifficultyId;
  seed: number;
  /** Makes a secret no other player can guess. */
  newToken: () => string;
}

export type JoinResult = { ok: true; player: PlayerInfo } | { ok: false; error: string };

/**
 * One shared game: who is in it and, once it starts, the game itself.
 *
 * It knows nothing about networks. Whatever carries the messages calls its
 * methods when something arrives and delivers what piles up in `outbox`. That
 * keeps every rule of playing together testable without a single connection.
 *
 * How players stay in step: nobody is sent the state of the game. Each player
 * runs the same simulation and is only told, turn by turn, which orders to
 * apply. The room runs it too, as the reference, and compares fingerprints.
 */
export class Room {
  /** Messages waiting to be delivered, each addressed to one player. */
  outbox: { to: number; message: ServerMessage }[] = [];
  /** The reference game. Null until the game starts. */
  game: GameState | null = null;

  private players: Player[] = [];
  private nextPlayerId = 1;
  private state: RoomInfo['state'] = 'lobby';
  private level: Level | null = null;
  private start: GameStart | null = null;
  /** Number of the next turn to send. */
  private turn = 0;
  /** Orders received since the last turn, in arrival order. */
  private pending: Command[] = [];
  /** The reference fingerprint after some recent turns, by turn number. */
  private hashes = new Map<number, number>();

  constructor(private options: RoomOptions) {}

  info(): RoomInfo {
    return {
      code: this.options.code,
      mapId: this.options.mapId,
      difficulty: this.options.difficulty,
      state: this.state,
      players: this.players.map(({ id, name, connected, ready, heroes }) => ({
        id,
        name,
        connected,
        ready,
        heroes: [...heroes],
      })),
    };
  }

  /** True when no connected player is left and the room can be thrown away. */
  isEmpty(): boolean {
    return !this.players.some((player) => player.connected);
  }

  /** Hands over everything waiting to be delivered. */
  drain(): { to: number; message: ServerMessage }[] {
    const messages = this.outbox;
    this.outbox = [];
    return messages;
  }

  // --- coming and going ----------------------------------------------------

  join(name: string): JoinResult {
    if (this.state !== 'lobby') return { ok: false, error: 'La partida ya empezó' };
    if (this.players.length >= MAX_PLAYERS) return { ok: false, error: 'La sala está llena' };

    const id = this.nextPlayerId++;
    const player: Player = {
      id,
      name: name.trim().slice(0, MAX_NAME_LENGTH) || `Jugador ${id}`,
      connected: true,
      ready: false,
      heroes: [],
      token: this.options.newToken(),
      lastSignalTurn: -SIGNAL_EVERY_TURNS,
    };
    this.players.push(player);
    this.trimChoices();
    this.send(id, { t: 'joined', playerId: id, token: player.token, room: this.info() });
    this.broadcastRoom();
    return { ok: true, player: this.publicInfo(player) };
  }

  /** Comes back with the token given on joining. Only possible once the game started. */
  rejoin(token: string): JoinResult {
    const player = this.players.find((candidate) => candidate.token === token);
    if (!player || !this.game || !this.start) return { ok: false, error: 'No se pudo volver a la sala' };

    player.connected = true;
    this.send(player.id, { t: 'joined', playerId: player.id, token, room: this.info() });
    this.sendSnapshot(player.id);
    this.broadcastRoom();
    return { ok: true, player: this.publicInfo(player) };
  }

  disconnect(playerId: number): void {
    const player = this.find(playerId);
    if (!player) return;
    if (this.state === 'lobby') {
      // Nothing to come back to yet: the seat is simply free again.
      this.players = this.players.filter((candidate) => candidate !== player);
    } else {
      // The seat and the heroes stay theirs, in case they return.
      player.connected = false;
      player.ready = false;
    }
    this.broadcastRoom();
  }

  // --- what players do -----------------------------------------------------

  /**
   * In the lobby, ready means "start the game". During the game it means "send
   * the next wave", and only counts between waves.
   */
  setReady(playerId: number, ready: boolean): void {
    const player = this.find(playerId);
    if (!player || !player.connected) return;
    if (this.state === 'playing' && this.game?.phase !== 'preparing') return;

    player.ready = ready;
    if (this.state === 'lobby' && this.everyoneIsReady()) {
      this.startGame();
    } else {
      this.broadcastRoom();
    }
  }

  /** In the lobby: takes a free hero for the player, or gives back one they have. */
  pick(playerId: number, heroId: number): void {
    const player = this.find(playerId);
    if (!player || this.state !== 'lobby') return;
    if (!Number.isInteger(heroId) || heroId < 1 || heroId > this.heroCount()) return;

    if (player.heroes.includes(heroId)) {
      player.heroes = player.heroes.filter((id) => id !== heroId);
    } else {
      const takenByOther = this.players.some((other) => other.heroes.includes(heroId));
      if (takenByOther || player.heroes.length >= this.share()) return;
      player.heroes = [...player.heroes, heroId];
    }
    this.broadcastRoom();
  }

  /** An order from a player. It is passed on in the next turn, if it is theirs to give. */
  submit(playerId: number, raw: unknown): void {
    const player = this.find(playerId);
    if (!player || !player.connected || this.state !== 'playing') return;
    const command = parseCommand(raw);
    if (command && isAllowed(command, player.heroes)) this.pending.push(command);
  }

  /**
   * A signal on the map from a player, shown to everyone. It changes nothing
   * in the game, so it travels at once instead of waiting for a turn.
   */
  signal(playerId: number, raw: unknown): void {
    const player = this.find(playerId);
    if (!player || !player.connected || this.state !== 'playing' || !this.level) return;
    if (this.turn - player.lastSignalTurn < SIGNAL_EVERY_TURNS) return;
    if (typeof raw !== 'object' || raw === null) return;
    const { kind, x, y } = raw as Record<string, unknown>;
    if (!SIGNAL_KINDS.includes(kind as never)) return;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    player.lastSignalTurn = this.turn;
    this.broadcast({
      t: 'signal',
      playerId,
      kind: kind as Signal['kind'],
      x: Math.round(Math.min(Math.max(x, 0), this.level.width)),
      y: Math.round(Math.min(Math.max(y, 0), this.level.height)),
    });
  }

  /** A player's fingerprint after `turn`. A wrong one gets them the whole game back. */
  reportHash(playerId: number, turn: number, hash: number): void {
    const expected = this.hashes.get(turn);
    if (expected === undefined || expected === hash) return;
    const player = this.find(playerId);
    if (player?.connected) this.sendSnapshot(playerId);
  }

  // --- the clock -----------------------------------------------------------

  /**
   * One beat of the server clock: closes a turn, tells everyone which orders it
   * holds and plays it on the reference game.
   */
  tick(): void {
    if (this.state !== 'playing' || !this.game || !this.level) return;

    const commands = this.pending;
    this.pending = [];
    if (this.game.phase === 'preparing' && this.everyoneIsReady()) {
      commands.push({ type: 'startWave' });
      for (const player of this.players) player.ready = false;
      this.broadcastRoom();
    }

    this.broadcast({ t: 'turn', turn: this.turn, commands });
    step(this.game, this.level, commands);
    for (let tick = 1; tick < TURN_TICKS; tick++) step(this.game, this.level);

    if ((this.turn + 1) % HASH_EVERY_TURNS === 0) {
      this.hashes.set(this.turn, hashState(this.game));
      for (const old of this.hashes.keys()) {
        if (this.hashes.size <= KEPT_HASHES) break;
        this.hashes.delete(old);
      }
    }
    this.turn++;
  }

  // --- internals -----------------------------------------------------------

  private startGame(): void {
    const start: GameStart = {
      seed: this.options.seed,
      mapId: this.options.mapId,
      difficulty: this.options.difficulty,
      playerCount: this.players.length,
    };
    this.start = start;
    this.level = coopLevel(start.mapId, start.difficulty, start.playerCount);
    this.game = createGame(this.level, start.seed);
    this.state = 'playing';

    const heroes = distributeHeroes(
      this.players.map((player) => player.heroes),
      this.game.heroes.length,
    );
    this.players.forEach((player, index) => {
      player.heroes = heroes[index];
      player.ready = false;
    });
    this.broadcast({ t: 'start', start, room: this.info() });
  }

  private heroCount(): number {
    return findMap(this.options.mapId).level.heroes.length;
  }

  private share(): number {
    return heroShare(this.players.length, this.heroCount());
  }

  /** After someone joins, nobody may hold more than the new, smaller share. */
  private trimChoices(): void {
    for (const player of this.players) player.heroes = player.heroes.slice(0, this.share());
  }

  /** At least one player is connected and none of the connected ones is waiting. */
  private everyoneIsReady(): boolean {
    const connected = this.players.filter((player) => player.connected);
    return connected.length > 0 && connected.every((player) => player.ready);
  }

  private sendSnapshot(playerId: number): void {
    if (!this.game || !this.start) return;
    this.send(playerId, {
      t: 'snapshot',
      turn: this.turn - 1,
      start: this.start,
      // A copy: the reference game keeps changing after this message is queued.
      state: structuredClone(this.game),
    });
  }

  private find(playerId: number): Player | undefined {
    return this.players.find((player) => player.id === playerId);
  }

  private publicInfo({ id, name, connected, ready, heroes }: Player): PlayerInfo {
    return { id, name, connected, ready, heroes: [...heroes] };
  }

  private send(to: number, message: ServerMessage): void {
    this.outbox.push({ to, message });
  }

  private broadcast(message: ServerMessage): void {
    for (const player of this.players) {
      if (player.connected) this.send(player.id, message);
    }
  }

  private broadcastRoom(): void {
    this.broadcast({ t: 'room', room: this.info() });
  }
}
