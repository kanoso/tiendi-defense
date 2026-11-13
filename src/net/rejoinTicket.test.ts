import { describe, expect, it } from 'vitest';
import { clearTicket, loadTicket, saveTicket, type TicketStore } from './rejoinTicket';

/** A stand-in for the browser's per-tab storage. */
function memoryStore(): TicketStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('the ticket back into a shared game', () => {
  it('is kept and read back', () => {
    const store = memoryStore();
    saveTicket(store, { code: 'ABCD', token: 'secret' });
    expect(loadTicket(store)).toEqual({ code: 'ABCD', token: 'secret' });
  });

  it('is gone once cleared', () => {
    const store = memoryStore();
    saveTicket(store, { code: 'ABCD', token: 'secret' });
    clearTicket(store);
    expect(loadTicket(store)).toBeNull();
  });

  it('is null when nothing was kept', () => {
    expect(loadTicket(memoryStore())).toBeNull();
  });

  it('ignores whatever was kept that is not a ticket', () => {
    for (const junk of ['{', '"ABCD"', '{"code":"ABCD"}', '{"code":1,"token":"x"}', 'null']) {
      const store = memoryStore();
      store.data.set('tower-defense-heroes.coop-ticket', junk);
      expect(loadTicket(store)).toBeNull();
    }
  });

  it('never fails where storage is missing or refuses', () => {
    const refusing: TicketStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => saveTicket(refusing, { code: 'ABCD', token: 'x' })).not.toThrow();
    expect(loadTicket(refusing)).toBeNull();
    expect(() => clearTicket(refusing)).not.toThrow();
    expect(loadTicket(null)).toBeNull();
  });
});
