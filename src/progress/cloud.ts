import { normalizeCode } from './playerCode';
import { parseProgress, type Progress } from './progress';

// The game's side of player codes: keeps the code this device uses and trades
// progress with the server. It knows nothing about the page, so it can be
// tested against a real server.

/** Where this device remembers its code. */
export interface CodeStore {
  get(): string | null;
  set(code: string | null): void;
}

export type CloudErrorKind = 'invalid-code' | 'unknown-code' | 'offline' | 'busy' | 'refused';

export class CloudError extends Error {
  constructor(readonly kind: CloudErrorKind) {
    super(kind);
  }
}

const TIMEOUT_MS = 8000;

export class ProgressCloud {
  constructor(
    private base: string,
    private codes: CodeStore,
  ) {}

  /** The code this device uses, or null if it has none. */
  code(): string | null {
    return normalizeCode(this.codes.get());
  }

  /** Makes a new code that keeps this device's progress, and remembers it. */
  async create(progress: Progress): Promise<{ code: string; progress: Progress }> {
    const body = await this.request('POST', '/api/accounts', null, progress);
    const code = normalizeCode(body.code);
    if (!code) throw new CloudError('refused');
    this.codes.set(code);
    return { code, progress: parseProgress(JSON.stringify(body.progress)) };
  }

  /**
   * Starts using a code typed by the player. What this device had is joined
   * into it, and the joined progress comes back.
   */
  async link(rawCode: string, progress: Progress): Promise<Progress> {
    const code = normalizeCode(rawCode);
    if (!code) throw new CloudError('invalid-code');
    const joined = await this.put(code, progress);
    this.codes.set(code);
    return joined;
  }

  /** Sends this device's progress and gets the joined one back. Null without a code. */
  async sync(progress: Progress): Promise<Progress | null> {
    const code = this.code();
    return code ? this.put(code, progress) : null;
  }

  /** Stops using the code on this device. The progress stays on the server. */
  forget(): void {
    this.codes.set(null);
  }

  private async put(code: string, progress: Progress): Promise<Progress> {
    const body = await this.request('PUT', '/api/progress', code, progress);
    return parseProgress(JSON.stringify(body.progress));
  }

  private async request(
    method: string,
    route: string,
    code: string | null,
    progress: Progress,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(`${this.base}${route}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(code ? { authorization: `Bearer ${code}` } : {}),
        },
        body: JSON.stringify({ progress }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new CloudError('offline');
    }
    if (response.status === 404) throw new CloudError('unknown-code');
    if (response.status === 429) throw new CloudError('busy');
    if (!response.ok) throw new CloudError('refused');
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      throw new CloudError('refused');
    }
  }
}
