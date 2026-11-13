import { createHash, randomInt } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { mergeProgress } from '../src/progress/merge';
import { CODE_LENGTH, CODE_LETTERS, normalizeCode } from '../src/progress/playerCode';
import { emptyProgress, parseProgress, serializeProgress, type Progress } from '../src/progress/progress';

export { normalizeCode };

// Progress kept on the server under a player code: no name, no email, nothing
// personal. The code is the only key, so it is treated like a password: it is
// never written to disk, only a hash of it.

const MAX_BODY_BYTES = 32 * 1024;

/** Codes that match no account, per address, before it has to wait. */
const MAX_MISSES = 10;
const MISS_WINDOW_MS = 10 * 60_000;
/** Account requests of any kind, per address and minute. */
const MAX_REQUESTS_PER_MINUTE = 120;

export function newPlayerCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_LETTERS[randomInt(CODE_LETTERS.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

interface Account {
  progress: Progress;
  updatedAt: string;
}

/** Accounts as files in a folder, one per code, named by a hash of the code. */
export class AccountStore {
  /** Writes to one account wait for each other, so two devices never lose a save. */
  private queues = new Map<string, Promise<unknown>>();

  constructor(private dir: string) {}

  async create(progress: Progress): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    for (;;) {
      const code = newPlayerCode();
      if ((await this.load(code)) === null) {
        await this.write(code, { progress, updatedAt: new Date().toISOString() });
        return code;
      }
    }
  }

  async load(code: string): Promise<Account | null> {
    let text: string;
    try {
      text = await readFile(this.fileOf(code), 'utf8');
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
  merge(code: string, progress: Progress): Promise<Account | null> {
    return this.queued(code, async () => {
      const current = await this.load(code);
      if (!current) return null;
      const account = { progress: mergeProgress(current.progress, progress), updatedAt: new Date().toISOString() };
      await this.write(code, account);
      return account;
    });
  }

  private async write(code: string, account: Account): Promise<void> {
    const file = this.fileOf(code);
    // Written aside and then moved into place: a crash never leaves half a file.
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, JSON.stringify({ progress: JSON.parse(serializeProgress(account.progress)), updatedAt: account.updatedAt }));
    await rename(temporary, file);
  }

  private fileOf(code: string): string {
    return path.join(this.dir, `${createHash('sha256').update(code).digest('hex')}.json`);
  }

  private queued<T>(code: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(code) ?? Promise.resolve();
    const next = previous.then(work, work);
    const settled = next.catch(() => {});
    this.queues.set(code, settled);
    void settled.then(() => {
      if (this.queues.get(code) === settled) this.queues.delete(code);
    });
    return next;
  }
}

/** Counts per address over a window of time. */
class Limiter {
  private counts = new Map<string, { since: number; count: number }>();

  constructor(private max: number, private windowMs: number) {}

  /** Whether the address is over the limit. */
  blocked(address: string, now = Date.now()): boolean {
    const entry = this.counts.get(address);
    return entry !== undefined && now - entry.since < this.windowMs && entry.count >= this.max;
  }

  add(address: string, now = Date.now()): void {
    const entry = this.counts.get(address);
    if (!entry || now - entry.since >= this.windowMs) this.counts.set(address, { since: now, count: 1 });
    else entry.count++;
    // Forget old addresses now and then, so the table does not grow forever.
    if (this.counts.size > 10_000) {
      for (const [key, value] of this.counts) if (now - value.since >= this.windowMs) this.counts.delete(key);
    }
  }
}

/**
 * Answers `/api/...` requests. Returns false for anything that is not an
 * account request, so the caller can serve it otherwise.
 */
export function createAccountsApi(store: AccountStore | null, allowedOrigins: readonly string[]) {
  const misses = new Limiter(MAX_MISSES, MISS_WINDOW_MS);
  const requests = new Limiter(MAX_REQUESTS_PER_MINUTE, 60_000);

  return async function handle(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
    if (!pathname.startsWith('/api/')) return false;

    const origin = request.headers.origin;
    const headers: Record<string, string> = { vary: 'Origin', 'cache-control': 'no-store' };
    if (origin !== undefined && allowedOrigins.includes(origin)) headers['access-control-allow-origin'] = origin;
    const reply = (status: number, body?: unknown): true => {
      response.writeHead(status, body === undefined ? headers : { ...headers, 'content-type': 'application/json; charset=utf-8' });
      response.end(body === undefined ? undefined : JSON.stringify(body));
      return true;
    };

    if (!store) return reply(404, { error: 'Este servidor no guarda avances' });
    if (request.method === 'OPTIONS') {
      headers['access-control-allow-methods'] = 'GET, POST, PUT';
      headers['access-control-allow-headers'] = 'authorization, content-type';
      headers['access-control-max-age'] = '600';
      return reply(204);
    }

    const address = clientAddress(request);
    if (requests.blocked(address) || misses.blocked(address)) {
      return reply(429, { error: 'Demasiados intentos. Prueba en unos minutos.' });
    }
    requests.add(address);

    if (pathname === '/api/accounts' && request.method === 'POST') {
      const body = await readJson(request);
      if (body === 'too-big') return reply(413, { error: 'Demasiado grande' });
      const progress = progressIn(body);
      if (!progress) return reply(400, { error: 'Avance no válido' });
      const code = await store.create(progress);
      const account = await store.load(code);
      return reply(201, { code, progress: account?.progress ?? emptyProgress() });
    }

    if (pathname === '/api/progress' && (request.method === 'GET' || request.method === 'PUT')) {
      const code = normalizeCode(/^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1]);
      if (!code) return reply(401, { error: 'Falta el código de jugador' });

      if (request.method === 'GET') {
        const account = await store.load(code);
        if (!account) {
          misses.add(address);
          return reply(404, { error: 'No hay ningún avance con ese código' });
        }
        return reply(200, account);
      }

      const body = await readJson(request);
      if (body === 'too-big') return reply(413, { error: 'Demasiado grande' });
      const progress = progressIn(body);
      if (!progress) return reply(400, { error: 'Avance no válido' });
      const account = await store.merge(code, progress);
      if (!account) {
        misses.add(address);
        return reply(404, { error: 'No hay ningún avance con ese código' });
      }
      return reply(200, account);
    }

    return reply(404, { error: 'No existe' });
  };
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
