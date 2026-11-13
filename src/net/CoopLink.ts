import { CoopSession } from './CoopSession';
import type { ClientMessage, ServerMessage } from './protocol';
import type { Ticket } from './rejoinTicket';

export type LinkStatus = 'connecting' | 'online' | 'reconnecting' | 'closed';

const RECONNECT_EVERY_MS = 2000;
const RECONNECT_ATTEMPTS = 30;
const CONNECT_TIMEOUT_MS = 6000;
const REJOIN_TIMEOUT_MS = 6000;

/**
 * Where the co-op server is, as an http(s) address, or null to use the same
 * place the game itself was loaded from. It can be set in the page address
 * (`?server=http://host:port`) or at build time (`VITE_COOP_SERVER`).
 */
export function coopServerBase(): string {
  const fromAddress = new URLSearchParams(window.location.search).get('server');
  const fromBuild = (import.meta.env.VITE_COOP_SERVER as string | undefined) ?? '';
  return (fromAddress || fromBuild || window.location.origin).replace(/\/+$/, '');
}

/**
 * What the server at `base` offers, or null if none answers there. Never
 * throws; gives up after a moment.
 */
export async function serverFeatures(
  base: string,
): Promise<{ coop: true; accounts: boolean; googleClientId: string | null } | null> {
  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return null;
    const body = (await response.json()) as { ok?: unknown; accounts?: unknown; google?: unknown } | null;
    if (body?.ok !== true) return null;
    return {
      coop: true,
      accounts: body.accounts === true,
      googleClientId: typeof body.google === 'string' && body.google ? body.google : null,
    };
  } catch {
    return null;
  }
}

/**
 * Gets back into a game this tab was playing before the page was reloaded.
 * Resolves with a live link once the server has sent the game, or with null if
 * there is no game to go back to (it ended, or the server forgot the room).
 */
export async function rejoinGame(base: string, ticket: Ticket): Promise<CoopLink | null> {
  const link = new CoopLink(base);
  try {
    await link.connect();
  } catch {
    return null;
  }
  const back = await new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => resolve(false), REJOIN_TIMEOUT_MS);
    link.onChange = () => {
      const session = link.session;
      if (session.start && session.room) resolve(true);
      else if (session.lastError || link.status === 'closed') resolve(false);
      else return;
      window.clearTimeout(timer);
    };
    link.send({ t: 'rejoin', ...ticket });
  });
  link.onChange = () => {};
  if (back) return link;
  link.leave();
  return null;
}

/**
 * A player's connection to the co-op server, with the session that makes sense
 * of what travels over it. If the connection drops in the middle of a game it
 * keeps trying to get back in, using the ticket the server gave on joining.
 */
export class CoopLink {
  readonly session: CoopSession;
  status: LinkStatus = 'connecting';
  /** Called after every message and every change of status, to refresh what is on screen. */
  onChange: () => void = () => {};

  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private attemptsLeft = RECONNECT_ATTEMPTS;

  constructor(private base: string) {
    this.session = new CoopSession((message) => this.send(message));
  }

  /** Opens the connection. Rejects if the server cannot be reached. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`${this.base.replace(/^http/, 'ws')}/ws`);
      const timeout = window.setTimeout(() => {
        socket.close();
        reject(new Error('timeout'));
      }, CONNECT_TIMEOUT_MS);

      socket.onopen = () => {
        window.clearTimeout(timeout);
        this.socket = socket;
        this.setStatus('online');
        this.attemptsLeft = RECONNECT_ATTEMPTS;
        resolve();
      };
      socket.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('unreachable'));
      };
      socket.onmessage = (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }
        this.session.receive(message);
        this.onChange();
      };
      socket.onclose = () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.handleDrop();
      };
    });
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  /** Leaves for good: closes the connection and stops trying to come back. */
  leave(): void {
    this.setStatus('closed');
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  /** The connection dropped without the player asking: try to get back into the game. */
  private handleDrop(): void {
    if (this.status === 'closed') return;
    // Before the game starts there is nothing to come back to.
    if (!this.session.start || !this.session.rejoinTicket()) return this.setStatus('closed');
    this.setStatus('reconnecting');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.attemptsLeft-- <= 0) return this.setStatus('closed');
    this.reconnectTimer = window.setTimeout(() => {
      const ticket = this.session.rejoinTicket();
      if (this.status !== 'reconnecting' || !ticket) return;
      this.connect()
        .then(() => this.send({ t: 'rejoin', ...ticket }))
        .catch(() => {
          this.setStatus('reconnecting');
          this.scheduleReconnect();
        });
    }, RECONNECT_EVERY_MS);
  }

  private setStatus(status: LinkStatus): void {
    this.status = status;
    this.onChange();
  }
}
