// What a browser tab keeps to get back into a shared game after the page is
// reloaded. It lives in the tab's own storage, so it dies with the tab and two
// tabs never fight over the same seat.

const KEY = 'tower-defense-heroes.coop-ticket';

export interface Ticket {
  code: string;
  token: string;
}

/** The part of the browser's storage this needs; easy to stand in for in tests. */
export type TicketStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The tab's storage, or null where the browser does not offer it. */
export function tabStore(): TicketStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveTicket(store: TicketStore | null, ticket: Ticket): void {
  try {
    store?.setItem(KEY, JSON.stringify(ticket));
  } catch {
    // Without storage a reload simply cannot bring the player back.
  }
}

export function loadTicket(store: TicketStore | null): Ticket | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { code, token } = parsed as Record<string, unknown>;
    return typeof code === 'string' && typeof token === 'string' ? { code, token } : null;
  } catch {
    return null;
  }
}

export function clearTicket(store: TicketStore | null): void {
  try {
    store?.removeItem(KEY);
  } catch {
    // Nothing to clear where there is no storage.
  }
}
