import { createPublicKey, verify } from 'node:crypto';

// Checking the token Google's sign-in gives the page, without any library:
// an RS256-signed JWT whose public keys Google publishes.
// https://developers.google.com/identity/gsi/web/guides/verify-google-id-token

const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const GOOGLE_KEYS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
/** Clocks are never quite in step: a token just past its end still counts. */
const CLOCK_SKEW_S = 60;
const MAX_TOKEN_LENGTH = 8192;

/** Finds Google's public key with a given id, or null if there is none. */
export type GoogleKeys = (kid: string) => Promise<JsonWebKey | null>;

export interface GoogleIdentity {
  /** Google's stable id for the account. Never changes, unlike the email. */
  sub: string;
  /** For showing on the player's own screen only; never stored. */
  name: string | null;
}

/** Who signed in, or null if the token is not a valid Google token for this game. */
export async function verifyGoogleIdToken(
  credential: string,
  options: { clientId: string; keys: GoogleKeys; now?: number },
): Promise<GoogleIdentity | null> {
  if (typeof credential !== 'string' || credential.length > MAX_TOKEN_LENGTH) return null;
  const parts = credential.split('.');
  if (parts.length !== 3 || parts.some((part) => part === '')) return null;
  const [headerText, payloadText, signatureText] = parts;

  const header = decodeJson(headerText);
  const claims = decodeJson(payloadText);
  if (!header || !claims) return null;
  // Only Google's own method: never "none", never a shared secret.
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

  const jwk = await options.keys(header.kid);
  if (!jwk) return null;
  let valid = false;
  try {
    valid = verify(
      'RSA-SHA256',
      Buffer.from(`${headerText}.${payloadText}`),
      createPublicKey({ key: jwk, format: 'jwk' }),
      Buffer.from(signatureText, 'base64url'),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (!GOOGLE_ISSUERS.includes(claims.iss as string)) return null;
  if (claims.aud !== options.clientId) return null;
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_S < now) return null;
  if (typeof claims.sub !== 'string' || claims.sub === '') return null;
  return { sub: claims.sub, name: typeof claims.name === 'string' ? claims.name : null };
}

function decodeJson(part: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Google's public keys, fetched when first needed and kept as long as Google
 * says. A key id not seen before fetches them again, at most once a minute, so
 * nobody can make the server hammer Google with made-up ids.
 */
export function googleKeysFromGoogle(fetchKeys: typeof fetch = fetch): GoogleKeys {
  let keys = new Map<string, JsonWebKey>();
  let freshUntil = 0;
  let lastFetch = 0;

  async function refresh(): Promise<void> {
    lastFetch = Date.now();
    const response = await fetchKeys(GOOGLE_KEYS_URL, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return;
    const body = (await response.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
    keys = new Map((body.keys ?? []).filter((key) => key.kid).map((key) => [key.kid!, key]));
    const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1];
    freshUntil = Date.now() + (maxAge ? Number(maxAge) * 1000 : 3600_000);
  }

  return async (kid) => {
    try {
      const stale = Date.now() > freshUntil;
      const unknown = !keys.has(kid) && Date.now() - lastFetch > 60_000;
      if (stale || unknown) await refresh();
    } catch {
      // Google unreachable: use the keys already known, if any.
    }
    return keys.get(kid) ?? null;
  };
}

/**
 * Keys read from a JSON file in Google's format. Only for browser tests, which
 * sign their own tokens; the real server always asks Google.
 */
export function googleKeysFromFile(file: string): GoogleKeys {
  let keys: Map<string, JsonWebKey> | null = null;
  return async (kid) => {
    if (!keys) {
      const { readFile } = await import('node:fs/promises');
      const body = JSON.parse(await readFile(file, 'utf8')) as { keys?: (JsonWebKey & { kid?: string })[] };
      keys = new Map((body.keys ?? []).filter((key) => key.kid).map((key) => [key.kid!, key]));
    }
    return keys.get(kid) ?? null;
  };
}
