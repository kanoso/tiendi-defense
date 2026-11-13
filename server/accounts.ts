import { createHash, randomBytes, randomInt } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { mergeProgress } from '../src/progress/merge';
import { CODE_LENGTH, CODE_LETTERS, normalizeCode } from '../src/progress/playerCode';
import { emptyProgress, parseProgress, serializeProgress, type Progress } from '../src/progress/progress';
import { newerSavedGame, parseSavedGame, type SavedGame } from '../src/progress/savedGame';
import { verifyGoogleIdToken, type GoogleKeys } from './google';

export { normalizeCode };

// Progress kept on the server, under a player code or a Google account.
// Nothing personal is ever written to disk: an account file is named by a hash
// of its key (the code, or a hash of the Google id), and a session by a hash
// of its token. Whoever copies the folder can use none of them.

const MAX_BODY_BYTES = 32 * 1024;

/** Failed tries (unknown codes, invalid Google tokens), per address, before it has to wait. */
const MAX_MISSES = 10;
const MISS_WINDOW_MS = 10 * 60_000;
/** Account requests of any kind, per address and minute. */
const MAX_REQUESTS_PER_MINUTE = 120;
/** New accounts and sessions, per address and hour: each one is a file on the server's disk. */
const MAX_CREATIONS_PER_HOUR = 30;

const SESSION_PATTERN = /^s_[A-Za-z0-9_-]{32}$/;

export function newPlayerCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_LETTERS[randomInt(CODE_LETTERS.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/** The key a Google account's progress is kept under. Google's id itself is never kept. */
const googleKey = (sub: string): string => `google:${sha256(sub)}`;

interface Account {
  progress: Progress;
  updatedAt: string;
}

/** Accounts as files in a folder, one per key, named by a hash of the key. */
export class AccountStore {
  /** Writes to one account wait for each other, so two devices never lose a save. */
  private queues = new Map<string, Promise<unknown>>();

  constructor(private dir: string) {}

  /** A new player code holding `progress`. */
  async create(progress: Progress): Promise<string> {
    for (;;) {
      const code = newPlayerCode();
      if ((await this.load(code)) === null) {
        await this.write(code, { progress, updatedAt: new Date().toISOString() });
        return code;
      }
    }
  }

  async load(key: string): Promise<Account | null> {
    let text: string;
    try {
      text = await readFile(this.fileOf(key), 'utf8');
    } catch {
      return null;
    }
    try {
      const data = JSON.parse(text) as { progress?: unknown; updatedAt?: unknown };
      return {
        progress: parseProgress(JSON.stringify(data.progress ?? null)),
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
      };
    } catch {
      return null;
    }
  }

  /** Joins `progress` into the account. Null if there is no such account. */
  merge(key: string, progress: Progress): Promise<Account | null> {
    return this.queued(key, async () => {
      const current = await this.load(key);
      if (!current) return null;
      return this.write(key, { progress: mergeProgress(current.progress, progress), updatedAt: now() });
    });
  }

  /** Joins `progress` into the account, making the account if it is not there yet. */
  ensure(key: string, progress: Progress): Promise<Account> {
    return this.queued(key, async () => {
      const current = await this.load(key);
      const joined = current ? mergeProgress(current.progress, progress) : progress;
      return this.write(key, { progress: joined, updatedAt: now() });
    });
  }

  private async write(key: string, account: Account): Promise<Account> {
    await mkdir(this.dir, { recursive: true });
    const file = this.fileOf(key);
    // Written aside and then moved into place: a crash never leaves half a file.
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(
      temporary,
      JSON.stringify({ progress: JSON.parse(serializeProgress(account.progress)), updatedAt: account.updatedAt }),
    );
    await rename(temporary, file);
    return account;
  }

  private fileOf(key: string): string {
    return path.join(this.dir, `${sha256(key)}.json`);
  }

  private queued<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.then(work, work);
    const settled = next.catch(() => {});
    this.queues.set(key, settled);
    void settled.then(() => {
      if (this.queues.get(key) === settled) this.queues.delete(key);
    });
    return next;
  }
}

/**
 * The game an account left between waves: one per account, apart from its
 * progress so neither overwrites the other. Only playable games are kept.
 */
export class SavedGameStore {
  private queues = new Map<string, Promise<unknown>>();

  constructor(private dir: string) {}

  async load(accountKey: string): Promise<SavedGame | null> {
    try {
      return parseSavedGame(JSON.parse(await readFile(this.fileOf(accountKey), 'utf8')));
    } catch {
      return null;
    }
  }

  /** Keeps `game` unless the account already has one saved later. Gives back the one kept. */
  put(accountKey: string, game: SavedGame): Promise<SavedGame> {
    return this.queued(accountKey, async () => {
      const kept = newerSavedGame(await this.load(accountKey), game)!;
      if (kept === game) {
        await mkdir(this.dir, { recursive: true });
        const file = this.fileOf(accountKey);
        const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
        await writeFile(temporary, JSON.stringify(game));
        await rename(temporary, file);
      }
      return kept;
    });
  }

  /** Clears the saved game, but only if it is the game that ended. */
  remove(accountKey: string, gameId: string): Promise<void> {
    return this.queued(accountKey, async () => {
      if ((await this.load(accountKey))?.gameId === gameId) await rm(this.fileOf(accountKey), { force: true });
    });
  }

  private fileOf(accountKey: string): string {
    return path.join(this.dir, `${sha256(`saved:${accountKey}`)}.json`);
  }

  private queued<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.then(work, work);
    const settled = next.catch(() => {});
    this.queues.set(key, settled);
    void settled.then(() => {
      if (this.queues.get(key) === settled) this.queues.delete(key);
    });
    return next;
  }
}

/**
 * Sessions of signed-in devices: a random token the device keeps, standing for
 * the account it signed in to. Only a hash of the token is kept here.
 */
export class SessionStore {
  constructor(private dir: string) {}

  async create(accountKey: string): Promise<string> {
    const token = `s_${randomBytes(24).toString('base64url')}`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.fileOf(token), JSON.stringify({ account: accountKey, createdAt: now() }));
    return token;
  }

  /** The account a session stands for, or null if there is no such session. */
  async accountOf(token: string): Promise<string | null> {
    try {
      const data = JSON.parse(await readFile(this.fileOf(token), 'utf8')) as { account?: unknown };
      return typeof data.account === 'string' ? data.account : null;
    } catch {
      return null;
    }
  }

  async remove(token: string): Promise<void> {
    await rm(this.fileOf(token), { force: true });
  }

  private fileOf(token: string): string {
    return path.join(this.dir, `${sha256(token)}.json`);
  }
}

/** Counts per address over a window of time. */
class Limiter {
  private counts = new Map<string, { since: number; count: number }>();

  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  /** Whether the address is over the limit. */
  blocked(address: string, at = Date.now()): boolean {
    const entry = this.counts.get(address);
    return entry !== undefined && at - entry.since < this.windowMs && entry.count >= this.max;
  }

  add(address: string, at = Date.now()): void {
    const entry = this.counts.get(address);
    if (!entry || at - entry.since >= this.windowMs) this.counts.set(address, { since: at, count: 1 });
    else entry.count++;
    // Forget old addresses now and then, so the table does not grow forever.
    if (this.counts.size > 10_000) {
      for (const [key, value] of this.counts) if (at - value.since >= this.windowMs) this.counts.delete(key);
    }
  }
}

export interface AccountsApiOptions {
  /** Where accounts live. Without it, accounts are not offered at all. */
  dataDir: string | null;
  allowedOrigins: readonly string[];
  /** Signing in with Google, when the game has a Google client. */
  google: { clientId: string; keys: GoogleKeys } | null;
}

/**
 * Answers `/api/...` requests. Returns false for anything that is not an
 * account request, so the caller can serve it otherwise.
 */
export function createAccountsApi(options: AccountsApiOptions) {
  const store = options.dataDir ? new AccountStore(options.dataDir) : null;
  const sessions = options.dataDir ? new SessionStore(path.join(options.dataDir, 'sessions')) : null;
  const savedGames = options.dataDir ? new SavedGameStore(path.join(options.dataDir, 'saved')) : null;
  const misses = new Limiter(MAX_MISSES, MISS_WINDOW_MS);
  const requests = new Limiter(MAX_REQUESTS_PER_MINUTE, 60_000);
  const creations = new Limiter(MAX_CREATIONS_PER_HOUR, 60 * 60_000);

  /** The account key a request speaks for: a player code, or a session's account. */
  async function accountKeyOf(request: IncomingMessage): Promise<string | 'missing' | null> {
    const credential = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1]?.trim();
    if (!credential) return 'missing';
    if (SESSION_PATTERN.test(credential)) return (await sessions?.accountOf(credential)) ?? null;
    return normalizeCode(credential) ?? 'missing';
  }

  return async function handle(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
    if (!pathname.startsWith('/api/')) return false;

    const origin = request.headers.origin;
    const headers: Record<string, string> = { vary: 'Origin', 'cache-control': 'no-store' };
    if (origin !== undefined && options.allowedOrigins.includes(origin)) headers['access-control-allow-origin'] = origin;
    const reply = (status: number, body?: unknown): true => {
      response.writeHead(status, body === undefined ? headers : { ...headers, 'content-type': 'application/json; charset=utf-8' });
      response.end(body === undefined ? undefined : JSON.stringify(body));
      return true;
    };

    if (!store || !sessions || !savedGames) return reply(404, { error: 'Este servidor no guarda avances' });
    if (request.method === 'OPTIONS') {
      headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE';
      headers['access-control-allow-headers'] = 'authorization, content-type';
      headers['access-control-max-age'] = '600';
      return reply(204);
    }

    const address = clientAddress(request);
    if (requests.blocked(address) || misses.blocked(address)) {
      return reply(429, { error: 'Demasiados intentos. Prueba en unos minutos.' });
    }
    requests.add(address);
    const tooManyCreations = (): true =>
      reply(429, { error: 'Se crearon demasiadas cuentas desde aquí. Prueba más tarde.' });
    const unknownAccount = (): true => {
      misses.add(address);
      return reply(404, { error: 'No hay ningún avance con ese código' });
    };

    if (pathname === '/api/accounts' && request.method === 'POST') {
      const body = await readJson(request);
      if (body === 'too-big') return reply(413, { error: 'Demasiado grande' });
      const progress = progressIn(body);
      if (!progress) return reply(400, { error: 'Avance no válido' });
      if (creations.blocked(address)) return tooManyCreations();
      creations.add(address);
      const code = await store.create(progress);
      const account = await store.load(code);
      return reply(201, { code, progress: account?.progress ?? emptyProgress() });
    }

    if (pathname === '/api/google' && request.method === 'POST') {
      if (!options.google) return reply(404, { error: 'Este servidor no ofrece entrar con Google' });
      const body = await readJson(request);
      if (body === 'too-big') return reply(413, { error: 'Demasiado grande' });
      const progress = progressIn(body);
      const credential = (body as { credential?: unknown } | null)?.credential;
      if (!progress || typeof credential !== 'string') return reply(400, { error: 'Pedido no válido' });

      const identity = await verifyGoogleIdToken(credential, options.google);
      if (!identity) {
        misses.add(address);
        return reply(401, { error: 'Google no confirmó la cuenta' });
      }
      if (creations.blocked(address)) return tooManyCreations();
      creations.add(address);
      const key = googleKey(identity.sub);
      let account = await store.ensure(key, progress);
      // The player code this device was using comes along into the Google account.
      const code = normalizeCode((body as { code?: unknown }).code);
      const fromCode = code ? await store.load(code) : null;
      if (fromCode) account = await store.ensure(key, fromCode.progress);
      const session = await sessions.create(key);
      return reply(200, { session, name: identity.name, progress: account.progress });
    }

    if (pathname === '/api/session' && request.method === 'DELETE') {
      const credential = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1]?.trim() ?? '';
      if (SESSION_PATTERN.test(credential)) await sessions.remove(credential);
      return reply(204);
    }

    if (pathname === '/api/saved-game' && ['GET', 'PUT', 'DELETE'].includes(request.method ?? '')) {
      const key = await accountKeyOf(request);
      if (key === 'missing') return reply(401, { error: 'Falta el código de jugador' });
      if (key === null || !(await store.load(key))) return unknownAccount();

      if (request.method === 'GET') return reply(200, { savedGame: await savedGames.load(key) });
      if (request.method === 'DELETE') {
        const gameId = new URL(request.url ?? '/', 'http://localhost').searchParams.get('gameId');
        if (gameId) await savedGames.remove(key, gameId);
        return reply(204);
      }
      const body = await readJson(request);
      if (body === 'too-big') return reply(413, { error: 'Demasiado grande' });
      const game = parseSavedGame((body as { savedGame?: unknown } | null)?.savedGame);
      if (!game) return reply(400, { error: 'Partida no válida' });
      return reply(200, { savedGame: await savedGames.put(key, game) });
    }

    if (pathname === '/api/progress' && (request.method === 'GET' || request.method === 'PUT')) {
      const key = await accountKeyOf(request);
      if (key === 'missing') return reply(401, { error: 'Falta el código de jugador' });
      if (key === null) return unknownAccount();

      if (request.method === 'GET') {
        const account = await store.load(key);
        return account ? reply(200, account) : unknownAccount();
      }

      const body = await readJson(request);
      if (body === 'too-big') return reply(413, { error: 'Demasiado grande' });
      const progress = progressIn(body);
      if (!progress) return reply(400, { error: 'Avance no válido' });
      const account = await store.merge(key, progress);
      return account ? reply(200, account) : unknownAccount();
    }

    return reply(404, { error: 'No existe' });
  };
}

function now(): string {
  return new Date().toISOString();
}

/** Behind the tunnel every request comes from it; the original address travels in a header. */
function clientAddress(request: IncomingMessage): string {
  const forwarded = request.headers['cf-connecting-ip'];
  return (typeof forwarded === 'string' && forwarded) || request.socket.remoteAddress || 'unknown';
}

function progressIn(body: unknown): Progress | null {
  if (typeof body !== 'object' || body === null || !('progress' in body)) return null;
  const progress = (body as { progress: unknown }).progress;
  if (typeof progress !== 'object' || progress === null) return null;
  return parseProgress(JSON.stringify(progress));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return 'too-big';
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}
