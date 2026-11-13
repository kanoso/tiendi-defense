import { CloudError, type ProgressCloud } from '../progress/cloud';
import { adoptProgress, syncState, watchSyncState } from '../progress/cloudSync';
import { loadProgress } from '../progress/storage';

// The panel where a player gets a code to keep their progress, or types one
// they already have. Plain page elements, like the co-op lobby, because it
// needs a real text field.

export interface AccountPanelOptions {
  cloud: ProgressCloud;
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
  #account .row { margin-top: 6px; }
  #account button { padding: 8px; }
}
`;

const ERRORS: Record<string, string> = {
  'invalid-code': 'El código tiene 8 letras y números, como KXT4-9QPM.',
  'unknown-code': 'No hay ningún avance con ese código. Revisa que esté bien escrito.',
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

  function render(): void {
    card.replaceChildren();
    const code = options.cloud.code();
    if (code) showCode(code);
    else showChoices();
    const error = element('div', errorText, 'error');
    error.id = 'account-error';
    card.append(error);
  }

  function showChoices(): void {
    card.append(element('h2', 'Guardar avance'));
    card.append(
      element(
        'p',
        'Te damos un código para guardar tus estrellas, rangos y récords, y seguir en otro dispositivo. No pedimos nombre ni email.',
      ),
    );
    const create = element('div', '', 'row');
    create.append(
      button(
        'account-create',
        'Crear mi código',
        () =>
          void attempt(async () => {
            const { progress } = await options.cloud.create(loadProgress());
            adoptProgress(progress);
          }),
        true,
      ),
    );
    card.append(create);

    card.append(element('label', '¿Ya tienes un código?'));
    const input = element('input');
    input.id = 'account-code-input';
    input.maxLength = 9;
    input.autocomplete = 'off';
    input.autocapitalize = 'characters';
    input.placeholder = 'XXXX-XXXX';
    card.append(input);
    const link = element('div', '', 'row');
    link.append(
      button('account-link', 'Usar este código', () =>
        void attempt(async () => {
          const joined = await options.cloud.link(input.value, loadProgress());
          adoptProgress(joined);
          options.onProgressChanged();
        }),
      ),
      button('account-close', 'Cerrar', close),
    );
    card.append(link);
  }

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
    const status = element('div', describeSync(), 'status');
    status.id = 'account-status';
    card.append(status);

    const actions = element('div', '', 'row');
    const copy = button('account-copy', 'Copiar', () => {
      void navigator.clipboard?.writeText(code).then(
        () => (copy.textContent = 'Copiado'),
        () => (copy.textContent = 'No se pudo copiar'),
      );
    }, true);
    actions.append(copy, button('account-close', 'Cerrar', close));
    card.append(actions);
    const forget = element('div', '', 'row');
    forget.append(
      button('account-forget', 'Dejar de usarlo en este dispositivo', () => {
        if (!window.confirm('Este dispositivo dejará de guardar en ese código. Tu avance sigue guardado en él. ¿Continuar?')) return;
        options.cloud.forget();
        render();
      }),
    );
    card.append(forget);
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
    const status = document.getElementById('account-status');
    if (status) status.textContent = describeSync();
  });
  render();
}
