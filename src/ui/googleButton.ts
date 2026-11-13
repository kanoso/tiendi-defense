// Google's own sign-in button (Google Identity Services). Its script is loaded
// only when a panel shows the button, so players who never open it never talk
// to Google. The button hands back a signed token; the server checks it.

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';

interface GoogleIdentityApi {
  initialize(options: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    ux_mode?: 'popup' | 'redirect';
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdentityApi } };
  }
}

let loading: Promise<GoogleIdentityApi> | null = null;

function loadGoogle(): Promise<GoogleIdentityApi> {
  loading ??= new Promise((resolve, reject) => {
    const ready = window.google?.accounts?.id;
    if (ready) return resolve(ready);
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const api = window.google?.accounts?.id;
      if (api) resolve(api);
      else reject(new Error('Google sign-in did not start'));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error('Google sign-in could not be loaded'));
    };
    document.head.append(script);
  });
  return loading;
}

/**
 * Puts Google's button inside `parent`. `onCredential` gets the token when the
 * player signs in; `onUnavailable` is called if Google cannot be reached.
 */
export function renderGoogleButton(
  parent: HTMLElement,
  clientId: string,
  onCredential: (credential: string) => void,
  onUnavailable: () => void,
): void {
  loadGoogle().then(
    (api) => {
      api.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response.credential) onCredential(response.credential);
        },
        auto_select: false,
        cancel_on_tap_outside: true,
        ux_mode: 'popup',
      });
      api.renderButton(parent, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        locale: 'es',
        width: Math.min(380, Math.max(200, parent.clientWidth)),
      });
    },
    () => onUnavailable(),
  );
}

/** After signing out, Google should not sign the player back in by itself. */
export function forgetGoogleChoice(): void {
  window.google?.accounts?.id?.disableAutoSelect();
}
