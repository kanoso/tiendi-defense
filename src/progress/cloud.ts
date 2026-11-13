import { normalizeCode } from './playerCode';
import { parseProgress, type Progress } from './progress';
import { parseSavedGame, type SavedGame } from './savedGame';

// The game's side of player codes: keeps the code this device uses and trades
// progress with the server. It knows nothing about the page, so it can be
// tested against a real server.

/** A signed-in device's session, as the server hands it out. */
const SESSION_PATTERN = /^s_[A-Za-z0-9_-]{32}$/;

/** Where this device remembers what it uses: a player code or a Google session. */
export interface CodeStore {
  get(): string | null;
  set(code: string | null): void;
}

export type CloudErrorKind =
  | 'invalid-code'
  | 'unknown-code'
  | 'google-refused'
  | 'offline'
  | 'busy'
  | 'refused';

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

  /** Whether this device keeps its progress on the server, by code or with Google. */
  linked(): boolean {
    return this.code() !== null || this.signedInWithGoogle();
  }

  /** How this device keeps its progress: 'google', its code, or null. Safe to show. */
  linkLabel(): string | null {
    return this.signedInWithGoogle() ? 'google' : this.code();
  }

  /** Whether this device is signed in with a Google account. */
  signedInWithGoogle(): boolean {
    return SESSION_PATTERN.test(this.codes.get() ?? '');
  }

  /**
   * Signs in with the token Google's button gave. What this device has, and
   * the player code it was using, are joined into the Google account.
   */
  async signInWithGoogle(googleCredential: string, progress: Progress): Promise<{ name: string | null; progress: Progress }> {
    const body = await this.request('POST', '/api/google', null, {
      credential: googleCredential,
      progress,
      code: this.code(),
    });
    const session = typeof body.session === 'string' && SESSION_PATTERN.test(body.session) ? body.session : null;
    if (!session) throw new CloudError('refused');
    this.codes.set(session);
    return {
      name: typeof body.name === 'string' ? body.name : null,
      progress: parseProgress(JSON.stringify(body.progress)),
    };
  }

  /** Signs this device out of Google. The progress stays with the account. */
  async signOut(): Promise<void> {
    const session = this.signedInWithGoogle() ? this.codes.get() : null;
    this.forget();
    if (!session) return;
    try {
      await fetch(`${this.base}/api/session`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${session}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // Offline: the session simply stays unused on the server.
    }
  }

  /** Makes a new code that keeps this device's progress, and remembers it. */
  async create(progress: Progress): Promise<{ code: string; progress: Progress }> {
    const body = await this.request('POST', '/api/accounts', null, { progress });
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
    const credential = this.credential();
    return credential ? this.put(credential, progress) : null;
  }

  // --- a game left between waves -------------------------------------------------

  /** The game the account left between waves, or null (also without an account). */
  async loadSavedGame(): Promise<SavedGame | null> {
    const credential = this.credential();
    if (!credential) return null;
    const body = await this.request('GET', '/api/saved-game', credential, null);
    return parseSavedGame(body.savedGame);
  }

  /** Keeps a game with the account. Gives back the one the account keeps: it may have a newer one. */
  async putSavedGame(game: SavedGame): Promise<SavedGame | null> {
    const credential = this.credential();
    if (!credential) return null;
    const body = await this.request('PUT', '/api/saved-game', credential, { savedGame: game });
    return parseSavedGame(body.savedGame);
  }

  /** The game ended: the account no longer keeps it. */
  async clearSavedGame(gameId: string): Promise<void> {
    const credential = this.credential();
    if (!credential) return;
    await this.request('DELETE', `/api/saved-game?gameId=${encodeURIComponent(gameId)}`, credential, null);
  }

  /** What this device signs its requests with: its code or its Google session. */
  private credential(): string | null {
    return this.code() ?? (this.signedInWithGoogle() ? this.codes.get() : null);
  }

  /** Stops using the code on this device. The progress stays on the server. */
  forget(): void {
    this.codes.set(null);
  }

  private async put(credential: string, progress: Progress): Promise<Progress> {
    const body = await this.request('PUT', '/api/progress', credential, { progress });
    return parseProgress(JSON.stringify(body.progress));
  }

  private async request(
    method: string,
    route: string,
    credential: string | null,
    payload: Record<string, unknown> | null,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(`${this.base}${route}`, {
        method,
        headers: {
          ...(payload ? { 'content-type': 'application/json' } : {}),
          ...(credential ? { authorization: `Bearer ${credential}` } : {}),
        },
        body: payload ? JSON.stringify(payload) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new CloudError('offline');
    }
    if (response.status === 404) throw new CloudError('unknown-code');
    if (response.status === 401 && route === '/api/google') throw new CloudError('google-refused');
    if (response.status === 429) throw new CloudError('busy');
    if (!response.ok) throw new CloudError('refused');
    if (response.status === 204) return {};
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      throw new CloudError('refused');
    }
  }
}
