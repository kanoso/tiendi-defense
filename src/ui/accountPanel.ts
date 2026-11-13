import { CloudError, type ProgressCloud } from '../progress/cloud';
import {
  accountName,
  adoptProgress,
  rememberAccountName,
  syncState,
  watchSyncState,
} from '../progress/cloudSync';
import { loadProgress } from '../progress/storage';
import { forgetGoogleChoice, renderGoogleButton } from './googleButton';

// The panel where a player keeps their progress on the server: with a Google
// account, or with a player code for those who prefer not to. Plain page
// elements, like the co-op lobby, because it needs real text fields.

export interface AccountPanelOptions {
  cloud: ProgressCloud;
  /** Google's client id for this game, or null when signing in with Google is not offered. */
  googleClientId: string | null;
  /** The progress on this device changed: what is on screen must be redrawn. */
  onProgressChanged: () => void;
  onClose: () => void;
}

const STYLE = `
#account { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center;
  justify-content: center; padding: 16px; background: rgba(27, 31, 23, 0.82);
  font: 16px/1.4 system-ui, sans-serif; color: #f4f1e8; user-select: text;
  -webkit-user-select: text; touch-action: manipulation; }
#account .card { width: min(100%, 420px); max-height: 100%; overflow: auto; padding: 20px;
  background: #22281d; border: 2px solid #ffe066; border-radius: 6px; }
#account h2 { margin: 0 0 10px; font-size: 22px; }
#account p { margin: 8px 0; }
#account label { display: block; margin: 14px 0 4px; font-size: 14px; color: #dfe8d5; }
#account input { box-sizing: border-box; width: 100%; padding: 10px; font: inherit; color: #1b1f17;
  background: #f4f1e8; border: 0; border-radius: 4px; text-transform: uppercase;
  letter-spacing: 0.2em; text-align: center; }
#account .row { display: flex; gap: 8px; margin-top: 12px; }
#account button { flex: 1; padding: 11px 8px; font: 600 15px system-ui, sans-serif; color: #f4f1e8;
  background: #39432f; border: 0; border-radius: 4px; cursor: pointer; }
#account button.primary { color: #1b1f17; background: #ffe066; }
#account button:disabled { opacity: 0.5; cursor: default; }
#account .big-code { margin: 6px 0; font-size: 36px; font-weight: 700; letter-spacing: 0.12em;
  text-align: center; color: #ffe066; user-select: all; -webkit-user-select: all; }
#account .who { margin: 8px 0; font-size: 18px; font-weight: 600; text-align: center; }
#account .google { display: flex; justify-content: center; min-height: 44px; margin-top: 12px; }
#account .or { margin: 16px 0 0; font-size: 13px; color: #a9b3a0; text-align: center; }
#account .hint { font-size: 13px; color: #a9b3a0; }
#account .status { font-size: 13px; color: #7dff9b; text-align: center; min-height: 1.4em; }
#account .error { min-height: 1.4em; margin-top: 10px; color: #ff9d8a; }
@media (max-height: 480px) {
  #account { padding: 6px; }
  #account .card { width: min(100%, 600px); padding: 10px 14px; }
  #account h2 { margin: 0; font-size: 17px; }
  #account p { margin: 3px 0; font-size: 14px; }
  #account .big-code { margin: 2px 0; font-size: 26px; }
  #account label { margin: 6px 0 2px; }
  #account input { padding: 7px; }
  #account .row, #account .google { margin-top: 6px; }
  #account .or { margin-top: 6px; }
  #account button { padding: 8px; }
}
`;

const ERRORS: Record<string, string> = {
  'invalid-code': 'El código tiene 8 letras y números, como KXT4-9QPM.',
  'unknown-code': 'No hay ningún avance con ese código. Revisa que esté bien escrito.',
  'google-refused': 'Google no confirmó la cuenta. Prueba de nuevo.',
  offline: 'No se pudo conectar con el servidor. Prueba de nuevo en un momento.',
  busy: 'Demasiados intentos. Espera unos minutos y vuelve a probar.',
  refused: 'El servidor no aceptó el pedido. Prueba de nuevo.',
};

export function openAccountPanel(options: AccountPanelOptions): void {
  if (document.getElementById('account')) return;
  if (!document.getElementById('account-style')) {
    const style = document.createElement('style');
    style.id = 'account-style';
    style.textContent = STYLE;
    document.head.append(style);
  }
  const root = document.createElement('div');
  root.id = 'account';
  const card = document.createElement('div');
  card.className = 'card';
  root.append(card);
  document.body.append(root);

  const { cloud } = options;
  let busy = false;
  let errorText = '';

  const close = (): void => {
    watchSyncState(() => {});
    root.remove();
    options.onClose();
  };

  function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function button(id: string, text: string, onClick: () => void, primary = false): HTMLButtonElement {
    const node = element('button', text, primary ? 'primary' : '');
    node.id = id;
    node.type = 'button';
    node.disabled = busy;
    node.addEventListener('click', onClick);
    return node;
  }

  function row(...buttons: HTMLButtonElement[]): HTMLDivElement {
    const node = element('div', '', 'row');
    node.append(...buttons);
    return node;
  }

  /** Runs a request to the server, showing the outcome. */
  async function attempt(work: () => Promise<void>): Promise<void> {
    busy = true;
    errorText = '';
    render();
    try {
      await work();
    } catch (error) {
      errorText = ERRORS[error instanceof CloudError ? error.kind : 'refused'];
    }
    busy = false;
    render();
  }

  /** Google's button, which signs in and joins what this device has into the account. */
  function googleButton(): HTMLElement | null {
    if (!options.googleClientId) return null;
    const holder = element('div', '', 'google');
    holder.id = 'account-google';
    renderGoogleButton(
      holder,
      options.googleClientId,
      (credential) =>
        void attempt(async () => {
          const { name, progress } = await cloud.signInWithGoogle(credential, loadProgress());
          rememberAccountName(name);
          adoptProgress(progress);
          options.onProgressChanged();
        }),
      () => {
        holder.textContent = 'No se pudo cargar el acceso con Google.';
        holder.className = 'hint';
      },
    );
    return holder;
  }

  function render(): void {
    card.replaceChildren();
    if (cloud.signedInWithGoogle()) showGoogleAccount();
    else if (cloud.code()) showCode(cloud.code()!);
    else showChoices();
    const error = element('div', errorText, 'error');
    error.id = 'account-error';
    card.append(error);
  }

  // --- nothing yet: Google, a new code, or a code already made ----------------

  function showChoices(): void {
    card.append(element('h2', 'Guardar avance'));
    const google = googleButton();
    card.append(
      element(
        'p',
        google
          ? 'Guarda tus estrellas, rangos y récords para seguir en cualquier dispositivo.'
          : 'Te damos un código para guardar tus estrellas, rangos y récords, y seguir en otro dispositivo. No pedimos nombre ni email.',
      ),
    );
    if (google) {
      card.append(google);
      card.append(element('div', 'O sin cuenta, con un código de jugador:', 'or'));
    }
    card.append(
      row(
        button(
          'account-create',
          'Crear mi código',
          () =>
            void attempt(async () => {
              const { progress } = await cloud.create(loadProgress());
              adoptProgress(progress);
            }),
          !google,
        ),
      ),
    );

    card.append(element('label', '¿Ya tienes un código?'));
    const input = element('input');
    input.id = 'account-code-input';
    input.maxLength = 9;
    input.autocomplete = 'off';
    input.autocapitalize = 'characters';
    input.placeholder = 'XXXX-XXXX';
    card.append(input);
    card.append(
      row(
        button('account-link', 'Usar este código', () =>
          void attempt(async () => {
            const joined = await cloud.link(input.value, loadProgress());
            adoptProgress(joined);
            options.onProgressChanged();
          }),
        ),
        button('account-close', 'Cerrar', close),
      ),
    );
  }

  // --- a player code ------------------------------------------------------------

  function showCode(code: string): void {
    card.append(element('h2', 'Tu código'));
    const big = element('div', code, 'big-code');
    big.id = 'account-code';
    card.append(big);
    card.append(
      element(
        'p',
        'Anótalo en un lugar seguro: con él recuperas tu avance en cualquier dispositivo. Quien lo tenga puede usar tu avance.',
        'hint',
      ),
    );
    card.append(status());

    const copy = button(
      'account-copy',
      'Copiar',
      () => {
        void navigator.clipboard?.writeText(code).then(
          () => (copy.textContent = 'Copiado'),
          () => (copy.textContent = 'No se pudo copiar'),
        );
      },
      true,
    );
    card.append(row(copy, button('account-close', 'Cerrar', close)));

    const google = googleButton();
    if (google) {
      card.append(element('div', 'Pásalo a tu cuenta de Google y no dependas del código:', 'or'));
      card.append(google);
    }
    card.append(
      row(
        button('account-forget', 'Dejar de usarlo en este dispositivo', () => {
          if (!window.confirm('Este dispositivo dejará de guardar en ese código. Tu avance sigue guardado en él. ¿Continuar?')) return;
          cloud.forget();
          render();
        }),
      ),
    );
  }

  // --- signed in with Google --------------------------------------------------------

  function showGoogleAccount(): void {
    card.append(element('h2', 'Tu cuenta'));
    const who = element('div', `Conectado con Google${accountName() ? ` como ${accountName()}` : ''}`, 'who');
    who.id = 'account-who';
    card.append(who);
    card.append(element('p', 'Tu avance se guarda solo. En otro dispositivo, entra con la misma cuenta.', 'hint'));
    card.append(status());
    card.append(
      row(
        button('account-close', 'Cerrar', close, true),
        button('account-sign-out', 'Cerrar sesión', () => {
          if (!window.confirm('Este dispositivo dejará de guardar en tu cuenta. Tu avance sigue en ella. ¿Cerrar sesión?')) return;
          forgetGoogleChoice();
          rememberAccountName(null);
          void cloud.signOut().then(render);
        }),
      ),
    );
  }

  function status(): HTMLElement {
    const node = element('div', describeSync(), 'status');
    node.id = 'account-status';
    return node;
  }

  function describeSync(): string {
    switch (syncState) {
      case 'saving':
        return 'Guardando…';
      case 'offline':
        return 'Sin conexión: se guardará cuando vuelva.';
      default:
        return 'Avance guardado';
    }
  }

  watchSyncState(() => {
    const node = document.getElementById('account-status');
    if (node) node.textContent = describeSync();
  });
  render();
}
