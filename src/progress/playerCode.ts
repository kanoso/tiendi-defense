// The shape of a player code, shared by the game and the server.

/** No 0/O, 1/I/L: they are easy to misread when copied by hand. */
export const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;

/** A code as a person may type it (any case, spaces, with or without the dash), or null. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const plain = raw.toUpperCase().replace(/[\s-]/g, '');
  if (plain.length !== CODE_LENGTH) return null;
  if ([...plain].some((letter) => !CODE_LETTERS.includes(letter))) return null;
  return `${plain.slice(0, 4)}-${plain.slice(4)}`;
}
