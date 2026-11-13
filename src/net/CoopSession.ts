import { isAllowed } from '../core/multiplayer';
import type { Command, GameState } from '../core/simulation';
import { hashState } from '../core/stateHash';
import {
  HASH_EVERY_TURNS,
  TURN_TICKS,
  type ClientMessage,
  type GameStart,
  type RoomInfo,
  type ServerMessage,
} from './protocol';

/**
 * One player's side of a shared game: who they are in the room, which turns
 * the server has confirmed, and what to tell the server.
 *
 * It holds no connection and no game. Whatever owns the connection passes each
 * message to `receive` and gives a way to send; whatever runs the game asks
 * `canStep` before every tick. That keeps the rules of staying in step
 * testable on their own.
 */
export class CoopSession {
  playerId: number | null = null;
  room: RoomInfo | null = null;
  /** How to build the game. Null until it starts. */
  start: GameStart | null = null;
  /** The last thing the server refused, in words for the player. */
  lastError: string | null = null;

  private token: string | null = null;
  /** Orders of the turns received and not yet played, by turn number. */
  private turns = new Map<number, Command[]>();
  /** The last turn received. Turns arrive in order, with none missing. */
  private confirmedTurn = -1;
  /** A whole game sent by the server, waiting to replace the local one. */
  private snapshot: GameState | null = null;

  constructor(private send: (message: ClientMessage) => void) {}

  receive(message: ServerMessage): void {
    switch (message.t) {
      case 'joined':
        this.playerId = message.playerId;
        this.token = message.token;
        this.room = message.room;
        this.lastError = null;
        return;
      case 'room':
        this.room = message.room;
        return;
      case 'start':
        this.start = message.start;
        this.room = message.room;
        return;
      case 'turn':
        // Anything but the next turn is a repeat or a stray: playing it would
        // put this player out of step with everyone else.
        if (message.turn !== this.confirmedTurn + 1) return;
        this.turns.set(message.turn, message.commands);
        this.confirmedTurn = message.turn;
        return;
      case 'snapshot':
        this.start = message.start;
        this.snapshot = message.state;
        // The snapshot already contains every turn up to its own.
        this.turns.clear();
        this.confirmedTurn = message.turn;
        return;
      case 'error':
        this.lastError = message.message;
        return;
    }
  }

  // --- who is who ------------------------------------------------------------

  /** What is needed to get back into this game after losing the connection. */
  rejoinTicket(): { code: string; token: string } | null {
    return this.room && this.token ? { code: this.room.code, token: this.token } : null;
  }

  ownHeroes(): number[] {
    return this.room?.players.find((player) => player.id === this.playerId)?.heroes ?? [];
  }

  /** Name of the player who controls a hero, or null if nobody does. */
  ownerName(heroId: number): string | null {
    return this.room?.players.find((player) => player.heroes.includes(heroId))?.name ?? null;
  }

  isReady(): boolean {
    return this.room?.players.find((player) => player.id === this.playerId)?.ready ?? false;
  }

  /** Names of the connected players who have not said they are ready. */
  waitingFor(): string[] {
    return (this.room?.players ?? [])
      .filter((player) => player.connected && !player.ready)
      .map((player) => player.name);
  }

  // --- giving orders ---------------------------------------------------------

  /**
   * Sends an order to the server. Nothing happens locally: the order comes back
   * in a turn, for this player and everyone else at the same time.
   */
  order(command: Command): void {
    if (command.type === 'startWave') return this.setReady(true);
    // The server would refuse it anyway; no need to send it.
    if (!isAllowed(command, this.ownHeroes())) return;
    this.send({ t: 'command', command });
  }

  setReady(ready: boolean): void {
    this.send({ t: 'ready', ready });
  }

  // --- pacing the local game -------------------------------------------------

  /** Whether the tick after `tick` belongs to a turn the server has confirmed. */
  canStep(tick: number): boolean {
    return tick < (this.confirmedTurn + 1) * TURN_TICKS;
  }

  /** The orders to apply on the step that starts at `tick`. Only a turn's first tick has any. */
  commandsFor(tick: number): readonly Command[] {
    if (tick % TURN_TICKS !== 0) return [];
    return this.turns.get(tick / TURN_TICKS) ?? [];
  }

  /** How many confirmed ticks the local game still has to play. */
  ticksBehind(tick: number): number {
    return (this.confirmedTurn + 1) * TURN_TICKS - tick;
  }

  bufferedTurns(): number {
    return this.turns.size;
  }

  /**
   * Call after every step with the new tick. Forgets the turns already played
   * and, at each checkpoint, reports the game's fingerprint to the server.
   */
  played(tick: number, game?: GameState): void {
    const currentTurn = Math.floor(tick / TURN_TICKS);
    for (const turn of this.turns.keys()) {
      if (turn < currentTurn) this.turns.delete(turn);
    }
    if (!game || tick % TURN_TICKS !== 0) return;
    const finishedTurn = currentTurn - 1;
    if ((finishedTurn + 1) % HASH_EVERY_TURNS === 0) {
      this.send({ t: 'hash', turn: finishedTurn, hash: hashState(game) });
    }
  }

  /** The game the server sent to replace the local one, if any. Handed over once. */
  takeSnapshot(): GameState | null {
    const snapshot = this.snapshot;
    this.snapshot = null;
    return snapshot;
  }
}
