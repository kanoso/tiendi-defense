import { generateKeyPairSync, sign } from 'node:crypto';
import type { GoogleKeys } from '../google';

// Test stand-ins for Google's sign-in: a key pair of our own, published as if
// it were Google's, and tokens signed with it.

export const TEST_CLIENT_ID = 'test-client.apps.googleusercontent.com';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

export const testGoogleKeys: GoogleKeys = async (kid) =>
  kid === 'key-1' ? ({ ...(publicKey.export({ format: 'jwk' }) as JsonWebKey), kid } as JsonWebKey) : null;

export { privateKey as testPrivateKey };

/** A token as Google would sign it for this game, valid for an hour from now. */
export function googleToken(
  claims: Record<string, unknown> = {},
  options: { kid?: string; alg?: string; key?: typeof privateKey; now?: number } = {},
): string {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: options.alg ?? 'RS256', kid: options.kid ?? 'key-1', typ: 'JWT' });
  const payload = encode({
    iss: 'https://accounts.google.com',
    aud: TEST_CLIENT_ID,
    sub: '1234567890',
    iat: now - 10,
    exp: now + 3600,
    name: 'Ana Pérez',
    ...claims,
  });
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), options.key ?? privateKey);
  return `${header}.${payload}.${signature.toString('base64url')}`;
}
