import type { DifficultyId } from '../data/difficulty';
import { findDifficulty } from '../data/difficulty';
import { findMap } from '../data/maps';
import { CoopLink } from '../net/CoopLink';
import { MAX_PLAYERS } from '../net/protocol';

// The co-op lobby: where players create a room or join one and wait for each
// other. It is plain page elements on top of the game, not drawn by the game
// engine, because it needs real text fields (and a phone's keyboard).

const NAME_KEY = 'tower-defense-heroes.player-name';

export interface LobbyOptions {
  /** Address of the co-op server, as http(s). */
  server: string;
  /** What a room created here will play: the map and difficulty picked in the menu. */
  mapId: string;
  difficulty: DifficultyId;
  /** The game started: the lobby is gone and the link is live. */
  onStart: (link: CoopLink) => void;
  onClose: () => void;
}

const STYLE = `
#lobby { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center;
  justify-content: center; padding: 16px; background: rgba(27, 31, 23, 0.82);
  font: 16px/1.4 system-ui, sans-serif; color: #f4f1e8; user-select: text;
  -webkit-user-select: text; touch-action: manipulation; }
#lobby .card { width: min(100%, 420px); max-height: 100%; overflow: auto; padding: 20px;
  background: #22281d; border: 2px solid #ffe066; border-radius: 6px; }
#lobby h2 { margin: 0 0 12px; font-size: 22px; }
#lobby p { margin: 8px 0; }
#lobby label { display: block; margin: 12px 0 4px; font-size: 14px; color: #dfe8d5; }
#lobby input { box-sizing: border-box; width: 100%; padding: 10px; font: inherit;
  color: #1b1f17; background: #f4f1e8; border: 0; border-radius: 4px; }
#lobby input.code { text-transform: uppercase; letter-spacing: 0.3em; text-align: center; }
#lobby .row { display: flex; gap: 8px; margin-top: 14px; }
#lobby button { flex: 1; padding: 11px 8px; font: 600 15px system-ui, sans-serif; color: #f4f1e8;
  background: #39432f; border: 0; border-radius: 4px; cursor: pointer; }
#lobby button.primary { color: #1b1f17; background: #ffe066; }
#lobby button:disabled { opacity: 0.5; cursor: default; }
#lobby .big-code { margin: 6px 0 2px; font-size: 44px; font-weight: 700; letter-spacing: 0.25em;
  text-align: center; color: #ffe066; }
#lobby .hint { font-size: 13px; color: #a9b3a0; text-align: center; }
#lobby ul { margin: 12px 0 0; padding: 0; list-style: none; }
#lobby li { display: flex; justify-content: space-between; padding: 7px 10px; margin-top: 4px;
  background: #2f3828; border-radius: 4px; }
#lobby li.me { outline: 1px solid #ffe066; }
#lobby .ready { color: #7dff9b; }
#lobby .error { min-height: 1.4em; margin-top: 10px; color: #ff9d8a; }
`;

/** Opens the lobby over the game. It closes itself when the game starts or the player leaves. */
export function openLobby(options: LobbyOptions): void {
  if (document.getElementById('lobby')) return;
  if (!document.getElementById('lobby-style')) {
    const style = document.createElement('style');
    style.id = 'lobby-style';
    style.textContent = STYLE;
    document.head.append(style);
  }

  const root = document.createElement('div');
  root.id = 'lobby';
  const card = document.createElement('div');
  card.className = 'card';
  root.append(card);
  document.body.append(root);

  let link: CoopLink | null = null;
  let busy = false;
  let errorText = '';

  const close = (): void => {
    root.remove();
  };
  const leave = (): void => {
    link?.leave();
    link = null;
    close();
    options.onClose();
  };

  /** Builds an element with text, never with markup: names come from other players. */
  function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text = '',
    className = '',
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function button(text: string, onClick: () => void, primary = false): HTMLButtonElement {
    const node = element('button', text, primary ? 'primary' : '');
    node.type = 'button';
    node.disabled = busy;
    node.addEventListener('click', onClick);
    return node;
  }

  // --- first view: create or join ---------------------------------------------

  function showEntrance(): void {
    card.replaceChildren();
    card.append(element('h2', 'Cooperativo'));
    card.append(
      element('p', 'Hasta 4 jugadores defienden juntos. Cada uno controla una parte de los héroes.'),
    );

    card.append(element('label', 'Tu nombre'));
    const name = element('input');
    name.id = 'lobby-name';
    name.maxLength = 16;
    name.autocomplete = 'off';
    name.value = readName();
    card.append(name);

    const map = findMap(options.mapId).name;
    const difficulty = findDifficulty(options.difficulty).name;
    const create = element('div', '', 'row');
    const createButton = button(`Crear sala · ${map} · ${difficulty}`, () => {
      void enter(name.value, null);
    }, true);
    createButton.id = 'lobby-create';
    create.append(createButton);
    card.append(create);

    card.append(element('label', 'O entra con el código de una sala'));
    const code = element('input', '', 'code');
    code.id = 'lobby-code';
    code.maxLength = 4;
    code.autocomplete = 'off';
    code.autocapitalize = 'characters';
    card.append(code);

    const join = element('div', '', 'row');
    const joinButton = button('Unirse', () => {
      void enter(name.value, code.value);
    });
    joinButton.id = 'lobby-join';
    join.append(joinButton, button('Volver', leave));
    card.append(join);

    const error = element('div', errorText, 'error');
    error.id = 'lobby-error';
    card.append(error);
  }

  /** Connects and creates a room (`code` null) or joins the one with that code. */
  async function enter(rawName: string, code: string | null): Promise<void> {
    const name = rawName.trim();
    if (code !== null && code.trim().length !== 4) {
      errorText = 'El código tiene 4 letras.';
      return showEntrance();
    }
    saveName(name);
    busy = true;
    errorText = '';
    showEntrance();

    const attempt = new CoopLink(options.server);
    try {
      await attempt.connect();
    } catch {
      busy = false;
      errorText = 'No se pudo conectar con el servidor.';
      return showEntrance();
    }
    link = attempt;
    attempt.onChange = render;
    attempt.send(
      code === null
        ? { t: 'create', name, mapId: options.mapId, difficulty: options.difficulty }
        : { t: 'join', code: code.trim(), name },
    );
  }

  // --- second view: the room ----------------------------------------------------

  function render(): void {
    if (!link) return;
    const session = link.session;

    if (session.start) {
      // Everyone was ready: hand the live link to the game and get out of the way.
      const started = link;
      link = null;
      close();
      return options.onStart(started);
    }
    if (!session.room) {
      // Still at the door: the server refused, or the connection was lost.
      if (session.lastError || link.status === 'closed') {
        errorText = session.lastError ?? 'Se perdió la conexión con el servidor.';
        // Forget the link before closing it: closing reports a change, which
        // would bring this function back here.
        const refused = link;
        link = null;
        refused.leave();
        busy = false;
        showEntrance();
      }
      return;
    }
    if (link.status === 'closed') {
      errorText = 'Se perdió la conexión con el servidor.';
      link = null;
      busy = false;
      return showEntrance();
    }

    busy = false;
    const room = session.room;
    card.replaceChildren();
    card.append(element('h2', 'Sala de espera'));
    const code = element('div', room.code, 'big-code');
    code.id = 'lobby-room-code';
    card.append(code);
    card.append(element('div', 'Comparte este código con quien quieras invitar', 'hint'));
    card.append(
      element(
        'p',
        `${findMap(room.mapId).name} · ${findDifficulty(room.difficulty).name} · ` +
          `${room.players.length} de ${MAX_PLAYERS} jugadores`,
      ),
    );

    const list = element('ul');
    list.id = 'lobby-players';
    for (const player of room.players) {
      const item = element('li', '', player.id === session.playerId ? 'me' : '');
      item.append(
        element('span', player.name),
        element('span', player.ready ? 'Listo' : 'Esperando', player.ready ? 'ready' : ''),
      );
      list.append(item);
    }
    card.append(list);

    const actions = element('div', '', 'row');
    const ready = session.isReady();
    const readyButton = button(ready ? 'Ya no estoy listo' : 'Estoy listo', () => {
      session.setReady(!ready);
    }, !ready);
    readyButton.id = 'lobby-ready';
    actions.append(readyButton, button('Salir', leave));
    card.append(actions);
    card.append(element('div', 'La partida empieza cuando todos están listos.', 'hint'));
  }

  showEntrance();
}

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Storage may be unavailable; the name is then asked again next time.
  }
}
