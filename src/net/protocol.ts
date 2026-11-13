import type { Command, GameState } from '../core/simulation';
import type { DifficultyId } from '../data/difficulty';

// The messages players and the server exchange, as plain JSON.

/** Game ticks in one turn. The server sends a turn every 50 ms. */
export const TURN_TICKS = 3;
export const MAX_PLAYERS = 4;
/** Players report a fingerprint of their game every this many turns (3 seconds). */
export const HASH_EVERY_TURNS = 60;
/** A player can put a new signal on the map once every this many turns (1 second). */
export const SIGNAL_EVERY_TURNS = 20;

/** Quick signals on the map, in place of a text chat. */
export const SIGNAL_KINDS = ['help', 'going'] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export interface Signal {
  kind: SignalKind;
  x: number;
  y: number;
}

export interface PlayerInfo {
  id: number;
  name: string;
  connected: boolean;
  ready: boolean;
  /**
   * In the lobby, the heroes this player chose; once the game starts, the ones
   * they control.
   */
  heroes: number[];
}

export interface RoomInfo {
  /** What players type to join. */
  code: string;
  mapId: string;
  difficulty: DifficultyId;
  state: 'lobby' | 'playing';
  players: PlayerInfo[];
}

/** Everything a player needs to build the exact same game as everyone else. */
export interface GameStart {
  seed: number;
  mapId: string;
  difficulty: DifficultyId;
  /** How many players the game was balanced for. */
  playerCount: number;
}

export type ClientMessage =
  | { t: 'create'; name: string; mapId: string; difficulty: DifficultyId }
  | { t: 'join'; code: string; name: string }
  /** Come back to a game after losing the connection. */
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'ready'; ready: boolean }
  /** In the lobby: takes a free hero, or gives back one already taken. */
  | { t: 'pick'; heroId: number }
  | { t: 'command'; command: Command }
  /** The fingerprint of this player's game at the end of `turn`. */
  | { t: 'hash'; turn: number; hash: number }
  /** Points at a place on the map for everyone else. */
  | { t: 'signal'; signal: Signal };

export type ServerMessage =
  /** `token` proves who you are if you need to rejoin. Keep it private. */
  | { t: 'joined'; playerId: number; token: string; room: RoomInfo }
  | { t: 'room'; room: RoomInfo }
  | { t: 'start'; start: GameStart; room: RoomInfo }
  /** The orders to apply at the start of turn `turn`. Sent even when there are none. */
  | { t: 'turn'; turn: number; commands: Command[] }
  /** The whole game as it stands after `turn`: for a player who rejoined or drifted. */
  | { t: 'snapshot'; turn: number; start: GameStart; state: GameState }
  /** A signal one of the players put on the map. */
  | { t: 'signal'; playerId: number } & Signal
  | { t: 'error'; message: string };
