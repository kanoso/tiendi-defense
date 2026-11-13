import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyGoogleIdToken } from './google';
import { googleToken, TEST_CLIENT_ID, testGoogleKeys } from './testing/googleTokens';

// Google's sign-in hands the page a signed token (a JWT). The server only
// trusts it after checking the signature against Google's public keys and
// that it was issued for this game, recently.

const NOW = 1_800_000_000;
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });

const token = (claims: Record<string, unknown> = {}, options: Parameters<typeof googleToken>[1] = {}) =>
  googleToken(claims, { now: NOW, ...options });
const verify = (credential: string) =>
  verifyGoogleIdToken(credential, { clientId: TEST_CLIENT_ID, keys: testGoogleKeys, now: NOW });

describe('checking a Google sign-in token', () => {
  it('accepts a token signed by Google for this game, and gives who signed in', async () => {
    expect(await verify(token())).toEqual({ sub: '1234567890', name: 'Ana Pérez' });
  });

  it('accepts both ways Google writes its own name as issuer', async () => {
    expect(await verify(token({ iss: 'accounts.google.com' }))).not.toBeNull();
  });

  it('refuses a token signed with any other key', async () => {
    expect(await verify(token({}, { key: other.privateKey }))).toBeNull();
  });

  it('refuses a token whose key Google does not list', async () => {
    expect(await verify(token({}, { kid: 'unknown' }))).toBeNull();
  });

  it('refuses a token changed after it was signed', async () => {
    const [header, , signature] = token().split('.');
    const forged = Buffer.from(
      JSON.stringify({ iss: 'https://accounts.google.com', aud: TEST_CLIENT_ID, sub: 'someone-else', iat: NOW, exp: NOW + 3600 }),
    ).toString('base64url');
    expect(await verify(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it('refuses a token issued for another site', async () => {
    expect(await verify(token({ aud: 'another-client.apps.googleusercontent.com' }))).toBeNull();
  });

  it('refuses a token from anyone but Google', async () => {
    expect(await verify(token({ iss: 'https://evil.example' }))).toBeNull();
  });

  it('refuses an expired token, with a minute of grace for clocks', async () => {
    expect(await verify(token({ exp: NOW - 120 }))).toBeNull();
    expect(await verify(token({ exp: NOW - 30 }))).not.toBeNull();
  });

  it('refuses any signing method but the one Google uses', async () => {
    expect(await verify(token({}, { alg: 'none' }))).toBeNull();
    expect(await verify(token({}, { alg: 'HS256' }))).toBeNull();
  });

  it('refuses a token without an account id', async () => {
    expect(await verify(token({ sub: '' }))).toBeNull();
    expect(await verify(token({ sub: 42 }))).toBeNull();
  });

  it('refuses things that are not tokens at all', async () => {
    for (const junk of ['', 'abc', 'a.b', 'a.b.c', '...', 'x'.repeat(20_000)]) {
      expect(await verify(junk)).toBeNull();
    }
  });
});
